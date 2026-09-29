import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import { getNestedActions, type Action, type RuntimeProhibition } from "../engine/effect-types.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { checkProhibitions } from "../engine/prohibitions.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { transitionCard } from "../engine/zone-transition.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { SessionTransport } from "../session/transport.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { isBlockerProhibited } from "../../../../shared/blocker-prohibition.js";

// OPT-826 — "if the selected card attacks, your opponent cannot activate
// [Blocker]" binds to the exact attacker, frozen when the effect resolves.
//
// Printed text (docs/cards):
// - ST21-003 Sanji (ST-21.md:20): "[On Play] Select up to 1 of your {Straw Hat
//   Crew} type Characters with 6000 power or more. If the selected Character
//   attacks during this turn, your opponent cannot activate [Blocker]."
// - OP12-016 (OP-12.md:88): "[Main] You may give 2 active DON!! cards to 1 of
//   your [Silvers Rayleigh]: Your opponent cannot activate [Blocker] when the
//   card given these DON!! cards attacks during this turn."
// - OP12-077 (OP-12.md:464): "[Main] Select up to 1 of your [Trafalgar Law]
//   cards and that card gains +2000 power during this turn. Then, if the
//   selected card attacks during this turn, your opponent cannot activate
//   [Blocker]."
// Rulings: qa_st-21.md ST21-003 — after the selected Character finishes
// attacking, another Character or Leader attacking in the same turn CAN be
// blocked; qa_st-01-st-04.md ST01-016 (same wording) — Blocker is allowed
// "because it is not during the battle in which the Character you selected ...
// is attacking". Rules 7-1-2 / 10-1-4-1 (Blocker is activated in the Block
// Step of the battle being fought), 3-1-6 (a card that leaves the field and
// returns is a new card; effects on it are not carried over).

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
      instanceId: `opt826-${controller}-${serial++}`,
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

const STRAW_HAT = { types: ["Straw Hat Crew"], power: 6000 };

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

