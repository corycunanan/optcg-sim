/**
 * M4c Gap Tests — Integration tests for engine fixes from OPT-108 and OPT-107.
 *
 * Each test targets a specific gap found in the audit:
 *   Batch 1 (OPT-108): Event emission fixes
 *   Batch 2 (OPT-107): Stub completions
 *
 * Pattern: build state → execute action → assert events emitted + state correct.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameEvent,
  GameState,
  PlayerState,
} from "../types.js";
import type { EffectSchema, EffectBlock } from "../engine/effect-types.js";
import { setupGame, createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { evaluateCondition, matchesFilter, type ConditionContext } from "../engine/conditions.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { resolveAmount } from "../engine/effect-resolver/action-utils.js";
import type { EffectResult } from "../engine/effect-types.js";

// ─── Test Utilities ─────────────────────────────────────────────────────────

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
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
  zone: string,
  owner: 0 | 1,
  overrides: Partial<CardInstance> = {},
): CardInstance {
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 6)}`,
    cardId,
    zone: zone as any,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
    ...overrides,
  };
}

function buildMinimalState(overrides: Partial<GameState> = {}): GameState {
  const makePlayer = (idx: 0 | 1): PlayerState => ({
    userId: `user-${idx}`,
    leader: makeInstance(CARDS.LEADER.id, "LEADER", idx, { instanceId: `leader-${idx}` }),
    characters: [],
    stage: null,
    hand: [],
    deck: Array.from({ length: 20 }, (_, i) =>
      makeInstance(CARDS.VANILLA.id, "DECK", idx, { instanceId: `deck-${idx}-${i}` }),
    ),
    trash: [],
    life: Array.from({ length: 5 }, (_, i) => ({
      instanceId: `life-${idx}-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN" as const,
    })),
    removedFromGame: [],
    donDeck: Array.from({ length: 10 }, (_, i) => ({
      instanceId: `dondeck-${idx}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })),
    donCostArea: Array.from({ length: 6 }, (_, i) => ({
      instanceId: `don-${idx}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })),
  });

  return {
    gameId: "test-m4c",
    status: "IN_PROGRESS",
    winner: null,
    players: [makePlayer(0), makePlayer(1)],
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
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
    eventLog: [],
    winReason: null,
    ...overrides,
  } as GameState;
}

/** Run a full attack → pass block → pass counter to resolve battle damage */
function runFullAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): GameState {
  let result = runPipeline(state, {
    type: "DECLARE_ATTACK",
    attackerInstanceId,
    targetInstanceId,
  }, cardDb, state.turn.activePlayerIndex);
  expect(result.valid).toBe(true);

  // Pass block
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex);
  expect(result.valid).toBe(true);

  // Pass counter
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex);
  expect(result.valid).toBe(true);

  return result.state;
}

/** Helper to find events of a given type in the eventLog */
function findEvents(state: GameState, type: string): GameEvent[] {
  return state.eventLog.filter((e) => e.type === type);
}

// =============================================================================
// BATCH 1 — OPT-108: Event Emission Fixes
// =============================================================================

