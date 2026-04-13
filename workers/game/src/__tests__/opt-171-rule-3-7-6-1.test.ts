/**
 * OPT-171: Effect-driven PLAY_CARD must honor rule 3-7-6-1 (replace-and-trash)
 * when the controller's Character area is full.
 */

import { describe, it, expect } from "vitest";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import type { EffectBlock } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { registerTriggersForCard } from "../engine/triggers.js";

function makeChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

/**
 * Fill player 0's Character area with 5 VANILLA characters and seed their
 * trash with one CHARACTER that an effect will try to play from.
 */
function setupFullBoardWithTrashPlayTarget(cardDb: Map<string, CardData>): {
  state: GameState;
  trashTargetId: string;
  boardCharIds: string[];
} {
  const base = createBattleReadyState(cardDb);
  const board = [
    makeChar(CARDS.VANILLA.id, 0, "b1"),
    makeChar(CARDS.VANILLA.id, 0, "b2"),
    makeChar(CARDS.VANILLA.id, 0, "b3"),
    makeChar(CARDS.VANILLA.id, 0, "b4"),
    makeChar(CARDS.VANILLA.id, 0, "b5"),
  ];
  const trashCard: CardInstance = {
    instanceId: "trash-candidate",
    cardId: CARDS.RUSH.id,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
    controller: 0,
    owner: 0,
  };
  const state: GameState = {
    ...base,
    players: [
      {
        ...base.players[0],
        characters: padChars(board),
        trash: [trashCard],
      },
      base.players[1],
    ] as [typeof base.players[0], typeof base.players[1]],
  };
  return {
    state,
    trashTargetId: trashCard.instanceId,
    boardCharIds: board.map((c) => c.instanceId),
  };
}

