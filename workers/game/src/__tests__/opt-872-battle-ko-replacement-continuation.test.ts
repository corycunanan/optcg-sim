/**
 * OPT-872 — an optional battle-K.O. replacement prompt resumes the Damage Step.
 *
 * Rules (docs/rules/rule_comprehensive.md):
 * - §7-1-4-1-2: the Character that loses a battle is K.O.'d; then the game
 *   proceeds to End of the Battle (§7-1-5).
 * - §8-1-3-4-1: a replacement the player chooses not to apply is not resolved,
 *   so a declined replacement leaves the original K.O. in place.
 * - §8-1-3-4-2 / §8-1-3-4-3: several replacements may apply to one situation;
 *   once it has been replaced, the same replacements cannot apply again.
 *
 * Card text (docs/cards/):
 * - OP10-034 Franky: "[Once Per Turn] If this Character would be K.O.'d in
 *   battle, you may add 1 card from the top of your Life cards to your hand
 *   instead."
 * - EB03-001 Nefeltari Vivi (Leader): "[Once Per Turn] If your Character with a
 *   base cost of 4 or more would be K.O.'d, you may trash 1 card from your hand
 *   instead."
 * - OP11-110 Fukaboshi: "If this Character would be K.O.'d, you may rest 1 of
 *   your [Fish-Man Island] or your [Shirahoshi] Leader instead."
 * - OP09-083 Van Augur: "[On K.O.] Draw 1 card."
 *
 * Every effect comes from the production schema registry; the fixture supplies
 * only official card stats. Actions go through the SessionCoordinator (prompt
 * routing), the real pipeline, resumePromptLifecycle, and SessionRepository.
 */

import { describe, expect, it } from "vitest";
import type {
  BattleKOReplacementContinuation,
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { RuntimeProhibition } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { filterStateForPlayer } from "../engine/state.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { resumeBattleDamageContinuation } from "../engine/battle.js";
import {
  SessionRepository,
  parseStoredSession,
  type SessionStorage,
} from "../session/persistence.js";
import { visibleStateForSpectator } from "../session/visibility.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [key, entry] of Object.entries(entries)) this.data.set(key, structuredClone(entry));
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  const coordinator = new SessionCoordinator();
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
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  /** Route an action exactly as GameSession does: coordinator, then pipeline or prompt resume. */
  function send(player: 0 | 1, action: GameAction): { kind: string; reason?: string } {
    const promptId = state.pendingPrompt?.promptId;
    const withId =
      promptId && (action.type === "PLAYER_CHOICE" || action.type === "SELECT_TARGET")
        ? ({ ...action, promptId } as GameAction)
        : action;
    const result = coordinator.executeAction(state, [], player, withId, db);
    if (result.kind === "resume") {
      const resumed = resumePromptLifecycle(result.state, withId, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => coordinator.advanceStartOfTurn(s, db),
      });
      if (resumed.responseRejected) return { kind: "reject", reason: "responseRejected" };
      state = resumed.state;
      return { kind: "resume" };
    }
    if (result.kind === "applied") state = result.state;
    return { kind: result.kind, reason: "reason" in result ? result.reason : undefined };
  }

  function ok(player: 0 | 1, action: GameAction) {
    const r = send(player, action);
    expect(r.kind, `${action.type}: ${r.reason}`).not.toBe("reject");
  }

  const responder = () => state.pendingPrompt!.respondingPlayer;
  const accept = () => ok(responder(), { type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => ok(responder(), { type: "PLAYER_CHOICE", choiceId: "skip" });

  /** `attacker` attacks a rested `target`; both players pass until the Damage Step prompts or ends. */
  function battle(target: CardInstance, attacker: CardInstance) {
    const player = attacker.controller;
    state.turn.activePlayerIndex = player;
    state.players[target.controller].characters.find((c) => c?.instanceId === target.instanceId)!.state =
      "RESTED";
    ok(player, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    });
    while (!state.pendingPrompt && state.turn.battle) {
      const passer = state.turn.battleSubPhase === "ATTACK_STEP" ? player : target.controller;
      ok(passer, { type: "PASS" });
    }
  }

  function attacker(power = 7000) {
    const id = `P1-ATTACKER-${power}-${serial}`;
    data(id, { power });
    return put(id, 1);
  }

  const onField = (card: CardInstance) =>
    state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId);
  const inTrash = (card: CardInstance) =>
    state.players[card.owner].trash.some((c) => c.cardId === card.cardId);
  const events = (type: string) => state.eventLog.filter((e) => e.type === type);
  const continuation = () =>
    state.turn.pendingBattleDamageContinuation as BattleKOReplacementContinuation | null | undefined;

  return {
    db,
    data,
    put,
    send,
    ok,
    accept,
    decline,
    battle,
    attacker,
    onField,
    inTrash,
    events,
    continuation,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function franky(f: Fixture) {
  f.data("OP10-034", { cost: 4, power: 5000, counter: 1000 });
  return f.put("OP10-034", 0);
}

function vivi(f: Fixture) {
  f.data("EB03-001", { type: "Leader", cost: null, power: 5000, counter: null, life: 4 });
  return f.put("EB03-001", 0, "LEADER");
}

function vanAugur(f: Fixture) {
  f.data("OP09-083", { cost: 5, power: 6000, counter: 1000 });
  return f.put("OP09-083", 0);
}

function fukaboshi(f: Fixture) {
  f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name: "Shirahoshi" });
  f.data("OP11-110", { cost: 3, power: 5000, counter: null });
  return f.put("OP11-110", 0);
}

