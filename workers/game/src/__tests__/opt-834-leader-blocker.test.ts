/**
 * OPT-834 — all-names Leaders in OP16-048 / OP16-058, and Leader [Blocker].
 *
 * Card text (docs/cards/OP-16.md):
 *   OP16-048 Buggy: "[Once Per Turn] This effect can be activated when your
 *     opponent attacks. Up to 1 of your [Prisoner of Impel Down] cards gains
 *     [Blocker] during this turn."
 *   OP16-058 The Prisoners Are Rioting!!: "[Main] If you have 10 DON!! cards
 *     on your field, all of your [Prisoner of Impel Down] cards' base power
 *     becomes 7000 during this turn. [Counter] Up to 1 of your [Buggy] gains
 *     +4000 power during this battle."
 *
 * Rulings:
 *   - qa_op16.md / qa_op17.md p.9 (OP16-048): a Leader "treated as a card with
 *     all card names, types, and attributes" can gain [Blocker].
 *   - qa_op16.md (OP16-048): the attacked Prisoner given [Blocker] can use it
 *     against that attack.
 *   - qa_op16.md (OP16-058): such a Leader's base power becomes 7000.
 *   - Rules §10-1-4-1: the [Blocker] card is rested and takes the place of the
 *     card being attacked; §7-1-2-1: one [Blocker] per battle; §10-1-7-1:
 *     [Unblockable] prevents [Blocker].
 *
 * No card in the current pool carries the all-names Leader rule (repository
 * and data/vegapull-full grep for "all card names" hits only FAQs), so the
 * all-names Leader here is a fixture with the engine's
 * TREATED_AS_ALL_IDENTITIES rule modification (the OPT-227 encoding).
 *
 * Every flow runs the real action pipeline with the authored OP16 schemas
 * from the generated registry and completes each pending prompt.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectSchema, RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { validate } from "../engine/validation.js";
import { getBlockerCandidateIds } from "../engine/blocker-candidates.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectiveBasePower, getEffectivePower } from "../engine/modifiers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { SessionTransport } from "../session/transport.js";
import { validatePersistedGameStateCore } from "../session/persisted-game-state.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ALL_NAMES_LEADER = "OPT834-ALL-NAMES-LEADER";
const PLAIN_LEADER = "OPT834-PLAIN-LEADER";
const BUGGY_LEADER = "OPT834-BUGGY-LEADER";
const PRISONER = "OPT834-PRISONER";

const allNamesSchema: EffectSchema = {
  card_id: ALL_NAMES_LEADER,
  card_name: "All-Names Leader",
  card_type: "Leader",
  effects: [
    // A "when attacked" watcher on the Leader itself — proves the redirected
    // Leader becomes the final target for WHEN_ATTACKED (OPT-246).
    {
      id: "when_attacked_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKED" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
  rule_modifications: [
    { rule_type: "TREATED_AS_ALL_IDENTITIES", names: true, types: true, attributes: true },
  ],
};

type LeaderKind = "all-names" | "plain" | "buggy";

function fixture(leaderKind: LeaderKind = "all-names") {
  const db = createTestCardDb();
  const leaderId =
    leaderKind === "all-names" ? ALL_NAMES_LEADER : leaderKind === "plain" ? PLAIN_LEADER : BUGGY_LEADER;
  db.set(ALL_NAMES_LEADER, {
    ...CARDS.LEADER,
    id: ALL_NAMES_LEADER,
    name: "All-Names Leader",
    effectSchema: allNamesSchema,
  });
  db.set(PLAIN_LEADER, { ...CARDS.LEADER, id: PLAIN_LEADER, name: "Plain Leader" });
  db.set(BUGGY_LEADER, { ...CARDS.LEADER, id: BUGGY_LEADER, name: "Buggy" });
  db.set(PRISONER, { ...CARDS.VANILLA, id: PRISONER, name: "Prisoner of Impel Down" });
  for (const id of ["OP16-048", "OP16-058"]) {
    const schema = getEffectSchema(id)!;
    db.set(id, {
      ...(schema.card_type === "Event" ? CARDS.EVENT_COUNTER : CARDS.VANILLA),
      id,
      name: schema.card_name ?? id,
      cost: schema.card_type === "Event" ? 1 : 3,
      counter: null,
      effectText:
        schema.card_type === "Event"
          ? "[Main] ... [Counter] Up to 1 of your [Buggy] gains +4000 power during this battle."
          : "",
      effectSchema: schema,
    });
  }

  let state = createBattleReadyState(db);
  // Player 1 (defender) gets the Leader under test.
  state.players[1].leader = { ...state.players[1].leader, cardId: leaderId };
  state = registerCardEnteredField(state, state.players[1].leader, db.get(leaderId)!);
  state.players[1].characters = padChars([]);
  state.players[1].hand = [];

  const place = (cardId: string, owner: 0 | 1, suffix: string, extra: Partial<CardInstance> = {}) => {
    const card: CardInstance = {
      instanceId: `${cardId}-${owner}-${suffix}`,
      cardId,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: owner,
      owner,
      ...extra,
    };
    const slot = state.players[owner].characters.findIndex((c) => c === null);
    state.players[owner].characters[slot] = card;
    state = registerCardEnteredField(state, card, db.get(cardId)!);
    return card;
  };

  const buggy = place("OP16-048", 1, "buggy");
  const prisoner = place(PRISONER, 1, "prisoner");
  const charBlocker = place(CARDS.BLOCKER.id, 1, "blocker");
  // Rested so it is a legal attack target (§6-5-6-1: only rested Characters).
  const plainChar = place(CARDS.VANILLA.id, 1, "plain", { state: "RESTED" });

  function act(action: GameAction, player: 0 | 1) {
    const before = state.eventLog.length;
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
    return { ...r, events: state.eventLog.slice(before) };
  }
  function respond(action: GameAction) {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(r.responseRejected).toBe(false);
    state = r.state;
  }
  function attack(targetInstanceId: string, attackerInstanceId = "char-0-v1") {
    return act({ type: "DECLARE_ATTACK", attackerInstanceId, targetInstanceId }, 0);
  }
  /** Accept Buggy's optional [On Your Opponent's Attack] and choose `ids`. */
  function grantBlocker(ids: string[]): string[] {
    expect(state.pendingPrompt?.respondingPlayer).toBe(1);
    expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
    const options = state.pendingPrompt?.options;
    if (options?.promptType !== "SELECT_TARGET") throw new Error("expected Buggy target prompt");
    const valid = [...options.validTargets];
    respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });
    return valid;
  }
  function declineBuggy() {
    expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    respond({ type: "PASS" });
  }
  function settle() {
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
  }

  return {
    db,
    buggy,
    prisoner,
    charBlocker,
    plainChar,
    act,
    respond,
    attack,
    grantBlocker,
    declineBuggy,
    settle,
    get leader() {
      return state.players[1].leader;
    },
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

const declareBlocker = (blockerInstanceId: string): GameAction => ({
  type: "DECLARE_BLOCKER",
  blockerInstanceId,
});

describe("OPT-834 OP16-048 target domain", () => {
  it("offers an all-names Leader alongside Prisoner Characters, and nothing else", () => {
    const f = fixture("all-names");
    f.attack(f.plainChar.instanceId);
    const valid = f.grantBlocker([f.leader.instanceId]);
    expect(valid.sort()).toEqual([f.leader.instanceId, f.prisoner.instanceId].sort());
    f.settle();
  });

  it("does not offer a Leader without the all-names rule", () => {
    const f = fixture("plain");
    f.attack(f.plainChar.instanceId);
    const valid = f.grantBlocker([f.prisoner.instanceId]);
    expect(valid).toEqual([f.prisoner.instanceId]);
    f.settle();
    expect(getBlockerCandidateIds(f.state, f.db)).not.toContain(f.leader.instanceId);
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBe(
      "This card does not have [Blocker]",
    );
  });
});

describe("OPT-834 Leader [Blocker] legality and candidates", () => {
  it("active Leader with granted [Blocker] is a legal, offered Blocker", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.settle();
    expect(f.state.turn.battleSubPhase).toBe("BLOCK_STEP");
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBeNull();
    // Candidate surface: Leader + the ordinary printed Blocker; not the
    // Prisoner (no grant) or the vanilla Character.
    expect(getBlockerCandidateIds(f.state, f.db).sort()).toEqual(
      [f.leader.instanceId, f.charBlocker.instanceId].sort(),
    );
  });

  it("rested Leader with granted [Blocker] is rejected", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.state.players[1].leader = { ...f.state.players[1].leader, state: "RESTED" };
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBe("Blocker must be active");
    expect(getBlockerCandidateIds(f.state, f.db)).not.toContain(f.leader.instanceId);
  });

  it("all-names Leader without the grant is rejected", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.declineBuggy();
    f.settle();
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBe(
      "This card does not have [Blocker]",
    );
    expect(getBlockerCandidateIds(f.state, f.db)).toEqual([f.charBlocker.instanceId]);
  });

  it("granted to a Prisoner instead: the Leader stays ineligible", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.prisoner.instanceId]);
    expect(getBlockerCandidateIds(f.state, f.db).sort()).toEqual(
      [f.prisoner.instanceId, f.charBlocker.instanceId].sort(),
    );
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).not.toBeNull();
  });

  it("REMOVE_KEYWORD [Blocker] on the Leader overrides the grant", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    const removal: RuntimeActiveEffect = {
      id: "opt834-remove-blocker",
      sourceCardInstanceId: "char-0-v1",
      sourceEffectBlockId: "remove",
      category: "auto",
      modifiers: [{ type: "REMOVE_KEYWORD", params: { keyword: "BLOCKER" } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: f.state.turn.number },
      controller: 0,
      appliesTo: [f.leader.instanceId],
      timestamp: 9_999,
    } as RuntimeActiveEffect;
    f.state = { ...f.state, activeEffects: [...f.state.activeEffects, removal] };
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBe(
      "This card does not have [Blocker]",
    );
    expect(getBlockerCandidateIds(f.state, f.db)).not.toContain(f.leader.instanceId);
  });

  it("a negated Leader keeps an externally granted [Blocker] (OPT-253 parity)", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    const negate: RuntimeActiveEffect = {
      id: "opt834-negate-leader",
      sourceCardInstanceId: "char-0-v1",
      sourceEffectBlockId: "negate",
      category: "auto",
      modifiers: [{ type: "NEGATE_EFFECTS" }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: f.state.turn.number },
      controller: 0,
      appliesTo: [f.leader.instanceId],
      timestamp: 9_999,
    } as RuntimeActiveEffect;
    f.state = { ...f.state, activeEffects: [...f.state.activeEffects, negate] };
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBeNull();
  });

  it("a CANNOT_ACTIVATE_BLOCKER prohibition on the Leader removes it from the candidates and the pipeline", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    const prohibition = {
      id: "opt834-no-leader-block",
      sourceCardInstanceId: "char-0-v1",
      sourceEffectBlockId: "",
      prohibitionType: "CANNOT_ACTIVATE_BLOCKER",
      controller: 0,
      appliesTo: [f.leader.instanceId],
      scope: {},
      duration: { type: "THIS_TURN" },
      usesRemaining: null,
    } as unknown as GameState["prohibitions"][number];
    f.state = { ...f.state, prohibitions: [...f.state.prohibitions, prohibition] };
    expect(getBlockerCandidateIds(f.state, f.db)).toEqual([f.charBlocker.instanceId]);
    expect(runPipeline(f.state, declareBlocker(f.leader.instanceId), f.db, 1).valid).toBe(false);
  });

  it("[Unblockable] attacker rejects the Leader Blocker", () => {
    const f = fixture();
    const unblk: CardInstance = {
      instanceId: "char-0-unblk",
      cardId: CARDS.UNBLOCKABLE.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    f.state.players[0].characters[2] = unblk;
    f.attack(f.plainChar.instanceId, unblk.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    expect(validate(f.state, declareBlocker(f.leader.instanceId), f.db, 1)).toBe("Attacker has [Unblockable]");
    expect(getBlockerCandidateIds(f.state, f.db)).toEqual([]);
  });

  it("the attacking player cannot declare the defender's Leader, and stale declarations are rejected", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    const coordinator = new SessionCoordinator();
    const wrongPlayer = coordinator.executeAction(f.state, [], 0, declareBlocker(f.leader.instanceId), f.db);
    expect(wrongPlayer.kind).toBe("reject");
    // Attacker's own Leader is never a legal Blocker for the defender.
    expect(validate(f.state, declareBlocker(f.state.players[0].leader.instanceId), f.db, 1)).toBe(
      "Can only declare your own card as Blocker",
    );
    const ok = coordinator.executeAction(f.state, [], 1, declareBlocker(f.leader.instanceId), f.db);
    expect(ok.kind).toBe("applied");
    if (ok.kind !== "applied") return;
    // Block Step is over: a replayed / stale declaration is rejected.
    const replay = coordinator.executeAction(ok.state, [], 1, declareBlocker(f.leader.instanceId), f.db);
    expect(replay.kind).toBe("reject");
    const second = coordinator.executeAction(ok.state, [], 1, declareBlocker(f.charBlocker.instanceId), f.db);
    expect(second.kind).toBe("reject");
  });
});

