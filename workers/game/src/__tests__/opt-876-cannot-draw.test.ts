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
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
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

describe("OPT-876 — OPPONENT_ACTION-wrapped draws are caused by the effect source's controller", () => {
  // OP06-047 Charlotte Pudding: "[On Play] Your opponent returns all cards in
  // their hand to their deck and shuffles their deck. Then, your opponent
  // draws 5 cards." The draw is caused by Pudding's controller's effect, so a
  // Kalgara prohibition ("you cannot draw cards using your own effects") on
  // the opponent does not stop it. The cause is derived from the effect's
  // source card (effectSourceController), so sources here are real instances.
  function puddingActions(): Action[] {
    const schema = getEffectSchema("OP06-047");
    expect(schema, "OP06-047 authored").toBeDefined();
    const block = schema!.effects.find((b) =>
      b.actions?.some((a) => a.type === "OPPONENT_ACTION" && (a.params as { action?: Action }).action?.type === "DRAW"));
    expect(block, "OP06-047 OPPONENT_ACTION DRAW block").toBeDefined();
    return block!.actions!;
  }
  const leaderOf = (f: ReturnType<typeof fixture>, p: 0 | 1) => f.state.players[p].leader.instanceId;

  it("Kalgara's owner still draws 5 from the opponent's OP06-047 (real Kalgara prohibition)", () => {
    const f = fixture(0);
    f.attackLeader(f.attacker.instanceId); // Kalgara (player 0) draws 1 and is now prohibited
    expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_DRAW" && p.controller === 0)).toBe(true);
    const pudding: CardInstance = {
      instanceId: "pudding-1", cardId: "OP06-047", controller: 1, owner: 1,
      zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    };
    f.state.players[1].characters[0] = pudding;
    const deckBefore = f.state.players[0].deck.length;
    const handBefore = f.state.players[0].hand.length;
    expect(deckBefore + handBefore).toBeGreaterThanOrEqual(5);

    const r = executeActionChain(f.state, puddingActions(), pudding.instanceId, 1, f.db);
    expect(r.pendingPrompt).toBeUndefined();
    expect(r.state.players[0].hand).toHaveLength(5);
    expect(r.events.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0)).toHaveLength(5);
  });

  it("the Kalgara owner's own OPPONENT_ACTION-wrapped draw is still their opponent's draw (control)", () => {
    // Player 0 (prohibited) resolves an OPPONENT_ACTION DRAW: player 1 draws,
    // player 1 carries no prohibition, and player 0 draws nothing.
    const f = withInjectedProhibition(0, "BY_YOUR_EFFECT");
    const wrapped = { type: "OPPONENT_ACTION", params: { action: { type: "DRAW", params: { amount: 2 } } } } as Action;
    const r = executeActionChain(f.state, [wrapped], leaderOf(f, 0), 0, f.db);
    expect(r.state.players[1].hand).toHaveLength(f.state.players[1].hand.length + 2);
    expect(r.state.players[0].hand).toHaveLength(f.state.players[0].hand.length);
  });

  it("a prohibited player's OPPONENT_ACTION-wrapped draw imposed by an opponent is blocked only under BY_OPPONENT_EFFECT", () => {
    // Player 1's effect makes player 0 draw 2 via OPPONENT_ACTION.
    const wrapped = { type: "OPPONENT_ACTION", params: { action: { type: "DRAW", params: { amount: 2 } } } } as Action;
    const blocked = withInjectedProhibition(0, "BY_OPPONENT_EFFECT");
    const r1 = executeActionChain(blocked.state, [wrapped], leaderOf(blocked, 1), 1, blocked.db);
    expect(r1.state.players[0].hand).toHaveLength(blocked.state.players[0].hand.length);

    const open = withInjectedProhibition(0, "BY_YOUR_EFFECT");
    const r2 = executeActionChain(open.state, [wrapped], leaderOf(open, 1), 1, open.db);
    expect(r2.state.players[0].hand).toHaveLength(open.state.players[0].hand.length + 2);
  });

  it("a doubly nested OPPONENT_ACTION keeps the source's cause (the drawer's own effect stays blocked)", () => {
    // Player 0's effect flips the acting player twice, back to player 0:
    // player 0 draws through its own effect, so BY_YOUR_EFFECT blocks it.
    const f = withInjectedProhibition(0, "BY_YOUR_EFFECT");
    const nested = {
      type: "OPPONENT_ACTION",
      params: { action: { type: "OPPONENT_ACTION", params: { action: SELF_DRAW } } },
    } as Action;
    const r = executeActionChain(f.state, [nested], leaderOf(f, 0), 0, f.db);
    expect(r.state.players[0].hand).toHaveLength(f.state.players[0].hand.length);
  });

  it("HAND_WHEEL inside OPPONENT_ACTION: the trash half precedes and is isolated from the draw half", () => {
    // Player 1's effect makes player 0 trash 1 and draw 1. The trashed card is
    // the pre-wheel hand card, never the drawn one; the draw half follows the
    // wrapper source's cause (opponent-caused) independently of the trash half.
    for (const [cause, drawn] of [["BY_YOUR_EFFECT", 1], ["BY_OPPONENT_EFFECT", 0]] as const) {
      const f = withInjectedProhibition(0, cause);
      f.state.players[0].hand = [{
        instanceId: "wheel-hand", cardId: CARDS.VANILLA.id, controller: 0, owner: 0,
        zone: "HAND", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
      }];
      f.state.players[0].trash = [];
      const topOfDeck = f.state.players[0].deck[0].instanceId;
      const wheel = {
        type: "OPPONENT_ACTION",
        params: { action: { type: "HAND_WHEEL", params: { trash_count: 1, draw_count: 1 } } },
      } as Action;
      const r = executeActionChain(f.state, [wheel], leaderOf(f, 1), 1, f.db);
      // Zone moves mint new instance ids; the wheel card is the only trash
      // entry and the drawn card is the former top of deck.
      expect(r.state.players[0].trash, cause).toHaveLength(1);
      expect(r.state.players[0].deck[0]?.instanceId === topOfDeck, cause).toBe(!drawn);
      expect(r.state.players[0].hand, cause).toHaveLength(drawn);
      expect(r.events.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0), cause).toHaveLength(drawn);
      const trashIdx = r.events.findIndex((e) => e.type === "CARD_TRASHED");
      expect(trashIdx, cause).toBeGreaterThanOrEqual(0);
      if (drawn) expect(r.events.findIndex((e) => e.type === "CARD_DRAWN")).toBeGreaterThan(trashIdx);
    }
  });
});

