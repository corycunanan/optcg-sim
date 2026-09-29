/**
 * OPT-906 — "When your opponent's Character is K.O.'d" watchers must not fire
 * on their controller's own Character K.O.
 *
 * Canonical text (docs/cards/):
 * - EB04-044 Koby: "[Your Turn] [Once Per Turn] When your opponent's Character
 *   is K.O.'d, draw 1 card."
 * - OP01-061 Kaido (Leader): "[DON!! x1] [Your Turn] [Once Per Turn] When your
 *   opponent's Character is K.O.'d, add up to 1 DON!! card from your DON!! deck
 *   and set it as active."
 * - OP03-076 Rob Lucci (Leader): "[Your Turn] [Once Per Turn] You may trash 2
 *   cards from your hand: When your opponent's Character is K.O.'d, set this
 *   Leader as active."
 *
 * "Your opponent" is relative to the watcher's controller; the K.O.'d
 * Character's side is the controller it had on the field (CARD_KO
 * `payload.sourceController`). A K.O. of your own Character is not your
 * opponent's Character being K.O.'d, whoever caused it.
 *
 * K.O. producers from the production registry:
 * - ST27-005 Marshall.D.Teach "[Activate: Main] You may rest this Character:
 *   K.O. up to 1 Character with a cost of 3 or less." (either side, effect K.O.)
 * - OP14-079 Crocodile (Leader) "[Activate: Main] [Once Per Turn] You may K.O.
 *   1 of your Characters with a type including "Baroque Works": ..." (own
 *   Character K.O. as a cost)
 * - Battle: the watcher side's Leader attacks and K.O.s a rested Character.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { matchTriggersForEvent, registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

type Watcher = "EB04-044" | "OP01-061" | "OP03-076";
const WATCHERS: Watcher[] = ["EB04-044", "OP01-061", "OP03-076"];

function fixture(watcherId: Watcher, controller: 0 | 1) {
  const opponent: 0 | 1 = controller === 0 ? 1 : 0;
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.turn.activePlayerIndex = controller;
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.deck = [];
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

  function put(id: string, side: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    if (!db.has(id)) data(id);
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt906-${id}-${side}-${serial++}`,
      owner: side,
      controller: side,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[side];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "DECK") p.deck.push(card);
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }

  function respond(action: GameAction) {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt })).toBe(false);
    state = r.state;
  }
  const accept = () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
  const select = (ids: string[]) => respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  const promptType = () => state.pendingPrompt?.options.promptType;

  // Watcher. Leaders keep the Leader zone; Koby sits on the field.
  data("EB04-044", { cost: 5, power: 6000 });
  data("OP01-061", { type: "Leader", cost: null, power: 5000, life: 5, counter: null });
  data("OP03-076", { type: "Leader", cost: null, power: 5000, life: 5, counter: null });
  const watcher = put(watcherId, controller, watcherId === "EB04-044" ? "CHARACTER" : "LEADER");
  if (watcherId === "OP01-061") {
    // [DON!! x1]
    const don = state.players[controller].donCostArea.pop()!;
    watcher.attachedDon = [{ ...don, attachedTo: watcher.instanceId }];
  }
  if (watcherId === "OP03-076") {
    // Rob Lucci starts rested so "set this Leader as active" is observable,
    // and holds 2 hand cards for its trash-2 cost.
    watcher.state = "RESTED";
    data("lucci-fodder");
    put("lucci-fodder", controller, "HAND");
    put("lucci-fodder", controller, "HAND");
  }

  // Victims: one cost-2 Character per side (within Teach's cost 3 or less).
  data("victim", { cost: 2, power: 2000 });
  const ownVictim = put("victim", controller);
  const oppVictim = put("victim", opponent);

  data("filler");
  for (let i = 0; i < 6; i++) {
    put("filler", 0, "DECK");
    put("filler", 1, "DECK");
  }

  data("ST27-005", { cost: 4, power: 5000 });

  /** Snapshot of the watcher's observable reward. */
  function reward() {
    const p = state.players[controller];
    const leader = p.leader;
    return {
      hand: p.hand.length,
      donCostArea: p.donCostArea.length,
      activeDon: p.donCostArea.filter((d) => d.state === "ACTIVE").length,
      leaderState: leader.state,
    };
  }

  /** `side` activates ST27-005 and K.O.s `victim`, then resolves any prompts. */
  function teachKO(side: 0 | 1, victim: CardInstance, teach = put("ST27-005", side)) {
    state.turn.activePlayerIndex = side;
    act({ type: "ACTIVATE_EFFECT", cardInstanceId: teach.instanceId, effectId: "activate_ko" }, side);
    if (promptType() === "OPTIONAL_EFFECT") accept();
    expect(promptType()).toBe("SELECT_TARGET");
    select([victim.instanceId]);
    return teach;
  }

  /** Accept every watcher prompt so the trigger's effect resolves when it fires. */
  function resolveWatcherPrompts() {
    for (let guard = 0; guard < 6 && state.pendingPrompt; guard++) {
      const type = promptType();
      const opts = state.pendingPrompt!.options as {
        choices?: { id: string }[];
        validTargets?: string[];
        countMax?: number;
      };
      if (type === "OPTIONAL_EFFECT") accept();
      else if (type === "PLAYER_CHOICE") {
        // Take the maximal "up to" value (Kaido: choose-value:1), else accept.
        const ids = (opts.choices ?? []).map((c) => c.id);
        respond({ type: "PLAYER_CHOICE", choiceId: ids.includes("accept") ? "accept" : ids[ids.length - 1] });
      } else if (type === "SELECT_TARGET") {
        select((opts.validTargets ?? []).slice(0, opts.countMax ?? 1));
      } else break;
    }
  }

  const inTrash = (card: CardInstance) =>
    state.players[card.owner].trash.some((c) => c.cardId === card.cardId);

  return {
    db,
    data,
    put,
    act,
    respond,
    accept,
    select,
    promptType,
    teachKO,
    resolveWatcherPrompts,
    reward,
    inTrash,
    watcher,
    ownVictim,
    oppVictim,
    opponent,
    get state() {
      return state;
    },
    set state(s: GameState) {
      state = s;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

/** Expected reward after the watcher fired once, per canonical card text. */
function expectFired(watcherId: Watcher, before: ReturnType<Fixture["reward"]>, f: Fixture) {
  const after = f.reward();
  if (watcherId === "EB04-044") {
    // draw 1 card
    expect(after.hand).toBe(before.hand + 1);
  } else if (watcherId === "OP01-061") {
    // add up to 1 DON!! card from your DON!! deck and set it as active
    expect(after.donCostArea).toBe(before.donCostArea + 1);
    expect(after.activeDon).toBe(before.activeDon + 1);
  } else {
    // trash 2 cards from hand: set this Leader as active
    expect(after.hand).toBe(before.hand - 2);
    expect(after.leaderState).toBe("ACTIVE");
  }
}

function expectNotFired(before: ReturnType<Fixture["reward"]>, f: Fixture) {
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.reward()).toEqual(before);
}

describe("OPT-906 OPPONENT_CHARACTER_KO fires only for the opponent's Characters", () => {
  for (const watcherId of WATCHERS) {
    for (const controller of [0, 1] as const) {
      describe(`${watcherId} controlled by player ${controller}`, () => {
        it("opponent's Character K.O.'d by your effect on your turn → fires", () => {
          const f = fixture(watcherId, controller);
          const before = f.reward();
          f.teachKO(controller, f.oppVictim);
          expect(f.inTrash(f.oppVictim)).toBe(true);
          f.resolveWatcherPrompts();
          expect(f.state.pendingPrompt).toBeNull();
          expectFired(watcherId, before, f);
        });

        it("own Character K.O.'d by your effect on your turn → does not fire", () => {
          const f = fixture(watcherId, controller);
          const before = f.reward();
          f.teachKO(controller, f.ownVictim);
          expect(f.inTrash(f.ownVictim)).toBe(true);
          expectNotFired(before, f);
        });

        it("own Character K.O.'d as an activation cost on your turn → does not fire", () => {
          const f = fixture(watcherId, controller);
          // OP14-079 Crocodile's cost K.O.s one of your Baroque Works
          // Characters (the cost/resume K.O. path). Its registered block is
          // hosted on a field Character here so the watcher Leader keeps the
          // Leader zone; only the activation block is exercised.
          f.data("OP14-079", { type: "Character", cost: 5, power: 5000 });
          const croc = f.put("OP14-079", controller);
          f.data("bw-victim", { cost: 2, power: 2000, types: ["Baroque Works"] });
          const bw = f.put("bw-victim", controller);
          const before = f.reward();
          f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: croc.instanceId, effectId: "OP14-079_activate" }, controller);
          // Drive only Crocodile's own prompts; any watcher prompt left over
          // fails the pendingPrompt assertion below.
          for (let guard = 0; guard < 6 && f.state.pendingPrompt; guard++) {
            const opts = f.state.pendingPrompt.options as {
              promptType: string;
              validTargets?: string[];
              cards?: { cardId: string }[];
              effectDescription?: string;
            };
            if (opts.promptType === "OPTIONAL_EFFECT" && opts.cards?.[0]?.cardId === "OP14-079") f.accept();
            else if (opts.promptType === "SELECT_TARGET" && opts.validTargets?.includes(bw.instanceId)) f.select([bw.instanceId]);
            else if (opts.promptType === "SELECT_TARGET" && opts.cards?.every((c) => c.cardId === "victim")) f.select([]);
            else break;
          }
          expect(f.inTrash(bw)).toBe(true);
          expect(f.state.eventLog.some((e) => e.type === "CARD_KO" && e.payload.cardId === "bw-victim")).toBe(true);
          expectNotFired(before, f);
        });

        it("opponent's Character K.O.'d in battle on your turn → fires", () => {
          const f = fixture(watcherId, controller);
          const before = f.reward();
          const target = f.state.players[f.opponent].characters.find((c) => c?.instanceId === f.oppVictim.instanceId)!;
          target.state = "RESTED";
          // The watcher side's Leader attacks; Rob Lucci's Leader starts
          // rested, so that side attacks with a vanilla Character instead.
          const attacker = watcherId === "OP03-076"
            ? f.put("CHAR-VANILLA", controller)
            : f.state.players[controller].leader;
          f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, controller);
          for (let guard = 0; guard < 10 && !f.state.pendingPrompt && f.state.turn.battle; guard++) {
            f.act({ type: "PASS" });
          }
          expect(f.inTrash(f.oppVictim)).toBe(true);
          f.resolveWatcherPrompts();
          expect(f.state.pendingPrompt).toBeNull();
          expectFired(watcherId, before, f);
        });

        it("[Your Turn]: opponent K.O.s their own Character on their turn → does not fire", () => {
          const f = fixture(watcherId, controller);
          const before = f.reward();
          f.teachKO(f.opponent, f.oppVictim);
          expect(f.inTrash(f.oppVictim)).toBe(true);
          expectNotFired(before, f);
        });

        it("[Once Per Turn]: a second opponent K.O. the same turn does not fire again", () => {
          const f = fixture(watcherId, controller);
          f.data("victim2", { cost: 1, power: 1000 });
          const second = f.put("victim2", f.opponent);
          if (watcherId === "OP03-076") {
            f.data("lucci-fodder");
            f.put("lucci-fodder", controller, "HAND");
            f.put("lucci-fodder", controller, "HAND");
          }
          f.teachKO(controller, f.oppVictim);
          f.resolveWatcherPrompts();
          if (watcherId === "OP03-076") {
            // Rest Lucci again so a second activation would be observable.
            f.state.players[controller].leader.state = "RESTED";
          }
          const mid = f.reward();
          f.teachKO(controller, second);
          expect(f.inTrash(second)).toBe(true);
          expectNotFired(mid, f);
        });
      });
    }
  }
});

