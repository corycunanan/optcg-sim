#!/usr/bin/env node

/**
 * Compatibility entry point for the runtime-backed schema validator.
 *
 * The validator intentionally imports compiled TypeScript schema objects via
 * tsx. It does not rewrite/evaluate source text with regular expressions.
 */

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const repoRoot = resolve(__dirname, "../../../../../");
const cli = resolve(__dirname, "schema-lint-cli.ts");
const args = ["--import", "tsx", cli, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
