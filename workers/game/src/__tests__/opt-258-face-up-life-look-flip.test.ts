/**
 * OPT-258 F5 — Face-up Life look/flip semantics.
 *
 * Per Bandai rulings, effects that interact with the top of the Life pile
 * distinguish between two shapes:
 *
 *   • LOOK (LIFE_SCRY, OP03-099 Katakuri) — informational only. The card's
 *     face state is NOT mutated, and the action still succeeds when the
 *     target is already face-up. A chained follow-up (e.g. OP03-099's
 *     +1000 power) still applies. Looking a second time after a prior
 *     face-up flip is a no-op on face state.
 *
 *   • FLIP (TURN_LIFE_FACE_UP / TURN_LIFE_FACE_DOWN, typically used as a
 *     cost — OP08-058 Pudding, OP08-063 Katakuri Char, OP11-022
 *     Shirahoshi, OP13-109 Bonney's Life-flip replacement) — per-effect
 *     feasibility gate. Flipping face-UP requires ≥ amount face-DOWN life
 *     cards; flipping face-DOWN requires ≥ amount face-UP life cards. When
 *     the requirement is not met, the cost is unpayable and the host
 *     effect simply does not fire (or the replacement is infeasible and
 *     the original K.O. proceeds — cf. OPT-234 B4).
 *
 * These invariants already hold in the engine:
 *   • `executeLifeScry` never writes to `LifeCard.face`.
 *   • `isCostPayable` for TURN_LIFE_FACE_UP/DOWN filters by the required
 *     face state before counting.
 *   • All five F5 cards encode the correct action/cost shape.
 *
 * This suite locks them down so regressions — e.g. an accidental "after
 * looking, also flip face-up" side-effect on LIFE_SCRY, or a feasibility
 * check that counts all life instead of only flippable life — are caught
 * immediately.
 */

import { describe, it, expect } from "vitest";
import type {
  CardInstance,
  DonInstance,
  GameState,
  PlayerState,
} from "../types.js";
import type { Cost } from "../engine/effect-types.js";
import {
  CARDS,
  createTestCardDb,
} from "./helpers.js";
import {
  executeLifeScry,
  executeTurnLifeFaceUp,
  executeTurnLifeFaceDown,
} from "../engine/effect-resolver/actions/life.js";
import { isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { getEffectSchema } from "../engine/schema-registry.js";

// ─── Minimal state builder ──────────────────────────────────────────────────

function makeInstance(
  cardId: string,
  zone: CardInstance["zone"],
  owner: 0 | 1,
  overrides: Partial<CardInstance> = {},
): CardInstance {
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
    ...overrides,
  };
}

