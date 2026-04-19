/**
 * OPT-256 F3 — Zone-change identity reset, modifiers stripped on re-summon.
 *
 * When a Character is K.O.'d and replayed via its own [On K.O.] (OP02-018
 * Marco), the replayed copy is a FRESH instance per rules §3-1-6: new
 * instanceId, no attached DON, no per-turn flags, and no modifiers carry
 * over. Ongoing effects that targeted the K.O.'d instance must fizzle —
 * the new instance does not inherit those grants.
 *
 * The engine already creates a fresh instanceId at the re-summon site
 * (play.ts) and detaches DON at the KO site (card-mutations.ts), so the
 * new Marco naturally does not match any appliesTo list keyed to the old
 * id. OPT-256 locks the remaining half: an explicit strip of the leaving
 * id from every effect/prohibition target list at the zone transition,
 * so state stays clean and the invariant is testable directly on the
 * registries (not just indirectly via power/cost reads).
 *
 * Covered:
 *   1. expireTargetLeftZone drops single-target entries keyed to the leaver.
 *   2. expireTargetLeftZone preserves AOE entries for remaining targets.
 *   3. expireTargetLeftZone preserves dynamic (non-SELF) modifier entries
 *      whose appliesTo becomes empty — they re-resolve at read time.
 *   4. expireTargetLeftZone defers source-bound entries to expireSourceLeftZone
 *      so the two helpers don't double-touch the same effect.
 *   5. expireTargetLeftZone strips prohibitions keyed to the leaver.
 *   6. Pipeline runs target-side cleanup on CARD_KO / CARD_TRASHED /
 *      CARD_RETURNED_TO_HAND / CARD_RETURNED_TO_DECK events.
 *   7. Full Marco re-summon: KO'd Marco with a power buff and attached DON
 *      is replayed via his [On K.O.]; the new Marco has a fresh instanceId,
 *      zero attached DON, base power (no stale buff), and the targeting
 *      effect entry is gone from state.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import type {
  RuntimeActiveEffect,
  RuntimeProhibition,
} from "../engine/effect-types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import {
  expireTargetLeftZone,
  expireSourceLeftZone,
} from "../engine/duration-tracker.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { OP02_018_MARCO } from "../engine/schemas/op02.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEffect(
  overrides: Partial<RuntimeActiveEffect> & Pick<RuntimeActiveEffect, "sourceCardInstanceId" | "appliesTo">,
): RuntimeActiveEffect {
  return {
    id: overrides.id ?? `eff-${Math.random().toString(36).slice(2, 8)}`,
    sourceEffectBlockId: "block-1",
    category: "auto",
    modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: 1 },
    controller: 0,
    timestamp: 1,
    ...overrides,
  };
}

function makeProhibition(
  overrides: Partial<RuntimeProhibition> &
    Pick<RuntimeProhibition, "sourceCardInstanceId" | "appliesTo">,
): RuntimeProhibition {
  return {
    id: overrides.id ?? `prohib-${Math.random().toString(36).slice(2, 8)}`,
    sourceEffectBlockId: "block-1",
    prohibitionType: "CANNOT_ATTACK" as RuntimeProhibition["prohibitionType"],
    scope: {},
    duration: { type: "THIS_TURN" },
    controller: 0,
    usesRemaining: null,
    ...overrides,
  };
}

function emptyState(): GameState {
  // Minimal state sufficient for the duration-tracker helpers — they only
  // read/write the effect/prohibition arrays.
  return {
    id: "test",
    players: [] as unknown as GameState["players"],
    turn: {
      number: 1,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
      deckHitZeroThisTurn: [false, false],
      pendingTriggerFromEffect: null,
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
  };
}

// ─── Unit tests: expireTargetLeftZone ────────────────────────────────────────

describe("OPT-256: expireTargetLeftZone (duration tracker)", () => {
  it("drops a single-target entry when the target leaves the zone", () => {
    const state = {
      ...emptyState(),
      activeEffects: [
        makeEffect({ sourceCardInstanceId: "buffer", appliesTo: ["marco-old"] }),
      ] as unknown as GameState["activeEffects"],
    };

    const result = expireTargetLeftZone(state, "marco-old");

    expect(result.activeEffects).toHaveLength(0);
  });

  it("keeps AOE entries for remaining targets, stripping only the leaver", () => {
    const state = {
      ...emptyState(),
      activeEffects: [
        makeEffect({
          sourceCardInstanceId: "buffer",
          appliesTo: ["marco-old", "zoro", "sanji"],
        }),
      ] as unknown as GameState["activeEffects"],
    };

    const result = expireTargetLeftZone(state, "marco-old");
    const effects = result.activeEffects as unknown as RuntimeActiveEffect[];

    expect(effects).toHaveLength(1);
    expect(effects[0].appliesTo).toEqual(["zoro", "sanji"]);
  });

  it("preserves dynamic-target entries even when appliesTo becomes empty", () => {
    // A CHARACTER-type modifier re-resolves targets at read time via
    // effectAppliesToCard — an empty appliesTo does not imply no targets.
    const state = {
      ...emptyState(),
      activeEffects: [
        makeEffect({
          sourceCardInstanceId: "aura-source",
          appliesTo: ["marco-old"],
          modifiers: [
            {
              type: "MODIFY_POWER",
              params: { amount: 1000 },
              target: { type: "CHARACTER", controller: "SELF" },
            },
          ],
        }),
      ] as unknown as GameState["activeEffects"],
    };

    const result = expireTargetLeftZone(state, "marco-old");
    const effects = result.activeEffects as unknown as RuntimeActiveEffect[];

    expect(effects).toHaveLength(1);
    expect(effects[0].appliesTo).toEqual([]);
  });

  it("defers source-bound entries to expireSourceLeftZone", () => {
    // If the leaver is both source AND in appliesTo (a permanent self-effect),
    // target-side cleanup must leave the entry alone so source-side cleanup
    // can apply its own policy (drop on SOURCE_LEAVES_ZONE / permanent).
    const state = {
      ...emptyState(),
      activeEffects: [
        makeEffect({
          sourceCardInstanceId: "marco-old",
          appliesTo: ["marco-old"],
          category: "permanent",
          expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
        }),
      ] as unknown as GameState["activeEffects"],
    };

    const afterTarget = expireTargetLeftZone(state, "marco-old");
    expect(afterTarget.activeEffects).toHaveLength(1);

    const afterBoth = expireSourceLeftZone(afterTarget, "marco-old");
    expect(afterBoth.activeEffects).toHaveLength(0);
  });

  it("strips the leaving id from prohibition appliesTo", () => {
    const state = {
      ...emptyState(),
      prohibitions: [
        makeProhibition({ sourceCardInstanceId: "locker", appliesTo: ["marco-old"] }),
        makeProhibition({
          sourceCardInstanceId: "locker",
          appliesTo: ["marco-old", "zoro"],
        }),
      ] as unknown as GameState["prohibitions"],
    };

    const result = expireTargetLeftZone(state, "marco-old");
    const prohibitions = result.prohibitions as unknown as RuntimeProhibition[];

    expect(prohibitions).toHaveLength(1);
    expect(prohibitions[0].appliesTo).toEqual(["zoro"]);
  });

  it("is a no-op when the leaver is absent from all target lists", () => {
    const state = {
      ...emptyState(),
      activeEffects: [
        makeEffect({ sourceCardInstanceId: "buffer", appliesTo: ["zoro"] }),
      ] as unknown as GameState["activeEffects"],
    };

    const result = expireTargetLeftZone(state, "marco-old");
    expect(result).toBe(state);
  });
});

// ─── Integration: pipeline wires cleanup on field-exit events ────────────────

describe("OPT-256: pipeline cleans up target-side effects on field exit", () => {
  /** Helper: place a cross-character +1000 power effect on state. */
  function seedCrossBuff(
    state: GameState,
    sourceId: string,
    targetId: string,
  ): GameState {
    const effect = makeEffect({
      sourceCardInstanceId: sourceId,
      appliesTo: [targetId],
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 } }],
    });
    return {
      ...state,
      activeEffects: [...state.activeEffects, effect as unknown as GameState["activeEffects"][number]],
    };
  }

  it("strips target-side effect entries when a Character is KO'd in battle", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    // Strong attacker, buffed target — target will KO after damage.
    const strongCard: CardData = { ...CARDS.VANILLA, id: "STRONG-KO", power: 6000 };
    cardDb.set(strongCard.id, strongCard);

    const attacker: CardInstance = {
      instanceId: "atk-ko",
      cardId: strongCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const target: CardInstance = {
      instanceId: "tgt-ko",
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "RESTED",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: [attacker, null, null, null, null],
    };
    newPlayers[1] = {
      ...newPlayers[1],
      characters: [target, null, null, null, null],
    };
    state = { ...state, players: newPlayers };
    state = seedCrossBuff(state, "p1-leader", target.instanceId);

    expect(state.activeEffects).toHaveLength(1);

    // Attack → pass blocker → pass counter → damage step KO's the target.
    let result = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId },
      cardDb,
      0,
    );
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    expect(
      result.state.players[1].trash.some((c) => c.cardId === CARDS.VANILLA.id),
    ).toBe(true);
    expect(result.state.activeEffects).toHaveLength(0);
  });
});