function handCards(f: Fixture, player: 0 | 1, count: number) {
  return Array.from({ length: count }, () => f.put(CARDS.VANILLA.id, player, "HAND"));
}

/** The battle is over, exactly one END_OF_BATTLE fired, and the next attack is legal. */
function expectBattleClosedOnce(f: Fixture) {
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.turn.battle).toBeNull();
  expect(f.state.turn.battleSubPhase).toBeNull();
  expect(f.continuation() ?? null).toBeNull();
  const ends = f.events("END_OF_BATTLE");
  expect(ends).toHaveLength(1);
  expect(ends[0].payload).toMatchObject({ aborted: false });
  const next = f.attacker(1000);
  const target = f.state.players[0].leader;
  expect(
    f.send(1, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: next.instanceId,
      targetInstanceId: target.instanceId,
    }).kind,
  ).toBe("applied");
  expect(f.state.turn.battle?.attackerInstanceId).toBe(next.instanceId);
}

function pendingBattleId(f: Fixture) {
  expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  expect(f.state.turn.battleSubPhase).toBe("DAMAGE_STEP");
  return f.state.turn.battle!.battleId;
}

// ─── OP10-034 Franky ─────────────────────────────────────────────────────────

describe("OP10-034 Franky — the Damage Step resumes after the replacement prompt", () => {
  it("records a public continuation while the prompt is pending", () => {
    const f = fixture();
    const target = franky(f);
    const attacker = f.attacker();

    f.battle(target, attacker);

    const battleId = pendingBattleId(f);
    expect(f.continuation()).toEqual({
      battleId,
      stage: "CHARACTER_KO_REPLACEMENT",
      targetInstanceId: target.instanceId,
      replacementEffectId: expect.any(String),
      causingPlayerIndex: 1,
      attackerIsCharacter: true,
    });
    // Nothing from the Damage Step is published until the prompt is answered.
    expect(f.events("COMBAT_VICTORY")).toHaveLength(0);
    expect(f.events("END_OF_BATTLE")).toHaveLength(0);
  });

  it("accept: Life top → hand, Franky stays, the battle ends exactly once (§7-1-5)", () => {
    const f = fixture();
    const target = franky(f);
    const attacker = f.attacker();
    const life = f.state.players[0].life.map((c) => c.instanceId);

    f.battle(target, attacker);
    pendingBattleId(f);
    f.accept();

    expect(f.onField(target)).toBe(true);
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(life.slice(1));
    expect(f.state.players[0].hand).toHaveLength(1);
    expect(f.events("CHARACTER_BATTLES")).toHaveLength(1);
    expect(f.events("COMBAT_VICTORY")).toHaveLength(1);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expectBattleClosedOnce(f);
  });

  it("decline: Franky is K.O.'d with the battle-K.O. payload and the battle ends (§8-1-3-4-1)", () => {
    const f = fixture();
    const target = franky(f);
    const attacker = f.attacker();
    f.state.players[0].characters.find((c) => c?.instanceId === target.instanceId)!.attachedDon = [
      { instanceId: "don-franky", state: "ACTIVE", attachedTo: target.instanceId },
    ];
    const life = f.state.players[0].life.map((c) => c.instanceId);

    f.battle(target, attacker);
    pendingBattleId(f);
    f.decline();

    expect(f.onField(target)).toBe(false);
    expect(f.inTrash(target)).toBe(true);
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(life);
    expect(f.state.players[0].hand).toHaveLength(0);
    const kos = f.events("CARD_KO");
    expect(kos).toHaveLength(1);
    expect(kos[0].payload).toMatchObject({
      cardInstanceId: target.instanceId,
      cause: "BATTLE",
      movementCause: "BATTLE",
      preKO_donCount: 1,
    });
    expect(f.events("COMBAT_VICTORY")).toHaveLength(1);
    expectBattleClosedOnce(f);
  });

  it("decline under a battle CANNOT_BE_KO prohibition: Franky survives and the battle still ends", () => {
    const f = fixture();
    const target = franky(f);
    const attacker = f.attacker();
    f.state.prohibitions = [
      ...f.state.prohibitions,
      {
        id: "no-battle-ko",
        sourceCardInstanceId: target.instanceId,
        sourceEffectBlockId: "test",
        prohibitionType: "CANNOT_BE_KO",
        scope: { cause: "BATTLE" },
        duration: { type: "PERMANENT" },
        controller: 0,
        appliesTo: [target.instanceId],
        usesRemaining: null,
      } as unknown as RuntimeProhibition,
    ];

    f.battle(target, attacker);
    pendingBattleId(f);
    f.decline();

    expect(f.onField(target)).toBe(true);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expectBattleClosedOnce(f);
  });

  it("wrong player: the attacker cannot answer the defender's replacement prompt", () => {
    const f = fixture();
    const target = franky(f);
    const attacker = f.attacker();

    f.battle(target, attacker);
    pendingBattleId(f);
    const before = structuredClone(f.state);
    const r = f.send(1, { type: "PLAYER_CHOICE", choiceId: "skip" });

    expect(r.kind).toBe("reject");
    expect(f.state).toEqual(before);
  });

  it("stale battleId: the continuation is discarded without touching the current battle", () => {
    const f = fixture();
    const target = franky(f);
    const attacker = f.attacker();

    f.battle(target, attacker);
    const battleId = pendingBattleId(f);
    f.state = {
      ...f.state,
      turn: {
        ...f.state.turn,
        pendingBattleDamageContinuation: { ...f.continuation()!, battleId: "stale-battle" },
      },
    };
    f.decline();

    expect(f.continuation() ?? null).toBeNull();
    expect(f.onField(target)).toBe(true);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expect(f.events("END_OF_BATTLE")).toHaveLength(0);
    expect(f.state.turn.battle?.battleId).toBe(battleId);
  });
});

