import { describe, expect, it } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP13_001_MONKEY_D_LUFFY } from "../engine/schemas/op13.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type {
  CardData,
  DonInstance,
  GameAction,
  GameState,
  PlayerState,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";

const lifecycleServices = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};

function makeLuffyLeader(): CardData {
  return {
    ...CARDS.LEADER,
    id: "OP13-001",
    name: "Monkey.D.Luffy",
    color: ["Red", "Green"],
    types: ["Straw Hat Crew"],
    effectSchema: OP13_001_MONKEY_D_LUFFY,
  };
}

function setupLuffyDefender(activeDonCount = 5) {
  const cardDb = createTestCardDb();
  const luffyData = makeLuffyLeader();
  cardDb.set(luffyData.id, luffyData);

  let state = createBattleReadyState(cardDb);
  const leader = {
    ...state.players[1].leader,
    cardId: luffyData.id,
    attachedDon: [
      {
        instanceId: "opt613-luffy-attached-don",
        state: "ACTIVE" as const,
        attachedTo: state.players[1].leader.instanceId,
      },
    ],
  };
  const activeDon: DonInstance[] = Array.from({ length: activeDonCount }, (_, index) => ({
    instanceId: `opt613-active-don-${index}`,
    state: "ACTIVE",
    attachedTo: null,
  }));
  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = {
    ...players[1],
    leader,
    donCostArea: activeDon,
  };
  state = { ...state, players };
  state = registerTriggersForCard(state, leader, luffyData);

  return { state, cardDb, luffyData, leader };
}

function respond(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): GameState {
  const result = resumePromptLifecycle(
    state,
    action,
    cardDb,
    lifecycleServices,
  );
  expect(result.responseRejected).toBe(false);
  return result.state;
}

