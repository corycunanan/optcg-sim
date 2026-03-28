/**
 * ST24 Effect Schemas
 *
 * Green (Supernovas): ST24-001 to ST24-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Supernovas (ST24-001 to ST24-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST24-001 Capone"Gang"Bege (Character) — Blocker + conditional draw/trash
// [Blocker]
// [On Play] If you have 6 or more rested cards, draw 1 card and trash 1 card from your hand.

export const ST24_001_CAPONE_GANG_BEGE: EffectSchema = {
  card_id: "ST24-001",
  card_name: "Capone\"Gang\"Bege",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 6,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST24-002 Kid & Killer (Character) — search deck + on opponent attack trash self to set DON active
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.
// [On Your Opponent's Attack] You may trash this Character: Set up to 1 of your DON!! cards as active.

export const ST24_002_KID_AND_KILLER: EffectSchema = {
  card_id: "ST24-002",
  card_name: "Kid & Killer",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Supernovas"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "on_opponent_attack_set_don_active",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        { type: "SET_DON_ACTIVE", params: { amount: 1 } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST24-003 Basil Hawkins (Character) — end of turn set DON active
// [End of Your Turn] Set up to 1 of your DON!! cards as active.

export const ST24_003_BASIL_HAWKINS: EffectSchema = {
  card_id: "ST24-003",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "end_of_turn_set_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        { type: "SET_DON_ACTIVE", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST24-004 Law & Bepo (Character) — rest opponent character + skip refresh + conditional power boost
// [On Play] Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.

export const ST24_004_LAW_AND_BEPO: EffectSchema = {
  card_id: "ST24-004",
  card_name: "Law & Bepo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_and_buff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          result_ref: "rested_char",
        },
        {
          type: "APPLY_PROHIBITION",
          target_ref: "rested_char",
          params: {
            prohibition_type: "CANNOT_REFRESH",
          },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "AND",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { card_type: "CHARACTER", is_rested: true },
            count: { operator: ">=", value: 2 },
          },
        },
      ],
    },
  ],
};

// ─── ST24-005 X.Drake (Character) — conditional rest + scheduled DON set active
// [On Play] If your Leader has the {Supernovas} type, rest up to 1 of your opponent's Characters with a cost of 5 or less. Then, set up to 1 of your DON!! cards as active at the end of this turn.

export const ST24_005_X_DRAKE: EffectSchema = {
  card_id: "ST24-005",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_and_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_DON_ACTIVE",
              params: { amount: 1 },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST24_SCHEMAS: Record<string, EffectSchema> = {
  "ST24-001": ST24_001_CAPONE_GANG_BEGE,
  "ST24-002": ST24_002_KID_AND_KILLER,
  "ST24-003": ST24_003_BASIL_HAWKINS,
  "ST24-004": ST24_004_LAW_AND_BEPO,
  "ST24-005": ST24_005_X_DRAKE,
};
