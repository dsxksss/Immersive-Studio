import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, hashPassword, verifyPassword, mergeDocument, parseFrames, encodeFrame } from "../index";

test("password hashing uses a salted scrypt digest", () => {
  const encoded = hashPassword("swordfish");
  assert.ok(encoded);
  assert.match(encoded!, /^scrypt\$/);
  assert.equal(verifyPassword("swordfish", encoded), true);
  assert.equal(verifyPassword("wrong", encoded), false);
  assert.equal(verifyPassword("", null), true);
});

test("document updates merge object and rich text values", () => {
  const first = mergeDocument(
    { objects: {}, richText: {}, clock: 0 },
    { objects: [{ id: "a", kind: "note", x: 1, y: 2, width: 100, height: 80, text: "hello" }] },
  );
  const second = mergeDocument(first, {
    objects: [{ id: "b", kind: "link", x: 0, y: 0, width: 200, height: 120, url: "https://example.com" }],
    richText: { doc1: { type: "doc", content: [] } },
  });
  assert.equal(second.clock, 2);
  assert.equal((second.objects.a as { text: string }).text, "hello");
  assert.equal((second.objects.b as { url: string }).url, "https://example.com");
  assert.deepEqual(second.richText.doc1, { type: "doc", content: [] });
});

test("mergeDocument preserves panel content fields", () => {
  const base = mergeDocument(
    { objects: {}, richText: {}, clock: 0 },
    {
      objects: [
        { id: "n1", kind: "note", x: 0, y: 0, width: 100, height: 80, text: "hello", color: "#fff2a8" },
        { id: "r1", kind: "richText", x: 0, y: 0, width: 200, height: 120, title: "Doc", content: "<p>Hi</p>" },
        { id: "i1", kind: "image", x: 0, y: 0, width: 200, height: 120, src: "/a.png", caption: "cap" },
        { id: "l1", kind: "link", x: 0, y: 0, width: 200, height: 120, title: "T", url: "https://ex.com", description: "d" },
        { id: "f1", kind: "folder", x: 0, y: 0, width: 160, height: 140, title: "Folder" },
        { id: "a1", kind: "artboard", x: 0, y: 0, width: 300, height: 200, title: "Board", strokes: [{ tool: "pen", points: [{ x: 1, y: 2 }], color: "#000", size: 3 }] },
      ],
    },
  );
  const next = mergeDocument(base, {
    objects: [
      { id: "n1", kind: "note", x: 10, y: 10, width: 100, height: 80, text: "updated", color: "#d7efdf" },
      { id: "r1", kind: "richText", x: 0, y: 0, width: 200, height: 120, title: "Doc2", content: "<p>Bye</p>" },
      { id: "i1", kind: "image", x: 0, y: 0, width: 220, height: 140, src: "/b.png", caption: "cap2" },
      { id: "l1", kind: "link", x: 0, y: 0, width: 200, height: 120, title: "T2", url: "https://ex.org", description: "d2" },
      { id: "f1", kind: "folder", x: 0, y: 0, width: 160, height: 140, title: "Folder2" },
      { id: "a1", kind: "artboard", x: 0, y: 0, width: 300, height: 200, title: "Board", strokes: [{ tool: "pen", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: "#000", size: 3 }] },
      { id: "child", kind: "note", x: 1, y: 1, width: 80, height: 60, text: "in", folderId: "f1" },
    ],
  });
  assert.equal((next.objects.n1 as any).text, "updated");
  assert.equal((next.objects.n1 as any).color, "#d7efdf");
  // Existing rich text changes through rich-text-operation, never through a
  // full-object geometry update, including documents created by older clients.
  assert.equal((next.objects.r1 as any).content, "<p>Hi</p>");
  assert.equal((next.objects.r1 as any).title, "Doc");
  assert.equal((next.objects.i1 as any).src, "/b.png");
  assert.equal((next.objects.i1 as any).caption, "cap2");
  assert.equal((next.objects.l1 as any).url, "https://ex.org");
  assert.equal((next.objects.l1 as any).description, "d2");
  assert.equal((next.objects.f1 as any).title, "Folder2");
  assert.equal((next.objects.a1 as any).strokes.length, 1);
  assert.equal((next.objects.a1 as any).strokes[0].points.length, 2);
  assert.equal((next.objects.child as any).folderId, "f1");
});

test("websocket frames round trip", () => {
  const frame = encodeFrame(JSON.stringify({ type: "ping" }));
  const parsed = parseFrames(frame);
  assert.equal(parsed.frames.length, 1);
  assert.equal(parsed.frames[0].payload.toString(), '{"type":"ping"}');
  assert.equal(parsed.rest.length, 0);
});

