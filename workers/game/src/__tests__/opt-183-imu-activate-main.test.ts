/**
 * OPT-183 — Integration: OP13-079 Imu [Activate: Main] across all CHOICE branch states.
 *
 * Exercises the real OP13_079_IMU schema (re-encoded with CHOICE in OPT-181) through
 * runPipeline + resumeFromStack, matching how GameSession routes player input.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import { OP13_079_IMU } from "../engine/schemas/op13.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

const EFFECT_ID = "OP13-079_activate_main";

const IMU_LEADER_CARD: CardData = {
  id: "OP13-079",
  name: "Imu",
  type: "Leader",
  color: ["Black"],
  cost: null,
  power: 5000,
  counter: null,
  life: 5,
  attribute: [],
  types: ["Celestial Dragons"],
  effectText: "",
  triggerText: null,
  keywords: {
    rush: false, rushCharacter: false, doubleAttack: false,
    banish: false, blocker: false, trigger: false, unblockable: false,
  },
  effectSchema: OP13_079_IMU,
  imageUrl: null,
};

const CELESTIAL_DRAGON_CHAR: CardData = {
  id: "TEST-CD-CHAR",
  name: "Test Celestial Dragons Character",
  type: "Character",
  color: ["Black"],
  cost: 2,
  power: 3000,
  counter: 1000,
  life: null,
  attribute: [],
  types: ["Celestial Dragons"],
  effectText: "",
  triggerText: null,
  keywords: {
    rush: false, rushCharacter: false, doubleAttack: false,
    banish: false, blocker: false, trigger: false, unblockable: false,
  },
  effectSchema: null,
  imageUrl: null,
};

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  db.set(IMU_LEADER_CARD.id, IMU_LEADER_CARD);
  db.set(CELESTIAL_DRAGON_CHAR.id, CELESTIAL_DRAGON_CHAR);
  return db;
}

function withPlayer(
  state: ReturnType<typeof createBattleReadyState>,
  playerIdx: 0 | 1,
  patch: Partial<PlayerState>,
) {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], ...patch };
  return { ...state, players: newPlayers };
}

function makeCdCharInstance(suffix: string): CardInstance {
  return {
    instanceId: `cd-char-${suffix}`,
    cardId: CELESTIAL_DRAGON_CHAR.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

interface Scenario {
  state: ReturnType<typeof createBattleReadyState>;
  cardDb: Map<string, CardData>;
  leaderId: string;
}

/**
 * Build a fresh scenario. hasCdChar places one Celestial Dragons Character in
 * slot 0. emptyHand clears player 0's hand. Leader is always swapped to Imu.
 */
function buildScenario(opts: { hasCdChar: boolean; emptyHand: boolean }): Scenario {
  const cardDb = buildCardDb();
  let state = createBattleReadyState(cardDb);

  // Re-point player 0's leader at the real Imu schema.
  const leader = state.players[0].leader;
  const imuLeader: CardInstance = { ...leader, cardId: IMU_LEADER_CARD.id };

  // Remove the two default battle chars (neither is Celestial Dragons) so the
  // only potential payable character is the one we explicitly add.
  const chars: CardInstance[] = opts.hasCdChar ? [makeCdCharInstance("1")] : [];

  state = withPlayer(state, 0, {
    leader: imuLeader,
    characters: padChars(chars),
    ...(opts.emptyHand ? { hand: [] } : {}),
  });

  return { state, cardDb, leaderId: imuLeader.instanceId };
}

function activate(scenario: Scenario) {
  return runPipeline(
    scenario.state,
    { type: "ACTIVATE_EFFECT", cardInstanceId: scenario.leaderId, effectId: EFFECT_ID },
    scenario.cardDb,
    0,
  );
}

/**
 * Imu's activate block is `optional`, so runPipeline first surfaces an
 * OPTIONAL_EFFECT prompt. This helper activates and accepts in one step,
 * returning the next prompt (branch choice or cost target).
 */
