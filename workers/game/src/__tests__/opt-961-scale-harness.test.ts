/**
 * OPT-961 scale harness. Each scenario runs in a child process with a 256 MB
 * heap cap and a 30 s timeout (see opt-961-scale-scenarios.ts). The test fails
 * naming the scenario and path when a child times out, dies at the heap cap,
 * or breaks its thresholds (FAST_LIMITS or SEARCH_LIMITS in
 * opt-961-scale-scenarios.ts).
 *
 * OPT-986 adds paired measurements for large static-filter/prohibition
 * failures and authored batch replacement scans, offers, and rechecks.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAST_LIMITS, PATHS, SCENARIOS } from "./opt-961-scale-scenarios.js";
import { rig } from "./opt-960-rig.js";
import { CARDS } from "./helpers.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import type { Cost } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { costNeedsPlayerSelection } from "../engine/effect-resolver/cost/payability.js";
import { costSelectionCount } from "../engine/effect-resolver/cost/targets.js";
import type { SimpleCost } from "../engine/effect-types.js";
import { processBatchReplacements, resumeReplacementBatch, scanReplacementsForBatch } from "../engine/replacements.js";
import { resolverExecutionServices } from "../engine/effect-resolver/index.js";
import { batchOfferOf } from "./trigger-window-helpers.js";

const MODULE = fileURLToPath(new URL("./opt-961-scale-scenarios.ts", import.meta.url));
const CWD = path.resolve(path.dirname(MODULE), "../..");
const TIMEOUT_MS = 30_000;

interface Row { medianMs: number; maxMs: number; heapDeltaMB: number; medianRatio: number }
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
        const ratio = r.medianRatio;
        table.push(`${s.id} ${p}: median ${r.medianMs.toFixed(2)} ms, max ${r.maxMs.toFixed(2)} ms, heap ${r.heapDeltaMB.toFixed(1)} MB, load ${out.loadMs?.toFixed(1)} ms, calibration ${out.calibrationMs?.toFixed(2)} ms, ratio ${ratio.toFixed(2)}`);
        if (LIMITS.medianRatio !== undefined && !(ratio <= LIMITS.medianRatio)) {
          failures.push(`${s.id} ${p}: median of paired sample/calibration ratios ${ratio.toFixed(2)} > ${LIMITS.medianRatio}`);
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

// OPT-986: a combinatorial failure must cost only a small multiple of copying
// the input. Pair every sample with calibration on both sides for loaded CI.

it("OPT-986 bounds choose-8-of-20 filter and prohibition failures", () => {
  for (const failure of ["filter", "prohibition"] as const) {
    const r = rig();
    for (let i = 0; i < 20; i++) r.put(`hand-${i}`, 0, "HAND");
    const source = r.put("source", 0, "CHARACTER");
    if (failure === "prohibition") r.state.prohibitions.push({
      id: "hold", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "hold",
      prohibitionType: "CANNOT_BE_RESTED", scope: { cause: "ANY" },
      duration: { type: "THIS_TURN" }, controller: 0, appliesTo: [source.instanceId], usesRemaining: null,
    });
    const costs: Cost[] = [{ type: "TRASH_FROM_HAND", amount: 8 }, failure === "filter"
      ? { type: "TRASH_FROM_HAND", amount: 1, filter: { name: "missing" } }
      : { type: "REST_CARDS", amount: 1 }];
    const timed = (fn: () => void) => { const start = performance.now(); fn(); return performance.now() - start; };
    const calibrate = () => { for (let i = 0; i < 20; i++) JSON.parse(JSON.stringify(r.state)); };
    const ratios: number[] = [];
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = timed(calibrate);
      const elapsed = timed(() => expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(false));
      const after = timed(calibrate);
      times.push(elapsed);
      ratios.push(elapsed / ((before + after) / 2));
    }
    const ratio = ratios.sort((a, b) => a - b)[1];
    process.stderr.write(`OPT986 ${failure}: median ratio ${ratio.toFixed(2)}, samples ms ${times.map(t => t.toFixed(2)).join(", ")}\n`);
    expect(ratio, failure).toBeLessThan(60);
  }
}, 60_000);

// Runtime payment defaults unknown amounts to one; a scale survey must not.
function surveyedSelectionCount(cost: SimpleCost): number {
  return typeof cost.amount === "number" ? costSelectionCount(cost) : Infinity;
}

it("OPT-986 survey fails closed on nonnumeric selection amounts", () => {
  const costs: SimpleCost[] = [
    { type: "TRASH_FROM_HAND", amount: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } },
    { type: "TRASH_FROM_HAND" },
    { type: "REST_CARDS", amount: "ANY_NUMBER" },
  ];
  for (const cost of costs) expect(surveyedSelectionCount(cost)).toBe(Infinity);
  expect(surveyedSelectionCount({ type: "TRASH_FROM_HAND", amount: 3 })).toBe(3);
});

it("OPT-986 surveys authored selections before later costs", () => {
  const rows: string[] = [];
  let max = 0;
  const inspect = (id: string, costs: Cost[]) => {
    costs.forEach((cost, index) => {
      const suffix = costs.slice(index + 1);
      if (cost.type === "CHOICE") cost.options.forEach(branch => inspect(id, [...branch, ...suffix]));
      else if (cost.type === "CHOOSE_ONE_COST") (cost.options ?? []).forEach(option => inspect(id, [option, ...suffix]));
      else if (suffix.length && costNeedsPlayerSelection(cost)) {
        const amount = surveyedSelectionCount(cost as SimpleCost);
        max = Math.max(max, amount);
        rows.push(`${id}:${cost.type}:${amount}`);
      }
    });
  };
  const walk = (id: string, value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(item => walk(id, item)); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === "costs" && Array.isArray(child)) inspect(id, child as Cost[]);
      else walk(id, child);
    }
  };
  const schemas = getAllAuthoredSchemas();
  // OP13-001's sole ANY_NUMBER cost has no suffix and is not a card selection.
  // It remains outside this survey of card selections before later costs.
  expect(schemas["OP13-001"].effects[0].costs).toEqual([{ type: "REST_DON", amount: "ANY_NUMBER" }]);
  expect(costNeedsPlayerSelection(schemas["OP13-001"].effects[0].costs![0])).toBe(false);
  Object.entries(schemas).forEach(([id, schema]) => walk(id, schema));
  process.stderr.write(`OPT986 survey schemas=${Object.keys(schemas).length} selections=${rows.length} max=${max}: ${rows.join(", ")}\n`);
  expect(rows.filter(row => Number(row.split(":")[2]) > 2),
    "New >2 selection: rerun and extend the scale scenarios").toEqual(["OP17-038:REST_CARDS:3"]);
});

it.each([1, 5])("OPT-986 batch recheck with %i authored matches and five targets", (matches) => {
  const r = rig();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) ids.push(r.put(i < matches ? "OP15-105" : "OP01-006", 0, "CHARACTER", { data: { power: 5000 } }).instanceId);
  r.life(0, 2);
  const offer = () => processBatchReplacements(r.state, ids, "KO", "WOULD_BE_REMOVED_FROM_FIELD", "effect", 1, r.db, resolverExecutionServices);
  const offered = offer();
  // OPT-963: the offer is a REPLACEMENT_BATCH frame the prompt names; its batch state machine is the resume context.
  const ctx = batchOfferOf(offered);
  expect(ctx.pendingMatches).toHaveLength(matches);
  expect(ctx.pendingMatches.every(match => match.matchedTargetIds.length === 5)).toBe(true);
  // Recheck an already-scanned offer after the available Life has been spent.
  const depleted = structuredClone(r.state);
  depleted.players[0].life = [];
  const expired = () => resumeReplacementBatch(depleted, ctx, true, r.db, resolverExecutionServices);
  expect(expired().protectedIds).toHaveLength(0);
  const accepted = () => resumeReplacementBatch(r.state, ctx, true, r.db, resolverExecutionServices);
  expect(accepted().protectedIds).toHaveLength(5);
  for (const [name, work] of Object.entries({
    scan: () => scanReplacementsForBatch(r.state, ids, "WOULD_BE_REMOVED_FROM_FIELD", "effect", 1, r.db, resolverExecutionServices),
    offer, accepted, expired,
  })) {
    const timed = (fn: () => unknown) => { const start = performance.now(); fn(); return performance.now() - start; };
    const calibrate = () => { for (let i = 0; i < 20; i++) JSON.parse(JSON.stringify(r.state)); };
    for (let i = 0; i < 3; i++) work();
    const ratios: number[] = [];
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const before = timed(calibrate);
      const elapsed = timed(work);
      const after = timed(calibrate);
      times.push(elapsed);
      ratios.push(elapsed / ((before + after) / 2));
    }
    const ratio = ratios.sort((a, b) => a - b)[7];
    const ms = times.sort((a, b) => a - b)[7];
    process.stderr.write(`OPT986 batch matches=${matches} targets=5 ${name}: median=${ms.toFixed(3)}ms ratio=${ratio.toFixed(3)}\n`);
    expect(ratio, name).toBeLessThan(60);
  }
});

it("OPT-986 measures OP17-038 authored three-card prefix", () => {
  const r = rig();
  for (let i = 0; i < 5; i++) r.put("OP01-006", 0, "CHARACTER");
  // Seven field cards is the largest legal Leader + Character + Stage pool.
  r.state.players[0].stage = { ...r.state.players[0].leader, cardId: CARDS.STAGE.id, instanceId: "stage", zone: "STAGE" };
  const source = r.put("OP17-038", 0, "HAND");
  const choice = getAllAuthoredSchemas()["OP17-038"].effects[0].costs![0];
  if (choice.type !== "CHOICE") throw new Error("expected authored cost branches");
  const costs = choice.options[1];
  expect(costs).toEqual([
    { type: "REST_CARDS", amount: 3, filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] } },
    { type: "REST_DON", amount: 1 },
  ]);
  const timed = (fn: () => unknown) => { const start = performance.now(); fn(); return performance.now() - start; };
  const calibrate = () => { for (let i = 0; i < 20; i++) JSON.parse(JSON.stringify(r.state)); };
  const ratios: number[] = [];
  const times: number[] = [];
  for (let i = 0; i < 15; i++) {
    const before = timed(calibrate);
    const elapsed = timed(() => expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(true));
    const after = timed(calibrate);
    times.push(elapsed);
    ratios.push(elapsed / ((before + after) / 2));
  }
  const ratio = ratios.sort((a, b) => a - b)[7];
  process.stderr.write(`OPT986 OP17-038: median=${times.sort((a, b) => a - b)[7].toFixed(3)}ms ratio=${ratio.toFixed(3)}\n`);
  expect(ratio).toBeLessThan(60);
  r.state.players[0].donCostArea = [];
  expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
});
