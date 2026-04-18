/**
 * OPT-252 (E6) — "Cannot be played by effects" vs "Unable to play cards from
 * hand" — both narrow, both distinct.
 *
 * Two play-related prohibitions with overlapping wording but distinct semantics:
 *   1. CANNOT_BE_PLAYED_BY_EFFECTS  — object-level (canonical: OP12-036 Zoro).
 *      The Character itself refuses effect-driven plays; manual hand-play with
 *      cost is unaffected. The flag is intrinsic via a permanent block on the
 *      card's own schema, gated by `block.zone` matching the card's current
 *      zone (Zoro: HAND only).
 *   2. CANNOT_PLAY_FROM_HAND        — player-level (canonical: OP13-028 Shanks).
 *      The affected controller can't initiate normal hand-plays this turn.
 *      Effect-driven plays from non-hand zones are unaffected (those go through
 *      the resolver path, not the action pipeline that hosts this matcher).
 *
 * These tests verify:
 *   - intrinsic schema scan picks up Zoro in HAND (and not in TRASH/DECK).
 *   - runtime-granted CANNOT_BE_PLAYED_BY_EFFECTS via state.prohibitions also
 *     wins (e.g., a hypothetical effect that grants the flag to a target).
 *   - CANNOT_PLAY_FROM_HAND vetoes PLAY_CARD by the gated player and is scoped
 *     by scope.controller (SELF/OPPONENT/EITHER).
 *   - CANNOT_PLAY_FROM_HAND ignores non-PLAY_CARD actions.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
  Zone,
} from "../types.js";
import type { EffectSchema, RuntimeProhibition } from "../engine/effect-types.js";
import {
  checkProhibitions,
  isCardPlayProhibitedByEffect,
} from "../engine/prohibitions.js";

function noKeywords() {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeInstance(
  cardId: string,
  instanceId: string,
  controller: 0 | 1,
  zone: Zone = "HAND",
  overrides: Partial<CardInstance> = {},
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
    ...overrides,
  };
}

function padChars(chars: (CardInstance | null)[]): (CardInstance | null)[] {
  const out: (CardInstance | null)[] = [null, null, null, null, null];
  for (let i = 0; i < Math.min(chars.length, 5); i++) out[i] = chars[i];
  return out;
}

interface SceneOpts {
  cards: CardData[];
  hand0?: CardInstance[];
  hand1?: CardInstance[];
  trash0?: CardInstance[];
  prohibitions?: RuntimeProhibition[];
  activePlayer?: 0 | 1;
}

function buildScene(opts: SceneOpts): { state: GameState; cardDb: Map<string, CardData> } {
  const leader = makeCard("LEADER-T", { type: "Leader", cost: null, power: 5000, life: 5 });
  const cardDb = new Map<string, CardData>();
  cardDb.set(leader.id, leader);
  for (const c of opts.cards) cardDb.set(c.id, c);

  const makePlayer = (idx: 0 | 1, hand: CardInstance[], trash: CardInstance[]) => ({
    userId: `user-${idx}`,
    leader: makeInstance(leader.id, `leader-${idx}`, idx, "LEADER"),
    characters: padChars([]),
    stage: null,
    hand,
    deck: [],
    trash,
    life: [],
    removedFromGame: [],
    donDeck: [],
    donCostArea: [],
  });

  const p0 = makePlayer(0, opts.hand0 ?? [], opts.trash0 ?? []);
  const p1 = makePlayer(1, opts.hand1 ?? [], []);

  const state = {
    gameId: "test-opt-252",
    status: "IN_PROGRESS",
    winner: null,
    players: [p0, p1],
    turn: {
      number: 3,
      activePlayerIndex: opts.activePlayer ?? 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
    },
    activeEffects: [],
    prohibitions: (opts.prohibitions ?? []) as unknown,
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
    eventLog: [],
    winReason: null,
  } as unknown as GameState;

  return { state, cardDb };
}

function makeProhibition(
  overrides: Partial<RuntimeProhibition> & Pick<RuntimeProhibition, "prohibitionType">,
): RuntimeProhibition {
  return {
    id: `p-${overrides.prohibitionType}`,
    sourceCardInstanceId: "source-card",
    sourceEffectBlockId: "block",
    scope: {},
    duration: { type: "THIS_TURN" },
    controller: 0,
    appliesTo: [],
    usesRemaining: null,
    ...overrides,
  } as RuntimeProhibition;
}

// Permanent-block shorthand for the intrinsic Zoro flag.
const ZORO_HAND_SCHEMA: EffectSchema = {
  card_id: "ZORO-CLONE",
  card_name: "ZORO-CLONE",
  card_type: "Character",
  effects: [
    {
      id: "cannot_be_played_by_effects",
      category: "permanent",
      zone: "HAND",
      prohibitions: [{ type: "CANNOT_BE_PLAYED_BY_EFFECTS" }],
    },
  ],
};

// ─── 1. CANNOT_BE_PLAYED_BY_EFFECTS — intrinsic, zone-gated ─────────────────

describe("OPT-252: CANNOT_BE_PLAYED_BY_EFFECTS — Zoro-class object-level prohibition", () => {
  it("blocks effect-play of Zoro while he sits in HAND (intrinsic schema)", () => {
    const zoro = makeCard("ZORO-CLONE", { effectSchema: ZORO_HAND_SCHEMA as unknown as CardData["effectSchema"] });
    const inst = makeInstance(zoro.id, "z1", 0, "HAND");
    const { state, cardDb } = buildScene({ cards: [zoro], hand0: [inst] });

    expect(isCardPlayProhibitedByEffect(state, "z1", cardDb)).toBe(true);
  });

  it("does NOT block when Zoro is in TRASH — schema gates the flag to HAND only", () => {
    const zoro = makeCard("ZORO-CLONE", { effectSchema: ZORO_HAND_SCHEMA as unknown as CardData["effectSchema"] });
    const inst = makeInstance(zoro.id, "z1", 0, "TRASH");
    const { state, cardDb } = buildScene({ cards: [zoro], trash0: [inst] });

    expect(isCardPlayProhibitedByEffect(state, "z1", cardDb)).toBe(false);
  });

  it("does NOT block a plain Character without the prohibition", () => {
    const plain = makeCard("PLAIN");
    const inst = makeInstance(plain.id, "p1", 0, "HAND");
    const { state, cardDb } = buildScene({ cards: [plain], hand0: [inst] });

    expect(isCardPlayProhibitedByEffect(state, "p1", cardDb)).toBe(false);
  });

  it("blocks when a runtime prohibition entry targets the card via appliesTo", () => {
    // Models a hypothetical effect that grants the flag to a specific card,
    // independent of any intrinsic schema text.
    const plain = makeCard("PLAIN");
    const inst = makeInstance(plain.id, "p1", 0, "HAND");
    const { state, cardDb } = buildScene({
      cards: [plain],
      hand0: [inst],
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_PLAYED_BY_EFFECTS",
          appliesTo: ["p1"],
        }),
      ],
    });

    expect(isCardPlayProhibitedByEffect(state, "p1", cardDb)).toBe(true);
  });

  it("ignores runtime prohibition entries that don't list this card in appliesTo", () => {
    const plain = makeCard("PLAIN");
    const inst = makeInstance(plain.id, "p1", 0, "HAND");
    const { state, cardDb } = buildScene({
      cards: [plain],
      hand0: [inst],
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_PLAYED_BY_EFFECTS",
          appliesTo: ["other-id"],
        }),
      ],
    });

    expect(isCardPlayProhibitedByEffect(state, "p1", cardDb)).toBe(false);
  });
});

// ─── 2. CANNOT_PLAY_FROM_HAND — player-level, scope-gated ───────────────────

describe("OPT-252: CANNOT_PLAY_FROM_HAND — Shanks-class player-level prohibition", () => {
  function playCardAction(cardInstanceId: string): GameAction {
    return { type: "PLAY_CARD", cardInstanceId } as GameAction;
  }

  it("vetoes PLAY_CARD by SELF when Shanks's controller is the actor (scope SELF)", () => {
    const card = makeCard("ANY");
    const inst = makeInstance(card.id, "h1", 0, "HAND");
    const { state, cardDb } = buildScene({
      cards: [card],
      hand0: [inst],
      activePlayer: 0,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_PLAY_FROM_HAND",
          controller: 0,
          scope: { controller: "SELF" },
        }),
      ],
    });

    const veto = checkProhibitions(state, playCardAction("h1"), cardDb, 0);
    expect(veto).not.toBeNull();
    expect(veto).toMatch(/cannot play cards from hand/i);
  });

  it("does NOT veto when the opponent (not the gated player) is acting", () => {
    const card = makeCard("ANY");
    const inst = makeInstance(card.id, "h1", 1, "HAND");
    const { state, cardDb } = buildScene({
      cards: [card],
      hand1: [inst],
      activePlayer: 1,
      prohibitions: [
        // Shanks belongs to player 0 and restricts SELF — player 1 (opp) is free.
        makeProhibition({
          prohibitionType: "CANNOT_PLAY_FROM_HAND",
          controller: 0,
          scope: { controller: "SELF" },
        }),
      ],
    });

    expect(checkProhibitions(state, playCardAction("h1"), cardDb, 1)).toBeNull();
  });

  it("vetoes the OPPONENT when scope.controller is OPPONENT", () => {
    const card = makeCard("ANY");
    const inst = makeInstance(card.id, "h1", 1, "HAND");
    const { state, cardDb } = buildScene({
      cards: [card],
      hand1: [inst],
      activePlayer: 1,
      prohibitions: [
        // Source on player 0; restriction targets the opponent (player 1).
        makeProhibition({
          prohibitionType: "CANNOT_PLAY_FROM_HAND",
          controller: 0,
          scope: { controller: "OPPONENT" },
        }),
      ],
    });

    expect(checkProhibitions(state, playCardAction("h1"), cardDb, 1)).not.toBeNull();
  });

  it("does NOT veto non-PLAY_CARD actions (e.g., PASS, DECLARE_ATTACK)", () => {
    const card = makeCard("ANY");
    const inst = makeInstance(card.id, "h1", 0, "HAND");
    const { state, cardDb } = buildScene({
      cards: [card],
      hand0: [inst],
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_PLAY_FROM_HAND",
          controller: 0,
          scope: { controller: "SELF" },
        }),
      ],
    });

    const pass: GameAction = { type: "PASS" } as GameAction;
    expect(checkProhibitions(state, pass, cardDb, 0)).toBeNull();
  });

  it("vetoes EITHER controller when scope is unset (default = EITHER)", () => {
    const card = makeCard("ANY");
    const inst0 = makeInstance(card.id, "h0", 0, "HAND");
    const inst1 = makeInstance(card.id, "h1", 1, "HAND");
    const { state, cardDb } = buildScene({
      cards: [card],
      hand0: [inst0],
      hand1: [inst1],
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_PLAY_FROM_HAND",
          controller: 0,
          // no scope — matchesController returns true regardless of acting player
        }),
      ],
    });

    expect(checkProhibitions(state, playCardAction("h0"), cardDb, 0)).not.toBeNull();
    expect(checkProhibitions(state, playCardAction("h1"), cardDb, 1)).not.toBeNull();
  });
});
