/**
 * OPT-961 scale harness, child-process entry. A plain module, not a test file
 * (importing a `*.test.ts` file re-registers its suites in every importer).
 *
 * Usage: node --expose-gc --max-old-space-size=256 --import tsx \
 *          opt-961-scale-scenarios.ts <scenarioId>
 *
 * Builds one scenario state (player 0: 30 or fewer trash, 28 hand, 20 deck),
 * round-trips it through SessionRepository save/load, then times the four
 * feasibility call sites on the loaded state. Prints one `OPT961_RESULT {json}`
 * line. Set OPT961_SKIP_CORRECTNESS=1 to record (not assert) the outcomes.
 */
import type { CardData, CardInstance, GameState } from "../types.js";
import type { Cost, EffectBlock, EffectSchema } from "../engine/effect-types.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { validate } from "../engine/validation.js";
import { canOfferTrigger } from "../engine/effect-damage.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

export interface ScenarioDef {
  id: string;
  costs: Cost[];
  trash: number;
  sourceState: "ACTIVE" | "RESTED";
  payable: boolean;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: "S1", costs: [{ type: "PLACE_FROM_TRASH_TO_DECK", amount: 20 }], trash: 30, sourceState: "ACTIVE", payable: true },
  { id: "S1u", costs: [{ type: "PLACE_FROM_TRASH_TO_DECK", amount: 20 }], trash: 19, sourceState: "ACTIVE", payable: false },
  { id: "S2", costs: [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "REST_SELF" }], trash: 30, sourceState: "ACTIVE", payable: true },
  { id: "S3", costs: [{ type: "PLACE_HAND_TO_DECK", amount: 2 }, { type: "REST_SELF" }], trash: 30, sourceState: "RESTED", payable: false },
  { id: "S4", costs: [{ type: "TRASH_FROM_HAND", amount: 20 }, { type: "PLACE_FROM_TRASH_TO_DECK", amount: 20 }], trash: 30, sourceState: "ACTIVE", payable: true },
  { id: "S5", costs: [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1 }], trash: 0, sourceState: "ACTIVE", payable: true },
];

export const PATHS = ["availability", "validate", "resolveEffect", "canOfferTrigger"] as const;
type PathName = (typeof PATHS)[number];

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [k, v] of Object.entries(entries)) this.data.set(k, structuredClone(v));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

const SRC_ID = "OPT961-SOURCE";
const TRIG_ID = "OPT961-TRIGGER";
const ACTIVATE_ID = "opt961_activate";

function schema(id: string, effects: EffectBlock[]): EffectSchema {
  return { card_id: id, card_name: id, card_type: "Character", effects } as EffectSchema;
}

function activateBlock(costs: Cost[]): EffectBlock {
  return { id: ACTIVATE_ID, category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs, actions: [{ type: "DRAW", params: { amount: 1 } }] } as EffectBlock;
}
function optionalBlock(costs: Cost[]): EffectBlock {
  return { id: "opt961_optional", category: "auto", trigger: { keyword: "ON_PLAY" }, flags: { optional: true }, costs, actions: [{ type: "DRAW", params: { amount: 1 } }] } as EffectBlock;
}
function triggerBlock(costs: Cost[]): EffectBlock {
  return { id: "opt961_trigger", category: "auto", trigger: { keyword: "TRIGGER" }, flags: { optional: true }, costs, actions: [{ type: "DRAW", params: { amount: 1 } }] } as EffectBlock;
}