describe("OPT-834 Leader Blocker redirect and battle resolution", () => {
  it("rests the Leader, retargets the battle, fires the Leader's [When Attacked], and deals Life damage", () => {
    const f = fixture();
    const handBefore = f.state.players[1].hand.length;
    const lifeBefore = f.state.players[1].life.length;
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.settle();

    const r = f.act(declareBlocker(f.leader.instanceId), 1);
    f.settle();
    expect(f.leader.state).toBe("RESTED");
    expect(f.state.turn.battle?.targetInstanceId).toBe(f.leader.instanceId);
    expect(f.state.turn.battle?.blockerActivated).toBe(true);
    expect(f.state.turn.battle?.defenderPower).toBe(5000);
    expect(f.state.turn.battleSubPhase).toBe("COUNTER_STEP");
    const events = r.events;
    expect(events.find((e) => e.type === "BLOCK_DECLARED")?.payload).toEqual({
      blockerInstanceId: f.leader.instanceId,
    });
    expect(events.find((e) => e.type === "ATTACK_TARGET_FINAL")?.payload).toMatchObject({
      attackerInstanceId: "char-0-v1",
      targetInstanceId: f.leader.instanceId,
    });
    // The Leader became the final target: its [When Attacked] draw resolved.
    expect(f.state.players[1].hand.length).toBe(handBefore + 1);

    // Counter Step pass → Damage Step: 4000 attacker vs 5000 Leader, no damage.
    f.act({ type: "PASS" }, 1);
    f.settle();
    expect(f.state.players[1].life.length).toBe(lifeBefore);
    expect(f.state.players[1].characters.some((c) => c?.instanceId === f.plainChar.instanceId)).toBe(true);
    expect(f.state.turn.battle).toBeNull();
  });

  it("a Leader Blocker that loses the battle takes Life damage (processed as a Leader target)", () => {
    const f = fixture();
    const lifeBefore = f.state.players[1].life.length;
    // 4000 + 2 DON on the attacker vs the 5000 Leader.
    f.act({ type: "ATTACH_DON", targetInstanceId: "char-0-v1", count: 2 }, 0);
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.act(declareBlocker(f.leader.instanceId), 1);
    f.settle();
    const r = f.act({ type: "PASS" }, 1);
    f.settle();
    expect(f.state.players[1].life.length).toBe(lifeBefore - 1);
    const damage = r.events.find((e) => e.type === "DAMAGE_DEALT");
    expect(damage?.payload).toMatchObject({ attackerInstanceId: "char-0-v1" });
    // The original target was never K.O.'d.
    expect(f.state.players[1].characters.some((c) => c?.instanceId === f.plainChar.instanceId)).toBe(true);
  });

  it("the attacked Leader may activate its granted [Blocker] against that attack (qa_op16.md OP16-048)", () => {
    const f = fixture();
    f.attack(f.leader.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.settle();
    expect(getBlockerCandidateIds(f.state, f.db)).toContain(f.leader.instanceId);
    f.act(declareBlocker(f.leader.instanceId), 1);
    f.settle();
    expect(f.leader.state).toBe("RESTED");
    expect(f.state.turn.battle?.targetInstanceId).toBe(f.leader.instanceId);
    expect(f.state.turn.battle?.blockerActivated).toBe(true);
  });

  it("an ordinary Character Blocker is unchanged", () => {
    const f = fixture();
    f.attack(f.leader.instanceId);
    f.declineBuggy();
    f.act(declareBlocker(f.charBlocker.instanceId), 1);
    f.settle();
    expect(f.state.turn.battle?.targetInstanceId).toBe(f.charBlocker.instanceId);
    expect(f.state.players[1].characters.find((c) => c?.instanceId === f.charBlocker.instanceId)?.state).toBe(
      "RESTED",
    );
    expect(f.leader.state).toBe("ACTIVE");
  });

  it("the grant expires at end of turn ('during this turn')", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.act({ type: "PASS" }, 1); // Block Step: no block
    f.act({ type: "PASS" }, 1); // Counter Step → damage
    f.settle();
    const grant = () =>
      f.state.activeEffects.some(
        (e) =>
          e.appliesTo?.includes(f.leader.instanceId) &&
          e.modifiers?.some((m) => m.type === "GRANT_KEYWORD" && m.params?.keyword === "BLOCKER"),
      );
    expect(grant()).toBe(true);
    while (f.state.turn.activePlayerIndex === 0) {
      f.act({ type: "ADVANCE_PHASE" }, 0);
      if (f.state.pendingPrompt) break;
    }
    expect(f.state.turn.activePlayerIndex).toBe(1);
    expect(grant()).toBe(false);
  });
});

