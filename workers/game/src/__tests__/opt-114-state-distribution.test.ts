/**
 * OPT-114 commit 2: per-frame state distribution for multi-target PLAY_CARD.
 *
 * When a PLAY_CARD action has entry_state="PLAYER_CHOICE" and state_distribution
 * caps, each CHARACTER frame prompts the controller to choose ACTIVE or RESTED
 * until one slot is exhausted. Remaining frames then auto-resolve into the
 * still-available state.
 *
 * Target card: OP06-086 Gecko Moria — { ACTIVE: 1, RESTED: 1 }.
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

function emptyBoardWithTrash(cardDb: Map<string, CardData>, trashCards: CardInstance[]): GameState {
  const base = createBattleReadyState(cardDb);
  return {
    ...base,
    players: [
      { ...base.players[0], characters: padChars([]), trash: trashCards },
      base.players[1],
    ] as [typeof base.players[0], typeof base.players[1]],
  };
}

const MORIA_ACTION: Action = {
  type: "PLAY_CARD",
  target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 2 } },
  params: {
    source_zone: "TRASH",
    cost_override: "FREE",
    entry_state: "PLAYER_CHOICE",
    state_distribution: { ACTIVE: 1, RESTED: 1 },
  },
};

describe("OPT-114: PLAY_CARD state distribution (PLAYER_CHOICE entry_state)", () => {
  it("emits a PLAYER_CHOICE prompt bound to the first frame's instanceId", () => {
    const cardDb = createTestCardDb();
    const trash = [trashChar(CARDS.VANILLA.id, "a"), trashChar(CARDS.RUSH.id, "b")];
    const state = emptyBoardWithTrash(cardDb, trash);

    const result = executePlayCard(
      state, MORIA_ACTION, "moria-src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );

    expect(result.succeeded).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    const opts = result.pendingPrompt!.options;
    expect(opts.promptType).toBe("PLAYER_CHOICE");
    if (opts.promptType !== "PLAYER_CHOICE") throw new Error("narrow");
    expect(opts.choices.map((c) => c.id)).toEqual([
      "play-state:trash-a:ACTIVE",
      "play-state:trash-a:RESTED",
    ]);
    // No character placed yet
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(0);
  });

  it("happy path: 1 ACTIVE + auto-RESTED after first choice exhausts ACTIVE slot", () => {
    const cardDb = createTestCardDb();
    const trash = [trashChar(CARDS.VANILLA.id, "a"), trashChar(CARDS.RUSH.id, "b")];
    const state = emptyBoardWithTrash(cardDb, trash);

    const first = executePlayCard(
      state, MORIA_ACTION, "moria-src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );
    expect(first.pendingPrompt).toBeDefined();

    const resumeCtx = first.pendingPrompt!.resumeContext as ResumeContext;
    const resumed = resumeEffectChain(
      first.state,
      resumeCtx,
      { type: "PLAYER_CHOICE", choiceId: "play-state:trash-a:ACTIVE" },
      cardDb,
    );

    // Both frames should now be played (no further prompt, since RESTED slot
    // auto-resolves after ACTIVE is consumed).
    expect(resumed.pendingPrompt).toBeUndefined();
    const chars = resumed.state.players[0].characters.filter((c): c is CardInstance => c !== null);
    expect(chars).toHaveLength(2);
    expect(chars.map((c) => c.state)).toEqual(["ACTIVE", "RESTED"]);
    expect(chars[0].cardId).toBe(CARDS.VANILLA.id);
    expect(chars[1].cardId).toBe(CARDS.RUSH.id);
    expect(resumed.state.players[0].trash).toHaveLength(0);
  });

  it("auto-resolves without prompting when only one state slot has capacity", () => {
    const cardDb = createTestCardDb();
    const trash = [trashChar(CARDS.VANILLA.id, "a"), trashChar(CARDS.RUSH.id, "b")];
    const state = emptyBoardWithTrash(cardDb, trash);

    const action: Action = {
      ...MORIA_ACTION,
      params: {
        source_zone: "TRASH",
        cost_override: "FREE",
        entry_state: "PLAYER_CHOICE",
        // Only RESTED capacity → every frame auto-plays RESTED, no prompt.
        state_distribution: { ACTIVE: 0, RESTED: 2 },
      },
    };

    const result = executePlayCard(
      state, action, "src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.succeeded).toBe(true);
    const chars = result.state.players[0].characters.filter((c): c is CardInstance => c !== null);
    expect(chars).toHaveLength(2);
    for (const c of chars) expect(c.state).toBe("RESTED");
  });

  it("rejects a response whose choiceId echoes a stale instanceId", () => {
    const cardDb = createTestCardDb();
    const trash = [trashChar(CARDS.VANILLA.id, "a"), trashChar(CARDS.RUSH.id, "b")];
    const state = emptyBoardWithTrash(cardDb, trash);

    const first = executePlayCard(
      state, MORIA_ACTION, "moria-src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );
    const resumeCtx = first.pendingPrompt!.resumeContext as ResumeContext;

    const resumed = resumeEffectChain(
      first.state,
      resumeCtx,
      // Echo the wrong instanceId (simulating a stale modal response for the
      // next frame after the first already resolved).
      { type: "PLAYER_CHOICE", choiceId: "play-state:trash-b:ACTIVE" },
      cardDb,
    );

    expect(resumed.resolved).toBe(false);
    expect(resumed.pendingPrompt).toBeUndefined();
    // Nothing played — the response was rejected before any state mutation.
    expect(resumed.state.players[0].characters.filter(Boolean)).toHaveLength(0);
    expect(resumed.state.players[0].trash).toHaveLength(2);
  });

  it("existing entry_state='ACTIVE'/'RESTED' behavior is unaffected", () => {
    const cardDb = createTestCardDb();
    const trash = [trashChar(CARDS.VANILLA.id, "a"), trashChar(CARDS.RUSH.id, "b")];
    const state = emptyBoardWithTrash(cardDb, trash);

    const action: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 2 } },
      params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
    };

    const result = executePlayCard(
      state, action, "src", 0, cardDb, new Map<string, EffectResult>(),
      trash.map((c) => c.instanceId),
    );

    expect(result.pendingPrompt).toBeUndefined();
    const chars = result.state.players[0].characters.filter((c): c is CardInstance => c !== null);
    for (const c of chars) expect(c.state).toBe("RESTED");
  });
});
