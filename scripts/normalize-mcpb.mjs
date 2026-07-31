#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = process.argv[2];
if (!path || !path.endsWith(".mcpb")) {
  throw new Error("Usage: node scripts/normalize-mcpb.mjs <bundle.mcpb>");
}

const file = resolve(path);
const data = readFileSync(file);
const eocd = findSignature(data, 0x06054b50);
const entries = data.readUInt16LE(eocd + 10);
let central = data.readUInt32LE(eocd + 16);

// ZIP uses packed DOS timestamps. 1980-01-01 00:00 is the earliest valid
// value and does not depend on the build machine's clock or timezone.
const fixedTime = 0;
const fixedDate = 33;

for (let i = 0; i < entries; i++) {
  requireSignature(data, central, 0x02014b50, "central directory");
  data.writeUInt16LE(fixedTime, central + 12);
  data.writeUInt16LE(fixedDate, central + 14);

  const local = data.readUInt32LE(central + 42);
  requireSignature(data, local, 0x04034b50, "local header");
  data.writeUInt16LE(fixedTime, local + 10);
  data.writeUInt16LE(fixedDate, local + 12);

  const nameLength = data.readUInt16LE(central + 28);
  const extraLength = data.readUInt16LE(central + 30);
  const commentLength = data.readUInt16LE(central + 32);
  central += 46 + nameLength + extraLength + commentLength;
}

writeFileSync(file, data);
console.log(`Normalized ${entries} ZIP timestamps in ${file}`);

function findSignature(buffer, signature) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === signature) return i;
  }
  throw new Error("The MCPB does not contain a valid ZIP end-of-directory record.");
}

function requireSignature(buffer, offset, expected, label) {
  if (offset < 0 || offset + 4 > buffer.length || buffer.readUInt32LE(offset) !== expected) {
    throw new Error(`Invalid ZIP ${label} at offset ${offset}.`);
  }
}
