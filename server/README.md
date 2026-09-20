# Spatial collaboration server

Dependency-free Node 24 server for the collaboration prototype. It exposes HTTP room/session/asset APIs and a small RFC 6455 WebSocket endpoint at `/ws`.

## Run

```bash
node server/server.js                 # listens on 127.0.0.1:8787
PORT=8787 STATIC_DIR=dist node server/server.js
node --test server/test/server.test.js
```

Node 24's built-in `node:sqlite` stores `server/data/spatial.sqlite` (WAL mode). On older Node versions the same API transparently uses an in-memory fallback; set `SPATIAL_DATA_DIR` to choose a data directory.

## HTTP API

- `POST /api/rooms` body `{ "name": "Design", "password": "optional" }` → `{ roomId, shareUrl, requiresPassword }`.
- `POST /api/rooms/:roomId/join` body `{ "password": "...", "nickname": "Ada", "color": "#8b5cf6" }` → short-lived session token and `websocketUrl`.
- `GET /api/rooms/:roomId/state` returns the current canvas document.
- `POST /api/rooms/:roomId/assets` sends image bytes with `Content-Type` and optional `X-Filename`, authenticated by `X-Session-Token` or `Authorization: Bearer ...`.
- `GET /api/rooms/:roomId/assets/:assetId` returns the stored bytes.

## WebSocket protocol

Connect to the `websocketUrl` from join. The server sends `joined` with the initial document and participant list. Send `sync-step1` to request `sync-step2`; send `y-update` with `{ objects: CanvasObject[] | Record<string, CanvasObject>, richText?: Record<string, unknown>, deletedObjects?: string[] }` to merge document state; send `awareness` with cursor/selection to broadcast presence. Presence and awareness are ephemeral and are never persisted. The document clock increments for each update and the latest document is persisted.
