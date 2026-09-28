import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { executeDraw } from "../engine/effect-resolver/actions/draw-search.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { visibleStateForPlayer } from "../session/visibility.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical text: docs/cards/OP-07.md (OP07-090 Morgans)
// "[On Play] Your opponent trashes 1 card from their hand and reveals their
// hand. Then, your opponent draws 1 card."

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    });
  }
  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"]) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt859-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "HAND") p.hand.push(card);
    else if (zone === "DECK") p.deck.push(card);
    else if (zone === "CHARACTER") {
      p.characters[p.characters.findIndex((c) => !c)] = card;
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
    return card;
  }
  function act(action: GameAction, player = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function select(ids: string[]) {
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: ids },
      db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
    );
    expect(result.responseRejected, JSON.stringify(state.pendingPrompt)).toBe(false);
    state = result.state;
  }
  return {
    db,
    data,
    put,
    act,
    select,
    persist() {
      state = parseStoredSession(
        JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
      ).state;
    },
    get state() {
      return state;
    },
  };
}

function setupMorgans(owner: 0 | 1, opponentDeck: "keep" | "empty" = "keep") {
  const f = fixture();
  const opponent: 0 | 1 = owner === 0 ? 1 : 0;
  f.state.turn.activePlayerIndex = owner;
  f.state.players.forEach((p) => {
    p.hand = [];
  });
  f.data("OP07-090", { cost: 3 });
  const morgans = f.put("OP07-090", owner, "HAND");
  const oppHand = Array.from({ length: 4 }, (_, i) => {
    f.data(`opp-hand-${i}`);
    return f.put(`opp-hand-${i}`, opponent, "HAND");
  });
  if (opponentDeck === "empty") f.state.players[opponent].deck = [];
  // Distinguishable deck tops so drawn identities are checkable.
  f.data("own-top");
  f.data("opp-top");
  if (opponentDeck === "keep") {
    const oppTop = f.put("opp-top", opponent, "DECK");
    const oppDeck = f.state.players[opponent].deck;
    oppDeck.unshift(oppDeck.pop()!);
    expect(oppDeck[0]).toBe(oppTop);
  }
  const ownTop = f.put("own-top", owner, "DECK");
  const ownDeck = f.state.players[owner].deck;
  ownDeck.unshift(ownDeck.pop()!);
  expect(ownDeck[0]).toBe(ownTop);
  return { f, opponent, morgans, oppHand };
}

describe("OPT-859 DRAW honors target.controller (OP07-090 Morgans)", () => {
  for (const owner of [0, 1] as const) {
    it(`controller ${owner}: the opponent (not the controller) draws 1`, () => {
      const { f, opponent, morgans, oppHand } = setupMorgans(owner);
      const ownDeckBefore = [...f.state.players[owner].deck];
      const oppDeckBefore = [...f.state.players[opponent].deck];
      const logStart = f.state.eventLog.length;

      f.act({ type: "PLAY_CARD", cardInstanceId: morgans.instanceId });
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
      f.persist();
      f.select([oppHand[1].instanceId]);
      expect(f.state.pendingPrompt).toBeNull();

      // Controller: Morgans left hand; hand/deck otherwise untouched.
      expect(f.state.players[owner].hand).toEqual([]);
      expect(f.state.players[owner].deck.map((c) => c.instanceId)).toEqual(
        ownDeckBefore.map((c) => c.instanceId),
      );

      // Opponent: 4 - 1 trashed + 1 drawn = 4; drew their deck top.
      const oppPlayer = f.state.players[opponent];
      expect(oppPlayer.hand).toHaveLength(4);
      expect(oppPlayer.hand.slice(0, 3).map((c) => c.instanceId)).toEqual(
        [oppHand[0], oppHand[2], oppHand[3]].map((c) => c.instanceId),
      );
      expect(oppPlayer.hand[3].cardId).toBe("opp-top");
      expect(oppPlayer.deck).toHaveLength(oppDeckBefore.length - 1);
      expect(oppPlayer.trash.map((c) => c.cardId)).toContain(oppHand[1].cardId);

      const log = f.state.eventLog.slice(logStart);
      const drawn = log.filter((e) => e.type === "CARD_DRAWN");
      expect(drawn).toHaveLength(1);
      expect(drawn[0].playerIndex).toBe(opponent);
      const outside = log.filter((e) => e.type === "DRAW_OUTSIDE_DRAW_PHASE");
      expect(outside).toHaveLength(1);
      expect(outside[0]).toMatchObject({ playerIndex: opponent, payload: { count: 1 } });

      // CARD_DRAWN is OWNER_ONLY: the drawn identity reaches the drawer only.
      expect(JSON.stringify(visibleStateForPlayer(f.state, f.db, owner))).not.toContain("opp-top");
      expect(JSON.stringify(visibleStateForPlayer(f.state, f.db, opponent))).toContain("opp-top");
    });

    it(`controller ${owner}: opponent with an empty deck draws nothing; controller untouched`, () => {
      const { f, opponent, morgans, oppHand } = setupMorgans(owner, "empty");
      const ownDeckBefore = [...f.state.players[owner].deck];
      const logStart = f.state.eventLog.length;

      f.act({ type: "PLAY_CARD", cardInstanceId: morgans.instanceId });
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(opponent);
      f.select([oppHand[1].instanceId]);
      expect(f.state.pendingPrompt).toBeNull();

      // Opponent: trashed 1, drew nothing (4 - 1 = 3).
      expect(f.state.players[opponent].hand.map((c) => c.instanceId)).toEqual(
        [oppHand[0], oppHand[2], oppHand[3]].map((c) => c.instanceId),
      );
      expect(f.state.players[owner].hand).toEqual([]);
      expect(f.state.players[owner].deck.map((c) => c.instanceId)).toEqual(
        ownDeckBefore.map((c) => c.instanceId),
      );
      expect(f.state.players[opponent].deck).toEqual([]);
      const log = f.state.eventLog.slice(logStart);
      expect(log.filter((e) => e.type === "CARD_DRAWN")).toEqual([]);
      expect(log.filter((e) => e.type === "DRAW_OUTSIDE_DRAW_PHASE")).toEqual([]);
      // Defeat checks are unchanged by OPT-859: the opponent was already at 0
      // deck cards, so pipeline rule processing (after the prompt resolves)
      // records their deck-out.
      expect(f.state.status).toBe("FINISHED");
      expect(f.state.winner).toBe(owner);
    });
  }
});

