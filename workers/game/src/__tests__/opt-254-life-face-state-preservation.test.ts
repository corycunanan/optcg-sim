/**
 * OPT-254 F1 — Face-up vs face-down Life preservation across reorder/placement.
 *
 * Per Bandai rulings, each Life card carries a face-up / face-down state
 * (EB01-052 Viola, ST13-004/012/016/017 reorders, OP03-099 Katakuri flips):
 *
 *  • Reorder effects (REORDER_ALL_LIFE) must PRESERVE each card's face state
 *    during the permutation — a previously face-up card remains face-up in
 *    its new position.
 *  • Placements ("add X as Life") default to face-DOWN unless the effect
 *    explicitly says face-up.
 *  • Sending a Life card to the deck erases its Life-zone face state — the
 *    card becomes a normal deck CardInstance with no `face` field. A
 *    subsequent draw-to-Life arrives face-down by default.
 *  • Attacking into a face-up Life card still opens the [Trigger] window
 *    normally (F6 interaction — face state does not gate Trigger eligibility).
 *
 * These invariants already hold structurally in the engine (`face` is part of
 * the `LifeCard` shape, the reorder resume uses an instanceId→LifeCard map,
 * and the Life→Deck handler builds fresh CardInstances). This suite locks
 * them in so a regression — e.g. accidentally rebuilding LifeCards with a
 * defaulted `face: "DOWN"` during reorder, or preserving face on a deck card
 * — is caught immediately.
 */