function buildMinimalState(overrides: Partial<GameState> = {}): GameState {
  const makePlayer = (idx: 0 | 1): PlayerState => ({
    playerId: `user-${idx}`,
    leader: makeInstance(CARDS.LEADER.id, "LEADER", idx, { instanceId: `leader-${idx}` }),
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: Array.from({ length: 20 }, (_, i) =>
      makeInstance(CARDS.VANILLA.id, "DECK", idx, { instanceId: `deck-${idx}-${i}` }),
    ),
    trash: [],
    life: Array.from({ length: 5 }, (_, i) => ({
      instanceId: `life-${idx}-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN" as const,
    })),
    removedFromGame: [],
    donDeck: Array.from({ length: 10 }, (_, i) => ({
      instanceId: `dondeck-${idx}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })) satisfies DonInstance[],
    donCostArea: Array.from({ length: 6 }, (_, i) => ({
      instanceId: `don-${idx}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })) satisfies DonInstance[],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  });

  return {
    gameId: "test-opt-258",
    status: "IN_PROGRESS",
    winner: null,
    players: [makePlayer(0), makePlayer(1)],
    turn: {
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
    ...overrides,
  } as GameState;
}

// ─── 1. LIFE_SCRY (look) preserves face state ───────────────────────────────

describe("OPT-258 — LIFE_SCRY does not mutate LifeCard.face", () => {
  it("a face-DOWN top Life stays face-DOWN after LIFE_SCRY", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // All life face-down (builder default).
    const before = state.players[0].life.map((l) => l.face);

    const result = executeLifeScry(
      state,
      { type: "LIFE_SCRY", params: { look_at: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    const after = result.state.players[0].life.map((l) => l.face);
    expect(after).toEqual(before);
    expect(after[0]).toBe("DOWN");
  });

  it("a face-UP top Life stays face-UP after LIFE_SCRY — the look still succeeds (OP03-099 on face-up Life)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life[0] = { ...state.players[0].life[0], face: "UP" };

    const result = executeLifeScry(
      state,
      { type: "LIFE_SCRY", params: { look_at: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    // The look never fails on face-up Life — that matters for OP03-099, whose
    // +1000 is chained with `chain: "THEN"` on the resolver.
    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].life[0].face).toBe("UP");
    // Cards below are untouched too.
    expect(result.state.players[0].life.slice(1).every((l) => l.face === "DOWN")).toBe(true);
  });

  it("LIFE_SCRY with look_at=2 over a mixed stack preserves each card's face independently", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life[0] = { ...state.players[0].life[0], face: "UP" };
    state.players[0].life[1] = { ...state.players[0].life[1], face: "DOWN" };

    const result = executeLifeScry(
      state,
      { type: "LIFE_SCRY", params: { look_at: 2 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].life[0].face).toBe("UP");
    expect(result.state.players[0].life[1].face).toBe("DOWN");
  });

  it("LIFE_SCRY emits LIFE_SCRIED with the visible card ids regardless of face state", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life[0] = { ...state.players[0].life[0], face: "UP" };

    const result = executeLifeScry(
      state,
      { type: "LIFE_SCRY", params: { look_at: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    const scried = result.events.find((e) => e.type === "LIFE_SCRIED");
    expect(scried).toBeTruthy();
    expect((scried as any).payload.count).toBe(1);
    expect((scried as any).payload.cards[0].instanceId).toBe("life-0-0");
  });

  it("a follow-up LIFE_SCRY after a prior face-up flip still succeeds on the now-face-up top", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    // Phase 1: flip the top face-up (e.g. via a cost).
    const flipped = executeTurnLifeFaceUp(
      state,
      { type: "TURN_LIFE_FACE_UP", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );
    expect(flipped.state.players[0].life[0].face).toBe("UP");

    // Phase 2: Katakuri-style look on the already-face-up top.
    const scried = executeLifeScry(
      flipped.state,
      { type: "LIFE_SCRY", params: { look_at: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );
    expect(scried.succeeded).toBe(true);
    expect(scried.state.players[0].life[0].face).toBe("UP");
  });

  it("LIFE_SCRY on empty Life returns succeeded=false (degenerate case)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = [];

    const result = executeLifeScry(
      state,
      { type: "LIFE_SCRY", params: { look_at: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(false);
  });
});

// ─── 2. TURN_LIFE_FACE_UP cost feasibility ──────────────────────────────────

describe("OPT-258 — TURN_LIFE_FACE_UP cost is unpayable when there aren't enough face-DOWN Life cards", () => {
  it("payable when face-DOWN count >= amount (Pudding OP08-058 can fire at full Life)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // All 5 face-down (builder default).
    const cost: Cost = { type: "TURN_LIFE_FACE_UP", amount: 2 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when amount=2 but only 1 face-DOWN remains (Pudding OP08-058 on partial top flip)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // 4 already face-up, 1 face-down.
    state.players[0].life = state.players[0].life.map((l, i) => ({
      ...l,
      face: i < 4 ? "UP" : "DOWN",
    }));
    const cost: Cost = { type: "TURN_LIFE_FACE_UP", amount: 2 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("unpayable when all Life is already face-UP (Shirahoshi OP11-022 activate blocked)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = state.players[0].life.map((l) => ({ ...l, face: "UP" }));
    const cost: Cost = { type: "TURN_LIFE_FACE_UP", amount: 1 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("unpayable when Life is empty", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = [];
    const cost: Cost = { type: "TURN_LIFE_FACE_UP", amount: 1 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });
});

// ─── 3. TURN_LIFE_FACE_DOWN cost feasibility ────────────────────────────────

describe("OPT-258 — TURN_LIFE_FACE_DOWN cost is unpayable when there aren't enough face-UP Life cards", () => {
  it("payable when at least one face-UP Life exists (OP08-063 Katakuri on_play)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life[0] = { ...state.players[0].life[0], face: "UP" };
    const cost: Cost = { type: "TURN_LIFE_FACE_DOWN", amount: 1 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when all Life is face-DOWN (OP08-063 blocked at fresh Life pile)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // Builder default: all face-down.
    const cost: Cost = { type: "TURN_LIFE_FACE_DOWN", amount: 1 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("unpayable when amount=2 but only 1 face-UP exists", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life[0] = { ...state.players[0].life[0], face: "UP" };
    const cost: Cost = { type: "TURN_LIFE_FACE_DOWN", amount: 2 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });
});

// ─── 4. Action-path TURN_LIFE_FACE_UP on already face-up top is a safe no-op ─

describe("OPT-258 — TURN_LIFE_FACE_UP action on an already face-up top is a safe no-op", () => {
  it("calling the action handler with top already face-UP does not crash and keeps face state consistent", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = state.players[0].life.map((l) => ({ ...l, face: "UP" }));

    const result = executeTurnLifeFaceUp(
      state,
      { type: "TURN_LIFE_FACE_UP", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    // All 5 remain face-up; the handler treats an already-up slot as already
    // satisfied. Feasibility gating lives in the cost-handler path above —
    // the action handler itself must remain total over any face configuration.
    expect(result.state.players[0].life.every((l) => l.face === "UP")).toBe(true);
  });

  it("calling TURN_LIFE_FACE_DOWN with all Life already face-DOWN is a safe no-op", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    const before = state.players[0].life.map((l) => l.face);

    const result = executeTurnLifeFaceDown(
      state,
      { type: "TURN_LIFE_FACE_DOWN", params: { amount: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    const after = result.state.players[0].life.map((l) => l.face);
    expect(after).toEqual(before);
    expect(after.every((f) => f === "DOWN")).toBe(true);
  });
});

// ─── 5. Encoding fixtures for the five F5 cards ─────────────────────────────

describe("OPT-258 — F5 card encodings match the face-up/down semantics", () => {
  it("OP03-099 Katakuri Leader uses LIFE_SCRY (look, non-mutating) + chained MODIFY_POWER", () => {
    const schema = getEffectSchema("OP03-099");
    expect(schema).toBeTruthy();
    const eff = schema!.effects[0];
    const actionTypes = eff.actions?.map((a) => a.type) ?? [];
    expect(actionTypes).toContain("LIFE_SCRY");
    expect(actionTypes).toContain("MODIFY_POWER");
  });

  it("OP08-058 Pudding Leader encodes TURN_LIFE_FACE_UP amount=2 as cost (gated by face-DOWN count)", () => {
    const schema = getEffectSchema("OP08-058");
    expect(schema).toBeTruthy();
    const cost = schema!.effects[0].costs?.[0];
    expect(cost).toMatchObject({ type: "TURN_LIFE_FACE_UP", amount: 2 });
  });

  it("OP08-063 Katakuri Character encodes TURN_LIFE_FACE_DOWN as cost (gated by face-UP count)", () => {
    const schema = getEffectSchema("OP08-063");
    expect(schema).toBeTruthy();
    const cost = schema!.effects[0].costs?.[0];
    expect(cost).toMatchObject({ type: "TURN_LIFE_FACE_DOWN", amount: 1 });
  });

  it("OP11-022 Shirahoshi Leader encodes TURN_LIFE_FACE_UP amount=1 among its activate costs", () => {
    const schema = getEffectSchema("OP11-022");
    expect(schema).toBeTruthy();
    const activate = schema!.effects.find((e) => e.id === "activate_play_from_hand");
    expect(activate).toBeTruthy();
    const costTypes = (activate!.costs ?? []).map((c) => c.type);
    expect(costTypes).toContain("TURN_LIFE_FACE_UP");
  });

  it("OP13-109 Bonney encodes TURN_LIFE_FACE_UP as a replacement action (B4/F4 infeasibility path)", () => {
    const schema = getEffectSchema("OP13-109");
    expect(schema).toBeTruthy();
    const replacement = schema!.effects.find((e) => e.category === "replacement");
    expect(replacement).toBeTruthy();
    const replacementActions = (replacement as any).replacement_actions ?? [];
    expect(replacementActions[0]).toMatchObject({
      type: "TURN_LIFE_FACE_UP",
      params: { amount: 1, position: "TOP" },
    });
  });
});
