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

  it("does not derive Trigger from prose references on the 12 affected cards", () => {
    const referencedTriggerText = {
      "OP03-105":
        "[DON!! x1] [When Attacking] You may trash 1 card with a [Trigger] from your hand: This Character gains +3000 power during this battle.",
      "OP03-115":
        "[On Play] You may trash 1 card with a [Trigger] from your hand: K.O. up to 1 of your opponent's Characters with a cost of 1 or less.",
      "OP04-105":
        "[Activate: Main] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Rest up to 1 of your opponent's Characters with a cost of 2 or less.",
      "OP05-109":
        "[Once Per Turn] When a [Trigger] activates, draw 2 cards and trash 2 cards from your hand.",
      "OP11-102":
        "[Your Turn] [Once Per Turn] This effect can be activated when your opponent activates an Event or [Trigger]. If your opponent has 2 or more Life cards, trash 1 card from the top of each of your and your opponent's Life cards.",
      "OP13-110":
        "[Blocker]\n[On Play] If your Leader has the {Egghead} type, play up to 1 Character card with a cost of 5 or less and a [Trigger] from your hand.",
      "ST29-014":
        "[Rush: Character] (This card can attack Characters on the turn in which it is played.)\n[Activate: Main] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Draw 1 card and give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
      "OP03-022":
        "[DON!! x2] [When Attacking] ① (You may rest the specified number of DON!! cards in your cost area.): Play up to 1 Character card with a cost of 4 or less and a [Trigger] from your hand.",
      "OP05-002":
        "[Activate: Main] [Once Per Turn] You may trash 1 {Revolutionary Army} type card from your hand: Up to 3 of your {Revolutionary Army} type Characters or Characters with a [Trigger] gain +3000 power during this turn.",
      "OP09-062":
        "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)\n[When Attacking] You may trash 1 card with a [Trigger] from your hand: Add up to 1 DON!! card from your DON!! deck and rest it.",
      "OP13-100":
        "[Your Turn] [Once Per Turn] This effect can be activated when you play a Character with a [Trigger]. Give up to 2 rested DON!! cards to 1 of your Leader or Character cards.",
      "OP16-080":
        "[Opponent's Turn] All of your Characters gain +1 cost.\n[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Change the target of that attack to this Leader or to one of your {Blackbeard Pirates} type Character cards.",
    } as const;

    for (const [cardId, effectText] of Object.entries(referencedTriggerText)) {
      expect(
        derivePrintedKeywords(
          cardData(effectText),
          getEffectSchema(cardId),
        ).trigger,
        cardId,
      ).toBe(false);
    }

    // Carrot is genuine: its canonical [Trigger] text lives in the effect
    // field rather than the trigger field, so schema authority must preserve it.
    expect(
      derivePrintedKeywords(
        cardData("[Trigger] Play this card."),
        getEffectSchema("OP01-009"),
      ).trigger,
      "OP01-009",
    ).toBe(true);
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
