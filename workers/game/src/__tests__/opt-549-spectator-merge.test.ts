import { describe, expect, it } from "vitest";
import type {
  GameEvent,
  GameState,
  PendingPromptState,
} from "../types.js";
import {
  filterStateForPlayer,
  PLAYER_VIEW_REWRITTEN_FIELDS,
} from "../engine/state.js";
import {
  SPECTATOR_PLAYER_VIEW_FIELDS,
  visibleStateForSpectator,
} from "../session/visibility.js";
import { advanceToPhase, setupGame } from "./factories.js";

function getMainPhaseState() {
  const { state, cardDb } = setupGame();
  return { state: advanceToPhase(state, "MAIN", cardDb), cardDb };
}

function secretEventLog(): GameEvent[] {
  return [
    {
      type: "CARD_DRAWN",
      playerIndex: 1,
      payload: { cardId: "DRAW-SECRET", cardInstanceId: "draw-instance" },
      timestamp: 1,
    },
    {
      type: "CARD_RETURNED_TO_HAND",
      playerIndex: 1,
      payload: {
        cardId: "HAND-SECRET",
        cardInstanceId: "hand-instance",
        newCardInstanceId: "new-hand-instance",
      },
      timestamp: 2,
    },
    {
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: 1,
      payload: {
        cardId: "LIFE-HAND-SECRET",
        cardInstanceId: "life-hand-instance",
      },
      timestamp: 3,
    },
    {
      type: "TRIGGER_ACTIVATED",
      playerIndex: 1,
      payload: { cardId: "TRIGGER-SECRET" },
      timestamp: 4,
    },
    {
      type: "CARD_RETURNED_TO_DECK",
      playerIndex: 1,
      payload: {
        cardId: "DECK-SECRET",
        cardInstanceId: "deck-instance",
        newCardInstanceId: "new-deck-instance",
      },
      timestamp: 5,
    },
    {
      type: "CARDS_REVEALED",
      playerIndex: 1,
      payload: {
        cards: [{
          cardId: "REVEAL-SECRET",
          instanceId: "reveal-instance",
        }],
        visibility: "CONTROLLER_ONLY",
        visibleTo: 1,
      },
      timestamp: 6,
    },
    {
      type: "LIFE_SCRIED",
      playerIndex: 1,
      payload: {
        cards: [{ cardId: "SCRY-SECRET", instanceId: "scry-instance" }],
        count: 1,
      },
      timestamp: 7,
    },
    {
      type: "LIFE_REORDERED",
      playerIndex: 1,
      payload: { orderedInstanceIds: ["life-2", "life-1"] },
      timestamp: 8,
    },
    {
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: 1,
      payload: {
        cardInstanceId: "removed-life-instance",
        newCardInstanceId: "new-removed-life-instance",
      },
      timestamp: 9,
    },
  ];
}

function stateWithEveryViewerDivergence(state: GameState): GameState {
  const lifeCard = state.players[1].life[0]!;
  const pendingPrompt: PendingPromptState = {
    promptId: "spectator-prompt",
    options: {
      promptType: "SELECT_TARGET",
      validTargets: state.players[1].hand
        .slice(0, 2)
        .map((card) => card.instanceId),
      countMin: 1,
      countMax: 1,
      effectDescription: "Choose a card from your hand",
      ctaLabel: "Choose",
      cards: state.players[1].hand.slice(0, 2),
    },
    respondingPlayer: 1,
    resumeContext: "engine-private-resume",
  };

  return {
    ...state,
    eventLog: secretEventLog(),
    pendingPrompt,
    turn: {
      ...state.turn,
      activePlayerIndex: 0,
      battleSubPhase: "DAMAGE_STEP",
      battle: {
        battleId: "pending-trigger-battle",
        attackerInstanceId: state.players[0].leader.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
        attackerPower: 5000,
        defenderPower: 5000,
        counterPowerAdded: 0,
        blockerActivated: false,
        pendingTriggerLifeCard: lifeCard,
      },
      pendingTriggerFromEffect: {
        lifeCard,
        damagedPlayerIndex: 1,
        remainingDamages: 1,
        sourceCardInstanceId: state.players[0].leader.instanceId,
        controllerIndex: 0,
      },
      pendingBattleDamageContinuation: {
        battleId: "pending-trigger-battle",
        lifeCardInstanceId: lifeCard.instanceId,
        damagedPlayerIndex: 1,
        stage: "LIFE_REMOVAL",
      },
    },
  };
}

describe("OPT-549 spectator per-viewer merge", () => {
  it("enumerates every field rewritten by the player filter", () => {
    expect(SPECTATOR_PLAYER_VIEW_FIELDS)
      .toEqual(PLAYER_VIEW_REWRITTEN_FIELDS);
  });

  it("exercises every viewer-divergent field and applies its spectator rule", () => {
    const { state, cardDb } = getMainPhaseState();
    const source = stateWithEveryViewerDivergence(state);
    const playerZeroView = filterStateForPlayer(source, 0);
    const playerOneView = filterStateForPlayer(source, 1);
    const spectator = visibleStateForSpectator(source, cardDb);

    const divergentFields = PLAYER_VIEW_REWRITTEN_FIELDS.filter(
      (field) =>
        JSON.stringify(playerZeroView[field]) !==
        JSON.stringify(playerOneView[field]),
    );
    expect(divergentFields).toEqual([
      "players",
      "turn",
      "eventLog",
      "pendingPrompt",
    ]);

    expect(spectator.pendingPrompt).toEqual(playerOneView.pendingPrompt);
    expect(spectator.pendingPrompt?.resumeContext).toBeNull();
    expect(spectator.promptRespondingPlayer).toBe(1);

    expect(spectator.eventLog).toEqual(source.eventLog);
    expect(spectator.eventLog).toHaveLength(source.eventLog.length);
    expect(spectator.eventLog.map((event) => event.type))
      .toEqual(source.eventLog.map((event) => event.type));

    expect(spectator.turn.battle?.pendingTriggerLifeCard)
      .toEqual(source.turn.battle?.pendingTriggerLifeCard);
    expect(spectator.turn.pendingTriggerFromEffect)
      .toEqual(source.turn.pendingTriggerFromEffect);
    expect(spectator.turn.pendingBattleDamageContinuation)
      .toEqual(source.turn.pendingBattleDamageContinuation);
  });

  it("preserves blind-selection redaction in the unioned prompt", () => {
    const { state, cardDb } = getMainPhaseState();
    const source = stateWithEveryViewerDivergence(state);
    const prompt = source.pendingPrompt!;
    if (prompt.options.promptType !== "SELECT_TARGET") {
      throw new Error("Test fixture must use a SELECT_TARGET prompt");
    }
    const blindSource: GameState = {
      ...source,
      pendingPrompt: {
        ...prompt,
        options: {
          ...prompt.options,
          promptType: "SELECT_TARGET",
          blindSelection: true,
        },
      },
    };

    const spectator = visibleStateForSpectator(blindSource, cardDb);
    expect(spectator.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (spectator.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      for (const card of spectator.pendingPrompt.options.cards) {
        expect(card.cardId).toBe("hidden");
      }
    }
  });
});