import { describe, it, expect } from "vitest";
import type {
  CardInstance,
  DonInstance,
  GameState,
  LifeCard,
  PlayerState,
  ResumeContext,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";
import { executeReorderAllLife, executeAddToLifeFromDeck, executeAddToLifeFromHand, executeAddToLifeFromField, executeLifeCardToDeck } from "../engine/effect-resolver/actions/life.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import { runPipeline } from "../engine/pipeline.js";

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
    gameId: "test-opt-254",
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

// ─── 1. Reorder preserves per-card face state ───────────────────────────────

describe("OPT-254 — REORDER_ALL_LIFE preserves face state", () => {
  it("a face-up Life card remains face-up in its new position after reorder", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // Flip position 0 and 2 face-up (simulating Katakuri + a second reveal).
    state.players[0].life = [
      { instanceId: "L0", cardId: CARDS.VANILLA.id, face: "UP" as const },
      { instanceId: "L1", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
      { instanceId: "L2", cardId: CARDS.VANILLA.id, face: "UP" as const },
      { instanceId: "L3", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
      { instanceId: "L4", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
    ];

    const pausedAction = {
      type: "REORDER_ALL_LIFE" as const,
      params: {},
    };

    // Kick off the reorder so we can see it asks for a prompt.
    const start = executeReorderAllLife(state, pausedAction, "leader-0", 0, cardDb, new Map());
    expect(start.pendingPrompt).toBeTruthy();

    // Resume with a permutation: [L2, L4, L0, L1, L3].
    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: "leader-0",
      controller: 0,
      pausedAction,
      remainingActions: [],
      resultRefs: [],
      validTargets: ["L0", "L1", "L2", "L3", "L4"],
    };

    const result = resumeEffectChain(
      state,
      resumeCtx,
      {
        type: "ARRANGE_TOP_CARDS" as const,
        keptCardInstanceId: "",
        orderedInstanceIds: ["L2", "L4", "L0", "L1", "L3"],
        destination: "top" as const,
      },
      cardDb,
    );

    const life = result.state.players[0].life;
    expect(life.map((l) => l.instanceId)).toEqual(["L2", "L4", "L0", "L1", "L3"]);
    // Face state follows the card, not the slot.
    expect(life[0]).toMatchObject({ instanceId: "L2", face: "UP" });
    expect(life[1]).toMatchObject({ instanceId: "L4", face: "DOWN" });
    expect(life[2]).toMatchObject({ instanceId: "L0", face: "UP" });
    expect(life[3]).toMatchObject({ instanceId: "L1", face: "DOWN" });
    expect(life[4]).toMatchObject({ instanceId: "L3", face: "DOWN" });
  });

  it("reorder targeting OPPONENT_LIFE also preserves the opponent's face state", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[1].life = [
      { instanceId: "O0", cardId: CARDS.VANILLA.id, face: "UP" as const },
      { instanceId: "O1", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
      { instanceId: "O2", cardId: CARDS.VANILLA.id, face: "UP" as const },
    ];

    const pausedAction = {
      type: "REORDER_ALL_LIFE" as const,
      target: { type: "OPPONENT_LIFE" as const },
      params: {},
    };

    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: "leader-0",
      controller: 0,
      pausedAction,
      remainingActions: [],
      resultRefs: [],
      validTargets: ["O0", "O1", "O2"],
    };

    const result = resumeEffectChain(
      state,
      resumeCtx,
      {
        type: "ARRANGE_TOP_CARDS" as const,
        keptCardInstanceId: "",
        orderedInstanceIds: ["O2", "O0", "O1"],
        destination: "top" as const,
      },
      cardDb,
    );

    const oppLife = result.state.players[1].life;
    expect(oppLife.map((l) => l.instanceId)).toEqual(["O2", "O0", "O1"]);
    expect(oppLife[0]).toMatchObject({ instanceId: "O2", face: "UP" });
    expect(oppLife[1]).toMatchObject({ instanceId: "O0", face: "UP" });
    expect(oppLife[2]).toMatchObject({ instanceId: "O1", face: "DOWN" });
  });
});

// ─── 2. Placement defaults: new Life arrives face-down ──────────────────────

describe("OPT-254 — New Life placements default to face-down", () => {
  it("ADD_TO_LIFE_FROM_DECK defaults the new Life to face-DOWN", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // Clear life so the added card is easy to identify.
    state.players[0].life = [];
    const topDeckId = state.players[0].deck[0].instanceId;

    const result = executeAddToLifeFromDeck(
      state,
      { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    const newLife = result.state.players[0].life;
    expect(newLife).toHaveLength(1);
    expect(newLife[0]).toMatchObject({ instanceId: topDeckId, face: "DOWN" });
  });

  it("ADD_TO_LIFE_FROM_DECK honors an explicit face: 'UP' param", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = [];

    const result = executeAddToLifeFromDeck(
      state,
      { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "UP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].life[0].face).toBe("UP");
  });

  it("ADD_TO_LIFE_FROM_HAND defaults the placed Life to face-DOWN", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    const handCard = makeInstance(CARDS.VANILLA.id, "HAND", 0, { instanceId: "hand-A" });
    state.players[0].hand = [handCard];
    state.players[0].life = [];

    const result = executeAddToLifeFromHand(
      state,
      { type: "ADD_TO_LIFE_FROM_HAND", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].life).toHaveLength(1);
    expect(result.state.players[0].life[0]).toMatchObject({ instanceId: "hand-A", face: "DOWN" });
  });

  it("ADD_TO_LIFE_FROM_FIELD defaults the returned Life to face-DOWN", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    const fieldChar = makeInstance(CARDS.VANILLA.id, "CHARACTER", 0, { instanceId: "char-field-A" });
    state.players[0].characters = [fieldChar, null, null, null, null];
    state.players[0].life = [];

    const result = executeAddToLifeFromField(
      state,
      { type: "ADD_TO_LIFE_FROM_FIELD", target: { type: "SELECTED_CARDS" as const } },
      "leader-0",
      0,
      cardDb,
      new Map(),
      ["char-field-A"],
    );

    expect(result.succeeded).toBe(true);
    const newLife = result.state.players[0].life;
    expect(newLife).toHaveLength(1);
    expect(newLife[0]).toMatchObject({ cardId: CARDS.VANILLA.id, face: "DOWN" });
    // Original character slot cleared.
    expect(result.state.players[0].characters.every((c) => c === null)).toBe(true);
  });
});

// ─── 3. Life → Deck erases face state ───────────────────────────────────────

describe("OPT-254 — LIFE_CARD_TO_DECK erases Life face state", () => {
  it("a face-UP Life sent to deck becomes a normal deck card with no face field", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = [
      { instanceId: "L0", cardId: CARDS.VANILLA.id, face: "UP" as const },
      { instanceId: "L1", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
    ];
    const deckLenBefore = state.players[0].deck.length;

    const result = executeLifeCardToDeck(
      state,
      { type: "LIFE_CARD_TO_DECK", params: { amount: 1, position: "BOTTOM" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    // The face-UP top Life is gone from the Life zone.
    expect(result.state.players[0].life.map((l) => l.instanceId)).toEqual(["L1"]);
    // One card appended to the bottom of the deck.
    expect(result.state.players[0].deck).toHaveLength(deckLenBefore + 1);
    const addedDeckCard = result.state.players[0].deck[result.state.players[0].deck.length - 1];
    expect(addedDeckCard.cardId).toBe(CARDS.VANILLA.id);
    expect(addedDeckCard.zone).toBe("DECK");
    // No `face` property leaks onto the deck card (Life-only state is erased).
    expect("face" in (addedDeckCard as unknown as Record<string, unknown>)).toBe(false);
  });

  it("round-trip: face-UP Life → deck → re-added to Life arrives face-DOWN by default", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].life = [
      { instanceId: "L0", cardId: CARDS.VANILLA.id, face: "UP" as const },
    ];
    const deckLenBefore = state.players[0].deck.length;

    // Step 1: face-UP Life → top of deck.
    const afterToDeck = executeLifeCardToDeck(
      state,
      { type: "LIFE_CARD_TO_DECK", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );
    expect(afterToDeck.succeeded).toBe(true);
    expect(afterToDeck.state.players[0].deck).toHaveLength(deckLenBefore + 1);

    // Step 2: draw the top of deck back as Life (no face param → defaults DOWN).
    const afterBack = executeAddToLifeFromDeck(
      afterToDeck.state,
      { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );
    expect(afterBack.succeeded).toBe(true);
    const life = afterBack.state.players[0].life;
    expect(life).toHaveLength(1);
    expect(life[0].cardId).toBe(CARDS.VANILLA.id);
    expect(life[0].face).toBe("DOWN");
  });
});

// ─── 4. Face-up Life still opens the Trigger window on attack ───────────────

describe("OPT-254 — Face-up Life still opens the [Trigger] window on damage (F1 × F6)", () => {
  it("attacking a face-up top Life with [Trigger] still queues pendingTriggerLifeCard", () => {
    const cardDb = createTestCardDb();
    const state0 = createBattleReadyState(cardDb);

    // Defender's top Life is face-UP and a Trigger card.
    const triggerLife: LifeCard = {
      instanceId: "face-up-trigger",
      cardId: CARDS.TRIGGER.id,
      face: "UP" as const,
    };
    const newPlayers = [...state0.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [triggerLife] };
    const state = { ...state0, players: newPlayers };

    const attackerId = state.players[0].leader.instanceId;
    const targetId = state.players[1].leader.instanceId;

    let r = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: targetId },
      cardDb,
      0,
    );
    expect(r.valid).toBe(true);
    r = runPipeline(r.state, { type: "PASS" }, cardDb, 0); // skip block
    expect(r.valid).toBe(true);
    r = runPipeline(r.state, { type: "PASS" }, cardDb, 0); // skip counter
    expect(r.valid).toBe(true);

    // The face-up Life was still popped and its Trigger queued on battle —
    // face state does not gate eligibility.
    const pending = (r.state.turn.battle as { pendingTriggerLifeCard?: LifeCard } | null)
      ?.pendingTriggerLifeCard;
    expect(pending?.instanceId).toBe(triggerLife.instanceId);
    expect(pending?.cardId).toBe(CARDS.TRIGGER.id);
  });

  it("declining the Trigger on a face-up Life card sends it to hand as normal", () => {
    const cardDb = createTestCardDb();
    const state0 = createBattleReadyState(cardDb);
    const triggerLife: LifeCard = {
      instanceId: "face-up-trigger-2",
      cardId: CARDS.TRIGGER.id,
      face: "UP" as const,
    };
    const newPlayers = [...state0.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [triggerLife] };
    const state = { ...state0, players: newPlayers };

    const attackerId = state.players[0].leader.instanceId;
    const targetId = state.players[1].leader.instanceId;

    let r = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: targetId },
      cardDb,
      0,
    );
    r = runPipeline(r.state, { type: "PASS" }, cardDb, 0);
    r = runPipeline(r.state, { type: "PASS" }, cardDb, 0);
    // Confirm the battle paused with the face-up card queued for Trigger.
    expect((r.state.turn.battle as { pendingTriggerLifeCard?: LifeCard } | null)
      ?.pendingTriggerLifeCard?.instanceId).toBe(triggerLife.instanceId);

    const p1HandBefore = r.state.players[1].hand.length;
    const after = runPipeline(r.state, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(after.valid).toBe(true);
    // The revealed-and-declined Life card goes to hand (normal damage path).
    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 1);
    expect(
      after.state.players[1].hand.some((c) => c.instanceId === triggerLife.instanceId),
    ).toBe(true);
    expect(after.state.players[1].life).toHaveLength(0);
  });
});
