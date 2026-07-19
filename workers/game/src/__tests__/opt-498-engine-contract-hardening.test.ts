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
    for (const pregameMode of [
      "SIDE_A_FIRST",
      "SIDE_B_FIRST",
      "SOLITAIRE_RANDOM",
    ] as const) {
      const payload = createTestPayload();
      payload.mode = "SOLITAIRE";
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
      pregameMode: "FUTURE_MODE",
    };

    expect(() => validateGameInitPayload(payload)).toThrow(
      "GameInitPayload.pregameMode must be a valid pregame mode"
    );
  });

  it("rejects pregame modes that do not match the lobby mode", () => {
    const pvp = createTestPayload();
    pvp.pregameMode = "SIDE_A_FIRST";
    expect(() => validateGameInitPayload(pvp)).toThrow(
      "SIDE_A_FIRST is not valid for PVP mode",
    );

    const solitaire = createTestPayload();
    solitaire.mode = "SOLITAIRE";
    solitaire.pregameMode = "HOST_FIRST";
    expect(() => validateGameInitPayload(solitaire)).toThrow(
      "HOST_FIRST is not valid for SOLITAIRE mode",
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