describe("an answered continuation is never re-answered", () => {
  // Defensive: no authored flow raises a second prompt for the same
  // replacement and target while the first answer is still being carried out.
  // The state is constructed to pin that a recorded resolution is kept.
  it("a matching REPLACEMENT prompt does not overwrite a recorded REPLACED resolution", () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    const lifeBefore = f.state.players[0].life.length;
    f.state = {
      ...f.state,
      turn: {
        ...f.state.turn,
        pendingBattleDamageContinuation: { ...f.continuation()!, resolution: "REPLACED" },
      },
    };
    f.decline();

    expect(f.onField(target)).toBe(true);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expect(f.state.players[0].life).toHaveLength(lifeBefore);
    expectBattleClosedOnce(f);
  });
});

// ─── Other optional battle-reachable replacements ────────────────────────────

describe("EB03-001 Vivi (Leader proxy) — the Damage Step resumes", () => {
  it("accept: the substitute's hand-trash choice resolves, then the battle ends exactly once", () => {
    const f = fixture();
    vivi(f);
    const target = vanAugur(f);
    const attacker = f.attacker();
    const hand = handCards(f, 0, 2);

    f.battle(target, attacker);
    pendingBattleId(f);
    f.accept();

    // TRASH_FROM_HAND with two candidates asks which card to trash; the
    // battle stays paused (continuation kept) until that choice resolves.
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.turn.battleSubPhase).toBe("DAMAGE_STEP");
    expect(f.continuation()).toMatchObject({ resolution: "REPLACED" });
    f.ok(0, { type: "SELECT_TARGET", selectedInstanceIds: [hand[0].instanceId] });

    expect(f.onField(target)).toBe(true);
    expect(f.state.players[0].hand.map((c) => c.instanceId)).toEqual([hand[1].instanceId]);
    expect(f.state.players[0].trash).toHaveLength(1);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expect(f.events("COMBAT_VICTORY")).toHaveLength(1);
    expectBattleClosedOnce(f);
  });

  it("decline: the protected Character is K.O.'d and its [On K.O.] draws 1 (OP09-083)", () => {
    const f = fixture();
    vivi(f);
    const target = vanAugur(f);
    const attacker = f.attacker();
    handCards(f, 0, 1);
    const deckBefore = f.state.players[0].deck.length;

    f.battle(target, attacker);
    pendingBattleId(f);
    f.decline();

    expect(f.inTrash(target)).toBe(true);
    expect(f.events("CARD_KO")).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(2);
    expect(f.state.players[0].deck).toHaveLength(deckBefore - 1);
    expectBattleClosedOnce(f);
  });
});

