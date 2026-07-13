import { describe, expect, it } from "vitest";
import type { GameEvent } from "../types.js";
import type {
  Action,
  EffectBlock,
  EffectResult,
  RuntimeActiveEffect,
  Target,
} from "../engine/effect-types.js";
import type { CardInstance, GameState, PlayerState } from "../types.js";
import { executeReturnToDeck } from "../engine/effect-resolver/actions/removal.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { OP05_079_VIOLA } from "../engine/schemas/op05.js";
import { findCardInstance } from "../engine/state.js";
import { filterEventForPlayer } from "../engine/visibility.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

type ReturnSource = "CHARACTER" | "STAGE" | "HAND" | "TRASH" | "LIFE";

const TARGET_BY_SOURCE: Record<ReturnSource, Target> = {
  CHARACTER: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
  STAGE: { type: "STAGE", controller: "SELF", count: { exact: 1 } },
  HAND: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
  TRASH: { type: "CARD_IN_TRASH", controller: "SELF", count: { exact: 1 } },
  LIFE: { type: "LIFE_CARD", controller: "SELF", count: { exact: 1 } },
};

function sourceState(source: ReturnSource): { state: GameState; target: CardInstance } {
  const cardDb = createTestCardDb();
  const base = createBattleReadyState(cardDb);
  const target: CardInstance = {
    instanceId: `return-${source.toLowerCase()}`,
    cardId: source === "STAGE" ? CARDS.STAGE.id : CARDS.VANILLA.id,
    zone: source,
    state: "RESTED",
    attachedDon: source === "CHARACTER" || source === "STAGE"
      ? [{ instanceId: `don-${source.toLowerCase()}`, state: "RESTED", attachedTo: `return-${source.toLowerCase()}` }]
      : [],
    turnPlayed: 2,
    controller: 0,
    owner: 0,
  };
  const player: PlayerState = {
    ...base.players[0],
    characters: source === "CHARACTER" ? padChars([target]) : padChars([]),
    stage: source === "STAGE" ? target : null,
    hand: source === "HAND" ? [target] : [],
    trash: source === "TRASH" ? [target] : [],
    life: source === "LIFE"
      ? [{ instanceId: target.instanceId, cardId: target.cardId, face: "UP" }]
      : [],
    donCostArea: [],
  };
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = player;
  const activeEffects = [{
    id: `tracks-${target.instanceId}`,
    sourceCardInstanceId: player.leader.instanceId,
    sourceEffectBlockId: "test-registration",
    category: "permanent",
    modifiers: [],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [target.instanceId],
    timestamp: 1,
  }] as unknown as GameState["activeEffects"];
  return { state: { ...base, players, activeEffects }, target };
}

function returnBlock(source: ReturnSource): EffectBlock {
  return {
    id: `return-${source.toLowerCase()}-to-deck`,
    category: "auto",
    actions: [{
      type: "RETURN_TO_DECK",
      target: TARGET_BY_SOURCE[source],
      params: { position: "BOTTOM" },
    }],
  };
}

function wildcardLeaveReplacement(sourceCardInstanceId: string): RuntimeActiveEffect {
  return {
    id: "wildcard-leave-replacement",
    sourceCardInstanceId,
    sourceEffectBlockId: "leave-replacement",
    category: "replacement",
    modifiers: [{
      type: "REPLACEMENT_EFFECT",
      params: {
        trigger: "WOULD_LEAVE_FIELD",
        target_filter: null,
        replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
        optional: false,
        once_per_turn: false,
      },
    }],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [],
    timestamp: 1,
  };
}

