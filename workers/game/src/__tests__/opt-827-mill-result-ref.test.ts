import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectResult } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { executeMill } from "../engine/effect-resolver/actions/draw-search.js";
import { evaluateCondition } from "../engine/conditions.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Printed clause (docs/cards/OP-08.md:661), OP08-096 People's Dreams Don't
// Ever End!!: "[Counter] Trash 1 card from the top of your deck. If the
// trashed card has a cost of 6 or more, up to 1 of your Leader or Character
// cards gains +5000 power during this battle."
// Rules: 5-1-2-1 (a deck holds only Character, Event and Stage cards) and
// 2-7-5 (only those card types have costs), so every milled card has a
// printed cost. 3-1-6 — the milled card is a new card in the trash; the gate
// reads the card actually moved, never an unrelated trash or field card.

const DEFENDER = 1 as const;

function fixture(deckCosts: number[], opts: { deckType?: CardData["type"] } = {}) {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });

  const schema = getEffectSchema("OP08-096");
  expect(schema).toBeDefined();
  db.set("OP08-096", {
    ...CARDS.EVENT_COUNTER,
    id: "OP08-096",
    name: "People's Dreams Don't Ever End!!",
    color: ["Black"],
    cost: 1,
    effectText:
      "[Counter] Trash 1 card from the top of your deck. If the trashed card has a cost of 6 or more, up to 1 of your Leader or Character cards gains +5000 power during this battle.",
    triggerText:
      "[Trigger] Play up to 1 black Character card with a cost of 3 or less from your trash.",
    effectSchema: schema!,
  });
  const counter: CardInstance = {
    instanceId: "op08-096-hand",
    cardId: "OP08-096",
    controller: DEFENDER,
    owner: DEFENDER,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
  };
  state.players[DEFENDER].hand.push(counter);

  state.players[DEFENDER].deck = deckCosts.map((cost, i) => {
    const id = `DECK-COST-${cost}-${i}`;
    db.set(id, { ...CARDS.VANILLA, id, name: id, cost, type: opts.deckType ?? "Character" });
    return {
      instanceId: `deck-${i}`,
      cardId: id,
      controller: DEFENDER,
      owner: DEFENDER,
      zone: "DECK",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
    };
  });

  function act(action: GameAction, player: 0 | 1) {
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

  return {
    db,
    counter,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
    act,
    /** Attack the defender's Leader and resolve OP08-096 as a [Counter]. */
    attackAndCounter() {
      const defenderLeader = state.players[DEFENDER].leader;
      act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: state.players[0].leader.instanceId,
          targetInstanceId: defenderLeader.instanceId,
        },
        0,
      );
      act({ type: "PASS" }, DEFENDER); // no blocker
      act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: counter.instanceId,
          counterTargetInstanceId: defenderLeader.instanceId,
        },
        DEFENDER,
      );
    },
    leaderPower() {
      const leader = state.players[DEFENDER].leader;
      return getEffectivePower(leader, db.get(leader.cardId)!, state, db);
    },
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
  };
}

function expectSettled(state: GameState) {
  expect(state.pendingPrompt).toBeNull();
  expect(state.effectStack).toHaveLength(0);
}

