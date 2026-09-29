import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { checkProhibitions } from "../engine/prohibitions.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { isBlockerProhibited } from "../../../../shared/blocker-prohibition.js";

// OPT-898 — ST01-016 Diable Jambe binds its Blocker ban to the selected attacker.
// [Main] Select up to 1 of your {Straw Hat Crew} type Leader or Character
// cards. Your opponent cannot activate [Blocker] if that Leader or Character
// attacks during this turn.
// FAQ (qa_st-01-st-04.md:75): another Character attacking after the selected
// one has attacked can be blocked ("not during the battle in which the
// Character you selected ... is attacking"). Same mechanism as OPT-826.

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


function setup(owner: P) {
  const f = fixture(owner);
  f.data("ST01-016", { type: "Event", cost: 1, power: null, counter: null, effectText: "[Main] Select up to 1 of your {Straw Hat Crew} ..." });
  f.data("SH-L", { type: "Leader", cost: 0, power: 5000, types: ["Straw Hat Crew"] });
  f.data("SH-C", { cost: 3, power: 5000, types: ["Straw Hat Crew"] });
  const leader = f.put("SH-L", owner, "LEADER");
  const chosen = f.put("SH-C", owner);
  const other2 = f.put("SH-C", owner);
  const event = f.put("ST01-016", owner, "HAND");
  return { f, leader, chosen, other2, event, ...board(f) };
}

function play(f: Fixture, event: CardInstance, pick: CardInstance[]) {
  f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  f.persist();
  f.select(pick.map((c) => c.instanceId));
  expect(f.state.pendingPrompt).toBeNull();
}

describe("OPT-898 ST01-016 binds the Blocker lock to the selected attacker", () => {
  for (const owner of [0, 1] as const) {
    it(`player ${owner}: selected Character is unblockable; another Character and the Leader can be blocked, including after the selected one attacked`, () => {
      const { f, leader, chosen, other2, event, blocker, targets } = setup(owner);
      play(f, event, [chosen]);
      const [entry] = blockerProhibitions(f);
      expect(entry).toMatchObject({ controller: owner, appliesTo: [], attackerInstanceIds: [chosen.instanceId] });
      expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(false);
      // Another attacker after the selected one has attacked: blockable (FAQ).
      expect(attackAndProbeBlocker(f, other2, targets[1], blocker).blockerAllowed).toBe(true);
      expect(attackAndProbeBlocker(f, leader, targets[2], blocker).blockerAllowed).toBe(true);
    });

    it(`player ${owner}: a selected Leader is unblockable, a Character can be blocked`, () => {
      const { f, leader, chosen, event, blocker, targets } = setup(owner);
      play(f, event, [leader]);
      expect(blockerProhibitions(f)[0].attackerInstanceIds).toEqual([leader.instanceId]);
      expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(true);
      expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(false);
    });
  }

  it("the SELECT_BLOCKER candidates exclude the prohibited blocker for the selected attacker only", () => {
    const { f, chosen, other2, event, blocker, targets } = setup(0);
    play(f, event, [chosen]);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: chosen.instanceId, targetInstanceId: targets[0].instanceId });
    expect(checkProhibitions(f.state, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId }, f.db, 1)).not.toBeNull();
    for (let i = 0; i < 6 && f.state.turn.battleSubPhase; i++) f.act({ type: "PASS" }, 1);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: other2.instanceId, targetInstanceId: targets[1].instanceId });
    expect(checkProhibitions(f.state, { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId }, f.db, 1)).toBeNull();
  });

  it("selecting none creates no prohibition (no blanket Blocker lock)", () => {
    const { f, leader, chosen, event, blocker, targets } = setup(0);
    play(f, event, []);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(true);
    expect(attackAndProbeBlocker(f, leader, targets[1], blocker).blockerAllowed).toBe(true);
  });

  it("expires at end of turn: the same card attacking next turn can be blocked", () => {
    const { f, chosen, event, blocker, targets } = setup(0);
    play(f, event, [chosen]);
    expect(attackAndProbeBlocker(f, chosen, targets[0], blocker).blockerAllowed).toBe(false);
    toOwnersNextMain(f);
    expect(blockerProhibitions(f)).toEqual([]);
    expect(attackAndProbeBlocker(f, chosen, targets[1], blocker).blockerAllowed).toBe(true);
  });
});
