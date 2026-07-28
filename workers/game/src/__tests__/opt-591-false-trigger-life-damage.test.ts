import { describe, expect, it } from "vitest";
import type { CardData, GameState, LifeCard, PlayerState } from "../types.js";
import type { ActionOf } from "../engine/effect-types.js";
import { executeDealDamage } from "../engine/effect-resolver/actions/battle-actions.js";
import { derivePrintedKeywords } from "../engine/printed-keywords.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const CHARLOTTE_OVEN_ID = "OP03-105";

function makeCharlotteOven(): CardData {
  const schema = getEffectSchema(CHARLOTTE_OVEN_ID);
  if (!schema) throw new Error(`${CHARLOTTE_OVEN_ID} schema is required`);

  const card: CardData = {
    id: CHARLOTTE_OVEN_ID,
    name: "Charlotte Oven",
    type: "Character",
    color: ["Yellow"],
    cost: 4,
    power: 5000,
    counter: 1000,
    life: null,
    attribute: ["Special"],
    types: ["Big Mom Pirates"],
    effectText:
      "[DON!! x1] [When Attacking] You may trash 1 card with a [Trigger] from your hand: This Character gains +3000 power during this battle.",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: schema,
    imageUrl: null,
  };

  return {
    ...card,
    keywords: derivePrintedKeywords(card, schema),
  };
}

function putOvenOnDefenderLife(
  state: GameState,
  lifeCard: LifeCard
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = { ...players[1], life: [lifeCard] };
  return { ...state, players };
}

describe("OPT-591 referenced [Trigger] text does not open a Life trigger window", () => {
  it("battle damage adds Charlotte Oven to hand without offering or trashing it", () => {
    const cardDb = createTestCardDb();
    const oven = makeCharlotteOven();
    cardDb.set(oven.id, oven);
    const lifeCard: LifeCard = {
      instanceId: "opt591-battle-oven",
      cardId: oven.id,
      face: "DOWN",
    };
    const initial = putOvenOnDefenderLife(
      createBattleReadyState(cardDb),
      lifeCard
    );
    const handBefore = initial.players[1].hand.length;

    let result = runPipeline(
      initial,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: initial.players[0].leader.instanceId,
        targetInstanceId: initial.players[1].leader.instanceId,
      },
      cardDb,
      0
    );
    expect(result.valid).toBe(true);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    expect(result.valid).toBe(true);
    // This counter PASS enters battle.ts dealOneLeaderDamage, including its
    // canOfferTrigger check, rather than calling a damage helper directly.
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    expect(result.valid).toBe(true);
    expect(result.state.turn.battle).toBeNull();
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    expect(result.state.players[1].life).toHaveLength(0);
    expect(result.state.players[1].hand).toHaveLength(handBefore + 1);
    expect(
      result.state.players[1].hand.some((card) => card.cardId === oven.id)
    ).toBe(true);
    expect(
      result.state.players[1].trash.some((card) => card.cardId === oven.id)
    ).toBe(false);
  });

  it("effect damage adds Charlotte Oven to hand without offering or trashing it", () => {
    const cardDb = createTestCardDb();
    const oven = makeCharlotteOven();
    cardDb.set(oven.id, oven);
    const lifeCard: LifeCard = {
      instanceId: "opt591-effect-oven",
      cardId: oven.id,
      face: "DOWN",
    };
    const initial = putOvenOnDefenderLife(
      createBattleReadyState(cardDb),
      lifeCard
    );
    const handBefore = initial.players[1].hand.length;

    // executeDealDamage is the DEAL_DAMAGE action handler and enters
    // continueEffectDamageSequence, the effect-damage trigger-offer route.
    const result = executeDealDamage(
      initial,
      {
        type: "DEAL_DAMAGE",
        params: { amount: 1 },
      } as ActionOf<"DEAL_DAMAGE">,
      "opt591-effect-source",
      0,
      cardDb,
      new Map()
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    expect(
      result.events.some((event) => event.type === "TRIGGER_ACTIVATED")
    ).toBe(false);
    expect(
      result.events.some(
        (event) => event.type === "CARD_ADDED_TO_HAND_FROM_LIFE"
      )
    ).toBe(true);
    expect(result.state.players[1].life).toHaveLength(0);
    expect(result.state.players[1].hand).toHaveLength(handBefore + 1);
    expect(
      result.state.players[1].hand.some((card) => card.cardId === oven.id)
    ).toBe(true);
    expect(
      result.state.players[1].trash.some((card) => card.cardId === oven.id)
    ).toBe(false);
  });
});
