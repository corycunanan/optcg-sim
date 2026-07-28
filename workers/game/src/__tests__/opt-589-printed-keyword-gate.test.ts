import { describe, expect, it } from "vitest";
import type { CardData } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { derivePrintedKeywords } from "../engine/printed-keywords.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";

function cardData(effectText = "", triggerText: string | null = null): CardData {
  return {
    id: "OPT-589-GATE",
    name: "gate",
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText,
    triggerText,
    keywords: {
      rush: true,
      rushCharacter: true,
      doubleAttack: true,
      banish: true,
      blocker: true,
      trigger: true,
      unblockable: true,
    },
    effectSchema: null,
    imageUrl: null,
  };
}

describe("OPT-589 recursive printed-keyword consistency gate", () => {
  it("derives every authored card only from permanent flags and structured Trigger blocks", () => {
    for (const schema of Object.values(getAllAuthoredSchemas())) {
      const derived = derivePrintedKeywords(cardData(), schema);
      const flagged = new Set(
        schema.effects
          .filter((effect) => effect.category === "permanent")
          .flatMap((effect) => effect.flags?.keywords ?? []),
      );
      expect(derived.rush, schema.card_id).toBe(flagged.has("RUSH"));
      expect(derived.rushCharacter, schema.card_id).toBe(
        flagged.has("RUSH_CHARACTER"),
      );
      expect(derived.doubleAttack, schema.card_id).toBe(
        flagged.has("DOUBLE_ATTACK"),
      );
      expect(derived.banish, schema.card_id).toBe(flagged.has("BANISH"));
      expect(derived.blocker, schema.card_id).toBe(flagged.has("BLOCKER"));
      expect(derived.unblockable, schema.card_id).toBe(
        flagged.has("UNBLOCKABLE"),
      );
    }
  });

  it("ignores GRANT_KEYWORD recursively through conditions, durations, and nested choices", () => {
    const schema = {
      card_id: "OPT-589-GATE",
      card_name: "gate",
      card_type: "Character",
      effects: [
        {
          id: "nested",
          category: "activate",
          conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
          actions: [
            {
              type: "PLAYER_CHOICE",
              params: {
                options: [
                  {
                    actions: [
                      {
                        type: "GRANT_KEYWORD",
                        target: { type: "SELF" },
                        params: { keyword: "RUSH_CHARACTER" },
                        duration: {
                          type: "WHILE_CONDITION",
                          condition: { type: "IS_MY_TURN", controller: "SELF" },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as EffectSchema;

    expect(
      derivePrintedKeywords(
        cardData("This Character gains [Rush: Character]."),
        schema,
      ),
    ).toEqual({
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    });
  });

  it("uses exact line-leading standalone tags only for schema-less cards", () => {
    expect(
      derivePrintedKeywords(
        cardData(
          "[Rush] (This card can attack immediately.)\nYour other card gains [Blocker].",
          "[Trigger] Play this card.",
        ),
        null,
      ),
    ).toMatchObject({ rush: true, blocker: false, trigger: true });
    expect(
      derivePrintedKeywords(
        cardData("[DON!! x2] This Character gains [Rush]."),
        null,
      ).rush,
    ).toBe(false);
  });
});

