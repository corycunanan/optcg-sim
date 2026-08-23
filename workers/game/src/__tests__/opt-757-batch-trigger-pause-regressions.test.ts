import { describe, expect, it } from "vitest";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ON_PLAY_DRAW_SCHEMA: EffectSchema = {
  card_id: "OPT757-ON-PLAY",
  card_name: "OPT757 On Play",
  card_type: "Character",
  effects: [{
    id: "opt757-on-play",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }],
};

const TRASH_WATCH_SCHEMA: EffectSchema = {
  card_id: "OPT757-TRASH-WATCH",
  card_name: "OPT757 Trash Watch",
  card_type: "Character",
  effects: [{
    id: "opt757-trash-watch",
    category: "auto",
    trigger: { event: "ANY_CHARACTER_TRASHED" },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }],
};

function cardData(id: string, schema?: EffectSchema): CardData {
  return { ...CARDS.VANILLA, id, name: id, effectSchema: schema ?? null };
}

function trashCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `trash-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
    controller: 0,
    owner: 0,
  };
}

function boardCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `board-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function stateWith(
  cardDb: Map<string, CardData>,
  trash: CardInstance[],
  board: CardInstance[] = [],
): GameState {
  const base = createBattleReadyState(cardDb);
  return {
    ...base,
    players: [
      { ...base.players[0], trash, characters: padChars(board) },
      base.players[1],
    ] as [typeof base.players[0], typeof base.players[1]],
  };
}

function playBlock(count: number, distributed = false): EffectBlock {
  return {
    id: "opt757-play-batch",
    category: "activate",
    actions: [{
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { exact: count } },
      params: distributed
        ? {
            source_zone: "TRASH",
            cost_override: "FREE",
            entry_state: "PLAYER_CHOICE",
            state_distribution: { ACTIVE: 3, RESTED: 1 },
          }
        : { source_zone: "TRASH", cost_override: "FREE" },
    }],
  };
}

function chooseState(state: GameState, choiceSuffix: "ACTIVE" | "RESTED", cardDb: Map<string, CardData>) {
  const prompt = state.pendingPrompt;
  const choice = prompt?.options.promptType === "PLAYER_CHOICE"
    ? prompt.options.choices.find((entry) => entry.id.endsWith(`:${choiceSuffix}`))
    : undefined;
  if (!choice) throw new Error(`Missing ${choiceSuffix} state choice`);
  return resumeFromStack(state, { type: "PLAYER_CHOICE", choiceId: choice.id }, cardDb);
}

