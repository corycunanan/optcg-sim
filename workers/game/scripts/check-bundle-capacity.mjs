import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const GZIP_BUDGET_BYTES = 1024 * 1024;
const outdir = mkdtempSync(join(tmpdir(), "optcg-game-bundle-"));

try {
  const wrangler = resolve("node_modules/.bin/wrangler");
  const result = spawnSync(
    wrangler,
    ["deploy", "--dry-run", "--outdir", outdir],
    { encoding: "utf8", env: { ...process.env, XDG_CONFIG_HOME: outdir } }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const bundle = readFileSync(join(outdir, "index.js"));
  const gzipBytes = gzipSync(bundle, { level: 9 }).byteLength;
  console.log(
    `Game Worker bundle: ${bundle.byteLength} raw bytes, ${gzipBytes} gzip bytes ` +
      `(budget ${GZIP_BUDGET_BYTES}).`
  );
  if (gzipBytes > GZIP_BUDGET_BYTES) {
    console.error(
      "Game Worker bundle exceeds its documented gzip capacity budget."
    );
    process.exitCode = 1;
  }
} finally {
  rmSync(outdir, { recursive: true, force: true });
}
