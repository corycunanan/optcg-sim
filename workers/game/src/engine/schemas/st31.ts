/**
 * ST31 Effect Schemas — STARTER DECK -RED Monkey.D.Luffy- [ST-31]
 *
 * New IDs ST31-001..005. Reprints are authored in their origin sets.
 * Rulings: docs/FAQs/qa_st-31.md.
 */
import type { EffectSchema } from "../effect-types.js";

// ─── ST31-001 Sanji (Character) ────────────────────────────────────────────

export const ST31_001_SANJI: EffectSchema = {
  card_id: "ST31-001",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "don_x2_rush",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "on_play_draw_play_crew",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Straw Hat Crew"],
              cost_max: 5,
              exclude_name: "Sanji",
            },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

// ─── ST31-002 Jinbe (Character) ────────────────────────────────────────────

export const ST31_002_JINBE: EffectSchema = {
  card_id: "ST31-002",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_play_cost_one",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          // FAQ: the played "card" may be the ST31-005 Thousand Sunny Stage.
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Straw Hat Crew"],
              cost_exact: 1,
              card_type: ["CHARACTER", "STAGE"],
            },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

// ─── ST31-003 Brook (Character) ────────────────────────────────────────────

export const ST31_003_BROOK: EffectSchema = {
  card_id: "ST31-003",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      // FAQ: the total counts DON!! given to every Leader and Character, and
      // is re-checked live (losing the total mid-attack removes [Blocker]).
      id: "opponent_turn_total_given_blocker",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "TOTAL_GIVEN",
        operator: ">=",
        value: 3,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
      },
    },
  ],
};

// ─── ST31-004 Monkey.D.Luffy (Character) ───────────────────────────────────

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

// ─── ST31-005 Thousand Sunny (Stage) ───────────────────────────────────────

export const ST31_005_THOUSAND_SUNNY: EffectSchema = {
  card_id: "ST31-005",
  card_name: "Thousand Sunny",
  card_type: "Stage",
  effects: [
    {
      id: "on_play_search_crew",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "activate_give_don_luffy",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

export const ST31_SCHEMAS: Record<string, EffectSchema> = {
  "ST31-001": ST31_001_SANJI,
  "ST31-002": ST31_002_JINBE,
  "ST31-003": ST31_003_BROOK,
  "ST31-004": ST31_004_LUFFY,
  "ST31-005": ST31_005_THOUSAND_SUNNY,
};
