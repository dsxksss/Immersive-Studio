#!/usr/bin/env node
// Compatibility entry point used by npm scripts and Docker.
const path = require('node:path');
const app = require('./index.js');
module.exports = app;
if (require.main === module) {
  // Serve the lightweight client directly in dev; deployments may point STATIC_DIR to a built Vite dist.
  const staticDir = process.env.STATIC_DIR || path.resolve(__dirname, '../client');
  const instance = app.createServer({ staticDir });
  instance.start().then((address) => console.log(`Spatial collaboration server listening on http://${address.address}:${address.port}`));
}
