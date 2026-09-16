import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { executeRevealHand } from "../engine/effect-resolver/actions/hand-deck.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import {
  filterPromptForPlayer,
} from "../engine/visibility.js";
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
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `test-instance-${serial++}`,
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
    else if (zone === "CHARACTER")
      p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.push(card);
    if (["LEADER", "STAGE", "CHARACTER"].includes(zone))
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function choice(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt })
    ).toBe(rejected);
    state = result.state;
  }
  function select(ids: string[], rejected = false) {
    choice({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected);
  }
  function accept() {
    choice({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function targets() {
    const options = state.pendingPrompt?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET")
      throw new Error(JSON.stringify(options));
    return options;
  }
  return {
    db,
    data,
    put,
    act,
    choice,
    select,
    accept,
    targets,
    persist() {
      state = parseStoredSession(
        JSON.parse(
          JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })
        )
      ).state;
    },
    get state() {
      return state;
    },
  };
}

// Canonical text: docs/cards/OP-01.md (OP01-063, OP01-105), OP-07.md
// (OP07-090); docs/FAQs/qa_op01.md requires blind, simultaneous choices.
function setup(owner: 0 | 1, count: number, id = "OP01-105") {
  const f = fixture();
  const opponent: 0 | 1 = owner === 0 ? 1 : 0;
  f.state.turn.activePlayerIndex = owner;
  f.state.players.forEach((p) => { p.hand = []; });
  f.data(id, { cost: 2 });
  const source = f.put(id, owner, "HAND");
  const hand = Array.from({ length: count }, (_, i) => {
    f.data(`secret-${i}`);
    return f.put(`secret-${i}`, opponent, "HAND");
  });
  return { f, opponent, source, hand };
}

function reveals(f: ReturnType<typeof fixture>) {
  return f.state.eventLog.filter((e) => e.type === "CARDS_REVEALED");
}

describe("OPT-855 registered Bao Huang", () => {
  for (const owner of [0, 1] as const) {
    it.each([0, 1, 2, 3])(`controller ${owner}: hand of %i completes after persistence`, (count) => {
      const { f, opponent, source, hand } = setup(owner, count);
      f.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
      const chosen = count === 3 ? [hand[2], hand[0]] : hand;
      if (count === 3) {
        f.persist();
        expect(reveals(f)).toEqual([]);
        expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
        expect(f.targets()).toMatchObject({ blindSelection: true, countMin: 2, countMax: 2 });
        const wire = filterPromptForPlayer(f.state.pendingPrompt, owner)!;
        expect(wire.resumeContext).toBeNull();
        expect(wire.options).toMatchObject({ cards: hand.map((c) => ({ instanceId: c.instanceId, cardId: "hidden" })) });
        expect(filterPromptForPlayer(f.state.pendingPrompt, opponent)).toBeNull();
        for (const c of hand) {
          expect(JSON.stringify(visibleStateForPlayer(f.state, f.db, owner))).not.toContain(c.cardId);
          expect(JSON.stringify(visibleStateForSpectator(f.state, f.db).pendingPrompt)).not.toContain(c.cardId);
        }
        f.select(chosen.map((c) => c.instanceId));
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[opponent].hand).toEqual(hand);
      expect(reveals(f)).toHaveLength(count ? 1 : 0);
      if (count) expect(reveals(f)[0]).toMatchObject({
        playerIndex: opponent,
        payload: { cards: chosen.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })), source: "HAND", visibility: "BOTH" },
      });
      f.persist();
      const before = structuredClone(f.state);
      f.select(chosen.map((c) => c.instanceId), true);
      expect(f.state).toEqual(before);
    });

    it(`controller ${owner}: malformed replies preserve the prompt and continuation`, () => {
      const { f, source, hand } = setup(owner, 3);
      const own = f.put(CARDS.VANILLA.id, owner, "HAND");
      f.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
      for (const ids of [[], [hand[0].instanceId], hand.map((c) => c.instanceId), [hand[0].instanceId, hand[0].instanceId], [hand[0].instanceId, own.instanceId], [hand[0].instanceId, "foreign"]]) {
        f.persist();
        const before = structuredClone(f.state);
        f.select(ids, true);
        expect(f.state).toEqual(before);
      }
      f.select([hand[2].instanceId, hand[1].instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(reveals(f)).toHaveLength(1);
    });

    it(`controller ${owner}: rejects a stale live-hand selection and can recover`, () => {
      const { f, opponent, source, hand } = setup(owner, 3);
      f.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
      f.persist();
      f.state.players[opponent].hand = hand.slice(1);
      f.select([hand[0].instanceId, hand[2].instanceId]);
      expect(reveals(f)).toEqual([]);
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
      expect(f.targets()).toMatchObject({ blindSelection: true, countMin: 2, countMax: 2, validTargets: hand.slice(1).map((c) => c.instanceId) });
      f.persist();
      f.select(hand.slice(1).map((c) => c.instanceId));
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[opponent].hand).toEqual(hand.slice(1));
      expect(reveals(f)).toHaveLength(1);
    });
  }

  it("defensively rejects malformed direct preselection producers", () => {
    const { f, source, hand } = setup(0, 3);
    for (const ids of [[], [hand[0].instanceId], hand.map((c) => c.instanceId), [hand[0].instanceId, hand[0].instanceId], [hand[0].instanceId, source.instanceId]]) {
      const result = executeRevealHand(f.state, { type: "REVEAL_HAND", target: { controller: "OPPONENT" }, params: { amount: 2 } }, source.instanceId, 0, f.db, new Map(), ids);
      expect(result.succeeded).toBe(false);
      expect(result.events).toEqual([]);
      expect(result.pendingPrompt?.options).toMatchObject({ blindSelection: true, countMin: 2, countMax: 2 });
      expect(result.state).toBe(f.state);
    }
  });
});