describe("OPT-613 — variable DON!! rest costs", () => {
  it("runs OP13-001 end to end: rest 3, grant +6000, then expire at battle end", () => {
    const { state, cardDb, luffyData, leader } = setupLuffyDefender();
    const attacker = state.players[0].characters[0]!;
    const powerBefore = getEffectivePower(leader, luffyData, state, cardDb);

    const declared = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: leader.instanceId,
      },
      cardDb,
      0,
    );
    expect(declared.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    let current = respond(
      declared.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" },
      cardDb,
    );
    expect(current.pendingPrompt?.options).toEqual({
      promptType: "PLAYER_CHOICE",
      effectDescription: "Choose how many DON!! cards to rest",
      choices: [
        { id: "don-rest:1", label: "Rest 1 → +2000" },
        { id: "don-rest:2", label: "Rest 2 → +4000" },
        { id: "don-rest:3", label: "Rest 3 → +6000" },
        { id: "don-rest:4", label: "Rest 4 → +8000" },
        { id: "don-rest:5", label: "Rest 5 → +10000" },
      ],
      confirmOrSkip: true,
    });

    current = respond(
      current,
      { type: "PLAYER_CHOICE", choiceId: "don-rest:3" },
      cardDb,
    );
    expect(current.players[1].donCostArea.filter((don) => don.state === "RESTED"))
      .toHaveLength(3);
    expect(current.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    current = respond(
      current,
      { type: "SELECT_TARGET", selectedInstanceIds: [leader.instanceId] },
      cardDb,
    );
    const poweredLeader = current.players[1].leader;
    expect(getEffectivePower(poweredLeader, luffyData, current, cardDb))
      .toBe(powerBefore + 6000);

    let battle = runPipeline(current, { type: "PASS" }, cardDb, 0);
    expect(battle.valid).toBe(true);
    battle = runPipeline(battle.state, { type: "PASS" }, cardDb, 0);
    expect(battle.valid).toBe(true);
    expect(battle.state.turn.battle).toBeNull();
    expect(getEffectivePower(battle.state.players[1].leader, luffyData, battle.state, cardDb))
      .toBe(powerBefore);
  });

  it("treats OP13-001 as unpayable with zero active DON!! without prompting or mutation", () => {
    const { state, cardDb, leader } = setupLuffyDefender(0);
    const offered = resolveEffect(
      state,
      OP13_001_MONKEY_D_LUFFY.effects[0],
      leader.instanceId,
      1,
      cardDb,
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const activated = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" },
      cardDb,
    );
    expect(activated.pendingPrompt).toBeUndefined();
    expect(activated.state.effectStack).toHaveLength(0);
    expect(activated.state.players).toEqual(state.players);
    expect(activated.state.activeEffects).toEqual(state.activeEffects);
    expect(activated.state.turn.oncePerTurnUsed).toEqual(state.turn.oncePerTurnUsed);
  });

  it("offers only variable DON!! counts that leave the remaining cost suffix payable", () => {
    const cardDb = createTestCardDb();
    const initial = createBattleReadyState(cardDb);
    const players = [...initial.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      donCostArea: players[0].donCostArea.slice(0, 3).map((don) => ({
        ...don,
        state: "ACTIVE" as const,
      })),
    };
    const state = { ...initial, players };
    const block: EffectBlock = {
      id: "opt613-variable-before-fixed-rest",
      category: "activate",
      costs: [
        { type: "REST_DON", amount: "ANY_NUMBER" },
        { type: "REST_DON", amount: 2 },
      ],
      actions: [{ type: "DRAW", params: { amount: 0 } }],
    };

    const prompted = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(prompted.pendingPrompt?.options).toEqual({
      promptType: "PLAYER_CHOICE",
      effectDescription: "Choose how many DON!! cards to rest",
      choices: [{ id: "don-rest:1", label: "Rest 1" }],
      confirmOrSkip: true,
    });
    expect(prompted.state.players).toEqual(state.players);
  });

  it("routes DON_REST ANY_NUMBER through the same chosen-count prompt", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const block: EffectBlock = {
      id: "opt613-don-rest-alias",
      category: "activate",
      costs: [{ type: "DON_REST", amount: "ANY_NUMBER" }],
      actions: [{ type: "DRAW", params: { amount: 0 } }],
    };

    const prompted = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(prompted.pendingPrompt?.options).toMatchObject({
      promptType: "PLAYER_CHOICE",
      confirmOrSkip: true,
    });

    const paid = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "don-rest:2" },
      cardDb,
    );
    expect(paid.pendingPrompt).toBeUndefined();
    expect(paid.state.players[0].donCostArea.filter((don) => don.state === "RESTED"))
      .toHaveLength(2);
  });

  it("Skip declines the effect without resting DON!! or consuming once per turn", () => {
    const { state, cardDb, leader } = setupLuffyDefender();
    const originalBlock = OP13_001_MONKEY_D_LUFFY.effects[0];
    const block: EffectBlock = {
      ...originalBlock,
      id: "opt613-skippable-once-per-turn",
      flags: { optional: true, once_per_turn: true },
    };
    const offered = resolveEffect(
      state,
      block,
      leader.instanceId,
      1,
      cardDb,
    );
    const activated = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" },
      cardDb,
    );
    expect(activated.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const coordinator = new SessionCoordinator();
    const routed = coordinator.routePromptResponse(
      {
        ...activated.state,
        pendingPrompt: activated.pendingPrompt ?? null,
      },
      1,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
    );
    expect(routed.kind).toBe("resume");

    const skipped = resumeFromStack(
      activated.state,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      cardDb,
    );
    expect(skipped.state.players[1].donCostArea.every((don) => don.state === "ACTIVE"))
      .toBe(true);
    expect(skipped.state.activeEffects).toHaveLength(0);
    expect(skipped.state.turn.oncePerTurnUsed[block.id]).toBeUndefined();
  });

  it("keeps fixed REST_DON costs automatic", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const block: EffectBlock = {
      id: "opt613-fixed-rest-don",
      category: "activate",
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [{ type: "DRAW", params: { amount: 0 } }],
    };

    const result = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea.filter((don) => don.state === "RESTED"))
      .toHaveLength(2);
  });
});
