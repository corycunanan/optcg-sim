/**
 * Timing baseline F5-F8 (README §2). Oracle = README, never the engine.
 *
 * F5  Rule 7-1-4-1-1-2 (line 670), 8-6-2-1 (line 864), 8-6-2 (line 862);
 *     FAQ qa_op03.md:92-96, qa_op13.md:13-15.
 * F6  Rules 8-6-2, 8-6-2-1; FAQ qa_op13.md:13-15.
 * F7  OP05-098 text, rule 8-6-2 (line 862), 7-1-4-1-1-3 (line 672); FAQ qa_op05.md:237-239.
 * F8  Rule 7-1-4-1-1-3 (line 672), 8-6-2-1 (line 864), 7-1-4-1-1-1 (line 668);
 *     FAQ qa_op03.md OP03-118, qa_rules.md:156-158.
 */
import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameEvent, GameState, LifeCard, PlayerState } from "../../types.js";
import type { EffectBlock } from "../../engine/effect-types.js";
import { registerTriggersForCard } from "../../engine/triggers.js";
import { SessionCoordinator } from "../../session/coordinator.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

const NO_KW = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

function synCard(id: string, over: Partial<CardData>, block?: EffectBlock): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 2000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: { ...NO_KW },
    effectSchema: block ? { card_id: id, card_name: id, card_type: over.type ?? "Character", effects: [block] } : null,
    imageUrl: null,
    ...over,
  };
}