test("room creation, password join and asset lifecycle", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spatial-server-"));
  const app = createServer({ port: 0, host: "127.0.0.1", dataDir });
  let address;
  try {
    address = await app.start();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EPERM" || err.code === "EACCES") return t.skip("network sockets disabled in this environment");
    throw error;
  }
  t.after(() => app.close());
  const base = `http://127.0.0.1:${address.port}`;

  let response = await fetch(base + "/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Test room", password: "secret" }),
  });
  assert.equal(response.status, 201);
  const room = (await response.json()) as { roomId: string; requiresPassword: boolean; shareUrl?: string };
  assert.equal(room.requiresPassword, true);
  assert.match(room.roomId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal((room as { shareUrl?: string }).shareUrl, `/space/${room.roomId}`);

  response = await fetch(`${base}/api/rooms/${room.roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "bad", nickname: "Alice" }),
  });
  assert.equal(response.status, 401);

  response = await fetch(`${base}/api/rooms/${room.roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "secret", nickname: "Alice" }),
  });
  assert.equal(response.status, 200);
  const session = (await response.json()) as { token: string };
  assert.ok(session.token);

  response = await fetch(`${base}/api/rooms/${room.roomId}/assets?filename=hello.txt`, {
    method: "POST",
    headers: { "content-type": "text/plain", "x-session-token": session.token },
    body: "hello",
  });
  assert.equal(response.status, 201);
  const asset = (await response.json()) as { url: string };

  response = await fetch(base + asset.url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "hello");
});

test("websocket signal messages relay to the target peer", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spatial-signal-"));
  const app = createServer({ port: 0, host: "127.0.0.1", dataDir });
  let address;
  try {
    address = await app.start();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EPERM" || err.code === "EACCES") return t.skip("network sockets disabled in this environment");
    throw error;
  }
  t.after(() => app.close());
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as { p2p?: string };
  assert.equal(healthBody.p2p, "hybrid");

  const roomId = "00000000-0000-4000-8000-000000000099";
  function openWs(nickname: string): Promise<{ ws: WebSocket; joined: any }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws?room=${encodeURIComponent(roomId)}&nickname=${encodeURIComponent(nickname)}`);
      const timer = setTimeout(() => reject(new Error("join timeout")), 4000);
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === "joined") {
            clearTimeout(timer);
            resolve({ ws, joined: msg });
          }
        } catch (e) {
          reject(e);
        }
      });
      ws.addEventListener("error", () => reject(new Error("ws error")));
    });
  }

  const a = await openWs("Ada");
  const b = await openWs("Ben");
  assert.ok(Array.isArray(b.joined.peerSessionIds));
  assert.ok(b.joined.peerSessionIds.includes(a.joined.sessionId));

  const got = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("signal timeout")), 4000);
    a.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "signal") {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });

  b.ws.send(
    JSON.stringify({
      type: "signal",
      roomId,
      toSessionId: a.joined.sessionId,
      payload: { kind: "offer", sdp: "v=0-test-offer" },
    }),
  );
  const signal = await got;
  assert.equal(signal.fromSessionId, b.joined.sessionId);
  assert.equal(signal.toSessionId, a.joined.sessionId);
  assert.equal(signal.payload.kind, "offer");
  assert.equal(signal.payload.sdp, "v=0-test-offer");
  a.ws.close();
  b.ws.close();
});

test("mergeDocument merges edges by id and supports deletes", () => {
  const first = mergeDocument(
    { objects: {}, richText: {}, edges: [], clock: 0 },
    {
      objects: [
        { id: "a", kind: "note", x: 0, y: 0, width: 100, height: 80, text: "A" },
        { id: "b", kind: "todo", x: 200, y: 0, width: 240, height: 180, title: "Todo", items: [{ id: "i1", text: "one", done: false }] },
      ],
      edges: [{ id: "e1", fromId: "a", toId: "b", fromPort: "right", toPort: "left" }],
    },
  );
  assert.equal(first.edges?.length, 1);
  assert.equal((first.objects.b as any).items[0].text, "one");
  const second = mergeDocument(first, {
    edges: [{ id: "e1", fromId: "a", toId: "b", fromPort: "bottom", toPort: "top" }, { id: "e2", fromId: "b", toId: "a", fromPort: "left", toPort: "right" }],
  });
  assert.equal(second.edges?.length, 2);
  assert.equal(second.edges!.find((e) => e.id === "e1")!.fromPort, "bottom");
  const third = mergeDocument(second, { deletedEdges: ["e1"] });
  assert.equal(third.edges?.length, 1);
  assert.equal(third.edges![0].id, "e2");
  const fourth = mergeDocument(third, { deletedObjects: ["a"] });
  assert.equal(fourth.objects.a, undefined);
  assert.equal(fourth.edges?.length, 0);
});
