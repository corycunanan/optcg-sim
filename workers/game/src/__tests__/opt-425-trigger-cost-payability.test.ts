/**
 * OPT-425 — canOfferTrigger treats self-referencing trigger costs as unpayable.
 *
 * Regression from the OPT-413 trigger gate: `canOfferTrigger` called
 * `isCostPayable` without a source instance, and REST_SELF-family costs
 * return unpayable without one — so OP04-094 Trueno Bastardo's [Trigger]
 * ("You may rest your Leader: K.O. ...") was never offered.
 *
 * Also covers the deeper defect: REST_SELF with `target: YOUR_LEADER` must
 * rest the LEADER at execution time, not the effect's source card.
 */

import { describe, it, expect } from "vitest";
import type { CardData, GameState, PlayerState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { canOfferTrigger, continueEffectDamageSequence } from "../engine/battle.js";
import { payCosts, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { OP04_094_TRUENO_BASTARDO } from "../engine/schemas/op04.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[idx] = { ...newPlayers[idx], ...patch };
  return { ...state, players: newPlayers };
}

function withLeaderState(state: GameState, idx: 0 | 1, leaderState: "ACTIVE" | "RESTED"): GameState {
  return withPlayer(state, idx, {
    leader: { ...state.players[idx].leader, state: leaderState },
  });
}

/** OP04-094 Trueno Bastardo-like: [Trigger] rest your Leader: K.O. up to 1 cost-5 Character. */
function truenoLike(cardDb: Map<string, CardData>): CardData {
  const schema: EffectSchema = {
    card_id: "EVENT-TRUENO",
    card_name: "Trueno Like",
    card_type: "Event",
    effects: [
      {
        id: "trigger_rest_leader_ko",
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        costs: [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
        actions: [
          {
            type: "KO",
            target: {
              type: "CHARACTER",
              controller: "OPPONENT",
              count: { up_to: 1 },
              filter: { cost_max: 5 },
            },
          },
        ],
        flags: { optional: true },
      },
    ],
  } as EffectSchema;
  const card: CardData = {
    ...CARDS.VANILLA,
    id: "EVENT-TRUENO",
    name: "Trueno Like",
    type: "Event",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    effectSchema: schema as never,
  };
  cardDb.set(card.id, card);
  return card;
}

function actualTrueno(cardDb: Map<string, CardData>): CardData {
  const card: CardData = {
    ...CARDS.VANILLA,
    id: "OP04-094",
    name: "Trueno Bastardo",
    type: "Event",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    effectSchema: OP04_094_TRUENO_BASTARDO as never,
  };
  cardDb.set(card.id, card);
  return card;
}

function cannotBeRested(targetInstanceId: string): GameState["prohibitions"][number] {
  return {
    id: `cannot-rest-${targetInstanceId}`,
    sourceCardInstanceId: "prohibition-source",
    sourceEffectBlockId: "cannot-rest-block",
    prohibitionType: "CANNOT_BE_RESTED",
    controller: 0,
    appliesTo: [targetInstanceId],
    scope: {},
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    usesRemaining: null,
    conditionalOverride: null,
    timestamp: Date.now(),
  } as GameState["prohibitions"][number];
}

describe("OPT-425: rest-your-Leader [Trigger] is offered iff the Leader can be rested", () => {
  it("offered while the owner's Leader is active", () => {
    const cardDb = createTestCardDb();
    const card = truenoLike(cardDb);
    const state = withLeaderState(createBattleReadyState(cardDb), 0, "ACTIVE");
    expect(canOfferTrigger(state, card.id, cardDb, 0, "life-0-v1")).toBe(true);
  });

  it("NOT offered while the owner's Leader is rested", () => {
    const cardDb = createTestCardDb();
    const card = truenoLike(cardDb);
    const state = withLeaderState(createBattleReadyState(cardDb), 0, "RESTED");
    expect(canOfferTrigger(state, card.id, cardDb, 0, "life-0-v1")).toBe(false);
  });

  it("offered even without a source instance id — payability comes from the target", () => {
    const cardDb = createTestCardDb();
    const card = truenoLike(cardDb);
    const state = withLeaderState(createBattleReadyState(cardDb), 0, "ACTIVE");
    expect(canOfferTrigger(state, card.id, cardDb, 0)).toBe(true);
  });

  it("actual OP04-094 opens an effect-damage Trigger window", () => {
    const cardDb = createTestCardDb();
    const card = actualTrueno(cardDb);
    let state = withLeaderState(createBattleReadyState(cardDb), 0, "ACTIVE");
    state = withPlayer(state, 0, {
      life: [{ instanceId: "life-op04-094", cardId: card.id, face: "DOWN" }],
    });

    const result = continueEffectDamageSequence(state, cardDb, 0, 1, "damage-source", 1);

    expect(result.state.turn.pendingTriggerFromEffect?.lifeCard.instanceId).toBe("life-op04-094");
    expect(result.state.players[0].hand.some((handCard) => handCard.instanceId === "life-op04-094")).toBe(false);
  });

  it("suppresses OP04-094 when the Leader cannot be rested", () => {
    const cardDb = createTestCardDb();
    const card = actualTrueno(cardDb);
    const base = withLeaderState(createBattleReadyState(cardDb), 0, "ACTIVE");
    const state = {
      ...base,
      prohibitions: [...base.prohibitions, cannotBeRested(base.players[0].leader.instanceId)],
    };

    expect(canOfferTrigger(state, card.id, cardDb, 0, "life-op04-094")).toBe(false);
  });
});

describe("OPT-425: REST_SELF with target YOUR_LEADER rests the Leader, not the source", () => {
  it("payCosts rests the controller's Leader and leaves the source card untouched", () => {
    const cardDb = createTestCardDb();
    const state = withLeaderState(createBattleReadyState(cardDb), 0, "ACTIVE");
    const sourceId = state.players[0].characters[0]!.instanceId;
    const sourceStateBefore = state.players[0].characters[0]!.state;

    const result = payCosts(
      state,
      [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
      0,
      cardDb,
      sourceId,
    );

    expect(result).not.toBeNull();
    expect(result!.state.players[0].leader.state).toBe("RESTED");
    const sourceAfter = result!.state.players[0].characters.find(
      (c) => c?.instanceId === sourceId,
    );
    expect(sourceAfter?.state).toBe(sourceStateBefore);
  });

  it("payCosts fails when the Leader is already rested", () => {
    const cardDb = createTestCardDb();
    const state = withLeaderState(createBattleReadyState(cardDb), 0, "RESTED");
    const result = payCosts(
      state,
      [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
      0,
      cardDb,
      "life-0-v1",
    );
    expect(result).toBeNull();
  });

  it("targetless REST_SELF still rests the source card (existing behavior)", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].characters[0]!.instanceId;
    const result = payCosts(state, [{ type: "REST_SELF" }], 0, cardDb, sourceId);
    expect(result).not.toBeNull();
    const sourceAfter = result!.state.players[0].characters.find(
      (c) => c?.instanceId === sourceId,
    );
    expect(sourceAfter?.state).toBe("RESTED");
    expect(result!.state.players[0].leader.state).toBe(state.players[0].leader.state);
  });

  it("targetless REST_SELF payability still requires a source instance", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    expect(isCostPayable(state, { type: "REST_SELF" }, 0, cardDb)).toBe(false);
  });

  it("targetless REST_SELF rejects a non-field source instance", () => {
    const cardDb = createTestCardDb();
    const state = withPlayer(createBattleReadyState(cardDb), 0, {
      life: [{ instanceId: "life-source", cardId: CARDS.VANILLA.id, face: "DOWN" }],
    });
    expect(isCostPayable(state, { type: "REST_SELF" }, 0, cardDb, "life-source")).toBe(false);
  });
});

describe("OPT-425: hand-cost trigger gating unchanged", () => {
  it("TRASH_FROM_HAND-costed trigger with empty hand is still not offered, with or without source id", () => {
    const cardDb = createTestCardDb();
    const schema: EffectSchema = {
      card_id: "CHAR-HANDCOST",
      card_name: "Hand Cost",
      card_type: "Character",
      effects: [
        {
          id: "trigger_trash_play_self",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
          actions: [{ type: "PLAY_SELF" }],
          flags: { optional: true },
        },
      ],
    } as EffectSchema;
    const card: CardData = {
      ...CARDS.VANILLA,
      id: "CHAR-HANDCOST",
      name: "Hand Cost",
      keywords: { ...CARDS.VANILLA.keywords, trigger: true },
      effectSchema: schema as never,
    };
    cardDb.set(card.id, card);
    const emptyHand = withPlayer(createBattleReadyState(cardDb), 0, { hand: [] });
    expect(canOfferTrigger(emptyHand, card.id, cardDb, 0)).toBe(false);
    expect(canOfferTrigger(emptyHand, card.id, cardDb, 0, "life-0-v1")).toBe(false);
  });
});
