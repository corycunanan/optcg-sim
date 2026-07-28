import { describe, expect, it } from "vitest";
import type { CardData } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { derivePrintedKeywords } from "../engine/printed-keywords.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
  injectSchemasIntoCardDb,
} from "../engine/schema-registry.js";
import { CARDS, createTestCardDb } from "./helpers.js";

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
  it("matches the human-reviewed printed-keyword inventory", () => {
    const none = {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    };
    const expected = {
      "OP01-025": { ...none, rush: true },
      "EB01-003": { ...none, rush: true },
      "OP07-032": { ...none, rushCharacter: true },
      // Conditional on the opponent controlling 2+ Characters. This is not an
      // intrinsic keyword; the schema still needs a future runtime grant.
      "EB02-019": none,
      "OP01-121": { ...none, doubleAttack: true, banish: true },
      "ST23-001": { ...none, blocker: true },
      "OP07-023": { ...none, blocker: true },
      "OP01-075": { ...none, blocker: true },
      "OP02-050": { ...none, blocker: true },
      "OP16-033": { ...none, unblockable: true },
      "OP01-009": { ...none, trigger: true },
      "ST01-004": none,
      "EB02-012": none,
      "OP02-074": none,
      "OP07-009": none,
      "EB04-024": none,
      "OP06-101": { ...none, trigger: true },
      "OP15-070": { ...none, unblockable: true },
      "OP15-071": { ...none, doubleAttack: true },
    } as const;

    for (const [cardId, keywords] of Object.entries(expected)) {
      const schema = getEffectSchema(cardId);
      expect(schema, `${cardId} must have an authored schema`).not.toBeNull();
      expect(derivePrintedKeywords(cardData(), schema), cardId).toEqual(
        keywords,
      );
    }
  });

  it("enforces keyword derivation for every permanent authored effect", () => {
    const keywordFields = {
      RUSH: "rush",
      RUSH_CHARACTER: "rushCharacter",
      DOUBLE_ATTACK: "doubleAttack",
      BANISH: "banish",
      BLOCKER: "blocker",
      UNBLOCKABLE: "unblockable",
    } as const;

    for (const schema of Object.values(getAllAuthoredSchemas())) {
      for (const effect of schema.effects) {
        if (effect.category !== "permanent") continue;
        const flaggedKeywords = effect.flags?.keywords ?? [];
        if (flaggedKeywords.length === 0) continue;

        const gated =
          effect.conditions !== undefined ||
          effect.post_cost_conditions !== undefined ||
          effect.costs !== undefined ||
          effect.trigger !== undefined ||
          effect.duration !== undefined;
        const isolatedSchema: EffectSchema = {
          ...schema,
          effects: [effect],
        };
        const derived = derivePrintedKeywords(cardData(), isolatedSchema);

        for (const keyword of flaggedKeywords) {
          const field = keywordFields[keyword as keyof typeof keywordFields];
          if (!field) continue;
          expect(
            derived[field],
            `${schema.card_id}/${effect.id}/${keyword}`,
          ).toBe(!gated);
        }
      }
    }
  });

  it("keeps structured authored Trigger derivation alive", () => {
    for (const cardId of ["OP01-009", "EB01-010", "ST29-003"]) {
      expect(
        derivePrintedKeywords(cardData(), getEffectSchema(cardId)).trigger,
        cardId,
      ).toBe(true);
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
    for (const effectText of [
      "[DON!! x1] [Blocker]",
      "[Your Turn] [Double Attack]",
      "[Opponent's Turn] [Unblockable]",
    ]) {
      expect(derivePrintedKeywords(cardData(effectText), null), effectText).toEqual({
        rush: false,
        rushCharacter: false,
        doubleAttack: false,
        banish: false,
        blocker: false,
        trigger: false,
        unblockable: false,
      });
    }
  });

  it("recomputes every shared keyword fixture through schema injection", () => {
    const cardDb = createTestCardDb();
    injectSchemasIntoCardDb(cardDb);

    expect(cardDb.get(CARDS.RUSH.id)?.keywords.rush).toBe(true);
    expect(cardDb.get(CARDS.RUSH_CHAR.id)?.keywords.rushCharacter).toBe(true);
    expect(cardDb.get(CARDS.DOUBLE_ATK.id)?.keywords.doubleAttack).toBe(true);
    expect(cardDb.get(CARDS.BLOCKER.id)?.keywords.blocker).toBe(true);
    expect(cardDb.get(CARDS.BANISH.id)?.keywords.banish).toBe(true);
    expect(cardDb.get(CARDS.TRIGGER.id)?.keywords.trigger).toBe(true);
    expect(cardDb.get(CARDS.UNBLOCKABLE.id)?.keywords.unblockable).toBe(true);
  });
});
