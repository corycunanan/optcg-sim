import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Expectations: canonical text and official FAQs recorded in opt-846-life-costs.md.
function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {}
  ) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema?.card_name ?? id,
      type:
        zone === "LEADER" ? "Leader" : zone === "STAGE" ? "Stage" : "Character",
      cost: id === "OP08-063" ? 6 : id === "ST13-009" ? 7 : 0,
      power: zone === "LEADER" ? 5000 : 7000,
      effectText:
        data.type === "Event"
          ? "[Main] Rest up to 1 of your opponent’s Characters."
          : "",
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else if (zone === "STAGE") state.players[owner].stage = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((c) => !c)
      ] = c;
    if (zone !== "HAND")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function act(
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) {
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
  function play(c: CardInstance) {
    act({ type: "PLAY_CARD", cardInstanceId: c.instanceId });
  }
  function done() {
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
  }
  return {
    db,
    put,
    act,
    select,
    accept,
    play,
    done,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state() {
      return state;
    },
  };
}

describe("OPT-846 authored Life position costs", () => {
  for (const id of ["EB01-040", "OP08-063", "OP08-058"] as const) {
    const count = id === "OP08-058" ? 2 : 1;
    const required = id === "OP08-063" ? "UP" : "DOWN";
    const flipped = required === "UP" ? "DOWN" : "UP";
    it.each([
      "legal",
      "wrong-top",
      "wrong-second",
      "empty",
      "short",
      "decline",
      "persist",
      "stale",
    ])(`${id} %s`, (scenario) => {
      const f = fixture();
      const p = f.state.players[0];
      p.life.forEach((c) => (c.face = required));
      if (scenario === "wrong-top") p.life[0].face = flipped;
      if (scenario === "wrong-second" && count === 2) p.life[1].face = flipped;
      if (scenario === "empty") p.life = [];
      if (scenario === "short") p.life = p.life.slice(0, count - 1);
      const target = f.put("victim", 1, "CHARACTER", { cost: 0 });
      const before = structuredClone(p.life);
      const donBefore = p.donCostArea.length;
      const source = f.put(id, 0, id === "OP08-063" ? "HAND" : "LEADER");
      const action: GameAction =
        id === "EB01-040"
          ? {
              type: "ACTIVATE_EFFECT",
              cardInstanceId: source.instanceId,
              effectId: "activate_ko",
            }
          : id === "OP08-063"
            ? { type: "PLAY_CARD", cardInstanceId: source.instanceId }
            : {
                type: "DECLARE_ATTACK",
                attackerInstanceId: source.instanceId,
                targetInstanceId: f.state.players[1].leader.instanceId,
              };
      const payable =
        !["wrong-top", "empty", "short"].includes(scenario) &&
        !(scenario === "wrong-second" && count === 2);
      if (!payable && id === "EB01-040") {
        const result = runPipeline(f.state, action, f.db, 0);
        expect(result.valid).toBe(false);
        expect(result.state.players[0].life).toEqual(before);
        expect(result.state.players[1].characters[0]?.instanceId).toBe(
          target.instanceId
        );
        return;
      }
      f.act(action);
      if (payable)
        expect(f.state.pendingPrompt?.options.promptType).toBe(
          "OPTIONAL_EFFECT"
        );
      if (scenario === "persist" || scenario === "stale") f.roundTrip();
      if (scenario === "stale")
        f.state.players[0].life[count - 1].face = flipped;
      const paymentBefore = structuredClone(f.state.players[0].life);
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        f.act({
          type: "PLAYER_CHOICE",
          choiceId: scenario === "decline" ? "skip" : "accept",
        });
      const paid = payable && scenario !== "decline" && scenario !== "stale";
      if (paid && id === "EB01-040") f.select([target.instanceId]);
      if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
        f.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
      f.done();
      expect(f.state.players[0].life).toEqual(
        paymentBefore.map((c, i) =>
          paid && i < count ? { ...c, face: flipped } : c
        )
      );
      expect(f.state.players[0].trash).toHaveLength(0);
      expect(f.state.players[0].donCostArea).toHaveLength(
        donBefore + (paid && id !== "EB01-040" ? 1 : 0)
      );
      expect(f.state.players[1].trash.some((c) => c.cardId === "victim")).toBe(
        paid && id === "EB01-040"
      );
    });
  }

  it.each(["legal", "wrong-top", "empty", "decline"])(
    "Merry Go compound cost %s",
    (scenario) => {
      const f = fixture();
      const stage = f.put("EB02-060", 0, "STAGE");
      const target = f.put("straw-hat", 0, "CHARACTER", {
        types: ["Straw Hat Crew"],
        power: 4000,
      });
      f.state.players[0].life.forEach((c) => (c.face = "DOWN"));
      if (scenario === "wrong-top") f.state.players[0].life[0].face = "UP";
      if (scenario === "empty") f.state.players[0].life = [];
      const before = structuredClone(f.state.players[0].life);
      const action: GameAction = {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: stage.instanceId,
        effectId: "activate_power_buff",
      };
      if (scenario === "wrong-top" || scenario === "empty") {
        expect(runPipeline(f.state, action, f.db, 0).valid).toBe(false);
      } else {
        f.act(action);
        expect(f.state.pendingPrompt?.options.promptType).toBe(
          "OPTIONAL_EFFECT"
        );
        f.roundTrip();
        f.act({
          type: "PLAYER_CHOICE",
          choiceId: scenario === "decline" ? "skip" : "accept",
        });
        if (scenario === "legal") f.select([target.instanceId]);
        f.done();
      }
      expect(f.state.players[0].stage?.state).toBe(
        scenario === "legal" ? "RESTED" : "ACTIVE"
      );
      expect(f.state.players[0].life).toEqual(
        before.map((c, i) =>
          scenario === "legal" && i === 0 ? { ...c, face: "UP" } : c
        )
      );
      expect(
        getEffectivePower(target, f.db.get(target.cardId)!, f.state, f.db)
      ).toBe(scenario === "legal" ? 5000 : 4000);
    }
  );

  it("Shanks retains unpositioned payment below a face-down top", () => {
    const f = fixture();
    f.state.players[0].life.forEach((c) => (c.face = "DOWN"));
    f.state.players[0].life[1].face = "UP";
    const before = structuredClone(f.state.players[0].life);
    // Post-cost condition deliberately false: isolate the unchanged generic cost.
    const opponentBefore = f.state.players[1].life.length;
    f.play(f.put("ST13-009", 0, "HAND"));
    f.roundTrip();
    f.accept();
    f.done();
    expect(f.state.players[0].life).toEqual(
      before.map((c, i) => (i === 1 ? { ...c, face: "DOWN" } : c))
    );
    expect(f.state.players[1].life).toHaveLength(opponentBefore);
  });
});
