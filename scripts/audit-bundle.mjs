#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "packages/bundle/.mcpb-build");
const server = join(stage, "server");
const entry = join(server, "standalone/server.js");

if (!existsSync(entry)) throw new Error("Build the staged bundle before auditing it.");

const top = readdirSync(stage).sort();
const allowedTop = ["manifest.json", "server"];
if (
  top.some(
    (name) =>
      !allowedTop.includes(name) &&
      name !== "inventory.json" &&
      name !== "sbom.cdx.json",
  )
) {
  throw new Error(`Unexpected top-level bundle content: ${top.join(", ")}`);
}
for (const forbidden of ["src", "test", "scripts", "manifest.json"]) {
  if (existsSync(join(server, forbidden))) {
    throw new Error(`Packaged server contains forbidden development path: ${forbidden}`);
  }
}

const forbiddenNames = new Set([
  ".env",
  "alerts.json",
  "session.enc",
  "vault.key",
]);
for (const path of walk(stage)) {
  const name = basename(path);
  if (forbiddenNames.has(name) || /\.(pem|p12|pfx|key)$/i.test(name)) {
    throw new Error(`Packaged server contains sensitive file: ${relative(stage, path)}`);
  }
  if (path.startsWith(join(server, "standalone")) && /\.(map|d\.ts)$/i.test(name)) {
    throw new Error(`Packaged application contains build metadata: ${relative(stage, path)}`);
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    const target = realpathSync(path);
    if (!target.startsWith(server + "/")) {
      throw new Error(`Symlink escapes packaged server: ${relative(stage, path)}`);
    }
  }
}

const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(server, "package.json"), "utf8"));
const components = JSON.parse(
  readFileSync(join(root, "packages/bundle/.standalone-components.json"), "utf8"),
);
if (manifest.version !== pkg.version) {
  throw new Error(`Manifest ${manifest.version} does not match package ${pkg.version}.`);
}
if (manifest.server?.entry_point !== "server/standalone/server.js") {
  throw new Error("Manifest entry point does not match the audited runtime.");
}
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
  throw new Error("Packaged standalone server declares external runtime dependencies.");
}

const inventory = {
  application: { name: pkg.name, version: pkg.version },
  packages: components,
};
writeFileSync(join(stage, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${uuidV5(JSON.stringify(inventory))}`,
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: pkg.name,
      version: pkg.version,
      "bom-ref": `pkg:npm/${purlName(pkg.name)}@${pkg.version}`,
    },
  },
  components: inventory.packages.map(({ name, version }) => ({
    type: "library",
    name,
    version,
    purl: `pkg:npm/${purlName(name)}@${version}`,
    "bom-ref": `pkg:npm/${purlName(name)}@${version}`,
  })),
};
writeFileSync(join(stage, "sbom.cdx.json"), JSON.stringify(sbom, null, 2) + "\n");
console.log(`Bundle audit clean: ${inventory.packages.length} production packages inventoried.`);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    yield path;
    if (entry.isDirectory() && !entry.isSymbolicLink()) yield* walk(path);
  }
}

function purlName(name) {
  return name.startsWith("@") ? `%40${name.slice(1)}` : name;
}

function uuidV5(name) {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const bytes = createHash("sha1")
    .update(namespace)
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
