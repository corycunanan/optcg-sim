#!/usr/bin/env node

/** Compatibility entry point for the runtime-backed disposition gate. */

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const repoRoot = resolve(__dirname, "../../../../../");
const workerRoot = resolve(repoRoot, "workers/game");
const vitest = resolve(repoRoot, "node_modules/.bin/vitest");
const test = "src/__tests__/opt-471-authored-schema-gate.test.ts";
const result = spawnSync(vitest, ["run", test, "-t", "low-confidence"], {
  cwd: workerRoot,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
