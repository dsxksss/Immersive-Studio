/** Shared wire contracts for the Spatial collaboration prototype. */
export type CanvasObject =
  | { id: string; kind: "note"; x: number; y: number; width: number; height: number; text: string }
  | { id: string; kind: "richText"; x: number; y: number; width: number; height: number; documentId: string }
  | { id: string; kind: "image"; x: number; y: number; width: number; height: number; assetId: string }
  | { id: string; kind: "link"; x: number; y: number; width: number; height: number; url: string; title?: string };

export type AwarenessState = {
  sessionId: string;
  nickname: string;
  color: string;
  cursor?: { x: number; y: number };
  selection?: { objectId?: string; from?: number; to?: number };
  updatedAt: number;
};

export type RoomDocument = {
  objects: Record<string, CanvasObject>;
  richText: Record<string, unknown>;
  clock: number;
};

export type ClientMessage =
  | { type: "join"; roomId: string; sessionId?: string; nickname?: string; color?: string }
  | { type: "sync-step1"; clock?: number }
  | { type: "sync-step2"; clock: number; state: RoomDocument }
  | { type: "y-update"; clock?: number; update?: Partial<RoomDocument> | { objects?: CanvasObject[]; richText?: Record<string, unknown> }; objects?: CanvasObject[]; richText?: Record<string, unknown>; deletedObjects?: string[] }
  | { type: "awareness"; state: AwarenessState }
  | { type: "presence"; state: AwarenessState }
  | { type: "leave" };

export type ServerMessage =
  | { type: "joined"; roomId: string; sessionId: string; participants: AwarenessState[]; state: RoomDocument }
  | { type: "sync-step2"; clock: number; state: RoomDocument }
  | { type: "y-update"; clock: number; update: Partial<RoomDocument> }
  | { type: "awareness"; state: AwarenessState }
  | { type: "presence"; state: AwarenessState; action: "join" | "update" | "leave" }
  | { type: "error"; code: string; message: string };
