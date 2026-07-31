#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputs = [0, 1].map((n) =>
  join(tmpdir(), `open-state-camping-${randomUUID()}-${n}.mcpb`),
);

try {
  const hashes = outputs.map((output) => {
    run("node", ["packages/bundle/scripts/build-mcpb.mjs"]);
    run("node", ["scripts/audit-bundle.mjs"]);
    run("pnpm", [
      "exec",
      "mcpb",
      "pack",
      "packages/bundle/.mcpb-build",
      output,
    ]);
    run("node", ["scripts/normalize-mcpb.mjs", output]);
    return createHash("sha256").update(readFileSync(output)).digest("hex");
  });
  if (hashes[0] !== hashes[1]) {
    throw new Error(`Bundle builds differ: ${hashes[0]} != ${hashes[1]}`);
  }
  console.log(`Reproducible MCPB SHA-256: ${hashes[0]}`);
} finally {
  for (const output of outputs) rmSync(output, { force: true });
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}
