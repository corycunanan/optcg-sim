/**
 * Regression test for OP07-118 Sabo — dual-target KO with optional + TRASH_FROM_HAND cost.
 * Verifies the engine produces correct dual_targets prompt after cost payment.
 */
import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { EffectSchema, EffectBlock, EffectResult } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { OP07_118_SABO } from "../engine/schemas/op07.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id, name: id, type: "Character", color: ["Red"], cost: 3, power: 4000,
    counter: null, life: null, attribute: [], types: [], effectText: "",
    triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
    ...overrides,
  };
}

function makeInstance(cardId: string, zone: string, owner: 0 | 1, overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 6)}`,
    cardId, zone: zone as any, state: "ACTIVE", attachedDon: [],
    turnPlayed: null, controller: owner, owner, ...overrides,
  };
}

describe("OP07-118 Sabo dual-target KO", () => {
  function buildScenario() {
    const cardDb = new Map<string, CardData>();
    cardDb.set("LEADER-T", makeCard("LEADER-T", { type: "Leader", cost: null, power: 5000, life: 5 }));
    cardDb.set("VANILLA", makeCard("VANILLA", { cost: 3, power: 4000 }));
    cardDb.set("COST2", makeCard("COST2", { cost: 2, power: 3000 }));
    cardDb.set("COST5", makeCard("COST5", { cost: 5, power: 6000 }));
    cardDb.set("OP07-118", makeCard("OP07-118", {
      name: "Sabo", cost: 5, power: 6000, color: ["Black"],
      effectSchema: OP07_118_SABO,
    }));

    // Player 0 has Sabo on field + 2 cards in hand (for trash cost)
    const hand0card1 = makeInstance("VANILLA", "HAND", 0, { instanceId: "hand-0-card1" });
    const hand0card2 = makeInstance("VANILLA", "HAND", 0, { instanceId: "hand-0-card2" });
    const sabo = makeInstance("OP07-118", "CHARACTER", 0, { instanceId: "sabo-inst" });

    // Opponent has 2 characters: cost 2 and cost 5
    const oppCost2 = makeInstance("COST2", "CHARACTER", 1, { instanceId: "opp-cost2" });
    const oppCost5 = makeInstance("COST5", "CHARACTER", 1, { instanceId: "opp-cost5" });

    const makePlayer = (idx: 0 | 1): PlayerState => ({
      userId: `user-${idx}`, playerId: `user-${idx}`,
      leader: makeInstance("LEADER-T", "LEADER", idx, { instanceId: `leader-${idx}` }),
      characters: (() => { const c: (CardInstance | null)[] = [null,null,null,null,null]; const arr = idx === 0 ? [sabo] : [oppCost2, oppCost5]; arr.forEach((x,i) => c[i] = x); return c; })(),
      stage: null,
      hand: idx === 0 ? [hand0card1, hand0card2] : [],
      deck: Array.from({ length: 20 }, (_, i) =>
        makeInstance("VANILLA", "DECK", idx, { instanceId: `deck-${idx}-${i}` }),
      ),
      trash: [],
      life: Array.from({ length: 5 }, (_, i) => ({
        instanceId: `life-${idx}-${i}`, cardId: "VANILLA", face: "DOWN" as const,
      })),
      removedFromGame: [],
      donDeck: [],
      donCostArea: Array.from({ length: 6 }, (_, i) => ({
        instanceId: `don-${idx}-${i}`, state: "ACTIVE" as const, attachedTo: null,
      })),
    });

    const state: GameState = {
      id: "test-op07-118",
      status: "IN_PROGRESS",
      winner: null,
      players: [makePlayer(0), makePlayer(1)],
      turn: {
        number: 3, activePlayerIndex: 0, phase: "MAIN",
        battleSubPhase: null, battle: null,
        actionsPerformedThisTurn: [], oncePerTurnUsed: {},
        extraTurnsPending: 0,
      },
      activeEffects: [], prohibitions: [], scheduledActions: [],
      oneTimeModifiers: [], triggerRegistry: [], effectStack: [],
      pendingPrompt: null, eventLog: [], winReason: null,
    } as GameState;

    return { state, cardDb, sabo, oppCost2, oppCost5, hand0card1 };
  }

  it("full flow: optional → cost selection → dual KO prompt with countMax=2 → KO executes", () => {
    const { state, cardDb, sabo, oppCost2, oppCost5, hand0card1 } = buildScenario();
    const block = OP07_118_SABO.effects[0] as EffectBlock;

    // Step 1: resolveEffect → should prompt OPTIONAL_EFFECT
    const step1 = resolveEffect(state, block, sabo.instanceId, 0, cardDb);
    expect(step1.pendingPrompt).toBeDefined();
    expect(step1.pendingPrompt!.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(step1.state.effectStack.length).toBe(1);

    // Step 2: Accept optional effect → should prompt for TRASH_FROM_HAND cost
    const step2 = resumeFromStack(
      step1.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );
    expect(step2.pendingPrompt).toBeDefined();
    const opts2 = step2.pendingPrompt!.options;
    expect(opts2.promptType).toBe("SELECT_TARGET");
    if (opts2.promptType !== "SELECT_TARGET") throw new Error("unexpected prompt type");
    // This should be the cost selection prompt
    expect(opts2.ctaLabel).toBe("Trash");
    expect(opts2.countMin).toBe(1);
    expect(opts2.countMax).toBe(1);

    // Step 3: Select a card to trash → should now prompt for KO targets
    const step3 = resumeFromStack(
      step2.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [hand0card1.instanceId] },
      cardDb,
    );
    expect(step3.pendingPrompt).toBeDefined();
    const opts3 = step3.pendingPrompt!.options;
    expect(opts3.promptType).toBe("SELECT_TARGET");
    if (opts3.promptType !== "SELECT_TARGET") throw new Error("unexpected prompt type");
    // THIS is the KO target prompt — should allow 2 selections
    expect(opts3.countMin).toBe(0);
    expect(opts3.countMax).toBe(2);
    expect(opts3.dualTargets).toBeDefined();
    expect(opts3.dualTargets!.slots).toHaveLength(2);

    // Step 4: Select both targets → should KO them
    const step4 = resumeFromStack(
      step3.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [oppCost2.instanceId, oppCost5.instanceId] },
      cardDb,
    );
    // No more prompts
    expect(step4.pendingPrompt).toBeUndefined();
    expect(step4.resolved).toBe(true);

    // Verify both characters were KO'd
    const opp = step4.state.players[1];
    expect(opp.characters.find(c => c?.instanceId === oppCost2.instanceId)).toBeFalsy();
    expect(opp.characters.find(c => c?.instanceId === oppCost5.instanceId)).toBeFalsy();
    expect(opp.trash.length).toBe(2);
  });

  it("OPT-174: rejects [cost5, cost5] selection — only cost_max:5 slot can hold a cost-5", () => {
    // Build a scenario where opponent has TWO cost-5 characters.
    const { state: base, cardDb, sabo, hand0card1 } = buildScenario();
    // Replace opponent characters with two cost-5s
    const opp5a = makeInstance("COST5", "CHARACTER", 1, { instanceId: "opp-cost5-a" });
    const opp5b = makeInstance("COST5", "CHARACTER", 1, { instanceId: "opp-cost5-b" });
    const oppChars: (CardInstance | null)[] = [opp5a, opp5b, null, null, null];
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], characters: oppChars };
    const state: GameState = { ...base, players: newPlayers };

    const block = OP07_118_SABO.effects[0] as EffectBlock;
    const step1 = resolveEffect(state, block, sabo.instanceId, 0, cardDb);
    const step2 = resumeFromStack(step1.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);
    const step3 = resumeFromStack(step2.state, { type: "SELECT_TARGET", selectedInstanceIds: [hand0card1.instanceId] }, cardDb);
    expect(step3.pendingPrompt).toBeDefined();

    // Player attempts to select both cost-5 characters as KO targets — illegal:
    // slot 0 (cost_max:5, up_to:1) can take one of them, slot 1 (cost_max:3, up_to:1)
    // cannot accommodate either. Engine must reject and re-prompt rather than KO one.
    const step4 = resumeFromStack(
      step3.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [opp5a.instanceId, opp5b.instanceId] },
      cardDb,
    );

    // Both cost-5 characters must remain on the field — the illegal selection
    // must be rejected wholesale (no partial KO).
    const opp = step4.state.players[1];
    expect(opp.characters.find(c => c?.instanceId === opp5a.instanceId)).toBeTruthy();
    expect(opp.characters.find(c => c?.instanceId === opp5b.instanceId)).toBeTruthy();
    expect(opp.trash.length).toBe(0);
    // And the prompt should still be active for re-selection.
    expect(step4.pendingPrompt).toBeDefined();
  });
});
