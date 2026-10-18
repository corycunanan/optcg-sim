import { describe, expect, it } from "vitest";
import { getEffectivePower } from "../engine/modifiers.js";
import type { Action } from "../engine/effect-types.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

// Card text: OP02-004/023, OP06-020, ST15-001. FAQ qa_op02:24-32
// explicitly permits Squard's debuff while its Life-to-hand action is blocked.
function grant(id: string): Rig {
  const r = rig();
  r.life(0, 3);
  r.life(1, 3);
  r.deck(0, 10);
  r.deck(1, 10);
  r.db.set(r.state.players[0].leader.cardId, {
    ...r.db.get(r.state.players[0].leader.cardId)!,
    name: "Edward.Newgate", types: ["Whitebeard Pirates"],
  });
  if (id === "OP06-020") {
    r.leader(0, id);
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: r.state.players[0].leader.instanceId, effectId: "OP06-020_effect_1" });
    if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
    if (r.promptType() === "SELECT_TARGET") r.select([]);
  } else if (id === "ST15-001") {
    const source = r.put(id, 0, "CHARACTER");
    r.act({ type: "DECLARE_ATTACK", attackerInstanceId: source.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
    r.act({ type: "PASS" }, 1);
    r.act({ type: "PASS" }, 1);
  } else {
    const source = r.put(id, 0, "HAND", { data: { cost: 0, effectText: "[Main]", type: id === "OP02-023" ? "Event" : "Character" } });
    r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
  }
  expect(r.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ADD_LIFE_TO_HAND")).toBe(true);
  expect(r.state.pendingPrompt).toBeFalsy();
  return r;
}

function activate(r: Rig, controller: 0 | 1, actions: Action[]) {
  const source = r.put("OPT984-ACTION", controller, "CHARACTER", {
    schema: synSchema("OPT984-ACTION", [{ id: "move", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions }]),
  });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "move" }, controller);
}

const lifeToHand: Action = { type: "LIFE_TO_HAND", params: { amount: 2, position: "TOP" } };