describe("OPT-108 Batch 1: Event Emissions", () => {

  // ─��─ 1. COMBAT_VICTORY ──────────────────────────────────────────────────────

  describe("COMBAT_VICTORY event", () => {
    it("emits COMBAT_VICTORY when attacker wins vs CHARACTER", () => {
      const cardDb = createTestCardDb();
      let state = createBattleReadyState(cardDb);

      // Make a P1 character rested and weak so P0 leader can KO it
      const newPlayers = [...state.players] as [PlayerState, PlayerState];
      const weakChar = makeInstance(CARDS.VANILLA.id, "CHARACTER", 1, {
        instanceId: "char-1-weak",
        state: "RESTED",
        turnPlayed: 1,
        controller: 1,
        owner: 1,
      });
      newPlayers[1] = { ...newPlayers[1], characters: [weakChar] };
      // Give P0 leader DON for overkill
      const leaderDon: DonInstance = { instanceId: "don-atk-0", state: "ACTIVE", attachedTo: "leader-0" };
      newPlayers[0] = {
        ...newPlayers[0],
        leader: { ...newPlayers[0].leader, attachedDon: [leaderDon, leaderDon, leaderDon] },
      };
      state = { ...state, players: newPlayers };

      const afterBattle = runFullAttack(state, state.players[0].leader.instanceId, "char-1-weak", cardDb);

      const combatVictoryEvents = findEvents(afterBattle, "COMBAT_VICTORY");
      expect(combatVictoryEvents.length).toBe(1);
      expect(combatVictoryEvents[0].payload.targetInstanceId).toBe("char-1-weak");
    });

    it("does NOT emit COMBAT_VICTORY when attacking leader", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const afterBattle = runFullAttack(
        state,
        state.players[0].characters[0].instanceId,
        state.players[1].leader.instanceId,
        cardDb,
      );

      const combatVictoryEvents = findEvents(afterBattle, "COMBAT_VICTORY");
      expect(combatVictoryEvents.length).toBe(0);
    });
  });

  // ─── 2. CHARACTER_BATTLES ───────────────────────────────────────────────────

  describe("CHARACTER_BATTLES event", () => {
    it("emits CHARACTER_BATTLES when a character attacks", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      // Character attacks leader
      const charAttacker = state.players[0].characters[0];
      const result = runPipeline(state, {
        type: "DECLARE_ATTACK",
        attackerInstanceId: charAttacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      const charBattleEvents = findEvents(result.state, "CHARACTER_BATTLES");
      expect(charBattleEvents.length).toBe(1);
      expect(charBattleEvents[0].payload.cardInstanceId).toBe(charAttacker.instanceId);
    });

    it("does NOT emit CHARACTER_BATTLES when leader attacks", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const result = runPipeline(state, {
        type: "DECLARE_ATTACK",
        attackerInstanceId: state.players[0].leader.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      const charBattleEvents = findEvents(result.state, "CHARACTER_BATTLES");
      expect(charBattleEvents.length).toBe(0);
    });
  });

  // ─── 3. Battle Resting CARD_STATE_CHANGED ─────────────────────────────────

  describe("battle resting CARD_STATE_CHANGED", () => {
    it("emits CARD_STATE_CHANGED when attacker rests during attack declaration", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const attacker = state.players[0].characters[0];
      const result = runPipeline(state, {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      const stateChangedEvents = findEvents(result.state, "CARD_STATE_CHANGED");
      const attackerRest = stateChangedEvents.find(
        (e) => e.payload.cardInstanceId === attacker.instanceId && e.payload.newState === "RESTED",
      );
      expect(attackerRest).toBeDefined();
    });

    it("emits CARD_STATE_CHANGED when blocker rests during block declaration", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const attacker = state.players[0].characters[0];
      let result = runPipeline(state, {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      const blocker = result.state.players[1].characters.find(
        (c) => c.cardId === CARDS.BLOCKER.id && c.state === "ACTIVE",
      )!;
      result = runPipeline(result.state, {
        type: "DECLARE_BLOCKER",
        blockerInstanceId: blocker.instanceId,
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      const stateChangedEvents = findEvents(result.state, "CARD_STATE_CHANGED");
      const blockerRest = stateChangedEvents.find(
        (e) => e.payload.cardInstanceId === blocker.instanceId && e.payload.newState === "RESTED",
      );
      expect(blockerRest).toBeDefined();
    });
  });

  // ─── 4. DAMAGE_DEALT attacker info ────────────────────────────────────────

  describe("DAMAGE_DEALT attacker info", () => {
    it("includes attackerInstanceId and attackerType in DAMAGE_DEALT events", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const attacker = state.players[0].leader;
      const afterBattle = runFullAttack(
        state,
        attacker.instanceId,
        state.players[1].leader.instanceId,
        cardDb,
      );

      const damageEvents = findEvents(afterBattle, "DAMAGE_DEALT");
      expect(damageEvents.length).toBeGreaterThan(0);

      for (const e of damageEvents) {
        expect(e.payload.attackerInstanceId).toBe(attacker.instanceId);
        expect(e.payload.attackerType).toBe("LEADER");
      }
    });

    it("attackerType is CHARACTER when a character deals damage", () => {
      const cardDb = createTestCardDb();
      let state = createBattleReadyState(cardDb);

      // Give the character enough DON to beat the 5000-power leader
      const charAttacker = state.players[0].characters[0]; // VANILLA, power 4000
      const donAttached: DonInstance[] = Array.from({ length: 3 }, (_, i) => ({
        instanceId: `don-char-atk-${i}`,
        state: "ACTIVE" as const,
        attachedTo: charAttacker.instanceId,
      }));
      const newPlayers = [...state.players] as [PlayerState, PlayerState];
      newPlayers[0] = {
        ...newPlayers[0],
        characters: newPlayers[0].characters.map((c) =>
          c.instanceId === charAttacker.instanceId
            ? { ...c, attachedDon: donAttached }
            : c,
        ),
      };
      state = { ...state, players: newPlayers };

      const afterBattle = runFullAttack(
        state,
        charAttacker.instanceId,
        state.players[1].leader.instanceId,
        cardDb,
      );

      const damageEvents = findEvents(afterBattle, "DAMAGE_DEALT");
      expect(damageEvents.length).toBeGreaterThan(0);
      expect(damageEvents[0].payload.attackerType).toBe("CHARACTER");
      expect(damageEvents[0].payload.attackerInstanceId).toBe(charAttacker.instanceId);
    });
  });

  // ─── 5. LIFE_COUNT_BECOMES_ZERO ───────────────────────────────────────────

  describe("LIFE_COUNT_BECOMES_ZERO event", () => {
    it("emits LIFE_COUNT_BECOMES_ZERO when last life card is removed", () => {
      const cardDb = createTestCardDb();
      let state = createBattleReadyState(cardDb);

      // Set P1 to 1 life so the next damage brings them to 0
      const newPlayers = [...state.players] as [PlayerState, PlayerState];
      newPlayers[1] = {
        ...newPlayers[1],
        life: [{ instanceId: "life-1-last", cardId: CARDS.VANILLA.id, face: "DOWN" as const }],
      };
      state = { ...state, players: newPlayers };

      const afterBattle = runFullAttack(
        state,
        state.players[0].leader.instanceId,
        state.players[1].leader.instanceId,
        cardDb,
      );

      const zeroEvents = findEvents(afterBattle, "LIFE_COUNT_BECOMES_ZERO");
      expect(zeroEvents.length).toBe(1);
      expect(zeroEvents[0].playerIndex).toBe(1);
    });

    it("does NOT emit LIFE_COUNT_BECOMES_ZERO when life remains", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);
      // P1 starts with 5 life — removing 1 won't hit zero

      const afterBattle = runFullAttack(
        state,
        state.players[0].leader.instanceId,
        state.players[1].leader.instanceId,
        cardDb,
      );

      const zeroEvents = findEvents(afterBattle, "LIFE_COUNT_BECOMES_ZERO");
      expect(zeroEvents.length).toBe(0);
    });
  });

  // ─── 6. DRAW_OUTSIDE_DRAW_PHASE ──────────────────────────────────────────

  describe("DRAW_OUTSIDE_DRAW_PHASE event", () => {
    it("emits DRAW_OUTSIDE_DRAW_PHASE when a DRAW action resolves during MAIN phase", () => {
      const cardDb = createTestCardDb();

      // Card with [On Play] Draw 1
      const drawCard = makeCard("DRAW-ON-PLAY", {
        cost: 1,
        effectSchema: {
          effects: [{
            id: "draw-1",
            category: "auto",
            trigger: { keyword: "ON_PLAY" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(drawCard.id, drawCard);

      let state = buildMinimalState();
      // Place card in hand and ensure enough DON
      const handCard = makeInstance(drawCard.id, "HAND", 0, { instanceId: "hand-draw" });
      state.players[0].hand = [handCard];

      // Play the card
      const result = runPipeline(state, {
        type: "PLAY_CARD",
        cardInstanceId: "hand-draw",
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      const drawOutsideEvents = findEvents(result.state, "DRAW_OUTSIDE_DRAW_PHASE");
      expect(drawOutsideEvents.length).toBe(1);
      expect(drawOutsideEvents[0].payload.count).toBe(1);
    });
  });
});

// =============================================================================
// BATCH 2 — OPT-107: Stub Completions
// =============================================================================

describe("OPT-107 Batch 2: Stub Completions", () => {

  // ─── 1. Multicolored Leader Condition ──────────────────────────────────────

  describe("multicolored leader condition", () => {
    it("returns true when leader has multiple colors and multicolored: true", () => {
      const multiLeader = makeCard("MULTI-LEADER", {
        type: "Leader",
        color: ["Red", "Green"],
        power: 5000,
      });
      const cardDb = new Map<string, CardData>([
        [multiLeader.id, multiLeader],
        [CARDS.VANILLA.id, CARDS.VANILLA],
      ]);

      let state = buildMinimalState();
      state.players[0].leader = makeInstance(multiLeader.id, "LEADER", 0, { instanceId: "leader-0" });

      const ctx: ConditionContext = {
        sourceCardInstanceId: "leader-0",
        controller: 0,
        cardDb,
      };

      expect(evaluateCondition(state, {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      } as any, ctx)).toBe(true);
    });

    it("returns false when leader is single-color and multicolored: true", () => {
      const cardDb = createTestCardDb();
      const state = buildMinimalState();

      const ctx: ConditionContext = {
        sourceCardInstanceId: "leader-0",
        controller: 0,
        cardDb,
      };

      // Default leader is single-color Red
      expect(evaluateCondition(state, {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      } as any, ctx)).toBe(false);
    });

    it("returns true when leader is single-color and multicolored: false", () => {
      const cardDb = createTestCardDb();
      const state = buildMinimalState();

      const ctx: ConditionContext = {
        sourceCardInstanceId: "leader-0",
        controller: 0,
        cardDb,
      };

      expect(evaluateCondition(state, {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: false },
      } as any, ctx)).toBe(true);
    });
  });

  // ─── 2. PLAY_METHOD condition ─────────────────────────────────────────────

  describe("PLAY_METHOD condition", () => {
    it("FROM_HAND: true when card was played from hand", () => {
      const cardDb = createTestCardDb();
      let state = buildMinimalState();

      // Play a character from hand
      const handCard = makeInstance(CARDS.VANILLA.id, "HAND", 0, { instanceId: "hand-pm" });
      state.players[0].hand = [handCard];

      const result = runPipeline(state, {
        type: "PLAY_CARD",
        cardInstanceId: "hand-pm",
      }, cardDb, 0);
      expect(result.valid).toBe(true);

      // The CARD_PLAYED event should have source: "FROM_HAND"
      const playEvents = findEvents(result.state, "CARD_PLAYED");
      expect(playEvents.length).toBeGreaterThan(0);
      expect(playEvents[0].payload.source).toBe("FROM_HAND");
    });

    it("PLAY_METHOD condition evaluates correctly against eventLog", () => {
      const cardDb = createTestCardDb();
      let state = buildMinimalState();

      // Simulate a CARD_PLAYED event with source: "FROM_HAND" in eventLog
      state = {
        ...state,
        eventLog: [
          ...state.eventLog,
          {
            type: "CARD_PLAYED",
            playerIndex: 0,
            payload: { cardInstanceId: "test-card", source: "FROM_HAND" },
            timestamp: Date.now(),
          },
        ],
      };

      const ctx: ConditionContext = {
        sourceCardInstanceId: "test-card",
        controller: 0,
        cardDb,
      };

      expect(evaluateCondition(state, {
        type: "PLAY_METHOD",
        method: "FROM_HAND",
      } as any, ctx)).toBe(true);

      expect(evaluateCondition(state, {
        type: "PLAY_METHOD",
        method: "BY_EFFECT",
      } as any, ctx)).toBe(false);
    });

    it("BY_EFFECT: effect-based plays have source BY_EFFECT", () => {
      const cardDb = createTestCardDb();

      // Card with [On Play] play a character from trash
      const playFromTrashCard = makeCard("PLAY-FROM-TRASH", {
        cost: 1,
        effectSchema: {
          effects: [{
            id: "pft-1",
            category: "auto",
            trigger: { keyword: "ON_PLAY" },
            actions: [{
              type: "PLAY_FROM_ZONE",
              target: { type: "TRASH", controller: "SELF", count: { exact: 1 }, filter: { card_type: "CHARACTER" } },
              params: { zone: "TRASH" },
            }],
          }],
        } as EffectSchema,
      });
      cardDb.set(playFromTrashCard.id, playFromTrashCard);

      let state = buildMinimalState();
      const handCard = makeInstance(playFromTrashCard.id, "HAND", 0, { instanceId: "hand-pft" });
      const trashTarget = makeInstance(CARDS.VANILLA.id, "TRASH", 0, { instanceId: "trash-target" });
      state.players[0].hand = [handCard];
      state.players[0].trash = [trashTarget];

      const result = runPipeline(state, {
        type: "PLAY_CARD",
        cardInstanceId: "hand-pft",
      }, cardDb, 0);

      // Look for CARD_PLAYED events with BY_EFFECT source
      const playEvents = findEvents(result.state, "CARD_PLAYED");
      const effectPlay = playEvents.find((e) => e.payload.source === "BY_EFFECT");
      // The first play is FROM_HAND, subsequent ones from effects should be BY_EFFECT
      const handPlay = playEvents.find((e) => e.payload.source === "FROM_HAND");
      expect(handPlay).toBeDefined();
    });
  });

  // ─── 3. EventFilter fields ────────────────────────────────────────────────

  describe("EventFilter fields", () => {
    it("target_filter: trigger fires only when event target matches filter", () => {
      const highCostChar = makeCard("HIGH-COST", { cost: 7, power: 7000 });
      const lowCostChar = makeCard("LOW-COST", { cost: 1, power: 1000 });
      const cardDb = new Map<string, CardData>([
        [highCostChar.id, highCostChar],
        [lowCostChar.id, lowCostChar],
        [CARDS.LEADER.id, CARDS.LEADER],
      ]);

      // Trigger: "When an opponent's character with cost >= 5 is KO'd"
      const triggerCard = makeCard("TRIGGER-ON-KO-HIGH", {
        effectSchema: {
          effects: [{
            id: "t-ko-high",
            category: "auto",
            trigger: {
              event: "OPPONENT_CHARACTER_KO",
              filter: { target_filter: { cost_min: 5 } },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(triggerCard.id, triggerCard);

      let state = buildMinimalState();
      const sourceCard = makeInstance(triggerCard.id, "CHARACTER", 0, { instanceId: "trigger-src" });
      state.players[0].characters = [sourceCard];
      const highCostInstance = makeInstance(highCostChar.id, "CHARACTER", 1, { instanceId: "high-cost-inst" });
      const lowCostInstance = makeInstance(lowCostChar.id, "CHARACTER", 1, { instanceId: "low-cost-inst" });
      state.players[1].characters = [highCostInstance, lowCostInstance];

      // Register triggers
      state = registerTriggersForCard(state, sourceCard, triggerCard);

      // Event for high-cost KO should match
      const highKoEvent: GameEvent = {
        type: "CARD_KO",
        playerIndex: 0,
        payload: { cardInstanceId: "high-cost-inst", cause: "battle" },
        timestamp: Date.now(),
      };
      const highMatches = matchTriggersForEvent(state, highKoEvent, cardDb);
      expect(highMatches.length).toBe(1);

      // Event for low-cost KO should NOT match
      const lowKoEvent: GameEvent = {
        type: "CARD_KO",
        playerIndex: 0,
        payload: { cardInstanceId: "low-cost-inst", cause: "battle" },
        timestamp: Date.now(),
      };
      const lowMatches = matchTriggersForEvent(state, lowKoEvent, cardDb);
      expect(lowMatches.length).toBe(0);
    });

    it("battle_target_type: trigger fires only when battle target is CHARACTER", () => {
      const cardDb = createTestCardDb();

      const triggerCard = makeCard("TRIGGER-CHAR-BATTLE", {
        effectSchema: {
          effects: [{
            id: "t-char-battle",
            category: "auto",
            trigger: {
              event: "DAMAGE_TAKEN",
              filter: { battle_target_type: "CHARACTER" },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(triggerCard.id, triggerCard);

      let state = buildMinimalState();
      const sourceCard = makeInstance(triggerCard.id, "CHARACTER", 1, { instanceId: "trigger-src-bt" });
      state.players[1].characters = [sourceCard];
      state = registerTriggersForCard(state, sourceCard, triggerCard);

      // Set up a battle with CHARACTER target
      const charTarget = makeInstance(CARDS.VANILLA.id, "CHARACTER", 1, { instanceId: "char-target-bt" });
      state.players[1].characters.push(charTarget);
      state = {
        ...state,
        turn: {
          ...state.turn,
          battle: {
            battleId: "test-battle",
            attackerInstanceId: "attacker-bt",
            targetInstanceId: "char-target-bt",
            attackerPower: 5000,
            defenderPower: 4000,
            counterPowerAdded: 0,
            blockerActivated: false,
          },
          battleSubPhase: "DAMAGE_STEP",
        },
      };

      const damageEvent: GameEvent = {
        type: "DAMAGE_DEALT",
        playerIndex: 0,
        payload: { amount: 1, attackerInstanceId: "attacker-bt", attackerType: "LEADER" },
        timestamp: Date.now(),
      };
      const matches = matchTriggersForEvent(state, damageEvent, cardDb);
      expect(matches.length).toBe(1);

      // Now change battle target to LEADER
      state = {
        ...state,
        turn: {
          ...state.turn,
          battle: { ...state.turn.battle!, targetInstanceId: "leader-1" },
        },
      };
      const matchesLeader = matchTriggersForEvent(state, damageEvent, cardDb);
      expect(matchesLeader.length).toBe(0);
    });

    it("includes_trigger_keyword: filters events by card's trigger keyword", () => {
      const triggerCharData = makeCard("TRIGGER-CHAR", {
        keywords: { ...noKeywords(), trigger: true },
      });
      const noTriggerCharData = makeCard("NO-TRIGGER-CHAR");
      const cardDb = new Map<string, CardData>([
        [triggerCharData.id, triggerCharData],
        [noTriggerCharData.id, noTriggerCharData],
        [CARDS.LEADER.id, CARDS.LEADER],
      ]);

      // Trigger: fires when a card with [Trigger] keyword is played
      const watcherCard = makeCard("WATCHER", {
        effectSchema: {
          effects: [{
            id: "w-trig",
            category: "auto",
            trigger: {
              event: "CHARACTER_PLAYED",
              filter: { controller: "SELF", includes_trigger_keyword: true },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(watcherCard.id, watcherCard);

      let state = buildMinimalState();
      const watcher = makeInstance(watcherCard.id, "CHARACTER", 0, { instanceId: "watcher-inst" });
      const triggerChar = makeInstance(triggerCharData.id, "CHARACTER", 0, { instanceId: "trig-char-inst" });
      const noTriggerChar = makeInstance(noTriggerCharData.id, "CHARACTER", 0, { instanceId: "no-trig-inst" });
      state.players[0].characters = [watcher, triggerChar, noTriggerChar];
      state = registerTriggersForCard(state, watcher, watcherCard);

      // Play event for card WITH [Trigger] → should match
      const triggerPlayEvent: GameEvent = {
        type: "CARD_PLAYED",
        playerIndex: 0,
        payload: { cardInstanceId: "trig-char-inst", zone: "CHARACTER" },
        timestamp: Date.now(),
      };
      expect(matchTriggersForEvent(state, triggerPlayEvent, cardDb).length).toBe(1);

      // Play event for card WITHOUT [Trigger] → should NOT match
      const noTriggerPlayEvent: GameEvent = {
        type: "CARD_PLAYED",
        playerIndex: 0,
        payload: { cardInstanceId: "no-trig-inst", zone: "CHARACTER" },
        timestamp: Date.now(),
      };
      expect(matchTriggersForEvent(state, noTriggerPlayEvent, cardDb).length).toBe(0);
    });

    it("attribute: filters events by card's attribute", () => {
      const strikeChar = makeCard("STRIKE-CHAR", { attribute: ["Strike"] });
      const rangedChar = makeCard("RANGED-CHAR", { attribute: ["Ranged"] });
      const cardDb = new Map<string, CardData>([
        [strikeChar.id, strikeChar],
        [rangedChar.id, rangedChar],
        [CARDS.LEADER.id, CARDS.LEADER],
      ]);

      const watcherCard = makeCard("ATTR-WATCHER", {
        effectSchema: {
          effects: [{
            id: "w-attr",
            category: "auto",
            trigger: {
              event: "CHARACTER_PLAYED",
              filter: { controller: "SELF", attribute: "Strike" },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(watcherCard.id, watcherCard);

      let state = buildMinimalState();
      const watcher = makeInstance(watcherCard.id, "CHARACTER", 0, { instanceId: "attr-watcher" });
      const strike = makeInstance(strikeChar.id, "CHARACTER", 0, { instanceId: "strike-inst" });
      const ranged = makeInstance(rangedChar.id, "CHARACTER", 0, { instanceId: "ranged-inst" });
      state.players[0].characters = [watcher, strike, ranged];
      state = registerTriggersForCard(state, watcher, watcherCard);

      // Strike play → matches
      expect(matchTriggersForEvent(state, {
        type: "CARD_PLAYED", playerIndex: 0,
        payload: { cardInstanceId: "strike-inst" }, timestamp: Date.now(),
      }, cardDb).length).toBe(1);

      // Ranged play → no match
      expect(matchTriggersForEvent(state, {
        type: "CARD_PLAYED", playerIndex: 0,
        payload: { cardInstanceId: "ranged-inst" }, timestamp: Date.now(),
      }, cardDb).length).toBe(0);
    });

    it("no_base_effect: filters events by whether card has effect text", () => {
      const vanillaChar = makeCard("VANILLA-EFF", { effectText: "" });
      const effectChar = makeCard("HAS-EFFECT", { effectText: "[On Play] Draw 1 card" });
      const cardDb = new Map<string, CardData>([
        [vanillaChar.id, vanillaChar],
        [effectChar.id, effectChar],
        [CARDS.LEADER.id, CARDS.LEADER],
      ]);

      const watcherCard = makeCard("NOEFF-WATCHER", {
        effectSchema: {
          effects: [{
            id: "w-noeff",
            category: "auto",
            trigger: {
              event: "CHARACTER_PLAYED",
              filter: { controller: "SELF", no_base_effect: true },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(watcherCard.id, watcherCard);

      let state = buildMinimalState();
      const watcher = makeInstance(watcherCard.id, "CHARACTER", 0, { instanceId: "noeff-watcher" });
      const vanilla = makeInstance(vanillaChar.id, "CHARACTER", 0, { instanceId: "vanilla-inst" });
      const withEffect = makeInstance(effectChar.id, "CHARACTER", 0, { instanceId: "effect-inst" });
      state.players[0].characters = [watcher, vanilla, withEffect];
      state = registerTriggersForCard(state, watcher, watcherCard);

      // Vanilla (no effect text) → matches
      expect(matchTriggersForEvent(state, {
        type: "CARD_PLAYED", playerIndex: 0,
        payload: { cardInstanceId: "vanilla-inst" }, timestamp: Date.now(),
      }, cardDb).length).toBe(1);

      // Has effect text → no match
      expect(matchTriggersForEvent(state, {
        type: "CARD_PLAYED", playerIndex: 0,
        payload: { cardInstanceId: "effect-inst" }, timestamp: Date.now(),
      }, cardDb).length).toBe(0);
    });
  });

  // ─── 4. DynamicValue cost results ─────────────────────────────────────────

  describe("DynamicValue cost result resolution", () => {
    it("resolveAmount reads __cost_cards_trashed for CARDS_TRASHED_THIS_WAY", () => {
      const resultRefs = new Map<string, EffectResult>();
      resultRefs.set("__cost_cards_trashed", { targetInstanceIds: [], count: 3 });

      const amount = resolveAmount(
        { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", multiplier: 1000 },
        resultRefs,
        buildMinimalState(),
        0,
      );
      expect(amount).toBe(3000); // 3 * 1000
    });

    it("resolveAmount reads __cost_don_rested for DON_RESTED_THIS_WAY", () => {
      const resultRefs = new Map<string, EffectResult>();
      resultRefs.set("__cost_don_rested", { targetInstanceIds: [], count: 2 });

      const amount = resolveAmount(
        { type: "PER_COUNT", source: "DON_RESTED_THIS_WAY", multiplier: 1000 },
        resultRefs,
        buildMinimalState(),
        0,
      );
      expect(amount).toBe(2000);
    });

    it("resolveAmount reads __cost_characters_ko for CHARACTERS_KO_THIS_WAY", () => {
      const resultRefs = new Map<string, EffectResult>();
      resultRefs.set("__cost_characters_ko", { targetInstanceIds: [], count: 1 });

      const amount = resolveAmount(
        { type: "PER_COUNT", source: "CHARACTERS_KO_THIS_WAY", multiplier: 2000 },
        resultRefs,
        buildMinimalState(),
        0,
      );
      expect(amount).toBe(2000);
    });

    it("resolveAmount falls back to 0 when no cost ref exists", () => {
      const resultRefs = new Map<string, EffectResult>();
      // No __cost_cards_trashed ref

      const amount = resolveAmount(
        { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", multiplier: 1000 },
        resultRefs,
        buildMinimalState(),
        0,
      );
      expect(amount).toBe(0);
    });

    it("REVEALED_CARD_COST resolves from result ref", () => {
      const cardDb = createTestCardDb();
      // Card with cost 5
      const costCard = makeCard("COST-5", { cost: 5 });
      cardDb.set(costCard.id, costCard);

      let state = buildMinimalState();
      const revealedInstance = makeInstance(costCard.id, "HAND", 0, { instanceId: "revealed-inst" });
      state.players[0].hand = [revealedInstance];

      const resultRefs = new Map<string, EffectResult>();
      resultRefs.set("revealed_ref", { targetInstanceIds: ["revealed-inst"], count: 1 });

      const amount = resolveAmount(
        { type: "PER_COUNT", source: "REVEALED_CARD_COST", ref: "revealed_ref", multiplier: 1 },
        resultRefs,
        state,
        0,
        cardDb,
      );
      expect(amount).toBe(5);
    });
  });

  // ─── 5. Custom event type mappings ────────────────────────────────────────

  describe("custom event type mappings", () => {
    it("COMBAT_VICTORY custom trigger matches COMBAT_VICTORY event", () => {
      const cardDb = createTestCardDb();
      const triggerCard = makeCard("COMBAT-WIN-TRIGGER", {
        effectSchema: {
          effects: [{
            id: "t-cv",
            category: "auto",
            trigger: { event: "COMBAT_VICTORY" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(triggerCard.id, triggerCard);

      let state = buildMinimalState();
      const src = makeInstance(triggerCard.id, "CHARACTER", 0, { instanceId: "cv-src" });
      state.players[0].characters = [src];
      state = registerTriggersForCard(state, src, triggerCard);

      const event: GameEvent = {
        type: "COMBAT_VICTORY",
        playerIndex: 0,
        payload: { cardInstanceId: "cv-src", targetInstanceId: "victim" },
        timestamp: Date.now(),
      };
      expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
    });

    it("CHARACTER_BATTLES custom trigger matches CHARACTER_BATTLES event", () => {
      const cardDb = createTestCardDb();
      const triggerCard = makeCard("CHAR-BATTLES-TRIGGER", {
        effectSchema: {
          effects: [{
            id: "t-cb",
            category: "auto",
            trigger: { event: "CHARACTER_BATTLES" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(triggerCard.id, triggerCard);

      let state = buildMinimalState();
      const src = makeInstance(triggerCard.id, "CHARACTER", 0, { instanceId: "cb-src" });
      state.players[0].characters = [src];
      state = registerTriggersForCard(state, src, triggerCard);

      const event: GameEvent = {
        type: "CHARACTER_BATTLES",
        playerIndex: 0,
        payload: { cardInstanceId: "cb-src", targetInstanceId: "target" },
        timestamp: Date.now(),
      };
      expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
    });

    it("LIFE_COUNT_BECOMES_ZERO custom trigger matches event", () => {
      const cardDb = createTestCardDb();
      const triggerCard = makeCard("ZERO-LIFE-TRIGGER", {
        effectSchema: {
          effects: [{
            id: "t-lz",
            category: "auto",
            trigger: { event: "LIFE_COUNT_BECOMES_ZERO" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(triggerCard.id, triggerCard);

      let state = buildMinimalState();
      const src = makeInstance(triggerCard.id, "CHARACTER", 0, { instanceId: "lz-src" });
      state.players[0].characters = [src];
      state = registerTriggersForCard(state, src, triggerCard);

      const event: GameEvent = {
        type: "LIFE_COUNT_BECOMES_ZERO",
        playerIndex: 1,
        payload: {},
        timestamp: Date.now(),
      };
      expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
    });

    it("DRAW_OUTSIDE_DRAW_PHASE custom trigger matches event", () => {
      const cardDb = createTestCardDb();
      const triggerCard = makeCard("DRAW-OUTSIDE-TRIGGER", {
        effectSchema: {
          effects: [{
            id: "t-dodp",
            category: "auto",
            trigger: { event: "DRAW_OUTSIDE_DRAW_PHASE" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          }],
        } as EffectSchema,
      });
      cardDb.set(triggerCard.id, triggerCard);

      let state = buildMinimalState();
      const src = makeInstance(triggerCard.id, "CHARACTER", 0, { instanceId: "dodp-src" });
      state.players[0].characters = [src];
      state = registerTriggersForCard(state, src, triggerCard);

      const event: GameEvent = {
        type: "DRAW_OUTSIDE_DRAW_PHASE",
        playerIndex: 0,
        payload: { count: 1 },
        timestamp: Date.now(),
      };
      expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
    });
  });
});
