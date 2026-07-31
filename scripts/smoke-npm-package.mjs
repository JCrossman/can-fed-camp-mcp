#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "open-state-npm-smoke-"));
const home = join(work, "home");
const install = join(work, "install");
const npmCli = join(root, "node_modules/npm/bin/npm-cli.js");
const pkg = JSON.parse(
  readFileSync(join(root, "packages/bundle/package.json"), "utf8"),
);
const tarball = join(
  work,
  `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`,
);
const manifest = JSON.parse(
  readFileSync(join(root, "packages/bundle/manifest.json"), "utf8"),
);

try {
  execFileSync(
    process.execPath,
    [npmCli, "pack", "./packages/bundle", "--pack-destination", work],
    { cwd: root, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [
      npmCli,
      "install",
      tarball,
      "--prefix",
      install,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    { cwd: root, stdio: "inherit" },
  );

  const entry = join(
    install,
    "node_modules/@open-state/camping/standalone/server.js",
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, OPEN_STATE_HOME: home },
    stderr: "pipe",
  });
  const client = new Client({ name: "npm-smoke", version: "1.0.0" });
  try {
    await client.connect(transport);
    const actual = (await client.listTools()).tools.map((tool) => tool.name).sort();
    const expected = manifest.tools.map((tool) => tool.name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("The installed npm package exposed an unexpected tool set.");
    }
  } finally {
    await client.close().catch(() => {});
  }

  execFileSync(
    process.execPath,
    [
      npmCli,
      "uninstall",
      pkg.name,
      "--prefix",
      install,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (existsSync(join(install, `node_modules/${pkg.name}`))) {
    throw new Error("npm uninstall left the package installed.");
  }
  console.log("npm package smoke test clean: pack, install, stdio, and uninstall passed.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
