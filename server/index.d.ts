export type ServerOptions = { port?: number; host?: string; dataDir?: string; staticDir?: string };
export type CollaborationServer = { server: import('node:http').Server; start(): Promise<import('node:net').AddressInfo>; close(): Promise<void> };
export function createServer(options?: ServerOptions): CollaborationServer;
export function hashPassword(password: string, salt?: Buffer): string | null;
export function verifyPassword(password: string, encoded: string | null): boolean;
