/** ST31 preview effect schema. Remaining set cards are not imported. */
import type { EffectSchema } from "../effect-types.js";

export const ST31_004_LUFFY: EffectSchema = {
  card_id: "ST31-004",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "total_given_rush",
      category: "permanent",
      source_text: "If you have a total of 3 or more given DON!! cards, this Character gains [Rush].",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "TOTAL_GIVEN",
        operator: ">=",
        value: 3
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "SELF"
          },
          params: {
            keyword: "RUSH"
          }
        }
      ]
    },
    {
      id: "on_play_crew_debuff",
      category: "auto",
      trigger: {
        keyword: "ON_PLAY"
      },
      source_text: "[On Play] For every {Straw Hat Crew} type card on your field, give up to 1 of your opponent's Characters −1000 power during this turn.",
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: {
              up_to: 1
            }
          },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "MATCHING_CARDS_ON_FIELD",
              multiplier: -1000,
              filter: {
                traits: [
                  "Straw Hat Crew"
                ]
              }
            }
          },
          duration: {
            type: "THIS_TURN"
          }
        }
      ]
    }
  ]
};

export const ST31_SCHEMAS: Record<string, EffectSchema> = {
  "ST31-004": ST31_004_LUFFY,
};
