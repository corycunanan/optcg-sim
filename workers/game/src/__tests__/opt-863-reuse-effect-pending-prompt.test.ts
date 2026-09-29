/**
 * OPT-863 — a Life [Trigger] "Activate this card's [Main] effect." (REUSE_EFFECT)
 * must surface the reused [Main]'s pending prompt to the Trigger's owner, and
 * resume the reused Main and the interrupted damage processing exactly once.
 *
 * Canonical text: docs/cards/EB-01.md:342 (EB01-051), EB-04.md (EB04-049),
 * OP-04.md:385 (OP04-055). Ruling: docs/FAQs/qa_rules.md:233 (the reused
 * [Main]'s activation costs still apply).
 *
 * Every scenario runs the real pipeline with the registered authored schemas.
 */
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import type { Action } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Canonical [Main] text (docs/cards/EB-01.md:342, EB-04.md:382, OP-04.md:385).
const MAIN_TEXT: Record<string, string> = {
  "EB01-051": "[Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
  "EB04-049": "[Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
  "OP04-055": "[Main] You may trash 1 [Ice Oni] from your hand and place 1 Character with a cost of 4 or less at the bottom of the owner's deck: Play 1 [Ice Oni] from your trash.",
};

const ATTACKER = 0;
const OWNER = 1; // takes damage; owns the Trigger

function fixture(id: string) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  let serial = 0;
  function put(
    cardId: string,
    owner: 0 | 1,
    zone: CardInstance["zone"],
    data: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(cardId);
    if (!db.has(cardId) || Object.keys(data).length > 0 || schema) {
      db.set(cardId, {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id: cardId,
        name: schema?.card_name ?? cardId,
        cost: 3,
        power: 4000,
        effectText: "",
        ...data,
        ...(schema ? { effectSchema: schema } : {}),
      });
    }
    const c: CardInstance = {
      instanceId: `${cardId}-${owner}-${zone}-${serial++}`,
      cardId,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "DECK") state.players[owner].deck.unshift(c);
    else if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "TRASH") state.players[owner].trash.unshift(c);
    else if (zone === "LIFE") state.players[owner].life.unshift({ ...c, face: "DOWN" });
    else if (zone === "CHARACTER") {
      state.players[owner].characters[
        state.players[owner].characters.findIndex((slot) => !slot)
      ] = c;
      state = registerCardEnteredField(state, c, db.get(cardId)!);
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
  const promptType = () => state.pendingPrompt?.options.promptType;
  const responder = () => state.pendingPrompt?.respondingPlayer;
  const validTargets = (): string[] => {
    const o = state.pendingPrompt?.options;
    return o?.promptType === "SELECT_TARGET" ? o.validTargets : [];
  };
  const description = () => {
    const o = state.pendingPrompt?.options as { effectDescription?: string } | undefined;
    return o?.effectDescription;
  };
  const events = (type: string) => state.eventLog.filter((e) => e.type === type);
  const millEvents = () => events("CARD_TRASHED").filter((e) => "reason" in e.payload && e.payload.reason === "mill");

  // Owner's deck (index 0 = top) and a Life stack whose top card is the Trigger.
  function setup(deckSize: number, extraLife = 1) {
    state.players[OWNER].deck = [];
    for (let i = 0; i < deckSize; i++) put("deck-filler", OWNER, "DECK");
    state.players[OWNER].life = [];
    for (let i = 0; i < extraLife; i++) put("life-filler", OWNER, "LIFE");
    const trigger = put(id, OWNER, "LIFE", {
      type: "Event",
      cost: 1,
      power: null,
      effectText: MAIN_TEXT[id] ?? MAIN_TEXT["EB01-051"],
      triggerText: "[Trigger] Activate this card's [Main] effect.",
      keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    });
    const victim = put("victim", ATTACKER, "CHARACTER", { cost: 2 });
    return { trigger, victim };
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
  return {
    db, put, setup, attackToTrigger, act, promptType, responder, validTargets, events, millEvents,
    description,
    get state(): GameState {
      return state;
    },
  };
}

const onField = (s: GameState, instanceId: string) =>
  s.players.some((p) => p.characters.some((c) => c?.instanceId === instanceId));

function expectSettled(f: ReturnType<typeof fixture>, lifeLeft: number) {
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.effectStack).toHaveLength(0);
  expect(f.state.turn.battle).toBeNull();
  expect(f.state.turn.battleSubPhase).toBeNull();
  expect(f.state.turn.activePlayerIndex).toBe(ATTACKER);
  // The single damage was dealt exactly once.
  expect(f.state.players[OWNER].life).toHaveLength(lifeLeft);
}