describe("OPT-827 OP08-096 gates on the card actually milled", () => {
  it.each([
    { cost: 6, label: "exactly 6" },
    { cost: 7, label: "above 6" },
    { cost: 10, label: "well above 6" },
  ])("milled cost $label → up to 1 Leader/Character gains +5000 this battle", ({ cost }) => {
    const f = fixture([cost, 1, 1]);
    const base = f.leaderPower();
    f.attackAndCounter();

    // The gate passed, so the "up to 1" selection is offered.
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const leaderId = f.state.players[DEFENDER].leader.instanceId;
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [leaderId] }, DEFENDER);
    expectSettled(f.state);

    expect(f.leaderPower()).toBe(base + 5000);
    // Exactly one card milled: the top card, now a fresh instance in trash.
    const trash = f.state.players[DEFENDER].trash.filter((c) => c.cardId !== "OP08-096");
    expect(trash.map((c) => c.cardId)).toEqual([`DECK-COST-${cost}-0`]);
    expect(trash[0].instanceId).not.toBe("deck-0");
    expect(f.state.players[DEFENDER].deck).toHaveLength(2);
  });

  it("milled cost 5 → no buff and no selection prompt", () => {
    const f = fixture([5, 9, 9]);
    const base = f.leaderPower();
    f.attackAndCounter();
    expectSettled(f.state);
    expect(f.leaderPower()).toBe(base);
    expect(f.state.players[DEFENDER].trash.map((c) => c.cardId)).toContain("DECK-COST-5-0");
    expect(f.state.players[DEFENDER].deck).toHaveLength(2);
  });

  it("an unrelated cost-6+ card in trash or on the field does not satisfy the gate", () => {
    const f = fixture([2, 9]);
    const db = f.db;
    db.set("BIG-TRASH", { ...CARDS.VANILLA, id: "BIG-TRASH", name: "BIG-TRASH", cost: 9 });
    db.set("BIG-FIELD", { ...CARDS.VANILLA, id: "BIG-FIELD", name: "BIG-FIELD", cost: 8 });
    const p = f.state.players[DEFENDER];
    p.trash.push({
      instanceId: "big-trash",
      cardId: "BIG-TRASH",
      controller: DEFENDER,
      owner: DEFENDER,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
    });
    p.characters[0] = {
      instanceId: "big-field",
      cardId: "BIG-FIELD",
      controller: DEFENDER,
      owner: DEFENDER,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const base = f.leaderPower();
    f.attackAndCounter();
    expectSettled(f.state);
    expect(f.leaderPower()).toBe(base);
  });

  it("empty deck → nothing milled, the gate is false, no buff, no crash", () => {
    // A defender with 0 deck cards has already lost at rule processing before
    // it can reach the counter step through the pipeline (the pipeline
    // rejects with "Game is already over"), so this resolves the registered
    // OP08-096 [Counter] block directly. Deck-out defeat timing is OPT-862;
    // this asserts only the gate.
    const f = fixture([]);
    const block = getEffectSchema("OP08-096")!.effects.find((e) => e.id === "counter_effect")!;
    const before = f.state.activeEffects.length;
    const r = resolveEffect(f.state, block, f.counter.instanceId, DEFENDER, f.db);
    expect(r.pendingPrompt).toBeUndefined();
    expect(r.state.activeEffects).toHaveLength(before);
    expect(r.state.players[DEFENDER].trash).toHaveLength(0);
  });

  it("the gate survives a JSON round-trip of the pending selection and applies exactly once", () => {
    const f = fixture([6, 1]);
    const base = f.leaderPower();
    f.attackAndCounter();
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    f.roundTrip();
    const leaderId = f.state.players[DEFENDER].leader.instanceId;
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [leaderId] }, DEFENDER);
    expectSettled(f.state);
    expect(f.leaderPower()).toBe(base + 5000);
    // Only the one milled card moved; a second resume did not re-mill.
    expect(f.state.players[DEFENDER].deck).toHaveLength(1);
  });

  it("the buff can go to a Character, and choosing none is allowed (up to 1)", () => {
    const f = fixture([6]);
    f.state.players[DEFENDER].characters[0] = {
      instanceId: "ally",
      cardId: CARDS.VANILLA.id,
      controller: DEFENDER,
      owner: DEFENDER,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    f.attackAndCounter();
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["ally"] }, DEFENDER);
    expectSettled(f.state);
    const ally = f.state.players[DEFENDER].characters[0]!;
    expect(getEffectivePower(ally, f.db.get(ally.cardId)!, f.state, f.db)).toBe(
      CARDS.VANILLA.power! + 5000,
    );

    const g = fixture([6]);
    const base = g.leaderPower();
    g.attackAndCounter();
    g.act({ type: "SELECT_TARGET", selectedInstanceIds: [] }, DEFENDER);
    expectSettled(g.state);
    expect(g.leaderPower()).toBe(base);
  });
});

describe("OPT-827 MILL result_ref records the moved card", () => {
  it("records the new trash instance id and a printed-card snapshot", () => {
    const f = fixture([7, 2]);
    const refs = new Map<string, EffectResult>();
    const r = executeMill(
      f.state,
      { type: "MILL", params: { amount: 1 }, result_ref: "milled" },
      f.counter.instanceId,
      DEFENDER,
      f.db,
      refs,
    );
    expect(r.succeeded).toBe(true);
    const trashed = r.state.players[DEFENDER].trash[0];
    expect(trashed.cardId).toBe("DECK-COST-7-0");
    expect(r.result?.targetInstanceIds).toEqual([trashed.instanceId]);
    expect(r.result?.revealedCards).toEqual([
      { instanceId: trashed.instanceId, cardId: "DECK-COST-7-0", source: "MILL", controller: DEFENDER },
    ]);
  });

  it("the condition still reads the milled card after it leaves the trash (last-known snapshot)", () => {
    const f = fixture([7, 2]);
    const r = executeMill(
      f.state,
      { type: "MILL", params: { amount: 1 } },
      f.counter.instanceId,
      DEFENDER,
      f.db,
      new Map(),
    );
    const state = r.state;
    // Move the milled card out of the trash (e.g. a later effect plays it);
    // the result ref must still describe the card that was milled.
    state.players[DEFENDER].trash = [];
    const refs = new Map<string, EffectResult>([["milled", r.result!]]);
    const gate = (value: number) =>
      evaluateCondition(
        state,
        {
          type: "REVEALED_CARD_PROPERTY",
          result_ref: "milled",
          compare: { property: "COST", operator: ">=", value },
        },
        { sourceCardInstanceId: f.counter.instanceId, controller: DEFENDER, cardDb: f.db, resultRefs: refs },
      );
    expect(gate(6)).toBe(true);
    expect(gate(8)).toBe(false);
  });
});
