import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../index";

test("rich text field operations sync, survive stale moves, upgrade legacy documents, and persist", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spatial-rich-text-"));
  let app = createServer({ port: 0, host: "127.0.0.1", dataDir });
  const sockets: WebSocket[] = [];
  function next(ws: WebSocket, type: string, matches: (message: any) => boolean = () => true): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.removeEventListener("message", onMessage); reject(new Error(type + " timeout")); }, 4000);
      function onMessage(e: MessageEvent) {
        const msg = JSON.parse(String(e.data));
        if (msg.type === type && matches(msg)) { clearTimeout(timer); ws.removeEventListener("message", onMessage); resolve(msg); }
      }
      ws.addEventListener("message", onMessage);
    });
  }
  const send = (ws: WebSocket, msg: unknown) => ws.send(JSON.stringify(msg));
  async function state(ws: WebSocket) { const result = next(ws, "sync-step2"); send(ws, { type: "sync-step1" }); return (await result).state; }
  try {
    let address = await app.start();
    let base = `http://127.0.0.1:${address.port}`;
    const room = await (await fetch(base + "/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Rich text test", password: "test-only" }) })).json() as any;
    async function connect(name: string) {
      const session = await (await fetch(base + `/api/rooms/${room.roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: name, password: "test-only" }) })).json() as any;
      const ws = new WebSocket(base.replace("http", "ws") + session.websocketUrl);
      sockets.push(ws); const joined = await next(ws, "joined"); return { ws, joined };
    }
    const { ws: a } = await connect("A"), { ws: b } = await connect("B");
    const doc = { id: "document", kind: "richText", x: 0, y: 0, width: 360, height: 320, title: "Document", content: "<p>Initial</p>", richTextVersion: 0, folderId: "folder" };
    const legacy = { id: "legacy", kind: "richText", x: 0, y: 0, width: 300, height: 240, title: "Legacy", content: "<p>Legacy text</p>" };
    send(a, { type: "y-update", objects: [doc, legacy] }); await state(a);
    const op = (ws: WebSocket, objectId: string, operation: unknown) => send(ws, { type: "rich-text-operation", objectId, operation });

    // Both the sender and its collaborator receive authoritative content and version.
    const matchFirstEdit = (msg: any) => msg.objects?.some((o: any) => o.id === doc.id && o.richTextVersion === 1);
    const echoA = next(a, "y-update", matchFirstEdit), echoB = next(b, "y-update", matchFirstEdit);
    const formattedHtml = '<h2>Shared</h2><p><strong><span style="font-size: 24px">Larger formatted text</span></strong></p>';
    op(a, doc.id, { action: "content", text: formattedHtml });
    const [ackA, ackB] = await Promise.all([echoA, echoB]);
    assert.deepEqual(ackA.objects, ackB.objects);
    assert.equal(ackB.objects[0].content, formattedHtml);

    // Independent fields merge regardless of the order their sockets reach the server.
    // Both increased and decreased font sizes are document content, including
    // when a concurrent title update, stale move, or restart follows the edit.
    const sizedHtml = '<p><span style="font-size: 24px">Larger text</span> and <span style="font-size: 12px">Smaller text</span></p>';
    op(a, doc.id, { action: "content", text: sizedHtml });
    op(b, doc.id, { action: "title", text: "Shared title" });
    await Promise.all([state(a), state(b)]);
    let saved = (await state(a)).objects.document;
    assert.equal(saved.content, sizedHtml);
    assert.equal(saved.title, "Shared title");
    assert.equal(saved.richTextVersion, 3);

    // A full object from a stale dragging peer moves the panel, including out of a
    // folder, but cannot replace the authoritative title, body, or version.
    send(b, { type: "y-update", objects: [{ ...doc, x: 210, folderId: undefined }] }); await state(b);
    saved = (await state(a)).objects.document;
    assert.equal(saved.x, 210); assert.equal(saved.folderId, undefined);
    assert.equal(saved.title, "Shared title"); assert.equal(saved.content, sizedHtml);
    assert.equal(saved.richTextVersion, 3);

    // Old documents remain intact on geometry updates and upgrade on first edit.
    send(b, { type: "y-update", objects: [{ ...legacy, x: 50, content: "Stale body", title: "Stale title" }] }); await state(b);
    let old = (await state(a)).objects.legacy;
    assert.equal(old.content, legacy.content); assert.equal(old.title, legacy.title); assert.equal(old.x, 50);
    op(a, legacy.id, { action: "content", text: "" }); await state(a);
    old = (await state(b)).objects.legacy;
    assert.equal(old.content, ""); assert.equal(old.richTextVersion, 1);

    // Invalid operations and edits to removed objects cannot resurrect content.
    const beforeInvalid = saved.richTextVersion;
    op(a, doc.id, { action: "content", text: 42 });
    op(a, doc.id, { action: "unknown", text: "Invalid" });
    op(a, "missing", { action: "content", text: "Must stay missing" });
    await state(a);
    assert.equal((await state(b)).objects.document.richTextVersion, beforeInvalid);
    const tooLarge = next(a, "error", msg => msg.code === "RICH_TEXT_TOO_LARGE");
    op(a, doc.id, { action: "content", text: "x".repeat(200_001) }); await tooLarge;
    saved = (await state(b)).objects.document;
    assert.equal(saved.content, sizedHtml); assert.equal(saved.richTextVersion, beforeInvalid);
    op(a, doc.id, { action: "title", text: "T".repeat(150) }); await state(a);
    saved = (await state(b)).objects.document;
    assert.equal(saved.title.length, 120);
    send(a, { type: "y-update", deletedObjects: [legacy.id] }); await state(a);
    op(b, legacy.id, { action: "content", text: "Deleted body" }); await state(b);
    assert.equal((await state(a)).objects.legacy, undefined);

    // Restart the actual server and rejoin to exercise SQLite persistence.
    for (const ws of sockets) ws.close();
    await app.close();
    app = createServer({ port: 0, host: "127.0.0.1", dataDir });
    address = await app.start(); base = `http://127.0.0.1:${address.port}`;
    const rejoined = await connect("Refresh");
    assert.deepEqual(rejoined.joined.state.objects.document, saved);
    assert.equal(rejoined.joined.state.objects.document.content, sizedHtml);
    assert.equal(rejoined.joined.state.objects.legacy, undefined);
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
