/**
 * Tests for secret zone filtering (§8-4-5).
 *
 * Ensures filterStateForPlayer() strips opponent's hand/deck card identities
 * and face-down life cards, while leaving the player's own zones and all
 * public zones intact.
 */

import { describe, it, expect } from "vitest";
import {
  filterStateForPlayer,
  obfuscatePlayersDecksAndFaceDownLife,
} from "../engine/state.js";
import { visibleStateForSpectator } from "../session/visibility.js";
import { setupGame, advanceToPhase } from "./factories.js";

describe("filterStateForPlayer", () => {
  function getMainPhaseState() {
    const { state, cardDb } = setupGame();
    return advanceToPhase(state, "MAIN", cardDb);
  }

  it("preserves the receiving player's own hand card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Player 0's hand should be untouched
    for (const card of filtered.players[0].hand) {
      expect(card.cardId).not.toBe("hidden");
    }
  });

  it("derives unique deck and face-down Life placeholders for both players", () => {
    const state = getMainPhaseState();
    const players = obfuscatePlayersDecksAndFaceDownLife(state.players);
    const hiddenInstanceIds = players.flatMap((player) => [
      ...player.deck.map((card) => card.instanceId),
      ...player.life
        .filter((card) => card.face === "DOWN")
        .map((card) => card.instanceId),
    ]);

    expect(new Set(hiddenInstanceIds).size).toBe(hiddenInstanceIds.length);
    expect(players[0].deck[0]?.instanceId).toMatch(/^hidden-0-deck-/);
    expect(players[1].deck[0]?.instanceId).toMatch(/^hidden-1-deck-/);
  });

  it("redacts deterministic execution secrets from both player views", () => {
    const state = getMainPhaseState();
    const original = state.executionContext;

    for (const receivingPlayer of [0, 1] as const) {
      const filtered = filterStateForPlayer(state, receivingPlayer);
      expect(filtered.executionContext).toEqual({
        version: 1,
        seed: "redacted",
        rngState: 0,
        idCounter: 0,
        clockEpochMs: 0,
        clockCounter: 0,
        actionBudget: { limit: 0, consumed: 0 },
        trace: { gameId: state.id, traceId: "redacted" },
      });
      expect(filtered.executionContext.seed).not.toBe(original.seed);
      expect(filtered.executionContext.rngState).not.toBe(original.rngState);
    }
  });

  it("obfuscates opponent hand card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Player 1's hand cards should be hidden
    expect(filtered.players[1].hand.length).toBe(state.players[1].hand.length);
    for (const card of filtered.players[1].hand) {
      expect(card.cardId).toBe("hidden");
    }
  });

  it("obfuscates opponent deck card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    expect(filtered.players[1].deck.length).toBe(state.players[1].deck.length);
    for (const card of filtered.players[1].deck) {
      expect(card.cardId).toBe("hidden");
    }
  });

  it("preserves the receiving player's own deck", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    for (let i = 0; i < state.players[0].deck.length; i++) {
      expect(filtered.players[0].deck[i].cardId).toBe(state.players[0].deck[i].cardId);
    }
  });

  it("obfuscates opponent face-down life cards", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    for (const lc of filtered.players[1].life) {
      if (lc.face === "DOWN") {
        expect(lc.cardId).toBe("hidden");
      }
    }
  });

  it("preserves opponent face-up life cards", () => {
    // Manually set a life card face-up
    const state = getMainPhaseState();
    if (state.players[1].life.length > 0) {
      const modified = {
        ...state,
        players: [...state.players] as [typeof state.players[0], typeof state.players[1]],
      };
      modified.players[1] = {
        ...modified.players[1],
        life: modified.players[1].life.map((lc, i) =>
          i === 0 ? { ...lc, face: "UP" as const } : lc,
        ),
      };

      const filtered = filterStateForPlayer(modified, 0);
      const faceUpCards = filtered.players[1].life.filter((lc) => lc.face === "UP");
      expect(faceUpCards.length).toBeGreaterThan(0);
      for (const lc of faceUpCards) {
        expect(lc.cardId).not.toBe("hidden");
      }
    }
  });

  it("leaves public zones untouched (leader, characters, trash, stage)", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Opponent's leader should be fully visible
    expect(filtered.players[1].leader.cardId).toBe(state.players[1].leader.cardId);

    // Opponent's trash should be fully visible
    expect(filtered.players[1].trash).toEqual(state.players[1].trash);

    // Characters
    expect(filtered.players[1].characters).toEqual(state.players[1].characters);
  });

  it("preserves hand card count (for UI placeholder rendering)", () => {
    const state = getMainPhaseState();
    const filtered0 = filterStateForPlayer(state, 0);
    const filtered1 = filterStateForPlayer(state, 1);

    expect(filtered0.players[1].hand.length).toBe(state.players[1].hand.length);
    expect(filtered1.players[0].hand.length).toBe(state.players[0].hand.length);
  });

  it("is symmetric — each player sees their own data and hides the opponent's", () => {
    const state = getMainPhaseState();
    const view0 = filterStateForPlayer(state, 0);
    const view1 = filterStateForPlayer(state, 1);

    // Player 0's view: own hand visible, opponent hidden
    expect(view0.players[0].hand[0]?.cardId).not.toBe("hidden");
    expect(view0.players[1].hand[0]?.cardId).toBe("hidden");

    // Player 1's view: own hand visible, opponent hidden
    expect(view1.players[1].hand[0]?.cardId).not.toBe("hidden");
    expect(view1.players[0].hand[0]?.cardId).toBe("hidden");
  });

  it("strips cardId from opponent CARD_DRAWN events in eventLog", () => {
    const state = getMainPhaseState();

    // The DRAW phase auto-advances, so eventLog should have CARD_DRAWN events.
    // Add a synthetic one to be sure.
    const stateWithDrawEvent = {
      ...state,
      eventLog: [
        ...state.eventLog,
        {
          type: "CARD_DRAWN" as const,
          playerIndex: 1 as const,
          payload: { cardId: "SECRET-CARD", cardInstanceId: "inst-123" },
          timestamp: Date.now(),
        },
      ],
    };

    const filtered = filterStateForPlayer(stateWithDrawEvent, 0);
    const opponentDrawEvents = filtered.eventLog.filter(
      (e) => e.type === "CARD_DRAWN" && e.playerIndex === 1,
    );

    for (const event of opponentDrawEvents) {
      if (event.type === "CARD_DRAWN") {
        expect(event.payload.cardId).toBe("hidden");
        expect(event.payload.cardInstanceId).toBe("hidden");
      }
    }
  });

  it("preserves cardId in the player's own CARD_DRAWN events", () => {
    const state = getMainPhaseState();
    const stateWithDrawEvent = {
      ...state,
      eventLog: [
        ...state.eventLog,
        {
          type: "CARD_DRAWN" as const,
          playerIndex: 0 as const,
          payload: { cardId: "MY-CARD", cardInstanceId: "inst-456" },
          timestamp: Date.now(),
        },
      ],
    };

    const filtered = filterStateForPlayer(stateWithDrawEvent, 0);
    const myDrawEvents = filtered.eventLog.filter(
      (e) => e.type === "CARD_DRAWN" && e.playerIndex === 0,
    );

    // Own events should keep cardId
    const lastDraw = myDrawEvents[myDrawEvents.length - 1];
    if (lastDraw.type === "CARD_DRAWN") {
      expect(lastDraw.payload.cardId).toBe("MY-CARD");
    }
  });

  it("strips pendingPrompt for the non-responding player", () => {
    const state = getMainPhaseState();

    // Simulate a prompt directed at player 1 (e.g., opponent must trash from hand)
    const stateWithPrompt = {
      ...state,
      pendingPrompt: {
        options: {
          promptType: "SELECT_TARGET" as const,
          validTargets: ["inst-a", "inst-b"],
          countMin: 1,
          countMax: 1,
          effectDescription: "Choose 1 card(s) to trash from hand",
          ctaLabel: "Trash",
          cards: state.players[1].hand.slice(0, 2), // opponent hand cards with real cardIds
        },
        respondingPlayer: 1 as const,
        resumeContext: "test-frame",
      },
    };

    // Player 0 (non-responding) should NOT see the prompt
    const view0 = filterStateForPlayer(stateWithPrompt, 0);
    expect(view0.pendingPrompt).toBeNull();

    // Player 1 (responding) SHOULD see the prompt with their own cards
    const view1 = filterStateForPlayer(stateWithPrompt, 1);
    expect(view1.pendingPrompt).not.toBeNull();
    expect(view1.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    if (view1.pendingPrompt!.options.promptType === "SELECT_TARGET") {
      // Cards should have real cardIds since it's the responding player's own hand
      for (const card of view1.pendingPrompt!.options.cards) {
        expect(card.cardId).not.toBe("hidden");
      }
    }
  });
});

