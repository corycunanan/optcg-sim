/**
 * OPT-114 commit 3: mid-batch interleaving edge cases for multi-target PLAY_CARD.
 *
 * Covers:
 *   - mid-batch rule 3-7-6-1 overflow (board fills during the batch; remaining
 *     frames resume after the controller picks a victim to rule-trash)
 *   - combined overflow + state_distribution PLAYER_CHOICE (both prompts
 *     sequence correctly; counters decrement across resume hops)
 *   - fizzled preselected target mid-batch skips cleanly
 *
 * Nested ON_PLAY draining between frames (rule 6-2) is deferred to a follow-up —
 * today's pipeline drains triggers at the end of the batch.
 */

import { describe, it, expect } from "vitest";
import { executePlayCard } from "../engine/effect-resolver/actions/play.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import type { Action, EffectResult } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, ResumeContext } from "../types.js";
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

function makeBoardChar(suffix: string): CardInstance {
  return {
    instanceId: `board-${suffix}`,
    cardId: CARDS.VANILLA.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function seedBoardAndTrash(
  cardDb: Map<string, CardData>,
  boardCount: number,
  trashCards: CardInstance[],
): GameState {
  const base = createBattleReadyState(cardDb);
  const board = Array.from({ length: boardCount }, (_, i) => makeBoardChar(`b${i}`));
  return {
    ...base,
    players: [
      { ...base.players[0], characters: padChars(board), trash: trashCards },
      base.players[1],
    ] as [typeof base.players[0], typeof base.players[1]],
  };
}

describe("OPT-114 commit 3: mid-batch interleaving", () => {
  it("overflow mid-batch: remaining frames continue after victim is rule-trashed", () => {
    const cardDb = createTestCardDb();
    const trash = [
      trashChar(CARDS.RUSH.id, "t1"),
      trashChar(CARDS.BLOCKER.id, "t2"),
    ];
    // 4 board chars → one slot open → frame 1 plays, frame 2 hits full board.
    const state = seedBoardAndTrash(cardDb, 4, trash);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 2 } },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    const first = executePlayCard(
      state, action, "src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );

    // Paused on frame 2 with overflow prompt carrying batch continuation.
    expect(first.pendingPrompt).toBeDefined();
    const ctx = first.pendingPrompt!.resumeContext as ResumeContext;
    expect(ctx.ruleTrashForPlay?.playTargetId).toBe("trash-t2");
    expect(ctx.ruleTrashForPlay?.batch?.remainingTargetIds).toEqual(["trash-t2"]);
    expect(ctx.ruleTrashForPlay?.batch?.playedSoFar.length).toBe(1);

    // Resume: trash own board char "board-b0" as victim.
    const victimId = "board-b0";
    const resumed = resumeEffectChain(
      first.state,
      ctx,
      { type: "SELECT_TARGET", selectedInstanceIds: [victimId] },
      cardDb,
    );

    expect(resumed.pendingPrompt).toBeUndefined();
    expect(resumed.resolved).toBe(true);

    const p0 = resumed.state.players[0];
    // Board: 3 remaining originals + 2 newly-played from trash-t2/t3 +
    // one slot vacated by victim → +1 played into vacated slot. Net 5 full.
    expect(p0.characters.filter(Boolean)).toHaveLength(5);
    // Both source-zone cards consumed.
    const stillTrashed = p0.trash.filter((c) =>
      ["trash-t1", "trash-t2"].includes(c.instanceId),
    );
    expect(stillTrashed).toHaveLength(0);
    // Victim lives in trash as a rule-trashed card (no CARD_KO emitted).
    expect(p0.trash.some((c) => c.instanceId === victimId)).toBe(true);
    const koEvents = resumed.events.filter((e) => e.type === "CARD_KO");
    expect(koEvents).toHaveLength(0);
    // 2 played events total across both pauses (1 before overflow + 1 after resume).
    const playedEvents = [
      ...(first.events.filter((e) => e.type === "CARD_PLAYED")),
      ...(resumed.events.filter((e) => e.type === "CARD_PLAYED")),
    ];
    expect(playedEvents).toHaveLength(2);
  });

  it("combined: PLAYER_CHOICE state distribution + mid-batch overflow", () => {
    const cardDb = createTestCardDb();
    const trash = [trashChar(CARDS.VANILLA.id, "a"), trashChar(CARDS.RUSH.id, "b")];
    // 4 board chars → one slot open; distributed play of 2 fills + overflows.
    const state = seedBoardAndTrash(cardDb, 4, trash);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 2 } },
      params: {
        source_zone: "TRASH",
        cost_override: "FREE",
        entry_state: "PLAYER_CHOICE",
        state_distribution: { ACTIVE: 1, RESTED: 1 },
      },
    };

    // Step 1: initial call emits the state-choice prompt for trash-a.
    const first = executePlayCard(
      state, action, "src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );
    expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    const ctx1 = first.pendingPrompt!.resumeContext as ResumeContext;

    // Step 2: resume with ACTIVE → frame 1 plays ACTIVE, board is full;
    // frame 2 hits overflow → returns SELECT_TARGET prompt with batch info.
    const second = resumeEffectChain(
      first.state, ctx1,
      { type: "PLAYER_CHOICE", choiceId: "play-state:trash-a:ACTIVE" },
      cardDb,
    );
    expect(second.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const ctx2 = second.pendingPrompt!.resumeContext as ResumeContext;
    expect(ctx2.ruleTrashForPlay?.playTargetId).toBe("trash-b");
    // ACTIVE slot consumed by frame 1 → batch remaining should be {ACTIVE:0, RESTED:1}
    expect(ctx2.ruleTrashForPlay?.batch?.remaining).toEqual({ ACTIVE: 0, RESTED: 1 });
    // Frame 2's state was deterministically pinned to RESTED (only slot left).
    expect(ctx2.ruleTrashForPlay?.batch?.forcedFirstState).toBe("RESTED");

    // Step 3: resume with victim → frame 2 plays RESTED, batch completes.
    const third = resumeEffectChain(
      second.state, ctx2,
      { type: "SELECT_TARGET", selectedInstanceIds: ["board-b0"] },
      cardDb,
    );
    expect(third.pendingPrompt).toBeUndefined();

    const p0 = third.state.players[0];
    expect(p0.characters.filter(Boolean)).toHaveLength(5);
    // Trash: no trash-a or trash-b; victim "board-b0" rule-trashed there.
    expect(p0.trash.some((c) => c.instanceId === "trash-a")).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === "trash-b")).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === "board-b0")).toBe(true);
    // Played chars: one ACTIVE (from trash-a), one RESTED (from trash-b).
    const newChars = p0.characters.filter(
      (c): c is CardInstance => c !== null && [CARDS.VANILLA.id, CARDS.RUSH.id].includes(c.cardId) && c.turnPlayed !== 1,
    );
    const states = newChars.map((c) => c.state).sort();
    expect(states).toEqual(["ACTIVE", "RESTED"]);
  });

  it("fizzled target mid-batch: unknown instanceId is skipped, remaining frames continue", () => {
    const cardDb = createTestCardDb();
    const trash = [
      trashChar(CARDS.RUSH.id, "t1"),
      trashChar(CARDS.BLOCKER.id, "t3"),
    ];
    const state = seedBoardAndTrash(cardDb, 0, trash);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 3 } },
      params: { source_zone: "TRASH", cost_override: "FREE" },
    };

    // Preselect list includes a bogus instanceId between the two real ones.
    const result = executePlayCard(
      state, action, "src", 0, cardDb, new Map<string, EffectResult>(),
      ["trash-t1", "does-not-exist", "trash-t3"],
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.succeeded).toBe(true);
    const p0 = result.state.players[0];
    // Only 2 of the 3 entries yielded a played char.
    expect(p0.characters.filter(Boolean)).toHaveLength(2);
    expect(p0.trash).toHaveLength(0);
    expect(result.result?.count).toBe(2);
    const played = result.events.filter((e) => e.type === "CARD_PLAYED");
    expect(played).toHaveLength(2);
  });
});
