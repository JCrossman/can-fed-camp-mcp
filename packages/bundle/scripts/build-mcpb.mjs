/**
 * Stage a self-contained .mcpb from the reviewed pnpm lockfile.
 *
 * The standalone server contains its complete runtime dependency graph, built
 * by esbuild from the frozen workspace. No registry resolution or install is
 * performed inside the artifact build.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, ".mcpb-build");
const serverDir = join(stage, "server");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (pkg.version !== manifest.version) {
  throw new Error(
    `Version mismatch: package.json is ${pkg.version}, manifest.json is ${manifest.version}.`,
  );
}
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
  throw new Error("The standalone package must not declare external runtime dependencies.");
}

const entry = join(serverDir, "standalone", "server.js");
rmSync(stage, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });
cpSync(join(root, "standalone"), join(serverDir, "standalone"), {
  recursive: true,
});
cpSync(join(root, "package.json"), join(serverDir, "package.json"));
cpSync(join(root, "README.md"), join(serverDir, "README.md"));
if (!existsSync(entry)) {
  throw new Error(`Standalone bundle is missing ${entry}`);
}
cpSync(join(root, "manifest.json"), join(stage, "manifest.json"));
console.log("Staged standalone .mcpb contents at", stage);
