import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectiveCost } from "../engine/modifiers.js";
import { handTrashedByEffectThisTurn } from "../engine/hand-trash.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// OPT-1034: ST33-004 Borsalino — "During the turn in which a card in your
// hand is trashed by an effect, give this card in your hand −3 cost."
// docs/FAQs/qa_st-33.md: a trash caused by the opponent's effect counts.
function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {}
  ) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      cost: 3,
      power: 4000,
      effectText: "",
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else {
      state.players[owner].characters[
        state.players[owner].characters.findIndex((x) => !x)
      ] = c;
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }
  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  function select(ids: string[]) {
    act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }
  function accept() {
    if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      act({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function borsalino(owner: 0 | 1) {
    return put("ST33-004", owner, "HAND", { cost: 5, types: ["Navy"], color: ["BLUE"] });
  }
  function cost(c: CardInstance) {
    return getEffectiveCost(db.get(c.cardId)!, state, c.instanceId, db);
  }
  function done() {
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
  }
  return {
    db, put, act, select, accept, borsalino, cost, done,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state() {
      return state;
    },
  };
}

describe("OPT-1034 hand-trash turn record — ST33-004 Borsalino", () => {
  it("your own effect trashing a hand card gives Borsalino −3 cost", () => {
    const f = fixture();
    const b = f.borsalino(0);
    const a = f.put("discard-a", 0, "HAND");
    const c = f.put("discard-b", 0, "HAND");
    expect(f.cost(b)).toBe(5);
    f.act({ type: "PLAY_CARD", cardInstanceId: f.put("OP12-046", 0, "HAND", { types: ["Navy"] }).instanceId });
    if (f.state.pendingPrompt) f.select([a.instanceId, c.instanceId]);
    f.done();
    expect(f.state.players[0].hand.map((h) => h.instanceId)).toEqual([b.instanceId]);
    expect(handTrashedByEffectThisTurn(f.state, 0)).toBe(true);
    expect(handTrashedByEffectThisTurn(f.state, 1)).toBe(false);
    f.roundTrip();
    expect(f.cost(b)).toBe(2);
  });

  it("an opponent's effect trashing your hand card counts, and only for your hand", () => {
    const f = fixture();
    f.state.turn.activePlayerIndex = 1;
    const mine = f.borsalino(0);
    const filler = f.put("filler", 0, "HAND");
    const theirs = f.borsalino(1);
    f.act({ type: "PLAY_CARD", cardInstanceId: f.put("OP01-114", 1, "HAND").instanceId }, 1);
    f.accept();
    // DON!! −1: choose which DON!! returns.
    const donChoice = f.state.pendingPrompt!.options;
    expect(donChoice.promptType).toBe("PLAYER_CHOICE");
    if (donChoice.promptType !== "PLAYER_CHOICE") return;
    f.act({ type: "PLAYER_CHOICE", choiceId: donChoice.choices[0].id }, 1);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    f.select([filler.instanceId]);
    f.done();
    const trash = f.state.eventLog.find((e) => e.type === "CARD_TRASHED" && e.payload.from === "HAND");
    expect(trash?.payload).toMatchObject({ movementCause: "EFFECT", effectSourceController: 1 });
    expect(f.cost(mine)).toBe(2);
    expect(f.cost(theirs)).toBe(5);
  });

  it("an activation-cost discard counts, matching CARD_TRASHED_FROM_HAND", () => {
    const f = fixture();
    const b = f.borsalino(0);
    const filler = f.put("filler", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: f.put("OP03-025", 0, "HAND").instanceId });
    f.accept();
    if (f.state.pendingPrompt) f.select([filler.instanceId]);
    while (f.state.pendingPrompt) f.select([]);
    f.done();
    expect(f.state.players[0].hand.map((h) => h.instanceId)).toEqual([b.instanceId]);
    expect(f.cost(b)).toBe(2);
  });

  it("a symbol Counter discard is not an effect trash", () => {
    const f = fixture();
    const b = f.borsalino(1);
    const counter = f.put("counter", 1, "HAND", { counter: 2000 });
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" });
    f.act(
      {
        type: "USE_COUNTER",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1
    );
    expect(f.state.players[1].trash.some((c) => c.cardId === "counter")).toBe(true);
    expect(f.cost(b)).toBe(5);
  });

  it("the reduction ends with the turn", () => {
    const f = fixture();
    const b = f.borsalino(0);
    const a = f.put("discard-a", 0, "HAND");
    const c = f.put("discard-b", 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: f.put("OP12-046", 0, "HAND", { types: ["Navy"] }).instanceId });
    if (f.state.pendingPrompt) f.select([a.instanceId, c.instanceId]);
    expect(f.cost(b)).toBe(2);
    // MAIN → END → next turn: the turn record resets (phases.ts).
    while (f.state.turn.activePlayerIndex === 0) f.act({ type: "ADVANCE_PHASE" });
    expect(f.cost(b)).toBe(5);
  });
});