describe("OPT-876 — a paused OPPONENT_ACTION draw keeps its cause across a serialized resume", () => {
  // Hypothetical shape (no authored card today): "your opponent may draw 2".
  // The wrapped draw pauses for the opponent's decision. Nothing about the
  // cause is stored on the frame: it is re-derived from the frame's source.
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
    const source = f.state.players[1].leader.instanceId;
    const paused = executeActionChain(f.state, [wrappedOptional], source, 1, f.db);
    expect(paused.pendingPrompt, "optional wrapped draw pauses").toBeDefined();
    const frame = paused.state.effectStack.at(-1)!;
    expect(frame.controller).toBe(0);
    expect(frame.sourceCardInstanceId).toBe(source);
    expect(Object.keys(frame)).not.toContain("effectController");

    f.setState(paused.state);
    f.persist();
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

  it("CANNOT_DRAW binds the applying player, so a non-SELF target is rejected by the schema lint", () => {
    const withTarget = (target: unknown) => ({
      card_id: "TEST-002",
      effects: [{
        id: "e", category: "auto", trigger: { keyword: "ON_PLAY" },
        actions: [{
          type: "APPLY_PROHIBITION", ...(target === undefined ? {} : { target }),
          params: { prohibition_type: "CANNOT_DRAW" }, duration: { type: "THIS_TURN" },
        }],
      }],
    }) as never;
    expect(findDrawProhibitionCauseViolations(withTarget(undefined))).toEqual([]);
    expect(findDrawProhibitionCauseViolations(withTarget({ type: "PLAYER", controller: "SELF" }))).toEqual([]);
    expect(findDrawProhibitionCauseViolations(withTarget({ type: "PLAYER", controller: "OPPONENT" }))).toEqual([
      expect.stringContaining("binds the applying player"),
    ]);
    // Runtime: the prohibition is bound to the applier (effects.ts), which is
    // what the lint protects.
    const f = fixture(0);
    const r = executeActionChain(f.state, [{
      type: "APPLY_PROHIBITION", target: { type: "PLAYER", controller: "SELF" },
      params: { prohibition_type: "CANNOT_DRAW" }, duration: { type: "THIS_TURN" },
    } as Action], f.state.players[1].leader.instanceId, 1, f.db);
    expect(r.state.prohibitions.filter((p) => p.prohibitionType === "CANNOT_DRAW").map((p) => p.controller)).toEqual([1]);
  });

  it("every authored CANNOT_DRAW uses a supported cause", () => {
    const schema = getEffectSchema(KALGARA)!;
    expect(findDrawProhibitionCauseViolations(schema)).toEqual([]);
  });
});

