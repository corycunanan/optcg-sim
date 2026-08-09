import { describe, expect, it } from "vitest";
import { CardDetailResponseSchema, CardSearchResponseSchema } from "./cards";

const baseCard = {
  id: "OP01-075",
  name: "Pacifista",
  color: ["Blue"],
  type: "Character",
  cost: 4,
  power: 5000,
  counter: 0,
  life: null,
  imageUrl: "https://cdn.example.com/OP01-075.png",
  banStatus: "LEGAL",
  blockNumber: 1,
  traits: ["Navy"],
  attribute: ["Special"],
  effectText: "This card may be included any number of times.",
  triggerText: null,
  rarity: "C",
  originSet: "OP-01",
};

describe("card API response contracts", () => {
  it("preserves card-info fields in search results", () => {
    const parsed = CardSearchResponseSchema.parse({
      data: [
        {
          ...baseCard,
          effectSchema: { rule_modifications: [] },
          artVariants: [{ id: "art-1" }],
          cardSets: [{ id: "set-1" }],
        },
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
    });

    expect(parsed.data[0]).toEqual({
      id: baseCard.id,
      name: baseCard.name,
      color: baseCard.color,
      type: baseCard.type,
      cost: baseCard.cost,
      power: baseCard.power,
      counter: baseCard.counter,
      life: baseCard.life,
      traits: baseCard.traits,
      attribute: baseCard.attribute,
      effectText: baseCard.effectText,
      triggerText: baseCard.triggerText,
      imageUrl: baseCard.imageUrl,
    });
  });

  it("preserves legality and relation data on card details", () => {
    const effectSchema = {
      rule_modifications: [
        { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
      ],
    };
    const parsed = CardDetailResponseSchema.parse({
      data: {
        ...baseCard,
        effectSchema,
        artVariants: [
          {
            id: "art-1",
            variantId: "OP01-075_p1",
            label: "Parallel",
            rarity: "C",
            imageUrl: "https://cdn.example.com/OP01-075_p1.png",
            set: "OP-01",
          },
        ],
        cardSets: [
          {
            id: "set-1",
            setLabel: "OP-01",
            setName: "ROMANCE DAWN",
            isOrigin: true,
          },
        ],
      },
    });

    expect(parsed.data.effectText).toBe(baseCard.effectText);
    expect(parsed.data.effectSchema).toEqual(effectSchema);
    expect(parsed.data.artVariants).toHaveLength(1);
    expect(parsed.data.cardSets).toHaveLength(1);
  });
});
