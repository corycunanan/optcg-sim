import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { checkProhibitions } from "../engine/prohibitions.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { SessionTransport } from "../session/transport.js";
import { isBlockerProhibited } from "../../../../shared/blocker-prohibition.js";

// OPT-899 — OP13-057 binds its Blocker ban to the applying player's Leader.
// Printed text (docs/cards/OP-13.md:364): "[Main] You may rest 1 of your DON!!
// cards: If you have 1 or less Life cards, your opponent cannot activate
// [Blocker] whenever your Leader attacks during this turn."
// No OP13-057 FAQ exists under docs/FAQs; the sibling rulings (qa_st-21.md
// ST21-003, qa_st-01-st-04.md ST01-016) say a different attacker in the same
// turn CAN be blocked. Same frozen-attacker mechanism as OPT-826/898.

type P = 0 | 1;
const other = (p: P): P => (p === 0 ? 1 : 0);

function fixture(owner: P) {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state = { ...state, turn: { ...state.turn, activePlayerIndex: owner } };
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
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
    controller: P,
    zone: CardInstance["zone"] = "CHARACTER",
    cardState: CardInstance["state"] = "ACTIVE",
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt899-${controller}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: cardState,
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "CHARACTER") {
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
    return card;
  }
  function act(action: GameAction, player: P = owner) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function respond(action: GameAction) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected, JSON.stringify(state.pendingPrompt?.options)).toBe(false);
    state = result.state;
  }
  return {
    db,
    owner,
    data,
    put,
    act,
    respond,
    accept: () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" }),
    decline: () => respond({ type: "PLAYER_CHOICE", choiceId: "skip" }),
    select: (ids: string[]) => respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }),
    persist() {
      state = parseStoredSession(
        JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
      ).state;
    },
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

/** Common board: an opposing [Blocker] and rested opposing attack targets. */
function board(f: Fixture) {
  const blocker = f.put(CARDS.BLOCKER.id, other(f.owner));
  const targets = [0, 1, 2].map(() => f.put(CARDS.VANILLA.id, other(f.owner), "CHARACTER", "RESTED"));
  return { blocker, targets };
}

function blockerAction(blocker: CardInstance): GameAction {
  return { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId };
}

/**
 * Declare an attack, then report whether the defender's [Blocker] is legal:
 * the pipeline verdict (authoritative) and the shared client-side check the
 * board uses to show the Blocker option. Both must agree. The battle is then
 * finished with the defender passing, so another attack can follow.
 */
function attackAndProbeBlocker(f: Fixture, attacker: CardInstance, target: CardInstance, blocker: CardInstance) {
  f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId });
  expect(f.state.turn.battleSubPhase).toBe("BLOCK_STEP");
  const defender = other(f.owner);
  const veto = checkProhibitions(f.state, blockerAction(blocker), f.db, defender);
  const pipeline = runPipeline(f.state, blockerAction(blocker), f.db, defender);
  const live = f.state.players[defender].characters.find((c) => c?.instanceId === blocker.instanceId)!;
  const clientHidden = isBlockerProhibited(
    f.state.prohibitions,
    { instanceId: live.instanceId, controller: live.controller, cardType: "Character" },
    defender,
    f.state.turn.battle?.attackerInstanceId ?? null,
    { matchesFilter: () => true },
  );
  expect(pipeline.valid).toBe(veto === null);
  expect(clientHidden).toBe(veto !== null);
  for (let i = 0; i < 6 && f.state.turn.battleSubPhase; i++) f.act({ type: "PASS" }, defender);
  expect(f.state.turn.battleSubPhase).toBeNull();
  return { blockerAllowed: veto === null };
}

function blockerProhibitions(f: Fixture) {
  return f.state.prohibitions.filter((p) => p.prohibitionType === "CANNOT_ACTIVATE_BLOCKER");
}