describe("visibleStateForSpectator", () => {
  function getMainPhaseState() {
    const { state, cardDb } = setupGame();
    return { state: advanceToPhase(state, "MAIN", cardDb), cardDb };
  }

  it("preserves both owners' real hand identities and attached DON!!", () => {
    const { state, cardDb } = getMainPhaseState();
    const expectedHands = state.players.map((player, playerIndex) =>
      player.hand.map((card, cardIndex) => ({
        ...card,
        attachedDon: cardIndex === 0
          ? [{
              instanceId: `hand-don-${playerIndex}`,
              state: "RESTED" as const,
              attachedTo: card.instanceId,
            }]
          : card.attachedDon,
      })),
    ) as [typeof state.players[0]["hand"], typeof state.players[1]["hand"]];
    const withAttachedDon = {
      ...state,
      players: [
        { ...state.players[0], hand: expectedHands[0] },
        { ...state.players[1], hand: expectedHands[1] },
      ] as typeof state.players,
    };

    const spectator = visibleStateForSpectator(withAttachedDon, cardDb);

    for (const playerIndex of [0, 1] as const) {
      expect(spectator.players[playerIndex].hand).toEqual(expectedHands[playerIndex]);
      for (const card of spectator.players[playerIndex].hand) {
        expect(card.cardId).not.toBe("hidden");
        expect(card.instanceId).not.toMatch(/^hidden-/);
      }
      expect(spectator.players[playerIndex].hand[0]?.attachedDon).toHaveLength(1);
    }
  });

  it("re-obfuscates both decks and both players' face-down Life", () => {
    const { state, cardDb } = getMainPhaseState();
    const spectator = visibleStateForSpectator(state, cardDb);

    for (const playerIndex of [0, 1] as const) {
      for (const card of spectator.players[playerIndex].deck) {
        expect(card.cardId).toBe("hidden");
        expect(card.instanceId).toMatch(new RegExp(`^hidden-${playerIndex}-deck-`));
      }
      for (const lifeCard of spectator.players[playerIndex].life) {
        if (lifeCard.face === "DOWN") {
          expect(lifeCard.cardId).toBe("hidden");
          expect(lifeCard.instanceId).toMatch(
            new RegExp(`^hidden-${playerIndex}-life-`),
          );
        }
      }
    }
  });

  it("uses the shared redacted execution context and keeps effectStack empty", () => {
    const { state, cardDb } = getMainPhaseState();
    const playerZeroView = filterStateForPlayer(state, 0);
    const playerOneView = filterStateForPlayer(state, 1);
    const spectator = visibleStateForSpectator(state, cardDb);

    expect(playerZeroView.executionContext).toEqual(playerOneView.executionContext);
    expect(spectator.executionContext).toEqual(playerZeroView.executionContext);
    expect(spectator.effectStack).toEqual([]);
  });

  it("preserves public zones identically for both players", () => {
    const { state, cardDb } = getMainPhaseState();
    const spectator = visibleStateForSpectator(state, cardDb);

    for (const playerIndex of [0, 1] as const) {
      expect(spectator.players[playerIndex].leader)
        .toEqual(state.players[playerIndex].leader);
      expect(spectator.players[playerIndex].characters)
        .toEqual(state.players[playerIndex].characters);
      expect(spectator.players[playerIndex].stage)
        .toEqual(state.players[playerIndex].stage);
      expect(spectator.players[playerIndex].trash)
        .toEqual(state.players[playerIndex].trash);
    }
  });
});
