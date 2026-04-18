/**
 * OPT-251 (E5) — "Cannot be removed from field by opp's effects" vs narrow
 * "cannot be K.O.'d".
 *
 * Two related but distinct protections:
 *   1. CANNOT_BE_KO (narrow)  — blocks K.O. only; bounce/hand/deck/trash still land
 *      (canonical: OP01-024 Luffy).
 *   2. CANNOT_BE_REMOVED_FROM_FIELD (broad) — blocks K.O., return-to-hand,
 *      return-to-deck, trash by opp effects; own effects still work
 *      (canonical: OP02-027 Inuarashi).
 *
 * These tests verify the removal-action taxonomy and opp-effect attribution:
 *   - KO         → blocked by CANNOT_BE_KO / CANNOT_BE_REMOVED_FROM_FIELD
 *   - RETURN     → NOT blocked by CANNOT_BE_KO; blocked by CANNOT_BE_REMOVED_FROM_FIELD
 *   - Own effect → allowed through CANNOT_BE_REMOVED_FROM_FIELD (opp-only)
 *   - Battle K.O.→ blocked by CANNOT_BE_KO with cause BATTLE/ANY
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  Zone,
} from "../types.js";
import type { RuntimeProhibition } from "../engine/effect-types.js";
import { isRemovalProhibited } from "../engine/prohibitions.js";

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
  zone: Zone = "CHARACTER",
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
  targetCardId: string;
  targetController: 0 | 1;
  prohibitions: RuntimeProhibition[];
  attackerCardId?: string;
  attackerController?: 0 | 1;
}

/**
 * Build a tiny state with one target character (on P1's board by default),
 * optionally with an attacker character on P0's board, plus the given
 * prohibitions already registered.
 */
function buildScene(opts: SceneOpts): {
  state: GameState;
  cardDb: Map<string, CardData>;
  targetId: string;
  attackerId: string | null;
} {
  const leader = makeCard("LEADER-T", { type: "Leader", cost: null, power: 5000, life: 5 });
  const targetCard = makeCard(opts.targetCardId);
  const attackerCard = opts.attackerCardId
    ? makeCard(opts.attackerCardId, { attribute: ["Strike"] })
    : null;

  const cardDb = new Map<string, CardData>();
  cardDb.set(leader.id, leader);
  cardDb.set(targetCard.id, targetCard);
  if (attackerCard) cardDb.set(attackerCard.id, attackerCard);

  const targetId = `tgt-${opts.targetCardId}`;
  const target = makeInstance(targetCard.id, targetId, opts.targetController);

  const attackerId = attackerCard ? `atk-${opts.attackerCardId}` : null;
  const attacker = attackerId && attackerCard
    ? makeInstance(attackerCard.id, attackerId, opts.attackerController ?? 0)
    : null;

  const makePlayer = (idx: 0 | 1, chars: (CardInstance | null)[]) => ({
    userId: `user-${idx}`,
    leader: makeInstance(leader.id, `leader-${idx}`, idx, "LEADER"),
    characters: padChars(chars),
    stage: null,
    hand: [],
    deck: [],
    trash: [],
    life: [],
    removedFromGame: [],
    donDeck: [],
    donCostArea: [],
  });

  const p0Chars = attacker && (opts.attackerController ?? 0) === 0 ? [attacker] : [];
  const p1Chars = opts.targetController === 1 ? [target] : [];
  const p0 = makePlayer(0, p0Chars);
  const p1 = makePlayer(1, p1Chars);
  if (opts.targetController === 0) p0.characters = padChars([target, ...p0Chars]);

  const state = {
    gameId: "test-opt-251",
    status: "IN_PROGRESS",
    winner: null,
    players: [p0, p1],
    turn: {
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
    },
    activeEffects: [],
    prohibitions: opts.prohibitions as unknown,
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
    eventLog: [],
    winReason: null,
  } as unknown as GameState;

  return { state, cardDb, targetId, attackerId };
}