describe("OP11-110 Fukaboshi — the Damage Step resumes", () => {
  it("accept: the Shirahoshi Leader rests, Fukaboshi stays, the battle ends exactly once", () => {
    const f = fixture();
    const target = fukaboshi(f);
    const attacker = f.attacker();

    f.battle(target, attacker);
    pendingBattleId(f);
    f.accept();

    expect(f.onField(target)).toBe(true);
    expect(f.state.players[0].leader.state).toBe("RESTED");
    expectBattleClosedOnce(f);
  });

  it("decline: Fukaboshi is K.O.'d and the battle ends exactly once", () => {
    const f = fixture();
    const target = fukaboshi(f);
    const attacker = f.attacker();

    f.battle(target, attacker);
    pendingBattleId(f);
    f.decline();

    expect(f.inTrash(target)).toBe(true);
    expect(f.state.players[0].leader.state).toBe("ACTIVE");
    expectBattleClosedOnce(f);
  });
});

describe("a mandatory replacement whose substitute asks for input", () => {
  // Constructed from EB03-001 with `optional: false` (no authored battle-reachable
  // mandatory replacement prompts today; OP08-045 Thatch's substitute does not).
  it("keeps the battle paused until the substitute resolves, then ends it once without a K.O.", () => {
    const f = fixture();
    const schema = structuredClone(getEffectSchema("EB03-001")!);
    const block = schema.effects[0];
    if (block.category !== "replacement" || !block.flags) throw new Error("shape");
    block.flags.optional = false;
    f.data("EB03-001", {
      type: "Leader",
      cost: null,
      power: 5000,
      counter: null,
      life: 4,
      effectSchema: schema,
    });
    f.put("EB03-001", 0, "LEADER");
    const target = vanAugur(f);
    const hand = handCards(f, 0, 2);

    f.battle(target, f.attacker());

    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.turn.battleSubPhase).toBe("DAMAGE_STEP");
    expect(f.continuation()).toMatchObject({
      stage: "CHARACTER_KO_REPLACEMENT",
      resolution: "REPLACED",
    });
    expect(f.continuation()).not.toHaveProperty("replacementEffectId");
    f.ok(0, { type: "SELECT_TARGET", selectedInstanceIds: [hand[1].instanceId] });

    expect(f.onField(target)).toBe(true);
    expect(f.state.players[0].hand.map((c) => c.instanceId)).toEqual([hand[0].instanceId]);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expect(f.events("COMBAT_VICTORY")).toHaveLength(1);
    expectBattleClosedOnce(f);
  });
});

