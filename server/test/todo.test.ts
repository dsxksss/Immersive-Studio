import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../index";

test("todo operations merge concurrent edits, protect content from stale moves, and persist", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spatial-todo-"));
  let app = createServer({ port: 0, host: "127.0.0.1", dataDir });
  const sockets: WebSocket[] = [];
  function next(ws: WebSocket, type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.removeEventListener("message", onMessage); reject(new Error(type + " timeout")); }, 4000);
      function onMessage(e: MessageEvent) {
        const msg = JSON.parse(String(e.data));
        if (msg.type === type) { clearTimeout(timer); ws.removeEventListener("message", onMessage); resolve(msg); }
      }
      ws.addEventListener("message", onMessage);
    });
  }
  const send = (ws: WebSocket, msg: unknown) => ws.send(JSON.stringify(msg));
  async function state(ws: WebSocket) { const result = next(ws, "sync-step2"); send(ws, { type: "sync-step1" }); return (await result).state; }
  try {
    let address = await app.start();
    let base = `http://127.0.0.1:${address.port}`;
    const room = await (await fetch(base + "/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Todo test", password: "test-only" }) })).json() as any;
    async function connect(name: string) {
      const session = await (await fetch(base + `/api/rooms/${room.roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: name, password: "test-only" }) })).json() as any;
      const ws = new WebSocket(base.replace("http", "ws") + session.websocketUrl);
      sockets.push(ws); const joined = await next(ws, "joined"); return { ws, joined };
    }
    const { ws: a } = await connect("A"), { ws: b } = await connect("B");
    const todo = { id: "tasks", kind: "todo", x: 0, y: 0, width: 320, height: 360, title: "Tasks", items: [], todoVersion: 0 };
    send(a, { type: "y-update", objects: [todo] }); await state(a);
    const op = (ws: WebSocket, operation: unknown) => send(ws, { type: "todo-operation", objectId: "tasks", operation });
    const echoA = next(a, "y-update"), echoB = next(b, "y-update");
    op(a, { action: "add", itemId: "a", text: "From A" });
    op(b, { action: "add", itemId: "b", text: "From B" });
    await Promise.all([echoA, echoB, state(a), state(b)]);
    let saved = (await state(a)).objects.tasks;
    assert.equal(saved.items.length, 2);
    assert.deepEqual(new Set(saved.items.map((i: any) => i.id)), new Set(["a", "b"]));
    op(a, { action: "text", itemId: "a", text: "Edited text" });
    op(b, { action: "done", itemId: "a", done: true });
    await Promise.all([state(a), state(b)]);
    saved = (await state(b)).objects.tasks;
    assert.deepEqual(saved.items.find((i: any) => i.id === "a"), { id: "a", text: "Edited text", done: true });
    op(a, { action: "title", text: "Shared title" }); await state(a);
    send(b, { type: "y-update", objects: [{ ...todo, x: 190 }] }); await state(b);
    saved = (await state(a)).objects.tasks;
    assert.equal(saved.x, 190); assert.equal(saved.title, "Shared title"); assert.equal(saved.items.length, 2);
    op(a, { action: "remove", itemId: "b" }); await state(a);
    op(b, { action: "text", itemId: "b", text: "Stale edit" });
    op(b, { action: "add", itemId: "a", text: "Duplicate delivery" }); await state(b);
    saved = (await state(a)).objects.tasks;
    assert.equal(saved.items.length, 1); assert.equal(saved.items[0].text, "Edited text");
    // Check persistence across an actual server restart, not just a cached client snapshot.
    for (const ws of sockets) ws.close();
    await app.close();
    app = createServer({ port: 0, host: "127.0.0.1", dataDir });
    address = await app.start(); base = `http://127.0.0.1:${address.port}`;
    const rejoined = await connect("Refresh");
    assert.deepEqual(rejoined.joined.state.objects.tasks, saved);
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
