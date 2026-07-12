import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, PendingPromptState } from "../types.js";
import { filterStateForPlayer } from "../engine/state.js";
import { emitPendingEvent } from "../engine/events.js";
import { executeLifeScry } from "../engine/effect-resolver/actions/life.js";
import type { Action } from "../engine/effect-types.js";
import {
  filterEventForPlayer,
  filterPromptForPlayer,
  GAME_EVENT_VISIBILITY,
  PROMPT_VISIBILITY,
} from "../engine/visibility.js";
import { advanceToPhase, setupGame } from "./factories.js";

const timestamp = 1;

const hiddenEventCases: Array<{ name: string; event: GameEvent; secrets: string[] }> = [
  {
    name: "drawn card",
    event: {
      type: "CARD_DRAWN",
      playerIndex: 1,
      payload: { cardId: "DRAW-SECRET", cardInstanceId: "draw-instance" },
      timestamp,
    },
    secrets: ["DRAW-SECRET", "draw-instance"],
  },
  {
    name: "card returned to hand",
    event: {
      type: "CARD_RETURNED_TO_HAND",
      playerIndex: 1,
      payload: {
        cardId: "HAND-SECRET",
        cardInstanceId: "hand-instance",
        newCardInstanceId: "new-hand-instance",
      },
      timestamp,
    },
    secrets: ["HAND-SECRET", "hand-instance", "new-hand-instance"],
  },
  {
    name: "Life card added to hand",
    event: {
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: 1,
      payload: { cardId: "LIFE-HAND-SECRET", cardInstanceId: "life-hand-instance" },
      timestamp,
    },
    secrets: ["LIFE-HAND-SECRET", "life-hand-instance"],
  },
  {
    name: "card returned to deck",
    event: {
      type: "CARD_RETURNED_TO_DECK",
      playerIndex: 1,
      payload: {
        cardId: "DECK-SECRET",
        cardInstanceId: "deck-instance",
        newCardInstanceId: "new-deck-instance",
        position: "BOTTOM",
      },
      timestamp,
    },
    secrets: ["DECK-SECRET", "deck-instance", "new-deck-instance"],
  },
  {
    name: "Life scry",
    event: {
      type: "LIFE_SCRIED",
      playerIndex: 1,
      payload: {
        cards: [{ cardId: "SCRY-SECRET", instanceId: "scry-instance" }],
        count: 1,
      },
      timestamp,
    },
    secrets: ["SCRY-SECRET", "scry-instance"],
  },
  {
    name: "card removed from Life",
    event: {
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: 1,
      payload: {
        cardInstanceId: "removed-life-instance",
        newCardInstanceId: "new-removed-life-instance",
      },
      timestamp,
    },
    secrets: ["removed-life-instance", "new-removed-life-instance"],
  },
  {
    name: "controller-only reveal",
    event: {
      type: "CARDS_REVEALED",
      playerIndex: 1,
      payload: {
        cards: [{ cardId: "PRIVATE-REVEAL", instanceId: "private-reveal-instance" }],
        source: "DECK_TOP",
        visibility: "CONTROLLER_ONLY",
        visibleTo: 1,
      },
      timestamp,
    },
    secrets: ["PRIVATE-REVEAL", "private-reveal-instance"],
  },
];