/** Stands in for any [Trigger] Life card whose own event is distinct (ADD_TO_LIFE_FROM_DECK). */
export const SYN_TRIGGER_LIFE = synCard(
  "SYN-TRIGGER-LIFE",
  { triggerText: "[Trigger] Add 1 from deck to Life.", keywords: { ...NO_KW, trigger: true } },
  {
    id: "syn_trigger_life",
    category: "auto",
    trigger: { keyword: "TRIGGER" },
    actions: [{ type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN" } }],
  },
);

/** Stands in for OP03-040 Nami (no DON requirement, not optional). */
const SYN_NAMI = synCard(
  "SYN-NAMI",
  { type: "Leader", cost: null, power: 5000, life: 5 },
  {
    id: "syn_nami",
    category: "auto",
    trigger: { event: "ATTACK_DEALS_DAMAGE", filter: { attacker: "SELF" } },
    actions: [{ type: "MILL", params: { amount: 1 } }],
  },
);

/**
 * Stands in for OP13-002 Ace (no conditions). The README encodes filter.controller "SELF",
 * but the engine stamps DAMAGE_DEALT with the ATTACKER's playerIndex, so a "SELF" filter on
 * the defender never matches. The filter is omitted so the fixture tests ordering only;
 * the only damage in these scenarios is dealt to this Leader's controller.
 */
const SYN_ACE = synCard(
  "SYN-ACE",
  { type: "Leader", cost: null, power: 5000, life: 5 },
  {
    id: "syn_ace",
    category: "auto",
    trigger: { event: "DAMAGE_TAKEN" },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  },
);

/** Stands in for OP05-098 Enel (hand trash omitted). */
const SYN_ENEL = synCard(
  "SYN-ENEL",
  { type: "Leader", cost: null, power: 5000, life: 5 },
  {
    id: "syn_enel",
    category: "auto",
    trigger: {
      event: "LIFE_COUNT_BECOMES_ZERO",
      filter: { controller: "SELF" },
      turn_restriction: "OPPONENT_TURN",
      once_per_turn: true,
    },
    actions: [{ type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN" } }],
  },
);

function life(id: string, cardId: string): LifeCard {
  return { instanceId: id, cardId, face: "DOWN" };
}

/** Swap a player's Leader for a synthetic one (same instanceId) and register its triggers. */
function withLeader(state: GameState, db: Map<string, CardData>, idx: 0 | 1, data: CardData): GameState {
  db.set(data.id, data);
  const leader: CardInstance = { ...state.players[idx].leader, cardId: data.id };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[idx] = { ...players[idx], leader };
  return registerTriggersForCard({ ...state, players }, leader, data);
}

function withLife(state: GameState, idx: 0 | 1, cards: LifeCard[]): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[idx] = { ...players[idx], life: cards };
  return { ...state, players };
}

export interface Rig {
  state: GameState;
  db: Map<string, CardData>;
  coord: SessionCoordinator;
}

function act(rig: Rig, playerIndex: 0 | 1, action: Parameters<SessionCoordinator["executeAction"]>[3]) {
  const r = rig.coord.executeAction(rig.state, [], playerIndex, action, rig.db);
  expect(r.kind, `${action.type} p${playerIndex}: ${"reason" in r ? r.reason : ""}`).toBe("applied");
  rig.state = r.state;
}

function attackLeader(rig: Rig, attackerId: string) {
  act(rig, 0, {
    type: "DECLARE_ATTACK",
    attackerInstanceId: attackerId,
    targetInstanceId: rig.state.players[1].leader.instanceId,
  });
  act(rig, 1, { type: "PASS" }); // block
  act(rig, 1, { type: "PASS" }); // counter
}

function reveal(rig: Rig, reveal: boolean) {
  const prompt = rig.state.pendingPrompt;
  expect(prompt?.options.promptType).toBe("REVEAL_TRIGGER");
  expect(prompt?.respondingPlayer).toBe(1);
  act(rig, 1, { type: "REVEAL_TRIGGER", reveal, promptId: prompt?.promptId } as never);
}

const idx = (log: readonly GameEvent[], type: string, player?: number) =>
  log.findIndex((e) => e.type === type && (player === undefined || (e as { playerIndex?: number }).playerIndex === player));
/** Index of a Trigger that was actually activated (the engine also logs an offer event without `activated`). */
const activatedIdx = (log: readonly GameEvent[]) =>
  log.findIndex((e) => e.type === "TRIGGER_ACTIVATED" && (e.payload as { activated?: boolean }).activated === true);

function baseRig(): { rig: Rig; db: Map<string, CardData> } {
  const db = new Map(createTestCardDb());
  db.set(SYN_TRIGGER_LIFE.id, SYN_TRIGGER_LIFE);
  const rig = { state: createBattleReadyState(db), db, coord: new SessionCoordinator() };
  return { rig, db };
}

/** A p1 Leader whose deck is all vanilla, so a card added from the deck is a known non-Trigger. */
function vanillaDeck(state: GameState): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = { ...players[1], deck: players[1].deck.map((c) => ({ ...c, cardId: CARDS.VANILLA.id })) };
  return { ...state, players };
}

describe("F5 [Rule 7-1-4-1-1-2 line 670, 8-6-2-1 line 864, 8-6-2 line 862; FAQ qa_op03.md:92-96, qa_op13.md:13-15] four-step order in one damage point", () => {
  function setup() {
    const { rig, db } = baseRig();
    let s = withLeader(rig.state, db, 0, SYN_NAMI);
    s = withLeader(s, db, 1, SYN_ACE);
    s = withLife(s, 1, [life("life-trig", SYN_TRIGGER_LIFE.id), life("life-v", CARDS.VANILLA.id)]);
    rig.state = vanillaDeck(s);
    return rig;
  }

  // Engine: DAMAGE_DEALT, p1 CARD_DRAWN (defender effect) and mill all run BEFORE the REVEAL_TRIGGER
  // prompt exists, so step 4 precedes step 3. Rule 8-6-2 / FAQ qa_op13.md:13-15 put step 4 after the Trigger.
  it.fails("F5a accept: Life check, attacker effect, Trigger choice, Trigger, then defender's own effect (ratchet OPT-963)", () => {
    const rig = setup();
    const start = rig.state.eventLog.length;
    const lifeBefore = rig.state.players[1].life.length;
    attackLeader(rig, rig.state.players[0].leader.instanceId);
    // Trigger prompt pending for p1, attacker's mill already done, no p1 draw yet.
    expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    expect(rig.state.pendingPrompt?.respondingPlayer).toBe(1);
    const log = rig.state.eventLog.slice(start);
    expect(idx(log, "DAMAGE_DEALT")).toBeGreaterThanOrEqual(0);
    expect(idx(log, "CARD_TRASHED", 0)).toBeGreaterThan(idx(log, "DAMAGE_DEALT"));
    expect(idx(log, "CARD_DRAWN", 1)).toBe(-1);
    reveal(rig, true);
    const after = rig.state.eventLog.slice(start);
    const trig = activatedIdx(after);
    expect(trig).toBeGreaterThan(idx(after, "CARD_TRASHED", 0));
    // ADD_TO_LIFE_FROM_DECK emits no event; the Trigger's effect shows as Life 2 -> 1 -> 2.
    expect(rig.state.players[1].life.length).toBe(lifeBefore);
    expect(idx(after, "CARD_DRAWN", 1)).toBeGreaterThan(trig);
  });

  // Engine: same early p1 CARD_DRAWN as F5a, before the decline reply.
  it.fails("F5b decline: Trigger declined, Life card to hand, then defender's own effect (ratchet OPT-963)", () => {
    const rig = setup();
    const start = rig.state.eventLog.length;
    attackLeader(rig, rig.state.players[0].leader.instanceId);
    expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    const log = rig.state.eventLog.slice(start);
    expect(idx(log, "CARD_TRASHED", 0)).toBeGreaterThan(idx(log, "DAMAGE_DEALT"));
    expect(idx(log, "CARD_DRAWN", 1)).toBe(-1);
    reveal(rig, false);
    const after = rig.state.eventLog.slice(start);
    expect(activatedIdx(after)).toBe(-1);
    const hand = idx(after, "CARD_ADDED_TO_HAND_FROM_LIFE", 1);
    expect(hand).toBeGreaterThan(idx(after, "CARD_TRASHED", 0));
    expect(idx(after, "CARD_DRAWN", 1)).toBeGreaterThan(hand);
  });
});

describe("F6 [Rule 8-6-2 line 862, 8-6-2-1 line 864; FAQ qa_op13.md:13-15] Ace alone: Trigger before the defender's own taking-damage effect", () => {
  // Engine: p1 CARD_DRAWN is logged before the REVEAL_TRIGGER prompt exists.
  it.fails("F6 Trigger activates before Ace's draw (ratchet OPT-963)", () => {
    const { rig, db } = baseRig();
    let s = withLeader(rig.state, db, 1, SYN_ACE);
    s = withLife(s, 1, [life("life-trig", SYN_TRIGGER_LIFE.id), life("life-v", CARDS.VANILLA.id)]);
    rig.state = vanillaDeck(s);
    const start = rig.state.eventLog.length;
    attackLeader(rig, rig.state.players[0].leader.instanceId);
    expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    expect(rig.state.pendingPrompt?.respondingPlayer).toBe(1);
    expect(idx(rig.state.eventLog.slice(start), "CARD_DRAWN", 1)).toBe(-1);
    reveal(rig, true);
    const after = rig.state.eventLog.slice(start);
    expect(activatedIdx(after)).toBeGreaterThanOrEqual(0);
    expect(idx(after, "CARD_DRAWN", 1)).toBeGreaterThan(activatedIdx(after));
  });
});

/** Double Attack attacker on p0 (CHAR-DATK), as in opt-239. */
function withDoubleAttacker(state: GameState): { state: GameState; attackerId: string } {
  const datk: CardInstance = {
    instanceId: "datk-0",
    cardId: CARDS.DOUBLE_ATK.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([...(players[0].characters.filter(Boolean) as CardInstance[]), datk]),
  };
  return { state: { ...state, players }, attackerId: datk.instanceId };
}

describe("F7 [OP05-098 text, Rule 8-6-2 line 862, 7-1-4-1-1-3 line 672; FAQ qa_op05.md:237-239] Enel resolves once, after both Double Attack points and the Damage Step", () => {
  it("F7 DAMAGE_DEALT x2 -> END_OF_BATTLE -> Enel effect once; Life ends at 1", () => {
    const { rig, db } = baseRig();
    // Marker DRAW 1 after the add: ADD_TO_LIFE_FROM_DECK emits no event, so the draw dates the effect.
    const enel: CardData = {
      ...SYN_ENEL,
      effectSchema: {
        ...SYN_ENEL.effectSchema!,
        effects: [
          {
            ...SYN_ENEL.effectSchema!.effects![0],
            actions: [
              { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN" } },
              { type: "DRAW", params: { amount: 1 } },
            ],
          },
        ],
      },
    };
    let s = withLeader(rig.state, db, 1, enel);
    s = withLife(s, 1, [life("life-v", CARDS.VANILLA.id)]);
    const da = withDoubleAttacker(vanillaDeck(s));
    rig.state = da.state;
    const start = rig.state.eventLog.length;
    attackLeader(rig, da.attackerId);
    const log = rig.state.eventLog.slice(start);
    const damages = log.filter((e) => e.type === "DAMAGE_DEALT");
    expect(damages.length).toBe(2);
    const lastDamage = log.map((e) => e.type).lastIndexOf("DAMAGE_DEALT");
    const endBattle = idx(log, "END_OF_BATTLE");
    expect(endBattle).toBeGreaterThan(lastDamage);
    expect(log.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === 1).length).toBe(1);
    expect(idx(log, "CARD_DRAWN", 1)).toBeGreaterThan(endBattle);
    expect(rig.state.players[1].life.length).toBe(1);
    expect(rig.state.status).toBe("IN_PROGRESS");
  });
});

describe("F8 [Rule 7-1-4-1-1-3 line 672, 8-6-2-1 line 864, 7-1-4-1-1-1 line 668; FAQ qa_op03.md OP03-118, qa_rules.md:156-158] Double Attack: Trigger on point 1 changes Life before point 2", () => {
  function setup(lifeCards: LifeCard[]) {
    const { rig } = baseRig();
    const da = withDoubleAttacker(vanillaDeck(withLife(rig.state, 1, lifeCards)));
    rig.state = da.state;
    return { rig, attackerId: da.attackerId };
  }

  it("F8a Life [Trigger, Vanilla]: point 2 takes the card the Trigger added; final Life [Vanilla], hand +1, no defeat", () => {
    const { rig, attackerId } = setup([life("life-trig", SYN_TRIGGER_LIFE.id), life("life-v", CARDS.VANILLA.id)]);
    const handBefore = rig.state.players[1].hand.length;
    attackLeader(rig, attackerId);
    expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    reveal(rig, true);
    expect(rig.state.pendingPrompt).toBeNull();
    expect(rig.state.players[1].life.map((l) => l.instanceId)).toEqual(["life-v"]);
    expect(rig.state.players[1].hand.length - handBefore).toBe(1);
    expect(rig.state.status).toBe("IN_PROGRESS");
    expect(rig.state.eventLog.some((e) => e.type === "GAME_OVER")).toBe(false);
  });

  it("F8b Life [Trigger]: point 2 takes the added card; final Life 0, game still IN_PROGRESS, no GAME_OVER", () => {
    const { rig, attackerId } = setup([life("life-trig", SYN_TRIGGER_LIFE.id)]);
    attackLeader(rig, attackerId);
    expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    reveal(rig, true);
    expect(rig.state.players[1].life.length).toBe(0);
    expect(rig.state.status).toBe("IN_PROGRESS");
    expect(rig.state.eventLog.some((e) => e.type === "GAME_OVER")).toBe(false);
  });
});
