import { describe, expect, it } from "vitest";
import type { EngineExecutionContext, EngineExecutionContextV2, GameState } from "../types.js";
import {
  ENGINE_RANDOM_STREAMS,
  WRITTEN_EXECUTION_CONTEXT_VERSION,
  createDeterministicExecutionContext,
  createProductionExecutionContext,
  deckRandomStream,
  deriveRngV2Key,
  nextContextRandom,
  shuffleWithContext,
  shuffleWithEngineContext,
  takeEngineRandom,
} from "../engine/execution-context.js";
import { chacha20Block, sha256Words } from "../engine/secure-random.js";
import { applyMulligan, buildInitialState } from "../engine/setup.js";
import { createBlindHandSlots } from "../engine/effect-resolver/blind-hand-slots.js";
import { filterStateForPlayer } from "../engine/state.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { createTestPayload } from "./helpers.js";

const hex = (words: Uint32Array) =>
  [...words].map((word) => word.toString(16).padStart(8, "0")).join("");

function v2Context(seed = "0123456789abcdef0123456789abcdef"): EngineExecutionContextV2 {
  const context = createDeterministicExecutionContext(seed, { version: 2 });
  if (context.version !== 2) throw new Error("expected version 2");
  return context;
}

function v2Game(seed?: string): GameState {
  return buildInitialState(createTestPayload(), v2Context(seed)).state;
}

function counters(state: GameState) {
  if (state.executionContext.version !== 2) throw new Error("expected version 2");
  return state.executionContext.rngCounters;
}

