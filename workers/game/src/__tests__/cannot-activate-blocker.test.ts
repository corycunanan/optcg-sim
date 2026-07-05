/**
 * CANNOT_ACTIVATE_BLOCKER — "Up to 1 of your opponent's Characters cannot
 * activate [Blocker] during this turn." (OP16-063, plus older encodings in
 * op01/02/03/05/06/08/09/11/12/13/st01/st21/p.)
 *
 * The type existed in the ProhibitionType union but had no case in
 * matchesProhibition, so the stored prohibition never vetoed anything.
 * It now shares the per-card DECLARE_BLOCKER veto with CANNOT_BLOCK.
 */

import { describe, it, expect } from "vitest";
import { checkProhibitions } from "../engine/prohibitions.js";
import type { GameAction, GameState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const cardDb = createTestCardDb();

function withCannotActivateBlocker(state: GameState, targetInstanceId: string): GameState {
  const prohibition = {
    id: `prohib-${targetInstanceId}`,
    sourceCardInstanceId: "char-0-v1",
    sourceEffectBlockId: "",
    prohibitionType: "CANNOT_ACTIVATE_BLOCKER",
    controller: 0,
    appliesTo: [targetInstanceId],
    scope: {},
    duration: { type: "THIS_TURN" },
    usesRemaining: null,
  } as unknown as GameState["prohibitions"][number];
  return { ...state, prohibitions: [...state.prohibitions, prohibition] };
}

describe("CANNOT_ACTIVATE_BLOCKER vetoes DECLARE_BLOCKER per card", () => {
  it("vetoes when the declaring blocker is in appliesTo", () => {
    const base = createBattleReadyState(cardDb);
    const blockerId = base.players[1].characters[1]!.instanceId; // char-1-b1
    const state = withCannotActivateBlocker(base, blockerId);

    const action: GameAction = { type: "DECLARE_BLOCKER", blockerInstanceId: blockerId };
    const veto = checkProhibitions(state, action, cardDb, 1);
    expect(veto).toMatch(/cannot block/i);
  });

  it("does NOT veto a different blocker", () => {
    const base = createBattleReadyState(cardDb);
    const prohibitedId = base.players[1].characters[1]!.instanceId;
    const otherId = base.players[1].characters[0]!.instanceId;
    const state = withCannotActivateBlocker(base, prohibitedId);

    const action: GameAction = { type: "DECLARE_BLOCKER", blockerInstanceId: otherId };
    expect(checkProhibitions(state, action, cardDb, 1)).toBeNull();
  });
});
