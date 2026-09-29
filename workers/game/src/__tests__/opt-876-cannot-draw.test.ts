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
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { parseStoredSession } from "../session/persistence.js";
import { findDrawProhibitionCauseViolations } from "../engine/schema-draw-prohibition-lint.js";
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

// ─── Review findings on PR #716 ──────────────────────────────────────────────

/** Replace the live prohibitions with one CANNOT_DRAW bound to `player`. */
function withInjectedProhibition(player: 0 | 1, cause: string | undefined) {
  const f = fixture(0);
  f.setState({
    ...f.state,
    prohibitions: [{
      id: "p-draw", sourceCardInstanceId: "x", sourceEffectBlockId: "", prohibitionType: "CANNOT_DRAW",
      scope: cause === undefined ? {} : { cause: cause as never },
      duration: { type: "THIS_TURN" }, expiresAt: { wave: "NEVER" },
      controller: player, appliesTo: [], usesRemaining: null,
    }],
  });
  return f;
}

describe("OPT-876 — OPPONENT_ACTION-wrapped draws are caused by the wrapper's controller", () => {
  // OP06-047 Charlotte Pudding: "[On Play] Your opponent returns all cards in
  // their hand to their deck and shuffles their deck. Then, your opponent
  // draws 5 cards." The draw is caused by Pudding's controller's effect, so a
  // Kalgara prohibition ("you cannot draw cards using your own effects") on
  // the opponent does not stop it.
  function puddingActions(): Action[] {
    const schema = getEffectSchema("OP06-047");
    expect(schema, "OP06-047 authored").toBeDefined();
    const block = schema!.effects.find((b) =>
      b.actions?.some((a) => a.type === "OPPONENT_ACTION" && (a.params as { action?: Action }).action?.type === "DRAW"));
    expect(block, "OP06-047 OPPONENT_ACTION DRAW block").toBeDefined();
    return block!.actions!;
  }

  it("Kalgara's owner still draws 5 from the opponent's OP06-047 (real Kalgara prohibition)", () => {
    const f = fixture(0);
    f.attackLeader(f.attacker.instanceId); // Kalgara (player 0) draws 1 and is now prohibited
    expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_DRAW" && p.controller === 0)).toBe(true);
    const deckBefore = f.state.players[0].deck.length;
    const handBefore = f.state.players[0].hand.length;
    expect(deckBefore + handBefore).toBeGreaterThanOrEqual(5);

    const r = executeActionChain(f.state, puddingActions(), "pudding-src", 1, f.db);
    expect(r.pendingPrompt).toBeUndefined();
    expect(r.state.players[0].hand).toHaveLength(5);
    expect(r.events.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0)).toHaveLength(5);
  });

  it("the Kalgara owner's own OPPONENT_ACTION-wrapped draw is still their opponent's draw (control)", () => {
    // Player 0 (prohibited) resolves an OPPONENT_ACTION DRAW: player 1 draws,
    // player 1 carries no prohibition, and player 0 draws nothing.
    const f = withInjectedProhibition(0, "BY_YOUR_EFFECT");
    const wrapped = { type: "OPPONENT_ACTION", params: { action: { type: "DRAW", params: { amount: 2 } } } } as Action;
    const r = executeActionChain(f.state, [wrapped], "src", 0, f.db);
    expect(r.state.players[1].hand).toHaveLength(f.state.players[1].hand.length + 2);
    expect(r.state.players[0].hand).toHaveLength(f.state.players[0].hand.length);
  });

  it("a prohibited player's OPPONENT_ACTION-wrapped draw imposed by an opponent is blocked only under BY_OPPONENT_EFFECT", () => {
    // Player 1's effect makes player 0 draw 2 via OPPONENT_ACTION.
    const wrapped = { type: "OPPONENT_ACTION", params: { action: { type: "DRAW", params: { amount: 2 } } } } as Action;
    const blocked = withInjectedProhibition(0, "BY_OPPONENT_EFFECT");
    const r1 = executeActionChain(blocked.state, [wrapped], "src", 1, blocked.db);
    expect(r1.state.players[0].hand).toHaveLength(blocked.state.players[0].hand.length);

    const open = withInjectedProhibition(0, "BY_YOUR_EFFECT");
    const r2 = executeActionChain(open.state, [wrapped], "src", 1, open.db);
    expect(r2.state.players[0].hand).toHaveLength(open.state.players[0].hand.length + 2);
  });
});