// ─── Two replacements for one battle K.O. (Franky + EB03-001) ────────────────

describe("two optional replacements cover the same battle K.O.", () => {
  it("accepting the first replaces the K.O.; the second is not offered (§8-1-3-4-3)", () => {
    const f = fixture();
    vivi(f);
    const target = franky(f);
    const attacker = f.attacker();
    handCards(f, 0, 1);

    f.battle(target, attacker);
    pendingBattleId(f);
    f.accept();
    // A single-candidate hand trash may still ask; answer any substitute prompt.
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      f.ok(0, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [f.state.players[0].hand[0].instanceId],
      });
    }

    expect(f.onField(target)).toBe(true);
    expectBattleClosedOnce(f);
  });

  it("declining the first K.O.s Franky and ends the battle exactly once (engine offers no second replacement)", () => {
    const f = fixture();
    vivi(f);
    const target = franky(f);
    const attacker = f.attacker();
    handCards(f, 0, 1);

    f.battle(target, attacker);
    pendingBattleId(f);
    f.decline();

    expect(f.inTrash(target)).toBe(true);
    expect(f.events("CARD_KO")).toHaveLength(1);
    expectBattleClosedOnce(f);
  });

  // Ratchet (follow-up): §8-1-3-4-1 only discards the declined replacement,
  // and §8-1-3-4-2 lets the remaining replacements apply in order. The battle
  // path (checkReplacementForKO) offers only the first match, so declining it
  // K.O.s Franky without offering the other. Changing that needs matching
  // changes in replacements.ts, outside OPT-872.
  it.fails("declining the first offers the remaining replacement (§8-1-3-4-1/2)", () => {
    const f = fixture();
    vivi(f);
    const target = franky(f);
    const attacker = f.attacker();
    handCards(f, 0, 1);

    f.battle(target, attacker);
    pendingBattleId(f);
    f.decline();

    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  });
});

// ─── Persistence through SessionRepository ───────────────────────────────────

