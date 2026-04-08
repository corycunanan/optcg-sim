/**
 * ST02 Effect Schemas
 *
 * Green (Supernovas): ST02-001 to ST02-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Supernovas (ST02-001 to ST02-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST02-001 Eustass"Captain"Kid (Leader) — activate set self active
// [Activate: Main] [Once Per Turn] ③ You may trash 1 card from your hand: Set this Leader as active.

export const ST02_001_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "ST02-001",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Leader",
  effects: [
    {
      id: "activate_set_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 3 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST02-003 Urouge (Character) — DON!!x1 conditional +2000
// [DON!! x1] If you have 3 or more Characters, this card gains +2000 power.

export const ST02_003_UROUGE: EffectSchema = {
  card_id: "ST02-003",
  card_name: "Urouge",
  card_type: "Character",
  effects: [
    {
      id: "don_conditional_power",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "SPECIFIC_CARD",
            operator: ">=",
            value: 1,
          },
          {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER" },
            count: { operator: ">=", value: 3 },
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
  ],
};

// ─── ST02-004 Capone"Gang"Bege (Character) — Blocker
// [Blocker]

export const ST02_004_CAPONE_GANG_BEGE: EffectSchema = {
  card_id: "ST02-004",
  card_name: "Capone\"Gang\"Bege",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST02-005 Killer (Character) — On Play KO rested + trigger play self
// [On Play] K.O. up to 1 of your opponent's rested Characters with a cost of 3 or less.
// [Trigger] Play this card.

export const ST02_005_KILLER: EffectSchema = {
  card_id: "ST02-005",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 3 },
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── ST02-007 Jewelry Bonney (Character) — activate search deck
// [Activate: Main] ➀ You may rest this Character: Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const ST02_007_JEWELRY_BONNEY: EffectSchema = {
  card_id: "ST02-007",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "REST_SELF" },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── ST02-008 Scratchmen Apoo (Character) — DON!!x1 rest opponent DON
// [DON!! x1] [When Attacking] Rest up to 1 of your opponent's DON!! cards.

export const ST02_008_SCRATCHMEN_APOO: EffectSchema = {
  card_id: "ST02-008",
  card_name: "Scratchmen Apoo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "REST_OPPONENT_DON",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── ST02-009 Trafalgar Law (Character) — On Play set active
// [On Play] Set up to 1 of your {Supernovas} or {Heart Pirates} type rested Characters with a cost of 5 or less as active.

export const ST02_009_TRAFALGAR_LAW: EffectSchema = {
  card_id: "ST02-009",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Supernovas", "Heart Pirates"],
              is_rested: true,
              cost_max: 5,
            },
          },
        },
      ],
    },
  ],
};

// ─── ST02-010 Basil Hawkins (Character) — DON!!x1 battle trigger set active
// [DON!! x1] [Once Per Turn] [Your Turn] If this Character battles your opponent's Character, set this card as active.

export const ST02_010_BASIL_HAWKINS: EffectSchema = {
  card_id: "ST02-010",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "battle_set_active",
      category: "auto",
      trigger: {
        event: "CHARACTER_BATTLES",
        filter: { battle_target_type: "CHARACTER" },
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
    },
  ],
};

// ─── ST02-013 Eustass"Captain"Kid (Character) — Blocker + end of turn set active
// [Blocker]
// [DON!! x1] [End of Your Turn] Set this Character as active.

export const ST02_013_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "ST02-013",
  card_name: "Eustass\"Captain\"Kid",
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
      trigger: { keyword: "END_OF_YOUR_TURN", don_requirement: 1 },
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
    },
  ],
};

// ─── ST02-014 X.Drake (Character) — DON!!x1 rested aura +1000
// [DON!! x1] [Your Turn] If this Character is rested, your {Supernovas} or {Navy} type Leaders and Characters gain +1000 power.

export const ST02_014_X_DRAKE: EffectSchema = {
  card_id: "ST02-014",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "rested_aura_power",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "SPECIFIC_CARD",
            operator: ">=",
            value: 1,
          },
          { type: "SELF_STATE", required_state: "RESTED" },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits_any_of: ["Supernovas", "Navy"] },
          },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
  ],
};

// ─── ST02-015 Scalpel (Event) — Counter +2000 then set DON active + trigger set DON
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, set up to 1 of your DON!! cards as active.
// [Trigger] Set up to 2 of your DON!! cards as active.

export const ST02_015_SCALPEL: EffectSchema = {
  card_id: "ST02-015",
  card_name: "Scalpel",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_don",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_set_don_active",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "SET_DON_ACTIVE", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── ST02-016 Repel (Event) — Counter +4000 then set DON active
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, set up to 1 of your DON!! cards as active.

export const ST02_016_REPEL: EffectSchema = {
  card_id: "ST02-016",
  card_name: "Repel",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_don",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
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

// ─── ST02-017 Straw Sword (Event) — Main rest opponent + trigger play from hand
// [Main] Rest up to 1 of your opponent's Characters.
// [Trigger] Play up to 1 {Supernovas} type card with a cost of 2 or less from your hand.

export const ST02_017_STRAW_SWORD: EffectSchema = {
  card_id: "ST02-017",
  card_name: "Straw Sword",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_opponent",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
    },
    {
      id: "trigger_play_from_hand",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Supernovas"], cost_max: 2 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST02_SCHEMAS: Record<string, EffectSchema> = {
  "ST02-001": ST02_001_EUSTASS_CAPTAIN_KID,
  "ST02-003": ST02_003_UROUGE,
  "ST02-004": ST02_004_CAPONE_GANG_BEGE,
  "ST02-005": ST02_005_KILLER,
  "ST02-007": ST02_007_JEWELRY_BONNEY,
  "ST02-008": ST02_008_SCRATCHMEN_APOO,
  "ST02-009": ST02_009_TRAFALGAR_LAW,
  "ST02-010": ST02_010_BASIL_HAWKINS,
  "ST02-013": ST02_013_EUSTASS_CAPTAIN_KID,
  "ST02-014": ST02_014_X_DRAKE,
  "ST02-015": ST02_015_SCALPEL,
  "ST02-016": ST02_016_REPEL,
  "ST02-017": ST02_017_STRAW_SWORD,
};