describe("OPT-859 executeDraw controller frame (direct)", () => {
  for (const controller of [0, 1] as const) {
    const opponent: 0 | 1 = controller === 0 ? 1 : 0;

    it(`controller ${controller}: SELF default and explicit SELF draw for the controller`, () => {
      const f = fixture();
      for (const target of [undefined, { type: "PLAYER" as const, controller: "SELF" as const }]) {
        const before = f.state;
        const result = executeDraw(
          before,
          { type: "DRAW", ...(target ? { target } : {}), params: { amount: 2 } },
          "src",
          controller,
          f.db,
          new Map(),
        );
        expect(result.succeeded).toBe(true);
        expect(result.state.players[controller].hand).toHaveLength(before.players[controller].hand.length + 2);
        expect(result.state.players[controller].deck).toHaveLength(before.players[controller].deck.length - 2);
        expect(result.state.players[opponent].hand).toEqual(before.players[opponent].hand);
        expect(result.state.players[opponent].deck).toEqual(before.players[opponent].deck);
        expect(result.events.every((e) => e.playerIndex === controller)).toBe(true);
      }
    });

    it(`controller ${controller}: OPPONENT target draws for the opponent`, () => {
      const f = fixture();
      const before = f.state;
      const top = before.players[opponent].deck.slice(0, 2).map((c) => c.cardId);
      const result = executeDraw(
        before,
        { type: "DRAW", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 2 } },
        "src",
        controller,
        f.db,
        new Map(),
      );
      expect(result.succeeded).toBe(true);
      expect(result.state.players[opponent].hand.slice(-2).map((c) => c.cardId)).toEqual(top);
      expect(result.state.players[opponent].deck).toHaveLength(before.players[opponent].deck.length - 2);
      expect(result.state.players[controller].hand).toEqual(before.players[controller].hand);
      expect(result.state.players[controller].deck).toEqual(before.players[controller].deck);
      expect(result.events).toEqual([
        { type: "CARD_DRAWN", playerIndex: opponent, payload: { cardId: top[0] } },
        { type: "CARD_DRAWN", playerIndex: opponent, payload: { cardId: top[1] } },
        { type: "DRAW_OUTSIDE_DRAW_PHASE", playerIndex: opponent, payload: { count: 2 } },
      ]);
    });

    it(`controller ${controller}: OPPONENT target with empty opponent deck fails cleanly`, () => {
      const f = fixture();
      f.state.players[opponent].deck = [];
      const before = f.state;
      const result = executeDraw(
        before,
        { type: "DRAW", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 1 } },
        "src",
        controller,
        f.db,
        new Map(),
      );
      expect(result).toEqual({ state: before, events: [], succeeded: false });
    });
  }
});