function makeProhibition(
  overrides: Partial<RuntimeProhibition> & Pick<RuntimeProhibition, "prohibitionType">,
): RuntimeProhibition {
  return {
    id: `p-${overrides.prohibitionType}`,
    sourceCardInstanceId: "source-card",
    sourceEffectBlockId: "block",
    scope: {},
    duration: { type: "PERMANENT" },
    controller: 1, // by default the target's own controller protects them
    appliesTo: [],
    usesRemaining: null,
    ...overrides,
  } as RuntimeProhibition;
}

// ─── 1. CANNOT_BE_KO (narrow) ────────────────────────────────────────────────

describe("OPT-251: CANNOT_BE_KO is narrow — K.O. only, not non-K.O. removal", () => {
  it("blocks K.O. by opponent effect", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({ prohibitionType: "CANNOT_BE_KO", appliesTo: ["tgt-LUFFY-CLONE"] }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);
  });

  it("does NOT block opponent return-to-hand — the narrow protection is K.O.-only", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({ prohibitionType: "CANNOT_BE_KO", appliesTo: ["tgt-LUFFY-CLONE"] }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_HAND", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });

  it("does NOT block opponent return-to-deck", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({ prohibitionType: "CANNOT_BE_KO", appliesTo: ["tgt-LUFFY-CLONE"] }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_DECK", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });

  it("does NOT block opponent trash-from-field", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({ prohibitionType: "CANNOT_BE_KO", appliesTo: ["tgt-LUFFY-CLONE"] }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "TRASH", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });

  it("blocks battle K.O. when scope.cause = BATTLE", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_KO",
          appliesTo: ["tgt-LUFFY-CLONE"],
          scope: { cause: "BATTLE" },
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "BATTLE", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);
  });

  it("does NOT block effect K.O. when scope.cause = BATTLE", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_KO",
          appliesTo: ["tgt-LUFFY-CLONE"],
          scope: { cause: "BATTLE" },
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });

  it("respects source_filter — only blocks K.O. from matching attackers", () => {
    const { state, cardDb, targetId, attackerId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      attackerCardId: "STRIKE-ATK",
      attackerController: 0,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_KO",
          appliesTo: ["tgt-LUFFY-CLONE"],
          scope: { cause: "BATTLE", source_filter: { attribute: "Strike" } },
        }),
      ],
    });

    // Strike attacker → blocked (Luffy's printed protection)
    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "BATTLE", causingController: 0, sourceCardInstanceId: attackerId },
      cardDb,
    )).toBe(true);

    // No source declared → cannot verify match, do not block
    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "BATTLE", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });
});

// ─── 2. CANNOT_BE_REMOVED_FROM_FIELD (broad, opp-only by default) ────────────

describe("OPT-251: CANNOT_BE_REMOVED_FROM_FIELD is broad but opp-only", () => {
  it("blocks opp K.O.", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);
  });

  it("blocks opp return-to-hand", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_HAND", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);
  });

  it("blocks opp return-to-deck", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_DECK", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);
  });

  it("blocks opp trash", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "TRASH", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);
  });

  it("does NOT block the protected player's OWN return-to-hand (opp-only)", () => {
    // Inuarashi is on P1's board, P1 activates a self-bounce. Allowed.
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_HAND", cause: "EFFECT", causingController: 1, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });

  it("does NOT block battle K.O. — that's CANNOT_BE_KO territory", () => {
    // The "removed from field by opp effects" text explicitly scopes to effects.
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "BATTLE", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });
});

// ─── 3. CANNOT_BE_RETURNED_TO_HAND / _TO_DECK (specific) ─────────────────────

describe("OPT-251: CANNOT_BE_RETURNED_TO_HAND blocks only return-to-hand", () => {
  it("blocks opp return-to-hand but not K.O. or return-to-deck", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "NOBOUNCE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_RETURNED_TO_HAND",
          appliesTo: ["tgt-NOBOUNCE"],
          controller: 1,
        }),
      ],
    });

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_HAND", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(true);

    expect(isRemovalProhibited(
      state, targetId,
      { action: "KO", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);

    expect(isRemovalProhibited(
      state, targetId,
      { action: "RETURN_TO_DECK", cause: "EFFECT", causingController: 0, sourceCardInstanceId: null },
      cardDb,
    )).toBe(false);
  });
});

