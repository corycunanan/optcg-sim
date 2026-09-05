import { describe, expect, it } from "vitest";
import type { Card } from "@prisma/client";
import { toCardData } from "@/lib/game/card-data";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "OP13-079",
    originSet: "OP13",
    name: "Imu",
    color: ["Black"],
    type: "Leader",
    cost: null,
    power: 5000,
    counter: null,
    attribute: ["Special"],
    life: 5,
    traits: ["Im Clan"],
    rarity: "L",
    effectText: "",
    triggerText: null,
    effectSchema: null,
    imageUrl: "https://example.test/OP13-079.png",
    imageIsVariantFallback: false,
    blockNumber: 13,
    banStatus: "LEGAL",
    isReprint: false,
    ...overrides,
  };
}

describe("toCardData", () => {
  it("does not forward the deck-legality subset stored in Card.effectSchema", () => {
    // pipeline/sync-effect-schemas.ts materializes only { rule_modifications }
    // (no `effects` array) into the DB column. That shape fails the engine's
    // full-schema validation, so it must never reach parseCardData.
    const card = makeCard({
      effectSchema: {
        rule_modifications: [
          {
            type: "DECK_RESTRICTION",
            filter: { card_type: "Event", cost_min: 2 },
          },
        ],
      },
    });

    expect(() => toCardData(card)).not.toThrow();
    expect(toCardData(card).effectSchema).toBeNull();
  });

  it("maps a plain card row", () => {
    const data = toCardData(makeCard());
    expect(data.id).toBe("OP13-079");
    expect(data.type).toBe("Leader");
    expect(data.effectSchema).toBeNull();
  });
});
