/**
 * OPT-825 — OP10-034 Franky's replacement applies only to a battle K.O.
 *
 * Canonical text (docs/cards/OP-10.md): "[Once Per Turn] If this Character
 * would be K.O.'d in battle, you may add 1 card from the top of your Life
 * cards to your hand instead."
 *
 * - Rules §7-1-4-1-2: a Character that loses a battle is K.O.'d. That result
 *   is the only "K.O.'d in battle".
 * - FAQ (P-040 Kaido; ST05-017 Union Armada) treats "K.O.'d by an effect" and
 *   "K.O.'d in battle" as separate categories, so an effect that K.O.s a card
 *   while a battle is in progress is not a battle K.O.
 * - Rules §8-1-3-4-1: a declined optional replacement is not resolved.
 *
 * Every card effect below comes from the production registry. The fixture only
 * supplies card stats (Franky: cost 4, 5000 power, from the official data).
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { parseStoredSession } from "../session/persistence.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;

  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectText: "",
      effectSchema: schema ?? null,
      ...overrides,
    });
  }

  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    if (!db.has(id)) data(id);
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${controller}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "STAGE") p.stage = card;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "STAGE" || zone === "CHARACTER")
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function franky(controller: 0 | 1 = 0) {
    data("OP10-034", { cost: 4, power: 5000, counter: 1000 });
    return put("OP10-034", controller);
  }

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }

  function persist() {
    state = parseStoredSession(
      JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
    ).state;
  }

  function respond(action: GameAction, rejected = false) {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt })).toBe(rejected);
    state = r.state;
  }
  const accept = () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => respond({ type: "PLAYER_CHOICE", choiceId: "skip" });
  const select = (ids: string[]) => respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });

  /** `attacker` (default: the player's Leader, 5000 power) attacks a rested `target`; everyone passes. */
  function battle(player: 0 | 1, target: CardInstance, attacker = state.players[player].leader) {
    state.turn.activePlayerIndex = player;
    const onBoard = state.players[target.controller].characters.find(
      (c) => c?.instanceId === target.instanceId,
    )!;
    onBoard.state = "RESTED";
    act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    });
    while (!state.pendingPrompt && state.turn.battle) act({ type: "PASS" });
  }

  const onField = (card: CardInstance) =>
    state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId);
  // Zone moves assign a fresh instanceId; each test card id is unique per player.
  const inTrash = (card: CardInstance) =>
    state.players[card.owner].trash.some((c) => c.cardId === card.cardId);
  const promptType = () => state.pendingPrompt?.options.promptType;

  return {
    db,
    data,
    put,
    franky,
    act,
    persist,
    respond,
    accept,
    decline,
    select,
    battle,
    onField,
    inTrash,
    promptType,
    get state() {
      return state;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

/** Player 1 plays ST01-015 "[Main] K.O. up to 1 of your opponent's Characters with 6000 power or less." */
function opponentMainEventKO(f: Fixture, target: CardInstance) {
  f.data("ST01-015", {
    type: "Event",
    cost: 4,
    power: null,
    counter: null,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters with 6000 power or less.",
  });
  const event = f.put("ST01-015", 1, "HAND");
  f.state.turn.activePlayerIndex = 1;
  f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  expect(f.promptType()).toBe("SELECT_TARGET");
  f.select([target.instanceId]);
}

/**
 * Player 0's `attacker` attacks player 1's Leader; in the counter step player 1
 * plays EB01-010 "[Counter] K.O. up to 1 of your opponent's Characters with
 * 6000 base power or less." on `target`.
 */
function opponentCounterEventKO(f: Fixture, attacker: CardInstance, target: CardInstance) {
  f.data("EB01-010", {
    type: "Event",
    cost: 3,
    power: null,
    counter: null,
    effectText:
      "[Counter] K.O. up to 1 of your opponent's Characters with 6000 base power or less.",
  });
  const event = f.put("EB01-010", 1, "HAND");
  f.state.turn.activePlayerIndex = 0;
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  f.act({ type: "PASS" });
  f.act(
    {
      type: "USE_COUNTER_EVENT",
      cardInstanceId: event.instanceId,
      counterTargetInstanceId: f.state.players[1].leader.instanceId,
    },
    1,
  );
  expect(f.promptType()).toBe("SELECT_TARGET");
  f.select([target.instanceId]);
}

function giveDon(f: Fixture, player: 0 | 1, count: number) {
  f.state.players[player].donCostArea = Array.from({ length: count }, (_, i) => ({
    instanceId: `don-p${player}-x${i}`,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));
}

// ─── Battle K.O.: the replacement is offered ─────────────────────────────────

describe("OP10-034 Franky — battle K.O. offers the replacement", () => {
  it("accept: the top Life card goes to hand and Franky stays on the field", () => {
    const f = fixture();
    const franky = f.franky();
    const life = f.state.players[0].life.map((c) => ({ id: c.instanceId, cardId: c.cardId }));

    f.battle(1, franky);

    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    expect(f.state.pendingPrompt?.resumeContext).toMatchObject({
      type: "REPLACEMENT",
      targetInstanceId: franky.instanceId,
      event: "WOULD_BE_KO",
    });
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(franky)).toBe(true);
    expect(f.inTrash(franky)).toBe(false);
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(life.slice(1).map((c) => c.id));
    expect(f.state.players[0].hand.map((c) => c.cardId)).toEqual([life[0].cardId]);
  });

  it("persisted resume: a JSON round-trip while the prompt is pending resolves exactly once", () => {
    const f = fixture();
    const franky = f.franky();
    const lifeBefore = f.state.players[0].life.length;

    f.battle(1, franky);
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.persist();
    expect(f.state.pendingPrompt?.resumeContext).toMatchObject({
      type: "REPLACEMENT",
      targetInstanceId: franky.instanceId,
    });
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(franky)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore - 1);
    expect(f.state.players[0].hand).toHaveLength(1);

    // Replaying the response after resolution is rejected and changes nothing.
    f.persist();
    f.respond({ type: "PLAYER_CHOICE", choiceId: "accept" }, true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore - 1);
    expect(f.state.players[0].hand).toHaveLength(1);
  });

  it("once per turn: a second battle K.O. in the same turn is not offered", () => {
    const f = fixture();
    const franky = f.franky();
    f.data("P1-ATTACKER", { power: 6000 });
    const second = f.put("P1-ATTACKER", 1);

    f.battle(1, franky);
    f.accept();
    expect(f.onField(franky)).toBe(true);
    const lifeAfterFirst = f.state.players[0].life.length;
    // OPT-872: the first battle ends on its own once the replacement resolves.
    expect(f.state.turn.battle).toBeNull();

    f.battle(1, franky, second);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.inTrash(franky)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeAfterFirst);
  });

  // OPT-872: the damage step resumes after the battle-K.O. replacement prompt
  // resolves (formerly it.fails ratchets).

  it("decline: Franky is K.O.'d and Life is unchanged (rules §8-1-3-4-1)", () => {
    const f = fixture();
    const franky = f.franky();
    const life = f.state.players[0].life.map((c) => c.instanceId);

    f.battle(1, franky);
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.decline();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(life);
    expect(f.state.players[0].hand).toHaveLength(0);
    expect(f.inTrash(franky)).toBe(true);
    expect(f.state.turn.battle).toBeNull();
  });

  it("accept: the battle ends after the replacement resolves (rules §7-1-4-1-2 → §7-1-5)", () => {
    const f = fixture();
    const franky = f.franky();

    f.battle(1, franky);
    f.accept();

    expect(f.onField(franky)).toBe(true);
    expect(f.state.turn.battle).toBeNull();
  });

  // Rules §8-1-3-4-5: a replacement that cannot be carried out cannot be
  // applied. With 0 Life the LIFE_TO_HAND substitute cannot be carried out, so
  // it is not offered and the battle K.O. proceeds (OPT-873).
  it("empty Life: the replacement is not offered; Franky is K.O.'d (rules §8-1-3-4-5)", () => {
    const f = fixture();
    const franky = f.franky();
    f.state.players[0].life = [];
    const handBefore = f.state.players[0].hand.map((c) => c.instanceId);

    f.battle(1, franky);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(franky)).toBe(false);
    expect(f.inTrash(franky)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(0);
    expect(f.state.players[0].hand.map((c) => c.instanceId)).toEqual(handBefore);
    expect(f.state.turn.battle).toBeNull();
  });
});