// ─── Integration: full Marco [On K.O.] re-summon, fresh instance ─────────────

describe("OPT-256: Marco [On K.O.] re-summon is a fresh instance", () => {
  it("replays Marco with a new instanceId, no DON, and no stale modifiers", () => {
    const cardDb = createTestCardDb();
    const marcoCard: CardData = {
      id: OP02_018_MARCO.card_id!,
      name: "Marco",
      type: "Character",
      color: ["Blue"],
      cost: 4,
      power: 5000,
      counter: 1000,
      life: null,
      attribute: ["Special"],
      types: ["Whitebeard Pirates"],
      effectText: "[Blocker] [On K.O.] ... play this from trash rested.",
      triggerText: null,
      keywords: {
        rush: false,
        rushCharacter: false,
        doubleAttack: false,
        banish: false,
        blocker: true,
        trigger: false,
        unblockable: false,
      },
      effectSchema: OP02_018_MARCO,
      imageUrl: null,
    };
    cardDb.set(marcoCard.id, marcoCard);

    // A Whitebeard Pirates hand card Marco can trash as cost.
    const wbpHandCard: CardData = {
      ...CARDS.VANILLA,
      id: "WBP-HAND",
      types: ["Whitebeard Pirates"],
    };
    cardDb.set(wbpHandCard.id, wbpHandCard);

    let state = createBattleReadyState(cardDb);

    const strongCard: CardData = { ...CARDS.VANILLA, id: "STRONG-MARCO-256", power: 7000 };
    cardDb.set(strongCard.id, strongCard);

    const attacker: CardInstance = {
      instanceId: "atk-marco-256",
      cardId: strongCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const marco: CardInstance = {
      instanceId: "marco-256-old",
      cardId: marcoCard.id,
      zone: "CHARACTER",
      state: "RESTED",
      attachedDon: [
        { instanceId: "don-m-1", state: "ACTIVE", attachedTo: "marco-256-old" },
        { instanceId: "don-m-2", state: "ACTIVE", attachedTo: "marco-256-old" },
      ],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };

    const wbpHandInst: CardInstance = {
      instanceId: "wbp-hand-1",
      cardId: wbpHandCard.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };

    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: [attacker, null, null, null, null],
    };
    newPlayers[1] = {
      ...newPlayers[1],
      characters: [marco, null, null, null, null],
      hand: [wbpHandInst, ...newPlayers[1].hand],
      // Drop life to satisfy Marco's "2 or less Life" condition.
      life: newPlayers[1].life.slice(0, 2),
    };
    state = { ...state, players: newPlayers };
    state = registerTriggersForCard(state, marco, marcoCard);

    // Seed a cross-character +1000 power buff targeting the old Marco.
    const buff: RuntimeActiveEffect = {
      id: "buff-marco-old",
      sourceCardInstanceId: "p1-buffer",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
      controller: 1,
      appliesTo: [marco.instanceId],
      timestamp: 1,
    };
    state = {
      ...state,
      activeEffects: [...state.activeEffects, buff as unknown as GameState["activeEffects"][number]],
    };

    // Sanity: old Marco reads as base + buff before the KO.
    expect(getEffectivePower(marco, marcoCard, state, cardDb)).toBe(
      (marcoCard.power ?? 0) + 1000,
    );

    const p1DonBefore = state.players[1].donCostArea.length;

    // Attack → pass blocker → pass counter → damage KO's Marco → [On K.O.] prompts.
    let result = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: marco.instanceId },
      cardDb,
      0,
    );
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    // DON should already be returned to the cost area (rested) at the KO site.
    expect(result.state.players[1].donCostArea.length).toBe(p1DonBefore + 2);

    // Accept the optional [On K.O.] via the effect-stack resume path (this is
    // what GameSession.resumeFromPrompt does for PLAYER_CHOICE/SELECT_TARGET
    // responses — runPipeline is only for fresh GameActions).
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    let stepState = { ...result.state, pendingPrompt: null };
    let step = resumeFromStack(stepState, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);

    // If the cost did not auto-resolve, select the WBP hand card.
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(
        { ...step.state, pendingPrompt: null },
        { type: "SELECT_TARGET", selectedInstanceIds: [wbpHandInst.instanceId] },
        cardDb,
      );
    }
    result = { state: step.state, valid: true, pendingPrompt: step.pendingPrompt };

    // ── The invariants ────────────────────────────────────────────────────
    const p1 = result.state.players[1];
    const newMarco = p1.characters.find((c) => c?.cardId === marcoCard.id) ?? null;
    expect(newMarco).not.toBeNull();

    // 1. Fresh instanceId — different from the KO'd Marco.
    expect(newMarco!.instanceId).not.toBe(marco.instanceId);

    // 2. No DON attached to the replayed Marco.
    expect(newMarco!.attachedDon).toHaveLength(0);

    // 3. Fresh played-this-turn flag (§3-7-5): the re-summoned Marco registers
    // as played on the CURRENT turn, not the old Marco's turnPlayed history.
    expect(newMarco!.turnPlayed).toBe(result.state.turn.number);

    // 3b. Played rested per Marco's card text ("...play this Character card
    // from your trash rested"). Exercises the entry_state schema param at
    // the re-summon site (regressed once when OP02-018 carried a typo
    // `play_state` that silently defaulted to ACTIVE).
    expect(newMarco!.state).toBe("RESTED");

    // 4. The cross-character +1000 buff entry is gone — not just inactive.
    expect(result.state.activeEffects.some((e) => (e as RuntimeActiveEffect).id === "buff-marco-old")).toBe(false);

    // 5. Effective power is base (no stale buff applied).
    expect(getEffectivePower(newMarco!, marcoCard, result.state, cardDb)).toBe(
      marcoCard.power ?? 0,
    );

    // 6. No trigger registry entry still points at the old instanceId.
    expect(
      result.state.triggerRegistry.some(
        (t) => (t as { sourceCardInstanceId: string }).sourceCardInstanceId === marco.instanceId,
      ),
    ).toBe(false);
  });
});