describe("OPT-834 persisted and resumed Block Step", () => {
  it("keeps the Leader option across a persistence round trip and in the reconnect SELECT_BLOCKER prompt", () => {
    const f = fixture();
    f.attack(f.plainChar.instanceId);
    f.grantBlocker([f.leader.instanceId]);
    f.settle();

    const restored = JSON.parse(JSON.stringify(f.state)) as GameState;
    expect(validatePersistedGameStateCore(restored)).toBeNull();
    expect(getBlockerCandidateIds(restored, f.db)).toContain(f.leader.instanceId);

    const sent: string[] = [];
    const ws = {
      send: (p: string) => sent.push(p),
      close() {},
      serializeAttachment() {},
      deserializeAttachment: () => ({
        type: "game-session-player-socket",
        playerIndex: 1,
        connectionId: "c",
        acceptedAt: 1,
      }),
    };
    const socketState = {
      acceptWebSocket() {},
      getWebSockets: (tag?: string) => (tag === "player-1" ? [ws] : []),
      getTags: () => ["player-1"],
    };
    const transport = new SessionTransport(socketState as never, () => undefined, () => 1);
    transport.sendPendingPrompts(restored, f.db);
    const prompt = sent.map((s) => JSON.parse(s)).find((m) => m.type === "game:prompt");
    expect(prompt?.options.promptType).toBe("SELECT_BLOCKER");
    expect([...prompt.options.validTargets].sort()).toEqual(
      [f.leader.instanceId, f.charBlocker.instanceId].sort(),
    );

    // The resumed session still accepts the Leader declaration.
    f.state = restored;
    f.act(declareBlocker(f.leader.instanceId), 1);
    expect(f.state.turn.battle?.targetInstanceId).toBe(f.leader.instanceId);
  });
});

