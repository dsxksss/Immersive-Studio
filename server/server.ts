#!/usr/bin/env node
/**
 * Compatibility entry point used by npm scripts and Docker.
 * Serves the lightweight client directly in dev; deployments may point
 * STATIC_DIR to a built Vite dist.
 */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "./index";

const defaultClient = path.resolve(__dirname, "../client");
const distClient = path.resolve(__dirname, "../../client");
const staticDir = process.env.STATIC_DIR || (fs.existsSync(defaultClient) ? defaultClient : distClient);
const instance = createServer({ staticDir });
instance.start().then((address) => {
  console.log(`Spatial collaboration server listening on http://${address.address}:${address.port}`);
});
