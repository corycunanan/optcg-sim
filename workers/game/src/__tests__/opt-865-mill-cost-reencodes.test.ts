/**
 * OPT-865 — OP11-098 Blue Hole and OP12-090 Belo Betty print "You may trash N
 * cards from the top of your deck:" before the colon, so the deck trash is a
 * MILL activation cost (rule 8-3-1), not a first MILL action (OP11-098) and
 * not a TRASH_FROM_HAND cost (OP12-090).
 *
 * Canonical text: docs/cards/OP-11.md:614-619, docs/cards/OP-12.md:540-543.
 * Rules 8-3-1, 8-3-1-3 (a cost that cannot be paid cannot be activated).
 *
 * Every scenario runs the real pipeline with the registered authored schemas.
 * Expected values come from the printed card text.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectiveCost } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(id);
    if (!db.has(id) || Object.keys(data).length > 0 || schema) {
      db.set(id, {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id,
        name: schema?.card_name ?? id,
        cost: 3,
        power: 4000,
        effectText: "",
        ...data,
        ...(schema ? { effectSchema: schema } : {}),
      });
    }
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
    if (zone === "DECK") state.players[owner].deck.unshift(c);
    else if (zone === "LIFE") state.players[owner].life.unshift({ ...c, face: "DOWN" });
    else if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "TRASH") state.players[owner].trash.unshift(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((slot) => !slot)
      ] = c;
    if (["LEADER", "CHARACTER"].includes(zone)) {
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }
  /** Replace a player's deck with `size` vanilla cards (index 0 = top). */
  function deck(owner: 0 | 1, size: number) {
    state.players[owner].deck = [];
    for (let i = 0; i < size; i++) put(`deck-filler-${owner}`, owner, "DECK");
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
  /** Submit a prompt response and return whether the lifecycle rejected it. */
  function respond(action: GameAction): boolean {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    state = r.state;
    return r.responseRejected;
  }
  const promptType = () => state.pendingPrompt?.options.promptType;
  function accept() {
    expect(promptType()).toBe("OPTIONAL_EFFECT");
    act({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function decline() {
    expect(promptType()).toBe("OPTIONAL_EFFECT");
    act({ type: "PLAYER_CHOICE", choiceId: "skip" });
  }
  function select(ids: string[]) {
    act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }
  function validTargets(): string[] {
    const options = state.pendingPrompt?.options;
    return options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
  }
  function millEvents() {
    return state.eventLog.filter(
      (e) => e.type === "CARD_TRASHED" && e.payload.reason === "mill",
    );
  }
  return {
    db, put, deck, act, respond, accept, decline, select, validTargets, promptType, millEvents,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state(): GameState {
      return state;
    },
    set state(value: GameState) {
      state = value;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function onField(state: GameState, instanceId: string): boolean {
  return state.players.some((p) => p.characters.some((c) => c?.instanceId === instanceId));
}

const BLUE_HOLE_TEXT = "[Main] You may trash 3 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a cost of 2 or less.";

function putBlueHole(f: Fixture) {
  return f.put("OP11-098", 0, "HAND", {
    type: "Event",
    cost: 1,
    power: null,
    effectText: BLUE_HOLE_TEXT,
    triggerText: "[Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
  });
}

// ─── OP11-098 Blue Hole ──────────────────────────────────────────────────────

describe("OPT-865 OP11-098 Blue Hole — [Main] MILL 3 is an activation cost", () => {
  it("is authored as one MILL-3 cost with no MILL action", () => {
    const main = getEffectSchema("OP11-098")!.effects.find(
      (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "MAIN_EVENT",
    )!;
    expect(main.costs).toEqual([{ type: "MILL", amount: 3 }]);
    expect(main.actions?.map((a) => a.type)).toEqual(["KO"]);
    expect(main.flags?.optional).toBe(true);
  });

  it.each([0, 1, 2])("with a %i-card deck (fewer than 3) the cost is unpayable: nothing trashed, nothing K.O.'d", (size) => {
    const f = fixture();
    f.deck(0, size);
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putBlueHole(f).instanceId });
    f.accept();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
    expect(f.state.players[0].deck).toHaveLength(size);
    expect(f.millEvents()).toHaveLength(0);
    expect(onField(f.state, victim.instanceId)).toBe(true);
  });

  it("with a 4-card deck pays 3 from the top, one mill event, then K.O.s a cost-2 Character only", () => {
    const f = fixture();
    f.deck(0, 4);
    // Only the top 3 leave the deck: the 4th (bottom) card stays.
    const bottom = f.state.players[0].deck[3].instanceId;
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    const tooBig = f.put("too-big", 1, "CHARACTER", { cost: 3 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putBlueHole(f).instanceId });
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(1);
    expect(f.state.players[0].deck.map((c) => c.instanceId)).toEqual([bottom]);
    const trashed = f.state.players[0].trash;
    expect(trashed).toHaveLength(4); // the 3 milled cards plus the played Event
    expect(f.validTargets()).toEqual([victim.instanceId]);
    f.select([victim.instanceId]);
    expect(onField(f.state, victim.instanceId)).toBe(false);
    expect(onField(f.state, tooBig.instanceId)).toBe(true);
    expect(f.millEvents()).toHaveLength(1);
    expect(f.millEvents()[0]).toMatchObject({ playerIndex: 0, payload: { count: 3, reason: "mill", from: "DECK" } });
  });

  // Rules 9-1-2 (rule processing is immediate) + 9-2-1-2 (a player with 0
  // cards in deck loses): paying with exactly 3 cards empties the deck, so the
  // game must end before the K.O. prompt. Known engine gap (OPT-862); this
  // ratchet fails loudly once immediate deck-out processing lands.
  it.fails("an exactly-3-card deck pays, then loses immediately before the K.O. prompt (rule 9-1-2)", () => {
    const f = fixture();
    f.deck(0, 3);
    f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putBlueHole(f).instanceId });
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state).toMatchObject({ status: "FINISHED", winner: 1 });
  });

  it("declining the optional cost trashes nothing and K.O.s nothing", () => {
    const f = fixture();
    f.deck(0, 5);
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putBlueHole(f).instanceId });
    f.decline();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].deck).toHaveLength(5);
    expect(f.millEvents()).toHaveLength(0);
    expect(onField(f.state, victim.instanceId)).toBe(true);
  });
});