function liveCard(f: Fixture, card: CardInstance) {
  const p = f.state.players[card.controller];
  return p.leader.instanceId === card.instanceId
    ? p.leader
    : p.characters.find((c) => c?.instanceId === card.instanceId)!;
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

// ─── ST21-003 Sanji ─────────────────────────────────────────────────────────

function sanjiSetup(owner: P) {
  const f = fixture(owner);
  f.data("ST21-003", { cost: 1, power: 5000, types: ["Straw Hat Crew"], effectText: "[On Play] Select up to 1 ..." });
  f.data("SH-6000", STRAW_HAT);
  const chosen = f.put("SH-6000", owner);
  const unchosen = f.put("SH-6000", owner);
  const sanji = f.put("ST21-003", owner, "HAND");
  return { f, chosen, unchosen, sanji, ...board(f) };
}

function playSanji(f: Fixture, sanji: CardInstance, pick: CardInstance[]) {
  f.act({ type: "PLAY_CARD", cardInstanceId: sanji.instanceId });
  f.select(pick.map((c) => c.instanceId));
  expect(f.state.pendingPrompt).toBeNull();
}

describe("OPT-826 ST21-003 Sanji binds the Blocker lock to the selected attacker", () => {
  for (const owner of [0, 1] as const) {
    it(`player ${owner}: only the selected Character's attacks are unblockable; the unselected one and the Leader can be blocked`, () => {
      const { f, chosen, unchosen, sanji, blocker, targets } = sanjiSetup(owner);
      playSanji(f, sanji, [chosen]);
      const [entry] = blockerProhibitions(f);
      expect(entry).toMatchObject({ controller: owner, appliesTo: [], attackerInstanceIds: [chosen.instanceId] });

      expect(attackAndProbeBlocker(f, unchosen, targets[0], blocker).blockerAllowed).toBe(true);
      expect(attackAndProbeBlocker(f, chosen, targets[1], blocker).blockerAllowed).toBe(false);
      expect(
        attackAndProbeBlocker(f, f.state.players[owner].leader, targets[2], blocker).blockerAllowed,
      ).toBe(true);
    });
  }

  it("selecting none creates no prohibition at all", () => {
    const { f, chosen, sanji, blocker, targets } = sanjiSetup(0);
    playSanji(f, sanji, []);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(true);
  });

  it("does not cover a selected Character that left the field and returned (new card, §3-1-6)", () => {
    const { f, chosen, sanji, blocker, targets } = sanjiSetup(0);
    playSanji(f, sanji, [chosen]);
    const toHand = transitionCard(f.state, chosen.instanceId, "HAND");
    f.state = toHand!.state;
    const back = transitionCard(f.state, toHand!.card.instanceId, "CHARACTER", { turnPlayed: 1 });
    f.state = back!.state;
    const returned = back!.card as CardInstance;
    expect(returned.instanceId).not.toBe(chosen.instanceId);
    expect(blockerProhibitions(f)).toHaveLength(1);
    expect(attackAndProbeBlocker(f, returned, targets[0], blocker).blockerAllowed).toBe(true);
  });

  it("expires at end of turn: the same Character attacking next turn can be blocked", () => {
    const { f, chosen, sanji, blocker, targets } = sanjiSetup(0);
    playSanji(f, sanji, [chosen]);
    expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(false);
    toOwnersNextMain(f);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(liveCard(f, chosen).state).toBe("ACTIVE");
    expect(attackAndProbeBlocker(f, chosen, targets[1], blocker).blockerAllowed).toBe(true);
  });

  it("survives a serialized resume, both mid-selection and after the prohibition is applied", () => {
    const { f, chosen, unchosen, sanji, blocker, targets } = sanjiSetup(1);
    f.act({ type: "PLAY_CARD", cardInstanceId: sanji.instanceId });
    f.persist();
    f.select([chosen.instanceId]);
    f.persist();
    expect(blockerProhibitions(f)[0].attackerInstanceIds).toEqual([chosen.instanceId]);
    expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(false);
    f.persist();
    expect(attackAndProbeBlocker(f, unchosen, targets[1], blocker).blockerAllowed).toBe(true);
  });
});

// ─── OP12-016 To Never Doubt--That Is Power! ───────────────────────────────

function rayleighSetup(owner: P) {
  const f = fixture(owner);
  f.data("OP12-001", { type: "Leader", name: "Silvers Rayleigh", cost: 0, power: 5000, color: ["Red"] });
  f.data("OP09-005", { name: "Silvers Rayleigh", cost: 5, power: 6000, effectSchema: null });
  f.data("OP12-016", { type: "Event", cost: 0, power: null, counter: null, effectText: "[Main] You may give 2 active DON!! cards to 1 of your [Silvers Rayleigh]: ..." });
  const leader = f.put("OP12-001", owner, "LEADER");
  const rayleigh = f.put("OP09-005", owner);
  const event = f.put("OP12-016", owner, "HAND");
  return { f, leader, rayleigh, event, ...board(f) };
}

describe("OPT-826 OP12-016 binds the Blocker lock to the card given the DON!!", () => {
  for (const owner of [0, 1] as const) {
    for (const recipient of ["leader", "rayleigh"] as const) {
      it(`player ${owner}: DON!! to the ${recipient} — only it is unblockable; the other [Silvers Rayleigh] can be blocked`, () => {
        const s = rayleighSetup(owner);
        const { f, event, blocker, targets } = s;
        const given = s[recipient];
        const notGiven = recipient === "leader" ? s.rayleigh : s.leader;
        f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
        f.accept();
        f.persist(); // serialized resume while the cost recipient prompt is open
        f.select([given.instanceId]);
        expect(f.state.pendingPrompt).toBeNull();
        expect(liveCard(f, given).attachedDon).toHaveLength(2);
        const [entry] = blockerProhibitions(f);
        expect(entry).toMatchObject({ controller: owner, appliesTo: [], attackerInstanceIds: [given.instanceId] });

        expect(attackAndProbeBlocker(f, notGiven, targets[0], blocker).blockerAllowed).toBe(true);
        f.persist();
        expect(attackAndProbeBlocker(f, given, targets[1], blocker).blockerAllowed).toBe(false);
      });
    }
  }

  it("declining the cost applies no prohibition", () => {
    const { f, leader, rayleigh, event, blocker, targets } = rayleighSetup(0);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.decline();
    expect(f.state.pendingPrompt).toBeNull();
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, rayleigh, targets[0], blocker).blockerAllowed).toBe(true);
    expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(true);
  });

  it("expires at end of turn", () => {
    const { f, rayleigh, event, blocker, targets } = rayleighSetup(0);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.accept();
    f.select([rayleigh.instanceId]);
    expect(attackAndProbeBlocker(f, rayleigh, targets[0], blocker).blockerAllowed).toBe(false);
    toOwnersNextMain(f);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, rayleigh, targets[1], blocker).blockerAllowed).toBe(true);
  });
});

