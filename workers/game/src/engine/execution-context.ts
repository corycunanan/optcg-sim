import type {
  EngineExecutionContext,
  EngineExecutionContextV1,
  EngineExecutionContextV2,
  EngineRandomStream,
  EngineRandomStreamCounters,
  GameState,
} from "../types.js";
import { chacha20Block, sha256Words } from "./secure-random.js";

const DEFAULT_ACTION_BUDGET = 1_000;

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function randomHex(words: number): string {
  const bytes = new Uint32Array(words);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(8, "0")).join("");
}

/** Execution-context versions the engine can execute (OPT-888). */
export const SUPPORTED_EXECUTION_CONTEXT_VERSIONS = [1, 2] as const;
/**
 * Version new contexts are created at. Stays 1 until the version 2 reader is
 * deployed and verified (SAVED-STATE-COMPATIBILITY.md §5.1, "Engine RNG
 * version 2"); the writer PR raises it.
 */
export const WRITTEN_EXECUTION_CONTEXT_VERSION: EngineExecutionContext["version"] = 1;

export const ENGINE_RANDOM_STREAMS = ["pregame", "deck0", "deck1", "blindHand"] as const satisfies
  readonly EngineRandomStream[];

/** The stream every shuffle of `playerIndex`'s deck draws from. */
export function deckRandomStream(playerIndex: 0 | 1): EngineRandomStream {
  return playerIndex === 0 ? "deck0" : "deck1";
}

function emptyStreamCounters(): EngineRandomStreamCounters {
  return { pregame: 0, deck0: 0, deck1: 0, blindHand: 0 };
}

interface ExecutionContextOptions {
  gameId?: string;
  clockEpochMs?: number;
  traceId?: string;
  actionLimit?: number;
  /** RNG algorithm version; defaults to WRITTEN_EXECUTION_CONTEXT_VERSION. */
  version?: EngineExecutionContext["version"];
}

export function createDeterministicExecutionContext(
  seed: string,
  options: ExecutionContextOptions = {},
): EngineExecutionContext {
  const gameId = options.gameId ?? seed;
  const rest = {
    idCounter: 0,
    clockEpochMs: options.clockEpochMs ?? 0,
    clockCounter: 0,
    actionBudget: { limit: options.actionLimit ?? DEFAULT_ACTION_BUDGET, consumed: 0 },
    trace: { gameId, traceId: options.traceId ?? `trace-${hashSeed(seed).toString(16)}` },
  };
  const version = options.version ?? WRITTEN_EXECUTION_CONTEXT_VERSION;
  // Key order is persisted byte order: version 1 keeps its pre-OPT-888 layout
  // (opt-940 writer golden).
  if (version === 2) return { version: 2, seed, rngCounters: emptyStreamCounters(), ...rest };
  return { version: 1, seed, rngState: hashSeed(seed), ...rest };
}

/**
 * Production-only entropy/time adapter. All engine consumers use the persisted
 * result. The seed is 128 bits from the platform CSPRNG; the trace id is drawn
 * separately so diagnostics never carry seed material (OPT-888).
 */