// ─── OP12-090 Belo Betty ─────────────────────────────────────────────────────

const BETTY_TEXT = "[When Attacking] You may trash 2 cards from the top of your deck: Give up to 1 of your opponent's Characters −2 cost during this turn.";

function bettyAttack(f: Fixture) {
  const betty = f.put("OP12-090", 0, "CHARACTER", { cost: 4, power: 5000, effectText: BETTY_TEXT });
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: betty.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
}

describe("OPT-865 OP12-090 Belo Betty — [When Attacking] MILL 2 is an activation cost", () => {
  it("is authored as one MILL-2 cost and no hand-discard cost", () => {
    const block = getEffectSchema("OP12-090")!.effects[0];
    expect(block.costs).toEqual([{ type: "MILL", amount: 2 }]);
  });

  it.each([0, 1])("with a %i-card deck (fewer than 2) the cost is unpayable: no trash, no cost reduction", (size) => {
    const f = fixture();
    f.deck(0, size);
    f.put("h1", 0, "HAND");
    f.put("h2", 0, "HAND");
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    bettyAttack(f);
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(size);
    expect(f.state.players[0].hand).toHaveLength(2);
    expect(f.millEvents()).toHaveLength(0);
    expect(f.validTargets()).not.toContain(target.instanceId);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(3);
  });

  it("with a 3-card deck pays 2 from the deck, discards nothing from hand, then gives -2 cost", () => {
    const f = fixture();
    f.deck(0, 3);
    f.put("h1", 0, "HAND");
    f.put("h2", 0, "HAND");
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    bettyAttack(f);
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(2);
    expect(f.state.players[0].trash).toHaveLength(2);
    expect(f.validTargets()).toEqual([target.instanceId]);
    f.select([target.instanceId]);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(1);
    expect(f.millEvents()).toHaveLength(1);
    expect(f.millEvents()[0].payload).toMatchObject({ count: 2, reason: "mill", from: "DECK" });
  });

  it("with a 3-card deck and an empty hand pays 2 from the deck, discards nothing, gives -2 cost", () => {
    const f = fixture();
    f.deck(0, 3);
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    bettyAttack(f);
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(0);
    expect(f.validTargets()).toEqual([target.instanceId]);
    f.select([target.instanceId]);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(1);
    expect(f.millEvents()).toHaveLength(1);
  });

  // Same rule 9-1-2 / 9-2-1-2 gap (OPT-862): an exactly-2-card deck empties
  // when the cost is paid, so the game must end before the -2 cost prompt.
  it.fails("an exactly-2-card deck pays, then loses immediately before the -2 cost prompt (rule 9-1-2)", () => {
    const f = fixture();
    f.deck(0, 2);
    f.put("target", 1, "CHARACTER", { cost: 3 });
    bettyAttack(f);
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state).toMatchObject({ status: "FINISHED", winner: 1 });
  });

  it("declining the optional cost trashes nothing and changes no cost", () => {
    const f = fixture();
    f.deck(0, 4);
    f.put("h1", 0, "HAND");
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    bettyAttack(f);
    f.decline();
    expect(f.state.players[0].deck).toHaveLength(4);
    expect(f.state.players[0].hand).toHaveLength(1);
    expect(f.millEvents()).toHaveLength(0);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(3);
  });
});
