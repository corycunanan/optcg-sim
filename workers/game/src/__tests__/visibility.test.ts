/**
 * Tests for secret zone filtering (§8-4-5).
 *
 * Ensures filterStateForPlayer() strips opponent's hand/deck card identities
 * and face-down life cards, while leaving the player's own zones and all
 * public zones intact.
 */

import { describe, it, expect } from "vitest";
import { filterStateForPlayer } from "../engine/state.js";
import { setupGame, advanceToPhase } from "./helpers.js";

describe("filterStateForPlayer", () => {
  function getMainPhaseState() {
    const { state, cardDb } = setupGame();
    return advanceToPhase(state, cardDb, "MAIN");
  }

  it("preserves the receiving player's own hand card identities", () => {
    const state = getMainPhaseState();
    const filtered = filterStateForPlayer(state, 0);

    // Player 0's hand should be untouched
    for (const card of filtered.players[0].hand) {
      expect(card.cardId).not.toBe("hidden");
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
        expect(event.payload.cardId).toBeUndefined();
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
});
