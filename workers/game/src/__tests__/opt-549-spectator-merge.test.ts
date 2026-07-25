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
  mergePlayerViewsForSpectator,
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

function filteredViews(state: GameState) {
  return {
    playerZeroView: filterStateForPlayer(state, 0),
    playerOneView: filterStateForPlayer(state, 1),
  };
}

function mergeDirectly(
  source: GameState,
  playerZeroView: GameState,
  playerOneView: GameState,
) {
  return () => mergePlayerViewsForSpectator(
    source,
    playerZeroView,
    playerOneView,
  );
}

const publicEvent: GameEvent = {
  type: "PHASE_CHANGED",
  playerIndex: 0,
  payload: { from: "DON", to: "MAIN" },
  timestamp: 100,
};

describe("OPT-549 spectator per-viewer merge", () => {
  it("enumerates every field rewritten by the player filter", () => {
    expect(SPECTATOR_PLAYER_VIEW_FIELDS)
      .toEqual(PLAYER_VIEW_REWRITTEN_FIELDS);
  });

  it("throws on an unhandled top-level player-view divergence", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);
    const divergentStatus: GameState["status"] =
      playerOneView.status === "FINISHED" ? "IN_PROGRESS" : "FINISHED";

    expect(mergeDirectly(
      state,
      playerZeroView,
      { ...playerOneView, status: divergentStatus },
    )).toThrow(
      "Spectator visibility invariant violated: unhandled player-view field status differs",
    );
  });

  it("throws when promptRespondingPlayer differs between player views", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);

    expect(mergeDirectly(
      state,
      { ...playerZeroView, promptRespondingPlayer: 0 },
      { ...playerOneView, promptRespondingPlayer: 1 },
    )).toThrow(
      "Spectator visibility invariant violated: promptRespondingPlayer differs between player views",
    );
  });

  it("throws when effectStack differs between player views", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);
    const syntheticStack = (
      [{ id: "viewer-specific-frame" }] as unknown
    ) as GameState["effectStack"];

    expect(mergeDirectly(
      state,
      playerZeroView,
      { ...playerOneView, effectStack: syntheticStack },
    )).toThrow(
      "Spectator visibility invariant violated: effectStack differs between player views",
    );
  });

  it("throws when filtered views come from a different authoritative id", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);
    const differentSource = { ...state, id: "different-source" };

    expect(mergeDirectly(
      differentSource,
      playerZeroView,
      playerOneView,
    )).toThrow(
      "Spectator visibility invariant violated: player views do not match authoritative state id",
    );
  });

  it("throws when the same filtered player view is supplied twice", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView } = filteredViews(state);

    expect(mergeDirectly(
      state,
      playerZeroView,
      playerZeroView,
    )).toThrow(
      "Spectator visibility invariant violated: player views are not their indexed owner views",
    );
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

  it("throws on event-log length mismatch with the specific invariant", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);

    expect(mergeDirectly(
      state,
      { ...playerZeroView, eventLog: [] },
      { ...playerOneView, eventLog: [publicEvent] },
    )).toThrow(
      "Spectator visibility invariant violated: eventLog lengths differ between player views",
    );
  });

  it.each([
    {
      name: "type",
      playerZeroEvents: [publicEvent],
      playerOneEvents: [{
        ...publicEvent,
        type: "TURN_STARTED",
        payload: {},
      } as GameEvent],
    },
    {
      name: "player",
      playerZeroEvents: [publicEvent],
      playerOneEvents: [{ ...publicEvent, playerIndex: 1 } as GameEvent],
    },
    {
      name: "timestamp",
      playerZeroEvents: [publicEvent],
      playerOneEvents: [{ ...publicEvent, timestamp: 101 } as GameEvent],
    },
    {
      name: "order",
      playerZeroEvents: [
        publicEvent,
        { ...publicEvent, timestamp: 101 } as GameEvent,
      ],
      playerOneEvents: [
        { ...publicEvent, timestamp: 101 } as GameEvent,
        publicEvent,
      ],
    },
  ])("throws on event-log $name mismatch at the exact position", ({
    playerZeroEvents,
    playerOneEvents,
  }) => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);

    expect(mergeDirectly(
      state,
      { ...playerZeroView, eventLog: playerZeroEvents },
      { ...playerOneView, eventLog: playerOneEvents },
    )).toThrow(
      "Spectator visibility invariant violated: eventLog[0] order differs between player views",
    );
  });

  it("throws on a divergent public event with the specific invariant", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);
    const divergentPublicEvent: GameEvent = {
      ...publicEvent,
      payload: { from: "DRAW", to: "DON" },
    };

    expect(mergeDirectly(
      state,
      { ...playerZeroView, eventLog: [publicEvent] },
      { ...playerOneView, eventLog: [divergentPublicEvent] },
    )).toThrow(
      "Spectator visibility invariant violated: public eventLog[0] differs between player views",
    );
  });

  it("throws on equal-count ambiguous event redaction with the specific invariant", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);
    const playerZeroEvent: GameEvent = {
      type: "CARD_DRAWN",
      playerIndex: 0,
      payload: { cardId: "hidden", cardInstanceId: "visible-to-one" },
      timestamp: 200,
    };
    const playerOneEvent: GameEvent = {
      ...playerZeroEvent,
      payload: { cardId: "visible-to-zero", cardInstanceId: "hidden" },
    };

    expect(mergeDirectly(
      state,
      { ...playerZeroView, eventLog: [playerZeroEvent] },
      { ...playerOneView, eventLog: [playerOneEvent] },
    )).toThrow(
      "Spectator visibility invariant violated: eventLog[0] has ambiguous redaction",
    );
  });

  it("throws when both player views retain a prompt", () => {
    const { state } = getMainPhaseState();
    const source = stateWithEveryViewerDivergence(state);
    const { playerZeroView, playerOneView } = filteredViews(source);
    const retainedForZero: PendingPromptState = {
      ...source.pendingPrompt!,
      respondingPlayer: 0,
    };

    expect(mergeDirectly(
      source,
      { ...playerZeroView, pendingPrompt: retainedForZero },
      playerOneView,
    )).toThrow(
      "Spectator visibility invariant violated: both player views contain pendingPrompt",
    );
  });

  it("throws when the viewer-invariant turn remainder diverges", () => {
    const { state } = getMainPhaseState();
    const { playerZeroView, playerOneView } = filteredViews(state);
    const divergentPlayerOne = {
      ...playerOneView,
      turn: { ...playerOneView.turn, phase: "END" as const },
    };

    expect(mergeDirectly(
      state,
      playerZeroView,
      divergentPlayerOne,
    )).toThrow(
      "Spectator visibility invariant violated: turn (excluding spectator-union fields) differs between player views",
    );
  });

  it("throws when both views retain different battle Trigger Life cards", () => {
    const { state } = getMainPhaseState();
    const source = stateWithEveryViewerDivergence(state);
    const { playerZeroView, playerOneView } = filteredViews(source);
    const playerZeroLifeCard = source.players[0].life[0]!;
    const playerZeroBattle = playerZeroView.turn.battle!;

    expect(mergeDirectly(
      source,
      {
        ...playerZeroView,
        turn: {
          ...playerZeroView.turn,
          battle: {
            ...playerZeroBattle,
            pendingTriggerLifeCard: playerZeroLifeCard,
          },
        },
      },
      playerOneView,
    )).toThrow(
      "Spectator visibility invariant violated: turn.battle.pendingTriggerLifeCard differs between player views",
    );
  });

  it("throws when both views retain different effect Trigger continuations", () => {
    const { state } = getMainPhaseState();
    const source = stateWithEveryViewerDivergence(state);
    const { playerZeroView, playerOneView } = filteredViews(source);
    const retainedForZero = {
      ...source.turn.pendingTriggerFromEffect!,
      lifeCard: source.players[0].life[0]!,
      damagedPlayerIndex: 0 as const,
    };

    expect(mergeDirectly(
      source,
      {
        ...playerZeroView,
        turn: {
          ...playerZeroView.turn,
          pendingTriggerFromEffect: retainedForZero,
        },
      },
      playerOneView,
    )).toThrow(
      "Spectator visibility invariant violated: turn.pendingTriggerFromEffect differs between player views",
    );
  });

  it("throws when both views retain different battle damage continuations", () => {
    const { state } = getMainPhaseState();
    const source = stateWithEveryViewerDivergence(state);
    const { playerZeroView, playerOneView } = filteredViews(source);
    const retainedForZero = {
      ...source.turn.pendingBattleDamageContinuation!,
      battleId: "different-battle",
      damagedPlayerIndex: 0 as const,
    };

    expect(mergeDirectly(
      source,
      {
        ...playerZeroView,
        turn: {
          ...playerZeroView.turn,
          pendingBattleDamageContinuation: retainedForZero,
        },
      },
      playerOneView,
    )).toThrow(
      "Spectator visibility invariant violated: turn.pendingBattleDamageContinuation differs between player views",
    );
  });

  it("preserves a battle shape with no pendingTriggerLifeCard property", () => {
    const { state } = getMainPhaseState();
    const sourceWithTrigger = stateWithEveryViewerDivergence(state);
    const {
      pendingTriggerLifeCard: _pendingTriggerLifeCard,
      ...battleWithoutPendingTrigger
    } = sourceWithTrigger.turn.battle!;
    const source: GameState = {
      ...sourceWithTrigger,
      turn: {
        ...sourceWithTrigger.turn,
        battle: battleWithoutPendingTrigger,
      },
    };
    const { playerZeroView, playerOneView } = filteredViews(source);

    const spectator = mergePlayerViewsForSpectator(
      source,
      playerZeroView,
      playerOneView,
    );

    expect(spectator.turn.battle).not.toBeNull();
    expect(spectator.turn.battle).not.toHaveProperty(
      "pendingTriggerLifeCard",
    );
  });
});
