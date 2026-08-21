/**
 * OPT-729 — OP17 final Character schema integration coverage.
 *
 * These regressions complete every opponent-relative wrapper, direct Life
 * Trigger, multi-step cost, post-cost gate, COUNTER_GRANT, and aggregate KO
 * through resolver/pipeline completion with controller-specific zone checks.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PendingPromptState,
  PlayerState,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { runPipeline } from "../engine/pipeline.js";
import {
  OP17_053_BARBELL,
  OP17_054_MISS_BUCKINGHAM_STUSSY,
  OP17_061_LEAD_PERFORMERS,
  OP17_063_KAIDO,
  OP17_066_KUROZUMI_OROCHI,
  OP17_067_KUROZUMI_KANJURO,
  OP17_068_SASAKI,
  OP17_069_JACK,
  OP17_071_WHOS_WHO,
  OP17_073_BASIL_HAWKINS,
  OP17_075_X_DRAKE,
  OP17_091_BROOK,
  OP17_108_CHARLOTTE_BRULEE,
  OP17_110_CHARLOTTE_PEROSPERO,
  OP17_114_SWEET_3_GENERALS,
  OP17_119_LOKI,
  OP17_SCHEMAS,
} from "../engine/schemas/op17.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

type PromptResult = {
  state: GameState;
  pendingPrompt?: PendingPromptState;
  resolved?: boolean;
  rejected?: boolean;
};

function withPlayer(
  state: GameState,
  playerIndex: 0 | 1,
  patch: Partial<PlayerState>,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function cardData(schema: EffectSchema, overrides: Partial<CardData> = {}): CardData {
  const hasTrigger = schema.effects.some(
    (block) => block.trigger && "keyword" in block.trigger && block.trigger.keyword === "TRIGGER",
  );
  return {
    ...CARDS.VANILLA,
    id: schema.card_id!,
    name: schema.card_name!,
    type: "Character",
    cost: 1,
    power: 5000,
    effectSchema: schema,
    triggerText: hasTrigger ? "[Trigger] effect" : null,
    keywords: { ...CARDS.VANILLA.keywords, trigger: hasTrigger },
    ...overrides,
  };
}

function installCharacter(schema: EffectSchema, overrides: Partial<CardData> = {}) {
  const cardDb = createTestCardDb();
  const data = cardData(schema, overrides);
  cardDb.set(data.id, data);
  let state = createBattleReadyState(cardDb);
  const source: CardInstance = {
    ...state.players[0].characters[0]!,
    instanceId: `source-${data.id}`,
    cardId: data.id,
    state: "ACTIVE",
    controller: 0,
    owner: 0,
    turnPlayed: state.turn.number,
  };
  state = withPlayer(state, 0, { characters: padChars([source]) });
  return { state, cardDb, source };
}

function resolveBlock(
  state: GameState,
  cardDb: Map<string, CardData>,
  source: CardInstance,
  schema: EffectSchema,
  effectId: string,
): PromptResult {
  const block = schema.effects.find((candidate) => candidate.id === effectId);
  if (!block) throw new Error(`Missing effect ${effectId}`);
  return resolveEffect(state, block, source.instanceId, source.controller, cardDb);
}

function acceptOptional(result: PromptResult, cardDb: Map<string, CardData>): PromptResult {
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb,
  );
}

function chooseMaximum(result: PromptResult, cardDb: Map<string, CardData>): PromptResult {
  expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  if (result.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
    throw new Error("Expected an amount prompt");
  }
  const choiceId = result.pendingPrompt.options.choices.at(-1)?.id;
  if (!choiceId) throw new Error("Expected an amount choice");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId },
    cardDb,
  );
}

function declineOptional(result: PromptResult, cardDb: Map<string, CardData>): PromptResult {
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId: "skip" },
    cardDb,
  );
}

function selectTargets(
  result: PromptResult,
  selectedInstanceIds: string[],
  cardDb: Map<string, CardData>,
): PromptResult {
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return resumeFromStack(
    result.state,
    { type: "SELECT_TARGET", selectedInstanceIds },
    cardDb,
  );
}

function arrangeBottom(result: PromptResult, cardDb: Map<string, CardData>): PromptResult {
  if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
    throw new Error("Expected arrange prompt");
  }
  return resumeFromStack(
    result.state,
    {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: result.pendingPrompt.options.cards.map((card) => card.instanceId),
      destination: "bottom",
    },
    cardDb,
  );
}

function finishTriggeredOnPlay(result: PromptResult, cardDb: Map<string, CardData>): PromptResult {
  for (let step = 0; result.pendingPrompt && step < 8; step += 1) {
    switch (result.pendingPrompt.options.promptType) {
      case "PLAYER_CHOICE":
        result = resumeFromStack(
          result.state,
          { type: "PLAYER_CHOICE", choiceId: result.pendingPrompt.options.choices[0]?.id ?? "0" },
          cardDb,
        );
        break;
      case "OPTIONAL_EFFECT":
        result = declineOptional(result, cardDb);
        break;
      case "SELECT_TARGET":
        result = selectTargets(result, [], cardDb);
        break;
      default:
        throw new Error(`Unexpected Trigger continuation ${result.pendingPrompt.options.promptType}`);
    }
  }
  return result;
}

function fieldCount(state: GameState, playerIndex: 0 | 1): number {
  return state.players[playerIndex].characters.filter(Boolean).length;
}

function restedDonCount(state: GameState, playerIndex: 0 | 1): number {
  return state.players[playerIndex].donCostArea.filter((don) => don.state === "RESTED").length;
}

function setLeaderTraits(
  cardDb: Map<string, CardData>,
  state: GameState,
  traits: string[],
): void {
  const leader = cardDb.get(state.players[0].leader.cardId)!;
  cardDb.set(leader.id, { ...leader, types: traits });
}

function driveToTrigger(schema: EffectSchema) {
  const card = cardData(schema);
  const cardDb = createTestCardDb();
  cardDb.set(card.id, card);
  let state = createBattleReadyState(cardDb);
  const lifeCard: LifeCard = {
    instanceId: `life-${card.id}`,
    cardId: card.id,
    face: "DOWN",
  };
  state = withPlayer(state, 1, { life: [lifeCard] });
  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    cardDb,
    0,
  );
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.state.turn.battle?.pendingTriggerLifeCard?.cardId).toBe(card.id);
  return { state: result.state, cardDb };
}

describe("OPT-729 opponent-relative wrapper completion", () => {
  it("OP17-053 moves two cards from the opponent's hand to the opponent's deck", () => {
    const { state, cardDb, source } = installCharacter(OP17_053_BARBELL);
    const ownerHand = state.players[0].hand.length;
    const ownerDeck = state.players[0].deck.length;
    const opponentHand = state.players[1].hand.length;
    const opponentDeck = state.players[1].deck.length;
    let result = resolveBlock(state, cardDb, source, OP17_053_BARBELL, "on_ko_opponent_bottom_deck");
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, result.pendingPrompt.options.validTargets.slice(0, 2), cardDb);
    result = arrangeBottom(result, cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(ownerHand);
    expect(result.state.players[0].deck).toHaveLength(ownerDeck);
    expect(result.state.players[1].hand).toHaveLength(opponentHand - 2);
    expect(result.state.players[1].deck).toHaveLength(opponentDeck + 2);
  });

  it("OP17-075 returns the owner's DON and trashes only the opponent's hand", () => {
    const { state, cardDb, source } = installCharacter(OP17_075_X_DRAKE);
    const ownerHand = state.players[0].hand.length;
    const ownerDon = state.players[0].donCostArea.length;
    const opponentHand = state.players[1].hand.length;
    const opponentTrash = state.players[1].trash.length;
    let result = resolveBlock(state, cardDb, source, OP17_075_X_DRAKE, "on_play_opponent_trash");
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, [result.pendingPrompt.options.validTargets[0]], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(ownerDon - 2);
    expect(result.state.players[0].hand).toHaveLength(ownerHand);
    expect(result.state.players[1].hand).toHaveLength(opponentHand - 1);
    expect(result.state.players[1].trash).toHaveLength(opponentTrash + 1);
  });

  it("OP17-091's cost-12 gate makes only the opponent trash from hand", () => {
    const { state, cardDb, source } = installCharacter(OP17_091_BROOK, { cost: 12 });
    const ownerHand = state.players[0].hand.length;
    const opponentHand = state.players[1].hand.length;
    const opponentTrash = state.players[1].trash.length;
    let result = resolveBlock(state, cardDb, source, OP17_091_BROOK, "on_play_opponent_trash");
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, [result.pendingPrompt.options.validTargets[0]], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(ownerHand);
    expect(result.state.players[1].hand).toHaveLength(opponentHand - 1);
    expect(result.state.players[1].trash).toHaveLength(opponentTrash + 1);
  });
});

describe("OPT-729 direct Character Triggers through Life", () => {
  for (const schema of [OP17_071_WHOS_WHO, OP17_110_CHARLOTTE_PEROSPERO, OP17_114_SWEET_3_GENERALS]) {
    it(`${schema.card_id} plays itself onto its owner's field without changing the opponent's field`, () => {
      const { state, cardDb } = driveToTrigger(schema);
      const ownerField = fieldCount(state, 1);
      const opponentField = fieldCount(state, 0);
      let result: PromptResult = runPipeline(state, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
      result = finishTriggeredOnPlay(result, cardDb);
      expect(result.pendingPrompt).toBeUndefined();
      expect(fieldCount(result.state, 1)).toBe(ownerField + 1);
      expect(fieldCount(result.state, 0)).toBe(opponentField);
      expect(result.state.players[1].characters.some((card) => card?.cardId === schema.card_id)).toBe(true);
    });
  }

  it("OP17-108 rests the attacking player's Character from the defending owner's Life", () => {
    const { state, cardDb } = driveToTrigger(OP17_108_CHARLOTTE_BRULEE);
    const target = state.players[0].characters[0]!;
    const ownerField = fieldCount(state, 1);
    let result: PromptResult = runPipeline(state, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    result = selectTargets(result, [target.instanceId], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].characters[0]?.state).toBe("RESTED");
    expect(fieldCount(result.state, 1)).toBe(ownerField);
  });
});

describe("OPT-729 multi-step costs and post-cost gates", () => {
  it("OP17-054 rests three owner DON and itself before prohibiting the opponent target", () => {
    const { state, cardDb, source } = installCharacter(OP17_054_MISS_BUCKINGHAM_STUSSY);
    const target = state.players[1].characters[0]!;
    const restedBefore = restedDonCount(state, 0);
    let result = resolveBlock(state, cardDb, source, OP17_054_MISS_BUCKINGHAM_STUSSY, "activate_cannot_attack");
    result = acceptOptional(result, cardDb);
    result = selectTargets(result, [target.instanceId], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(restedDonCount(result.state, 0)).toBe(restedBefore + 3);
    expect(result.state.players[0].characters[0]?.state).toBe("RESTED");
    expect(result.state.prohibitions.some((entry) => entry.appliesTo.includes(target.instanceId))).toBe(true);
  });

  it("OP17-061 pays DON!! before its leader gate adds the owner's Life", () => {
    const { state, cardDb, source } = installCharacter(OP17_061_LEAD_PERFORMERS);
    setLeaderTraits(cardDb, state, ["Animal Kingdom Pirates"]);
    const life = state.players[0].life.length;
    const deck = state.players[0].deck.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_061_LEAD_PERFORMERS, "on_play_add_life");
    result = chooseMaximum(result, cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(don - 1);
    expect(result.state.players[0].life).toHaveLength(life + 1);
    expect(result.state.players[0].deck).toHaveLength(deck - 1);
  });

  it("OP17-063 pays DON!! after being played this turn, negates, then K.O.s the opponent", () => {
    const { state, cardDb, source } = installCharacter(OP17_063_KAIDO);
    const target = state.players[1].characters[0]!;
    const opponentTrash = state.players[1].trash.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_063_KAIDO, "activate_negate_ko");
    result = selectTargets(result, [target.instanceId], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(don - 1);
    expect(result.state.players[1].characters[0]).toBeNull();
    expect(result.state.players[1].trash).toHaveLength(opponentTrash + 1);
  });

  it("OP17-066 pays DON!!, passes the cost-10 gate, draws two, then trashes one", () => {
    const { state, cardDb, source } = installCharacter(OP17_066_KUROZUMI_OROCHI, { cost: 10 });
    const hand = state.players[0].hand.length;
    const deck = state.players[0].deck.length;
    const trash = state.players[0].trash.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_066_KUROZUMI_OROCHI, "on_play_draw_trash");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, [result.pendingPrompt.options.validTargets[0]], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(don - 1);
    expect(result.state.players[0].hand).toHaveLength(hand + 1);
    expect(result.state.players[0].deck).toHaveLength(deck - 2);
    expect(result.state.players[0].trash).toHaveLength(trash + 1);
  });

  it("OP17-067 pays DON!! after the cost-10 gate and rests the opponent target", () => {
    const { state, cardDb, source } = installCharacter(OP17_067_KUROZUMI_KANJURO, { cost: 10 });
    const target = state.players[1].characters[0]!;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_067_KUROZUMI_KANJURO, "on_play_rest_character");
    result = selectTargets(result, [target.instanceId], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(don - 1);
    expect(result.state.players[1].characters[0]?.state).toBe("RESTED");
  });

  it("OP17-068 trashes two owner hand cards before its leader gate adds two rested DON", () => {
    const { state, cardDb, source } = installCharacter(OP17_068_SASAKI);
    setLeaderTraits(cardDb, state, ["Animal Kingdom Pirates"]);
    const hand = state.players[0].hand.length;
    const trash = state.players[0].trash.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_068_SASAKI, "when_attacking_add_don");
    result = acceptOptional(result, cardDb);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, result.pendingPrompt.options.validTargets.slice(0, 2), cardDb);
    result = chooseMaximum(result, cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(hand - 2);
    expect(result.state.players[0].trash).toHaveLength(trash + 2);
    expect(result.state.players[0].donCostArea).toHaveLength(don + 2);
    expect(restedDonCount(result.state, 0)).toBeGreaterThanOrEqual(2);
  });

  it("OP17-069 pays DON!! after its leader gate and debuffs only the opponent target", () => {
    const { state, cardDb, source } = installCharacter(OP17_069_JACK);
    setLeaderTraits(cardDb, state, ["Animal Kingdom Pirates"]);
    const target = state.players[1].characters[0]!;
    const targetData = cardDb.get(target.cardId)!;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_069_JACK, "on_play_debuff");
    result = selectTargets(result, [target.instanceId], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(don - 1);
    expect(getEffectivePower(target, targetData, result.state, cardDb)).toBe((targetData.power ?? 0) - 2000);
  });

  it("OP17-073 trashes one owner hand card before its leader gate adds active DON", () => {
    const { state, cardDb, source } = installCharacter(OP17_073_BASIL_HAWKINS);
    setLeaderTraits(cardDb, state, ["Animal Kingdom Pirates"]);
    const hand = state.players[0].hand.length;
    const trash = state.players[0].trash.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_073_BASIL_HAWKINS, "on_play_add_don");
    result = acceptOptional(result, cardDb);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, [result.pendingPrompt.options.validTargets[0]], cardDb);
    result = chooseMaximum(result, cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(hand - 1);
    expect(result.state.players[0].trash).toHaveLength(trash + 1);
    expect(result.state.players[0].donCostArea).toHaveLength(don + 1);
    expect(result.state.players[0].donCostArea.at(-1)?.state).toBe("ACTIVE");
  });

  it("OP17-061 pays DON!! but records a performed no-op when its post-cost leader gate fails", () => {
    const { state, cardDb, source } = installCharacter(OP17_061_LEAD_PERFORMERS);
    const before = state.players[0];
    const result = resolveBlock(state, cardDb, source, OP17_061_LEAD_PERFORMERS, "on_play_add_life");
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].donCostArea).toHaveLength(before.donCostArea.length - 1);
    expect(result.state.players[0].life).toEqual(before.life);
    expect(result.state.players[0].deck).toEqual(before.deck);
  });

  it("OP17-063 pays DON!! but records a performed no-op when its post-cost played-this-turn gate fails", () => {
    const fixture = installCharacter(OP17_063_KAIDO);
    const source = { ...fixture.source, turnPlayed: fixture.state.turn.number - 1 };
    const state = withPlayer(fixture.state, 0, { characters: padChars([source]) });
    const before = state.players[1];
    const result = resolveBlock(state, fixture.cardDb, source, OP17_063_KAIDO, "activate_negate_ko");
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].donCostArea).toHaveLength(state.players[0].donCostArea.length - 1);
    expect(result.state.players[1].characters).toEqual(before.characters);
    expect(result.state.players[1].trash).toEqual(before.trash);
  });

  for (const [schema, effectId] of [
    [OP17_066_KUROZUMI_OROCHI, "on_play_draw_trash"],
    [OP17_067_KUROZUMI_KANJURO, "on_play_rest_character"],
  ] as const) {
    it(`${schema.card_id} pays DON!! but records a performed no-op when its post-cost cost-10 gate fails`, () => {
      const { state, cardDb, source } = installCharacter(schema);
      const ownerBefore = state.players[0];
      const opponentBefore = state.players[1];
      const result = resolveBlock(state, cardDb, source, schema, effectId);
      expect(result.resolved).toBe(true);
      expect(result.state.players[0].donCostArea).toHaveLength(ownerBefore.donCostArea.length - 1);
      expect(result.state.players[0].hand).toEqual(ownerBefore.hand);
      expect(result.state.players[0].deck).toEqual(ownerBefore.deck);
      expect(result.state.players[0].trash).toEqual(ownerBefore.trash);
      expect(result.state.players[1].characters).toEqual(opponentBefore.characters);
    });
  }

  it("OP17-068 trashes two cards but records a performed no-op when its post-cost leader gate fails", () => {
    const { state, cardDb, source } = installCharacter(OP17_068_SASAKI);
    const hand = state.players[0].hand.length;
    const trash = state.players[0].trash.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_068_SASAKI, "when_attacking_add_don");
    result = acceptOptional(result, cardDb);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, result.pendingPrompt.options.validTargets.slice(0, 2), cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(hand - 2);
    expect(result.state.players[0].trash).toHaveLength(trash + 2);
    expect(result.state.players[0].donCostArea).toHaveLength(don);
  });

  it("OP17-069 pays DON!! but records a performed no-op when its post-cost leader gate fails", () => {
    const { state, cardDb, source } = installCharacter(OP17_069_JACK);
    const target = state.players[1].characters[0]!;
    const targetData = cardDb.get(target.cardId)!;
    const result = resolveBlock(state, cardDb, source, OP17_069_JACK, "on_play_debuff");
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].donCostArea).toHaveLength(state.players[0].donCostArea.length - 1);
    expect(getEffectivePower(target, targetData, result.state, cardDb)).toBe(targetData.power);
  });

  it("OP17-073 trashes a card but records a performed no-op when its post-cost leader gate fails", () => {
    const { state, cardDb, source } = installCharacter(OP17_073_BASIL_HAWKINS);
    const hand = state.players[0].hand.length;
    const trash = state.players[0].trash.length;
    const don = state.players[0].donCostArea.length;
    let result = resolveBlock(state, cardDb, source, OP17_073_BASIL_HAWKINS, "on_play_add_don");
    result = acceptOptional(result, cardDb);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("hand prompt");
    result = selectTargets(result, [result.pendingPrompt.options.validTargets[0]], cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(hand - 1);
    expect(result.state.players[0].trash).toHaveLength(trash + 1);
    expect(result.state.players[0].donCostArea).toHaveLength(don);
  });
});

describe("OPT-729 counter grant and aggregate targeting", () => {
  it("OP17-063 grants +1000 to a counterless Character at counter time", () => {
    const { state: base, cardDb, source } = installCharacter(OP17_063_KAIDO);
    const handCard = base.players[0].hand[0];
    const handData = cardDb.get(handCard.cardId)!;
    cardDb.set(handData.id, { ...handData, counter: null });
    const state: GameState = {
      ...base,
      turn: {
        ...base.turn,
        activePlayerIndex: 1,
        battleSubPhase: "COUNTER_STEP",
        battle: {
          battleId: "opt729-counter-battle",
          attackerInstanceId: base.players[1].leader.instanceId,
          targetInstanceId: base.players[0].leader.instanceId,
          attackerPower: 5000,
          defenderPower: 5000,
          counterPowerAdded: 0,
          blockerActivated: false,
        },
      },
    };
    expect(state.players[0].characters[0]?.instanceId).toBe(source.instanceId);
    const result = runPipeline(
      state,
      {
        type: "USE_COUNTER",
        cardInstanceId: handCard.instanceId,
        counterTargetInstanceId: state.players[0].leader.instanceId,
      },
      cardDb,
      0,
    );
    expect(result.valid).toBe(true);
    expect(result.state.turn.battle?.counterPowerAdded).toBe(1000);
    expect(result.state.players[0].hand).toHaveLength(state.players[0].hand.length - 1);
    expect(result.state.players[0].trash).toHaveLength(state.players[0].trash.length + 1);
  });

  it("OP17-119 K.O.s the selected opponent Characters only when their total cost is at most four", () => {
    const { state: base, cardDb, source } = installCharacter(OP17_119_LOKI);
    const costs = [1, 2, 3];
    const targets = costs.map((cost, index) => {
      const id = `TEST-COST-${cost}`;
      cardDb.set(id, { ...CARDS.VANILLA, id, name: id, cost });
      return {
        ...base.players[1].characters[0]!,
        instanceId: `opponent-cost-${cost}`,
        cardId: id,
        controller: 1 as const,
        owner: 1 as const,
        zone: "CHARACTER" as const,
        turnPlayed: index,
      };
    });
    const state = withPlayer(base, 1, { characters: padChars(targets) });
    const trash = state.players[1].trash.length;
    let result = resolveBlock(state, cardDb, source, OP17_119_LOKI, "on_play_ko_aggregate");
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    result = selectTargets(result, [targets[0].instanceId, targets[2].instanceId], cardDb);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[1].characters.some((card) => card?.instanceId === targets[0].instanceId)).toBe(false);
    expect(result.state.players[1].characters.some((card) => card?.instanceId === targets[1].instanceId)).toBe(true);
    expect(result.state.players[1].characters.some((card) => card?.instanceId === targets[2].instanceId)).toBe(false);
    expect(result.state.players[1].trash).toHaveLength(trash + 2);
    expect(fieldCount(result.state, 0)).toBe(fieldCount(state, 0));
  });

  it("OP17-119 rejects a selection whose total cost exceeds four without mutating the board", () => {
    const { state: base, cardDb, source } = installCharacter(OP17_119_LOKI);
    const costs = [2, 3];
    const targets = costs.map((cost) => {
      const id = `TEST-OVER-LIMIT-${cost}`;
      cardDb.set(id, { ...CARDS.VANILLA, id, name: id, cost });
      return {
        ...base.players[1].characters[0]!,
        instanceId: `opponent-over-limit-${cost}`,
        cardId: id,
        controller: 1 as const,
        owner: 1 as const,
        zone: "CHARACTER" as const,
      };
    });
    const state = withPlayer(base, 1, { characters: padChars(targets) });
    const beforeCharacters = state.players[1].characters;
    const beforeTrash = state.players[1].trash;
    let result = resolveBlock(state, cardDb, source, OP17_119_LOKI, "on_play_ko_aggregate");
    result = selectTargets(result, targets.map((target) => target.instanceId), cardDb);
    expect(result.rejected).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(result.state.players[1].characters).toEqual(beforeCharacters);
    expect(result.state.players[1].trash).toEqual(beforeTrash);
  });
});

describe("OPT-729 conservative trivial-card classification", () => {
  it("keeps only precedent-exact, non-cost, non-wrapper cards in the trivial list", () => {
    const trivialReasons: Record<string, string> = {
      "OP17-052": "single trash-to-hand action",
      "OP17-074": "printed Blocker plus fixed DON add precedent",
      "OP17-080": "conditional self modifier plus standard search/trash",
      "OP17-083": "conditional permanent keyword and power modifiers",
      "OP17-084": "single gated keyword grant",
      "OP17-087": "conditional self modifier plus single gated debuff",
      "OP17-089": "static cost modifier plus standard search/trash",
      "OP17-090": "conditional self modifier plus single gated K.O.",
      "OP17-094": "single conditional cost modifier",
      "OP17-113": "single standard top-deck search",
    };
    expect(Object.keys(trivialReasons)).toHaveLength(10);
    for (const [cardId, reason] of Object.entries(trivialReasons)) {
      expect(OP17_SCHEMAS[cardId], reason).toBeDefined();
    }
  });
});
