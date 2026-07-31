import { build } from "esbuild";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "standalone");
const output = join(outputDir, "server.js");

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
const result = await build({
  entryPoints: [join(root, "src/server.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  metafile: true,
});

let code = readFileSync(output, "utf8").replace(/^#!.*\n/gm, "");
code =
  "#!/usr/bin/env node\n" +
  "import { createRequire as __createRequire } from 'node:module';\n" +
  "const require = __createRequire(import.meta.url);\n" +
  code;
writeFileSync(output, code, { mode: 0o755 });
const application = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const components = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const pkg = findPackage(resolve(root, input));
  if (pkg && pkg.name !== application.name) {
    components.set(`${pkg.name}@${pkg.version}`, {
      name: pkg.name,
      version: pkg.version,
    });
  }
}
writeFileSync(
  join(root, ".standalone-components.json"),
  JSON.stringify(
    [...components.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    ),
    null,
    2,
  ) + "\n",
);
console.log("Built standalone server at", output);

function findPackage(input) {
  let dir = dirname(input);
  const filesystemRoot = parse(dir).root;
  while (dir !== filesystemRoot) {
    const path = join(dir, "package.json");
    if (existsSync(path)) {
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      if (typeof pkg.name === "string" && typeof pkg.version === "string") {
        return { name: pkg.name, version: pkg.version };
      }
    }
    dir = dirname(dir);
  }
  return null;
}