describe("OPT-984 own effects cannot add Life to hand", () => {
  it.each(["OP02-004", "OP02-023", "OP06-020", "ST15-001"])("%s blocks the whole move; THEN continues and IF_DO does not", (id) => {
    const r = grant(id);
    const before = structuredClone(r.state.players);
    activate(r, 0, [lifeToHand,
      { type: "DRAW", params: { amount: 2 }, chain: "IF_DO" },
      { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
    ]);
    expect(r.state.players[0].life).toEqual(before[0].life);
    expect(r.state.players[0].hand).toHaveLength(before[0].hand.length + 1);
    expect(r.state.players[0].trash).toEqual(before[0].trash);
    expect(r.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE").length).toBe(0);
    expect(r.state.players[1].life).toEqual(before[1].life);
    expect(r.state.players[1].hand).toEqual(before[1].hand);
    expect(r.state.players[1].trash).toEqual(before[1].trash);
  });

  it.each(["OP02-004", "OP02-023", "OP06-020", "ST15-001"])("%s prevents authored Squard's Life move but preserves its debuff (FAQ)", (id) => {
    const r = grant(id);
    const leaderId = r.state.players[0].leader.cardId;
    r.db.set(leaderId, { ...r.db.get(leaderId)!, types: ["Whitebeard Pirates"] });
    const target = r.put("OPT984-TARGET", 1, "CHARACTER");
    const source = r.put("OP02-009", 0, "HAND", { data: { cost: 0 } });
    const before = structuredClone(r.state.players.map((p) => ({ life: p.life, hand: p.hand })));
    r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
    if (r.promptType() === "SELECT_TARGET") r.select([target.instanceId]);
    expect(r.state.players[0].life).toEqual(before[0].life);
    expect(r.state.players[0].hand).toHaveLength(before[0].hand.length - 1);
    expect(r.state.players[1].life).toEqual(before[1].life);
    expect(r.state.players[1].hand).toEqual(before[1].hand);
    expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(r.db.get(target.cardId)!.power! - 4000);
  });

  it.each([false, true])("effect damage still adds Life to hand (Trigger declined: %s)", (trigger) => {
    const r = grant("OP02-023");
    if (trigger) r.put("OP02-023", 0, "LIFE", { data: { type: "Event", triggerText: "Up to 1 of your Leader gains +1000 power during this turn.", keywords: { ...r.db.get("OP02-023")!.keywords, trigger: true } } });
    const before = structuredClone(r.state.players);
    r.state.turn.activePlayerIndex = 1;
    activate(r, 1, [{ type: "DEAL_DAMAGE", params: { amount: 1 } }]);
    if (trigger) {
      expect(r.state.turn.pendingTriggerFromEffect?.lifeCard.cardId).toBe("OP02-023");
      r.act({ type: "REVEAL_TRIGGER", reveal: false }, 0);
    }
    expect(r.state.players[0].life).toEqual(before[0].life.slice(1));
    expect(r.state.players[0].hand).toHaveLength(before[0].hand.length + 1);
    expect(r.state.players[1].life).toEqual(before[1].life);
    expect(r.state.players[1].hand).toEqual(before[1].hand);
  });

  it("battle damage and declining its Trigger still add the prohibited player's Life to hand", () => {
    const r = grant("OP02-023");
    r.put("OP02-023", 0, "LIFE", { data: {
      type: "Event", triggerText: "Up to 1 of your Leader gains +1000 power during this turn.",
      keywords: { ...r.db.get("OP02-023")!.keywords, trigger: true },
    } });
    r.state.turn.activePlayerIndex = 1;
    const before = structuredClone(r.state.players);
    r.act({ type: "DECLARE_ATTACK", attackerInstanceId: r.state.players[1].leader.instanceId, targetInstanceId: r.state.players[0].leader.instanceId }, 1);
    r.act({ type: "PASS" }, 0);
    r.act({ type: "PASS" }, 0);
    expect(r.state.turn.battle?.pendingTriggerLifeCard?.cardId).toBe("OP02-023");
    r.act({ type: "REVEAL_TRIGGER", reveal: false }, 0);
    expect(r.state.players[0].life).toEqual(before[0].life.slice(1));
    expect(r.state.players[0].hand).toHaveLength(before[0].hand.length + 1);
    expect(r.state.players[1].life).toEqual(before[1].life);
    expect(r.state.players[1].hand).toEqual(before[1].hand);
  });

  it("self-inflicted damage is damage processing, not a Life-to-hand effect", () => {
    const r = grant("OP02-023");
    activate(r, 0, [{ type: "SELF_TAKE_DAMAGE", params: { amount: 1 } }]);
    expect(r.state.players.map((p) => p.life.length)).toEqual([2, 3]);
    expect(r.state.players.map((p) => p.hand.length)).toEqual([1, 0]);
  });

  it("allows an opponent's effect on the prohibited player's Life and the opponent's own Life", () => {
    const r = grant("OP02-023");
    // Arrange an opponent main phase without expiring the prohibition to isolate causation.
    r.state.turn.activePlayerIndex = 1;
    activate(r, 1, [{ ...lifeToHand, target: { type: "OPPONENT_LIFE" } }, lifeToHand]);
    expect(r.state.players.map((p) => p.life.length)).toEqual([1, 1]);
    expect(r.state.players.map((p) => p.hand.length)).toEqual([2, 2]);
  });

  it.each([true, false])("OP15-105 replacement requires a payable Life move (prohibited: %s)", (prohibited) => {
    const r = prohibited ? grant("OP02-023") : rig();
    if (!prohibited) {
      r.life(0, 3);
      r.life(1, 3);
    }
    r.put("OP15-105", 0, "CHARACTER", { data: { power: 5000 } });
    const target = r.put("OPT984-SAVE-TARGET", 0, "CHARACTER", { data: { power: 5000 } });
    const before = structuredClone(r.state.players);
    r.state.turn.activePlayerIndex = 1;
    activate(r, 1, [{ type: "KO", target: {
      type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 },
      filter: { name: "OPT984-SAVE-TARGET" },
    } }]);
    if (r.promptType() === "SELECT_TARGET") r.select([target.instanceId]);
    if (prohibited) {
      // Rules 8-1-3-4-5/7: the owner's substitute cannot be done, so it
      // cannot replace the opponent's removal (even though Life is nonempty).
      expect(r.state.pendingPrompt).toBeFalsy();
      expect(r.state.players[0].characters.some((c) => c?.instanceId === target.instanceId)).toBe(false);
      expect(r.state.players[0].trash.some((c) => c.cardId === target.cardId)).toBe(true);
      expect(r.state.players[0].life).toEqual(before[0].life);
      expect(r.state.players[0].hand).toEqual(before[0].hand);
    } else {
      expect(r.promptType()).toBe("OPTIONAL_EFFECT");
      r.accept();
      expect(r.state.players[0].characters.some((c) => c?.instanceId === target.instanceId)).toBe(true);
      expect(r.state.players[0].trash).toEqual(before[0].trash);
      expect(r.state.players[0].life).toEqual(before[0].life.slice(1));
      expect(r.state.players[0].hand).toHaveLength(before[0].hand.length + 1);
      expect(r.state.players[0].hand.at(-1)?.cardId).toBe(before[0].life[0].cardId);
    }
    expect(r.state.players[1].life).toEqual(before[1].life);
    expect(r.state.players[1].hand).toEqual(before[1].hand);
  });

  it("OP12-081 delegates the Life move to P0 but remains P1's effect", () => {
    const r = grant("OP02-023");
    r.leader(1, "OP12-081");
    const source = r.put("OPT984-COST8", 0, "HAND", { data: { cost: 8 } });
    const before = structuredClone(r.state.players);
    r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
    expect(r.state.pendingPrompt).toBeFalsy();
    expect(r.state.players[0].life).toEqual(before[0].life.slice(1));
    expect(r.state.players[0].hand).toHaveLength(before[0].hand.length);
    expect(r.state.players[0].hand.at(-1)?.cardId).toBe(before[0].life[0].cardId);
    expect(r.state.players[1].life).toEqual(before[1].life);
    expect(r.state.players[1].hand).toEqual(before[1].hand);
  });

  it("expires at turn end; the next turn can add Life to hand", () => {
    const r = grant("OP02-023");
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ADD_LIFE_TO_HAND")).toBe(false);
    for (let i = 0; i < 15 && (r.state.turn.activePlayerIndex !== 0 || r.state.turn.phase !== "MAIN"); i++) {
      r.act({ type: "ADVANCE_PHASE" });
    }
    const before = r.state.players[0].hand.length;
    activate(r, 0, [lifeToHand]);
    expect(r.state.players[0].life).toHaveLength(1);
    expect(r.state.players[0].hand).toHaveLength(before + 2);
  });
});