// ─── Continuation paths through the real pipeline (PR #716 delta review) ─────
//
// Player 1 is the turn player and activates a Character whose effect makes
// player 0 act (OPPONENT_ACTION). Player 0 carries CANNOT_DRAW
// BY_YOUR_EFFECT, so a draw caused by player 1's effect must still draw and a
// draw caused by player 0's own effect (a new effect triggered mid-chain) must
// not. Every prompt is answered after a serialized round trip, so each resume
// re-derives the cause from persisted data alone.

function pipelineHarness(cause: string, actions: Action[]) {
  const f = withInjectedProhibition(0, cause);
  const s = f.state;
  s.turn.activePlayerIndex = 1;
  s.turn.phase = "MAIN";
  s.players[0].characters = padChars([]);
  s.players[0].hand = [];
  s.players[1].characters = padChars([]);
  const srcId = "OPT876-SRC";
  f.db.set(srcId, {
    ...CARDS.VANILLA, id: srcId, name: srcId, effectText: "",
    effectSchema: {
      card_id: srcId, card_name: srcId, card_type: "Character",
      effects: [{ id: "src", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions }],
    } as never,
  });
  const src: CardInstance = {
    instanceId: "opt876-src", cardId: srcId, controller: 1, owner: 1,
    zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
  };
  s.players[1].characters[0] = src;
  f.setState(registerCardEnteredField(s, src, f.db.get(srcId)!));

  /** Place a Character for `owner` whose On K.O. runs `onKo`. */
  function putOnKo(instanceId: string, owner: 0 | 1, onKo: Action[]) {
    const id = `OPT876-${instanceId}`;
    f.db.set(id, {
      ...CARDS.VANILLA, id, name: id, effectText: "",
      effectSchema: {
        card_id: id, card_name: id, card_type: "Character",
        effects: [{ id: "on-ko", category: "auto", trigger: { keyword: "ON_KO" }, actions: onKo }],
      } as never,
    });
    const card: CardInstance = {
      instanceId, cardId: id, controller: owner, owner,
      zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    };
    const slot = f.state.players[owner].characters.findIndex((c) => !c);
    f.state.players[owner].characters[slot] = card;
    f.setState(registerCardEnteredField(f.state, card, f.db.get(id)!));
    return card;
  }

  function step(action: GameAction) {
    f.persist();
    if (f.state.pendingPrompt) {
      const r = resumePromptLifecycle(f.state, action, f.db, {
        drainPregame: (x) => x,
        advanceStartOfTurn: (x) => x,
      });
      expect(r.responseRejected, JSON.stringify({ action, prompt: f.state.pendingPrompt?.options })).toBe(false);
      f.setState(r.state);
    } else {
      const r = runPipeline(f.state, action, f.db, 1);
      expect(r.valid, r.error).toBe(true);
      f.setState(r.state);
    }
  }
  return {
    f, putOnKo, step,
    activate: () => step({ type: "ACTIVATE_EFFECT", cardInstanceId: src.instanceId, effectId: "src" }),
    prompt: () => f.state.pendingPrompt,
    hand0: () => f.state.players[0].hand,
    drawn0: () => f.state.eventLog.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 0).length,
    settled() {
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toHaveLength(0);
    },
  };
}

function firstChoiceId(options: NonNullable<GameState["pendingPrompt"]>["options"]): string {
  if (options.promptType !== "PLAYER_CHOICE") throw new Error(`unexpected ${options.promptType}`);
  return options.choices![0].id;
}
const wrap = (action: Action) => ({ type: "OPPONENT_ACTION", params: { action } }) as Action;
const OPTIONAL_SELF_DRAW = { ...SELF_DRAW, optional: true } as Action;
const chooseOnly = (option: Action[]) => ({ type: "PLAYER_CHOICE", params: { options: [option] } }) as Action;