/** The pre-OPT-888 generator, copied verbatim, to pin version 1 replay. */
function legacyMulberry32(seed: string, draws: number): number[] {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0 || 0x6d2b79f5;
  const values: number[] = [];
  for (let i = 0; i < draws; i++) {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    values.push(((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000);
  }
  return values;
}

function roundTrip(state: GameState): GameState {
  const { cardDb } = buildInitialState(createTestPayload());
  const wire = JSON.parse(
    JSON.stringify({
      state: toPersistedGameState(state),
      undoHistory: [toPersistedGameState(state)],
      cardDb: Object.fromEntries(cardDb),
    }),
  );
  return parseStoredSession(wire).state;
}

describe("OPT-888 primitives match their published test vectors", () => {
  it("SHA-256 (FIPS 180-4 examples)", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(hex(sha256Words(encode("")))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(hex(sha256Words(encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      hex(sha256Words(encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("ChaCha20 block function (RFC 8439 §2.3.2)", () => {
    const key = new Uint32Array(8);
    for (let i = 0; i < 8; i++) {
      key[i] = (4 * i) | ((4 * i + 1) << 8) | ((4 * i + 2) << 16) | ((4 * i + 3) << 24);
    }
    const block = chacha20Block(key, 1, [0x09000000, 0x4a000000, 0x00000000]);
    expect(hex(block)).toBe(
      "e4e7f110" + "15593bd1" + "1fdd0f50" + "c47120a3" +
      "c7f4d1c7" + "0368c033" + "9aaa2204" + "4e6cd4c3" +
      "466482d2" + "09aa9f07" + "05d7c214" + "a2028bd9" +
      "d19c12b5" + "b94e16de" + "e883d0cb" + "4e3c50a2",
    );
  });
});

describe("OPT-888 version 1 contexts keep the legacy generator", () => {
  it("still writes version 1 until the version 2 reader is deployed", () => {
    expect(WRITTEN_EXECUTION_CONTEXT_VERSION).toBe(1);
    expect(createDeterministicExecutionContext("seed").version).toBe(1);
    expect(createProductionExecutionContext("game").version).toBe(1);
  });

  it("replays the pre-change Mulberry32 stream byte-for-byte, whatever stream is named", () => {
    const expected = legacyMulberry32("legacy-seed", 12);
    let context: EngineExecutionContext = createDeterministicExecutionContext("legacy-seed", {
      version: 1,
    });
    const actual: number[] = [];
    for (let i = 0; i < 12; i++) {
      const next = nextContextRandom(context, ENGINE_RANDOM_STREAMS[i % ENGINE_RANDOM_STREAMS.length]);
      context = next.context;
      actual.push(next.value);
    }
    expect(actual).toEqual(expected);
  });
});

describe("OPT-888 version 2 generator", () => {
  it("keys ChaCha20 with 256 bits derived from the full seed", () => {
    const key = deriveRngV2Key("0123456789abcdef0123456789abcdef");
    expect(key).toHaveLength(8);
    // Seeds that collide under the old 32-bit FNV fold still get distinct keys:
    // every character of the seed feeds the key.
    expect(hex(deriveRngV2Key("a".repeat(32)))).not.toBe(hex(deriveRngV2Key("a".repeat(31) + "b")));
  });

  it("persists only even word counters per stream, never key material", () => {
    const context = v2Context();
    expect(context.rngCounters).toEqual({ pregame: 0, deck0: 0, deck1: 0, blindHand: 0 });
    expect(context).not.toHaveProperty("rngState");
    const next = nextContextRandom(context, "deck1");
    expect(next.context).toMatchObject({
      rngCounters: { pregame: 0, deck0: 0, deck1: 2, blindHand: 0 },
    });
    const keyHex = hex(deriveRngV2Key(context.seed));
    expect(JSON.stringify(next.context)).not.toContain(keyHex.slice(0, 16));
  });

  it("returns 53-bit values in [0, 1) and is deterministic for a seed", () => {
    const draw = (seed: string) => {
      let context: EngineExecutionContext = v2Context(seed);
      const values: number[] = [];
      for (let i = 0; i < 64; i++) {
        const next = nextContextRandom(context, "pregame");
        context = next.context;
        values.push(next.value);
      }
      return values;
    };
    const first = draw("seed-a");
    expect(draw("seed-a")).toEqual(first);
    expect(draw("seed-b")).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Number.isInteger(value * 2 ** 53)).toBe(true);
    }
    expect(new Set(first).size).toBe(first.length);
  });

  it("gives each stream its own keystream", () => {
    const deck = Array.from({ length: 50 }, (_, index) => index);
    const orders = ENGINE_RANDOM_STREAMS.map(
      (stream) => shuffleWithContext(v2Context(), deck, stream).values.join(","),
    );
    expect(new Set(orders).size).toBe(ENGINE_RANDOM_STREAMS.length);
  });

  it("maps each player's deck to its own stream", () => {
    expect(deckRandomStream(0)).toBe("deck0");
    expect(deckRandomStream(1)).toBe("deck1");
  });
});

describe("OPT-888 a player's own view has no predictive power over hidden draws", () => {
  it("setup shuffles each deck from its owner's stream only", () => {
    const state = v2Game();
    const { deck0, deck1, pregame, blindHand } = counters(state);
    expect(deck0).toBeGreaterThan(0);
    expect(deck1).toBeGreaterThan(0);
    expect(pregame).toBe(0);
    expect(blindHand).toBe(0);
  });

  it("the opponent's next shuffle is the same however often a player reshuffles their own deck", () => {
    const base = v2Game();
    const opponentShuffle = (state: GameState) =>
      shuffleWithEngineContext(state, state.players[1].deck, "deck1").values.map((card) => card.instanceId);
    const expected = opponentShuffle(base);

    // Player 0 sees every one of these orders in full; none of it touches deck1.
    let observed = base;
    for (let shuffles = 1; shuffles <= 4; shuffles++) {
      observed = applyMulligan(observed, 0);
      expect(counters(observed).deck1).toBe(counters(base).deck1);
      expect(counters(observed).deck0).toBeGreaterThan(counters(base).deck0);
      expect(opponentShuffle(observed)).toEqual(expected);
    }
  });

  it("under version 1, the same own-deck shuffles shift the opponent's shuffle (the OPT-888 defect)", () => {
    const base = buildInitialState(
      createTestPayload(),
      createDeterministicExecutionContext("seed", { version: 1 }),
    ).state;
    const opponentShuffle = (state: GameState) =>
      shuffleWithEngineContext(state, state.players[1].deck, "deck1").values.map((card) => card.instanceId);
    expect(opponentShuffle(applyMulligan(base, 0))).not.toEqual(opponentShuffle(base));
  });

  it("blind hand-slot permutations and pregame draws use their own streams", () => {
    const base = v2Game();
    const candidates = base.players[1].hand;
    const slots = createBlindHandSlots(base, candidates, 1);
    expect(counters(slots.state)).toEqual({
      ...counters(base),
      blindHand: 2 * (candidates.length - 1),
    });

    const coin = takeEngineRandom(base, "pregame");
    expect(counters(coin.state)).toEqual({ ...counters(base), pregame: 2 });
    // Mulligans on either side never move the blind-slot permutation.
    const afterMulligans = applyMulligan(applyMulligan(base, 0), 1);
    expect(
      createBlindHandSlots(afterMulligans, candidates, 1).blindSlots.map((slot) => slot.instanceId),
    ).toEqual(slots.blindSlots.map((slot) => slot.instanceId));
  });
});

describe("OPT-888 persistence and projection of version 2", () => {
  it("round-trips a version 2 context through the storage reader and resumes the same streams", () => {
    const state = applyMulligan(v2Game(), 0);
    const restored = roundTrip(state);
    expect(restored.executionContext).toEqual(state.executionContext);
    const continueFrom = (s: GameState) =>
      shuffleWithEngineContext(s, s.players[0].deck, "deck0").values.map((card) => card.instanceId);
    expect(continueFrom(restored)).toEqual(continueFrom(state));
  });

  it("still reads version 1 contexts", () => {
    const { state } = buildInitialState(createTestPayload());
    expect(state.executionContext.version).toBe(1);
    expect(roundTrip(state).executionContext).toEqual(state.executionContext);
  });

  it.each([
    ["an odd stream counter", { deck0: 3 }],
    ["a negative stream counter", { pregame: -2 }],
    ["an unknown stream", { extra: 0 }],
  ])("rejects a version 2 context with %s", (_label, patch) => {
    const state = v2Game();
    const broken = {
      ...state,
      executionContext: {
        ...state.executionContext,
        rngCounters: { ...counters(state), ...patch },
      },
    } as GameState;
    expect(() => roundTrip(broken)).toThrow();
  });

  it("rejects a version 2 context carrying a version 1 rngState, and unknown versions", () => {
    const state = v2Game();
    expect(() =>
      roundTrip({ ...state, executionContext: { ...state.executionContext, rngState: 1 } } as GameState),
    ).toThrow();
    expect(() =>
      roundTrip({ ...state, executionContext: { ...state.executionContext, version: 3 } } as unknown as GameState),
    ).toThrow();
  });

  it("redacts the seed and every stream position from both player views", () => {
    const state = applyMulligan(v2Game("ffeeddccbbaa99887766554433221100"), 1);
    for (const receivingPlayer of [0, 1] as const) {
      const view = filterStateForPlayer(state, receivingPlayer);
      expect(view.executionContext).toEqual({
        version: 2,
        seed: "redacted",
        rngCounters: { pregame: 0, deck0: 0, deck1: 0, blindHand: 0 },
        idCounter: 0,
        clockEpochMs: 0,
        clockCounter: 0,
        actionBudget: { limit: 0, consumed: 0 },
        trace: { gameId: state.id, traceId: "redacted" },
      });
      expect(JSON.stringify(view)).not.toContain(state.executionContext.seed);
    }
  });

  it("production contexts draw a 128-bit seed and a trace id that shares none of it", () => {
    const context = createProductionExecutionContext("game-1", { version: 2 });
    expect(context.version).toBe(2);
    expect(context.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(context.trace.traceId).toMatch(/^trace-[0-9a-f]{16}$/);
    expect(context.seed.startsWith(context.trace.traceId.slice("trace-".length))).toBe(false);
  });
});