// ─── OP12-077 Extinguishes All Sound ───────────────────────────────────────

function lawSetup(owner: P) {
  const f = fixture(owner);
  f.data("LAW-L", { type: "Leader", name: "Trafalgar Law", cost: 0, power: 5000 });
  f.data("LAW-C", { name: "Trafalgar Law", cost: 5, power: 6000 });
  f.data("OP12-077", { type: "Event", cost: 0, power: null, counter: null, effectText: "[Main] Select up to 1 of your [Trafalgar Law] cards ..." });
  const leader = f.put("LAW-L", owner, "LEADER");
  const law = f.put("LAW-C", owner);
  const event = f.put("OP12-077", owner, "HAND");
  return { f, leader, law, event, ...board(f) };
}

describe("OPT-826 OP12-077 binds the Blocker lock to the selected [Trafalgar Law]", () => {
  for (const owner of [0, 1] as const) {
    it(`player ${owner}: the selected Law is unblockable, the other Law is not`, () => {
      const { f, leader, law, event, blocker, targets } = lawSetup(owner);
      f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
      f.persist(); // resume with the selection prompt open
      f.select([law.instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      // The +2000 and the Blocker binding land on the same selected card.
      expect(getEffectivePower(liveCard(f, law), f.db.get(law.cardId)!, f.state, f.db)).toBe(8000);
      expect(getEffectivePower(liveCard(f, leader), f.db.get(leader.cardId)!, f.state, f.db)).toBe(5000);
      const [entry] = blockerProhibitions(f);
      expect(entry).toMatchObject({ controller: owner, appliesTo: [], attackerInstanceIds: [law.instanceId] });

      expect(attackAndProbeBlocker(f, leader, targets[0], blocker).blockerAllowed).toBe(true);
      f.persist();
      expect(attackAndProbeBlocker(f, law, targets[1], blocker).blockerAllowed).toBe(false);
    });
  }

  it("selecting no Law creates no prohibition (no blanket Blocker lock)", () => {
    const { f, leader, law, event, blocker, targets } = lawSetup(0);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.select([]);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, law, targets[0], blocker).blockerAllowed).toBe(true);
    expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(true);
  });

  it("expires at end of turn", () => {
    const { f, leader, event, blocker, targets } = lawSetup(0);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.select([leader.instanceId]);
    expect(attackAndProbeBlocker(f, leader, targets[0], blocker).blockerAllowed).toBe(false);
    toOwnersNextMain(f);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(true);
  });
});

// ─── Blanket and other Blocker prohibitions keep their behavior ───────────

describe("OPT-826 blanket Blocker prohibitions are unaffected", () => {
  it("P-097 Shanks still locks Blocker for every attack this turn", () => {
    const f = fixture(0);
    f.data("P-097", { cost: 1, power: 5000, effectText: "[On Play]/[When Attacking] Your opponent cannot activate [Blocker] during this turn." });
    const a = f.put(CARDS.VANILLA.id, 0);
    const shanks = f.put("P-097", 0, "HAND");
    const { blocker, targets } = board(f);
    f.act({ type: "PLAY_CARD", cardInstanceId: shanks.instanceId });
    expect(blockerProhibitions(f)[0].attackerInstanceIds).toBeUndefined();
    expect(attackAndProbeBlocker(f, a, targets[0], blocker).blockerAllowed).toBe(false);
    expect(attackAndProbeBlocker(f, f.state.players[0].leader, targets[1], blocker).blockerAllowed).toBe(false);
  });
});

// ─── CANNOT_ATTACK's when_attacking (attack target) is unchanged ─────────

