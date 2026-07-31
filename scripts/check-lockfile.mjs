#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");

const forbidden = [
  ["explicit tarball URL", /^\s+resolution:.*\btarball:/m],
  ["non-public package mirror", /visualstudio|packagefeed|ms-feed|pkgs\.dev\.azure/i],
  ["external sibling link", /link:.*the-open-state/i],
];
for (const [label, pattern] of forbidden) {
  if (pattern.test(lock)) throw new Error(`Lockfile contains ${label}.`);
}
if (
  !lock.includes("specifier: 1.0.1") ||
  !lock.includes("version: 1.0.1(puppeteer-core@25.3.0)")
) {
  throw new Error("Lockfile does not resolve the exact reviewed @open-state/kit release.");
}
console.log("Lockfile uses registry-neutral integrity resolutions and exact security pins.");
