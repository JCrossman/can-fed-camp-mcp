#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { verifyPersistentToolSession } from "./smoke-session.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "packages/bundle/.mcpb-build");
const entry = join(stage, "server/standalone/server.js");
const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8"));
const home = mkdtempSync(join(tmpdir(), "open-state-bundle-smoke-"));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  env: { ...process.env, OPEN_STATE_HOME: home },
  stderr: "pipe",
});
const client = new Client({ name: "bundle-smoke", version: "1.0.0" });
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);
  const expected = manifest.tools.map((tool) => tool.name).sort();
  await verifyPersistentToolSession(client, expected, {
    live: process.env["OPEN_STATE_LIVE_SMOKE"] === "1",
  });
} finally {
  await client.close().catch(() => {});
  rmSync(home, { recursive: true, force: true });
}
if (stderr.trim()) {
  throw new Error(`Packaged server wrote to stderr:\n${stderr}`);
}
console.log(
  `Bundle smoke test clean: ${manifest.tools.length} tools persisted across sequential calls.`,
);