describe("OPT-876 — OPPONENT_ACTION effect controller survives a paused, serialized resume", () => {
  // Hypothetical shape (no authored card today): "your opponent may draw 2".
  // The wrapped draw pauses for the opponent's decision; the continuation
  // frame keeps the wrapper's effect controller across persistence.
  const wrappedOptional = {
    type: "OPPONENT_ACTION",
    params: { action: { type: "DRAW", optional: true, params: { amount: 2 } } },
  } as Action;

  it.each([
    ["BY_YOUR_EFFECT", 2],
    ["BY_OPPONENT_EFFECT", 0],
  ] as const)("prohibition %s on the drawer: resumed draw adds %i", (cause, drawn) => {
    const f = withInjectedProhibition(0, cause);
    const handBefore = f.state.players[0].hand.length;
    const paused = executeActionChain(f.state, [wrappedOptional], "src-opt", 1, f.db);
    expect(paused.pendingPrompt, "optional wrapped draw pauses").toBeDefined();
    const frame = paused.state.effectStack.at(-1)!;
    expect(frame.controller).toBe(0);
    expect(frame.effectController).toBe(1);

    f.setState(paused.state);
    f.persist();
    expect(f.state.effectStack.at(-1)!.effectController).toBe(1);
    const resumed = resumeFromStack(f.state, { type: "PLAYER_CHOICE", choiceId: "accept" } as GameAction, f.db);
    expect(resumed.state.players[0].hand).toHaveLength(handBefore + drawn);
  });
});

describe("OPT-876 — CANNOT_DRAW scope.cause values", () => {
  const OWN = (f: ReturnType<typeof fixture>) => executeDraw(f.state, SELF_DRAW as never, "src", 0, f.db, new Map());
  // Player 1's effect: "your opponent draws 1" -> drawer 0, causing controller 1.
  const OPPONENT_CAUSED = (f: ReturnType<typeof fixture>) => executeDraw(f.state, OPP_DRAW as never, "src", 1, f.db, new Map());

  it.each([
    // cause, own-effect draw blocked, opponent-caused draw blocked
    [undefined, true, false],
    ["BY_YOUR_EFFECT", true, false],
    ["BY_OPPONENT_EFFECT", false, true],
    ["BY_EFFECT", true, true],
    ["ANY", true, true],
  ] as const)("cause %s: own blocked=%s, opponent-caused blocked=%s", (cause, ownBlocked, oppBlocked) => {
    const f = withInjectedProhibition(0, cause);
    expect(OWN(f).succeeded).toBe(!ownBlocked);
    expect(OPPONENT_CAUSED(f).succeeded).toBe(!oppBlocked);
  });

  it("pins the frame: ANY binds to the drawer, not to the causing controller", () => {
    // Prohibition on player 0. Player 1's effect makes player 0 draw: blocked.
    // Player 0's effect makes player 1 draw: not blocked (player 1 is free).
    const f = withInjectedProhibition(0, "ANY");
    expect(OPPONENT_CAUSED(f).succeeded).toBe(false);
    const r = executeDraw(f.state, OPP_DRAW as never, "src", 0, f.db, new Map());
    expect(r.succeeded).toBe(true);
    expect(r.state.players[1].hand).toHaveLength(f.state.players[1].hand.length + 1);
  });

  it.each(["BATTLE", "IN_BATTLE", "OPPONENT_EFFECT", "EFFECT", "BY_CHARACTER_EFFECT"])(
    "unsupported cause %s is rejected by the schema lint and never blocks at runtime",
    (cause) => {
      const f = withInjectedProhibition(0, cause);
      expect(OWN(f).succeeded).toBe(true);
      expect(OPPONENT_CAUSED(f).succeeded).toBe(true);
      const schema = {
        card_id: "TEST-001",
        effects: [{
          id: "e", category: "auto", trigger: { keyword: "ON_PLAY" },
          actions: [{
            type: "APPLY_PROHIBITION", target: { type: "PLAYER", controller: "SELF" },
            params: { prohibition_type: "CANNOT_DRAW", scope: { cause } },
            duration: { type: "THIS_TURN" },
          }],
        }],
      } as never;
      expect(findDrawProhibitionCauseViolations(schema)).toEqual([
        expect.stringContaining(`TEST-001`),
      ]);
    },
  );

  it("every authored CANNOT_DRAW uses a supported cause", () => {
    const schema = getEffectSchema(KALGARA)!;
    expect(findDrawProhibitionCauseViolations(schema)).toEqual([]);
  });
});