describe("OPT-826 CANNOT_ATTACK when_attacking keeps its attack-target meaning", () => {
  it("OP06-style 'cannot attack the opponent's Leader' still gates only Leader attacks", () => {
    const f = fixture(0);
    const attacker = f.put(CARDS.VANILLA.id, 0);
    const { targets } = board(f);
    const entry: RuntimeProhibition = {
      id: "p-attack",
      sourceCardInstanceId: attacker.instanceId,
      sourceEffectBlockId: "",
      prohibitionType: "CANNOT_ATTACK",
      scope: { controller: "SELF", when_attacking: { type: "OPPONENT_LEADER" } },
      duration: { type: "THIS_TURN" },
      controller: 0,
      appliesTo: [],
      usesRemaining: null,
    };
    f.state = { ...f.state, prohibitions: [entry] };
    const atLeader: GameAction = {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    };
    const atChar: GameAction = { ...atLeader, targetInstanceId: targets[0].instanceId };
    expect(checkProhibitions(f.state, atLeader, f.db, 0)).not.toBeNull();
    expect(checkProhibitions(f.state, atChar, f.db, 0)).toBeNull();
  });
});

// ─── Schema contract: lint and authored inventory ─────────────────────────

const BLOCKER_TYPES = new Set(["CANNOT_ACTIVATE_BLOCKER", "CANNOT_BLOCK", "CANNOT_USE_BLOCKER"]);

function walk(actions: Action[] | undefined, visit: (a: Action) => void) {
  for (const action of actions ?? []) {
    visit(action);
    walk(getNestedActions(action), visit);
  }
}

describe("OPT-826 attacker-binding schema contract", () => {
  it("only ST21-003, OP12-016 and OP12-077 carry an attacker binding among authored Blocker prohibitions", () => {
    const uses: string[] = [];
    const bound: string[] = [];
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      for (const block of schema.effects) {
        walk(block.actions, (action) => {
          if (action.type !== "APPLY_PROHIBITION") return;
          const params = action.params;
          if (!params || !BLOCKER_TYPES.has(params.prohibition_type)) return;
          uses.push(cardId);
          if (params.scope?.when_attacking?.type === "SELECTED_CARDS") bound.push(cardId);
        });
        for (const p of block.prohibitions ?? []) {
          if (BLOCKER_TYPES.has(p.type)) uses.push(`${cardId}(permanent)`);
        }
      }
    }
    expect(bound.sort()).toEqual(["OP12-016", "OP12-077", "ST21-003"]);
    // Inventory size at this change; a new Blocker prohibition should be
    // classified (bound vs blanket) deliberately.
    expect(uses).toHaveLength(20);
  });

  const base = (action: Record<string, unknown>) => ({
    card_id: "TEST-826",
    card_name: "Test",
    card_type: "Event",
    effects: [{ id: "main", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [action] }],
  });
  const bindingOf = (errors: string[]) => errors.filter((e) => e.includes("when_attacking") || e.includes("scope.controller"));

  it("accepts the three authored shapes", () => {
    for (const id of ["ST21-003", "OP12-016", "OP12-077"]) {
      expect(validateEffectSchema(getEffectSchema(id), id)).toEqual([]);
    }
  });

  it("rejects a binding on another prohibition type, both ref and target, neither, extra keys, and a non-opponent scope", () => {
    const sel = { type: "SELECTED_CARDS" };
    expect(bindingOf(validateEffectSchema(base({
      type: "APPLY_PROHIBITION",
      target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
      params: { prohibition_type: "CANNOT_ATTACK", scope: { controller: "OPPONENT", when_attacking: sel } },
    })))).toEqual([expect.stringContaining("only supported on CANNOT_ACTIVATE_BLOCKER")]);
    expect(bindingOf(validateEffectSchema(base({
      type: "APPLY_PROHIBITION",
      target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
      params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER", scope: { controller: "OPPONENT", when_attacking: { ...sel, ref: "__cost_don_given" } } },
    })))).toEqual([expect.stringContaining("not both")]);
    expect(bindingOf(validateEffectSchema(base({
      type: "APPLY_PROHIBITION",
      params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER", scope: { controller: "OPPONENT", when_attacking: sel } },
    })))).toEqual([expect.stringContaining("which is missing")]);
    expect(bindingOf(validateEffectSchema(base({
      type: "APPLY_PROHIBITION",
      params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER", scope: { controller: "OPPONENT", when_attacking: { ...sel, ref: "__cost_don_given", filter: { name: "X" } } } },
    })))).toEqual([expect.stringContaining("accepts only 'type' and 'ref'")]);
    expect(bindingOf(validateEffectSchema(base({
      type: "APPLY_PROHIBITION",
      params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER", scope: { when_attacking: { ...sel, ref: "__cost_don_given" } } },
    })))).toEqual([expect.stringContaining("set controller 'OPPONENT'")]);
  });

  it("counts a when_attacking ref as consuming its result_ref", () => {
    const schema = {
      ...base({}),
      effects: [{
        id: "main",
        category: "auto",
        trigger: { keyword: "MAIN_EVENT" },
        actions: [
          { type: "MODIFY_POWER", target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } }, params: { amount: 1000 }, duration: { type: "THIS_TURN" }, result_ref: "picked" },
          { type: "APPLY_PROHIBITION", params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER", scope: { controller: "OPPONENT", when_attacking: { type: "SELECTED_CARDS", ref: "picked" } } }, duration: { type: "THIS_TURN" }, chain: "THEN" },
        ],
      }],
    };
    expect(validateEffectSchema(schema, "TEST-826")).toEqual([]);
    const dangling = structuredClone(schema);
    (dangling.effects[0].actions[1] as { params: { scope: { when_attacking: { ref: string } } } }).params.scope.when_attacking.ref = "missing";
    expect(validateEffectSchema(dangling, "TEST-826")).toEqual(
      expect.arrayContaining([expect.stringContaining("'missing' has no matching result_ref")]),
    );
  });
});