export function createProductionExecutionContext(
  gameId: string,
  options: Pick<ExecutionContextOptions, "version"> = {},
): EngineExecutionContext {
  const seed = randomHex(4);
  return createDeterministicExecutionContext(seed, {
    gameId,
    clockEpochMs: Date.now(),
    traceId: `trace-${randomHex(2)}`,
    version: options.version,
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

function nextMulberry32(
  context: EngineExecutionContextV1,
): { context: EngineExecutionContextV1; value: number } {
  // Version 1 (OPT-477). Its whole stream follows from one 32-bit state, so a
  // player's own shuffles can reveal it (OPT-888). Kept unchanged so version 1
  // games resume and replay byte-for-byte.
  const rngState = (context.rngState + 0x6d2b79f5) >>> 0;
  let value = rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const normalized = ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  return { context: { ...context, rngState }, value: normalized };
}

// ─── Version 2 RNG (OPT-888) ─────────────────────────────────────────────────
//
// ChaCha20 (RFC 8439) keyed by SHA-256("optcg-sim/engine-rng/v2\0" + seed).
// Each stream is its own nonce, and its persisted counter is the number of
// 32-bit keystream words consumed. Outputs of one stream reveal nothing about
// the key, the seed, or any other stream; recovering any of them means breaking
// ChaCha20 with a 256-bit key derived from the 128-bit production seed.

const RNG_V2_KEY_DOMAIN = "optcg-sim/engine-rng/v2\0";
/** "optc" — fixed nonce word that pins the stream space to this engine. */
const RNG_V2_NONCE_TAG = 0x6374706f;
const WORDS_PER_BLOCK = 16;
const WORDS_PER_DRAW = 2;
const MAX_KEY_CACHE_ENTRIES = 64;
const keyCache = new Map<string, Uint32Array>();

function byteSwap(word: number): number {
  return (
    ((word & 0xff) << 24) | ((word & 0xff00) << 8) | ((word >>> 8) & 0xff00) | (word >>> 24)
  ) >>> 0;
}

/** ChaCha20 key words for `seed`; the SHA-256 digest bytes read little-endian. */
export function deriveRngV2Key(seed: string): Uint32Array {
  const cached = keyCache.get(seed);
  if (cached) return cached;
  const digest = sha256Words(new TextEncoder().encode(RNG_V2_KEY_DOMAIN + seed));
  const key = digest.map(byteSwap);
  if (keyCache.size >= MAX_KEY_CACHE_ENTRIES) {
    const oldest = keyCache.keys().next().value;
    if (oldest !== undefined) keyCache.delete(oldest);
  }
  keyCache.set(seed, key);
  return key;
}

function streamNonce(stream: EngineRandomStream): [number, number, number] {
  return [ENGINE_RANDOM_STREAMS.indexOf(stream) + 1, RNG_V2_NONCE_TAG, 2];
}

function nextChaCha20(
  context: EngineExecutionContextV2,
  stream: EngineRandomStream,
): { context: EngineExecutionContextV2; value: number } {
  const counter = context.rngCounters[stream];
  const block = chacha20Block(
    deriveRngV2Key(context.seed),
    Math.floor(counter / WORDS_PER_BLOCK),
    streamNonce(stream),
  );
  // Counters advance in pairs from 0, so a draw never straddles a block.
  const offset = counter % WORDS_PER_BLOCK;
  const high = block[offset] >>> 11;
  const low = block[offset + 1];
  // 53 uniform bits: every double in [0, 1) with spacing 2^-53.
  const value = (high * 0x1_0000_0000 + low) / 2 ** 53;
  return {
    context: {
      ...context,
      rngCounters: { ...context.rngCounters, [stream]: counter + WORDS_PER_DRAW },
    },
    value,
  };
}

/**
 * Next value in [0, 1). `stream` names what the draw is for; version 2 keeps
 * each stream independent, version 1 has a single shared stream and ignores it.
 */
export function nextContextRandom(
  context: EngineExecutionContext,
  stream: EngineRandomStream,
): { context: EngineExecutionContext; value: number } {
  switch (context.version) {
    case 1:
      return nextMulberry32(context);
    case 2:
      return nextChaCha20(context, stream);
    default: {
      const unknown: never = context;
      throw new Error(
        `Unsupported execution context version ${(unknown as { version: unknown }).version}`,
      );
    }
  }
}

export function shuffleWithContext<T>(
  context: EngineExecutionContext,
  values: readonly T[],
  stream: EngineRandomStream,
): { context: EngineExecutionContext; values: T[] } {
  const shuffled = [...values];
  let current = context;
  for (let index = shuffled.length - 1; index > 0; index--) {
    const next = nextContextRandom(current, stream);
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

export function takeEngineRandom(
  state: GameState,
  stream: EngineRandomStream,
): { state: GameState; value: number } {
  const current = ensureExecutionContext(state);
  const next = nextContextRandom(current.executionContext, stream);
  return { state: { ...current, executionContext: next.context }, value: next.value };
}

export function shuffleWithEngineContext<T>(
  state: GameState,
  values: readonly T[],
  stream: EngineRandomStream,
): { state: GameState; values: T[] } {
  const current = ensureExecutionContext(state);
  const shuffled = shuffleWithContext(current.executionContext, values, stream);
  return { state: { ...current, executionContext: shuffled.context }, values: shuffled.values };
}
