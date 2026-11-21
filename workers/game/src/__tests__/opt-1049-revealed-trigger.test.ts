/**
 * OPT-1049 — OP18-105 Spandam "[Trigger] If your Leader's type includes "CP",
 * reveal up to 1 card with a type including "CP" other than [Spandam] from
 * your hand. Activate the [Trigger] effect of the revealed card."
 *
 * qa_op18: the revealed card is returned to your hand and this Spandam is
 * trashed. Every scenario runs the real pipeline from a Life [Trigger].
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { OP18_105_SPANDAM } from "../engine/schemas/op18.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ATTACKER = 0;
const OWNER = 1; // takes damage; owns Spandam

function fixture(leaderTypes: string[] = ["CP9"]) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  db.set("CP-LEADER", { ...CARDS.LEADER, id: "CP-LEADER", name: "Leader", types: leaderTypes });
  state.players[OWNER].leader = { ...state.players[OWNER].leader, cardId: "CP-LEADER" };
  let serial = 0;
  function put(cardId: string, owner: 0 | 1, zone: CardInstance["zone"], data: Partial<CardData> = {}): CardInstance {
    const schema = getEffectSchema(cardId);
    db.set(cardId, {
      ...CARDS.VANILLA,
      id: cardId,
      name: schema?.card_name ?? cardId,
      effectText: "",
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const c: CardInstance = {
      instanceId: `${cardId}-${owner}-${zone}-${serial++}`,
      cardId, controller: owner, owner, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LIFE") state.players[owner].life.unshift({ ...c, face: "DOWN" });
    else if (zone === "CHARACTER") {
      state.players[owner].characters[state.players[owner].characters.findIndex((slot) => !slot)] = c;
      state = registerCardEnteredField(state, c, db.get(cardId)!);
    }
    return c;
  }
  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  const trigger = { types: ["CP9"], keywords: { ...CARDS.VANILLA.keywords, trigger: true } };
  function setup() {
    state.players[OWNER].life = [];
    put("life-filler", OWNER, "LIFE");
    const spandam = put("OP18-105", OWNER, "LIFE", { ...trigger, name: "Spandam", triggerText: "[Trigger] ..." });
    const victim = put("victim", ATTACKER, "CHARACTER");
    return { spandam, victim };
  }
  function attackToTrigger() {
    act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[ATTACKER].leader.instanceId,
      targetInstanceId: state.players[OWNER].leader.instanceId,
    });
    act({ type: "PASS" });
    act({ type: "PASS" });
    act({ type: "REVEAL_TRIGGER", reveal: true }, OWNER);
  }
  const validTargets = (): string[] => {
    const o = state.pendingPrompt?.options;
    return o?.promptType === "SELECT_TARGET" ? o.validTargets : [];
  };
  return {
    put, setup, attackToTrigger, act, validTargets, trigger,
    get state(): GameState {
      return state;
    },
  };
}

const inHand = (s: GameState, id: string) => s.players[OWNER].hand.some((c) => c.instanceId === id);
const inTrash = (s: GameState, cardId: string) => s.players[OWNER].trash.some((c) => c.cardId === cardId);
const restedOpponent = (s: GameState, id: string) =>
  s.players[ATTACKER].characters.find((c) => c?.instanceId === id)?.state === "RESTED";

describe("OPT-1049 — OP18-105 Spandam", () => {
  it("validates against the schema registry", () => {
    expect(validateEffectSchema(OP18_105_SPANDAM)).toEqual([]);
    const broken = JSON.parse(JSON.stringify(OP18_105_SPANDAM));
    broken.effects[0].actions[1].params.source_ref = "";
    expect(validateEffectSchema(broken).some((e: string) => e.includes("source_ref"))).toBe(true);
  });

  it("reveals a CP hand card and resolves its [Trigger]; the card stays in hand and Spandam is trashed", () => {
    const f = fixture();
    const { victim } = f.setup();
    // OP18-116 Iron Body Empty Tree: "[Trigger] If your Leader's type includes
    // "CP", rest up to 1 of your opponent's Characters."
    const ironBody = f.put("OP18-116", OWNER, "HAND", { ...f.trigger, type: "Event", power: null });
    const plain = f.put("plain", OWNER, "HAND");
    const otherSpandam = f.put("OP18-105", OWNER, "HAND", { ...f.trigger, name: "Spandam" });
    f.attackToTrigger();

    expect(f.validTargets()).toEqual([ironBody.instanceId]);
    expect(f.validTargets()).not.toContain(plain.instanceId);
    expect(f.validTargets()).not.toContain(otherSpandam.instanceId);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [ironBody.instanceId] });

    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(OWNER);
    expect(f.validTargets()).toEqual([victim.instanceId]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });

    expect(restedOpponent(f.state, victim.instanceId)).toBe(true);
    expect(inHand(f.state, ironBody.instanceId)).toBe(true);
    expect(inTrash(f.state, "OP18-116")).toBe(false);
    expect(inTrash(f.state, "OP18-105")).toBe(true);
    expect(f.state.pendingPrompt).toBeNull();
  });

  it("a revealed 'Play this card' [Trigger] does nothing: the card stays in hand", () => {
    const f = fixture();
    f.setup();
    // OP17-071 Who's.Who: "[Trigger] Play this card."
    const whosWho = f.put("OP17-071", OWNER, "HAND", f.trigger);
    f.attackToTrigger();
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [whosWho.instanceId] });
    expect(inHand(f.state, whosWho.instanceId)).toBe(true);
    expect(f.state.players[OWNER].characters.some((c) => c?.cardId === "OP17-071")).toBe(false);
    expect(inTrash(f.state, "OP18-105")).toBe(true);
  });

  it("does nothing when your Leader's type does not include CP", () => {
    const f = fixture(["Navy"]);
    const { victim } = f.setup();
    const ironBody = f.put("OP18-116", OWNER, "HAND", { ...f.trigger, type: "Event", power: null });
    f.attackToTrigger();
    expect(f.state.pendingPrompt).toBeNull();
    expect(inHand(f.state, ironBody.instanceId)).toBe(true);
    expect(restedOpponent(f.state, victim.instanceId)).toBe(false);
  });
});
