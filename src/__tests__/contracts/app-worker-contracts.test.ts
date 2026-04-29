import { describe, expect, it } from "vitest";
import type { Card } from "@prisma/client";
import { buildGameInitPayload } from "@/lib/game/init-payload";
import { buildNotifyEndPayload } from "@/lib/game/notify-end";
import { GameResultSchema } from "@/lib/validators/game";
import { mintGameToken } from "@/lib/game/token";
import { validateGameInitPayload, validateNotifyEndPayload } from "@engine/util/validate.js";
import { verifyGameToken } from "@engine/util/auth.js";
import { consumeGameTokenJti } from "@engine/util/token-replay.js";
import { buildGameResultCallbackPayload } from "@engine/util/result.js";
import { filterStateForPlayer } from "@engine/engine/state.js";
import { setupGame } from "@engine/__tests__/factories.js";
import type { CardInstance, GameState } from "@engine/types.js";

class MockJtiStorage {
  private storageMap = new Map<string, unknown>();

  async put(key: string, value: unknown): Promise<void> {
    this.storageMap.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.storageMap.get(key) as T | undefined;
  }
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    originSet: "OP-TEST",
    name: id,
    color: ["Red"],
    type: "Character",
    cost: 3,
    power: 4000,
    counter: 1000,
    attribute: ["Strike"],
    life: null,
    traits: ["Contract"],
    rarity: "C",
    effectText: "",
    triggerText: null,
    effectSchema: null,
    imageUrl: `https://example.test/${id}.png`,
    blockNumber: 1,
    banStatus: "LEGAL",
    isReprint: false,
    ...overrides,
  };
}

function makeDeck(card: Card, overrides: Partial<Parameters<typeof buildGameInitPayload>[0]["player1"]["deck"]> = {}) {
  return {
    leaderArtUrl: null,
    sleeveUrl: "https://example.test/sleeve.png",
    donArtUrl: "https://example.test/don.png",
    testOrder: null,
    cards: [{ card, quantity: 50, selectedArtUrl: null }],
    ...overrides,
  };
}

function withId(card: CardInstance, instanceId: string, cardId: string): CardInstance {
  return { ...card, instanceId, cardId };
}

