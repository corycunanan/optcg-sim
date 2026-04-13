/**
 * OPT-114 commit 1: sequential multi-target PLAY_CARD (macro expansion baseline).
 *
 * Validates that a single PLAY_CARD action with N preselected targets plays
 * each card individually — via per-target frames in executePlayCard — and that
 * N CARD_PLAYED events fire in order.
 *
 * Real-world references:
 *   - OP06-062 Vinsmoke Judge: up to 4 GERMA 66 chars from trash
 *   - OP13-082 Five Elders: up to 5 Five Elders chars from trash
 *
 * Interleaving edge cases (full-board mid-batch, fizzled targets, nested
 * ON_PLAY ordering) are covered in commit 3.
 */

import { describe, it, expect } from "vitest";
import { executePlayCard } from "../engine/effect-resolver/actions/play.js";
import type { Action, EffectResult } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function trashChar(cardId: string, suffix: string): CardInstance {
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

function emptyBoardWithTrash(cardDb: Map<string, CardData>, trashCards: CardInstance[]): GameState {
  const base = createBattleReadyState(cardDb);
  return {
    ...base,
    players: [
      {
        ...base.players[0],
        characters: padChars([]),
        trash: trashCards,
      },
      base.players[1],
    ] as [typeof base.players[0], typeof base.players[1]],
  };
}

describe("OPT-114: sequential multi-target PLAY_CARD (macro expansion)", () => {
  it("plays 4 characters one at a time (OP06-062 Vinsmoke Judge shape)", () => {
    const cardDb = createTestCardDb();
    const trashCards = [
      trashChar(CARDS.VANILLA.id, "g1"),
      trashChar(CARDS.RUSH.id, "g2"),
      trashChar(CARDS.BLOCKER.id, "g3"),
      trashChar(CARDS.BANISH.id, "g4"),
    ];
    const state = emptyBoardWithTrash(cardDb, trashCards);

    const action: Action = {
      type: "PLAY_CARD",
      target: {
        type: "CHARACTER_CARD",
        controller: "SELF",
        source_zone: "TRASH",
        count: { up_to: 4 },
      },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const preselected = trashCards.map((c) => c.instanceId);
    const result = executePlayCard(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      preselected,
    );

    expect(result.succeeded).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();

    const boardChars = result.state.players[0].characters.filter((c): c is CardInstance => c !== null);
    expect(boardChars).toHaveLength(4);
    expect(boardChars.map((c) => c.cardId)).toEqual([
      CARDS.VANILLA.id,
      CARDS.RUSH.id,
      CARDS.BLOCKER.id,
      CARDS.BANISH.id,
    ]);

    // All frames emit CARD_PLAYED in source-list order
    expect(result.events.filter((e) => e.type === "CARD_PLAYED")).toHaveLength(4);
    for (const e of result.events) {
      if (e.type === "CARD_PLAYED") {
        expect((e.payload as { source: string }).source).toBe("BY_EFFECT");
      }
    }

    // All source-zone cards removed
    expect(result.state.players[0].trash).toHaveLength(0);

    // Each frame minted a fresh instanceId
    expect(result.result?.targetInstanceIds).toHaveLength(4);
    expect(new Set(result.result?.targetInstanceIds).size).toBe(4);
  });

  it("plays 5 characters one at a time (OP13-082 Five Elders shape)", () => {
    const cardDb = createTestCardDb();
    const trashCards = [
      trashChar(CARDS.VANILLA.id, "e1"),
      trashChar(CARDS.RUSH.id, "e2"),
      trashChar(CARDS.BLOCKER.id, "e3"),
      trashChar(CARDS.BANISH.id, "e4"),
      trashChar(CARDS.DOUBLE_ATK.id, "e5"),
    ];
    const state = emptyBoardWithTrash(cardDb, trashCards);

    const action: Action = {
      type: "PLAY_CARD",
      target: {
        type: "CHARACTER_CARD",
        source_zone: "TRASH",
        count: { up_to: 5 },
      },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const preselected = trashCards.map((c) => c.instanceId);
    const result = executePlayCard(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      preselected,
    );

    expect(result.succeeded).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();

    const boardChars = result.state.players[0].characters.filter((c): c is CardInstance => c !== null);
    expect(boardChars).toHaveLength(5);
    expect(result.state.players[0].trash).toHaveLength(0);
    expect(result.events.filter((e) => e.type === "CARD_PLAYED")).toHaveLength(5);
    expect(result.result?.count).toBe(5);
  });

  it("respects entry_state param on every frame", () => {
    const cardDb = createTestCardDb();
    const trashCards = [
      trashChar(CARDS.VANILLA.id, "r1"),
      trashChar(CARDS.RUSH.id, "r2"),
    ];
    const state = emptyBoardWithTrash(cardDb, trashCards);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 2 } },
      params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
    };

    const result = executePlayCard(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      trashCards.map((c) => c.instanceId),
    );

    expect(result.succeeded).toBe(true);
    const boardChars = result.state.players[0].characters.filter((c): c is CardInstance => c !== null);
    expect(boardChars).toHaveLength(2);
    for (const c of boardChars) expect(c.state).toBe("RESTED");
  });

  it("no-ops cleanly when preselected list is empty", () => {
    const cardDb = createTestCardDb();
    const state = emptyBoardWithTrash(cardDb, []);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 4 } },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const result = executePlayCard(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      [],
    );

    expect(result.succeeded).toBe(false);
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(0);
  });

  it("mid-batch board-full emits rule 3-7-6-1 overflow prompt (commit 3)", () => {
    const cardDb = createTestCardDb();
    const trashCards = [
      trashChar(CARDS.VANILLA.id, "m1"),
      trashChar(CARDS.RUSH.id, "m2"),
      trashChar(CARDS.BLOCKER.id, "m3"),
    ];
    // Seed 4 existing chars — one slot open, so only the first frame plays.
    const base = createBattleReadyState(cardDb);
    const existing: CardInstance[] = Array.from({ length: 4 }, (_, i) => ({
      instanceId: `exist-${i}`,
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    }));
    const state: GameState = {
      ...base,
      players: [
        { ...base.players[0], characters: padChars(existing), trash: trashCards },
        base.players[1],
      ] as [typeof base.players[0], typeof base.players[1]],
    };

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 3 } },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const result = executePlayCard(
      state,
      action,
      "any-source",
      0,
      cardDb,
      new Map<string, EffectResult>(),
      trashCards.map((c) => c.instanceId),
    );

    // 4 existing + 1 newly played = 5 full; frame 2 now pauses with the rule
    // 3-7-6-1 overflow prompt carrying batch continuation for the remaining frames.
    expect(result.succeeded).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(5);
    // Frame 1's source-zone card was consumed; frames 2 and 3 still in trash.
    expect(result.state.players[0].trash).toHaveLength(2);
    const ctx = result.pendingPrompt!.resumeContext!;
    expect(ctx.ruleTrashForPlay?.playTargetId).toBe("trash-m2");
    expect(ctx.ruleTrashForPlay?.batch?.remainingTargetIds).toEqual(["trash-m2", "trash-m3"]);
  });
});