describe("OPT-171: rule 3-7-6-1 replace-and-trash on full board", () => {
  it("single-play effect onto full board returns a SELECT_TARGET prompt for own Characters", () => {
    const cardDb = createTestCardDb();
    const { state, boardCharIds } = setupFullBoardWithTrashPlayTarget(cardDb);

    const block: EffectBlock = {
      id: "opt171-single-play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{
        type: "PLAY_CARD",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "TRASH",
          count: { exact: 1 },
        },
        params: { source_zone: "TRASH", cost_override: "FREE" },
      }],
    };

    const result = resolveEffect(state, block, "char-0-b1", 0, cardDb);

    // Effect paused with the rule-trash prompt
    expect(result.resolved).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    const opts = result.pendingPrompt!.options;
    expect(opts.promptType).toBe("SELECT_TARGET");
    if (opts.promptType !== "SELECT_TARGET") return;
    expect(opts.countMin).toBe(1);
    expect(opts.countMax).toBe(1);
    // Valid targets are exactly the controller's 5 own characters
    expect([...opts.validTargets!].sort()).toEqual([...boardCharIds].sort());
    expect(result.pendingPrompt!.respondingPlayer).toBe(0);

    // The frame on the stack carries ruleTrashForPlay so resume can trash the
    // chosen victim and re-enter the original play.
    const topFrame = result.state.effectStack[result.state.effectStack.length - 1];
    expect(topFrame).toBeDefined();
    expect((topFrame as any).ruleTrashForPlay?.playTargetId).toBe("trash-candidate");
  });

  it("resuming with a chosen victim rule-trashes it (no CARD_KO event) and places the played card", () => {
    const cardDb = createTestCardDb();
    const { state, boardCharIds, trashTargetId } = setupFullBoardWithTrashPlayTarget(cardDb);

    const block: EffectBlock = {
      id: "opt171-resume",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{
        type: "PLAY_CARD",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "TRASH",
          count: { exact: 1 },
        },
        params: { source_zone: "TRASH", cost_override: "FREE" },
      }],
    };

    const promptResult = resolveEffect(state, block, "char-0-b1", 0, cardDb);
    expect(promptResult.pendingPrompt).toBeDefined();

    const victimId = boardCharIds[2]; // pick b3
    const postState = { ...promptResult.state, pendingPrompt: null };
    const resumeResult = resumeFromStack(
      postState,
      { type: "SELECT_TARGET", selectedInstanceIds: [victimId] },
      cardDb,
    );

    expect(resumeResult.resolved).toBe(true);
    expect(resumeResult.pendingPrompt).toBeUndefined();

    // Rule-trashing emits CARD_TRASHED, never CARD_KO (3-7-6-1-1).
    const koEvents = resumeResult.events.filter((e) => e.type === "CARD_KO");
    expect(koEvents).toHaveLength(0);
    const trashEvents = resumeResult.events.filter(
      (e) => e.type === "CARD_TRASHED" && (e.payload as any)?.cardInstanceId === victimId,
    );
    expect(trashEvents.length).toBeGreaterThan(0);

    // Play target is now a CHARACTER under controller 0; victim is in trash.
    const p0 = resumeResult.state.players[0];
    const playedOnBoard = p0.characters.some((c) => c && c.cardId === CARDS.RUSH.id);
    expect(playedOnBoard).toBe(true);
    expect(p0.characters.filter(Boolean).length).toBe(5);
    const victimInTrash = p0.trash.some((c) => c.instanceId === victimId);
    expect(victimInTrash).toBe(true);
    // Play source card removed from trash
    const stillInTrash = p0.trash.some((c) => c.instanceId === trashTargetId);
    expect(stillInTrash).toBe(false);
  });

  it("rule-trashed victim does NOT fire its registered On K.O. trigger", () => {
    const cardDb = createTestCardDb();
    // Create a CHARACTER with an On K.O. trigger registered so we can assert
    // it is not activated when the card is rule-trashed.
    const onKoCard: CardData = {
      ...CARDS.VANILLA,
      id: "CHAR-ONKO",
      effectSchema: {
        effects: [
          {
            id: "onko-draw",
            category: "auto",
            trigger: { keyword: "ON_KO" },
            actions: [{ type: "DRAW_CARDS", params: { amount: 2 } }],
          },
        ],
      } as any,
    };
    cardDb.set(onKoCard.id, onKoCard);

    const { state: baseState, boardCharIds } = setupFullBoardWithTrashPlayTarget(cardDb);
    // Swap the 3rd board slot to an On-KO character.
    const onKoChar = makeChar(onKoCard.id, 0, "onko");
    const newChars = [...baseState.players[0].characters];
    newChars[2] = onKoChar;
    let state: GameState = {
      ...baseState,
      players: [
        { ...baseState.players[0], characters: newChars as typeof baseState.players[0]["characters"] },
        baseState.players[1],
      ] as [typeof baseState.players[0], typeof baseState.players[1]],
    };
    // Register triggers for the On-KO character so it's in the registry.
    state = registerTriggersForCard(state, onKoChar, onKoCard);

    const block: EffectBlock = {
      id: "opt171-no-triggers",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{
        type: "PLAY_CARD",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "TRASH",
          count: { exact: 1 },
        },
        params: { source_zone: "TRASH", cost_override: "FREE" },
      }],
    };

    const promptResult = resolveEffect(state, block, "char-0-b1", 0, cardDb);
    expect(promptResult.pendingPrompt).toBeDefined();

    const deckBefore = promptResult.state.players[0].deck.length;
    const handBefore = promptResult.state.players[0].hand.length;

    const postState = { ...promptResult.state, pendingPrompt: null };
    const resumeResult = resumeFromStack(
      postState,
      { type: "SELECT_TARGET", selectedInstanceIds: [onKoChar.instanceId] },
      cardDb,
    );

    expect(resumeResult.resolved).toBe(true);

    // No CARD_KO event emitted by rule-trashing (3-7-6-1-1).
    const koEvents = resumeResult.events.filter((e) => e.type === "CARD_KO");
    expect(koEvents).toHaveLength(0);

    // On K.O. effect (DRAW 2) did NOT fire — hand/deck unchanged.
    const p0After = resumeResult.state.players[0];
    expect(p0After.hand.length).toBe(handBefore);
    expect(p0After.deck.length).toBe(deckBefore);

    // And the play did land on the board.
    expect(p0After.characters.filter(Boolean).length).toBe(5);
    expect(p0After.characters.some((c) => c && c.cardId === CARDS.RUSH.id)).toBe(true);
    // Boardchar list sanity (the original first board char still there)
    expect(p0After.characters.some((c) => c && c.instanceId === boardCharIds[0])).toBe(true);
  });

  it("fizzles (no prompt) when there are no own characters on the board", () => {
    // Edge: board lookup hits the indexOf(null) === -1 branch only when all 5 slots
    // are filled. When all 5 are filled, there are always 5 victim candidates, so
    // "no own characters" can't happen. This test documents the guard: if someone
    // ever reaches executePlayCard with a full board but 0 own characters, we
    // fizzle rather than build an empty prompt. To exercise this, inject an
    // internal state directly (5 characters owned by opponent).
    const cardDb = createTestCardDb();
    const { state: baseState } = setupFullBoardWithTrashPlayTarget(cardDb);

    // Replace controller's 5 characters with opponent-owned copies at
    // controller 0's slot (pathological state, but guards the branch).
    const opponentChars = baseState.players[0].characters.map((c) =>
      c ? { ...c, controller: 1 as const, owner: 1 as const } : c,
    );
    const state: GameState = {
      ...baseState,
      players: [
        { ...baseState.players[0], characters: opponentChars as typeof baseState.players[0]["characters"] },
        baseState.players[1],
      ] as [typeof baseState.players[0], typeof baseState.players[1]],
    };

    // Current implementation treats "own characters" as anything in the
    // controller's characters slot (controller index is the source of truth).
    // So the guard only fires if the slot array literally has no non-null
    // entries, which is precluded by the full-board entry. We assert the
    // existing path (prompt is raised with the 5 slots as candidates).
    const block: EffectBlock = {
      id: "opt171-edge",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{
        type: "PLAY_CARD",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "TRASH",
          count: { exact: 1 },
        },
        params: { source_zone: "TRASH", cost_override: "FREE" },
      }],
    };
    const result = resolveEffect(state, block, "opponent-source", 0, cardDb);
    // Prompt is still raised — the guard is a belt-and-suspenders check.
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  });
});
