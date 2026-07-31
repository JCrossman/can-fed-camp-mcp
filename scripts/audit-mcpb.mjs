#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "packages/bundle/.mcpb-build");
const archive = join(root, "packages/bundle/open-state-camping.mcpb");
const packed = unzipSync(readFileSync(archive));
const expected = new Map();

for (const path of walk(stage)) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to attest a staged symlink: ${relative(stage, path)}`);
  }
  if (stat.isFile()) {
    expected.set(relative(stage, path).split(sep).join("/"), readFileSync(path));
  }
}

const names = Object.keys(packed).sort();
const expectedNames = [...expected.keys()].sort();
if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
  throw new Error(
    `Packed paths differ from audited stage.\nExpected: ${expectedNames.join(", ")}\n` +
      `Actual: ${names.join(", ")}`,
  );
}
for (const name of names) {
  if (
    name.startsWith("/") ||
    name.includes("\\") ||
    name.split("/").includes("..")
  ) {
    throw new Error(`Unsafe path in packed bundle: ${name}`);
  }
  const actual = Buffer.from(packed[name]);
  const wanted = expected.get(name);
  if (!wanted || !actual.equals(wanted)) {
    throw new Error(`Packed content differs from audited stage: ${name}`);
  }
}

const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
console.log(`Packed MCPB matches audited stage (${names.length} files, SHA-256 ${digest}).`);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) yield* walk(path);
    else yield path;
  }
}