describe.each(["EB01-051", "EB04-049"])("OPT-863 %s Life [Trigger] reuses [Main]", (id) => {
  it("prompts the Trigger's owner (not the attacker) for the optional MILL cost", () => {
    const f = fixture(id);
    f.setup(4);
    f.attackToTrigger();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    expect(f.responder()).toBe(OWNER);
    expect(f.state.effectStack.length).toBeGreaterThan(0);
  });

  it("accept: pays once, prompts the owner for the K.O., K.O.s once, then damage processing settles", () => {
    const f = fixture(id);
    const { victim } = f.setup(4);
    f.attackToTrigger();
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.state.players[OWNER].deck).toHaveLength(2);
    expect(f.promptType()).toBe("SELECT_TARGET");
    expect(f.responder()).toBe(OWNER);
    expect(f.validTargets()).toEqual([victim.instanceId]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });
    expect(onField(f.state, victim.instanceId)).toBe(false);
    expect(f.millEvents()).toHaveLength(1);
    expect(f.events("CARD_KO")).toHaveLength(1);
    expectSettled(f, 1);
  });

  it("decline: nothing is trashed or K.O.'d and damage processing still finishes once", () => {
    const f = fixture(id);
    const { victim } = f.setup(4);
    f.attackToTrigger();
    f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
    expect(f.state.players[OWNER].deck).toHaveLength(4);
    expect(f.millEvents()).toHaveLength(0);
    expect(onField(f.state, victim.instanceId)).toBe(true);
    expectSettled(f, 1);
  });

  it("unpayable cost (1-card deck): accepting pays and K.O.s nothing, then damage finishes", () => {
    const f = fixture(id);
    const { victim } = f.setup(1);
    f.attackToTrigger();
    // Same as playing the Event from hand: the optional prompt is offered,
    // and accepting an unpayable cost resolves as "can't pay".
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.state.players[OWNER].deck).toHaveLength(1);
    expect(f.millEvents()).toHaveLength(0);
    expect(onField(f.state, victim.instanceId)).toBe(true);
    expectSettled(f, 1);
  });
});

describe("OPT-863 prompts keep the reused [Main]'s own description", () => {
  // Review F1: the reusing [Trigger] block's description ("[Trigger] Activate
  // this card's") must not replace the reused [Main]'s, or the player is asked
  // Yes/No without seeing the cost.
  it("EB01-051: the optional MILL prompt and the K.O. target prompt show the [Main] text", () => {
    const f = fixture("EB01-051");
    const { victim } = f.setup(4);
    f.attackToTrigger();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    expect(f.description()).toBe(MAIN_TEXT["EB01-051"]);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.promptType()).toBe("SELECT_TARGET");
    expect(f.description()).toBe(MAIN_TEXT["EB01-051"]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });
    expectSettled(f, 1);
  });
});

describe("OPT-863 OP04-055 Plague Rounds Life [Trigger] reuses [Main] (optional + two costs)", () => {
  function setupOni() {
    const f = fixture("OP04-055");
    const { victim } = f.setup(4);
    const oni = f.put("ICE-ONI", OWNER, "HAND", { name: "Ice Oni", cost: 5 });
    f.put("oni-in-trash", OWNER, "TRASH", { name: "Ice Oni", cost: 5 });
    return { f, victim, oni };
  }
  const oniOnField = (f: ReturnType<typeof fixture>) =>
    f.state.players[OWNER].characters.filter(
      (c) => f.db.get(c?.cardId ?? "")?.name === "Ice Oni",
    );

  it("accept and pay: trashes Ice Oni, bottom-decks a cost ≤4 Character, plays Ice Oni once, then damage settles", () => {
    const { f, victim, oni } = setupOni();
    const attackerDeck = f.state.players[ATTACKER].deck.length;
    f.attackToTrigger();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    expect(f.responder()).toBe(OWNER);
    expect(f.description()).toBe(MAIN_TEXT["OP04-055"]);
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.responder()).toBe(OWNER);
    expect(f.validTargets()).toEqual([oni.instanceId]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [oni.instanceId] });
    expect(f.responder()).toBe(OWNER);
    expect(f.validTargets()).toContain(victim.instanceId);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });
    expect(f.state.players[ATTACKER].deck).toHaveLength(attackerDeck + 1);
    expect(f.state.players[ATTACKER].deck.at(-1)).toMatchObject({ cardId: "victim", owner: ATTACKER });
    // Both Ice Oni are now in the trash (the pre-placed one and the one paid
    // as cost; zone moves assign fresh instance ids), so the owner picks one.
    expect(f.state.players[OWNER].hand.map((c) => c.instanceId)).not.toContain(oni.instanceId);
    expect(f.promptType()).toBe("SELECT_TARGET");
    expect(f.responder()).toBe(OWNER);
    const choices = f.validTargets();
    expect(choices).toHaveLength(2);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [choices[0]] });
    expect(oniOnField(f)).toHaveLength(1);
    const oniInTrash = f.state.players[OWNER].trash.filter(
      (c) => f.db.get(c.cardId)?.name === "Ice Oni",
    );
    expect(oniInTrash).toHaveLength(1);
    expectSettled(f, 1);
  });

  it("decline: no cost is paid, nothing is played, and damage processing still finishes once", () => {
    const { f, victim, oni } = setupOni();
    f.attackToTrigger();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    expect(f.description()).toBe(MAIN_TEXT["OP04-055"]);
    const attackerDeck = f.state.players[ATTACKER].deck.length;
    f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
    expect(f.state.players[OWNER].hand.map((c) => c.instanceId)).toContain(oni.instanceId);
    expect(f.state.players[OWNER].trash.filter((c) => c.cardId === "oni-in-trash")).toHaveLength(1);
    expect(f.state.players[ATTACKER].deck).toHaveLength(attackerDeck);
    expect(onField(f.state, victim.instanceId)).toBe(true);
    expect(oniOnField(f)).toHaveLength(0);
    expectSettled(f, 1);
  });
});

