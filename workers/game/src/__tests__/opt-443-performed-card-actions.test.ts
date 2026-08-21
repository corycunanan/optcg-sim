/**
 * OPT-443 — card-backed ACTION_PERFORMED_THIS_TURN conditions.
 *
 * These regressions exercise the real action pipeline so the condition sees
 * only metadata actually recorded by PLAY_CARD / USE_COUNTER_EVENT /
 * DECLARE_BLOCKER. The Lucy checks continue through ACTIVATE_EFFECT to prove
 * the player-facing draw is gated, rather than only unit-testing a hand-built
 * condition context.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import { evaluateCondition } from "../engine/conditions.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP15_002_LUCY } from "../engine/schemas/op15.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const NO_KEYWORDS = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

function makeCard(id: string, overrides: Partial<CardData>): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: NO_KEYWORDS,
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function cardInHand(
  cardId: string,
  controller: 0 | 1,
  suffix: string
): CardInstance {
  return {
    instanceId: `hand-${controller}-${suffix}`,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
  };
}

function withPlayer(
  state: GameState,
  index: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[index] = { ...players[index], ...patch };
  return { ...state, players };
}

function lucyState(
  cardDb: Map<string, CardData>,
  actedCard: CardData
): GameState {
  cardDb.set(actedCard.id, actedCard);
  cardDb.set(
    "OP15-002",
    makeCard("OP15-002", {
      name: "Lucy",
      type: "Leader",
      cost: null,
      power: 5000,
      life: 5,
      effectSchema: OP15_002_LUCY,
      effectText:
        "[Activate: Main] [Once Per Turn] If you have activated an Event with a base cost of 3 or more during this turn, draw 1 card.",
    })
  );

  let state = createBattleReadyState(cardDb);
  state = withPlayer(state, 0, {
    leader: { ...state.players[0].leader, cardId: "OP15-002" },
    hand: [...state.players[0].hand, cardInHand(actedCard.id, 0, actedCard.id)],
  });
  return state;
}

function activateLucy(
  state: GameState,
  cardDb: Map<string, CardData>,
  expectedValid = true
): GameState {
  const result = runPipeline(
    state,
    {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: state.players[0].leader.instanceId,
      effectId: "OP15-002_activate_draw",
    },
    cardDb,
    0
  );
  expect(result.valid).toBe(expectedValid);
  if (!expectedValid) {
    expect(result.error).toBe("Effect conditions are not met");
  }
  return result.state;
}

const lucyCondition = {
  type: "ACTION_PERFORMED_THIS_TURN",
  controller: "SELF",
  action: "ACTIVATED_EVENT",
  filter: { base_cost_min: 3 },
} as const;

describe("OPT-443: OP15-002 Lucy through PLAY_CARD → ACTIVATE_EFFECT", () => {
  it("does not draw after playing a 1-cost Character", () => {
    const cardDb = createTestCardDb();
    const state = lucyState(
      cardDb,
      makeCard("ONE-COST-CHAR", { type: "Character", cost: 1 })
    );
    const card = state.players[0].hand.find(
      (c) => c.cardId === "ONE-COST-CHAR"
    )!;

    const played = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: card.instanceId },
      cardDb,
      0
    );
    expect(played.valid).toBe(true);
    expect(
      evaluateCondition(played.state, lucyCondition, {
        sourceCardInstanceId: played.state.players[0].leader.instanceId,
        controller: 0,
        cardDb,
      })
    ).toBe(false);
    expect(
      evaluateCondition(
        played.state,
        {
          type: "ACTION_PERFORMED_THIS_TURN",
          controller: "SELF",
          action: "PLAYED_CHARACTER",
          filter: { card_type: "CHARACTER", base_cost_max: 1 },
        },
        {
          sourceCardInstanceId: played.state.players[0].leader.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(true);

    const deckBefore = played.state.players[0].deck.length;
    const after = activateLucy(played.state, cardDb, false);
    expect(after.players[0].deck).toHaveLength(deckBefore);
  });

  it("does not draw after activating a 1-cost Event", () => {
    const cardDb = createTestCardDb();
    const state = lucyState(
      cardDb,
      makeCard("ONE-COST-EVENT", {
        type: "Event",
        cost: 1,
        power: null,
        effectText: "[Main] Do nothing.",
      })
    );
    const card = state.players[0].hand.find(
      (c) => c.cardId === "ONE-COST-EVENT"
    )!;

    const played = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: card.instanceId },
      cardDb,
      0
    );
    expect(played.valid).toBe(true);
    expect(
      evaluateCondition(played.state, lucyCondition, {
        sourceCardInstanceId: played.state.players[0].leader.instanceId,
        controller: 0,
        cardDb,
      })
    ).toBe(false);

    const deckBefore = played.state.players[0].deck.length;
    const after = activateLucy(played.state, cardDb, false);
    expect(after.players[0].deck).toHaveLength(deckBefore);
  });

  it("draws after activating a 3-cost Event and honors printed-card filters", () => {
    const cardDb = createTestCardDb();
    const state = lucyState(
      cardDb,
      makeCard("THREE-COST-EVENT", {
        name: "Three Cost Event",
        type: "Event",
        cost: 3,
        power: null,
        effectText: "[Main] Do nothing.",
      })
    );
    const card = state.players[0].hand.find(
      (c) => c.cardId === "THREE-COST-EVENT"
    )!;

    const played = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: card.instanceId },
      cardDb,
      0
    );
    expect(played.valid).toBe(true);
    expect(
      evaluateCondition(
        played.state,
        {
          ...lucyCondition,
          filter: {
            card_type: "EVENT",
            base_cost_min: 3,
            name: "Three Cost Event",
          },
        },
        {
          sourceCardInstanceId: played.state.players[0].leader.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(true);

    const deckBefore = played.state.players[0].deck.length;
    const after = activateLucy(played.state, cardDb);
    expect(after.players[0].deck).toHaveLength(deckBefore - 1);
  });
});

describe("OPT-443: controller and latent action-category scope", () => {
  it("does not let the opponent's Counter Event satisfy Lucy", () => {
    const cardDb = createTestCardDb();
    const counterEvent = makeCard("OPP-COUNTER-EVENT", {
      type: "Event",
      cost: 3,
      power: null,
      effectText: "[Counter] Do nothing.",
    });
    let state = lucyState(
      cardDb,
      makeCard("UNUSED-CARD", { type: "Character" })
    );
    cardDb.set(counterEvent.id, counterEvent);
    state = withPlayer(state, 1, {
      hand: [
        ...state.players[1].hand,
        cardInHand(counterEvent.id, 1, "counter"),
      ],
    });

    const attacker = state.players[0].characters[0]!;
    let result = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      cardDb,
      0
    );
    expect(result.valid).toBe(true);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 1);
    expect(result.valid).toBe(true);
    const counter = result.state.players[1].hand.find(
      (c) => c.cardId === counterEvent.id
    )!;
    result = runPipeline(
      result.state,
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: result.state.players[1].leader.instanceId,
      },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 1);
    expect(result.valid).toBe(true);

    const counterRecord = result.state.turn.actionsPerformedThisTurn.find(
      (action) => action.actionType === "USE_COUNTER_EVENT"
    );
    expect(counterRecord).toMatchObject({
      controller: 1,
      cardId: counterEvent.id,
      cardType: "EVENT",
      baseCost: 3,
    });
    expect(
      evaluateCondition(result.state, lucyCondition, {
        sourceCardInstanceId: result.state.players[0].leader.instanceId,
        controller: 0,
        cardDb,
      })
    ).toBe(false);
    expect(
      evaluateCondition(
        result.state,
        {
          ...lucyCondition,
          controller: "OPPONENT",
        },
        {
          sourceCardInstanceId: result.state.players[0].leader.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(true);

    const deckBefore = result.state.players[0].deck.length;
    const after = activateLucy(result.state, cardDb, false);
    expect(after.players[0].deck).toHaveLength(deckBefore);
  });

  it("PLAYED_CHARACTER rejects Event and Stage PLAY_CARD records", () => {
    const cardDb = createTestCardDb();
    const event = makeCard("PLAYED-EVENT", {
      type: "Event",
      power: null,
      effectText: "[Main] Do nothing.",
    });
    const state = lucyState(cardDb, event);
    const eventInHand = state.players[0].hand.find(
      (c) => c.cardId === event.id
    )!;
    let played = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: eventInHand.instanceId },
      cardDb,
      0
    );
    expect(played.valid).toBe(true);

    const stage = makeCard("PLAYED-STAGE", { type: "Stage", power: null });
    cardDb.set(stage.id, stage);
    played = runPipeline(
      withPlayer(played.state, 0, {
        hand: [
          ...played.state.players[0].hand,
          cardInHand(stage.id, 0, "stage"),
        ],
      }),
      {
        type: "PLAY_CARD",
        cardInstanceId: "hand-0-stage",
      },
      cardDb,
      0
    );
    expect(played.valid).toBe(true);

    expect(
      evaluateCondition(
        played.state,
        {
          type: "ACTION_PERFORMED_THIS_TURN",
          controller: "SELF",
          action: "PLAYED_CHARACTER",
        },
        {
          sourceCardInstanceId: played.state.players[0].leader.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(false);
  });

  it("USED_BLOCKER records the defending controller and Character category", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;
    const blocker = state.players[1].characters[1]!;

    let result = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      cardDb,
      0
    );
    expect(result.valid).toBe(true);
    result = runPipeline(
      result.state,
      {
        type: "DECLARE_BLOCKER",
        blockerInstanceId: blocker.instanceId,
      },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);

    expect(
      evaluateCondition(
        result.state,
        {
          type: "ACTION_PERFORMED_THIS_TURN",
          controller: "OPPONENT",
          action: "USED_BLOCKER",
          filter: { card_type: "CHARACTER", keywords: ["BLOCKER"] },
        },
        {
          sourceCardInstanceId: attacker.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        result.state,
        {
          type: "ACTION_PERFORMED_THIS_TURN",
          controller: "SELF",
          action: "USED_BLOCKER",
        },
        {
          sourceCardInstanceId: attacker.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(false);
  });

  it("fails closed for legacy card-action records without a card snapshot", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const legacy = {
      ...state,
      turn: {
        ...state.turn,
        actionsPerformedThisTurn: [{ actionType: "PLAY_CARD", timestamp: 1 }],
      },
    };

    expect(
      evaluateCondition(
        legacy,
        {
          type: "ACTION_PERFORMED_THIS_TURN",
          controller: "SELF",
          action: "ACTIVATED_EVENT",
        },
        {
          sourceCardInstanceId: legacy.players[0].leader.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(false);
    expect(
      evaluateCondition(
        legacy,
        {
          type: "ACTION_PERFORMED_THIS_TURN",
          controller: "SELF",
          action: "PLAYED_CHARACTER",
        },
        {
          sourceCardInstanceId: legacy.players[0].leader.instanceId,
          controller: 0,
          cardDb,
        }
      )
    ).toBe(false);
  });
});
