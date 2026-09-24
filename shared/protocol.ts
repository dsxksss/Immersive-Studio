/** Shared wire contracts for the Spatial collaboration prototype. */

export type Point = { x: number; y: number };

export type Stroke = {
  tool: string;
  points: Point[];
  color: string;
  size: number;
};

export type CanvasObjectBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  folderId?: string;
  zIndex?: number;
  pins?: Array<{ id: string; x: number; y: number }>;
};

export type NoteObject = CanvasObjectBase & {
  kind: "note";
  text: string;
  color?: string;
};

export type RichTextObject = CanvasObjectBase & {
  kind: "richText";
  title?: string;
  documentId?: string;
  content?: string;
  richTextVersion?: number;
};

export type ImageObject = CanvasObjectBase & {
  kind: "image";
  assetId?: string;
  src?: string;
  caption?: string;
};

export type LinkObject = CanvasObjectBase & {
  kind: "link";
  url: string;
  title?: string;
  description?: string;
};

export type FolderObject = CanvasObjectBase & {
  kind: "folder";
  title?: string;
};

export type ArtboardObject = CanvasObjectBase & {
  kind: "artboard";
  title?: string;
  strokes?: Stroke[];
};

export type EdgePort = "left" | "right" | "top" | "bottom" | `pin:${string}`;

export type Edge = {
  id: string;
  fromId: string;
  toId: string;
  fromPort?: EdgePort;
  toPort?: EdgePort;
  relation?: "related" | "parent";
};

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoObject = CanvasObjectBase & {
  kind: "todo";
  title?: string;
  items: TodoItem[];
  todoVersion?: number;
};

export type CanvasObject =
  | NoteObject
  | RichTextObject
  | ImageObject
  | LinkObject
  | FolderObject
  | ArtboardObject
  | TodoObject
  | (CanvasObjectBase & { kind: "pin"; title?: string });

export type AwarenessState = {
  sessionId: string;
  nickname: string;
  color: string;
  cursor?: Point;
  selection?: { objectId?: string; from?: number; to?: number };
  updatedAt: number;
};

export type RoomDocument = {
  objects: Record<string, CanvasObject>;
  richText: Record<string, unknown>;
  edges?: Edge[];
  clock: number;
};

export type DocumentUpdate = {
  objects?: CanvasObject[] | Record<string, CanvasObject>;
  richText?: Record<string, unknown>;
  deletedObjects?: string[];
  edges?: Edge[];
  deletedEdges?: string[];
};

/** WebRTC signaling payload relayed by the WebSocket server. */
export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } | null };

export type SignalMessage = {
  type: "signal";
  roomId: string;
  fromSessionId: string;
  toSessionId?: string;
  payload: SignalPayload;
};

export type TodoOperation =
  | { action: "add" | "text"; itemId: string; text: string }
  | { action: "done"; itemId: string; done: boolean }
  | { action: "remove"; itemId: string }
  | { action: "title"; text: string };

export type RichTextOperation = { action: "content" | "title"; text: string };

export type ClientMessage =
  | { type: "rich-text-operation"; objectId: string; operation: RichTextOperation }
  | { type: "todo-operation"; objectId: string; operation: TodoOperation }
  | { type: "join"; roomId: string; sessionId?: string; nickname?: string; color?: string }
  | { type: "sync-step1"; clock?: number }
  | { type: "sync-step2"; clock: number; state: RoomDocument }
  | {
      type: "y-update";
      clock?: number;
      update?: Partial<RoomDocument> | DocumentUpdate;
      objects?: CanvasObject[] | Record<string, CanvasObject>;
      richText?: Record<string, unknown>;
      deletedObjects?: string[];
    }
  | { type: "awareness"; state: AwarenessState }
  | { type: "presence"; state: AwarenessState }
  | SignalMessage
  | { type: "leave" };

export type ServerMessage =
  | {
      type: "joined";
      roomId: string;
      sessionId: string;
      participants: AwarenessState[];
      /** Session ids of peers already in the room (for dialing P2P). */
      peerSessionIds: string[];
      state: RoomDocument;
    }
  | { type: "sync-step2"; clock: number; state: RoomDocument }
  | {
      type: "y-update";
      clock: number;
      update: Partial<RoomDocument> | DocumentUpdate;
      objects?: CanvasObject[];
      richText?: Record<string, unknown>;
      edges?: Edge[];
      deletedEdges?: string[];
    }
  | { type: "awareness"; state: AwarenessState }
  | { type: "presence"; state: AwarenessState; action: "join" | "update" | "leave" }
  | SignalMessage
  | { type: "error"; code: string; message: string };

export type ServerOptions = {
  port?: number;
  host?: string;
  dataDir?: string;
  staticDir?: string;
};

export type CollaborationServer = {
  server: import("node:http").Server;
  start(): Promise<import("node:net").AddressInfo>;
  close(): Promise<void>;
};