describe("OPT-487 RETURN_TO_DECK source-zone contract", () => {
  it.each(Object.keys(TARGET_BY_SOURCE) as ReturnSource[])(
    "moves a %s card through the canonical transition and emits a private identity event",
    (source) => {
      const cardDb = createTestCardDb();
      const { state, target } = sourceState(source);
      const deckBefore = state.players[0].deck.length;
      const result = resolveEffect(
        state,
        returnBlock(source),
        state.players[0].leader.instanceId,
        0,
        cardDb,
      );

      expect(result.resolved).toBe(true);
      expect(result.state.players[0].deck).toHaveLength(deckBefore + 1);
      expect(findCardInstance(result.state, target.instanceId)).toBeNull();
      const destination = result.state.players[0].deck.at(-1)!;
      expect(destination).toMatchObject({
        cardId: target.cardId,
        zone: "DECK",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
      });
      expect(destination.instanceId).not.toBe(target.instanceId);
      expect(result.state.activeEffects).toEqual([]);
      if (source === "CHARACTER" || source === "STAGE") {
        expect(result.state.players[0].donCostArea).toContainEqual({
          instanceId: `don-${source.toLowerCase()}`,
          state: "RESTED",
          attachedTo: null,
        });
      }

      const pending = result.events.find((event) => event.type === "CARD_RETURNED_TO_DECK");
      expect(pending).toMatchObject({
        type: "CARD_RETURNED_TO_DECK",
        playerIndex: 0,
        payload: {
          cardInstanceId: target.instanceId,
          newCardInstanceId: destination.instanceId,
          cardId: target.cardId,
          position: "BOTTOM",
        },
      });
      const event = { ...pending!, timestamp: 1 } as GameEvent;
      expect(filterEventForPlayer(event, 0)).toEqual(event);
      const opponentView = JSON.stringify(filterEventForPlayer(event, 1));
      expect(opponentView).not.toContain(target.instanceId);
      expect(opponentView).not.toContain(destination.instanceId);
      expect(opponentView).not.toContain(target.cardId);

      const lifeRemoved = result.events.find((event) => event.type === "CARD_REMOVED_FROM_LIFE");
      if (source === "LIFE") {
        expect(lifeRemoved).toMatchObject({
          type: "CARD_REMOVED_FROM_LIFE",
          playerIndex: 0,
          payload: {
            cardInstanceId: target.instanceId,
            newCardInstanceId: destination.instanceId,
          },
        });
      } else {
        expect(lifeRemoved).toBeUndefined();
      }
    },
  );

  it("does not apply field-leave replacements to a card moving from hand", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const replacementSource = base.players[0].characters[0]!;
    const target = base.players[0].hand[0]!;
    const state: GameState = {
      ...base,
      players: [
        { ...base.players[0], hand: [target] },
        base.players[1],
      ],
      activeEffects: [wildcardLeaveReplacement(replacementSource.instanceId)],
    };
    const action: Action = {
      type: "RETURN_TO_DECK",
      target: TARGET_BY_SOURCE.HAND,
      params: { position: "BOTTOM" },
    };

    const result = executeReturnToDeck(
      state,
      action,
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map<string, EffectResult>(),
      [target.instanceId],
      resolverExecutionServices,
    );

    expect(result.succeeded).toBe(true);
    expect(findCardInstance(result.state, target.instanceId)).toBeNull();
    expect(result.state.players[0].deck.at(-1)?.cardId).toBe(target.cardId);
    expect(findCardInstance(result.state, replacementSource.instanceId)?.state).toBe("ACTIVE");
  });

  it("continues to apply field-leave replacements to Character removals", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const replacementSource = base.players[0].characters[0]!;
    const target = base.players[0].characters[1]!;
    const state: GameState = {
      ...base,
      activeEffects: [wildcardLeaveReplacement(replacementSource.instanceId)],
    };
    const action: Action = {
      type: "RETURN_TO_DECK",
      target: TARGET_BY_SOURCE.CHARACTER,
      params: { position: "BOTTOM" },
    };

    const result = executeReturnToDeck(
      state,
      action,
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map<string, EffectResult>(),
      [target.instanceId],
      resolverExecutionServices,
    );

    expect(findCardInstance(result.state, target.instanceId)?.zone).toBe("CHARACTER");
    expect(findCardInstance(result.state, replacementSource.instanceId)?.state).toBe("RESTED");
    expect(result.events.some((event) => event.type === "CARD_RETURNED_TO_DECK")).toBe(false);
  });

  it("lets OP05-079's opponent select cards from their own trash", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const makeTrash = (owner: 0 | 1, index: number, cardId: string): CardInstance => ({
      instanceId: `viola-trash-${owner}-${index}`,
      cardId,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: owner,
      owner,
    });
    const controllerTrash = [CARDS.VANILLA, CARDS.RUSH, CARDS.BLOCKER, CARDS.COUNTER]
      .map((card, index) => makeTrash(0, index, card.id));
    const opponentTrash = [CARDS.VANILLA, CARDS.RUSH, CARDS.BLOCKER]
      .map((card, index) => makeTrash(1, index, card.id));
    const state: GameState = {
      ...base,
      players: [
        { ...base.players[0], trash: controllerTrash },
        { ...base.players[1], trash: opponentTrash },
      ],
    };
    const block = OP05_079_VIOLA.effects[0]!;
    const deckBefore = state.players[1].deck.length;

    const result = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Expected OP05-079 to prompt the opponent to arrange their trash cards");
    }
    expect(result.pendingPrompt.options.cards.map((card) => card.instanceId)).toEqual(
      opponentTrash.map((card) => card.instanceId),
    );

    const arranged = [opponentTrash[2], opponentTrash[0], opponentTrash[1]];
    const resumed = resumeFromStack(
      result.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: arranged.map((card) => card.instanceId),
        destination: "top",
      },
      cardDb,
    );

    expect(resumed.state.players[0].trash).toEqual(controllerTrash);
    expect(resumed.state.players[1].trash).toHaveLength(0);
    expect(resumed.state.players[1].deck).toHaveLength(deckBefore + 3);
    expect(resumed.state.players[1].deck.slice(-3).map((card) => card.cardId)).toEqual(
      arranged.map((card) => card.cardId),
    );
    for (const selectedId of opponentTrash.map((card) => card.instanceId)) {
      expect(findCardInstance(resumed.state, selectedId)).toBeNull();
    }
  });

  it("preserves any-number selection before arranging a multi-card Trash return", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const trash = [CARDS.VANILLA, CARDS.RUSH, CARDS.BLOCKER].map((card, index): CardInstance => ({
      instanceId: `any-number-trash-${index}`,
      cardId: card.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    }));
    const state: GameState = {
      ...base,
      players: [
        { ...base.players[0], trash },
        base.players[1],
      ],
    };
    const block: EffectBlock = {
      id: "return-any-number-from-trash",
      category: "auto",
      actions: [{
        type: "RETURN_TO_DECK",
        target: {
          type: "CARD_IN_TRASH",
          controller: "SELF",
          count: { any_number: true },
        },
        params: { position: "BOTTOM" },
      }],
    };
    const deckBefore = state.players[0].deck.length;

    const selection = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(selection.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (selection.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected an any-number target selection");
    }
    expect(selection.pendingPrompt.options.countMin).toBe(0);
    expect(selection.pendingPrompt.options.countMax).toBe(3);

    const selected = [trash[0], trash[2]];
    const arrange = resumeFromStack(
      selection.state,
      { type: "SELECT_TARGET", selectedInstanceIds: selected.map((card) => card.instanceId) },
      cardDb,
    );

    expect(arrange.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (arrange.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Expected selected Trash cards to be arranged");
    }
    expect(arrange.pendingPrompt.options.cards.map((card) => card.instanceId)).toEqual(
      selected.map((card) => card.instanceId),
    );

    const arranged = [...selected].reverse();
    const done = resumeFromStack(
      arrange.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: arranged.map((card) => card.instanceId),
        destination: "top",
      },
      cardDb,
    );

    expect(done.state.players[0].trash.map((card) => card.instanceId)).toEqual([trash[1].instanceId]);
    expect(done.state.players[0].deck).toHaveLength(deckBefore + 2);
    expect(done.state.players[0].deck.slice(-2).map((card) => card.cardId)).toEqual(
      arranged.map((card) => card.cardId),
    );
  });

  it("resolves an any-number return with no valid cards without opening an empty prompt", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const block: EffectBlock = {
      id: "return-zero-cards-from-trash",
      category: "auto",
      actions: [{
        type: "RETURN_TO_DECK",
        target: {
          type: "CARD_IN_TRASH",
          controller: "SELF",
          count: { any_number: true },
        },
        params: { position: "BOTTOM" },
      }],
    };

    const result = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(result.resolved).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].trash).toEqual([]);
    expect(result.state.players[0].deck).toEqual(state.players[0].deck);
    expect(result.events.some((event) => event.type === "CARD_RETURNED_TO_DECK")).toBe(false);
  });
});
