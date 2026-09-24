/**
 * Small dependency-free collaboration server. It uses Node 24's built-in
 * node:sqlite when available and falls back to an in-memory store for older
 * Node versions. WebSocket framing is implemented directly so the prototype
 * can run without downloading runtime dependencies.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { createRequire } from "node:module";
import type {
  AwarenessState,
  CanvasObject,
  CollaborationServer,
  DocumentUpdate,
  Edge,
  RoomDocument,
  ServerOptions,
} from "../shared/protocol";

const nodeRequire = createRequire(__filename);

type DatabaseSyncCtor = new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
};

let DatabaseSync: DatabaseSyncCtor | null = null;
try {
  ({ DatabaseSync } = nodeRequire("node:sqlite") as { DatabaseSync: DatabaseSyncCtor });
} catch {
  DatabaseSync = null;
}

const DEFAULT_DATA_DIR = path.join(__dirname, "data");
const COLORS = ["#8b5cf6", "#0ea5e9", "#f97316", "#10b981", "#ec4899", "#eab308"];

type RoomRecord = {
  id: string;
  name: string;
  passwordHash: string | null;
  createdAt: number;
  document: RoomDocument;
};

type SessionRecord = {
  token: string | null;
  roomId: string;
  nickname: string;
  color: string;
  createdAt: number;
  expiresAt: number;
};

type AssetRecord = {
  id: string;
  roomId: string;
  mime: string;
  filename: string;
  data: Buffer;
  createdAt: number;
};

type Store = {
  kind: "sqlite" | "memory";
  createRoom(room: RoomRecord): void;
  getRoom(roomId: string): RoomRecord | undefined;
  saveDocument(roomId: string, document: RoomDocument): void;
  createSession(session: SessionRecord & { token: string }): void;
  getSession(token: string): SessionRecord | undefined;
  saveAsset(asset: AssetRecord): void;
  getAsset(roomId: string, assetId: string): AssetRecord | undefined;
  close(): void;
};

type Client = {
  socket: Duplex;
  roomId: string;
  sessionId: string;
  nickname: string;
  color: string;
  cursor: AwarenessState["cursor"];
  selection: AwarenessState["selection"];
  updatedAt: number;
  buffer: Buffer;
  closed?: boolean;
};

type WsFrame = { fin: boolean; opcode: number; payload: Buffer };

const now = (): number => Date.now();
const id = (prefix = ""): string => prefix + crypto.randomBytes(8).toString("hex");
const json = (v: unknown): string => JSON.stringify(v);
const parseJson = <T>(v: string, fallback: T): T => {
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

function hashPassword(password: string, salt: Buffer = crypto.randomBytes(16)): string | null {
  if (!password) return null;
  const digest = crypto.scryptSync(String(password), salt, 32);
  return `scrypt$${salt.toString("base64")}$${digest.toString("base64")}`;
}

function verifyPassword(password: string, encoded: string | null | undefined): boolean {
  if (!encoded) return !password;
  if (typeof password !== "string") return false;
  const [, saltB64, hashB64] = String(encoded).split("$");
  if (!saltB64 || !hashB64) return false;
  try {
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const emptyDocument = (): RoomDocument => ({ objects: {}, richText: {}, edges: [], clock: 0 });

function makeStore(dataDir: string): Store {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "spatial.sqlite");
  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT, created_at INTEGER NOT NULL, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, room_id TEXT NOT NULL, nickname TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, mime TEXT NOT NULL, filename TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL);`);
    return {
      kind: "sqlite",
      createRoom(room) {
        db.prepare("INSERT INTO rooms VALUES (?, ?, ?, ?, ?)").run(room.id, room.name, room.passwordHash, room.createdAt, json(room.document));
      },
      getRoom(roomId) {
        const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);
        if (!row) return undefined;
        return {
          id: String(row.id),
          name: String(row.name),
          passwordHash: (row.password_hash as string | null) ?? null,
          createdAt: Number(row.created_at),
          document: parseJson(String(row.document), emptyDocument()),
        };
      },
      saveDocument(roomId, document) {
        db.prepare("UPDATE rooms SET document = ? WHERE id = ?").run(json(document), roomId);
      },
      createSession(session) {
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)").run(session.token, session.roomId, session.nickname, session.color, session.createdAt, session.expiresAt);
      },
      getSession(token) {
        const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
        if (!row) return undefined;
        return {
          token: String(row.token),
          roomId: String(row.room_id),
          nickname: String(row.nickname),
          color: String(row.color),
          createdAt: Number(row.created_at),
          expiresAt: Number(row.expires_at),
        };
      },
      saveAsset(asset) {
        db.prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)").run(asset.id, asset.roomId, asset.mime, asset.filename, asset.data, asset.createdAt);
      },
      getAsset(roomId, assetId) {
        const row = db.prepare("SELECT * FROM assets WHERE room_id = ? AND id = ?").get(roomId, assetId);
        if (!row) return undefined;
        return {
          id: String(row.id),
          roomId: String(row.room_id),
          mime: String(row.mime),
          filename: String(row.filename),
          data: Buffer.from(row.data as Buffer),
          createdAt: Number(row.created_at),
        };
      },
      close() {
        db.close();
      },
    };
  }

  const rooms = new Map<string, RoomRecord>();
  const sessions = new Map<string, SessionRecord & { token: string }>();
  const assets = new Map<string, AssetRecord>();
  return {
    kind: "memory",
    createRoom(room) {
      rooms.set(room.id, room);
    },
    getRoom(roomId) {
      return rooms.get(roomId);
    },
    saveDocument(roomId, document) {
      const r = rooms.get(roomId);
      if (r) r.document = document;
    },
    createSession(session) {
      sessions.set(session.token, session);
    },
    getSession(token) {
      return sessions.get(token);
    },
    saveAsset(asset) {
      assets.set(asset.id, asset);
    },
    getAsset(roomId, assetId) {
      const a = assets.get(assetId);
      return a && a.roomId === roomId ? a : undefined;
    },
    close() {},
  };
}

function mergeDocument(document: RoomDocument, update: DocumentUpdate | Partial<RoomDocument> | null | undefined): RoomDocument {
  const next: RoomDocument = {
    objects: { ...(document.objects || {}) },
    richText: { ...(document.richText || {}) },
    edges: Array.isArray(document.edges) ? [...document.edges] : [],
    clock: Number(document.clock || 0) + 1,
  };
  const objects = update && "objects" in update ? update.objects : undefined;
  const mergeObject = (obj: CanvasObject) => {
    if (!obj?.id) return;
    const existing = next.objects[obj.id];
    // Geometry, grouping and duplicate delivery must never roll back edited content.
    next.objects[obj.id] = existing?.kind === "todo" && obj.kind === "todo"
      ? { ...obj, title: existing.title, items: existing.items, todoVersion: existing.todoVersion }
      : existing?.kind === "richText" && obj.kind === "richText"
      ? { ...obj, title: existing.title, content: existing.content, richTextVersion: existing.richTextVersion }
      : obj;
  };
  if (Array.isArray(objects)) objects.forEach(mergeObject);
  else if (objects && typeof objects === "object") Object.values(objects).forEach(mergeObject);
  const deleted = update && "deletedObjects" in update ? update.deletedObjects : undefined;
  if (deleted) {
    for (const objectId of deleted) delete next.objects[objectId];
    // Drop edges attached to removed objects
    next.edges = next.edges!.filter((e) => !deleted.includes(e.fromId) && !deleted.includes(e.toId));
  }
  const hasValidEndpoints = (edge: Edge) => {
    const valid = (objectId: string, port: Edge["fromPort"]) => {
      const object = next.objects[objectId];
      if (!object) return false;
      // Older clients use side ports or omit them. Only attached-pin references
      // require a matching point on the latest object snapshot.
      return !port?.startsWith("pin:") || !!object.pins?.some(pin => pin.id === port.slice(4));
    };
    return valid(edge.fromId, edge.fromPort) && valid(edge.toId, edge.toPort);
  };
  // Removing an attached pin also removes its lines, even when the object stays.
  next.edges = (next.edges || []).filter(hasValidEndpoints);
  const edgeList = update && "edges" in update ? (update as DocumentUpdate).edges : undefined;
  const deletedEdges = update && "deletedEdges" in update ? (update as DocumentUpdate).deletedEdges : undefined;
  const droppedEdgeIds = new Set(deletedEdges || []);
  if (Array.isArray(edgeList)) {
    const byId = new Map((next.edges || []).filter(e => !droppedEdgeIds.has(e.id)).map((e) => [e.id, e]));
    const createsCycle = (candidate: Edge) => {
      const children = new Map<string, string[]>();
      for (const edge of byId.values()) {
        if (edge.id === candidate.id || edge.relation !== "parent") continue;
        const list = children.get(edge.fromId) || [];
        list.push(edge.toId); children.set(edge.fromId, list);
      }
      const remaining = [candidate.toId], seen = new Set<string>();
      while (remaining.length) {
        const id = remaining.pop()!;
        if (id === candidate.fromId) return true;
        if (seen.has(id)) continue;
        seen.add(id); remaining.push(...(children.get(id) || []));
      }
      return false;
    };
    for (const edge of edgeList) {
      if (!edge?.id || !edge.fromId || !edge.toId || droppedEdgeIds.has(edge.id)) continue;
      // A delayed connection packet must not resurrect an edge to a deleted pin
      // or panel, including a deletion carried by this same document update.
      if (!hasValidEndpoints(edge)) continue;
      // Keep a concurrent connection, but never let opposing parent choices
      // create a cyclic hierarchy. Every client receives this canonical relation.
      byId.set(edge.id, edge.relation === "parent" && createsCycle(edge) ? { ...edge, relation: "related" } : edge);
    }
    next.edges = [...byId.values()];
  }
  if (deletedEdges?.length) {
    const drop = new Set(deletedEdges);
    next.edges = (next.edges || []).filter((e) => !drop.has(e.id));
  }
  if (update?.richText && typeof update.richText === "object") Object.assign(next.richText, update.richText);
  return next;
}

function parseBody(req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("payload too large"), { statusCode: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(json(payload));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

function safeName(name: unknown): string {
  return String(name || "untitled").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "untitled";
}

function encodeFrame(payload: Buffer | string, opcode = 1): Buffer {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header: Buffer;
  if (data.length < 126) header = Buffer.from([0x80 | opcode, data.length]);
  else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function parseFrames(buffer: Buffer): { frames: WsFrame[]; rest: Buffer } {
  const frames: WsFrame[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset];
    const b2 = buffer[offset + 1];
    const fin = !!(b1 & 0x80);
    const opcode = b1 & 0x0f;
    const masked = !!(b2 & 0x80);
    let len = b2 & 0x7f;
    let head = 2;
    if (len === 126) {
      if (offset + 4 > buffer.length) break;
      len = buffer.readUInt16BE(offset + 2);
      head = 4;
    } else if (len === 127) {
      if (offset + 10 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(offset + 2));
      head = 10;
    }
    const maskBytes = masked ? 4 : 0;
    if (offset + head + maskBytes + len > buffer.length) break;
    const mask = masked ? buffer.subarray(offset + head, offset + head + 4) : null;
    const start = offset + head + maskBytes;
    const payload = Buffer.from(buffer.subarray(start, start + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    frames.push({ fin, opcode, payload });
    offset = start + len;
  }
  return { frames, rest: buffer.subarray(offset) };
}

type ServerInstance = CollaborationServer & {
  store: Store;
  rooms: Map<string, RoomRecord>;
  clients: Map<string, Set<Client>>;
};

function createServer(options: ServerOptions = {}): ServerInstance {
  const port = Number(options.port ?? process.env.PORT ?? 8787);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const dataDir = options.dataDir || process.env.SPATIAL_DATA_DIR || DEFAULT_DATA_DIR;
  const store = makeStore(dataDir);
  const rooms = new Map<string, RoomRecord>();
  const clients = new Map<string, Set<Client>>();

  const server = http.createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type, authorization, x-session-token");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    const u = new URL(req.url || "/", `http://${req.headers.host || host}`);
    const pathname = u.pathname;
    try {
      if (req.method === "GET" && pathname === "/health") return sendJson(res, 200, { ok: true, transport: "websocket", persistence: store.kind, p2p: "hybrid" });
      if (req.method === "POST" && pathname === "/api/rooms") {
        const body = parseJson<Record<string, unknown>>((await parseBody(req, 1024 * 1024)).toString("utf8") || "{}", {});
        const roomId = crypto.randomUUID();
        const name = String(body.name || "Untitled Space").slice(0, 120);
        const passwordHash = body.password ? hashPassword(String(body.password)) : null;
        const room: RoomRecord = { id: roomId, name, passwordHash, createdAt: now(), document: emptyDocument() };
        store.createRoom(room);
        rooms.set(roomId, room);
        return sendJson(res, 201, { roomId, name, requiresPassword: !!passwordHash, shareUrl: `/space/${roomId}` });
      }
      const joinMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
      if (req.method === "POST" && joinMatch) {
        const room = rooms.get(joinMatch[1]) || store.getRoom(joinMatch[1]);
        if (!room) return sendJson(res, 404, { error: "ROOM_NOT_FOUND" });
        const body = parseJson<Record<string, unknown>>((await parseBody(req, 1024 * 1024)).toString("utf8") || "{}", {});
        if (!verifyPassword(String(body.password || ""), room.passwordHash)) return sendJson(res, 401, { error: "INVALID_PASSWORD" });
        const token = id("sess_");
        const session = {
          token,
          roomId: room.id,
          nickname: String(body.nickname || "Guest").slice(0, 40),
          color: String(body.color || COLORS[Math.floor(Math.random() * COLORS.length)]),
          createdAt: now(),
          expiresAt: now() + 7 * 24 * 3600 * 1000,
        };
        store.createSession(session);
        return sendJson(res, 200, {
          roomId: room.id,
          token,
          nickname: session.nickname,
          color: session.color,
          websocketUrl: `/ws?roomId=${encodeURIComponent(room.id)}&token=${encodeURIComponent(token)}`,
        });
      }
      const stateMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/state$/);
      if (req.method === "GET" && stateMatch) {
        const room = rooms.get(stateMatch[1]) || store.getRoom(stateMatch[1]);
        return room ? sendJson(res, 200, { roomId: room.id, name: room.name, state: room.document }) : sendJson(res, 404, { error: "ROOM_NOT_FOUND" });
      }
      const assetMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/assets(?:\/([^/]+))?$/);
      if (assetMatch && req.method === "POST" && !assetMatch[2]) {
        const room = rooms.get(assetMatch[1]) || store.getRoom(assetMatch[1]);
        if (!room) return sendJson(res, 404, { error: "ROOM_NOT_FOUND" });
        const token = String(req.headers["x-session-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
        const session = store.getSession(token);
        if (!session || session.roomId !== room.id || session.expiresAt < now()) return sendJson(res, 401, { error: "UNAUTHORIZED" });
        const data = await parseBody(req);
        if (!data.length) return sendJson(res, 400, { error: "EMPTY_ASSET" });
        const asset: AssetRecord = {
          id: id("asset_"),
          roomId: room.id,
          mime: String(req.headers["content-type"] || "application/octet-stream").split(";")[0],
          filename: safeName(req.headers["x-filename"] || u.searchParams.get("filename") || "upload"),
          data,
          createdAt: now(),
        };
        store.saveAsset(asset);
        return sendJson(res, 201, { assetId: asset.id, url: `/api/rooms/${room.id}/assets/${asset.id}`, mime: asset.mime, filename: asset.filename });
      }
      if (assetMatch && req.method === "GET" && assetMatch[2]) {
        const asset = store.getAsset(assetMatch[1], assetMatch[2]);
        if (!asset) return sendJson(res, 404, { error: "ASSET_NOT_FOUND" });
        res.writeHead(200, {
          "content-type": asset.mime,
          "content-length": asset.data.length,
          "cache-control": "public, max-age=31536000, immutable",
          "access-control-allow-origin": "*",
        });
        return res.end(asset.data);
      }
      if (req.method === "GET" && options.staticDir) {
        const root = path.resolve(options.staticDir);
        const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        const file = path.resolve(root, rel);
        if (file === root || file.startsWith(root + path.sep)) {
          let target = file;
          try {
            if (fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
          } catch {
            if (!path.extname(rel)) target = path.join(root, "index.html");
          }
          try {
            const body = fs.readFileSync(target);
            const ext = path.extname(target).toLowerCase();
            const mime =
              (
                {
                  ".html": "text/html; charset=utf-8",
                  ".js": "text/javascript; charset=utf-8",
                  ".mjs": "text/javascript; charset=utf-8",
                  ".css": "text/css; charset=utf-8",
                  ".map": "application/json; charset=utf-8",
                  ".json": "application/json; charset=utf-8",
                  ".svg": "image/svg+xml",
                  ".png": "image/png",
                  ".jpg": "image/jpeg",
                  ".jpeg": "image/jpeg",
                  ".webp": "image/webp",
                } as Record<string, string>
              )[ext] || "application/octet-stream";
            res.writeHead(200, {
              "content-type": mime,
              "content-length": body.length,
              "cache-control": "no-cache",
              "access-control-allow-origin": "*",
            });
            return res.end(body);
          } catch {
            /* fall through */
          }
        }
      }
      return sendJson(res, 404, { error: "NOT_FOUND" });
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      console.error(err);
      return sendJson(res, err.statusCode || 500, { error: "INTERNAL_ERROR", message: err.message });
    }
  });

  function sendTo(client: Client, message: unknown): void {
    if (client.socket.destroyed) return;
    client.socket.write(encodeFrame(json(message)));
  }

  function broadcast(roomId: string, message: unknown, except?: Client): void {
    const set = clients.get(roomId);
    if (!set) return;
    for (const c of set) if (c !== except) sendTo(c, message);
  }

  function participantState(c: Client): AwarenessState {
    return { sessionId: c.sessionId, nickname: c.nickname, color: c.color, cursor: c.cursor, selection: c.selection, updatedAt: c.updatedAt };
  }

  server.on("upgrade", (req, socket) => {
    const u = new URL(req.url || "/", `http://${req.headers.host || host}`);
    if (u.pathname !== "/ws") return socket.destroy();
    const roomId = u.searchParams.get("roomId") || u.searchParams.get("room");
    const token = u.searchParams.get("token");
    let session: SessionRecord | null = token ? store.getSession(token) || null : null;
    let room: RoomRecord | undefined = roomId ? rooms.get(roomId) || store.getRoom(roomId) : undefined;
    if (!room && roomId && !token) {
      room = { id: roomId, name: u.searchParams.get("name") || "Shared Space", passwordHash: null, createdAt: now(), document: emptyDocument() };
      try {
        store.createRoom(room);
      } catch {
        room = store.getRoom(roomId) || room;
      }
    }
    if (room && !rooms.has(room.id)) rooms.set(room.id, room);
    if (!room || (room.passwordHash && !session) || (session && (session.roomId !== room.id || session.expiresAt < now()))) {
      return socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    }
    if (!session) {
      session = {
        roomId: room.id,
        token: null,
        nickname: String(u.searchParams.get("nickname") || "Guest").slice(0, 40),
        color: String(u.searchParams.get("color") || COLORS[Math.floor(Math.random() * COLORS.length)]),
        createdAt: now(),
        expiresAt: now() + 3600000,
      };
    }
    const key = req.headers["sec-websocket-key"];
    if (!key) return socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client: Client = {
      socket,
      roomId: room.id,
      sessionId: id("client_"),
      nickname: session.nickname,
      color: session.color,
      cursor: undefined,
      selection: undefined,
      updatedAt: now(),
      buffer: Buffer.alloc(0),
    };
    if (!clients.has(room.id)) clients.set(room.id, new Set());
    clients.get(room.id)!.add(client);
    const peerClients = [...clients.get(room.id)!].filter((c) => c !== client);
    const peers = peerClients.map(participantState);
    sendTo(client, { type: "joined", roomId: room.id, sessionId: client.sessionId, participants: peers, peerSessionIds: peerClients.map((c) => c.sessionId), state: room.document });
    broadcast(room.id, { type: "presence", action: "join", state: participantState(client) }, client);
    const close = (): void => {
      if (client.closed) return;
      client.closed = true;
      clients.get(room.id)?.delete(client);
      broadcast(room.id, { type: "presence", action: "leave", state: participantState(client) }, client);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    };
    socket.on("data", (chunk: Buffer) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      const parsed = parseFrames(client.buffer);
      client.buffer = parsed.rest;
      for (const frame of parsed.frames) {
        if (frame.opcode === 8) return close();
        if (frame.opcode === 9) {
          socket.write(encodeFrame(frame.payload, 10));
          continue;
        }
        if (frame.opcode !== 1) continue;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(frame.payload.toString("utf8")) as Record<string, unknown>;
        } catch {
          sendTo(client, { type: "error", code: "BAD_JSON", message: "Message must be valid JSON" });
          continue;
        }
        if (message.type === "sync-step1") sendTo(client, { type: "sync-step2", clock: room.document.clock, state: room.document });
        else if (message.type === "rich-text-operation") {
          const object = room.document.objects[String(message.objectId || "")];
          const op = message.operation as Record<string, unknown> | undefined;
          if (!object || object.kind !== "richText" || !op || typeof op !== "object" || typeof op.text !== "string") continue;
          if (op.action !== "content" && op.action !== "title") continue;
          if (op.action === "content" && op.text.length > 200_000) {
            sendTo(client, { type: "error", code: "RICH_TEXT_TOO_LARGE", message: "Rich text content exceeds 200000 characters" });
            continue;
          }
          // Apply each field to the latest document; a concurrent title edit or move
          // must not replace content carried by an older client snapshot.
          const next = { ...object, richTextVersion: (object.richTextVersion || 0) + 1 };
          if (op.action === "title") next.title = op.text.slice(0, 120);
          else next.content = op.text;
          room.document.objects[object.id] = next;
          room.document.clock++;
          store.saveDocument(room.id, room.document);
          broadcast(room.id, { type: "y-update", clock: room.document.clock, objects: [next], live: true });
        }
        else if (message.type === "todo-operation") {
          const object = room.document.objects[String(message.objectId || "")];
          const op = message.operation as Record<string, unknown> | undefined;
          if (!object || object.kind !== "todo" || !op || typeof op !== "object") continue;
          const itemId = typeof op.itemId === "string" && op.itemId.length <= 100 ? op.itemId : "";
          const items = (object.items || []).map(item => ({ ...item }));
          const item = items.find(item => item.id === itemId);
          let title = object.title;
          if (op.action === "title" && typeof op.text === "string") title = op.text.slice(0, 120);
          else if (op.action === "add" && itemId && typeof op.text === "string" && op.text.trim()) {
            if (item) continue;
            items.push({ id: itemId, text: op.text.trim().slice(0, 200), done: false });
          } else if (op.action === "text" && item && typeof op.text === "string") item.text = op.text.slice(0, 200);
          else if (op.action === "done" && item && typeof op.done === "boolean") item.done = op.done;
          else if (op.action === "remove" && item) items.splice(items.indexOf(item), 1);
          else continue; // Deleted rows stay deleted; stale edits cannot resurrect them.
          const next = { ...object, title, items, todoVersion: (object.todoVersion || 0) + 1 };
          room.document.objects[object.id] = next;
          room.document.clock++;
          store.saveDocument(room.id, room.document);
          broadcast(room.id, { type: "y-update", clock: room.document.clock, objects: [next], live: true });
        }
        else if (message.type === "y-update") {
          const incoming = (message.update as DocumentUpdate | undefined) || {
            objects: message.objects as DocumentUpdate["objects"],
            richText: message.richText as Record<string, unknown> | undefined,
            deletedObjects: message.deletedObjects as string[] | undefined,
            edges: message.edges as DocumentUpdate["edges"],
            deletedEdges: message.deletedEdges as string[] | undefined,
          };
          const isLive = !!(message as { live?: boolean }).live;
          // Authoritative content updates always merge+persist. Live geometry may
          // also arrive over WS when no P2P channel is open — still merge so peers
          // catch up, and forward `live` so clients treat it as a delta.
          room.document = mergeDocument(room.document, incoming || {});
          store.saveDocument(room.id, room.document);
          const deletedObjects = (incoming && incoming.deletedObjects) || [];
          const deletedEdges = (incoming && incoming.deletedEdges) || [];
          broadcast(
            room.id,
            {
              type: "y-update",
              clock: room.document.clock,
              update: incoming || {},
              // Full object map keeps non-delta receivers consistent; deletedObjects
              // + live are forwarded so P2P/WS duplicate delivery stays idempotent.
              objects: Object.values(room.document.objects),
              deletedObjects,
              edges: room.document.edges || [],
              deletedEdges,
              live: isLive,
              richText: room.document.richText,
            },
            client,
          );
          if (incoming.edges?.length || incoming.deletedEdges?.length) {
            // Edge-only acknowledgement reconciles optimistic relationship edits
            // without replacing objects a sender may still be moving or editing.
            sendTo(client, { type: "y-update", clock: room.document.clock, edges: room.document.edges || [] });
          }
        } else if (message.type === "awareness" || message.type === "presence") {
          const incomingState = (message.state || {}) as Partial<AwarenessState>;
          if (!token && incomingState.nickname) client.nickname = String(incomingState.nickname).slice(0, 40);
          if (!token && incomingState.color) client.color = String(incomingState.color).slice(0, 24);
          const state: AwarenessState = {
            ...participantState(client),
            ...incomingState,
            sessionId: client.sessionId,
            nickname: client.nickname,
            color: client.color,
            updatedAt: now(),
          };
          client.cursor = state.cursor;
          client.selection = state.selection;
          client.updatedAt = state.updatedAt;
          broadcast(room.id, { type: message.type, state }, client);
        } else if (message.type === "signal") {
          const payload = message.payload as Record<string, unknown> | undefined;
          if (!payload || typeof payload !== "object") {
            sendTo(client, { type: "error", code: "BAD_SIGNAL", message: "signal.payload required" });
            continue;
          }
          const kind = String((payload as { kind?: unknown }).kind || "");
          if (kind !== "offer" && kind !== "answer" && kind !== "ice") {
            sendTo(client, { type: "error", code: "BAD_SIGNAL", message: "signal.payload.kind must be offer|answer|ice" });
            continue;
          }
          const relay = {
            type: "signal",
            roomId: room.id,
            fromSessionId: client.sessionId,
            toSessionId: typeof message.toSessionId === "string" ? message.toSessionId : undefined,
            payload,
          };
          const set = clients.get(room.id);
          if (!set) continue;
          if (relay.toSessionId) {
            const target = [...set].find((c) => c.sessionId === relay.toSessionId);
            if (target) sendTo(target, relay);
          } else {
            for (const c of set) if (c !== client) sendTo(c, relay);
          }
        } else if (message.type === "leave") return close();
      }
    });
    socket.on("error", close);
    socket.on("close", close);
  });

  return {
    server,
    store,
    rooms,
    clients,
    start() {
      return new Promise<AddressInfo>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.off("error", onError);
          resolve(server.address() as AddressInfo);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
    },
    close() {
      for (const set of clients.values()) for (const c of set) c.socket.destroy();
      return new Promise<void>((resolve, reject) =>
        server.close((e) => {
          try {
            store.close();
          } catch {
            /* ignore */
          }
          e ? reject(e) : resolve();
        }),
      );
    },
  };
}

export { createServer, hashPassword, verifyPassword, mergeDocument, emptyDocument, encodeFrame, parseFrames };

if (require.main === module) {
  const app = createServer();
  app.start().then((address) => console.log(`Spatial collaboration server listening on http://${address.address}:${address.port}`));
}