describe("OPT-863 the reused [Main] and the interrupted damage resume exactly once", () => {
  // REUSE_EFFECT is always the last action of its chain (schema validation,
  // validateReuseEffectTailPosition), so the only continuation after the
  // reused block's prompt is the interrupted battle. Synthetic Main with no
  // cost so its K.O. target prompt is the only suspension.
  const schema: EffectSchema = {
    card_id: "SYNTH-863",
    card_name: "Synthetic Reuse",
    card_type: "Event",
    effects: [
      {
        id: "main_ko",
        category: "activate",
        trigger: { keyword: "MAIN_EVENT" },
        actions: [
          {
            type: "KO",
            target: {
              type: "CHARACTER",
              controller: "OPPONENT",
              count: { up_to: 1 },
              filter: { cost_max: 5 },
            },
          },
        ],
      },
      {
        id: "trigger_reuse",
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
      },
    ],
  };

  it("the owner chooses the K.O. target; the K.O. and the battle end each happen once", () => {
    const f = fixture("SYNTH-863");
    const { victim } = f.setup(4);
    f.db.set("SYNTH-863", { ...f.db.get("SYNTH-863")!, effectSchema: schema });
    f.attackToTrigger();
    expect(f.promptType()).toBe("SELECT_TARGET");
    expect(f.responder()).toBe(OWNER);
    // Suspended inside the Trigger: the battle has not ended yet.
    expect(f.state.turn.battle).not.toBeNull();
    expect(f.events("CARD_KO")).toHaveLength(0);
    const battleEndsBefore = f.events("BATTLE_RESOLVED").length;
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });
    expect(onField(f.state, victim.instanceId)).toBe(false);
    expect(f.events("CARD_KO")).toHaveLength(1);
    expect(f.events("BATTLE_RESOLVED").length - battleEndsBefore).toBe(1);
    expectSettled(f, 1);
  });
});

describe("OPT-863 schema validation: REUSE_EFFECT must be in tail position", () => {
  const reuse: Action = { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } };
  const draw: Action = { type: "DRAW", params: { amount: 1 } };
  const validate = (actions: Action[]) =>
    validateEffectSchema(
      {
        card_id: "TEST-863",
        card_name: "Validator Test Card",
        card_type: "Event",
        effects: [
          {
            id: "main",
            category: "auto",
            trigger: { keyword: "MAIN_EVENT" },
            actions: [draw],
          },
          { id: "trigger_reuse", category: "auto", trigger: { keyword: "TRIGGER" }, actions },
        ],
      },
      "TEST-863",
    ).filter((e) => e.includes("REUSE_EFFECT"));

  it("accepts REUSE_EFFECT as the only or last action", () => {
    expect(validate([reuse])).toEqual([]);
    expect(validate([draw, { ...reuse, chain: "THEN" }])).toEqual([]);
  });

  it("rejects an action after REUSE_EFFECT", () => {
    const errors = validate([reuse, { ...draw, chain: "THEN" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("effects[1].actions[0]");
    expect(errors[0]).toContain("OPT-863");
  });

  it("rejects a REUSE_EFFECT that is last in a choice option when the choice is followed by an action", () => {
    const choice: Action = { type: "PLAYER_CHOICE", params: { options: [[reuse], [draw]] } };
    expect(validate([choice])).toEqual([]);
    const errors = validate([choice, { ...draw, chain: "THEN" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("actions[0].params.options[0][0]");
  });

  it("every authored schema passes the rule", () => {
    const violations = Object.values(getAllAuthoredSchemas()).flatMap((schema) =>
      validateEffectSchema(schema, schema.card_id).filter((e) => e.includes("OPT-863")),
    );
    expect(violations).toEqual([]);
  });
});