describe("OPT-834 OP16-058 The Prisoners Are Rioting!!", () => {
  function withEventInHand(f: ReturnType<typeof fixture>, don: number) {
    // Hand the Event to the all-names Leader's controller and make it their Main Phase.
    f.state.turn.activePlayerIndex = 1;
    f.state.players[1].donCostArea = Array.from({ length: don }, (_, i) => ({
      instanceId: `don-p1-x${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
    const ev: CardInstance = {
      instanceId: "opt834-rioting",
      cardId: "OP16-058",
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    f.state.players[1].hand = [ev];
    return ev;
  }
  const basePower = (f: ReturnType<typeof fixture>, card: CardInstance) =>
    getEffectiveBasePower(card, f.db.get(card.cardId)!, f.state, f.db);
  const power = (f: ReturnType<typeof fixture>, card: CardInstance) =>
    getEffectivePower(card, f.db.get(card.cardId)!, f.state, f.db);

  it("sets an all-names Leader's base power to 7000 and keeps other Leader modifiers additive", () => {
    const f = fixture("all-names");
    const ev = withEventInHand(f, 10);
    // An existing Leader power modifier: +1000 from an attached DON!! on its own turn.
    f.act({ type: "ATTACH_DON", targetInstanceId: f.leader.instanceId, count: 1 }, 1);
    expect(power(f, f.leader)).toBe(6000);
    f.act({ type: "PLAY_CARD", cardInstanceId: ev.instanceId }, 1);
    f.settle();
    expect(basePower(f, f.leader)).toBe(7000);
    expect(power(f, f.leader)).toBe(8000);
    expect(basePower(f, f.prisoner)).toBe(7000);
    expect(basePower(f, f.plainChar)).toBe(4000);
  });

  it("does not touch a Leader without the all-names rule", () => {
    const f = fixture("plain");
    const ev = withEventInHand(f, 10);
    f.act({ type: "PLAY_CARD", cardInstanceId: ev.instanceId }, 1);
    f.settle();
    expect(basePower(f, f.leader)).toBe(5000);
    expect(basePower(f, f.prisoner)).toBe(7000);
  });

  it("does nothing below 10 DON!!", () => {
    const f = fixture("all-names");
    const ev = withEventInHand(f, 9);
    f.act({ type: "PLAY_CARD", cardInstanceId: ev.instanceId }, 1);
    f.settle();
    expect(basePower(f, f.leader)).toBe(5000);
    expect(basePower(f, f.prisoner)).toBe(4000);
  });

  it.each([
    ["all-names", true],
    ["buggy", true],
    ["plain", false],
  ] as const)("[Counter] 'your [Buggy]' reaches a %s Leader: %s", (kind, reaches) => {
    const f = fixture(kind);
    f.attack(f.leader.instanceId);
    f.declineBuggy();
    f.act({ type: "PASS" }, 1); // no block
    const ev: CardInstance = {
      instanceId: "opt834-rioting-counter",
      cardId: "OP16-058",
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    f.state.players[1].hand = [ev];
    f.act({ type: "USE_COUNTER_EVENT", cardInstanceId: ev.instanceId, counterTargetInstanceId: f.leader.instanceId }, 1);
    const options = f.state.pendingPrompt?.options;
    if (options?.promptType !== "SELECT_TARGET") throw new Error("expected Counter target prompt");
    // Buggy (OP16-048) is on the field and always a legal [Buggy] target.
    expect(options.validTargets).toContain(f.buggy.instanceId);
    expect(options.validTargets.includes(f.leader.instanceId)).toBe(reaches);
    expect(options.validTargets).not.toContain(f.prisoner.instanceId);
    if (!reaches) return;
    f.respond({ type: "SELECT_TARGET", selectedInstanceIds: [f.leader.instanceId] });
    f.settle();
    expect(power(f, f.leader)).toBe(9000);
  });
});
