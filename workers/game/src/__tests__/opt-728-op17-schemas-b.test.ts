/**
 * OPT-728 — OP17 Character schema integration coverage.
 *
 * These regressions resolve opponent-relative wrappers, paid effects,
 * post-cost gates, and Character Triggers through the live resolver paths.
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
import { runPipeline } from "../engine/pipeline.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import type { EffectResolverResult } from "../engine/effect-resolver/types.js";
import {
  checkReplacementForRemoval,
  resumeReplacement,
  type ReplacementResumeContext,
} from "../engine/replacements.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  registerPermanentEffectsForCard,
  registerReplacementsForCard,
  registerTriggersForCard,
} from "../engine/triggers.js";
import {
  OP17_042_KAIDO,
  OP17_043_GANZUI,
  OP17_044_CAPTAIN_JOHN,
  OP17_045_KYO,
  OP17_047_SHIKI,
  OP17_049_CHARLOTTE_LINLIN,
  OP17_101_CARIBOU,
  OP17_102_CHARLOTTE_OVEN,
  OP17_103_CHARLOTTE_KATAKURI,
  OP17_104_CHARLOTTE_CRACKER,
  OP17_106_CHARLOTTE_SMOOTHIE,
  OP17_107_CHARLOTTE_DAIFUKU,
} from "../engine/schemas/op17.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

type PromptResult = {
  state: GameState;
  pendingPrompt?: PendingPromptState;
};

function withPlayer(
  state: GameState,
  playerIndex: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function chooseMaximum(
  result: PromptResult,
  cardDb: Map<string, CardData>
): EffectResolverResult {
  expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  if (result.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
    throw new Error("Expected an amount prompt");
  }
  const choiceId = result.pendingPrompt.options.choices.at(-1)?.id;
  if (!choiceId) throw new Error("Expected an amount choice");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId },
    cardDb
  );
}

function cardData(
  schema: EffectSchema,
  overrides: Partial<CardData> = {}
): CardData {
  return {
    ...CARDS.VANILLA,
    id: schema.card_id!,
    name: schema.card_name!,
    type: "Character",
    cost: 1,
    power: 5000,
    effectSchema: schema,
    triggerText: schema.effects.some(
      (block) =>
        block.trigger &&
        "keyword" in block.trigger &&
        block.trigger.keyword === "TRIGGER"
    )
      ? "[Trigger] effect"
      : null,
    keywords: {
      ...CARDS.VANILLA.keywords,
      trigger: schema.effects.some(
        (block) =>
          block.trigger &&
          "keyword" in block.trigger &&
          block.trigger.keyword === "TRIGGER"
      ),
    },
    ...overrides,
  };
}

function installCharacter(schema: EffectSchema): {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
} {
  const cardDb = createTestCardDb();
  const data = cardData(schema);
  cardDb.set(data.id, data);
  let state = createBattleReadyState(cardDb);
  const source: CardInstance = {
    ...state.players[0].characters[0]!,
    instanceId: `source-${data.id}`,
    cardId: data.id,
    state: "ACTIVE",
    controller: 0,
    owner: 0,
  };
  state = withPlayer(state, 0, { characters: padChars([source]) });
  return { state, cardDb, source };
}

function resolveBlock(
  state: GameState,
  cardDb: Map<string, CardData>,
  source: CardInstance,
  schema: EffectSchema,
  effectId: string
) {
  const block = schema.effects.find((candidate) => candidate.id === effectId);
  if (!block) throw new Error(`Missing effect ${effectId}`);
  return resolveEffect(state, block, source.instanceId, source.controller, cardDb);
}

function acceptOptional(result: PromptResult, cardDb: Map<string, CardData>) {
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb
  );
}

function declineOptional(result: PromptResult, cardDb: Map<string, CardData>) {
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId: "skip" },
    cardDb
  );
}

function choose(
  result: PromptResult,
  choiceId: string,
  cardDb: Map<string, CardData>
) {
  expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId },
    cardDb
  );
}

function selectTargets(
  result: PromptResult,
  selectedInstanceIds: string[],
  cardDb: Map<string, CardData>
) {
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return resumeFromStack(
    result.state,
    { type: "SELECT_TARGET", selectedInstanceIds },
    cardDb
  );
}

function driveToTrigger(card: CardData): {
  state: GameState;
  cardDb: Map<string, CardData>;
} {
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
    0
  );
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.valid).toBe(true);
  expect(result.state.turn.battle?.pendingTriggerLifeCard?.cardId).toBe(card.id);
  return { state: result.state, cardDb };
}

function fieldCount(state: GameState, playerIndex: 0 | 1): number {
  return state.players[playerIndex].characters.filter(Boolean).length;
}

function restedDonCount(state: GameState, playerIndex: 0 | 1): number {
  return state.players[playerIndex].donCostArea.filter(
    (don) => don.state === "RESTED"
  ).length;
}

describe("OPT-728 opponent-relative controller regressions", () => {
  it("OP17-047 fires at end of turn when its owner has 2 cards in hand", () => {
    const { state: base, cardDb, source } = installCharacter(OP17_047_SHIKI);
    let state = withPlayer(base, 0, { hand: base.players[0].hand.slice(0, 2) });
    state = registerTriggersForCard(state, source, cardDb.get(source.cardId)!);
    const ownerHandBefore = state.players[0].hand.length;
    const opponentHandBefore = state.players[1].hand.length;
    const opponentDeckBefore = state.players[1].deck.length;
    const result = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected opponent hand selection");
    }
    const completed = selectTargets(
      result,
      [result.pendingPrompt.options.validTargets[0]],
      cardDb
    );

    expect(completed.pendingPrompt).toBeUndefined();
    expect(completed.state.players[0].hand).toHaveLength(ownerHandBefore);
    expect(completed.state.players[1].hand).toHaveLength(opponentHandBefore - 1);
    expect(completed.state.players[1].deck).toHaveLength(opponentDeckBefore + 1);
  });

  it("OP17-047 does not fire at end of turn when its owner has 3 cards in hand", () => {
    const { state: base, cardDb, source } = installCharacter(OP17_047_SHIKI);
    let state = withPlayer(base, 0, { hand: base.players[0].hand.slice(0, 3) });
    state = registerTriggersForCard(state, source, cardDb.get(source.cardId)!);
    const opponentHandBefore = state.players[1].hand.length;
    const opponentDeckBefore = state.players[1].deck.length;

    const result = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, 0);

    expect(result.valid).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[1].hand).toHaveLength(opponentHandBefore);
    expect(result.state.players[1].deck).toHaveLength(opponentDeckBefore);
  });

  it("OP17-049 makes the opponent trash two cards from their own hand", () => {
    const { state, cardDb, source } = installCharacter(
      OP17_049_CHARLOTTE_LINLIN
    );
    const ownerHandBefore = state.players[0].hand.length;
    const opponentHandBefore = state.players[1].hand.length;
    const opponentTrashBefore = state.players[1].trash.length;
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_049_CHARLOTTE_LINLIN,
      "on_play_opponent_choice"
    );
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    result = choose(result, "1", cardDb);
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected opponent hand selection");
    }
    result = selectTargets(
      result,
      result.pendingPrompt.options.validTargets.slice(0, 2),
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(ownerHandBefore);
    expect(result.state.players[1].hand).toHaveLength(opponentHandBefore - 2);
    expect(result.state.players[1].trash).toHaveLength(opponentTrashBefore + 2);
  });

  it("OP17-106 adds the owner's Life before the opponent trashes from their hand", () => {
    const { state, cardDb, source } = installCharacter(
      OP17_106_CHARLOTTE_SMOOTHIE
    );
    const ownerLifeBefore = state.players[0].life.length;
    const ownerHandBefore = state.players[0].hand.length;
    const opponentHandBefore = state.players[1].hand.length;
    const opponentTrashBefore = state.players[1].trash.length;
    const restedBefore = restedDonCount(state, 0);
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_106_CHARLOTTE_SMOOTHIE,
      "on_play_life_opponent_trash"
    );
    result = acceptOptional(result, cardDb);
    result = chooseMaximum(result, cardDb);
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected opponent hand selection");
    }
    result = selectTargets(
      result,
      [result.pendingPrompt.options.validTargets[0]],
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(restedDonCount(result.state, 0)).toBe(restedBefore + 2);
    expect(result.state.players[0].life).toHaveLength(ownerLifeBefore + 1);
    expect(result.state.players[0].hand).toHaveLength(ownerHandBefore);
    expect(result.state.players[1].hand).toHaveLength(opponentHandBefore - 1);
    expect(result.state.players[1].trash).toHaveLength(opponentTrashBefore + 1);
  });
});

describe("OPT-728 paid and post-cost effects", () => {
  it.each([
    ["OP17-043", OP17_043_GANZUI],
    ["OP17-045", OP17_045_KYO],
  ])("%s offers its removal replacement only with at least 2 hand cards", (_cardId, schema) => {
    const buildState = (handSize: number) => {
      const { state: base, cardDb, source } = installCharacter(schema);
      let state = withPlayer(base, 0, {
        hand: base.players[0].hand.slice(0, handSize),
      });
      state = registerReplacementsForCard(
        state,
        source,
        cardDb.get(source.cardId)!
      );
      return { state, cardDb, source };
    };

    const insufficient = buildState(1);
    const unavailable = checkReplacementForRemoval(
      insufficient.state,
      insufficient.source.instanceId,
      1,
      insufficient.cardDb,
      resolverExecutionServices
    );
    expect(unavailable.replaced).toBe(false);
    expect(unavailable.pendingPrompt).toBeUndefined();
    expect(unavailable.state.players[0].hand).toHaveLength(1);

    const sufficient = buildState(2);
    const offered = checkReplacementForRemoval(
      sufficient.state,
      sufficient.source.instanceId,
      1,
      sufficient.cardDb,
      resolverExecutionServices
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const completed = resumeReplacement(
      offered.state,
      offered.pendingPrompt!.resumeContext as ReplacementResumeContext,
      true,
      sufficient.cardDb,
      resolverExecutionServices
    );
    expect(completed.replaced).toBe(true);
    expect(completed.pendingPrompt).toBeUndefined();
    expect(completed.state.players[0].hand).toHaveLength(0);
    expect(completed.state.players[0].trash).toHaveLength(
      sufficient.state.players[0].trash.length + 2
    );
  });

  it("OP17-044 blocks attacks away from rested Captain John", () => {
    const { state: base, cardDb, source } = installCharacter(
      OP17_044_CAPTAIN_JOHN
    );
    const leaderData = cardDb.get(base.players[0].leader.cardId)!;
    cardDb.set(leaderData.id, { ...leaderData, types: ["Rocks Pirates"] });
    const restedSource = { ...source, state: "RESTED" as const };
    let state = withPlayer(base, 0, { characters: padChars([restedSource]) });
    state = registerPermanentEffectsForCard(
      state,
      restedSource,
      cardDb.get(restedSource.cardId)!
    );
    state = {
      ...state,
      turn: { ...state.turn, activePlayerIndex: 1 },
    };
    const attacker = state.players[1].leader;

    const forbidden = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[0].leader.instanceId,
      },
      cardDb,
      1
    );
    expect(forbidden.valid).toBe(false);
    expect(forbidden.state.players[1].leader.state).toBe("ACTIVE");

    let allowed = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: restedSource.instanceId,
      },
      cardDb,
      1
    );
    expect(allowed.valid).toBe(true);
    expect(allowed.state.players[1].leader.state).toBe("RESTED");
    expect(allowed.state.turn.battle?.targetInstanceId).toBe(
      restedSource.instanceId
    );
    allowed = runPipeline(allowed.state, { type: "PASS" }, cardDb, 1);
    expect(allowed.valid).toBe(true);
    allowed = runPipeline(allowed.state, { type: "PASS" }, cardDb, 1);
    expect(allowed.valid).toBe(true);
    expect(allowed.state.turn.battle).toBeNull();
    expect(
      allowed.state.players[0].characters.some(
        (card) => card?.instanceId === restedSource.instanceId
      )
    ).toBe(false);
    expect(
      allowed.state.players[0].trash.some(
        (card) => card.cardId === restedSource.cardId
      )
    ).toBe(true);
  });

  it("OP17-042 reveals three Rocks cards before completing the debuff", () => {
    const { state: base, cardDb, source } = installCharacter(OP17_042_KAIDO);
    const rocksData = cardData(
      { card_id: "TEST-ROCKS", card_name: "Rocks card", effects: [] },
      { id: "TEST-ROCKS", name: "Rocks card", types: ["Rocks Pirates"] }
    );
    cardDb.set(rocksData.id, rocksData);
    const rocksCards = base.players[0].hand.slice(0, 3).map((card, index) => ({
      ...card,
      instanceId: `rocks-hand-${index}`,
      cardId: rocksData.id,
    }));
    const state = withPlayer(base, 0, {
      hand: [...rocksCards, ...base.players[0].hand.slice(3)],
    });
    const target = state.players[1].characters[0]!;
    const targetData = cardDb.get(target.cardId)!;
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_042_KAIDO,
      "on_play_reveal_debuff"
    );
    result = acceptOptional(result, cardDb);
    result = selectTargets(
      result,
      rocksCards.map((card) => card.instanceId),
      cardDb
    );
    result = selectTargets(result, [target.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(state.players[0].hand.length);
    expect(
      getEffectivePower(target, targetData, result.state, cardDb)
    ).toBe((targetData.power ?? 0) - 3000);
  });

  it("OP17-044 rests itself, draws, and trashes to complete its activation", () => {
    const { state, cardDb, source } = installCharacter(
      OP17_044_CAPTAIN_JOHN
    );
    const handBefore = state.players[0].hand.length;
    const deckBefore = state.players[0].deck.length;
    const trashBefore = state.players[0].trash.length;
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_044_CAPTAIN_JOHN,
      "activate_draw_trash"
    );
    result = acceptOptional(result, cardDb);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected hand trash selection");
    }
    result = selectTargets(
      result,
      [result.pendingPrompt.options.validTargets[0]],
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].characters[0]?.state).toBe("RESTED");
    expect(result.state.players[0].hand).toHaveLength(handBefore);
    expect(result.state.players[0].deck).toHaveLength(deckBefore - 1);
    expect(result.state.players[0].trash).toHaveLength(trashBefore + 1);
  });

  it("OP17-104 pays DON!! before its Big Mom post-cost gate adds Life", () => {
    const { state, cardDb, source } = installCharacter(
      OP17_104_CHARLOTTE_CRACKER
    );
    const leaderData = cardDb.get(state.players[0].leader.cardId)!;
    cardDb.set(leaderData.id, { ...leaderData, types: ["Big Mom Pirates"] });
    const lifeBefore = state.players[0].life.length;
    const deckBefore = state.players[0].deck.length;
    const restedBefore = restedDonCount(state, 0);
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_104_CHARLOTTE_CRACKER,
      "on_play_rest_don_add_life"
    );
    result = acceptOptional(result, cardDb);
    result = chooseMaximum(result, cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(restedDonCount(result.state, 0)).toBe(restedBefore + 2);
    expect(result.state.players[0].life).toHaveLength(lifeBefore + 1);
    expect(result.state.players[0].deck).toHaveLength(deckBefore - 1);
  });
});

describe("OPT-728 direct Character Trigger blocks", () => {
  it("OP17-101 pays its Trigger hand cost and K.O.s the opponent's Character", () => {
    const card = cardData(OP17_101_CARIBOU);
    const { state, cardDb } = driveToTrigger(card);
    const ownerHandBefore = state.players[1].hand.length;
    const opponentTrashBefore = state.players[0].trash.length;
    const target = state.players[0].characters[0]!;
    let result: PromptResult = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    result = acceptOptional(result, cardDb);
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected Trigger hand-cost selection");
    }
    const costTarget = result.pendingPrompt.options.validTargets.find(
      (instanceId) => instanceId !== `life-${card.id}`
    )!;
    result = selectTargets(result, [costTarget], cardDb);
    result = selectTargets(result, [target.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[1].hand).toHaveLength(ownerHandBefore - 1);
    expect(result.state.players[0].characters[0]).toBeNull();
    expect(result.state.players[0].trash).toHaveLength(opponentTrashBefore + 1);
  });

  for (const schema of [
    OP17_102_CHARLOTTE_OVEN,
    OP17_103_CHARLOTTE_KATAKURI,
    OP17_104_CHARLOTTE_CRACKER,
    OP17_106_CHARLOTTE_SMOOTHIE,
    OP17_107_CHARLOTTE_DAIFUKU,
  ]) {
    it(`${schema.card_id} plays itself from Life and changes only its owner's field`, () => {
      const card = cardData(schema);
      const { state, cardDb } = driveToTrigger(card);
      const ownerFieldBefore = fieldCount(state, 1);
      const opponentFieldBefore = fieldCount(state, 0);
      const ownerHandBefore = state.players[1].hand.length;
      let result: PromptResult = runPipeline(
        state,
        { type: "REVEAL_TRIGGER", reveal: true },
        cardDb,
        1
      );
      if (result.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
        result = declineOptional(result, cardDb);
      }

      expect(result.pendingPrompt).toBeUndefined();
      expect(fieldCount(result.state, 1)).toBe(ownerFieldBefore + 1);
      expect(fieldCount(result.state, 0)).toBe(opponentFieldBefore);
      expect(result.state.players[1].hand).toHaveLength(ownerHandBefore);
      expect(
        result.state.players[1].characters.some(
          (candidate) => candidate?.cardId === schema.card_id
        )
      ).toBe(true);
    });
  }
});