describe("OPT-876 — OPPONENT_ACTION draw cause survives every continuation path (pipeline + persistence)", () => {
  it("batch re-entry: an On K.O. pause mid-batch; the opponent-caused draw still draws and the On K.O. own draw does not", () => {
    // Player 0 K.O.s its own Character (player 1's effect), then draws 1.
    // The K.O.'d Character's On K.O. "you may draw 1" is player 0's own
    // effect: offered, accepted, blocked. The batch then re-enters and the
    // opponent-caused draw resolves: exactly 1 card.
    const h = pipelineHarness("BY_YOUR_EFFECT", [wrap(chooseOnly([
      { type: "KO", target: { type: "CHARACTER", controller: "SELF", count: { all: true } } } as Action,
      SELF_DRAW,
    ]))]);
    h.putOnKo("p0-onko", 0, [OPTIONAL_SELF_DRAW]);
    h.activate();
    for (let i = 0; i < 4 && h.prompt(); i++) {
      const options = h.prompt()!.options;
      h.step(options.promptType === "OPTIONAL_EFFECT"
        ? { type: "PLAYER_CHOICE", choiceId: "accept" }
        : { type: "PLAYER_CHOICE", choiceId: firstChoiceId(options) });
    }
    h.settled();
    expect(h.f.state.players[0].trash.map((c) => c.cardId)).toContain("OPT876-p0-onko");
    expect(h.hand0()).toHaveLength(1);
    expect(h.drawn0()).toBe(1);
  });

  it("new effect mid-chain from the opponent's card is attributed to its own source (player 1's On K.O. makes player 0 draw)", () => {
    // Player 0 K.O.s a Character of player 1 (player 1's effect). That
    // Character's On K.O. "your opponent draws 1" is player 1's effect, so
    // player 0 draws; the outer batch draw is also player 1's: 2 cards total.
    const h = pipelineHarness("BY_YOUR_EFFECT", [wrap(chooseOnly([
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } } as Action,
      SELF_DRAW,
    ]))]);
    h.putOnKo("p1-onko", 1, [{ ...OPP_DRAW, optional: true } as Action]);
    h.activate();
    for (let i = 0; i < 4 && h.prompt(); i++) {
      const options = h.prompt()!.options;
      h.step(options.promptType === "OPTIONAL_EFFECT"
        ? { type: "PLAYER_CHOICE", choiceId: "accept" }
        : { type: "PLAYER_CHOICE", choiceId: firstChoiceId(options) });
    }
    h.settled();
    expect(h.f.state.players[1].trash.map((c) => c.cardId)).toContain("OPT876-p1-onko");
    expect(h.hand0()).toHaveLength(2);
  });

  it("simultaneous target group: two consecutive target prompts, then the opponent-caused draw draws", () => {
    const h = pipelineHarness("BY_YOUR_EFFECT", [wrap(chooseOnly([
      { type: "MODIFY_COST", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } }, params: { amount: -1 }, duration: { type: "THIS_TURN" } } as Action,
      { type: "MODIFY_POWER", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } }, params: { amount: -1000 }, duration: { type: "THIS_TURN" }, chain: "AND" } as Action,
      SELF_DRAW,
    ]))]);
    const other = (i: number): CardInstance => ({
      instanceId: `p1-other-${i}`, cardId: CARDS.VANILLA.id, controller: 1, owner: 1,
      zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    });
    h.f.state.players[1].characters[1] = other(0);
    h.f.state.players[1].characters[2] = other(1);
    h.activate();
    let targetPrompts = 0;
    for (let i = 0; i < 5 && h.prompt(); i++) {
      const options = h.prompt()!.options;
      if (options.promptType === "SELECT_TARGET") {
        h.step({ type: "SELECT_TARGET", selectedInstanceIds: [options.validTargets![0]] });
        targetPrompts++;
      } else {
        h.step({ type: "PLAYER_CHOICE", choiceId: firstChoiceId(options) });
      }
    }
    h.settled();
    expect(targetPrompts).toBe(2);
    expect(h.hand0()).toHaveLength(1);
  });

  it("optional response → choice → target: the opponent-caused draw still draws", () => {
    // Authored schemas allow action-level optional only at the block's top
    // level, so the pipeline order is optional, then choice, then target.
    const h = pipelineHarness("BY_YOUR_EFFECT", [{ ...wrap({
      type: "PLAYER_CHOICE",
      params: { options: [
        [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }, SELF_DRAW],
        [{ type: "DRAW", params: { amount: 2 } }],
      ] },
    } as Action), optional: true } as Action]);
    h.f.state.players[0].hand = Array.from({ length: 2 }, (_, i): CardInstance => ({
      instanceId: `p0-hand-${i}`, cardId: CARDS.VANILLA.id, controller: 0, owner: 0,
      zone: "HAND", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    }));
    h.activate();
    const seen: string[] = [];
    for (const reply of [
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      { type: "PLAYER_CHOICE", choiceId: "0" },
      { type: "SELECT_TARGET", selectedInstanceIds: ["p0-hand-0"] },
    ] as GameAction[]) {
      expect(h.prompt(), JSON.stringify(seen)).toBeTruthy();
      seen.push(h.prompt()!.options.promptType);
      h.step(reply);
    }
    h.settled();
    expect(seen).toEqual(["OPTIONAL_EFFECT", "PLAYER_CHOICE", "SELECT_TARGET"]);
    expect(h.hand0().map((c) => c.instanceId)).toContain("p0-hand-1");
    expect(h.hand0()).toHaveLength(2);
  });

  it("choice → target → optional response (resolver boundary, nested optional draw), each resume after persistence", () => {
    const f = withInjectedProhibition(0, "BY_YOUR_EFFECT");
    f.state.players[0].hand = Array.from({ length: 2 }, (_, i): CardInstance => ({
      instanceId: `p0-hand-${i}`, cardId: CARDS.VANILLA.id, controller: 0, owner: 0,
      zone: "HAND", state: "ACTIVE", attachedDon: [], turnPlayed: 0,
    }));
    const wrapped = wrap({
      type: "PLAYER_CHOICE",
      params: { options: [
        [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }, OPTIONAL_SELF_DRAW],
        [{ type: "DRAW", params: { amount: 2 } }],
      ] },
    } as Action);
    let r = executeActionChain(f.state, [wrapped], f.state.players[1].leader.instanceId, 1, f.db);
    for (const reply of [
      { type: "PLAYER_CHOICE", choiceId: "0" },
      { type: "SELECT_TARGET", selectedInstanceIds: ["p0-hand-0"] },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
    ] as GameAction[]) {
      expect(r.pendingPrompt).toBeDefined();
      f.setState(r.state);
      f.persist();
      r = resumeFromStack(f.state, reply, f.db);
    }
    expect(r.pendingPrompt).toBeUndefined();
    expect(r.state.players[0].hand).toHaveLength(2);
  });

  it("trigger queue: two simultaneous On K.O. triggers of player 1 each make player 0 draw via OPPONENT_ACTION", () => {
    // Player 1's effect K.O.s two of its own Characters; each On K.O.
    // "your opponent draws 1" (wrapped) resolves from the trigger queue after
    // an ordering prompt. Both are player 1's effects: player 0 draws 2.
    const h = pipelineHarness("BY_YOUR_EFFECT", [
      { type: "KO", target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { exclude_self: true } } } as Action,
    ]);
    h.putOnKo("p1-q-0", 1, [wrap(SELF_DRAW)]);
    h.putOnKo("p1-q-1", 1, [wrap(SELF_DRAW)]);
    h.activate();
    let prompts = 0;
    for (let i = 0; i < 5 && h.prompt(); i++) {
      const options = h.prompt()!.options;
      if (options.promptType !== "PLAYER_CHOICE") throw new Error(`unexpected ${options.promptType}`);
      const next = options.choices!.find((c) => !c.disabled && c.id !== "done") ?? options.choices![0];
      h.step({ type: "PLAYER_CHOICE", choiceId: next.id });
      prompts++;
    }
    h.settled();
    expect(prompts).toBeGreaterThan(0);
    expect(h.f.state.players[1].trash.map((c) => c.cardId)).toEqual(expect.arrayContaining(["OPT876-p1-q-0", "OPT876-p1-q-1"]));
    expect(h.hand0()).toHaveLength(2);
  });
});
