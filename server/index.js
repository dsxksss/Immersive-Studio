#!/usr/bin/env node
/**
 * Small dependency-free collaboration server. It uses Node 24's built-in
 * node:sqlite when available and falls back to an in-memory store for older
 * Node versions. WebSocket framing is implemented directly so the prototype
 * can run without downloading dependencies.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (_) { DatabaseSync = null; }

const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const COLORS = ['#8b5cf6', '#0ea5e9', '#f97316', '#10b981', '#ec4899', '#eab308'];
const now = () => Date.now();
const id = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex');
const json = (v) => JSON.stringify(v);
const parseJson = (v, fallback) => { try { return JSON.parse(v); } catch (_) { return fallback; } };

function hashPassword(password, salt = crypto.randomBytes(16)) {
  if (!password) return null;
  const digest = crypto.scryptSync(String(password), salt, 32);
  return `scrypt$${salt.toString('base64')}$${digest.toString('base64')}`;
}
function verifyPassword(password, encoded) {
  if (!encoded) return !password;
  if (typeof password !== 'string') return false;
  const [, saltB64, hashB64] = String(encoded).split('$');
  if (!saltB64 || !hashB64) return false;
  try {
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) { return false; }
}

const emptyDocument = () => ({ objects: {}, richText: {}, clock: 0 });

function makeStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'spatial.sqlite');
  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT, created_at INTEGER NOT NULL, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, room_id TEXT NOT NULL, nickname TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, mime TEXT NOT NULL, filename TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL);`);
    return {
      kind: 'sqlite',
      db,
      createRoom(room) { db.prepare('INSERT INTO rooms VALUES (?, ?, ?, ?, ?)').run(room.id, room.name, room.passwordHash, room.createdAt, json(room.document)); },
      getRoom(roomId) { const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId); return row && { id: row.id, name: row.name, passwordHash: row.password_hash, createdAt: row.created_at, document: parseJson(row.document, emptyDocument()) }; },
      saveDocument(roomId, document) { db.prepare('UPDATE rooms SET document = ? WHERE id = ?').run(json(document), roomId); },
      createSession(session) { db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(session.token, session.roomId, session.nickname, session.color, session.createdAt, session.expiresAt); },
      getSession(token) { const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token); return row && { token: row.token, roomId: row.room_id, nickname: row.nickname, color: row.color, createdAt: row.created_at, expiresAt: row.expires_at }; },
      saveAsset(asset) { db.prepare('INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)').run(asset.id, asset.roomId, asset.mime, asset.filename, asset.data, asset.createdAt); },
      getAsset(roomId, assetId) { const row = db.prepare('SELECT * FROM assets WHERE room_id = ? AND id = ?').get(roomId, assetId); return row && { id: row.id, roomId: row.room_id, mime: row.mime, filename: row.filename, data: Buffer.from(row.data), createdAt: row.created_at }; },
      close() { db.close(); }
    };
  }
  // Fallback for Node versions without node:sqlite (e.g. CI using Node 20).
  const rooms = new Map(); const sessions = new Map(); const assets = new Map();
  return {
    kind: 'memory',
    createRoom(room) { rooms.set(room.id, room); }, getRoom(roomId) { return rooms.get(roomId); }, saveDocument(roomId, document) { const r = rooms.get(roomId); if (r) r.document = document; },
    createSession(session) { sessions.set(session.token, session); }, getSession(token) { return sessions.get(token); }, saveAsset(asset) { assets.set(asset.id, asset); }, getAsset(roomId, assetId) { const a = assets.get(assetId); return a && a.roomId === roomId ? a : undefined; }, close() {}
  };
}

function mergeDocument(document, update) {
  const next = { objects: { ...(document.objects || {}) }, richText: { ...(document.richText || {}) }, clock: Number(document.clock || 0) + 1 };
  if (Array.isArray(update?.objects)) {
    for (const obj of update.objects) if (obj && obj.id) next.objects[obj.id] = obj;
  } else if (update?.objects && typeof update.objects === 'object') {
    for (const [key, obj] of Object.entries(update.objects)) if (obj && obj.id) next.objects[key] = obj;
  }
  if (update?.deletedObjects) for (const objectId of update.deletedObjects) delete next.objects[objectId];
  if (update?.richText && typeof update.richText === 'object') Object.assign(next.richText, update.richText);
  return next;
}

function parseBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (chunk) => { size += chunk.length; if (size > limit) { reject(Object.assign(new Error('payload too large'), { statusCode: 413 })); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
}
function sendJson(res, status, payload) { const body = Buffer.from(json(payload)); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'access-control-allow-origin': '*' }); res.end(body); }
function safeName(name) { return String(name || 'untitled').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'untitled'; }

// RFC 6455 helpers (text frames, ping/pong and close are sufficient for this app).
function encodeFrame(payload, opcode = 1) { const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload); let header; if (data.length < 126) header = Buffer.from([0x80 | opcode, data.length]); else if (data.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(data.length, 2); } else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(data.length), 2); } return Buffer.concat([header, data]); }
function parseFrames(buffer) {
  const frames = []; let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset], b2 = buffer[offset + 1]; const fin = !!(b1 & 0x80), opcode = b1 & 0x0f, masked = !!(b2 & 0x80); let len = b2 & 0x7f; let head = 2;
    if (len === 126) { if (offset + 4 > buffer.length) break; len = buffer.readUInt16BE(offset + 2); head = 4; } else if (len === 127) { if (offset + 10 > buffer.length) break; len = Number(buffer.readBigUInt64BE(offset + 2)); head = 10; }
    const maskBytes = masked ? 4 : 0; if (offset + head + maskBytes + len > buffer.length) break;
    const mask = masked ? buffer.subarray(offset + head, offset + head + 4) : null; const start = offset + head + maskBytes; const payload = Buffer.from(buffer.subarray(start, start + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    frames.push({ fin, opcode, payload }); offset = start + len;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function createServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 8787); const host = options.host || process.env.HOST || '127.0.0.1';
  const dataDir = options.dataDir || process.env.SPATIAL_DATA_DIR || DEFAULT_DATA_DIR; const store = makeStore(dataDir); const rooms = new Map(); const clients = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'content-type, authorization, x-session-token'); res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const u = new URL(req.url || '/', `http://${req.headers.host || host}`); const pathname = u.pathname;
    try {
      if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { ok: true, transport: 'websocket', persistence: store.kind });
      if (req.method === 'POST' && pathname === '/api/rooms') {
        const body = parseJson((await parseBody(req, 1024 * 1024)).toString('utf8') || '{}', {}); const roomId = id('room_'); const name = String(body.name || 'Untitled Space').slice(0, 120); const passwordHash = body.password ? hashPassword(body.password) : null;
        const room = { id: roomId, name, passwordHash, createdAt: now(), document: emptyDocument() }; store.createRoom(room); rooms.set(roomId, room);
        return sendJson(res, 201, { roomId, name, requiresPassword: !!passwordHash, shareUrl: `/space/${roomId}` });
      }
      const joinMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
      if (req.method === 'POST' && joinMatch) {
        const room = rooms.get(joinMatch[1]) || store.getRoom(joinMatch[1]); if (!room) return sendJson(res, 404, { error: 'ROOM_NOT_FOUND' });
        const body = parseJson((await parseBody(req, 1024 * 1024)).toString('utf8') || '{}', {}); if (!verifyPassword(body.password || '', room.passwordHash)) return sendJson(res, 401, { error: 'INVALID_PASSWORD' });
        const token = id('sess_'); const session = { token, roomId: room.id, nickname: String(body.nickname || 'Guest').slice(0, 40), color: String(body.color || COLORS[Math.floor(Math.random() * COLORS.length)]), createdAt: now(), expiresAt: now() + 7 * 24 * 3600 * 1000 }; store.createSession(session);
        return sendJson(res, 200, { roomId: room.id, token, nickname: session.nickname, color: session.color, websocketUrl: `/ws?roomId=${encodeURIComponent(room.id)}&token=${encodeURIComponent(token)}` });
      }
      const stateMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/state$/);
      if (req.method === 'GET' && stateMatch) { const room = rooms.get(stateMatch[1]) || store.getRoom(stateMatch[1]); return room ? sendJson(res, 200, { roomId: room.id, name: room.name, state: room.document }) : sendJson(res, 404, { error: 'ROOM_NOT_FOUND' }); }
      const assetMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/assets(?:\/([^/]+))?$/);
      if (assetMatch && req.method === 'POST' && !assetMatch[2]) {
        const room = rooms.get(assetMatch[1]) || store.getRoom(assetMatch[1]); if (!room) return sendJson(res, 404, { error: 'ROOM_NOT_FOUND' });
        const token = req.headers['x-session-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const session = store.getSession(token); if (!session || session.roomId !== room.id || session.expiresAt < now()) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
        const data = await parseBody(req); if (!data.length) return sendJson(res, 400, { error: 'EMPTY_ASSET' }); const asset = { id: id('asset_'), roomId: room.id, mime: String(req.headers['content-type'] || 'application/octet-stream').split(';')[0], filename: safeName(req.headers['x-filename'] || u.searchParams.get('filename') || 'upload'), data, createdAt: now() }; store.saveAsset(asset); return sendJson(res, 201, { assetId: asset.id, url: `/api/rooms/${room.id}/assets/${asset.id}`, mime: asset.mime, filename: asset.filename });
      }
      if (assetMatch && req.method === 'GET' && assetMatch[2]) { const asset = store.getAsset(assetMatch[1], assetMatch[2]); if (!asset) return sendJson(res, 404, { error: 'ASSET_NOT_FOUND' }); res.writeHead(200, { 'content-type': asset.mime, 'content-length': asset.data.length, 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' }); return res.end(asset.data); }
      // Optional static bundle serving (set STATIC_DIR or createServer({staticDir})).
      if (req.method === 'GET' && options.staticDir) {
        const root = path.resolve(options.staticDir); const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''); const file = path.resolve(root, rel);
        if (file === root || file.startsWith(root + path.sep)) {
          let target = file; try { if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html'); } catch (_) { if (!path.extname(rel)) target = path.join(root, 'index.html'); }
          try { const body = fs.readFileSync(target); const ext = path.extname(target).toLowerCase(); const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] || 'application/octet-stream'; res.writeHead(200, { 'content-type': mime, 'content-length': body.length, 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); return res.end(body); } catch (_) { /* fall through to API 404 */ }
        }
      }
      return sendJson(res, 404, { error: 'NOT_FOUND' });
    } catch (error) { console.error(error); return sendJson(res, error.statusCode || 500, { error: 'INTERNAL_ERROR', message: error.message }); }
  });
  function sendTo(client, message) { if (client.socket.destroyed) return; client.socket.write(encodeFrame(json(message))); }
  function broadcast(roomId, message, except) { const set = clients.get(roomId); if (!set) return; for (const c of set) if (c !== except) sendTo(c, message); }
  function participantState(c) { return { sessionId: c.sessionId, nickname: c.nickname, color: c.color, cursor: c.cursor, selection: c.selection, updatedAt: c.updatedAt }; }
  server.on('upgrade', (req, socket) => {
    const u = new URL(req.url || '/', `http://${req.headers.host || host}`); if (u.pathname !== '/ws') return socket.destroy();
    const roomId = u.searchParams.get('roomId') || u.searchParams.get('room'); const token = u.searchParams.get('token'); let session = token ? store.getSession(token) : null; let room = roomId && (rooms.get(roomId) || store.getRoom(roomId));
    // The static prototype can connect without an API round trip. Authenticated
    // clients use the token from /join; anonymous clients get a guest session
    // in an open room (password-protected rooms still require a token).
    if (!room && roomId && !token) { room = { id: roomId, name: u.searchParams.get('name') || 'Shared Space', passwordHash: null, createdAt: now(), document: emptyDocument() }; try { store.createRoom(room); } catch (_) { room = store.getRoom(roomId) || room; } }
    if (room && !rooms.has(room.id)) rooms.set(room.id, room);
    if (!room || (room.passwordHash && !session) || (session && (session.roomId !== room.id || session.expiresAt < now()))) return socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    if (!session) session = { roomId: room.id, token: null, nickname: String(u.searchParams.get('nickname') || 'Guest').slice(0, 40), color: String(u.searchParams.get('color') || COLORS[Math.floor(Math.random() * COLORS.length)]), createdAt: now(), expiresAt: now() + 3600000 };
    const key = req.headers['sec-websocket-key']; if (!key) return socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client = { socket, roomId: room.id, sessionId: id('client_'), nickname: session.nickname, color: session.color, cursor: undefined, selection: undefined, updatedAt: now(), buffer: Buffer.alloc(0) }; if (!clients.has(room.id)) clients.set(room.id, new Set()); clients.get(room.id).add(client);
    const peers = [...clients.get(room.id)].filter(c => c !== client).map(participantState); sendTo(client, { type: 'joined', roomId: room.id, sessionId: client.sessionId, participants: peers, state: room.document }); broadcast(room.id, { type: 'presence', action: 'join', state: participantState(client) }, client);
    const close = () => { if (client.closed) return; client.closed = true; clients.get(room.id)?.delete(client); broadcast(room.id, { type: 'presence', action: 'leave', state: participantState(client) }, client); try { socket.destroy(); } catch (_) {} };
    socket.on('data', (chunk) => { client.buffer = Buffer.concat([client.buffer, chunk]); const parsed = parseFrames(client.buffer); client.buffer = parsed.rest; for (const frame of parsed.frames) { if (frame.opcode === 8) return close(); if (frame.opcode === 9) { socket.write(encodeFrame(frame.payload, 10)); continue; } if (frame.opcode !== 1) continue; let message; try { message = JSON.parse(frame.payload.toString('utf8')); } catch (_) { sendTo(client, { type: 'error', code: 'BAD_JSON', message: 'Message must be valid JSON' }); continue; }
        if (message.type === 'sync-step1') sendTo(client, { type: 'sync-step2', clock: room.document.clock, state: room.document });
        else if (message.type === 'y-update') { const incoming = message.update || { objects: message.objects, richText: message.richText, deletedObjects: message.deletedObjects }; room.document = mergeDocument(room.document, incoming || {}); store.saveDocument(room.id, room.document); broadcast(room.id, { type: 'y-update', clock: room.document.clock, update: incoming || {}, objects: Object.values(room.document.objects), richText: room.document.richText }, client); }
        else if (message.type === 'awareness' || message.type === 'presence') { if (!token && message.state?.nickname) client.nickname = String(message.state.nickname).slice(0, 40); if (!token && message.state?.color) client.color = String(message.state.color).slice(0, 24); const state = { ...participantState(client), ...(message.state || {}), sessionId: client.sessionId, nickname: client.nickname, color: client.color, updatedAt: now() }; client.cursor = state.cursor; client.selection = state.selection; client.updatedAt = state.updatedAt; broadcast(room.id, { type: message.type, state }, client); }
        else if (message.type === 'leave') return close();
      } }); socket.on('error', close); socket.on('close', close);
  });
  return { server, store, rooms, clients, start() { return new Promise((resolve, reject) => { const onError = (error) => { server.off('listening', onListening); reject(error); }; const onListening = () => { server.off('error', onError); resolve(server.address()); }; server.once('error', onError); server.once('listening', onListening); server.listen(port, host); }); }, close() { for (const set of clients.values()) for (const c of set) c.socket.destroy(); return new Promise((resolve, reject) => server.close((e) => { try { store.close(); } catch (_) {} e ? reject(e) : resolve(); })); } };
}

if (require.main === module) { const app = createServer(); app.start().then((address) => console.log(`Spatial collaboration server listening on http://${address.address}:${address.port}`)); }
module.exports = { createServer, hashPassword, verifyPassword, mergeDocument, emptyDocument, encodeFrame, parseFrames };