describe("OPT-470 hidden-information visibility contract", () => {
  it("redacts identities from a production LIFE_SCRIED event in the opponent snapshot", () => {
    const { state, cardDb } = setupGame();
    const main = advanceToPhase(state, "MAIN", cardDb);
    const lifeCard = main.players[1].life[0];
    const result = executeLifeScry(
      main,
      { type: "LIFE_SCRY", params: { look_at: 1 } } as Action,
      main.players[1].leader.instanceId,
      1,
      cardDb,
      new Map(),
    );
    const logged = result.events.reduce(
      (current, event) => emitPendingEvent(current, event, 1),
      result.state,
    );

    const ownerView = filterStateForPlayer(logged, 1);
    const opponentView = filterStateForPlayer(logged, 0);
    expect(JSON.stringify(ownerView.eventLog)).toContain(lifeCard.cardId);
    expect(JSON.stringify(opponentView.eventLog)).not.toContain(lifeCard.cardId);
    expect(JSON.stringify({
      player: opponentView.players[1],
      eventLog: opponentView.eventLog,
    })).not.toContain(lifeCard.instanceId);
  });

  it.each(hiddenEventCases)("preserves the owner's $name payload", ({ event }) => {
    expect(filterEventForPlayer(event, 1)).toEqual(event);
  });

  it.each(hiddenEventCases)("redacts the opponent's $name payload", ({ event, secrets }) => {
    const serialized = JSON.stringify(filterEventForPlayer(event, 0));
    for (const secret of secrets) expect(serialized).not.toContain(secret);
  });

  it("uses the declared viewer for private reveals rather than the zone owner", () => {
    const event: GameEvent = {
      type: "CARDS_REVEALED",
      playerIndex: 1,
      payload: {
        cards: [{ cardId: "LOOKED-AT-CARD", instanceId: "looked-at-instance" }],
        visibility: "CONTROLLER_ONLY",
        visibleTo: 0,
      },
      timestamp,
    };

    expect(filterEventForPlayer(event, 0)).toEqual(event);
    expect(JSON.stringify(filterEventForPlayer(event, 1))).not.toContain("LOOKED-AT-CARD");
  });

  it("keeps cards explicitly revealed to both players public", () => {
    const event: GameEvent = {
      type: "CARDS_REVEALED",
      playerIndex: 1,
      payload: {
        cards: [{ cardId: "PUBLIC-REVEAL", instanceId: "public-instance" }],
        visibility: "BOTH",
      },
      timestamp,
    };

    expect(filterEventForPlayer(event, 0)).toEqual(event);
  });

  it("classifies every current secret-bearing event with a redactor", () => {
    expect(GAME_EVENT_VISIBILITY).toMatchObject({
      CARD_DRAWN: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
      CARD_RETURNED_TO_HAND: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
      CARD_ADDED_TO_HAND_FROM_LIFE: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
      CARD_RETURNED_TO_DECK: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
      CARDS_REVEALED: { audience: "DECLARED_BY_EVENT", redactor: "CARD_IDENTITIES" },
      LIFE_SCRIED: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITIES" },
      CARD_REMOVED_FROM_LIFE: { audience: "OWNER_ONLY", redactor: "CARD_IDENTITY" },
    });
  });

  it("classifies every prompt as responding-player-only", () => {
    expect(PROMPT_VISIBILITY).toEqual({
      SELECT_BLOCKER: "RESPONDING_PLAYER",
      SELECT_COUNTER_TARGET: "RESPONDING_PLAYER",
      SELECT_ATTACK_TARGET: "RESPONDING_PLAYER",
      REVEAL_TRIGGER: "RESPONDING_PLAYER",
      SELECT_CARD_TO_TRASH: "RESPONDING_PLAYER",
      ARRANGE_TOP_CARDS: "RESPONDING_PLAYER",
      SELECT_TARGET: "RESPONDING_PLAYER",
      REDISTRIBUTE_DON: "RESPONDING_PLAYER",
      PLAYER_CHOICE: "RESPONDING_PLAYER",
      OPTIONAL_EFFECT: "RESPONDING_PLAYER",
    });
  });

  it("hides prompts from non-responders and strips transport-internal resume data", () => {
    const prompt: PendingPromptState = {
      options: {
        promptType: "PLAYER_CHOICE",
        choices: [{ id: "yes", label: "Yes" }],
        effectDescription: "Choose",
      },
      respondingPlayer: 1,
      resumeContext: { secret: "server-only" },
    };

    expect(filterPromptForPlayer(prompt, 0)).toBeNull();
    expect(filterPromptForPlayer(prompt, 1)?.resumeContext).toBeNull();
  });

  it("obfuscates card faces in a blind hidden-zone selection prompt", () => {
    const { state } = setupGame();
    const hiddenCard = state.players[1].hand[0];
    const prompt: PendingPromptState = {
      options: {
        promptType: "SELECT_TARGET",
        cards: [hiddenCard],
        validTargets: [hiddenCard.instanceId],
        effectDescription: "Choose a random opponent card",
        countMin: 1,
        countMax: 1,
        ctaLabel: "Choose",
        blindSelection: true,
      },
      respondingPlayer: 0,
      resumeContext: { cardId: hiddenCard.cardId },
    };

    const filtered = filterPromptForPlayer(prompt, 0);
    expect(filtered?.options.promptType).toBe("SELECT_TARGET");
    if (filtered?.options.promptType !== "SELECT_TARGET") return;
    expect(filtered.options.cards[0].cardId).toBe("hidden");
    expect(filtered.options.validTargets).toEqual([hiddenCard.instanceId]);
    expect(filtered.resumeContext).toBeNull();
  });

  it("does not serialize engine continuation frames into either player view", () => {
    const { state, cardDb } = setupGame();
    const main = advanceToPhase(state, "MAIN", cardDb);
    const withInternalFrame = {
      ...main,
      effectStack: [{
        id: "internal-frame",
        accumulatedEvents: [hiddenEventCases[4].event],
      }],
    } as unknown as GameState;

    expect(filterStateForPlayer(withInternalFrame, 0).effectStack).toEqual([]);
    expect(filterStateForPlayer(withInternalFrame, 1).effectStack).toEqual([]);
  });

  it("replaces hidden-zone instance IDs with zone-local placeholders", () => {
    const { state, cardDb } = setupGame();
    const main = advanceToPhase(state, "MAIN", cardDb);
    const opponentSecrets = [
      ...main.players[1].hand.map((card) => card.instanceId),
      ...main.players[1].deck.map((card) => card.instanceId),
      ...main.players[1].life
        .filter((card) => card.face === "DOWN")
        .map((card) => card.instanceId),
    ];

    const serialized = JSON.stringify(filterStateForPlayer(main, 0));
    for (const instanceId of opponentSecrets) expect(serialized).not.toContain(instanceId);
    expect(filterStateForPlayer(main, 0).players[1].hand[0]?.instanceId)
      .toMatch(/^hidden-1-hand-/);
  });
});