describe("persisted prompt — SessionRepository.load resumes the battle exactly once", () => {
  async function roundTrip(f: Fixture, storage: MemoryStorage) {
    const repo = new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" });
    const saved = await repo.save({ state: f.state, cardDb: f.db, undoHistory: [], mode: "PVP" } as never);
    f.state = saved.state;
    const loaded = await new SessionRepository(storage, {
      nextJsUrl: "https://x.test",
      workerSecret: "s",
    }).load();
    expect(loaded).not.toBeNull();
    f.state = loaded!.state;
  }

  for (const choice of ["accept", "skip"] as const) {
    it(`${choice}: resumes once after load; a replayed response is rejected with no state change`, async () => {
      const f = fixture();
      const target = franky(f);
      const attacker = f.attacker();
      const storage = new MemoryStorage();

      f.battle(target, attacker);
      const battleId = pendingBattleId(f);
      await roundTrip(f, storage);

      expect(f.continuation()).toMatchObject({
        battleId,
        stage: "CHARACTER_KO_REPLACEMENT",
        targetInstanceId: target.instanceId,
      });
      const promptId = f.state.pendingPrompt?.promptId;
      expect(promptId).toEqual(expect.any(String));
      const response = { type: "PLAYER_CHOICE", choiceId: choice, promptId } as GameAction;

      expect(f.send(0, response).kind).toBe("resume");
      expect(f.state.turn.battle).toBeNull();
      expect(f.events("COMBAT_VICTORY")).toHaveLength(1);
      expect(f.onField(target)).toBe(choice === "accept");
      await roundTrip(f, storage);
      const afterFirst = structuredClone(f.state);

      expect(f.send(0, response).kind).toBe("reject");
      expect(f.state).toEqual(afterFirst);
      // The lifecycle itself also refuses a response with no pending prompt.
      const direct = resumePromptLifecycle(f.state, response, f.db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(direct.responseRejected).toBe(true);
      expect(direct.state).toEqual(afterFirst);
      expectBattleClosedOnce(f);
    });
  }
});

// ─── Persisted schema and visibility of the new continuation shape ───────────

describe("CHARACTER_KO_REPLACEMENT continuation — schema and visibility", () => {
  function pendingState() {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    return f;
  }

  function parse(state: GameState, db: Map<string, CardData>) {
    return parseStoredSession(
      JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
    ).state;
  }

  it("round-trips through the persisted-state schema, with and without a resolution", () => {
    const f = pendingState();
    const cont = f.continuation()!;
    expect(parse(f.state, f.db).turn.pendingBattleDamageContinuation).toEqual(cont);
    const resolved = {
      ...f.state,
      turn: {
        ...f.state.turn,
        pendingBattleDamageContinuation: { ...cont, resolution: "NOT_REPLACED" as const },
      },
    };
    expect(parse(resolved, f.db).turn.pendingBattleDamageContinuation).toMatchObject({
      resolution: "NOT_REPLACED",
    });
  });

  const malformed: Array<[string, (c: BattleKOReplacementContinuation) => unknown]> = [
    ["unknown stage", (c) => ({ ...c, stage: "CHARACTER_KO" })],
    ["missing targetInstanceId", (c) => ({ ...c, targetInstanceId: undefined })],
    ["bad causingPlayerIndex", (c) => ({ ...c, causingPlayerIndex: 2 })],
    ["bad resolution", (c) => ({ ...c, resolution: "MAYBE" })],
    ["non-boolean attackerIsCharacter", (c) => ({ ...c, attackerIsCharacter: "yes" })],
    ["extra Life field", (c) => ({ ...c, lifeCardInstanceId: "life-1" })],
  ];
  for (const [name, mutate] of malformed) {
    it(`rejects a malformed continuation: ${name}`, () => {
      const f = pendingState();
      const bad = {
        ...f.state,
        turn: { ...f.state.turn, pendingBattleDamageContinuation: mutate(f.continuation()!) },
      } as unknown as GameState;
      expect(() => parse(bad, f.db)).toThrow();
    });
  }

  it("is visible to both players and spectators, with no Life identity added", () => {
    const f = pendingState();
    const cont = f.continuation()!;
    expect(cont.stage).toBe("CHARACTER_KO_REPLACEMENT");
    expect(filterStateForPlayer(f.state, 0).turn.pendingBattleDamageContinuation).toEqual(cont);
    expect(filterStateForPlayer(f.state, 1).turn.pendingBattleDamageContinuation).toEqual(cont);
    expect(visibleStateForSpectator(f.state, f.db).turn.pendingBattleDamageContinuation).toEqual(cont);
  });
});

// ─── Review round 1 ──────────────────────────────────────────────────────────

/** Event types logged since `before` (the log length when the prompt was pending). */
function typesSince(f: Fixture, before: number): string[] {
  return f.state.eventLog.slice(before).map((e) => e.type);
}

describe("published event order after the prompt", () => {
  it("Franky accept: the substitute's Life events sit between COMBAT_VICTORY and END_OF_BATTLE", () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    const before = f.state.eventLog.length;
    f.accept();

    const after = typesSince(f, before);
    const at = (t: string) => after.indexOf(t);
    expect(after.slice(0, 3)).toEqual(["PHASE_CHANGED", "CHARACTER_BATTLES", "COMBAT_VICTORY"]);
    expect(f.state.eventLog[before].payload).toEqual({ from: "COUNTER_STEP", to: "DAMAGE_STEP" });
    for (const t of ["CARD_REMOVED_FROM_LIFE", "CARD_ADDED_TO_HAND_FROM_LIFE"]) {
      expect(after.filter((x) => x === t), t).toHaveLength(1);
      expect(at(t)).toBeGreaterThan(at("COMBAT_VICTORY"));
      expect(at(t)).toBeLessThan(at("END_OF_BATTLE"));
    }
  });

  it("PHASE_CHANGED COUNTER_STEP → DAMAGE_STEP is published exactly once for the paused battle", () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    const intoDamage = () =>
      f.state.eventLog.filter(
        (e) => e.type === "PHASE_CHANGED" && e.payload?.from === "COUNTER_STEP" && e.payload?.to === "DAMAGE_STEP",
      );
    expect(intoDamage()).toHaveLength(0);
    f.decline();
    expect(intoDamage()).toHaveLength(1);
  });

  // The resumed batch is published only after the substitute's own prompt
  // resolves, so a prompted substitute's events precede the Damage Step's.
  it("EB03-001 accept with a hand choice: CARD_TRASHED, then PHASE_CHANGED, CHARACTER_BATTLES, COMBAT_VICTORY, END_OF_BATTLE", () => {
    const f = fixture();
    vivi(f);
    const target = vanAugur(f);
    const hand = handCards(f, 0, 2);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    const before = f.state.eventLog.length;
    f.accept();
    f.ok(0, { type: "SELECT_TARGET", selectedInstanceIds: [hand[0].instanceId] });

    expect(typesSince(f, before).slice(0, 5)).toEqual([
      "CARD_TRASHED",
      "PHASE_CHANGED",
      "CHARACTER_BATTLES",
      "COMBAT_VICTORY",
      "END_OF_BATTLE",
    ]);
  });

  it("substitute events emitted before the substitute's own prompt are published, not dropped", () => {
    // Constructed: EB03-001 with DRAW 1 ahead of its hand trash. The resolver
    // frame carries the DRAW's events across the SELECT_TARGET prompt.
    const f = fixture();
    const schema = structuredClone(getEffectSchema("EB03-001")!);
    const block = schema.effects[0];
    if (block.category !== "replacement") throw new Error("shape");
    block.replacement_actions = [{ type: "DRAW", params: { amount: 1 } }, ...(block.replacement_actions ?? [])];
    f.data("EB03-001", { type: "Leader", cost: null, power: 5000, counter: null, life: 4, effectSchema: schema });
    f.put("EB03-001", 0, "LEADER");
    const target = vanAugur(f);
    const hand = handCards(f, 0, 2);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    const before = f.state.eventLog.length;
    f.accept();
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(f.state.players[0].hand).toHaveLength(3);
    f.ok(0, { type: "SELECT_TARGET", selectedInstanceIds: [hand[0].instanceId] });

    const after = typesSince(f, before);
    expect(after.filter((t) => t === "CARD_DRAWN")).toHaveLength(1);
    expect(after.indexOf("CARD_DRAWN")).toBeLessThan(after.indexOf("CARD_TRASHED"));
    expect(after.indexOf("CARD_TRASHED")).toBeLessThan(after.indexOf("COMBAT_VICTORY"));
    expectBattleClosedOnce(f);
  });
});

