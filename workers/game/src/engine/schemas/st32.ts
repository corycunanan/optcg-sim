/** ST32 preview effect schema. Remaining set cards are not imported. */
import type { EffectSchema } from "../effect-types.js";

export const ST32_002_ODEN: EffectSchema = {
  card_id: "ST32-002",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_prevent_rest",
      category: "auto",
      trigger: {
        keyword: "ON_PLAY"
      },
      source_text: "[On Play] Draw 1 card, and up to 1 of your opponent's Characters with a base cost of 6 or less cannot be rested until the end of your opponent's next End Phase.",
      actions: [
        {
          type: "DRAW",
          params: {
            amount: 1
          }
        },
        {
          type: "APPLY_PROHIBITION",
          chain: "THEN",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: {
              up_to: 1
            },
            filter: {
              base_cost_max: 6
            }
          },
          params: {
            prohibition_type: "CANNOT_BE_RESTED"
          },
          duration: {
            type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE"
          }
        }
      ]
    }
  ]
};

export const ST32_SCHEMAS: Record<string, EffectSchema> = {
  "ST32-002": ST32_002_ODEN,
};