// ─── Effect K.O.: the replacement is not offered ─────────────────────────────

describe("OP10-034 Franky — an effect K.O. does not offer the replacement", () => {
  it("opponent's [Main] Event K.O. outside a battle", () => {
    const f = fixture();
    const franky = f.franky();
    const lifeBefore = f.state.players[0].life.length;

    opponentMainEventKO(f, franky);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.inTrash(franky)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
    expect(f.state.players[0].hand).toHaveLength(0);
  });

  it("opponent's [Counter] Event K.O. during a battle", () => {
    const f = fixture();
    const franky = f.franky();
    const lifeBefore = f.state.players[0].life.length;

    opponentCounterEventKO(f, franky, franky);

    expect(f.promptType()).not.toBe("OPTIONAL_EFFECT");
    expect(f.inTrash(franky)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
    expect(f.state.players[0].hand).toHaveLength(0);
  });

  it("own [End of Your Turn] effect K.O. outside a battle (OP05-040 Birdcage)", () => {
    const f = fixture();
    const franky = f.franky();
    f.data("OP05-040", { type: "Stage", cost: 2, power: null, counter: null });
    f.put("OP05-040", 0, "STAGE");
    giveDon(f, 0, 10);
    f.state.players[0].characters.find((c) => c?.instanceId === franky.instanceId)!.state = "RESTED";
    const lifeBefore = f.state.players[0].life.length;

    f.act({ type: "ADVANCE_PHASE" });

    expect(f.promptType()).not.toBe("OPTIONAL_EFFECT");
    expect(f.inTrash(franky)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
  });

  it("own [When Attacking] effect K.O. during a battle (OP08-119 Kaido & Linlin)", () => {
    const f = fixture();
    const franky = f.franky();
    f.data("OP08-119", { cost: 10, power: 12000, counter: null });
    const kaido = f.put("OP08-119", 0);
    giveDon(f, 0, 10);
    const lifeBefore = f.state.players[0].life.length;

    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: kaido.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    for (let i = 0; f.promptType() === "OPTIONAL_EFFECT" && i < 3; i++) {
      // The [When Attacking] DON!! −10 cost is optional; the Franky
      // replacement must never be the prompt offered here.
      const ctx = f.state.pendingPrompt?.resumeContext;
      const ctxType = typeof ctx === "object" && ctx && "type" in ctx ? String(ctx.type) : "";
      expect(ctxType).not.toMatch(/^REPLACEMENT/);
      f.accept();
    }

    expect(f.promptType()).not.toBe("OPTIONAL_EFFECT");
    expect(f.inTrash(franky)).toBe(true);
    expect(f.onField(kaido)).toBe(true);
    expect(f.state.players[0].donCostArea).toHaveLength(0);
    expect(f.state.players[0].life.length).toBeGreaterThanOrEqual(lifeBefore);
    expect(f.state.players[0].life.length).toBeLessThanOrEqual(lifeBefore + 1);
    expect(f.state.players[0].hand.every((c) => c.cardId !== "OP10-034")).toBe(true);
  });
});

// ─── Unrelated cause filters keep their semantics ────────────────────────────

describe("cause filters other than BATTLE are unchanged", () => {
  it("ANY (OP11-110 Fukaboshi) is offered for a battle K.O.", () => {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name: "Shirahoshi" });
    f.data("OP11-110", { cost: 4, power: 5000 });
    const fukaboshi = f.put("OP11-110", 0);

    f.battle(1, fukaboshi);

    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
  });

  it("ANY (OP11-110 Fukaboshi) is offered for an opponent's effect K.O.", () => {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name: "Shirahoshi" });
    f.data("OP11-110", { cost: 4, power: 5000 });
    const fukaboshi = f.put("OP11-110", 0);

    opponentMainEventKO(f, fukaboshi);

    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
  });

  it("ANY_EFFECT (ST20-002 Charlotte Cracker) is offered for an opponent's effect K.O.", () => {
    const f = fixture();
    f.data("ST20-002", { cost: 4, power: 5000 });
    const cracker = f.put("ST20-002", 0);

    opponentMainEventKO(f, cracker);

    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
  });

  it("ANY_EFFECT (ST20-002 Charlotte Cracker) is not offered for a battle K.O.", () => {
    const f = fixture();
    f.data("ST20-002", { cost: 4, power: 5000 });
    const cracker = f.put("ST20-002", 0);

    f.battle(1, cracker);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.inTrash(cracker)).toBe(true);
  });

  it("OPPONENT_EFFECT (ST29-008 Nami) is not offered for a battle K.O. of your Egghead Character", () => {
    const f = fixture();
    f.put("ST29-008", 0);
    f.data("EGG-ALLY", { types: ["Egghead"] });
    const ally = f.put("EGG-ALLY", 0);

    f.battle(1, ally);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.inTrash(ally)).toBe(true);
  });
});

// ─── Unknown `by` values fail closed ─────────────────────────────────────────

describe("an unknown cause_filter.by never matches", () => {
  function typoFranky(f: Fixture) {
    const schema = structuredClone(getEffectSchema("OP10-034")!);
    const block = schema.effects[0];
    if (block.category !== "replacement" || !block.replaces?.cause_filter) throw new Error("shape");
    // Simulates an authoring typo that bypassed the type system.
    (block.replaces.cause_filter as { by: string }).by = "BATLE";
    f.data("OP10-034", { cost: 4, power: 5000, effectSchema: schema });
    return f.put("OP10-034", 0);
  }

  it("is not offered for a battle K.O.", () => {
    const f = fixture();
    const franky = typoFranky(f);
    f.battle(1, franky);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.inTrash(franky)).toBe(true);
  });

  it("is not offered for an opponent's effect K.O.", () => {
    const f = fixture();
    const franky = typoFranky(f);
    opponentMainEventKO(f, franky);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.inTrash(franky)).toBe(true);
  });
});