describe("an unmatched or unanswered continuation never finishes the battle", () => {
  for (const [name, patch] of [
    ["effect id", { replacementEffectId: "some-other-effect" }],
    ["target", { targetInstanceId: "some-other-character" }],
  ] as const) {
    it(`a REPLACEMENT answer for a different ${name} leaves the battle unresolved and discards the continuation`, () => {
      const f = fixture();
      const target = franky(f);
      f.battle(target, f.attacker());
      const battleId = pendingBattleId(f);
      const lifeBefore = f.state.players[0].life.length;
      f.state = {
        ...f.state,
        turn: {
          ...f.state.turn,
          pendingBattleDamageContinuation: { ...f.continuation()!, ...patch },
        },
      };
      f.accept();

      // The replacement itself still resolves (Life → hand) …
      expect(f.state.players[0].life).toHaveLength(lifeBefore - 1);
      // … but the unmatched continuation is not treated as a decline.
      expect(f.onField(target)).toBe(true);
      expect(f.events("CARD_KO")).toHaveLength(0);
      expect(f.events("COMBAT_VICTORY")).toHaveLength(0);
      expect(f.events("END_OF_BATTLE")).toHaveLength(0);
      expect(f.continuation() ?? null).toBeNull();
      expect(f.state.turn.battle?.battleId).toBe(battleId);
    });
  }

  it("an unanswered continuation with no prompt is discarded on the next resume, without K.O. or battle end", () => {
    // Constructed: the continuation's own prompt is replaced by an unrelated
    // one whose resume drains to an empty stack, so the end-of-resume
    // continuation loop meets the orphan with no resolution recorded.
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    f.state = {
      ...f.state,
      pendingPrompt: {
        options: { promptType: "OPTIONAL_EFFECT", effectDescription: "x", cards: [] },
        respondingPlayer: 0,
        resumeContext: { type: "REPLACEMENT", effectId: "unrelated", targetInstanceId: "none", event: "WOULD_BE_KO" },
      },
    };
    f.decline();

    expect(f.onField(target)).toBe(true);
    expect(f.events("CARD_KO")).toHaveLength(0);
    expect(f.events("END_OF_BATTLE")).toHaveLength(0);
    expect(f.continuation() ?? null).toBeNull();
  });
});