function activateAndAccept(scenario: Scenario) {
  const first = activate(scenario);
  expect(first.valid).toBe(true);
  expect(first.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const cleared = { ...first.state, pendingPrompt: null };
  return resumeFromStack(
    cleared,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    scenario.cardDb,
  );
}

describe("OPT-183: OP13-079 Imu [Activate: Main] integration", () => {
  // ─── Scenario 1: both branches payable ────────────────────────────────────

  describe("both branches payable", () => {
    it("after accepting optional, emits PLAYER_CHOICE with 2 branches", () => {
      const scenario = buildScenario({ hasCdChar: true, emptyHand: false });
      expect(scenario.state.players[0].hand.length).toBeGreaterThan(0);

      const afterAccept = activateAndAccept(scenario);

      expect(afterAccept.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      if (afterAccept.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
        expect(afterAccept.pendingPrompt.options.choices).toHaveLength(2);
      }
    });

    it("picking hand branch → select hand card → draw 1, hand card trashed", () => {
      const scenario = buildScenario({ hasCdChar: true, emptyHand: false });
      const afterAccept = activateAndAccept(scenario);

      const afterChoice = resumeFromStack(
        afterAccept.state,
        { type: "PLAYER_CHOICE", choiceId: "1" },
        scenario.cardDb,
      );
      expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

      const handCardId = afterChoice.state.players[0].hand[0].instanceId;
      const deckSizeBefore = afterChoice.state.players[0].deck.length;
      const handSizeBefore = afterChoice.state.players[0].hand.length;

      const final = resumeFromStack(
        afterChoice.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [handCardId] },
        scenario.cardDb,
      );

      const p0 = final.state.players[0];
      expect(p0.trash.find((c) => c.instanceId === handCardId)).toBeTruthy();
      // Net hand delta: -1 trashed + 1 drawn = 0.
      expect(p0.hand.length).toBe(handSizeBefore);
      expect(p0.deck.length).toBe(deckSizeBefore - 1);
    });

    it("picking character branch → select Celestial Dragons char → draw 1, char trashed", () => {
      const scenario = buildScenario({ hasCdChar: true, emptyHand: false });
      const afterAccept = activateAndAccept(scenario);

      const afterChoice = resumeFromStack(
        afterAccept.state,
        { type: "PLAYER_CHOICE", choiceId: "0" },
        scenario.cardDb,
      );
      expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

      const cdCharId = "cd-char-1";
      if (afterChoice.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        expect(afterChoice.pendingPrompt.options.validTargets).toContain(cdCharId);
      }
      const deckSizeBefore = afterChoice.state.players[0].deck.length;

      const final = resumeFromStack(
        afterChoice.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [cdCharId] },
        scenario.cardDb,
      );

      const p0 = final.state.players[0];
      expect(p0.characters.some((c) => c?.instanceId === cdCharId)).toBe(false);
      expect(p0.trash.find((c) => c.instanceId === cdCharId)).toBeTruthy();
      expect(p0.deck.length).toBe(deckSizeBefore - 1);
    });
  });

  // ─── Scenario 2: only hand branch payable ────────────────────────────────

  it("only hand payable → after accept, auto-selects hand branch → SELECT_TARGET on hand", () => {
    const scenario = buildScenario({ hasCdChar: false, emptyHand: false });
    const afterAccept = activateAndAccept(scenario);

    expect(afterAccept.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (afterAccept.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      const handIds = new Set(scenario.state.players[0].hand.map((c) => c.instanceId));
      for (const id of afterAccept.pendingPrompt.options.validTargets) {
        expect(handIds.has(id)).toBe(true);
      }
    }
  });

  // ─── Scenario 3: only character branch payable ───────────────────────────

  it("only character payable → after accept, auto-selects character branch → SELECT_TARGET on char", () => {
    const scenario = buildScenario({ hasCdChar: true, emptyHand: true });
    const afterAccept = activateAndAccept(scenario);

    expect(afterAccept.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (afterAccept.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(afterAccept.pendingPrompt.options.validTargets).toContain("cd-char-1");
    }
  });

  // ─── Scenario 4: neither payable ─────────────────────────────────────────

  it("neither payable → activate is rejected with 'Cost cannot be paid'", () => {
    const scenario = buildScenario({ hasCdChar: false, emptyHand: true });
    const result = activate(scenario);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cost cannot be paid");
  });

  // ─── Scenario 5: once-per-turn ───────────────────────────────────────────

  it("once-per-turn: second activation in same turn produces no prompt or state change", () => {
    const scenario = buildScenario({ hasCdChar: false, emptyHand: false });

    // First activation: accept optional, auto-select hand branch, pick a hand card.
    const afterAccept = activateAndAccept(scenario);
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const handCardId = afterAccept.state.players[0].hand[0].instanceId;

    const resolved = resumeFromStack(
      afterAccept.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [handCardId] },
      scenario.cardDb,
    );
    expect(resolved.state.turn.oncePerTurnUsed[EFFECT_ID]).toContain(scenario.leaderId);

    const deckSizeAfterFirst = resolved.state.players[0].deck.length;
    const handSizeAfterFirst = resolved.state.players[0].hand.length;

    // Second activation same turn: engine no-ops (no prompt, no draw).
    const second = runPipeline(
      resolved.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: scenario.leaderId, effectId: EFFECT_ID },
      scenario.cardDb,
      0,
    );
    expect(second.pendingPrompt).toBeUndefined();
    expect(second.state.players[0].deck.length).toBe(deckSizeAfterFirst);
    expect(second.state.players[0].hand.length).toBe(handSizeAfterFirst);
  });
});

// Satisfy helpers export without side-effects.
void CARDS;