describe("OPT-757: trigger accumulation across PLAY_CARD pauses", () => {
  it("preserves all triggers through repeated ACTIVE/RESTED pauses", () => {
    const cardDb = createTestCardDb();
    const triggerCard = cardData("OPT757-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    cardDb.set(triggerCard.id, triggerCard);
    const trash = ["a", "b", "c"].map((suffix) => trashCard(triggerCard.id, suffix));
    const first = resolveEffect(stateWith(cardDb, trash), playBlock(3, true), "batch-source", 0, cardDb);
    const second = chooseState({ ...first.state, pendingPrompt: first.pendingPrompt ?? null }, "ACTIVE", cardDb);
    expect(second.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const roundTripped = JSON.parse(JSON.stringify({ ...second.state, pendingPrompt: second.pendingPrompt ?? null })) as GameState;
    const third = chooseState(roundTripped, "ACTIVE", cardDb);
    const fourth = chooseState(
      { ...third.state, pendingPrompt: third.pendingPrompt ?? null },
      "ACTIVE",
      cardDb,
    );

    expect(fourth.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    const ordering = fourth.state.effectStack.at(-1);
    expect(ordering?.phase).toBe("AWAITING_TRIGGER_ORDER_SELECTION");
    expect(ordering?.simultaneousTriggers).toHaveLength(3);
    expect(ordering?.simultaneousTriggers.every((trigger) => trigger.groupSourceInstanceId === "batch-source")).toBe(true);
  });

  it("preserves and drains one trigger through repeated ACTIVE/RESTED pauses", () => {
    const cardDb = createTestCardDb();
    const triggerCard = cardData("OPT757-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    const vanilla = cardData("OPT757-VANILLA");
    cardDb.set(triggerCard.id, triggerCard);
    cardDb.set(vanilla.id, vanilla);
    const trash = [
      trashCard(triggerCard.id, "a"),
      trashCard(vanilla.id, "b"),
      trashCard(vanilla.id, "c"),
    ];
    const state = stateWith(cardDb, trash);
    const handBefore = state.players[0].hand.length;
    const first = resolveEffect(state, playBlock(3, true), "batch-source", 0, cardDb);
    const second = chooseState({ ...first.state, pendingPrompt: first.pendingPrompt ?? null }, "ACTIVE", cardDb);
    const third = chooseState(
      JSON.parse(JSON.stringify({ ...second.state, pendingPrompt: second.pendingPrompt ?? null })) as GameState,
      "ACTIVE",
      cardDb,
    );
    const fourth = chooseState(
      { ...third.state, pendingPrompt: third.pendingPrompt ?? null },
      "ACTIVE",
      cardDb,
    );

    expect(fourth.pendingPrompt).toBeUndefined();
    expect(fourth.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("preserves two ON_PLAY triggers through an overflow pause", () => {
    const cardDb = createTestCardDb();
    const triggerCard = cardData("OPT757-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    cardDb.set(triggerCard.id, triggerCard);
    const trash = [trashCard(triggerCard.id, "a"), trashCard(triggerCard.id, "b")];
    const board = ["a", "b", "c", "d"].map((suffix) => boardCard(CARDS.VANILLA.id, suffix));
    const first = resolveEffect(stateWith(cardDb, trash, board), playBlock(2), "batch-source", 0, cardDb);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const resumed = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [board[0].instanceId] },
      cardDb,
    );

    expect(resumed.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(resumed.state.effectStack.at(-1)?.simultaneousTriggers).toHaveLength(2);
  });

  it("preserves and drains one ON_PLAY trigger through an overflow pause", () => {
    const cardDb = createTestCardDb();
    const triggerCard = cardData("OPT757-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    const vanilla = cardData("OPT757-VANILLA");
    cardDb.set(triggerCard.id, triggerCard);
    cardDb.set(vanilla.id, vanilla);
    const trash = [trashCard(triggerCard.id, "a"), trashCard(vanilla.id, "b")];
    const board = ["a", "b", "c", "d"].map((suffix) => boardCard(CARDS.VANILLA.id, suffix));
    const state = stateWith(cardDb, trash, board);
    const handBefore = state.players[0].hand.length;
    const first = resolveEffect(state, playBlock(2), "batch-source", 0, cardDb);
    const resumed = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [board[0].instanceId] },
      cardDb,
    );

    expect(resumed.pendingPrompt).toBeUndefined();
    expect(resumed.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("includes a rule-trashed victim's own trash trigger in the overflow group", () => {
    const cardDb = createTestCardDb();
    const triggerCard = cardData("OPT757-ON-PLAY", ON_PLAY_DRAW_SCHEMA);
    const watcherCard = cardData("OPT757-TRASH-WATCH", TRASH_WATCH_SCHEMA);
    cardDb.set(triggerCard.id, triggerCard);
    cardDb.set(watcherCard.id, watcherCard);
    const trash = [trashCard(triggerCard.id, "a"), trashCard(triggerCard.id, "b")];
    const victim = boardCard(watcherCard.id, "victim");
    const board = [victim, ...["b", "c", "d"].map((suffix) => boardCard(CARDS.VANILLA.id, suffix))];
    let state = stateWith(cardDb, trash, board);
    state = registerTriggersForCard(state, victim, watcherCard);
    const first = resolveEffect(state, playBlock(2), "batch-source", 0, cardDb);
    const resumed = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] },
      cardDb,
    );

    expect(resumed.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    const ids = resumed.state.effectStack.at(-1)?.simultaneousTriggers.map((trigger) => trigger.effectBlock.id);
    expect(ids).toEqual(["opt757-on-play", "opt757-trash-watch", "opt757-on-play"]);
  });
});