// ─── Worker SELECT_BLOCKER prompt (transport) ─────────────────────────────

/**
 * The prompt the defender receives in the Block Step via
 * SessionTransport.sendPendingPrompts — the same path GameSession uses after
 * every action and on (re)connect.
 */
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

describe("OPT-826 the worker's SELECT_BLOCKER prompt hides exactly the prohibited blockers", () => {
  for (const owner of [0, 1] as const) {
    it(`player ${owner}: bound attacker → blocker absent; unbound attacker → present`, () => {
      const { f, chosen, unchosen, sanji, blocker, targets } = sanjiSetup(owner);
      const vanilla = f.put(CARDS.VANILLA.id, other(owner));
      playSanji(f, sanji, [chosen]);

      declareAttack(f, unchosen, targets[0]);
      expect(blockerPrompt(f)).toEqual(expect.arrayContaining([blocker.instanceId, vanilla.instanceId]));
      f.act({ type: "PASS" }, other(owner));
      for (let i = 0; i < 6 && f.state.turn.battleSubPhase; i++) f.act({ type: "PASS" }, other(owner));

      declareAttack(f, chosen, targets[1]);
      const valid = blockerPrompt(f);
      expect(valid).not.toContain(blocker.instanceId);
      expect(valid).not.toContain(vanilla.instanceId);
    });
  }

  it("survives a serialized resume in the Block Step", () => {
    const { f, chosen, sanji, blocker, targets } = sanjiSetup(0);
    playSanji(f, sanji, [chosen]);
    declareAttack(f, chosen, targets[0]);
    f.persist();
    expect(blockerPrompt(f)).not.toContain(blocker.instanceId);
  });

  it("a blanket P-097 ban leaves no candidates; the prompt is still sent (optional), as with no active Characters", () => {
    const f = fixture(0);
    f.data("P-097", { cost: 1, power: 5000, effectText: "[On Play]/[When Attacking] Your opponent cannot activate [Blocker] during this turn." });
    const attacker = f.put(CARDS.VANILLA.id, 0);
    const shanks = f.put("P-097", 0, "HAND");
    const { blocker, targets } = board(f);
    f.act({ type: "PLAY_CARD", cardInstanceId: shanks.instanceId });
    declareAttack(f, attacker, targets[0]);
    expect(blockerPrompt(f)).toEqual([]);
    expect(blocker.state).toBe("ACTIVE");
  });

  it("without any prohibition every ACTIVE Character remains a candidate (set otherwise unchanged)", () => {
    const f = fixture(0);
    const attacker = f.put(CARDS.VANILLA.id, 0);
    const { blocker, targets } = board(f);
    const vanilla = f.put(CARDS.VANILLA.id, 1);
    declareAttack(f, attacker, targets[0]);
    expect(new Set(blockerPrompt(f))).toEqual(new Set([blocker.instanceId, vanilla.instanceId]));
  });
});
