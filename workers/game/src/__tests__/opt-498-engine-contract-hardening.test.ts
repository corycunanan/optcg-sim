import { describe, expect, it } from "vitest";
import { prepareDecksAndLeaders } from "../engine/setup.js";
import { validateGameInitPayload } from "../util/validate.js";
import { createTestPayload } from "./helpers.js";

describe("OPT-498 deterministic setup validation", () => {
  it("accepts every pregame mode and defaults legacy init payloads", () => {
    for (const pregameMode of [
      "PRIORITY_ROLL",
      "HOST_FIRST",
      "GUEST_FIRST",
      "RANDOM_FIXED",
    ] as const) {
      const payload = createTestPayload();
      payload.pregameMode = pregameMode;
      expect(validateGameInitPayload(payload).pregameMode).toBe(pregameMode);
    }

    const legacy = createTestPayload() as unknown as Record<string, unknown>;
    delete legacy.pregameMode;
    expect(validateGameInitPayload(legacy).pregameMode).toBe("PRIORITY_ROLL");
  });

  it("rejects unknown pregame modes at the worker boundary", () => {
    const payload = {
      ...createTestPayload(),
      pregameMode: "SIDE_A_FIRST",
    };

    expect(() => validateGameInitPayload(payload)).toThrow(
      "GameInitPayload.pregameMode must be a valid pregame mode"
    );
  });

  it.each([
    ["life", "PlayerInitData.testOrder.life must contain exactly 5 cards"],
    ["hand", "PlayerInitData.testOrder.hand must contain exactly 5 cards"],
  ] as const)(
    "rejects a malformed testOrder.%s size before setup",
    (zone, message) => {
      const payload = createTestPayload();
      payload.player1.testOrder![zone].pop();

      expect(() => validateGameInitPayload(payload)).toThrow(message);
      expect(() => prepareDecksAndLeaders(payload)).toThrow(message);
    }
  );

  it("rejects testOrder card IDs that the deck cannot supply", () => {
    const payload = createTestPayload();
    payload.player1.testOrder!.hand[0] = "NOT-IN-DECK";

    const message =
      "PlayerInitData.testOrder.hand references unavailable card 'NOT-IN-DECK'";
    expect(() => validateGameInitPayload(payload)).toThrow(message);
    expect(() => prepareDecksAndLeaders(payload)).toThrow(message);
  });

  it("counts hand and Life assignments against one shared deck inventory", () => {
    const payload = createTestPayload();
    const limitedCard = payload.player1.deck.find(
      (entry) => entry.quantity === 4
    )!;
    const fillerCard = payload.player1.deck.find(
      (entry) => entry.quantity > 10
    )!;
    payload.player1.testOrder = {
      hand: [
        limitedCard.cardId,
        limitedCard.cardId,
        limitedCard.cardId,
        limitedCard.cardId,
        fillerCard.cardId,
      ],
      life: Array.from({ length: 5 }, () => fillerCard.cardId),
    };
    payload.player1.testOrder.life[0] = limitedCard.cardId;

    expect(() => validateGameInitPayload(payload)).toThrow(
      `PlayerInitData.testOrder.life references unavailable card '${limitedCard.cardId}'`
    );
  });
});
