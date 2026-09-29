/**
 * OPT-895 — the ACTION_PERFORMED_THIS_TURN / USED_BLOCKER query counts a
 * Leader declared as [Blocker] (OPT-834), not only Characters.
 *
 * Rules basis (docs/rules/rule_comprehensive.md):
 *   10-1-4-1 [Blocker] is a keyword effect of a "card" that is activated by
 *            resting it in the Block Step; nothing restricts it to Characters.
 *   7-1-2-1 / 7-1-2-2 "When a [Blocker] is activated..." — the activation
 *            (not the card type) is what "used a [Blocker]" refers to.
 *   OP16-048 Buggy (docs/cards/OP-16.md) + qa_op16.md: an all-names Leader can
 *            gain [Blocker] and block.
 *
 * Fixture: the same all-names Leader and OP16-048 grant flow as
 * opt-834-leader-blocker.test.ts, run through the real pipeline.
 */

import { describe, expect, it } from "vitest";
import type { CardInstance, GameAction, GameState } from "../types.js";
import type { Condition, EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { evaluateCondition } from "../engine/conditions.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ALL_NAMES_LEADER = "OPT895-ALL-NAMES-LEADER";
const PRISONER = "OPT895-PRISONER";

const allNamesSchema: EffectSchema = {
  card_id: ALL_NAMES_LEADER,
  card_name: "All-Names Leader",
  card_type: "Leader",
  effects: [],
  rule_modifications: [
    { rule_type: "TREATED_AS_ALL_IDENTITIES", names: true, types: true, attributes: true },
  ],
};

function fixture() {
  const db = createTestCardDb();
  db.set(ALL_NAMES_LEADER, {
    ...CARDS.LEADER,
    id: ALL_NAMES_LEADER,
    name: "All-Names Leader",
    effectSchema: allNamesSchema,
  });
  db.set(PRISONER, { ...CARDS.VANILLA, id: PRISONER, name: "Prisoner of Impel Down" });
  const buggySchema = getEffectSchema("OP16-048")!;
  db.set("OP16-048", {
    ...CARDS.VANILLA,
    id: "OP16-048",
    name: buggySchema.card_name ?? "OP16-048",
    cost: 3,
    counter: null,
    effectText: "",
    effectSchema: buggySchema,
  });

  let state = createBattleReadyState(db);
  state.players[1].leader = { ...state.players[1].leader, cardId: ALL_NAMES_LEADER };
  state = registerCardEnteredField(state, state.players[1].leader, db.get(ALL_NAMES_LEADER)!);
  state.players[1].characters = padChars([]);
  state.players[1].hand = [];

  const place = (cardId: string, owner: 0 | 1, suffix: string, extra: Partial<CardInstance> = {}) => {
    const card: CardInstance = {
      instanceId: `${cardId}-${owner}-${suffix}`,
      cardId,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: owner,
      owner,
      ...extra,
    };
    const slot = state.players[owner].characters.findIndex((c) => c === null);
    state.players[owner].characters[slot] = card;
    state = registerCardEnteredField(state, card, db.get(cardId)!);
    return card;
  };
  place("OP16-048", 1, "buggy");
  place(PRISONER, 1, "prisoner");
  const charBlocker = place(CARDS.BLOCKER.id, 1, "blocker");
  const plainChar = place(CARDS.VANILLA.id, 1, "plain", { state: "RESTED" });

  function act(action: GameAction, player: 0 | 1) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }
  function respond(action: GameAction) {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(r.responseRejected).toBe(false);
    state = r.state;
  }
  /** Player 0 attacks a rested Character; Buggy (if `grantLeader`) gives the Leader [Blocker]. */
  function startBattle(grantLeader: boolean) {
    act(
      { type: "DECLARE_ATTACK", attackerInstanceId: "char-0-v1", targetInstanceId: plainChar.instanceId },
      0,
    );
    expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    if (!grantLeader) {
      respond({ type: "PASS" });
      return;
    }
    respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
    respond({ type: "SELECT_TARGET", selectedInstanceIds: [state.players[1].leader.instanceId] });
  }
  const block = (id: string) => act({ type: "DECLARE_BLOCKER", blockerInstanceId: id }, 1);

  /** Evaluate USED_BLOCKER from `controller`'s point of view. */
  const usedBlocker = (
    controller: 0 | 1,
    scope: "SELF" | "OPPONENT",
    filter?: { card_type: string },
  ) =>
    evaluateCondition(
      state,
      { type: "ACTION_PERFORMED_THIS_TURN", controller: scope, action: "USED_BLOCKER", ...(filter ? { filter } : {}) } as Condition,
      { sourceCardInstanceId: state.players[controller].leader.instanceId, controller, cardDb: db },
    );

  return {
    charBlocker,
    startBattle,
    block,
    usedBlocker,
    get state() {
      return state;
    },
  };
}

describe("OPT-895 USED_BLOCKER counts Leader and Character blocks", () => {
  it("is true for the blocking side after a Leader block, scoped SELF/OPPONENT", () => {
    const f = fixture();
    f.startBattle(true);
    f.block(f.state.players[1].leader.instanceId);
    expect(f.state.turn.battle?.blockerActivated).toBe(true);
    const rec = f.state.turn.actionsPerformedThisTurn.find((a) => a.actionType === "DECLARE_BLOCKER");
    expect(rec?.cardType).toBe("LEADER");
    expect(f.usedBlocker(1, "SELF")).toBe(true);
    expect(f.usedBlocker(0, "OPPONENT")).toBe(true);
    // The other player did not block.
    expect(f.usedBlocker(0, "SELF")).toBe(false);
    expect(f.usedBlocker(1, "OPPONENT")).toBe(false);
    // Printed-property filters still apply to the Leader snapshot.
    expect(f.usedBlocker(1, "SELF", { card_type: "LEADER" })).toBe(true);
    expect(f.usedBlocker(1, "SELF", { card_type: "CHARACTER" })).toBe(false);
  });

  it("is true for the blocking side after a Character block", () => {
    const f = fixture();
    f.startBattle(false);
    f.block(f.charBlocker.instanceId);
    expect(f.state.turn.battle?.blockerActivated).toBe(true);
    expect(f.usedBlocker(1, "SELF")).toBe(true);
    expect(f.usedBlocker(0, "OPPONENT")).toBe(true);
    expect(f.usedBlocker(0, "SELF")).toBe(false);
    expect(f.usedBlocker(1, "OPPONENT")).toBe(false);
    expect(f.usedBlocker(1, "SELF", { card_type: "CHARACTER" })).toBe(true);
    expect(f.usedBlocker(1, "SELF", { card_type: "LEADER" })).toBe(false);
  });

  it("is false when no Blocker was declared this turn (Leader granted but unused)", () => {
    const f = fixture();
    f.startBattle(true);
    expect(f.usedBlocker(1, "SELF")).toBe(false);
    expect(f.usedBlocker(0, "OPPONENT")).toBe(false);
    expect(f.usedBlocker(1, "OPPONENT")).toBe(false);
  });
});
