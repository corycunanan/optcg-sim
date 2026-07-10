import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState, LifeCard, PlayerState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import {
  continuePipelineFromExecution,
  runPipeline,
} from "../engine/pipeline.js";
import { resumeBattleDamageContinuation } from "../engine/battle.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const OPTIONAL_TRIGGER_SCHEMA: EffectSchema = {
  effects: [
    {
      id: "optional-trigger-draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      flags: { optional: true },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

const LIFE_WATCHER_SCHEMA: EffectSchema = {
  effects: [
    {
      id: "life-removed-draw",
      category: "auto",
      trigger: { event: "CARD_REMOVED_FROM_LIFE", filter: { controller: "OPPONENT" } },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

function withSchema(card: CardData, schema: EffectSchema): CardData {
  return { ...card, effectSchema: schema };
}

function setup(lifeCount: 1 | 2): {
  state: GameState;
  cardDb: Map<string, CardData>;
  attackerId: string;
} {
  const cardDb = createTestCardDb();
  cardDb.set(CARDS.TRIGGER.id, withSchema(CARDS.TRIGGER, OPTIONAL_TRIGGER_SCHEMA));

  const watcherData: CardData = withSchema(
    { ...CARDS.VANILLA, id: "OPT441-WATCHER", name: "Life watcher" },
    LIFE_WATCHER_SCHEMA,
  );
  cardDb.set(watcherData.id, watcherData);

  let state = createBattleReadyState(cardDb);
  const attacker: CardInstance = {
    instanceId: "opt441-double-attacker",
    cardId: CARDS.DOUBLE_ATK.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const watcher: CardInstance = {
    instanceId: "opt441-life-watcher",
    cardId: watcherData.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const top: LifeCard = {
    instanceId: "opt441-trigger-life",
    cardId: CARDS.TRIGGER.id,
    face: "DOWN",
  };
  const second: LifeCard = {
    instanceId: "opt441-second-life",
    cardId: CARDS.VANILLA.id,
    face: "DOWN",
  };

  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([watcher, attacker]),
  };
  players[1] = {
    ...players[1],
    life: lifeCount === 2 ? [top, second] : [top],
  };
  state = { ...state, players };
  state = registerTriggersForCard(state, watcher, watcherData);

  return { state, cardDb, attackerId: attacker.instanceId };
}

function reachOptionalTriggerPrompt(
  state: GameState,
  attackerId: string,
  cardDb: Map<string, CardData>,
) {
  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attackerId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    cardDb,
    0,
  );
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.state.turn.battle?.pendingTriggerLifeCard).toBeTruthy();

  const revealed = runPipeline(
    result.state,
    { type: "REVEAL_TRIGGER", reveal: true },
    cardDb,
    1,
  );
  expect(revealed.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  return revealed;
}

function finishPromptAndDamage(
  state: GameState,
  cardDb: Map<string, CardData>,
  action: { type: "PLAYER_CHOICE"; choiceId: string } | { type: "PASS" },
) {
  const resumed = resumeFromStack(
    { ...state, pendingPrompt: null },
    action,
    cardDb,
  );
  expect(resumed.pendingPrompt).toBeUndefined();
  expect(resumed.state.effectStack).toHaveLength(0);

  let result = continuePipelineFromExecution(
    resumed.state,
    { state: resumed.state, events: [] },
    cardDb,
    1,
  );
  while (
    !result.pendingPrompt
    && !result.gameOver
    && result.state.effectStack.length === 0
    && result.state.turn.pendingBattleDamageContinuation
  ) {
    const continuation = resumeBattleDamageContinuation(result.state, cardDb);
    result = continuePipelineFromExecution(
      continuation.state,
      continuation,
      cardDb,
      1,
    );
  }
  return result;
}

describe("OPT-441 — prompted Life Trigger preserves damage continuation", () => {
  it("publishes CARD_REMOVED_FROM_LIFE before pausing and deals Double Attack's second damage after accept", () => {
    const { state, cardDb, attackerId } = setup(2);
    const watcherHandBefore = state.players[0].hand.length;
    const revealed = reachOptionalTriggerPrompt(state, attackerId, cardDb);

    expect(revealed.state.turn.battleSubPhase).toBe("DAMAGE_STEP");
    expect(revealed.state.turn.battle?.damagesRemaining).toBe(1);
    expect(revealed.state.turn.pendingBattleDamageContinuation).toBeTruthy();
    expect(
      revealed.state.eventLog.filter((event) => event.type === "CARD_REMOVED_FROM_LIFE"),
    ).toHaveLength(1);
    // The watcher is queued behind the still-paused Trigger effect.
    expect(revealed.state.players[0].hand).toHaveLength(watcherHandBefore);

    const final = finishPromptAndDamage(
      revealed.state,
      cardDb,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
    );

    // The watcher observes both the prompted first Life removal and the
    // ordinary second Life removal.
    expect(final.state.players[0].hand).toHaveLength(watcherHandBefore + 2);
    expect(final.state.players[1].life).toHaveLength(0);
    expect(final.state.turn.battle).toBeNull();
    expect(final.state.turn.pendingBattleDamageContinuation).toBeNull();
  });

  it("still deals the second damage when the optional Trigger effect is declined", () => {
    const { state, cardDb, attackerId } = setup(2);
    const revealed = reachOptionalTriggerPrompt(state, attackerId, cardDb);
    const final = finishPromptAndDamage(revealed.state, cardDb, { type: "PASS" });

    expect(final.state.players[1].life).toHaveLength(0);
    expect(final.state.turn.battle).toBeNull();
  });

  it("runs lethal rule processing when the resumed second damage hits zero Life", () => {
    const { state, cardDb, attackerId } = setup(1);
    const revealed = reachOptionalTriggerPrompt(state, attackerId, cardDb);
    const final = finishPromptAndDamage(revealed.state, cardDb, { type: "PASS" });

    expect(final.gameOver).toEqual({ winner: 0, reason: "Player 2's life reached 0" });
    expect(final.state.status).toBe("FINISHED");
    expect(final.state.winner).toBe(0);
  });
});
