/**
 * OPT-961 scale harness. Each scenario runs in a child process with a 256 MB
 * heap cap and a 20 s timeout (see opt-961-scale-scenarios.ts). The test fails
 * naming the scenario and path when a child times out, dies at the heap cap,
 * or breaks its thresholds (FAST_LIMITS or SEARCH_LIMITS in
 * opt-961-scale-scenarios.ts).
 *
 * Residual (follow-up): when a large selection is followed by a suffix that
 * fails for a reason the sequence prune does not read (a filter or a
 * prohibition), the lazy search still enumerates every combination. S3b pins
 * the 2-of-28 case; no authored card selects more than 2 before a later cost.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAST_LIMITS, PATHS, SCENARIOS } from "./opt-961-scale-scenarios.js";

const MODULE = fileURLToPath(new URL("./opt-961-scale-scenarios.ts", import.meta.url));
const CWD = path.resolve(path.dirname(MODULE), "../..");
const TIMEOUT_MS = 20_000;

interface Row { medianMs: number; maxMs: number; heapDeltaMB: number }
interface Child { id: string; loadMs?: number; calibrationMs?: number; results?: Record<string, Row>; error?: string }

describe("OPT-961 cost-sequence feasibility scale harness", () => {
  it("every scenario and path stays within time and heap limits", () => {
    const failures: string[] = [];
    const table: string[] = [];
    for (const s of SCENARIOS) {
      const run = spawnSync(
        process.execPath,
        ["--expose-gc", "--max-old-space-size=256", "--import", "tsx", MODULE, s.id],
        { cwd: CWD, timeout: TIMEOUT_MS, encoding: "utf8", env: process.env, killSignal: "SIGKILL" },
      );
      if (run.error || run.status !== 0) {
        const why = run.error ? `timed out or failed to run (${run.error.message})` : `exited ${run.status} signal ${run.signal} (heap cap or crash)`;
        const err = String(run.stderr);
        const fatal = err.split("\n").find((l) => /FATAL ERROR|out of memory|Error:/.test(l)) ?? err.slice(-200);
        failures.push(`${s.id} (all paths): ${why}: ${fatal.trim()}`);
        continue;
      }
      const line = String(run.stdout).split("\n").find((l) => l.startsWith("OPT961_RESULT "));
      if (!line) { failures.push(`${s.id}: no result line\n${String(run.stderr).slice(-600)}`); continue; }
      const out = JSON.parse(line.slice("OPT961_RESULT ".length)) as Child;
      if (out.error || !out.results) { failures.push(`${s.id}: ${out.error ?? "no results"}`); continue; }
      const LIMITS = s.limits ?? FAST_LIMITS;
      for (const p of PATHS) {
        const r = out.results[p];
        const ratio = r.medianMs / (out.calibrationMs ?? Number.NaN);
        table.push(`${s.id} ${p}: median ${r.medianMs.toFixed(2)} ms, max ${r.maxMs.toFixed(2)} ms, heap ${r.heapDeltaMB.toFixed(1)} MB, load ${out.loadMs?.toFixed(1)} ms, calibration ${out.calibrationMs?.toFixed(2)} ms, ratio ${ratio.toFixed(2)}`);
        if (LIMITS.medianRatio !== undefined && !(ratio <= LIMITS.medianRatio)) {
          failures.push(`${s.id} ${p}: median/calibration ${ratio.toFixed(2)} > ${LIMITS.medianRatio}`);
        }
        if (r.medianMs > LIMITS.medianMs) failures.push(`${s.id} ${p}: median ${r.medianMs.toFixed(1)} ms > ${LIMITS.medianMs} ms`);
        if (r.maxMs > LIMITS.maxMs) failures.push(`${s.id} ${p}: max ${r.maxMs.toFixed(1)} ms > ${LIMITS.maxMs} ms`);
        if (r.heapDeltaMB > LIMITS.heapDeltaMB) failures.push(`${s.id} ${p}: heap delta ${r.heapDeltaMB.toFixed(1)} MB > ${LIMITS.heapDeltaMB} MB`);
      }
    }
    if (process.env.OPT961_VERBOSE) process.stderr.write(`${table.join("\n")}\n`);
    expect(failures, `OPT-961 scale failures:\n${failures.join("\n")}`).toEqual([]);
  }, 120_000);
});
