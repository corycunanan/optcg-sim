import { describe, expect, it } from "vitest";
import { isBlockerProhibited } from "../../../../shared/blocker-prohibition.js";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  getEffectiveBasePower,
  getEffectivePower,
} from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Expected behavior: docs/cards/OP-15.md, OP-16.md and official FAQ
// faq_op15-eb04.md (099/114), qa_op16.md (081). Authored production registry.
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
      cost: 3,
      power: 4000,
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
  function activate(c: CardInstance, effectId: string) {
    act({ type: "ACTIVATE_EFFECT", cardInstanceId: c.instanceId, effectId });
    accept();
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
    activate,
    done,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state() {
      return state;
    },
  };
}

describe("OPT-812 authored card pipeline", () => {
  it.each([
    [0, "warriors"],
    [1, "warriors"],
    [1, "vassal"],
    [1, "skip"],
    [2, "warriors"],
  ] as const)("Yama cost %i chooses %s", (cost, choice) => {
    const f = fixture();
    const a = f.put("warriors", 0, "HAND", { name: "Heavenly Warriors", cost });
    f.put("vassal", 0, "HAND", { types: ["Vassals"], cost });
    f.put("unrelated", 0, "HAND", { cost: 1 });
    f.play(f.put("OP15-073", 0, "HAND"));
    const options = f.state.pendingPrompt?.options;
    if (cost === 1) {
      expect(options?.promptType).toBe("SELECT_TARGET");
      if (options?.promptType !== "SELECT_TARGET")
        throw new Error("Missing Yama prompt");
      expect(options.validTargets.sort()).toEqual(
        [a.instanceId, "vassal-0-HAND"].sort()
      );
      f.select(choice === "skip" ? [] : [`${choice}-0-HAND`]);
      expect(
        f.state.players[0].characters.some((c) => c?.cardId === choice)
      ).toBe(choice !== "skip");
      expect(f.state.players[0].hand).toHaveLength(choice === "skip" ? 3 : 2);
    } else {
      expect(f.state.players[0].hand).toHaveLength(3);
      expect(options).toBeUndefined();
    }
    f.done();
  });

  it.each([
    [9, 0, 5000],
    [10, 0, 5000],
    [10, 1, 5000],
    [19, 1, 5000],
    [20, 1, 7000],
    [20, 0, 5000],
    [30, 0, 5000],
  ] as const)(
    "Luffy trash %i turn %i sets leader to %i",
    (trash, player, power) => {
      const f = fixture();
      f.state.players[0].trash = Array.from({ length: trash }, (_, i) => ({
        ...f.state.players[0].leader,
        instanceId: `trash-${i}`,
        zone: "TRASH",
      }));
      f.play(f.put("OP15-092", 0, "HAND"));
      f.state.turn.activePlayerIndex = player;
      f.act({
        type: "ATTACH_DON",
        targetInstanceId: f.state.players[player].leader.instanceId,
        count: 1,
      });
      const leader = f.state.players[0].leader;
      expect(
        getEffectiveBasePower(leader, f.db.get(leader.cardId)!, f.state, f.db)
      ).toBe(power);
      const luffy = f.state.players[0].characters[0]!;
      expect(
        getEffectiveBasePower(luffy, f.db.get(luffy.cardId)!, f.state, f.db)
      ).toBe(trash >= 10 ? 9000 : 4000);
      f.done();
    }
  );

  it.each(["own", "opponent", "neither"] as const)(
    "Otama checks %s cost-8 Character after paying rest",
    (who) => {
      const f = fixture();
      const otama = f.put("OP16-081");
      const target = f.put("target", 1, "CHARACTER", {
        cost: who === "opponent" ? 8 : 7,
      });
      if (who === "own") f.put("big", 0, "CHARACTER", { cost: 8 });
      f.activate(otama, "activate_big_character_debuff");
      if (who !== "neither") f.select([target.instanceId]);
      expect(f.state.players[0].characters[0]?.state).toBe("RESTED");
      expect(
        getEffectivePower(target, f.db.get(target.cardId)!, f.state, f.db)
      ).toBe(who === "neither" ? 4000 : 2000);
      f.done();
    }
  );

  it.each([
    ["Monkey.D.Luffy", [], 4000, true],
    ["Other", ["Whitebeard Pirates"], 8000, true],
    ["Other", ["Whitebeard Pirates"], 7999, false],
    ["Other", [], 8000, false],
  ] as const)(
    "Ace grants rush to %s %j power %i eligible %s",
    (name, types, power, eligible) => {
      const f = fixture();
      const ace = f.put("OP16-001", 0, "LEADER");
      const target = f.put("candidate", 0, "CHARACTER", {
        name,
        types: [...types],
        power,
      });
      target.turnPlayed = f.state.turn.number;
      f.activate(ace, "activate_grant_rush");
      if (eligible) f.select([target.instanceId]);
      f.done();
      const attack = runPipeline(
        f.state,
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: target.instanceId,
          targetInstanceId: f.state.players[1].leader.instanceId,
        },
        f.db,
        0
      );
      expect(attack.valid).toBe(eligible);
    }
  );

  it.each(["UP", "DOWN", "EMPTY"] as const)(
    "Urouge Life top %s preserves Life and only pays legal top",
    (face) => {
      const f = fixture();
      const source = f.put("OP15-099");
      const life = f.state.players[0].life;
      life.forEach((c) => (c.face = "UP"));
      if (face === "EMPTY") f.state.players[0].life = [];
      else life[0].face = face;
      const before = structuredClone(f.state.players[0].life);
      f.state.players[0].donCostArea[0].state = "RESTED";
      const action: GameAction = {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: source.instanceId,
        effectId: "OP15-099_activate",
      };
      if (face !== "UP") {
        expect(runPipeline(f.state, action, f.db, 0).valid).toBe(false);
        expect(f.state.players[0].life).toEqual(before);
        return;
      }
      f.act(action);
      f.accept();
      f.select([f.state.players[0].leader.instanceId]);
      f.done();
      expect(f.state.players[0].life).toEqual(
        before.map((c, i) => (i === 0 ? { ...c, face: "DOWN" } : c))
      );
      expect(f.state.players[0].trash).toHaveLength(0);
      expect(f.state.players[0].leader.attachedDon).toHaveLength(1);
    }
  );

  it.each(["DOWN", "UP", "EMPTY"] as const)(
    "Wyper Life top %s gates debuff and subsequent KO",
    (face) => {
      const f = fixture();
      f.state.players[0].life.forEach((c) => (c.face = "DOWN"));
      if (face === "EMPTY") f.state.players[0].life = [];
      else f.state.players[0].life[0].face = face;
      const before = structuredClone(f.state.players[0].life);
      f.put("zero-after", 1, "CHARACTER", { power: 2000 });
      const survivor = f.put("survivor", 1, "CHARACTER", { power: 3000 });
      f.play(f.put("OP15-114", 0, "HAND"));
      f.accept();
      f.done();
      expect(f.state.players[0].life).toEqual(
        before.map((c, i) =>
          i === 0 && face === "DOWN" ? { ...c, face: "UP" } : c
        )
      );
      expect(f.state.players[0].trash).toHaveLength(0);
      expect(
        f.state.players[1].trash.some((c) => c.cardId === "zero-after")
      ).toBe(face === "DOWN");
      expect(
        getEffectivePower(survivor, f.db.get(survivor.cardId)!, f.state, f.db)
      ).toBe(face === "DOWN" ? 1000 : 3000);
    }
  );

  it.each(["OP01-033", "OP02-047"])("Usopp rest by authored %s", (id) => {
    const f = fixture();
    const usopp = f.put("OP15-024", 1);
    f.play(
      f.put(id, 0, "HAND", { type: id === "OP02-047" ? "Event" : "Character" })
    );
    if (f.state.pendingPrompt) f.select([usopp.instanceId]);
    f.done();
    expect(f.state.players[1].characters[0]?.state).toBe(
      id === "OP02-047" ? "RESTED" : "ACTIVE"
    );
  });

  it.each([5, 6])(
    "Kuma cost %i protection prevents subsequent rest",
    (cost) => {
      const f = fixture();
      const target = f.put("target", 1, "CHARACTER", { cost });
      f.play(f.put("OP15-029", 0, "HAND"));
      if (cost === 5) f.select([target.instanceId]);
      f.done();
      f.play(f.put("ST02-017", 0, "HAND", { type: "Event", cost: 1 }));
      if (f.state.pendingPrompt) f.select([target.instanceId]);
      f.done();
      expect(f.state.players[1].characters[0]?.state).toBe(
        cost === 5 ? "ACTIVE" : "RESTED"
      );
    }
  );

  it("Usopp is protected against Carrot's authored Leader effect", () => {
    const f = fixture();
    f.put("OP15-024", 1);
    const carrot = f.put("OP08-021", 0, "LEADER");
    f.put("mink", 0, "CHARACTER", { types: ["Minks"] });
    f.activate(carrot, "activate_rest");
    f.done();
    expect(f.state.players[1].characters[0]?.state).toBe("ACTIVE");
  });

  // No authored Stage currently has SET_REST; use a controlled supplemental
  // source to prove this shared provenance boundary against authored Usopp.
  it.each([
    ["Stage", 0],
    ["Character", 1],
  ] as const)("Usopp permits %s source controlled by %i", (type, owner) => {
    const f = fixture();
    const usopp = f.put("OP15-024", 1);
    const source = f.put(
      "supplemental-rest",
      owner,
      type === "Stage" ? "STAGE" : "CHARACTER",
      {
        type,
        effectSchema: {
          card_id: "supplemental-rest",
          effects: [
            {
              id: "rest",
              category: "auto",
              trigger: { keyword: "ON_OPPONENT_ATTACK" },
              actions: [
                {
                  type: "SET_REST",
                  target: {
                    type: "CHARACTER",
                    controller: "EITHER",
                    count: { up_to: 1 },
                  },
                },
              ],
            },
          ],
        },
      }
    );
    // Trigger on player0's attack; the source can belong to player1 while
    // Usopp's Opponent's Turn protection is still active.
    if (owner === 0) {
      // An Activate Main Stage runs on its controller's turn instead.
      f.db.get(source.cardId)!.effectSchema!.effects[0] = {
        id: "rest",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [
          {
            type: "SET_REST",
            target: {
              type: "CHARACTER",
              controller: "EITHER",
              count: { up_to: 1 },
            },
          },
        ],
      };
      f.activate(source, "rest");
    } else
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: f.state.players[0].leader.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
    f.select([usopp.instanceId]);
    f.done();
    expect(
      f.state.players[1].characters.find((c) => c?.cardId === "OP15-024")?.state
    ).toBe("RESTED");
  });

  it.each(["OP15-099", "OP15-114"])(
    "%s decline leaves Life and subsequent effect untouched",
    (id) => {
      const f = fixture();
      f.state.players[0].life[0].face = id === "OP15-099" ? "UP" : "DOWN";
      const before = structuredClone(f.state.players[0].life);
      const target = f.put("untouched", 1);
      if (id === "OP15-099") {
        const c = f.put(id);
        f.act({
          type: "ACTIVATE_EFFECT",
          cardInstanceId: c.instanceId,
          effectId: "OP15-099_activate",
        });
      } else f.play(f.put(id, 0, "HAND"));
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
      f.done();
      expect(f.state.players[0].life).toEqual(before);
      expect(
        getEffectivePower(target, f.db.get(target.cardId)!, f.state, f.db)
      ).toBe(4000);
      expect(f.state.players[0].leader.attachedDon).toHaveLength(0);
    }
  );

  it.each(["OP15-099", "OP15-114"])(
    "%s rechecks top face before actual payment",
    (id) => {
      const f = fixture();
      const requiredFace = id === "OP15-099" ? "UP" : "DOWN";
      f.state.players[0].life.forEach((c) => (c.face = requiredFace));
      const target = f.put("untouched", 1);
      if (id === "OP15-099") {
        const c = f.put(id);
        f.act({
          type: "ACTIVATE_EFFECT",
          cardInstanceId: c.instanceId,
          effectId: "OP15-099_activate",
        });
      } else f.play(f.put(id, 0, "HAND"));
      f.state.players[0].life[0].face = requiredFace === "UP" ? "DOWN" : "UP";
      const before = structuredClone(f.state.players[0].life);
      f.accept();
      f.done();
      expect(f.state.players[0].life).toEqual(before);
      expect(
        getEffectivePower(target, f.db.get(target.cardId)!, f.state, f.db)
      ).toBe(4000);
      expect(f.state.players[0].leader.attachedDon).toHaveLength(0);
    }
  );

  it("Usopp can activate Blocker on the opponent's turn", () => {
    const f = fixture();
    const usopp = f.put("OP15-024", 1);
    expect(
      isBlockerProhibited(
        f.state.prohibitions,
        { instanceId: usopp.instanceId, controller: 1, cardType: "Character" },
        1,
        { matchesFilter: () => true }
      )
    ).toBe(false);
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "DECLARE_BLOCKER", blockerInstanceId: usopp.instanceId }, 1);
    expect(f.state.players[1].characters[0]?.state).toBe("RESTED");
    expect(f.state.turn.battle?.targetInstanceId).toBe(usopp.instanceId);
  });

  it("Usopp pays the authored OP14-036 counter's own rest cost", () => {
    const f = fixture();
    const usopp = f.put("OP15-024", 1);
    const counter = f.put("OP14-036", 1, "HAND", {
      type: "Event",
      effectText:
        "[Counter] You may rest 1 of your cards: Up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    });
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1
    );
    f.accept();
    f.select([usopp.instanceId]);
    f.select([f.state.players[1].leader.instanceId]);
    f.done();
    expect(f.state.players[1].characters[0]?.state).toBe("RESTED");
    const leader = f.state.players[1].leader;
    expect(
      getEffectivePower(leader, f.db.get(leader.cardId)!, f.state, f.db)
    ).toBe(9000);
  });

  it("Usopp remains protected after opposing Law trashes itself as cost", () => {
    const f = fixture();
    f.put("OP15-024", 1);
    const law = f.put("OP05-027");
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: law.instanceId,
      effectId: "activate_rest_opponent",
    });
    f.roundTrip();
    f.accept();
    f.done();
    expect(f.state.players[0].trash.some((c) => c.cardId === "OP05-027")).toBe(
      true
    );
    expect(f.state.players[1].characters[0]?.state).toBe("ACTIVE");
  });

  it("Kuma protection survives its controller's End Phase and ends after the opponent's End Phase", () => {
    const f = fixture();
    const target = f.put("target", 1, "CHARACTER", { cost: 5 });
    f.play(f.put("OP15-029", 0, "HAND"));
    f.select([target.instanceId]);
    f.done();
    function nextMain(player: 0 | 1) {
      for (let i = 0; i < 8; i++) {
        f.act({ type: "ADVANCE_PHASE" });
        if (
          f.state.turn.activePlayerIndex === player &&
          f.state.turn.phase === "MAIN"
        )
          return;
      }
      throw new Error("Turn did not reach Main");
    }
    nextMain(1);
    const attack = {
      type: "DECLARE_ATTACK",
      attackerInstanceId: target.instanceId,
      targetInstanceId: f.state.players[0].leader.instanceId,
    } as const;
    expect(runPipeline(f.state, attack, f.db, 1).valid).toBe(false);
    nextMain(0);
    f.play(f.put("ST02-017", 0, "HAND", { type: "Event", cost: 1 }));
    f.select([target.instanceId]);
    f.done();
    expect(f.state.players[1].characters[0]?.state).toBe("RESTED");
  });

  it("Usopp can attack on its own turn", () => {
    const f = fixture();
    const usopp = f.put("OP15-024");
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: usopp.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    expect(f.state.players[0].characters[0]?.state).toBe("RESTED");
  });
});
