/**
 * OPT-876 — CANNOT_DRAW (OP12-099 Kalgara) is enforced at runtime.
 *
 * Printed (docs/cards/OP-12.md): "[Your Turn] When a card is removed from your
 * or your opponent's Life cards, draw 1 card. Then, you cannot draw cards
 * using your own effects during this turn."
 *
 * FAQ (docs/FAQs/qa_op12.md, OP12-099): with two Kalgara, after the first
 * draws 1 "you will be unable to draw cards using your own effects for the
 * rest of the turn ... you will not draw a card" from the second.
 *
 * Frame: the prohibited player is the drawer; "your own effects" means the
 * causing effect's controller equals the drawer (prohibitions.ts).
 */

import { describe, expect, it } from "vitest";
import type { CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { executeDraw } from "../engine/effect-resolver/actions/draw-search.js";
import { executeHandWheel } from "../engine/effect-resolver/actions/hand-deck.js";
import { parseStoredSession } from "../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const KALGARA = "OP12-099";

function fixture(kalgaraOwner: 0 | 1) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  const opp: 0 | 1 = kalgaraOwner === 0 ? 1 : 0;
  state.players.forEach((p, owner) => {
    p.characters = padChars([]);
    p.hand = [];
    p.life = Array.from({ length: 5 }, (_, i): LifeCard => ({
      instanceId: `life-${owner}-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN",
    }));
  });
  state.turn.activePlayerIndex = kalgaraOwner;

  const schema = getEffectSchema(KALGARA);
  expect(schema, "OP12-099 authored").toBeDefined();
  db.set(KALGARA, { ...CARDS.VANILLA, id: KALGARA, name: "Kalgara", effectText: "", effectSchema: schema! });
  const kalgara: CardInstance = {
    instanceId: "kalgara-1", cardId: KALGARA, controller: kalgaraOwner, owner: kalgaraOwner,
    zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
  };
  state.players[kalgaraOwner].characters[0] = kalgara;
  state = registerCardEnteredField(state, kalgara, db.get(KALGARA)!);

  /** A 5000-power attacker (beats the 5000 Leader) that survives across turns. */
  const attacker: CardInstance = {
    instanceId: "attacker-1", cardId: CARDS.UNBLOCKABLE.id, controller: kalgaraOwner,
    owner: kalgaraOwner, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
  };
  state.players[kalgaraOwner].characters[1] = attacker;

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }
  function attackLeader(attackerId: string) {
    act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attackerId,
      targetInstanceId: state.players[opp].leader.instanceId,
    });
    act({ type: "PASS" });
    act({ type: "PASS" });
  }
  function advanceToMainOf(player: 0 | 1) {
    for (let i = 0; i < 12; i++) {
      if (state.turn.activePlayerIndex === player && state.turn.phase === "MAIN" && !state.pendingPrompt) return;
      act({ type: "ADVANCE_PHASE" });
    }
    throw new Error(`did not reach player ${player} MAIN`);
  }
  return {
    db, kalgaraOwner, opp, kalgara, attacker, act, attackLeader, advanceToMainOf,
    persist() {
      state = parseStoredSession(
        JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
      ).state;
    },
    setState(s: GameState) { state = s; },
    get state() { return state; },
  };
}

const drawOutside = (s: GameState, p: 0 | 1) =>
  s.eventLog.filter((e) => e.type === "DRAW_OUTSIDE_DRAW_PHASE" && e.playerIndex === p).length;

const SELF_DRAW = { type: "DRAW", params: { amount: 1 } } as Action;
const OPP_DRAW = { type: "DRAW", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 1 } } as Action;

describe.each([0, 1] as const)("OPT-876 — OP12-099 Kalgara pipeline, controller %i", (owner) => {
  it("first Life removal draws 1; second the same turn does not; next turn draws again", () => {
    const f = fixture(owner);
    // The Leader-hit Life card goes to the defender's hand, so the Kalgara
    // controller's hand changes only through Kalgara's draw.
    const before = f.state.players[owner].hand.length;
    f.attackLeader(f.attacker.instanceId);
    expect(f.state.players[owner].hand).toHaveLength(before + 1);
    expect(drawOutside(f.state, owner)).toBe(1);
    expect(f.state.prohibitions.filter((p) => p.prohibitionType === "CANNOT_DRAW")).toHaveLength(1);

    // Second removal, same turn: leader attack.
    f.attackLeader(f.state.players[owner].leader.instanceId);
    expect(f.state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE" && e.playerIndex === f.opp)).toHaveLength(2);
    expect(f.state.players[owner].hand).toHaveLength(before + 1);
    expect(drawOutside(f.state, owner)).toBe(1);

    // Next own turn: prohibition expired, draws again (Draw Phase draw adds 1 too).
    f.advanceToMainOf(f.opp);
    f.advanceToMainOf(owner);
    expect(f.state.prohibitions.filter((p) => p.prohibitionType === "CANNOT_DRAW")).toHaveLength(0);
    const handBefore = f.state.players[owner].hand.length;
    f.attackLeader(f.attacker.instanceId);
    expect(f.state.players[owner].hand).toHaveLength(handBefore + 1);
    expect(drawOutside(f.state, owner)).toBe(2);
  });

  it("the prohibition survives a serialized round trip and still blocks the draw", () => {
    const f = fixture(owner);
    f.attackLeader(f.attacker.instanceId);
    const handBefore = f.state.players[owner].hand.length;
    f.persist();
    f.attackLeader(f.state.players[owner].leader.instanceId);
    expect(f.state.players[owner].hand).toHaveLength(handBefore);
    expect(drawOutside(f.state, owner)).toBe(1);
  });
});

describe("OPT-876 — CANNOT_DRAW frame (drawer vs effect controller)", () => {
  function withProhibition() {
    const f = fixture(0);
    f.attackLeader(f.attacker.instanceId); // Kalgara owner (0) now cannot draw by own effects
    expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_DRAW" && p.controller === 0)).toBe(true);
    return f;
  }

  it("blocks the drawer's own-effect DRAW: no move, no CARD_DRAWN / DRAW_OUTSIDE_DRAW_PHASE, not a success", () => {
    const f = withProhibition();
    const deckBefore = f.state.players[0].deck.length;
    const r = executeDraw(f.state, SELF_DRAW as never, "src", 0, f.db, new Map());
    expect(r.succeeded).toBe(false);
    expect(r.events).toEqual([]);
    expect(r.state.players[0].deck).toHaveLength(deckBefore);
    expect(r.state.players[0].hand).toHaveLength(f.state.players[0].hand.length);
  });

  it("a prevented draw from an empty deck changes nothing", () => {
    const f = withProhibition();
    f.state.players[0].deck = [];
    const r = executeDraw(f.state, SELF_DRAW as never, "src", 0, f.db, new Map());
    expect(r.succeeded).toBe(false);
    expect(r.events).toEqual([]);
    expect(r.state).toBe(f.state);
  });

  it("does not block an opponent-caused draw of the prohibited player (OP07-090 frame)", () => {
    const f = withProhibition();
    const handBefore = f.state.players[0].hand.length;
    // Player 1's effect: "your opponent draws 1" -> drawer 0, causing controller 1.
    const r = executeDraw(f.state, OPP_DRAW as never, "src", 1, f.db, new Map());
    expect(r.succeeded).toBe(true);
    expect(r.state.players[0].hand).toHaveLength(handBefore + 1);
    expect(r.events.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0)).toHaveLength(1);
  });

  it("does not block the other player's own-effect draw", () => {
    const f = withProhibition();
    const handBefore = f.state.players[1].hand.length;
    const r = executeDraw(f.state, SELF_DRAW as never, "src", 1, f.db, new Map());
    expect(r.succeeded).toBe(true);
    expect(r.state.players[1].hand).toHaveLength(handBefore + 1);
  });

  it("blocks a prohibited player drawing via own effect on the opponent-targeted path only when controller is the drawer", () => {
    // Player 0's effect making player 1 draw is not "player 1's own effect",
    // and player 1 carries no prohibition, so it draws.
    const f = withProhibition();
    const r = executeDraw(f.state, OPP_DRAW as never, "src", 0, f.db, new Map());
    expect(r.succeeded).toBe(true);
    expect(r.state.players[1].hand).toHaveLength(f.state.players[1].hand.length + 1);
  });

  it("HAND_WHEEL: the trash half still happens, the draw half is blocked with no draw events", () => {
    const f = withProhibition();
    const hand: CardInstance = {
      instanceId: "wheel-hand", cardId: CARDS.VANILLA.id, controller: 0, owner: 0,
      zone: "HAND", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    };
    f.state.players[0].hand = [hand];
    const deckBefore = f.state.players[0].deck.length;
    const action = { type: "HAND_WHEEL", params: { trash_count: 1, draw_count: 1 } } as Action;
    const r = executeHandWheel(f.state, action as never, "src", 0, f.db, new Map());
    expect(r.state.players[0].hand).toHaveLength(0);
    expect(r.state.players[0].deck).toHaveLength(deckBefore);
    expect(r.state.players[0].trash.length).toBeGreaterThan(f.state.players[0].trash.length);
    expect(r.events.some((e) => e.type === "CARD_DRAWN" || e.type === "DRAW_OUTSIDE_DRAW_PHASE")).toBe(false);
  });

  it("HAND_WHEEL without the prohibition still draws (control)", () => {
    const f = fixture(0);
    const hand: CardInstance = {
      instanceId: "wheel-hand", cardId: CARDS.VANILLA.id, controller: 0, owner: 0,
      zone: "HAND", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    };
    f.state.players[0].hand = [hand];
    const action = { type: "HAND_WHEEL", params: { trash_count: 1, draw_count: 1 } } as Action;
    const r = executeHandWheel(f.state, action as never, "src", 0, f.db, new Map());
    expect(r.state.players[0].hand).toHaveLength(1);
    expect(r.events.some((e) => e.type === "CARD_DRAWN")).toBe(true);
  });

  it("the Draw Phase draw is unaffected by an active CANNOT_DRAW", () => {
    const f = fixture(0);
    // Inject a live CANNOT_DRAW on player 1 that outlives the turn boundary.
    f.setState({
      ...f.state,
      prohibitions: [{
        id: "p-draw", sourceCardInstanceId: "x", sourceEffectBlockId: "", prohibitionType: "CANNOT_DRAW",
        scope: { cause: "ANY" }, duration: { type: "SKIP_NEXT_REFRESH" }, expiresAt: { wave: "NEVER" },
        controller: 1, appliesTo: [], usesRemaining: null,
      }],
    });
    const handBefore = f.state.players[1].hand.length;
    f.advanceToMainOf(1);
    expect(f.state.prohibitions.some((p) => p.id === "p-draw")).toBe(true);
    expect(f.state.players[1].hand).toHaveLength(handBefore + 1);
  });
});