describe("a finished game never resumes the battle", () => {
  it("a watcher drawing the last deck card during the substitute ends the game with one GAME_OVER and no battle resume", () => {
    // Constructed registered schema: "When a card is trashed from your hand,
    // draw 1 card." With a 1-card deck, EB03-001's hand-trash substitute makes
    // the watcher draw the last card, so the controller loses before the
    // paused Damage Step could resume.
    const f = fixture();
    vivi(f);
    f.data("WATCHER", {
      cost: 1,
      power: 1000,
      effectSchema: {
        card_id: "WATCHER",
        card_name: "Watcher",
        card_type: "Character",
        effects: [
          {
            id: "draw_on_hand_trash",
            category: "auto",
            trigger: { event: "CARD_TRASHED_FROM_HAND", filter: { controller: "SELF" } },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      } as NonNullable<CardData["effectSchema"]>,
    });
    f.put("WATCHER", 0);
    const target = vanAugur(f);
    const hand = handCards(f, 0, 2);
    f.state.players[0].deck = f.state.players[0].deck.slice(0, 1);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    f.accept();
    while (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      f.ok(0, { type: "SELECT_TARGET", selectedInstanceIds: [hand[0].instanceId] });
    }
    while (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") f.accept();

    expect(f.state.status).toBe("FINISHED");
    expect(f.state.winner).toBe(1);
    expect(f.events("GAME_OVER")).toHaveLength(1);
    expect(f.events("COMBAT_VICTORY")).toHaveLength(0);
    expect(f.events("END_OF_BATTLE")).toHaveLength(0);
    expect(f.continuation() ?? null).toBeNull();
  });

  it("resumeBattleDamageContinuation drops even an answered continuation on a finished game", () => {
    // Unit-level: the lifecycle loop already stops on a terminal state; this
    // pins the function's own guard for its direct caller in the REPLACEMENT
    // branch.
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    const finished: GameState = {
      ...f.state,
      status: "FINISHED",
      winner: 1,
      pendingPrompt: null,
      turn: {
        ...f.state.turn,
        pendingBattleDamageContinuation: { ...f.continuation()!, resolution: "NOT_REPLACED" },
      },
    };
    const result = resumeBattleDamageContinuation(finished, f.db);
    expect(result.events).toEqual([]);
    expect(result.state.turn.pendingBattleDamageContinuation).toBeNull();
    expect(result.state.turn.battle).toEqual(finished.turn.battle);
    expect(result.state.players).toEqual(finished.players);
  });

  it("concede while the replacement prompt is pending clears the continuation", () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    pendingBattleId(f);
    expect(f.continuation()).not.toBeNull();

    f.ok(0, { type: "CONCEDE" });

    expect(f.state.status).toBe("FINISHED");
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.continuation() ?? null).toBeNull();
    expect(f.events("GAME_OVER")).toHaveLength(1);
  });
});