describe("OPT-906 OPPONENT_* events compose with explicit controller filters", () => {
  function watcherCard(event: "OPPONENT_CHARACTER_KO" | "OPPONENT_CHARACTER_TRASHED", filter?: { controller: "SELF" | "OPPONENT" }): CardData {
    return {
      ...CARDS.VANILLA,
      id: `OPT906-${event}-${filter?.controller ?? "NONE"}`,
      effectSchema: {
        effects: [{
          id: "w",
          category: "auto",
          trigger: { event, ...(filter ? { filter } : {}) },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      } as EffectSchema,
    };
  }

  function setup(card: CardData) {
    const db = createTestCardDb();
    db.set(card.id, card);
    let state = createBattleReadyState(db);
    state.players[0].characters = padChars([]);
    const w: CardInstance = {
      cardId: card.id, instanceId: "w0", owner: 0, controller: 0, zone: "CHARACTER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 1,
    };
    state.players[0].characters[0] = w;
    state = registerCardEnteredField(state, w, card);
    return { db, state };
  }

  const ko = (side: 0 | 1) => ({
    type: "CARD_KO" as const,
    playerIndex: side,
    timestamp: 0,
    payload: { cardInstanceId: `v${side}`, cardId: CARDS.VANILLA.id, cause: "EFFECT", preKO_donCount: 0, sourceController: side, sourceZone: "CHARACTER" as const },
  });
  const trash = (side: 0 | 1) => ({
    type: "CARD_TRASHED" as const,
    playerIndex: side,
    timestamp: 0,
    payload: { cardInstanceId: `v${side}`, cardId: CARDS.VANILLA.id, reason: "effect", sourceZone: "CHARACTER" as const, sourceController: side },
  });

  it("the removed card's field controller (sourceController) decides, not the event player", () => {
    // Engine-only divergence (OPTCG has no control change today): owner 1,
    // but the Character left player 0's field — it was the watcher's own.
    const { db, state } = setup(watcherCard("OPPONENT_CHARACTER_KO"));
    const divergent = { ...ko(1), payload: { ...ko(1).payload, sourceController: 0 as const } };
    expect(matchTriggersForEvent(state, divergent, db)).toHaveLength(0);
    // Legacy payloads without sourceController fall back to the event player.
    const legacy = { ...ko(1), payload: { ...ko(1).payload, sourceController: undefined } };
    expect(matchTriggersForEvent(state, legacy, db)).toHaveLength(1);
  });

  for (const [event, make] of [["OPPONENT_CHARACTER_KO", ko], ["OPPONENT_CHARACTER_TRASHED", trash]] as const) {
    it(`${event} without a filter matches only the opponent's Character`, () => {
      const { db, state } = setup(watcherCard(event));
      expect(matchTriggersForEvent(state, make(1), db)).toHaveLength(1);
      expect(matchTriggersForEvent(state, make(0), db)).toHaveLength(0);
    });

    it(`${event} with an explicit OPPONENT filter still composes`, () => {
      const { db, state } = setup(watcherCard(event, { controller: "OPPONENT" }));
      expect(matchTriggersForEvent(state, make(1), db)).toHaveLength(1);
      expect(matchTriggersForEvent(state, make(0), db)).toHaveLength(0);
    });

    it(`${event} with a contradictory SELF filter is not overridden — it never matches`, () => {
      const { db, state } = setup(watcherCard(event, { controller: "SELF" }));
      expect(matchTriggersForEvent(state, make(1), db)).toHaveLength(0);
      expect(matchTriggersForEvent(state, make(0), db)).toHaveLength(0);
    });
  }
});
