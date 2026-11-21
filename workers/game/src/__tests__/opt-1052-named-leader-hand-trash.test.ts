/**
 * OPT-1052 — CARD_TRASHED_FROM_HAND effect_source by name and card type:
 * OP18-080 Van Augur "[Your Turn] [Once Per Turn] When a card is trashed from
 * your hand by your [Marshall.D.Teach] Leader's effect, if you have no other
 * [Van Augur], draw 1 card."
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState } from "../types.js";
import { matchTriggersForEvent, registerCardEnteredField } from "../engine/triggers.js";
import { evaluateCondition } from "../engine/conditions.js";
import { OP18_080_VAN_AUGUR } from "../engine/schemas/op18.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const WATCHER_ID = "your_turn_teach_leader_hand_trash_draw";

function fixture() {
  const db = createTestCardDb();
  db.set("OP18-080", { ...CARDS.VANILLA, id: "OP18-080", name: "Van Augur", effectSchema: OP18_080_VAN_AUGUR });
  db.set("TEACH-LEADER", { ...CARDS.LEADER, id: "TEACH-LEADER", name: "Marshall.D.Teach" });
  db.set("TEACH-CHAR", { ...CARDS.VANILLA, id: "TEACH-CHAR", name: "Marshall.D.Teach" });
  db.set("OTHER-LEADER", { ...CARDS.LEADER, id: "OTHER-LEADER", name: "Jesus Burgess" });
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => { p.characters = padChars([]); });
  let serial = 0;
  const put = (cardId: string): CardInstance => {
    const card: CardInstance = { instanceId: `${cardId}-${serial++}`, cardId, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0, controller: 0, owner: 0 };
    state.players[0].characters[state.players[0].characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(cardId)!);
    return card;
  };
  const vanAugur = put("OP18-080");
  const trashEvent = (effectSourceCardId: string, effectSourceController: 0 | 1 = 0) => ({
    type: "CARD_TRASHED" as const,
    playerIndex: 0 as const,
    timestamp: 0,
    payload: { from: "HAND", count: 1, reason: "effect", movementCause: "EFFECT" as const, effectSourceCardId, effectSourceController },
  });
  const watcherMatches = (s: GameState, sourceCardId: string, sourceController: 0 | 1 = 0) =>
    matchTriggersForEvent(s, trashEvent(sourceCardId, sourceController), db)
      .some((m) => m.trigger.effectBlock?.id === WATCHER_ID);
  return { db, get state() { return state; }, put, vanAugur, watcherMatches };
}

describe("OPT-1052 — OP18-080 Van Augur", () => {
  it("matches a hand trash by your Marshall.D.Teach Leader's effect", () => {
    const f = fixture();
    expect(f.state.turn.activePlayerIndex).toBe(0);
    expect(f.watcherMatches(f.state, "TEACH-LEADER")).toBe(true);
  });

  it("does not match a Teach Character, a non-Teach Leader, or the opponent's Teach Leader", () => {
    const f = fixture();
    expect(f.watcherMatches(f.state, "TEACH-CHAR")).toBe(false);
    expect(f.watcherMatches(f.state, "OTHER-LEADER")).toBe(false);
    expect(f.watcherMatches(f.state, "TEACH-LEADER", 1)).toBe(false);
  });

  it("does not match during the opponent's turn", () => {
    const f = fixture();
    const theirTurn: GameState = { ...f.state, turn: { ...f.state.turn, activePlayerIndex: 1 } };
    expect(f.watcherMatches(theirTurn, "TEACH-LEADER")).toBe(false);
  });

  it("requires no other [Van Augur] on your field", () => {
    const f = fixture();
    const block = OP18_080_VAN_AUGUR.effects.find((b) => b.id === WATCHER_ID)!;
    const ctx = { sourceCardInstanceId: f.vanAugur.instanceId, controller: 0 as const, cardDb: f.db };
    expect(evaluateCondition(f.state, block.conditions!, ctx)).toBe(true);
    f.put("OP18-080");
    expect(evaluateCondition(f.state, block.conditions!, ctx)).toBe(false);
  });
});
