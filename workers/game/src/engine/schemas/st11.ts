/**
 * ST11 Effect Schemas
 *
 * Green (Uta / FILM): ST11-001 to ST11-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Uta / FILM (ST11-001 to ST11-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST11-001 Uta (Leader) — DON!!x1 When Attacking reveal search
// [DON!! x1] [When Attacking] [Once Per Turn] Reveal 1 card from the top of your deck and add up to 1 {FILM} type card to your hand. Then, place the rest at the bottom of your deck.

export const ST11_001_UTA: EffectSchema = {
  card_id: "ST11-001",
  card_name: "Uta",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_search",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1, once_per_turn: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 1,
            pick: { up_to: 1 },
            filter: { traits: ["FILM"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── ST11-002 Uta (Character) — Blocker + end of turn set active
// [Blocker]
// [End of Your Turn] You may trash 1 Event from your hand: Set up to 1 of your {FILM} type Characters as active.

export const ST11_002_UTA: EffectSchema = {
  card_id: "ST11-002",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "end_of_turn_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "EVENT" } }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["FILM"] },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST11-003 Backlight (Event) — Main conditional choice
// [Main] If your Leader is [Uta], choose one:
// • Rest up to 1 of your opponent's Characters with a cost of 5 or less.
// • K.O. up to 1 of your opponent's rested Characters with a cost of 5 or less.

export const ST11_003_BACKLIGHT: EffectSchema = {
  card_id: "ST11-003",
  card_name: "Backlight",
  card_type: "Event",
  effects: [
    {
      id: "main_choice",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Uta" },
      },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "SET_REST",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 5 },
                  },
                },
              ],
              [
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { is_rested: true, cost_max: 5 },
                  },
                },
              ],
            ],
          },
        },
      ],
    },
  ],
};

// ─── ST11-004 New Genesis (Event) — Main conditional search + set DON
// [Main] If your Leader is [Uta], look at 3 cards from the top of your deck; reveal up to 1 {FILM} type card other than [New Genesis] and add it to your hand. Then, place the rest at the bottom of your deck in any order and set up to 1 of your DON!! cards as active.

export const ST11_004_NEW_GENESIS: EffectSchema = {
  card_id: "ST11-004",
  card_name: "New Genesis",
  card_type: "Event",
  effects: [
    {
      id: "main_search_and_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Uta" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["FILM"], exclude_name: "New Genesis" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── ST11-005 I'm invincible (Event) — Main set Leader active + trigger power
// [Main] Set up to 1 of your [Uta] Leader as active.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.

export const ST11_005_IM_INVINCIBLE: EffectSchema = {
  card_id: "ST11-005",
  card_name: "I'm invincible",
  card_type: "Event",
  effects: [
    {
      id: "main_set_leader_active",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Uta" },
          },
        },
      ],
    },
    {
      id: "trigger_power_boost",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST11_SCHEMAS: Record<string, EffectSchema> = {
  "ST11-001": ST11_001_UTA,
  "ST11-002": ST11_002_UTA,
  "ST11-003": ST11_003_BACKLIGHT,
  "ST11-004": ST11_004_NEW_GENESIS,
  "ST11-005": ST11_005_IM_INVINCIBLE,
};