describe("app ↔ worker contracts", () => {
  it("builds a lobby init payload accepted by the worker init validator", () => {
    const hostLeader = makeCard("P1-LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const guestLeader = makeCard("P2-LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const hostCard = makeCard("P1-CARD");
    const guestCard = makeCard("P2-CARD");

    const payload = buildGameInitPayload({
      gameId: "game-contract-1",
      format: "Standard",
      player1: {
        userId: "host-user",
        leader: hostLeader,
        deck: makeDeck(hostCard, {
          leaderArtUrl: "https://example.test/p1-alt.png",
          testOrder: { life: ["P1-CARD", "P1-CARD", "P1-CARD", "P1-CARD", "P1-CARD"], hand: ["P1-CARD", "P1-CARD", "P1-CARD", "P1-CARD", "P1-CARD"] },
        }),
      },
      player2: {
        userId: "guest-user",
        leader: guestLeader,
        deck: makeDeck(guestCard),
      },
    });

    expect(validateGameInitPayload(payload)).toEqual(payload);
    expect(payload).toMatchObject({
      gameId: "game-contract-1",
      format: "Standard",
      player1: {
        userId: "host-user",
        sleeveUrl: "https://example.test/sleeve.png",
        donArtUrl: "https://example.test/don.png",
        leader: { cardId: "P1-LEADER", quantity: 1, cardData: { imageUrl: "https://example.test/p1-alt.png" } },
        deck: [{ cardId: "P1-CARD", quantity: 50, cardData: { id: "P1-CARD" } }],
      },
      player2: {
        userId: "guest-user",
        leader: { cardId: "P2-LEADER", quantity: 1 },
        deck: [{ cardId: "P2-CARD", quantity: 50 }],
      },
    });
  });

  it("mints app game tokens that the worker accepts and rejects invalid variants", async () => {
    const secret = "contract-secret";
    const token = await mintGameToken("user-1", secret, {
      gameId: "game-1",
      jti: "token-1",
    });

    await expect(verifyGameToken(token, secret, "game-1")).resolves.toMatchObject({
      sub: "user-1",
      gameId: "game-1",
      jti: "token-1",
    });
    await expect(verifyGameToken(token, "wrong-secret", "game-1")).resolves.toBeNull();
    await expect(verifyGameToken(token, secret, "other-game")).resolves.toBeNull();

    const missingGameId = await mintGameToken("user-1", secret, { jti: "token-2" });
    await expect(verifyGameToken(missingGameId, secret, "game-1")).resolves.toBeNull();

    const expired = await mintGameToken("user-1", secret, {
      now: Math.floor(Date.now() / 1000) - 600,
      expiresInSeconds: 1,
      gameId: "game-1",
      jti: "token-3",
    });
    await expect(verifyGameToken(expired, secret, "game-1")).resolves.toBeNull();
  });

  it("treats worker game tokens as one-shot per Durable Object jti", async () => {
    const secret = "contract-secret";
    const { state } = setupGame();
    const storage = new MockJtiStorage();

    const token = await mintGameToken("user-p1", secret, {
      gameId: state.id,
      jti: "one-shot-token",
    });
    const payload = await verifyGameToken(token, secret, state.id);
    expect(payload).toMatchObject({
      sub: state.players[0].playerId,
      gameId: state.id,
      jti: "one-shot-token",
    });

    await expect(
      consumeGameTokenJti(storage, payload!.jti, payload!.exp),
    ).resolves.toBe(true);
    await expect(
      consumeGameTokenJti(storage, payload!.jti, payload!.exp),
    ).resolves.toBe(false);

    const freshToken = await mintGameToken("user-p1", secret, {
      gameId: state.id,
      jti: "fresh-token",
    });
    const freshPayload = await verifyGameToken(freshToken, secret, state.id);
    await expect(
      consumeGameTokenJti(storage, freshPayload!.jti, freshPayload!.exp),
    ).resolves.toBe(true);
  });

  it("builds worker result callbacks accepted by the app result schema", () => {
    const { state } = setupGame();
    const finished: GameState = {
      ...state,
      status: "FINISHED",
      winner: 1,
      winReason: "Player 2 won",
    };

    const payload = buildGameResultCallbackPayload(finished);

    expect(GameResultSchema.parse(payload)).toEqual({
      gameId: finished.id,
      status: "FINISHED",
      winnerId: finished.players[1].playerId,
      winReason: "Player 2 won",
      reasonCode: "UNKNOWN",
    });
  });

  it("builds app notify-end fallback payloads accepted by the worker parser", () => {
    const payload = buildNotifyEndPayload(1, "Player conceded while disconnected");

    expect(validateNotifyEndPayload(payload)).toEqual(payload);
    expect(() => validateNotifyEndPayload({ winnerIndex: 2, reason: payload.reason })).toThrow(/winnerIndex/);
    expect(() => validateNotifyEndPayload({ winnerIndex: 1, reason: "" })).toThrow(/reason/);
  });

  it("hides opponent hand, deck, and face-down life while preserving public cards", () => {
    const { state } = setupGame();
    const opponent = state.players[1];
    const visibleOpponentLife = { ...opponent.life[1], cardId: "FACE-UP-LIFE", face: "UP" as const };
    const secretState: GameState = {
      ...state,
      players: [
        state.players[0],
        {
          ...opponent,
          hand: [withId(opponent.hand[0], "opponent-hand-1", "SECRET-HAND")],
          deck: [withId(opponent.deck[0], "opponent-deck-1", "SECRET-DECK")],
          life: [
            { ...opponent.life[0], cardId: "SECRET-LIFE", face: "DOWN" as const },
            visibleOpponentLife,
          ],
        },
      ],
      eventLog: [
        {
          type: "CARD_DRAWN",
          playerIndex: 1,
          payload: { cardId: "SECRET-HAND", cardInstanceId: "opponent-hand-1" },
          timestamp: 1,
        },
      ],
    };

    const filtered = filterStateForPlayer(secretState, 0);
    const filteredOpponent = filtered.players[1];

    expect(filteredOpponent.hand).toHaveLength(1);
    expect(filteredOpponent.hand[0]).toMatchObject({ instanceId: "opponent-hand-1", cardId: "hidden" });
    expect(filteredOpponent.deck[0]).toMatchObject({ instanceId: "opponent-deck-1", cardId: "hidden" });
    expect(filteredOpponent.life[0]).toMatchObject({ cardId: "hidden", face: "DOWN" });
    expect(filteredOpponent.life[1]).toEqual(visibleOpponentLife);
    expect(filtered.eventLog[0].payload).not.toHaveProperty("cardId");
  });
});