/** End this turn and the opponent's, landing in the owner's next Main Phase. */
function toOwnersNextMain(f: Fixture) {
  for (const player of [f.owner, other(f.owner)] as const) {
    f.act({ type: "ADVANCE_PHASE" }, player);
    for (let i = 0; i < 8 && f.state.turn.phase !== "MAIN"; i++) {
      f.act({ type: "ADVANCE_PHASE" }, f.state.turn.activePlayerIndex);
    }
  }
  expect(f.state.turn.activePlayerIndex).toBe(f.owner);
  expect(f.state.turn.phase).toBe("MAIN");
  // The defender's Refresh Phase stood the attack targets up; rest them again.
  for (const card of f.state.players[other(f.owner)].characters) {
    if (card && card.cardId === CARDS.VANILLA.id) card.state = "RESTED";
  }
}

/** Candidate ids as the worker sends them (SessionTransport.sendPendingPrompts, as GameSession does). */
function blockerPrompt(f: Fixture) {
  const messages: Array<{ type: string; options?: { promptType: string; validTargets: string[] } }> = [];
  const ws = {
    send: (raw: string) => messages.push(JSON.parse(raw)),
    deserializeAttachment: () => null,
  } as unknown as WebSocket;
  const transport = new SessionTransport(
    { getWebSockets: () => [ws], acceptWebSocket: () => {}, getTags: () => [] },
    () => {},
  );
  transport.sendPendingPrompts(f.state, f.db);
  const prompt = messages.find((m) => m.type === "game:prompt")?.options;
  expect(prompt?.promptType).toBe("SELECT_BLOCKER");
  return prompt!.validTargets;
}

function declareAttack(f: Fixture, attacker: CardInstance, target: CardInstance) {
  f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId });
  expect(f.state.turn.battleSubPhase).toBe("BLOCK_STEP");
}

function setup(owner: P, lifeCount = 1) {
  const f = fixture(owner);
  f.data("OP13-057", { type: "Event", cost: 0, power: null, counter: null, effectText: "[Main] You may rest 1 of your DON!! cards: If you have 1 or less Life cards, ..." });
  const leader = f.put(CARDS.LEADER.id, owner, "LEADER");
  const char = f.put(CARDS.VANILLA.id, owner);
  const event = f.put("OP13-057", owner, "HAND");
  f.state.players[owner].life = f.state.players[owner].life.slice(0, lifeCount);
  return { f, leader, char, event, ...board(f) };
}

function play(f: Fixture, event: CardInstance, pay: boolean) {
  f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  if (f.state.pendingPrompt) {
    f.persist();
    if (pay) f.accept();
    else f.decline();
  }
  expect(f.state.pendingPrompt).toBeNull();
}

