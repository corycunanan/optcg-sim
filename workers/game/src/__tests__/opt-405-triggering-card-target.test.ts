/**
 * OPT-405 — TRIGGERING_CARD target type.
 *
 * OP16-079 Yamato (Leader): "When a {Land of Wano} type Character card is
 * played from your trash, that Character gains [Rush] during this turn."
 *
 * resolveEffect seeds the well-known __triggering_card result_ref from the
 * queued trigger's event payload; a TRIGGERING_CARD target resolves to that
 * card deterministically (no prompt) and fizzles if the card left the field.
 */

import { describe, it, expect } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Black"],
    cost: 4,
    power: 5000,
    counter: null,
    life: null,
    attribute: [],
    types: ["Land of Wano"],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeInstance(cardId: string, instanceId: string, zone: CardInstance["zone"], owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "LEADER" ? null : 1,
    controller: owner,
    owner,
  };
}

function emptyPlayer(playerId: string, leader: CardInstance): PlayerState {
  return {
    playerId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: [],
    life: [],
    donDeck: [],
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  };
}

function buildState() {
  const leaderData = makeCard("YAMATO-LEADER", { type: "Leader", cost: null, life: 5, types: ["Land of Wano"] });
  const kinemon = makeCard("KINEMON", { name: "Kin'emon" });
  const momo = makeCard("MOMO", { name: "Kouzuki Momonosuke" });
  const oppLeader = makeCard("OPP-LEADER", { type: "Leader", cost: null, life: 5 });
  const db = new Map<string, CardData>(
    [leaderData, kinemon, momo, oppLeader].map((c) => [c.id, c]),
  );

  const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
  p0.characters = [
    makeInstance(kinemon.id, "c1", "CHARACTER", 0),
    makeInstance(momo.id, "c2", "CHARACTER", 0),
    null, null, null,
  ];
  const p1 = emptyPlayer("p1", makeInstance(oppLeader.id, "L1", "LEADER", 1));

  const state = {
    id: "g",
    players: [p0, p1],
    turn: { number: 1, activePlayerIndex: 0, phase: "MAIN", battleSubPhase: null, battle: null, oncePerTurnUsed: {}, actionsPerformedThisTurn: [], deckHitZeroThisTurn: [false, false] },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pregame: null,
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
  } as unknown as GameState;
  return { state, db };
}

/** OP16-079-shaped block: grant Rush to the card that triggered the effect. */
const grantRushBlock: EffectBlock = {
  id: "OP16-079_grant_rush_on_trash_play",
  category: "auto",
  trigger: {
    event: "CHARACTER_PLAYED",
    filter: { controller: "SELF", source_zone: "TRASH", target_filter: { traits: ["Land of Wano"] } },
  },
  actions: [
    {
      type: "GRANT_KEYWORD",
      target: { type: "TRIGGERING_CARD" },
      params: { keyword: "RUSH" },
      duration: { type: "THIS_TURN" },
    },
  ],
} as unknown as EffectBlock;

describe("OPT-405: TRIGGERING_CARD target (OP16-079)", () => {
  it("grants Rush to the character that triggered the effect", () => {
    const { state, db } = buildState();
    const result = resolveEffect(state, grantRushBlock, "L0", 0, db, "c1");
    expect(result.resolved).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();

    const next = result.state;
    const c1 = next.players[0].characters[0]!;
    const c2 = next.players[0].characters[1]!;
    expect(hasEffectiveKeyword(c1, db.get(c1.cardId)!, "RUSH", next, db)).toBe(true);
    // The other Land of Wano character is untouched.
    expect(hasEffectiveKeyword(c2, db.get(c2.cardId)!, "RUSH", next, db)).toBe(false);
  });

  it("fizzles without erroring when the triggering card left the field", () => {
    const { state, db } = buildState();
    const result = resolveEffect(state, grantRushBlock, "L0", 0, db, "gone-instance");
    const next = result.state;
    const c1 = next.players[0].characters[0]!;
    expect(hasEffectiveKeyword(c1, db.get(c1.cardId)!, "RUSH", next, db)).toBe(false);
  });

  it("resolves nothing when no triggering card was provided", () => {
    const { state, db } = buildState();
    const result = resolveEffect(state, grantRushBlock, "L0", 0, db);
    const next = result.state;
    const c1 = next.players[0].characters[0]!;
    expect(hasEffectiveKeyword(c1, db.get(c1.cardId)!, "RUSH", next, db)).toBe(false);
  });
});
