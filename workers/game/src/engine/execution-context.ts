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

/** Hydrates snapshots created before OPT-477 without consulting ambient state. */
export function ensureExecutionContext(state: GameState): GameState {
  if (state.executionContext) return state;
  return {
    ...state,
    executionContext: createDeterministicExecutionContext(`legacy:${state.id}`, {
      gameId: state.id,
    }),
  };
}

export function allocateContextId(
  context: EngineExecutionContext,
  namespace: string,
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
  namespace: string,
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
  namespace: string,
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
