import type { EngineExecutionContext, GameState } from "../types.js";

const DEFAULT_ACTION_BUDGET = 1_000;

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function seedBytes(): string {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function createDeterministicExecutionContext(
  seed: string,
  options: { gameId?: string; clockEpochMs?: number; traceId?: string; actionLimit?: number } = {},
): EngineExecutionContext {
  const gameId = options.gameId ?? seed;
  return {
    version: 1,
    seed,
    rngState: hashSeed(seed),
    idCounter: 0,
    clockEpochMs: options.clockEpochMs ?? 0,
    clockCounter: 0,
    actionBudget: { limit: options.actionLimit ?? DEFAULT_ACTION_BUDGET, consumed: 0 },
    trace: { gameId, traceId: options.traceId ?? `trace-${hashSeed(seed).toString(16)}` },
  };
}

/** Production-only entropy/time adapter. All engine consumers use the persisted result. */
export function createProductionExecutionContext(gameId: string): EngineExecutionContext {
  const seed = seedBytes();
  return createDeterministicExecutionContext(seed, {
    gameId,
    clockEpochMs: Date.now(),
    traceId: `trace-${seed.slice(0, 16)}`,
  });
}

/**
 * Hydrates snapshots created before OPT-477 without consulting ambient state.
 * The fresh context's counter is raised past every engine id already in the
 * state (OPT-891) so later allocations cannot reuse a live identity.
 */
export function ensureExecutionContext(state: GameState): GameState {
  if (state.executionContext) return state;
  return reconcileExecutionContextIdCounter({
    ...state,
    executionContext: createDeterministicExecutionContext(`legacy:${state.id}`, {
      gameId: state.id,
    }),
  });
}

// ─── Id counter invariant (OPT-891) ──────────────────────────────────────────
//
// Every engine id is `${namespace}_${counter in base 36, padded to 8}` drawn
// from the single shared `idCounter`. Invariant: `idCounter` is >= the counter
// of every engine id present in the state. A context built or restored with a
// lower counter would re-issue a live id; see
// docs/game-engine/ZONE-TRANSITION-CONTRACT.md "Instance-id uniqueness".

/** Every namespace passed to the allocators. Parsing ignores other prefixes. */
export const ENGINE_ID_NAMESPACES = [
  "card",
  "don",
  "ef",
  "blind",
  "trigger",
  "active-effect",
  "prohibition",
  "battle",
  "scheduled-action",
  "one-time-modifier",
  "prompt",
] as const;
export type EngineIdNamespace = (typeof ENGINE_ID_NAMESPACES)[number];

const ENGINE_ID_NAMESPACE_SET: ReadonlySet<string> = new Set(ENGINE_ID_NAMESPACES);
// Exactly the allocator's 8-digit padding. A counter needs a ninth digit only
// past 36^8 (~2.8e12) allocations, so wider suffixes are never engine ids —
// e.g. the schema keys "don_requirement" and "trigger_activated".
const ENGINE_ID_PATTERN = /^([a-z][a-z-]*)_([0-9a-z]{8})$/;

/** Counter encoded in an allocator-format id, or null for any other string. */
export function parseEngineIdCounter(id: string): number | null {
  const match = ENGINE_ID_PATTERN.exec(id);
  if (!match || !ENGINE_ID_NAMESPACE_SET.has(match[1])) return null;
  const counter = Number.parseInt(match[2], 36);
  return Number.isSafeInteger(counter) ? counter : null;
}

/**
 * Highest allocator counter among the state's structural ids: card and DON!!
 * instance ids in every zone (attached DON!! included), runtime registry ids,
 * effect-stack frame ids, the prompt id and the battle id. One O(state) pass;
 * call it when a context is constructed or restored, never per allocation.
 */
export function maxEngineIdCounter(state: GameState): number {
  let max = 0;
  const visit = (id: string | null | undefined) => {
    if (typeof id !== "string") return;
    const counter = parseEngineIdCounter(id);
    if (counter !== null && counter > max) max = counter;
  };
  const visitCard = (card: { instanceId: string; attachedDon?: readonly { instanceId: string }[] } | null) => {
    if (!card) return;
    visit(card.instanceId);
    for (const don of card.attachedDon ?? []) visit(don.instanceId);
  };
  for (const player of state.players ?? []) {
    if (!player) continue;
    visitCard(player.leader);
    visitCard(player.stage);
    for (const card of player.characters ?? []) visitCard(card);
    for (const zone of [player.hand, player.deck, player.trash, player.removedFromGame]) {
      for (const card of zone ?? []) visitCard(card);
    }
    for (const card of player.life ?? []) visit(card.instanceId);
    for (const don of [...(player.donDeck ?? []), ...(player.donCostArea ?? [])]) {
      visit(don.instanceId);
    }
  }
  for (const records of [
    state.activeEffects,
    state.prohibitions,
    state.scheduledActions,
    state.oneTimeModifiers,
    state.triggerRegistry,
    state.effectStack,
  ] as ReadonlyArray<ReadonlyArray<{ id?: string }> | undefined>) {
    for (const record of records ?? []) visit(record?.id);
  }
  visit(state.pendingPrompt?.promptId);
  visit(state.turn?.battle?.battleId);
  return max;
}

/**
 * Restores the id-counter invariant: raises `idCounter` to the highest engine
 * id already present. Returns the same state object when the invariant holds,
 * which is always the case for a state the engine itself produced.
 */
export function reconcileExecutionContextIdCounter(state: GameState): GameState {
  const context = state.executionContext;
  if (!context) return state;
  const floor = maxEngineIdCounter(state);
  if (context.idCounter >= floor) return state;
  return { ...state, executionContext: { ...context, idCounter: floor } };
}

export function allocateContextId(
  context: EngineExecutionContext,
  namespace: EngineIdNamespace,
): { context: EngineExecutionContext; id: string } {
  const idCounter = context.idCounter + 1;
  return {
    context: { ...context, idCounter },
    id: `${namespace}_${idCounter.toString(36).padStart(8, "0")}`,
  };
}

export function nextContextTimestamp(
  context: EngineExecutionContext,
): { context: EngineExecutionContext; timestamp: number } {
  const timestamp = context.clockEpochMs + context.clockCounter;
  return {
    context: { ...context, clockCounter: context.clockCounter + 1 },
    timestamp,
  };
}

export function nextContextRandom(
  context: EngineExecutionContext,
): { context: EngineExecutionContext; value: number } {
  // Mulberry32: compact, stable across JS runtimes, and sufficient once seeded
  // unpredictably at the GameSession boundary.
  const rngState = (context.rngState + 0x6d2b79f5) >>> 0;
  let value = rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const normalized = ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  return { context: { ...context, rngState }, value: normalized };
}

export function shuffleWithContext<T>(
  context: EngineExecutionContext,
  values: readonly T[],
): { context: EngineExecutionContext; values: T[] } {
  const shuffled = [...values];
  let current = context;
  for (let index = shuffled.length - 1; index > 0; index--) {
    const next = nextContextRandom(current);
    current = next.context;
    const swapIndex = Math.floor(next.value * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return { context: current, values: shuffled };
}

export function allocateEngineId(
  state: GameState,
  namespace: EngineIdNamespace,
): { state: GameState; id: string } {
  const current = ensureExecutionContext(state);
  const allocated = allocateContextId(current.executionContext, namespace);
  return { state: { ...current, executionContext: allocated.context }, id: allocated.id };
}

export function takeEngineTimestamp(
  state: GameState,
): { state: GameState; timestamp: number } {
  const current = ensureExecutionContext(state);
  const next = nextContextTimestamp(current.executionContext);
  return { state: { ...current, executionContext: next.context }, timestamp: next.timestamp };
}

export function allocateEngineRecord(
  state: GameState,
  namespace: EngineIdNamespace,
): { state: GameState; id: string; timestamp: number } {
  const allocated = allocateEngineId(state, namespace);
  const stamped = takeEngineTimestamp(allocated.state);
  return { state: stamped.state, id: allocated.id, timestamp: stamped.timestamp };
}

export function takeEngineRandom(state: GameState): { state: GameState; value: number } {
  const current = ensureExecutionContext(state);
  const next = nextContextRandom(current.executionContext);
  return { state: { ...current, executionContext: next.context }, value: next.value };
}

export function shuffleWithEngineContext<T>(
  state: GameState,
  values: readonly T[],
): { state: GameState; values: T[] } {
  const current = ensureExecutionContext(state);
  const shuffled = shuffleWithContext(current.executionContext, values);
  return { state: { ...current, executionContext: shuffled.context }, values: shuffled.values };
}
