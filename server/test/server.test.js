const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, hashPassword, verifyPassword, mergeDocument, parseFrames, encodeFrame } = require('../index.js');

test('password hashing uses a salted scrypt digest', () => {
  const encoded = hashPassword('swordfish');
  assert.match(encoded, /^scrypt\$/);
  assert.equal(verifyPassword('swordfish', encoded), true);
  assert.equal(verifyPassword('wrong', encoded), false);
  assert.equal(verifyPassword('', null), true);
});

test('document updates merge object and rich text values', () => {
  const first = mergeDocument({ objects: {}, richText: {}, clock: 0 }, { objects: [{ id: 'a', kind: 'note', x: 1, y: 2, width: 100, height: 80, text: 'hello' }] });
  const second = mergeDocument(first, { objects: [{ id: 'b', kind: 'link', x: 0, y: 0, width: 200, height: 120, url: 'https://example.com' }], richText: { doc1: { type: 'doc', content: [] } } });
  assert.equal(second.clock, 2); assert.equal(second.objects.a.text, 'hello'); assert.equal(second.objects.b.url, 'https://example.com'); assert.deepEqual(second.richText.doc1, { type: 'doc', content: [] });
});

test('websocket frames round trip', () => {
  const frame = encodeFrame(JSON.stringify({ type: 'ping' })); const parsed = parseFrames(frame); assert.equal(parsed.frames.length, 1); assert.equal(parsed.frames[0].payload.toString(), '{"type":"ping"}'); assert.equal(parsed.rest.length, 0);
});

test('room creation, password join and asset lifecycle', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spatial-server-')); const app = createServer({ port: 0, host: '127.0.0.1', dataDir }); let address; try { address = await app.start(); } catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('network sockets disabled in this environment'); throw error; } t.after(() => app.close()); const base = `http://127.0.0.1:${address.port}`;
  let response = await fetch(base + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test room', password: 'secret' }) }); assert.equal(response.status, 201); const room = await response.json(); assert.equal(room.requiresPassword, true);
  response = await fetch(`${base}/api/rooms/${room.roomId}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'bad', nickname: 'Alice' }) }); assert.equal(response.status, 401);
  response = await fetch(`${base}/api/rooms/${room.roomId}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret', nickname: 'Alice' }) }); assert.equal(response.status, 200); const session = await response.json(); assert.ok(session.token);
  response = await fetch(`${base}/api/rooms/${room.roomId}/assets?filename=hello.txt`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-session-token': session.token }, body: 'hello' }); assert.equal(response.status, 201); const asset = await response.json();
  response = await fetch(base + asset.url); assert.equal(response.status, 200); assert.equal(await response.text(), 'hello');
});