describe("OPT-899 OP13-057 binds the Blocker lock to the Leader attacker", () => {
  it("authors the Leader binding with an opponent scope and no target", () => {
    const action = getEffectSchema("OP13-057")!.effects[0]!.actions![0] as unknown as { params: { scope: unknown }; target?: unknown };
    expect(action.params.scope).toEqual({ controller: "OPPONENT", when_attacking: { type: "YOUR_LEADER" } });
    expect(action.target).toBeUndefined();
  });

  for (const owner of [0, 1] as const) {
    it(`player ${owner}: Leader attack is unblockable (client and server agree); a Character attack can be blocked`, () => {
      const { f, leader, char, event, blocker, targets } = setup(owner);
      play(f, event, true);
      const [entry] = blockerProhibitions(f);
      expect(entry).toMatchObject({ controller: owner, appliesTo: [], attackerInstanceIds: [leader.instanceId] });
      expect(attackAndProbeBlocker(f, char, targets[0], blocker).blockerAllowed).toBe(true);
      expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(false);
    });
  }

  it("the worker's SELECT_BLOCKER prompt is empty for the Leader and lists every blocker for a Character", () => {
    const { f, leader, char, event, blocker, targets } = setup(0);
    const secondBlocker = f.put(CARDS.BLOCKER.id, 1);
    play(f, event, true);
    declareAttack(f, leader, targets[0]);
    expect(blockerPrompt(f)).toEqual([]);
    expect(checkProhibitions(f.state, blockerAction(blocker), f.db, 1)).not.toBeNull();
    for (let i = 0; i < 6 && f.state.turn.battleSubPhase; i++) f.act({ type: "PASS" }, 1);
    declareAttack(f, char, targets[1]);
    expect(new Set(blockerPrompt(f))).toEqual(new Set([blocker.instanceId, secondBlocker.instanceId]));
  });

  it("more than 1 Life after the cost: no prohibition, Leader attack can be blocked", () => {
    const { f, leader, event, blocker, targets } = setup(0, 2);
    play(f, event, true);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, leader, targets[0], blocker).blockerAllowed).toBe(true);
  });

  it("declining the cost applies no prohibition", () => {
    const { f, leader, event, blocker, targets } = setup(0);
    play(f, event, false);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, leader, targets[0], blocker).blockerAllowed).toBe(true);
  });

  it("survives a serialized resume", () => {
    const { f, leader, char, event, blocker, targets } = setup(1);
    play(f, event, true);
    f.persist();
    expect(blockerProhibitions(f)[0].attackerInstanceIds).toEqual([leader.instanceId]);
    expect(attackAndProbeBlocker(f, char, targets[0], blocker).blockerAllowed).toBe(true);
    f.persist();
    expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(false);
  });

  it("expires at end of turn: the Leader attacking next turn can be blocked", () => {
    const { f, leader, event, blocker, targets } = setup(0);
    play(f, event, true);
    expect(attackAndProbeBlocker(f, leader, targets[0], blocker).blockerAllowed).toBe(false);
    toOwnersNextMain(f);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(true);
  });
});

describe("OPT-899 YOUR_LEADER attacker-binding validator", () => {
  const base = (action: Record<string, unknown>) => ({
    card_id: "TEST-899",
    card_name: "Test",
    card_type: "Event",
    effects: [{ id: "main", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [action] }],
  });
  const leader = { type: "YOUR_LEADER" };
  const blocker = (scope: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    base({ type: "APPLY_PROHIBITION", ...extra, params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER", scope } });
  const relevant = (errors: string[]) => errors.filter((e) => e.includes("when_attacking") || e.includes("scope.controller"));
  const target = { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } };

  it("accepts the authored OP13-057", () => {
    expect(validateEffectSchema(getEffectSchema("OP13-057"), "OP13-057")).toEqual([]);
  });

  it("rejects a missing or non-opponent controller", () => {
    expect(relevant(validateEffectSchema(blocker({ when_attacking: leader })))).toEqual([
      expect.stringContaining("set controller 'OPPONENT'"),
    ]);
    expect(relevant(validateEffectSchema(blocker({ controller: "SELF", when_attacking: leader })))).toEqual([
      expect.stringContaining("set controller 'OPPONENT'"),
    ]);
  });

  it("rejects extra binding keys", () => {
    expect(relevant(validateEffectSchema(blocker({ controller: "OPPONENT", when_attacking: { ...leader, ref: "x" } })))).toEqual([
      expect.stringContaining("accepts only 'type'"),
    ]);
  });

  it("rejects a target or target_ref alongside the binding", () => {
    const scope = { controller: "OPPONENT", when_attacking: leader };
    expect(relevant(validateEffectSchema(blocker(scope, { target })))).toEqual([expect.stringContaining("must not also carry a target")]);
    expect(relevant(validateEffectSchema(blocker(scope, { target_ref: "sel" })))).toEqual([expect.stringContaining("must not also carry a target")]);
  });

  it("leaves CANNOT_ATTACK with when_attacking YOUR_LEADER (attack-target gating) accepted", () => {
    const action = base({
      type: "APPLY_PROHIBITION",
      target,
      params: { prohibition_type: "CANNOT_ATTACK", scope: { controller: "OPPONENT", when_attacking: leader } },
    });
    expect(relevant(validateEffectSchema(action))).toEqual([]);
  });
});