// ─── 4. Resolver integration ─────────────────────────────────────────────────

import { executeKO, executeReturnToHand, executeReturnToDeck, executeTrashCard } from "../engine/effect-resolver/actions/removal.js";

describe("OPT-251: removal handlers respect prohibitions", () => {
  it("executeKO skips targets with CANNOT_BE_KO", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({ prohibitionType: "CANNOT_BE_KO", appliesTo: ["tgt-LUFFY-CLONE"] }),
      ],
    });

    const result = executeKO(
      state,
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      "source-card",
      0,
      cardDb,
      new Map(),
      [targetId],
    );

    // Target still on field; no CARD_KO event emitted for it.
    expect(result.events.find((e) => e.type === "CARD_KO")).toBeUndefined();
    const stillThere = result.state.players[1].characters.find((c) => c?.instanceId === targetId);
    expect(stillThere).toBeTruthy();
  });

  it("executeReturnToHand skips targets with CANNOT_BE_REMOVED_FROM_FIELD (opp cause)", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    const result = executeReturnToHand(
      state,
      { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      "source-card",
      0,
      cardDb,
      new Map(),
      [targetId],
    );

    expect(result.events.find((e) => e.type === "CARD_RETURNED_TO_HAND")).toBeUndefined();
    const stillThere = result.state.players[1].characters.find((c) => c?.instanceId === targetId);
    expect(stillThere).toBeTruthy();
  });

  it("executeReturnToHand with CANNOT_BE_KO lets the bounce through (narrow protection)", () => {
    // Luffy only blocks K.O., so an opp return-to-hand SUCCEEDS.
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "LUFFY-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({ prohibitionType: "CANNOT_BE_KO", appliesTo: ["tgt-LUFFY-CLONE"] }),
      ],
    });

    const result = executeReturnToHand(
      state,
      { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      "source-card",
      0,
      cardDb,
      new Map(),
      [targetId],
    );

    expect(result.events.find((e) => e.type === "CARD_RETURNED_TO_HAND")).toBeTruthy();
  });

  it("executeReturnToDeck skips targets with CANNOT_BE_REMOVED_FROM_FIELD (opp cause)", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    const result = executeReturnToDeck(
      state,
      { type: "RETURN_TO_DECK", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      "source-card",
      0,
      cardDb,
      new Map(),
      [targetId],
    );

    const stillThere = result.state.players[1].characters.find((c) => c?.instanceId === targetId);
    expect(stillThere).toBeTruthy();
  });

  it("executeTrashCard skips field characters with CANNOT_BE_REMOVED_FROM_FIELD (opp cause)", () => {
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    const result = executeTrashCard(
      state,
      { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT" } } as any,
      "source-card",
      0,
      cardDb,
      new Map(),
      [targetId],
    );

    const stillThere = result.state.players[1].characters.find((c) => c?.instanceId === targetId);
    expect(stillThere).toBeTruthy();
  });

  it("executeReturnToHand allows the OWNER's own bounce through CANNOT_BE_REMOVED_FROM_FIELD", () => {
    // Inuarashi's self-bounce: causingController === target's controller.
    const { state, cardDb, targetId } = buildScene({
      targetCardId: "INUARASHI-CLONE",
      targetController: 1,
      prohibitions: [
        makeProhibition({
          prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
          appliesTo: ["tgt-INUARASHI-CLONE"],
          controller: 1,
        }),
      ],
    });

    const result = executeReturnToHand(
      state,
      { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "SELF" } } as any,
      "source-card",
      1, // P1 is the causing controller — their own effect
      cardDb,
      new Map(),
      [targetId],
    );

    expect(result.events.find((e) => e.type === "CARD_RETURNED_TO_HAND")).toBeTruthy();
  });
});
