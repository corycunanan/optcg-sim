import { describe, expect, it } from "vitest";
import type {
  ActionOf,
  EffectBlock,
  EffectSchema,
  Target,
} from "../engine/effect-types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { computeAllValidTargets } from "../engine/effect-resolver/target-resolver.js";
import {
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import { filterStateForPlayer } from "../engine/state.js";
import { filterEventForPlayer } from "../engine/visibility.js";
import { ST07_008_CHARLOTTE_PUDDING } from "../engine/schemas/st07.js";
import { OP15_054_AND_NO_ONE_ELSE } from "../engine/schemas/op15.js";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameState,
  PlayerState,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";

function stage(owner: 0 | 1): CardInstance {
  return {
    instanceId: `stage-${owner}`,
    cardId: CARDS.STAGE.id,
    zone: "STAGE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function withDistinctLifeAndStages(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  for (const owner of [0, 1] as const) {
    const topCardId = `LIFE-TOP-${owner}`;
    cardDb.set(topCardId, { ...CARDS.VANILLA, id: topCardId, name: topCardId });
    players[owner] = {
      ...players[owner],
      stage: stage(owner),
      life: players[owner].life.map((card, index) => ({
        ...card,
        cardId: index === 0 ? topCardId : card.cardId,
      })),
    };
  }
  return { ...state, players };
}

function actionBlock(action: ActionOf<"LIFE_SCRY"> | ActionOf<"RETURN_TO_HAND">): EffectBlock {
  return {
    id: "opt-572-action",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [action],
  };
}

function controllerSchema(target: Target): EffectSchema {
  return {
    card_id: "TEST-572",
    card_name: "Controller guard",
    card_type: "Event",
    effects: [{
      id: "controller-guard",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [{ type: "RETURN_TO_HAND", target }],
    }],
  };
}

describe("OPT-572 LIFE_CARD + EITHER", () => {
  it.each(["top", "bottom"] as const)(
    "privately reveals the opponent's selected Life and places it at the %s",
    (destination) => {
      const cardDb = createTestCardDb();
      const state = withDistinctLifeAndStages(createBattleReadyState(cardDb), cardDb);
      const action = ST07_008_CHARLOTTE_PUDDING.effects[0]
        .actions![0] as ActionOf<"LIFE_SCRY">;
      const opponentTop = state.players[1].life[0];

      const offered = resolveEffect(
        state,
        actionBlock(action),
        state.players[0].leader.instanceId,
        0,
        cardDb,
      );
      expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      if (offered.pendingPrompt?.options.promptType !== "SELECT_TARGET") return;
      expect(offered.pendingPrompt.options.validTargets).toEqual([
        ...state.players[0].life.map((card) => card.instanceId),
        ...state.players[1].life.map((card) => card.instanceId),
      ]);
      expect(offered.pendingPrompt.options.blindSelection).toBe(true);

      const chooserOffer = filterStateForPlayer({
        ...offered.state,
        pendingPrompt: offered.pendingPrompt,
      }, 0);
      expect(chooserOffer.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      if (chooserOffer.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        expect(chooserOffer.pendingPrompt.options.cards.every(
          (card) => card.cardId === "hidden",
        )).toBe(true);
      }
      expect(filterStateForPlayer({
        ...offered.state,
        pendingPrompt: offered.pendingPrompt,
      }, 1).pendingPrompt).toBeNull();

      const revealed = resumeFromStack(
        offered.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [opponentTop.instanceId] },
        cardDb,
      );
      expect(revealed.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
      if (revealed.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") return;
      expect(revealed.pendingPrompt.options.cards).toHaveLength(1);
      expect(revealed.pendingPrompt.options.cards[0].cardId).toBe(opponentTop.cardId);
      const scryEvent = revealed.events.find((event) => event.type === "LIFE_SCRIED");
      expect(scryEvent).toBeDefined();
      expect(JSON.stringify(filterEventForPlayer(
        { ...scryEvent!, timestamp: 0 } as GameEvent,
        1,
      )))
        .not.toContain(opponentTop.cardId);
      expect(filterStateForPlayer({
        ...revealed.state,
        pendingPrompt: revealed.pendingPrompt,
      }, 1).pendingPrompt).toBeNull();

      const placed = resumeFromStack(
        revealed.state,
        {
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "",
          orderedInstanceIds: [opponentTop.instanceId],
          destination,
        },
        cardDb,
      );
      const expectedIndex = destination === "top"
        ? 0
        : placed.state.players[1].life.length - 1;
      expect(placed.state.players[1].life[expectedIndex].instanceId)
        .toBe(opponentTop.instanceId);
      expect(placed.state.players[0].life).toEqual(state.players[0].life);
      const reorderEvent = placed.events.find((event) => event.type === "LIFE_REORDERED");
      expect(reorderEvent).toBeDefined();
      expect(JSON.stringify(filterEventForPlayer(
        { ...reorderEvent!, timestamp: 0 } as GameEvent,
        1,
      )))
        .not.toContain(opponentTop.instanceId);
    },
  );
});

describe("OPT-572 STAGE + EITHER", () => {
  it.each([0, 1] as const)("returns player %i's Stage to its owner's hand", (owner) => {
    const cardDb = createTestCardDb();
    const state = withDistinctLifeAndStages(createBattleReadyState(cardDb), cardDb);
    const choice = OP15_054_AND_NO_ONE_ELSE.effects[0]
      .actions![0] as ActionOf<"PLAYER_CHOICE">;
    const action = choice.params!.options![1][0] as ActionOf<"RETURN_TO_HAND">;

    const offered = resolveEffect(
      state,
      actionBlock(action),
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (offered.pendingPrompt?.options.promptType !== "SELECT_TARGET") return;
    expect(offered.pendingPrompt.options.validTargets).toEqual(["stage-0", "stage-1"]);

    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [`stage-${owner}`] },
      cardDb,
    );
    expect(resolved.state.players[owner].stage).toBeNull();
    expect(resolved.state.players[owner].hand.some(
      (card) => card.cardId === CARDS.STAGE.id,
    )).toBe(true);
    expect(resolved.state.players[owner === 0 ? 1 : 0].stage?.instanceId)
      .toBe(`stage-${owner === 0 ? 1 : 0}`);
  });
});

describe("OPT-572 parent controller guard and ANY normalization", () => {
  it("rejects unsupported and ANY controller modes but tolerates shipped redundancy", () => {
    expect(validateEffectSchema(controllerSchema({
      type: "CARD_IN_HAND",
      controller: "EITHER",
    }))).toEqual(expect.arrayContaining([expect.stringContaining("[C8]")]));
    expect(validateEffectSchema(controllerSchema({
      type: "CHARACTER",
      controller: "ANY",
    }))).toEqual(expect.arrayContaining([expect.stringContaining("[C8]")]));
    expect(validateEffectSchema(controllerSchema({
      type: "SELF",
      controller: "SELF",
    }))).toEqual([]);
  });

  it("proves the normalized CHARACTER spelling has the same candidate pool", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const args = [state, 0, cardDb, state.players[0].leader.instanceId, new Map()] as const;
    const either = computeAllValidTargets(
      args[0], { type: "CHARACTER", controller: "EITHER" }, args[1], args[2], args[3], args[4],
    );
    const any = computeAllValidTargets(
      args[0], { type: "CHARACTER", controller: "ANY" }, args[1], args[2], args[3], args[4],
    );
    expect(any).toEqual(either);
  });

  it("normalizes exactly the five shipped target-position ANY cards", () => {
    for (const cardId of [
      "EB02-024",
      "EB04-028",
      "OP14-049",
      "OP14-058",
      "OP14-059",
    ]) {
      const serialized = JSON.stringify(getEffectSchema(cardId));
      expect(serialized).toContain('"controller":"EITHER"');
      expect(serialized).not.toContain('"controller":"ANY"');
    }
    // ANY remains valid for a non-targeting filter consumer.
    expect(JSON.stringify(getEffectSchema("OP11-041"))).toContain(
      '"controller":"ANY"',
    );
  });

  it("preserves existing absent, SELF, and OPPONENT pools", () => {
    const cardDb = createTestCardDb();
    const state = withDistinctLifeAndStages(createBattleReadyState(cardDb), cardDb);
    const resolve = (target: Target) => computeAllValidTargets(
      state,
      target,
      0,
      cardDb,
      state.players[0].leader.instanceId,
      new Map(),
    );

    expect(resolve({ type: "STAGE" })).toEqual(["stage-0"]);
    expect(resolve({ type: "STAGE", controller: "SELF" })).toEqual(["stage-0"]);
    expect(resolve({ type: "STAGE", controller: "OPPONENT" })).toEqual(["stage-1"]);
    expect(resolve({ type: "LIFE_CARD" })).toEqual(
      state.players[0].life.map((card) => card.instanceId),
    );
    expect(resolve({ type: "LIFE_CARD", controller: "SELF" })).toEqual(
      state.players[0].life.map((card) => card.instanceId),
    );
    expect(resolve({ type: "LIFE_CARD", controller: "OPPONENT" })).toEqual(
      state.players[1].life.map((card) => card.instanceId),
    );
  });
});
