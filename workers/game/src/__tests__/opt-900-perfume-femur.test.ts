import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { checkProhibitions } from "../engine/prohibitions.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectivePower, hasGrantedKeyword } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { isBlockerProhibited } from "../../../../shared/blocker-prohibition.js";

// OP07-057: docs/cards/OP-07.md — select up to 1 Warlord Leader/Character,
// +2000 this turn; if that selected card attacks this turn, the opponent
// cannot activate Blocker. This is a prohibition, not a keyword grant.
// Analogous FAQ: ST21-003 and ST01-016 allow Blocker against other attackers.
// Rules 7-1-2 / 10-1-4-1 place Blocker in the current battle's Block Step.

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
      instanceId: `opt900-${controller}-${serial++}`,
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
    select: (ids: string[]) => respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }),
    get state() {
      return state;
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
  const types = ["The Seven Warlords of the Sea"];
  f.data("WARLORD-L", { type: "Leader", power: 5000, types });
  f.data("WARLORD-C", { power: 5000, types });
  f.data("OP07-057", { type: "Event", cost: 1, power: null, counter: null, effectText: "[Main] Select up to 1 ..." });
  const leader = f.put("WARLORD-L", owner, "LEADER");
  const character = f.put("WARLORD-C", owner);
  const event = f.put("OP07-057", owner, "HAND");
  return { f, leader, character, event, ...board(f) };
}

function play(f: Fixture, event: CardInstance, selected: CardInstance[]) {
  f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  f.select(selected.map((card) => card.instanceId));
  expect(f.state.pendingPrompt).toBeNull();
}

describe("OPT-900 Perfume Femur binds a Blocker prohibition to the selected attacker", () => {
  for (const owner of [0, 1] as const) {
    for (const recipient of ["leader", "character"] as const) {
      it(`player ${owner}, selected ${recipient}: power and Blocker ban follow only the selection without a keyword grant`, () => {
        const s = setup(owner);
        const { f, event, blocker, targets } = s;
        const chosen = s[recipient];
        const unchosen = recipient === "leader" ? s.character : s.leader;
        play(f, event, [chosen]);
        expect(getEffectivePower(liveCard(f, chosen), f.db.get(chosen.cardId)!, f.state, f.db)).toBe(7000);
        expect(getEffectivePower(liveCard(f, unchosen), f.db.get(unchosen.cardId)!, f.state, f.db)).toBe(5000);
        expect(hasGrantedKeyword(liveCard(f, chosen), "UNBLOCKABLE", f.state, f.db)).toBe(false);
        expect(blockerProhibitions(f)).toMatchObject([
          { controller: owner, attackerInstanceIds: [chosen.instanceId] },
        ]);
        expect(attackAndProbeBlocker(f, unchosen, targets[0], blocker).blockerAllowed).toBe(true);
        expect(attackAndProbeBlocker(f, chosen, targets[1], blocker).blockerAllowed).toBe(false);
        toOwnersNextMain(f);
        expect(blockerProhibitions(f)).toEqual([]);
        expect(getEffectivePower(liveCard(f, chosen), f.db.get(chosen.cardId)!, f.state, f.db)).toBe(5000);
        expect(attackAndProbeBlocker(f, chosen, targets[2], blocker).blockerAllowed).toBe(true);
      });
    }

    it(`player ${owner}: selecting zero cards applies neither power nor a blanket Blocker ban`, () => {
      const { f, event, leader, character, blocker, targets } = setup(owner);
      play(f, event, []);
      expect(blockerProhibitions(f)).toEqual([]);
      for (const card of [leader, character]) {
        expect(getEffectivePower(liveCard(f, card), f.db.get(card.cardId)!, f.state, f.db)).toBe(5000);
        expect(hasGrantedKeyword(liveCard(f, card), "UNBLOCKABLE", f.state, f.db)).toBe(false);
      }
      expect(attackAndProbeBlocker(f, leader, targets[0], blocker).blockerAllowed).toBe(true);
      expect(attackAndProbeBlocker(f, character, targets[1], blocker).blockerAllowed).toBe(true);
    });
  }
});
