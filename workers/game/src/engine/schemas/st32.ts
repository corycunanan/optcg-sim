/**
 * ST32 Effect Schemas — STARTER DECK -GREEN Roronoa Zoro- [ST-32]
 *
 * New IDs ST32-001..005. Reprints are authored in their origin sets.
 * Rulings: docs/FAQs/qa_st-32.md.
 */
import type { Condition, EffectSchema } from "../effect-types.js";

const LEADER_SLASH: Condition = { type: "LEADER_PROPERTY", controller: "SELF", property: { attribute: "SLASH" } };

// ─── ST32-001 Kin'emon (Character) ─────────────────────────────────────────

export const ST32_001_KINEMON: EffectSchema = {
  card_id: "ST32-001",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_leader_or_don_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "CHOOSE_ONE_COST",
          options: [
            { type: "REST_CARDS", amount: 1, filter: { card_type: "LEADER", attribute: "SLASH" } },
            { type: "REST_DON", amount: 1 },
          ],
        },
      ],
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          chain: "THEN",
          target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
          params: { amount: 1 },
        },
      ],
    },
  ],
};


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

// ─── ST32-003 Dracule Mihawk (Character) ───────────────────────────────────

export const ST32_003_DRACULE_MIHAWK: EffectSchema = {
  card_id: "ST32-003",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_on_rest_draw_trash",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        filter: { target: "SELF" },
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          chain: "THEN",
          target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
          params: { amount: 1 },
        },
      ],
    },
    {
      // FAQ: either a [Perona] or a Slash Character, cost 5 or less either way.
      id: "on_play_play_perona_or_slash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: LEADER_SLASH,
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              cost_max: 5,
              any_of: [{ name: "Perona" }, { attribute: "SLASH" }],
            },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

// ─── ST32-004 Silvers Rayleigh (Character) ─────────────────────────────────

export const ST32_004_SILVERS_RAYLEIGH: EffectSchema = {
  card_id: "ST32-004",
  card_name: "Silvers Rayleigh",
  card_type: "Character",
  effects: [
    {
      id: "slash_leader_rush_character",
      category: "permanent",
      conditions: LEADER_SLASH,
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH_CHARACTER" },
        },
      ],
    },
    {
      id: "on_play_rest_two",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── ST32-005 Roronoa Zoro (Character) ─────────────────────────────────────

export const ST32_005_RORONOA_ZORO: EffectSchema = {
  card_id: "ST32-005",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "rush_character",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "on_play_rest_one",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: LEADER_SLASH,
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

export const ST32_SCHEMAS: Record<string, EffectSchema> = {
  "ST32-001": ST32_001_KINEMON,
  "ST32-002": ST32_002_ODEN,
  "ST32-003": ST32_003_DRACULE_MIHAWK,
  "ST32-004": ST32_004_SILVERS_RAYLEIGH,
  "ST32-005": ST32_005_RORONOA_ZORO,
};