describe("registered REVEAL_HAND consumers", () => {
  it.each([0, 1] as const)("Morgans controller %i reveals the entire remaining hand", (owner) => {
    const { f, opponent, source, hand } = setup(owner, 4, "OP07-090");
    f.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
    f.persist();
    f.select([hand[1].instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    const remaining = [hand[0], hand[2], hand[3]];
    expect(reveals(f)).toHaveLength(1);
    expect(reveals(f)[0]).toMatchObject({ playerIndex: opponent, payload: { cards: remaining.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })), source: "HAND", visibility: "BOTH" } });
    expect(f.state.players[opponent].hand.slice(0, 3)).toEqual(remaining);
    // DRAW recipient fidelity is a documented out-of-scope follow-up.
  });

  for (const owner of [0, 1] as const) {
    it.each(["Event", "stale Event", "Character", "empty"] as const)(`Arlong controller ${owner}: %s preserves the conditional continuation`, (kind) => {
      const { f, opponent, hand } = setup(owner, kind === "empty" ? 0 : 3);
      f.data("OP01-063", { cost: 4 });
      const arlong = f.put("OP01-063", owner);
      const don = f.state.players[owner].donCostArea.shift()!;
      arlong.attachedDon = [{ ...don, attachedTo: arlong.instanceId }];
      const isEvent = kind === "Event" || kind === "stale Event";
      if (hand.length) f.data(hand[kind === "stale Event" ? 1 : 2].cardId, { type: isEvent ? "Event" : "Character" });
      const life = structuredClone(f.state.players[opponent].life);
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: arlong.instanceId, effectId: "OP01-063_activate_reveal_conditional" });
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") f.accept();
      if (hand.length) {
        f.persist();
        if (kind === "stale Event") {
          const stale = hand.pop()!;
          f.state.players[opponent].hand = [...hand];
          f.select([stale.instanceId]);
          expect(reveals(f)).toEqual([]);
          expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
          expect(f.targets().blindSelection).toBe(true);
          f.persist();
          f.select([hand[1].instanceId]);
        } else {
          f.select([hand[2].instanceId]);
        }
      }
      if (isEvent && f.state.pendingPrompt) f.select([f.targets().validTargets[0]]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[opponent].hand).toEqual(hand);
      expect(f.state.players[opponent].life).toHaveLength(life.length - (isEvent ? 1 : 0));
      expect(reveals(f)).toHaveLength(hand.length ? 1 : 0);
      if (isEvent) expect(f.state.players[opponent].deck.at(-1)?.cardId).toBe(life[0].cardId);
    });
  }
});
