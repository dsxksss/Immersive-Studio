import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../index";

test("pin connections and layers persist; concurrent parent choices cannot create cycles", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spatial-relations-"));
  let app = createServer({ port: 0, host: "127.0.0.1", dataDir });
  const sockets: WebSocket[] = [];
  const send = (ws: WebSocket, message: unknown) => ws.send(JSON.stringify(message));
  function next(ws: WebSocket, type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.removeEventListener("message", receive); reject(new Error(type + " timeout")); }, 4000);
      function receive(event: MessageEvent) {
        const message = JSON.parse(String(event.data));
        if (message.type !== type) return;
        clearTimeout(timer); ws.removeEventListener("message", receive); resolve(message);
      }
      ws.addEventListener("message", receive);
    });
  }
  async function state(ws: WebSocket) {
    const pending = next(ws, "sync-step2"); send(ws, { type: "sync-step1" }); return (await pending).state;
  }
  try {
    let address = await app.start();
    let base = `http://127.0.0.1:${address.port}`;
    const room = await (await fetch(base + "/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Relations test", password: "test-only" }) })).json() as any;
    async function connect(nickname: string) {
      const session = await (await fetch(base + `/api/rooms/${room.roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname, password: "test-only" }) })).json() as any;
      const ws = new WebSocket(base.replace("http", "ws") + session.websocketUrl);
      sockets.push(ws);
      const messages: any[] = [];
      ws.addEventListener("message", event => messages.push(JSON.parse(String(event.data))));
      const joined = await next(ws, "joined"); return { ws, messages, joined };
    }
    const a = await connect("A"), b = await connect("B");
    const points = [{ id: "top", x: 0.25, y: 0.2 }, { id: "end", x: 0.9, y: 0.8 }];
    const nodes = [
      { id: "a", kind: "pin", x: 100, y: 100, width: 32, height: 32, zIndex: 3, title: "Pin" },
      { id: "b", kind: "richText", x: 400, y: 120, width: 300, height: 220, zIndex: 1, pins: points, title: "Document", content: "<p>Preserved content</p>", richTextVersion: 0 },
      { id: "c", kind: "folder", x: 700, y: 120, width: 260, height: 180, zIndex: 2, title: "Folder" },
    ];
    send(a.ws, { type: "y-update", objects: nodes }); await state(a.ws);

    const ab = { id: "ab", fromId: "a", toId: "b", fromPort: "right", toPort: "pin:top", relation: "parent" };
    const ba = { id: "ba", fromId: "b", toId: "a", fromPort: "pin:end", toPort: "left", relation: "parent" };
    // Both participants choose a parent using the same graph before either receives the other edit.
    send(a.ws, { type: "y-update", edges: [ab] });
    send(b.ws, { type: "y-update", edges: [ba] });
    await Promise.all([state(a.ws), state(b.ws)]);
    let saved = await state(a.ws);
    assert.equal(saved.edges.length, 2);
    assert.equal(saved.edges.filter((edge: any) => edge.relation === "parent").length, 1);
    assert.equal(saved.edges.filter((edge: any) => edge.relation === "related").length, 1);
    assert.equal(saved.edges.find((edge: any) => edge.id === "ab").toPort, "pin:top");
    assert.equal(saved.edges.find((edge: any) => edge.id === "ba").fromPort, "pin:end");
    for (const client of [a, b]) {
      assert.ok(client.messages.some(message => message.type === "y-update" && Array.isArray(message.edges) && !Object.hasOwn(message, "objects")), "sender receives an edge-only canonical acknowledgement");
      assert.ok(client.messages.some(message => message.edges?.length === 2 && message.edges.filter((edge: any) => edge.relation === "parent").length === 1), "both peers receive the acyclic graph");
    }

    const parent = saved.edges.find((edge: any) => edge.relation === "parent");
    const second = { id: "second", fromId: parent.toId, toId: "c", fromPort: "bottom", toPort: "top", relation: "parent" };
    send(a.ws, { type: "y-update", edges: [second] }); await state(a.ws);
    send(b.ws, { type: "y-update", edges: [{ id: "cycle", fromId: "c", toId: parent.fromId, relation: "parent" }] }); await state(b.ws);
    saved = await state(a.ws);
    assert.equal(saved.edges.find((edge: any) => edge.id === "cycle").relation, "related", "transitive parent cycle is normalized");
    const reversed = { ...parent, fromId: parent.toId, toId: parent.fromId, fromPort: parent.toPort, toPort: parent.fromPort };
    send(a.ws, { type: "y-update", edges: [reversed] }); await state(a.ws);
    saved = await state(a.ws);
    assert.deepEqual(saved.edges.find((edge: any) => edge.id === parent.id), reversed, "reversing an edge excludes its old direction from cycle detection");

    // Reordering a document must retain both its custom attachment coordinates and edited content.
    send(a.ws, { type: "y-update", objects: [{ ...nodes[1], zIndex: 9, content: "stale" }] }); await state(a.ws);
    saved = await state(a.ws);
    assert.deepEqual(saved.objects.b.pins, points);
    assert.equal(saved.objects.b.zIndex, 9);
    assert.equal(saved.objects.b.content, "<p>Preserved content</p>");
    for (const ws of sockets) ws.close();
    await app.close();
    app = createServer({ port: 0, host: "127.0.0.1", dataDir });
    address = await app.start(); base = `http://127.0.0.1:${address.port}`;
    const refreshed = await connect("Refresh");
    assert.deepEqual(refreshed.joined.state.objects, saved.objects);
    assert.deepEqual(refreshed.joined.state.edges, saved.edges);

    const beforePinDelete = saved.objects.b;
    const atTopPin = (edge: any) => (edge.fromId === "b" && edge.fromPort === "pin:top") || (edge.toId === "b" && edge.toPort === "pin:top");
    const attachedEdges = saved.edges.filter(atTopPin);
    assert.ok(attachedEdges.length > 0);
    send(refreshed.ws, { type: "y-update", objects: [{ ...beforePinDelete, pins: points.filter(point => point.id !== "top") }] });
    saved = await state(refreshed.ws);
    assert.ok(saved.edges.every((edge: any) => !atTopPin(edge)), "removing an attached pin removes its existing lines while the panel remains");
    assert.ok(saved.objects.b);
    const afterPinDeleteEdges = saved.edges;
    send(refreshed.ws, { type: "y-update", edges: [
      { id: "late-attached-in", fromId: "a", toId: "b", toPort: "pin:top" },
      { id: "late-attached-out", fromId: "b", toId: "a", fromPort: "pin:top" },
    ] });
    saved = await state(refreshed.ws);
    assert.deepEqual(saved.edges, afterPinDeleteEdges, "late lines referencing either end of a removed attached pin are ignored");
    send(refreshed.ws, { type: "y-update", objects: [beforePinDelete], edges: attachedEdges });
    saved = await state(refreshed.ws);
    assert.deepEqual(saved.objects.b.pins, points);
    assert.deepEqual(saved.edges.filter(atTopPin), attachedEdges, "undo restores an attached pin and its lines atomically in one packet");

    send(refreshed.ws, { type: "y-update", deletedObjects: ["a"], edges: [{ id: "same-packet", fromId: "b", toId: "a", relation: "parent" }] });
    saved = await state(refreshed.ws);
    assert.ok(saved.edges.every((edge: any) => edge.fromId !== "a" && edge.toId !== "a"), "deleting a pin removes its attached edges and rejects a same-packet connection to it");
    const remainingEdges = saved.edges;
    const lateSender = await connect("Late sender");
    send(lateSender.ws, { type: "y-update", edges: [ab, ba] });
    const lateState = await state(lateSender.ws);
    assert.deepEqual(lateState.edges, remainingEdges, "late connection packets cannot restore either incoming or outgoing edges of a deleted pin");
    assert.deepEqual((await state(refreshed.ws)).edges, remainingEdges, "peers retain the graph after late edge packets");
    assert.ok(lateSender.messages.some(message => message.type === "y-update" && !Object.hasOwn(message, "objects") && JSON.stringify(message.edges) === JSON.stringify(remainingEdges)), "late sender receives canonical edge state to remove its optimistic orphan connection");
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