function build(def: ScenarioDef) {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  state = { ...state, eventLog: [] };
  let serial = 0;
  const inst = (cardId: string, zone: CardInstance["zone"], cardState: CardInstance["state"] = "ACTIVE"): CardInstance => ({
    instanceId: `${cardId}#${serial++}`,
    cardId,
    controller: 0,
    owner: 0,
    zone,
    state: cardState,
    attachedDon: [],
    turnPlayed: 0,
  });
  const p0 = state.players[0];
  p0.deck = [];
  for (let i = 0; i < 20; i++) p0.deck.push(inst(CARDS.VANILLA.id, "DECK"));
  for (let i = 0; i < 28; i++) p0.hand.push(inst(CARDS.VANILLA.id, "HAND"));
  for (let i = 0; i < def.trash; i++) p0.trash.push(inst(CARDS.VANILLA.id, "TRASH"));

  db.set(SRC_ID, { ...CARDS.VANILLA, id: SRC_ID, name: SRC_ID, effectText: "", effectSchema: schema(SRC_ID, [activateBlock(def.costs)]) } as CardData);
  db.set(TRIG_ID, {
    ...CARDS.VANILLA,
    id: TRIG_ID,
    name: TRIG_ID,
    effectText: "",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    effectSchema: schema(TRIG_ID, [triggerBlock(def.costs)]),
  } as CardData);

  const source = inst(SRC_ID, "CHARACTER", def.sourceState);
  p0.characters[p0.characters.findIndex((slot) => !slot)] = source;
  state = registerCardEnteredField(state, source, db.get(SRC_ID)!);
  return { db, state, source };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main() {
  const id = process.argv[2];
  const def = SCENARIOS.find((s) => s.id === id);
  if (!def) throw new Error(`unknown scenario ${id}`);
  const skip = process.env.OPT961_SKIP_CORRECTNESS === "1";
  // Engine logging goes to stdout; keep stdout for the result line only.
  console.log = (...a: unknown[]) => console.error(...a);

  const built = build(def);
  const repo = new SessionRepository(new MemoryStorage(), { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
  await repo.save({ state: built.state, cardDb: built.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
  const loadTimes: number[] = [];
  let loaded = await repo.load();
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    loaded = await repo.load();
    loadTimes.push(performance.now() - t0);
  }
  if (!loaded) throw new Error("load returned null");
  const state = loaded.state;
  const db = loaded.cardDb;
  const sourceId = state.players[0].characters.find((c) => c?.cardId === SRC_ID)!.instanceId;
  const optional = optionalBlock(def.costs);

  const calls: Record<PathName, () => unknown> = {
    availability: () => computeEffectAvailability(state, db)[sourceId]?.find((e) => e.effectId === ACTIVATE_ID),
    validate: () => validate(state, { type: "ACTIVATE_EFFECT", cardInstanceId: sourceId, effectId: ACTIVATE_ID }, db, 0),
    resolveEffect: () => resolveEffect(state, optional, sourceId, 0, db).pendingPrompt?.options.promptType ?? null,
    canOfferTrigger: () => canOfferTrigger(state, TRIG_ID, db, 0, sourceId),
  };

  const differs: string[] = [];
  const check = (path: PathName, got: unknown) => {
    const a = got as { status?: string; reason?: string } | null | string | boolean | undefined;
    let ok: boolean;
    if (path === "availability") {
      const e = a as { status?: string; reason?: string } | undefined;
      ok = def.payable ? e?.status === "usable" : e?.status === "blocked" && e?.reason === "COST";
    } else if (path === "validate") {
      ok = def.payable ? a === null : a === "Cost cannot be paid";
    } else if (path === "resolveEffect") {
      ok = def.payable ? a === "OPTIONAL_EFFECT" : a === null;
    } else {
      ok = a === def.payable;
    }
    if (!ok) differs.push(`${id}/${path}: got ${JSON.stringify(got)}, expected ${def.payable ? "payable" : "unpayable"}`);
  };

  const results: Record<string, { medianMs: number; maxMs: number; heapDeltaMB: number }> = {};
  for (const path of PATHS) {
    const fn = calls[path];
    for (let i = 0; i < 3; i++) fn();
    check(path, fn());
    (globalThis as { gc?: () => void }).gc?.();
    const baseline = process.memoryUsage().heapUsed;
    let peak = baseline;
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      fn();
      times.push(performance.now() - t0);
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }
    results[path] = {
      medianMs: median(times),
      maxMs: Math.max(...times),
      heapDeltaMB: (peak - baseline) / (1024 * 1024),
    };
  }
  if (!skip && differs.length > 0) {
    process.stdout.write(`OPT961_RESULT ${JSON.stringify({ id, error: `correctness: ${differs.join("; ")}` })}\n`);
    return;
  }
  process.stdout.write(`OPT961_RESULT ${JSON.stringify({ id, loadMs: median(loadTimes), results, differs })}\n`);
}

const isEntry = process.argv[1]?.endsWith("opt-961-scale-scenarios.ts");
if (isEntry) {
  main().catch((err) => {
    process.stderr.write(`${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
