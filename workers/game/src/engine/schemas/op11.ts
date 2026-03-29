/**
 * OP11 Effect Schemas
 *
 * Red (Koby / Navy / SWORD): OP11-001 to OP11-020
 * Green (Jinbe / Shirahoshi / Fish-Man Island): OP11-021 to OP11-039
 * Blue (Nami / Straw Hat Crew / GERMA): OP11-040 to OP11-061
 * Purple (Charlotte Katakuri / Big Mom Pirates): OP11-062 to OP11-081
 * Black (Navy / SWORD / Wano): OP11-082 to OP11-099
 * Yellow (Shirahoshi / Fish-Man Island / Supernovas): OP11-100 to OP11-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Koby / Navy / SWORD (OP11-001 to OP11-020)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP11-001 Koby (Leader) ───────────────────────────────────────────────────
// Your {SWORD} type Characters can attack Characters on the turn in which they
// are played.
// [Once Per Turn] If your {Navy} type Character with 7000 base power or less
// would be removed from the field by your opponent's effect, you may place 3
// cards from your trash at the bottom of your deck in any order instead.

export const OP11_001_KOBY: EffectSchema = {
  card_id: "OP11-001",
  card_name: "Koby",
  card_type: "Leader",
  effects: [
    {
      id: "grant_rush_character_to_sword",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["SWORD"] },
          },
          params: { keyword: "RUSH_CHARACTER" },
        },
      ],
    },
    {
      id: "replacement_protect_navy",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Navy"],
          base_power_max: 7000,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { exact: 3 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP11-002 Ain (Character) ─────────────────────────────────────────────────
// [On Play] Give up to 1 of your opponent's Characters −1000 power during this
// turn. Then, K.O. up to 1 of your opponent's Characters with 0 power or less.

export const OP11_002_AIN: EffectSchema = {
  card_id: "OP11-002",
  card_name: "Ain",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff_and_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 0 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-004 Kujyaku (Character) ─────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Navy}
// type card other than [Kujyaku] and add it to your hand. Then, place the rest
// at the bottom of your deck in any order.
// [Activate: Main] You may trash this Character: Up to 1 of your Characters
// gains +1000 power during this turn.

export const OP11_004_KUJYAKU: EffectSchema = {
  card_id: "OP11-004",
  card_name: "Kujyaku",
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
            filter: { traits: ["Navy"], exclude_name: "Kujyaku" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "activate_trash_self_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
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

// ─── OP11-005 Smoker (Character) ──────────────────────────────────────────────
// [Blocker]
// [DON!! x1] This Character cannot be K.O.'d by effects of Characters without
// the ＜Special＞ attribute.

export const OP11_005_SMOKER: EffectSchema = {
  card_id: "OP11-005",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "ko_protection",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: {
            cause: "EFFECT",
            source_filter: { attribute_not: "SPECIAL" },
          },
        },
      ],
    },
  ],
};

// ─── OP11-006 Zephyr (Character) ──────────────────────────────────────────────
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's ＜Special＞
// attribute Characters −5000 power during this turn.

export const OP11_006_ZEPHYR: EffectSchema = {
  card_id: "OP11-006",
  card_name: "Zephyr",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff_special",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { attribute: "SPECIAL" },
          },
          params: { amount: -5000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-007 Tashigi (Character) ─────────────────────────────────────────────
// [Activate: Main] You may rest this Character: If your Leader has the {Navy}
// type, up to 1 of your {Navy} type Characters gains +2000 power during this
// turn.

export const OP11_007_TASHIGI: EffectSchema = {
  card_id: "OP11-007",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "activate_buff_navy",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Navy"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-008 Doll (Character) ────────────────────────────────────────────────
// [Blocker]
// [On Play] You may trash 1 card from your hand: If your Leader has the {Navy}
// type, give up to 1 of your opponent's Characters −6000 power during this turn.

export const OP11_008_DOLL: EffectSchema = {
  card_id: "OP11-008",
  card_name: "Doll",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -6000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-009 Nico Robin (Character) ──────────────────────────────────────────
// [DON!! x2] [When Attacking] Give up to 1 of your opponent's Characters −2000
// power until the end of your opponent's next turn.

export const OP11_009_NICO_ROBIN: EffectSchema = {
  card_id: "OP11-009",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-010 Hibari (Character) ──────────────────────────────────────────────
// [On Play] Give up to 1 of your opponent's Characters −2000 power during this
// turn.
// [When Attacking] This Character gains +1000 power during this turn. Then, up
// to 1 of your {Navy} type Leader can also attack active Characters during this
// turn.

export const OP11_010_HIBARI: EffectSchema = {
  card_id: "OP11-010",
  card_name: "Hibari",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "when_attacking_buff_and_grant",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "LEADER", traits: ["Navy"] },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-012 Franky (Character) ──────────────────────────────────────────────
// [Your Turn] [Once Per Turn] When your opponent activates an Event, all of your
// Characters gain +2000 power during this turn.

export const OP11_012_FRANKY: EffectSchema = {
  card_id: "OP11-012",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "opponent_event_buff",
      category: "auto",
      trigger: {
        event: "EVENT_ACTIVATED",
        filter: { controller: "OPPONENT" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_YOUR_CHARACTERS" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-013 Prince Grus (Character) ─────────────────────────────────────────
// [When Attacking] All of your opponent's Characters with 2000 power or less
// cannot activate [Blocker] during this turn.

export const OP11_013_PRINCE_GRUS: EffectSchema = {
  card_id: "OP11-013",
  card_name: "Prince Grus",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_block_prohibition",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "ALL_OPPONENT_CHARACTERS",
            filter: { power_max: 2000 },
          },
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-014 Borsalino (Character) ───────────────────────────────────────────
// [Blocker]
// [Activate: Main] You may rest this Character: Up to 1 of your {Navy} type
// Leader or Character cards can also attack active Characters during this turn.

export const OP11_014_BORSALINO: EffectSchema = {
  card_id: "OP11-014",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "activate_grant_attack_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Navy"] },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-016 Roronoa Zoro (Character) ────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your
// Leader or 1 of your Characters.

export const OP11_016_RORONOA_ZORO: EffectSchema = {
  card_id: "OP11-016",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP11-018 Honesty Impact (Event) ──────────────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters −4000 power during this
// turn. Then, K.O. up to 1 of your opponent's Characters with 6000 power or
// less.
// [Trigger] K.O. up to 1 of your opponent's Characters with 6000 power or less.

export const OP11_018_HONESTY_IMPACT: EffectSchema = {
  card_id: "OP11-018",
  card_name: "Honesty Impact",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff_and_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 6000 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 6000 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-019 Glorp Web!! (Event) ─────────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if your opponent has a Character with 6000 power or more,
// up to 1 of your Leader or Character cards gains +1000 power during this turn.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP11_019_GLORP_WEB: EffectSchema = {
  card_id: "OP11-019",
  card_name: "Glorp Web!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff",
      category: "auto",
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
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { power_min: 6000 },
            count: { operator: ">=", value: 1 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_buff",
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

// ─── OP11-020 X Calibur (Event) ───────────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if your opponent has a Character with 6000 power or more,
// up to 1 of your Leader or Character cards gains +1000 power during this turn.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP11_020_X_CALIBUR: EffectSchema = {
  card_id: "OP11-020",
  card_name: "X Calibur",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff",
      category: "auto",
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
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { power_min: 6000 },
            count: { operator: ">=", value: 1 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_buff",
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
// GREEN — Jinbe / Shirahoshi / Fish-Man Island (OP11-021 to OP11-039)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP11-021 Jinbe (Leader) ──────────────────────────────────────────────────
// [End of Your Turn] If you have 6 or less cards in your hand, set up to 1 of
// your {Fish-Man} or {Merfolk} type Characters and up to 1 of your DON!! cards
// as active.

export const OP11_021_JINBE: EffectSchema = {
  card_id: "OP11-021",
  card_name: "Jinbe",
  card_type: "Leader",
  effects: [
    {
      id: "eot_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_any_of: ["Fish-Man", "Merfolk"] },
          },
        },
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP11-022 Shirahoshi (Leader) ─────────────────────────────────────────────
// This Leader cannot attack.
// [Activate: Main] [Once Per Turn] You may rest 1 of your DON!! cards and turn
// 1 card from the top of your Life cards face-up: Play up to 1 {Neptunian} type
// Character card or [Megalo] with a cost equal to or less than the number of
// DON!! cards on your field from your hand.

export const OP11_022_SHIRAHOSHI: EffectSchema = {
  card_id: "OP11-022",
  card_name: "Shirahoshi",
  card_type: "Leader",
  effects: [
    {
      id: "cannot_attack",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
        },
      ],
    },
    {
      id: "activate_play_from_hand",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "REST_DON", amount: 1 },
      ],
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { traits: ["Neptunian"] },
                { name: "Megalo" },
              ],
              cost_max: { type: "GAME_STATE", source: "DON_FIELD_COUNT" },
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP11-023 Arlong (Character) ──────────────────────────────────────────────
// If your Leader has the {Fish-Man} type, you have 3 or less Life cards and your
// opponent has 5 or more rested cards, give this card in your hand −3 cost.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP11_023_ARLONG: EffectSchema = {
  card_id: "OP11-023",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Fish-Man" },
          },
          {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 3,
          },
          {
            type: "RESTED_CARD_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 5,
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF", self_ref: true },
          params: { amount: -3 },
        },
      ],
    },
    {
      id: "trigger_rest",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-024 Aladine (Character) ─────────────────────────────────────────────
// When this Character is K.O.'d by your opponent's effect, you may trash 1 card
// from your hand and rest 1 of your DON!! cards. If you do, play up to 1
// {Fish-Man} or {Merfolk} type Character card with a cost of 6 or less from
// your hand.

export const OP11_024_ALADINE: EffectSchema = {
  card_id: "OP11-024",
  card_name: "Aladine",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_KO", cause: "OPPONENT_EFFECT" },
      flags: { optional: true },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_DON", amount: 1 },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
              cost_max: 6,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP11-025 Ishilly (Character) ─────────────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!! cards
// and this Character: Up to 1 of your Leader or Character cards gains +1000
// power during this battle.

export const OP11_025_ISHILLY: EffectSchema = {
  card_id: "OP11-025",
  card_name: "Ishilly",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP11-027 Bulge-Eyed Neptunian (Character) ───────────────────────────────
// If your Leader is [Shirahoshi], this Character can attack Characters on the
// turn in which it is played.

export const OP11_027_BULGE_EYED_NEPTUNIAN: EffectSchema = {
  card_id: "OP11-027",
  card_name: "Bulge-Eyed Neptunian",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush_character",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH_CHARACTER" },
        },
      ],
    },
  ],
};

// ─── OP11-028 Lord of the Coast (Character) ───────────────────────────────────
// [On Play] Up to 1 of your opponent's rested Characters will not become active
// in your opponent's next Refresh Phase.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of 3
// or less.

export const OP11_028_LORD_OF_THE_COAST: EffectSchema = {
  card_id: "OP11-028",
  card_name: "Lord of the Coast",
  card_type: "Character",
  effects: [
    {
      id: "on_play_skip_refresh",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
    {
      id: "trigger_ko_rested",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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
  ],
};

// ─── OP11-029 Charlotte Praline (Character) ───────────────────────────────────
// [Blocker]
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 1 or less.

export const OP11_029_CHARLOTTE_PRALINE: EffectSchema = {
  card_id: "OP11-029",
  card_name: "Charlotte Praline",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-030 Shirahoshi (Character) ──────────────────────────────────────────
// [Activate: Main] You may rest 1 of your DON!! cards and this Character: Look
// at 5 cards from the top of your deck; reveal up to 1 {Neptunian} or
// {Fish-Man Island} type card and add it to your hand. Then, place the rest at
// the bottom of your deck in any order.

export const OP11_030_SHIRAHOSHI: EffectSchema = {
  card_id: "OP11-030",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_any_of: ["Neptunian", "Fish-Man Island"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP11-031 Jinbe (Character) ───────────────────────────────────────────────
// [On Play] If your Leader has the {Fish-Man} or {Merfolk} type, rest up to 1
// of your opponent's Characters with a cost of 5 or less.
// [Activate: Main] [Once Per Turn] Up to 1 of your {Fish-Man} or {Merfolk} type
// Characters can attack Characters on the turn in which it is played.

export const OP11_031_JINBE: EffectSchema = {
  card_id: "OP11-031",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
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
      ],
    },
    {
      id: "activate_grant_rush_character",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_any_of: ["Fish-Man", "Merfolk"] },
          },
          params: { keyword: "RUSH_CHARACTER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-034 Hatchan (Character) ─────────────────────────────────────────────
// [Activate: Main] You may rest this Character: If your Leader has the
// {Fish-Man} or {Merfolk} type, up to 1 of your opponent's Characters with a
// cost of 3 or less cannot be rested until the end of your opponent's next turn.

export const OP11_034_HATCHAN: EffectSchema = {
  card_id: "OP11-034",
  card_name: "Hatchan",
  card_type: "Character",
  effects: [
    {
      id: "activate_prohibition",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-035 Fisher Tiger (Character) ────────────────────────────────────────
// When this Character is K.O.'d by your opponent's effect, you may rest 1 of
// your DON!! cards. If you do, play up to 1 {Fish-Man} or {Merfolk} type
// Character card with a cost of 4 or less from your hand.
// [On Play] Rest up to 1 of your opponent's Characters.

export const OP11_035_FISHER_TIGER: EffectSchema = {
  card_id: "OP11-035",
  card_name: "Fisher Tiger",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_KO", cause: "OPPONENT_EFFECT" },
      flags: { optional: true },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
              cost_max: 4,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "on_play_rest",
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
        },
      ],
    },
  ],
};

// ─── OP11-036 Spotted Neptunian (Character) ───────────────────────────────────
// [On Play] If your Leader is [Shirahoshi], look at 5 cards from the top of
// your deck; reveal up to 1 {Neptunian} type card or [Shirahoshi] and add it
// to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP11_036_SPOTTED_NEPTUNIAN: EffectSchema = {
  card_id: "OP11-036",
  card_name: "Spotted Neptunian",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { traits: ["Neptunian"] },
                { name: "Shirahoshi" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP11-037 Ancient Weapon Poseidon (Event) ─────────────────────────────────
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 {Neptunian}
// or {Fish-Man Island} type Character card and add it to your hand. Then, place
// the rest at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP11_037_ANCIENT_WEAPON_POSEIDON: EffectSchema = {
  card_id: "OP11-037",
  card_name: "Ancient Weapon Poseidon",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Neptunian", "Fish-Man Island"],
              card_type: "CHARACTER",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP11-038 Gum-Gum Elephant Gatling (Event) ───────────────────────────────
// [Main] You may rest 1 of your DON!! cards: Rest up to 1 of your opponent's
// Characters with a cost of 5 or less.
// [Counter] Up to 1 of your Leader gains +3000 power during this battle.

export const OP11_038_GUM_GUM_ELEPHANT_GATLING: EffectSchema = {
  card_id: "OP11-038",
  card_name: "Gum-Gum Elephant Gatling",
  card_type: "Event",
  effects: [
    {
      id: "main_rest",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "REST_DON", amount: 1 }],
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
      ],
    },
    {
      id: "counter_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP11-039 Vagabond Drill (Event) ──────────────────────────────────────────
// [Counter] Up to 1 of your {Fish-Man} or {Merfolk} type Leader or Character
// cards gains +3000 power during this battle. Then, rest up to 1 of your
// opponent's Characters with a cost of 3 or less.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP11_039_VAGABOND_DRILL: EffectSchema = {
  card_id: "OP11-039",
  card_name: "Vagabond Drill",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_rest",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_any_of: ["Fish-Man", "Merfolk"] },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_rest",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Nami / Straw Hat Crew / GERMA (OP11-040 to OP11-061)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP11-040 Monkey.D.Luffy (Leader) ─────────────────────────────────────────
// This effect can be activated at the start of your turn. If you have 8 or more
// DON!! cards on your field, look at 5 cards from the top of your deck; reveal
// up to 1 {Straw Hat Crew} type card and add it to your hand. Then, place the
// rest at the top or bottom of the deck in any order.

export const OP11_040_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP11-040",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "start_of_turn_search",
      category: "auto",
      trigger: { keyword: "START_OF_TURN" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
            rest_destination: "TOP_OR_BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP11-041 Nami (Leader) ───────────────────────────────────────────────────
// [Your Turn] [Once Per Turn] This effect can be activated when a card is removed
// from your or your opponent's Life cards. If you have 7 or less cards in your
// hand, draw 1 card.
// [DON!! x1] [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card
// from your hand: This Leader gains +2000 power during this turn.

export const OP11_041_NAMI: EffectSchema = {
  card_id: "OP11-041",
  card_name: "Nami",
  card_type: "Leader",
  effects: [
    {
      id: "life_removed_draw",
      category: "auto",
      trigger: {
        event: "LIFE_CARD_REMOVED",
        filter: { controller: "ANY" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 7,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
    {
      id: "on_opponent_attack_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", don_requirement: 1 },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-042 Vito (Character) ────────────────────────────────────────────────
// [On Play] You may trash 1 {Firetank Pirates} type card from your hand: This
// Character gains [Rush] during this turn.

export const OP11_042_VITO: EffectSchema = {
  card_id: "OP11-042",
  card_name: "Vito",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Firetank Pirates"] } }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-043 Vinsmoke Ichiji (Character) ─────────────────────────────────────
// [Blocker]
// [On Your Opponent's Attack] [Once Per Turn] This effect can be activated when
// you only have Characters with a type including "GERMA". Up to 1 of your Leader
// or Character cards gains +1000 power during this battle. Then, trash 2 cards
// from the top of your deck.

export const OP11_043_VINSMOKE_ICHIJI: EffectSchema = {
  card_id: "OP11-043",
  card_name: "Vinsmoke Ichiji",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_opponent_attack_buff_and_mill",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { traits_contains: ["GERMA"] },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-044 Vinsmoke Judge (Character) ──────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: All of
// your {GERMA 66} type Characters gain +1000 power during this turn.

export const OP11_044_VINSMOKE_JUDGE: EffectSchema = {
  card_id: "OP11-044",
  card_name: "Vinsmoke Judge",
  card_type: "Character",
  effects: [
    {
      id: "activate_buff_germa",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits: ["GERMA 66"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-046 Vinsmoke Yonji (Character) ──────────────────────────────────────
// [Blocker]
// If you only have Characters with a type including "GERMA", this Character
// cannot be K.O.'d or rested by your opponent's effects.

export const OP11_046_VINSMOKE_YONJI: EffectSchema = {
  card_id: "OP11-046",
  card_name: "Vinsmoke Yonji",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "conditional_protection",
      category: "permanent",
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { traits_contains: ["GERMA"] },
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
        {
          type: "CANNOT_BE_RESTED",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
  ],
};

// ─── OP11-047 Vinsmoke Reiju (Character) ──────────────────────────────────────
// [On Play] If your Leader has the {The Vinsmoke Family} type, look at 5 cards
// from the top of your deck; reveal up to 1 card with a type including "GERMA"
// and add it to your hand. Then, trash the rest.

export const OP11_047_VINSMOKE_REIJU: EffectSchema = {
  card_id: "OP11-047",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Vinsmoke Family" },
      },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_contains: ["GERMA"] },
          },
        },
      ],
    },
  ],
};

// ─── OP11-048 Capone"Gang"Bege (Character) ────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1
// {Firetank Pirates} or {Straw Hat Crew} type card with a cost of 2 or more
// and add it to your hand. Then, place the rest at the bottom of your deck in
// any order.

export const OP11_048_CAPONE_GANG_BEGE: EffectSchema = {
  card_id: "OP11-048",
  card_name: 'Capone"Gang"Bege',
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
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Firetank Pirates", "Straw Hat Crew"],
              cost_min: 2,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP11-049 Carrot (Character) ──────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck and place them at the top
// or bottom of the deck in any order.
// [On Your Opponent's Attack] You may trash this Character: Up to 1 of your
// Leader gains +1000 power during this battle.

export const OP11_049_CARROT: EffectSchema = {
  card_id: "OP11-049",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 3 },
        },
      ],
    },
    {
      id: "on_opponent_attack_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP11-050 Gotti (Character) ───────────────────────────────────────────────
// [When Attacking] You may trash 1 {Firetank Pirates} type card from your hand:
// Return up to 1 Character with a cost of 1 or less to the owner's hand or
// place it at the bottom of their deck.

export const OP11_050_GOTTI: EffectSchema = {
  card_id: "OP11-050",
  card_name: "Gotti",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce_or_bottom",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Firetank Pirates"] } }],
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "RETURN_TO_HAND",
                  target: {
                    type: "CHARACTER",
                    controller: "EITHER",
                    count: { up_to: 1 },
                    filter: { cost_max: 1 },
                  },
                },
              ],
              [
                {
                  type: "RETURN_TO_DECK",
                  target: {
                    type: "CHARACTER",
                    controller: "EITHER",
                    count: { up_to: 1 },
                    filter: { cost_max: 1 },
                  },
                  params: { position: "BOTTOM" },
                },
              ],
            ],
            labels: ["Return to hand", "Place at bottom of deck"],
          },
        },
      ],
    },
  ],
};

// ─── OP11-051 Sanji (Character) ───────────────────────────────────────────────
// When this Character is K.O.'d by your opponent's effect, look at 5 cards from
// the top of your deck and play up to 1 {Straw Hat Crew} type Character card
// with a cost of 5 or less. Then, place the rest at the bottom of your deck in
// any order.
// [On Play] Return up to 1 Character with 5000 base power or less to the
// owner's hand.

export const OP11_051_SANJI: EffectSchema = {
  card_id: "OP11-051",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_search_and_play",
      category: "auto",
      trigger: { keyword: "ON_KO", cause: "OPPONENT_EFFECT" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: {
              traits: ["Straw Hat Crew"],
              card_type: "CHARACTER",
              cost_max: 5,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { base_power_max: 5000 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-054 Nami (Character) ────────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader is multicolored, draw 3 cards and place 2 cards from
// your hand at the top or bottom of your deck in any order.

export const OP11_054_NAMI: EffectSchema = {
  card_id: "OP11-054",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_and_place",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 3 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "TOP_OR_BOTTOM" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP11-056 Brook (Character) ───────────────────────────────────────────────
// [Blocker]
// [On Play] Place up to 1 Character with a base cost of 1 at the bottom of the
// owner's deck.

export const OP11_056_BROOK: EffectSchema = {
  card_id: "OP11-056",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { base_cost_exact: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP11-057 Pedro (Character) ───────────────────────────────────────────────
// If you have 4 or less cards in your hand, this Character gains [Blocker].

export const OP11_057_PEDRO: EffectSchema = {
  card_id: "OP11-057",
  card_name: "Pedro",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP11-058 Monkey.D.Luffy (Character) ──────────────────────────────────────
// If you have 5 or more cards in your hand, this Character cannot attack.
// [Blocker]

export const OP11_058_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP11-058",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "conditional_cannot_attack",
      category: "permanent",
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 5,
      },
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
        },
      ],
    },
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP11-059 Gum-Gum King Cobra (Event) ─────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 4 or less cards in your hand, that card gains
// an additional +2000 power during this battle.
// [Trigger] Return up to 1 Character with a cost of 2 or less to the owner's
// hand.

export const OP11_059_GUM_GUM_KING_COBRA: EffectSchema = {
  card_id: "OP11-059",
  card_name: "Gum-Gum King Cobra",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff",
      category: "auto",
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
          result_ref: "boosted_card",
        },
        {
          type: "MODIFY_POWER",
          target_ref: "boosted_card",
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          conditions: {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 4,
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_bounce",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-060 Let's Crash This Wedding!!! (Event) ─────────────────────────────
// [Main] If your Leader is multicolored, look at 5 cards from the top of your
// deck; reveal up to 1 {Straw Hat Crew} type card other than [Let's Crash This
// Wedding!!!] and add it to your hand. Then, place the rest at the bottom of
// your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const OP11_060_LETS_CRASH_THIS_WEDDING: EffectSchema = {
  card_id: "OP11-060",
  card_name: "Let's Crash This Wedding!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Straw Hat Crew"],
              exclude_name: "Let's Crash This Wedding!!!",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "main_search" },
        },
      ],
    },
  ],
};

// ─── OP11-061 Gum-Gum Jet Culverin (Event) ───────────────────────────────────
// [Main] Place up to 1 of your opponent's Characters with a base cost of 4 or
// less at the bottom of the owner's deck.
// [Trigger] Place up to 1 Character with a cost of 1 or less at the bottom of
// the owner's deck.

export const OP11_061_GUM_GUM_JET_CULVERIN: EffectSchema = {
  card_id: "OP11-061",
  card_name: "Gum-Gum Jet Culverin",
  card_type: "Event",
  effects: [
    {
      id: "main_bottom_deck",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 4 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "trigger_bottom_deck",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Charlotte Katakuri / Big Mom Pirates (OP11-062 to OP11-081)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP11-062 Charlotte Katakuri (Leader) ─────────────────────────────────────
// [When Attacking]/[On Your Opponent's Attack] [Once Per Turn] DON!! −1: Look
// at 1 card from the top of your opponent's deck. Then, this Leader gains +1000
// power during this battle.

export const OP11_062_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "OP11-062",
  card_name: "Charlotte Katakuri",
  card_type: "Leader",
  effects: [
    {
      id: "peek_and_buff",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING" },
          { keyword: "ON_OPPONENT_ATTACK" },
        ],
      },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "REVEAL",
          target: {
            type: "CARD_ON_TOP_OF_DECK",
            controller: "OPPONENT",
          },
          params: { amount: 1, source: "DECK_TOP", visibility: "CONTROLLER_ONLY" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-063 Little Sadi (Character) ─────────────────────────────────────────
// [On Play] DON!! −1: If your Leader has the {Impel Down} type, rest up to 1 of
// your opponent's Characters with a cost of 3 or less.

export const OP11_063_LITTLE_SADI: EffectSchema = {
  card_id: "OP11-063",
  card_name: "Little Sadi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Impel Down" },
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-065 Charlotte Anana (Character) ─────────────────────────────────────
// If you have a purple {Big Mom Pirates} type Character other than [Charlotte
// Anana], this Character gains [Blocker].

export const OP11_065_CHARLOTTE_ANANA: EffectSchema = {
  card_id: "OP11-065",
  card_name: "Charlotte Anana",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          color: "PURPLE",
          traits: ["Big Mom Pirates"],
          exclude_name: "Charlotte Anana",
        },
        count: { operator: ">=", value: 1 },
        exclude_self: true,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP11-067 Charlotte Katakuri (Character) ──────────────────────────────────
// [Blocker]
// [End of Your Turn] Set up to 2 of your {Big Mom Pirates} type Characters with
// a cost of 3 or more as active. Then, add up to 1 DON!! card from your DON!!
// deck and rest it.

export const OP11_067_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "OP11-067",
  card_name: "Charlotte Katakuri",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "eot_set_active_and_add_don",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 2 },
            filter: { traits: ["Big Mom Pirates"], cost_min: 3 },
          },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-069 Charlotte Brulee (Character) ────────────────────────────────────
// [On Play] You may add 1 card from the top of your Life cards to your hand: If
// your Leader has the {Big Mom Pirates} type, add up to 1 DON!! card from your
// DON!! deck and set it as active.

export const OP11_069_CHARLOTTE_BRULEE: EffectSchema = {
  card_id: "OP11-069",
  card_name: "Charlotte Brulee",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_for_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Big Mom Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP11-070 Charlotte Pudding (Character) ───────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Big Mom
// Pirates} type card with a cost of 2 or more and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// [Activate: Main] DON!! −1, You may rest this Character: Look at 1 card from
// the top of your opponent's deck.

export const OP11_070_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "OP11-070",
  card_name: "Charlotte Pudding",
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
            filter: { traits: ["Big Mom Pirates"], cost_min: 2 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "activate_peek",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "REVEAL",
          target: {
            type: "CARD_ON_TOP_OF_DECK",
            controller: "OPPONENT",
          },
          params: { amount: 1, source: "DECK_TOP", visibility: "CONTROLLER_ONLY" },
        },
      ],
    },
  ],
};

// ─── OP11-072 Charlotte Mont-d'or (Character) ─────────────────────────────────
// [Activate: Main] [Once Per Turn] DON!! −1, You may rest this Character: Your
// opponent places 2 cards from their trash at the bottom of their deck in any
// order. Then, add 1 card from the top of your Life cards to your hand.

export const OP11_072_CHARLOTTE_MONT_DOR: EffectSchema = {
  card_id: "OP11-072",
  card_name: "Charlotte Mont-d'or",
  card_type: "Character",
  effects: [
    {
      id: "activate_opponent_trash_and_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "RETURN_TO_DECK",
              target: {
                type: "CARD_IN_TRASH",
                controller: "SELF",
                count: { exact: 2 },
              },
              params: { position: "BOTTOM" },
            },
          },
        },
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-075 Jaguar.D.Saul (Character) ───────────────────────────────────────
// [On Play] If your Leader is [Nico Robin] and you have 7 or more DON!! cards
// on your field, draw 2 cards.
// [Trigger] Activate this card's [On Play] effect.

export const OP11_075_JAGUAR_D_SAUL: EffectSchema = {
  card_id: "OP11-075",
  card_name: "Jaguar.D.Saul",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Nico Robin" },
          },
          {
            type: "DON_FIELD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 7,
          },
        ],
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "on_play_draw" },
        },
      ],
    },
  ],
};

// ─── OP11-076 Hannyabal (Character) ───────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader has the {Impel Down} type, play up to 1 {Impel Down}
// type Character card with a cost of 3 or less from your hand.

export const OP11_076_HANNYABAL: EffectSchema = {
  card_id: "OP11-076",
  card_name: "Hannyabal",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Impel Down" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Impel Down"], cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP11-077 Randolph (Character) ────────────────────────────────────────────
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to
// your DON!! deck, up to 1 of your {Big Mom Pirates} type Characters gains +2
// cost until the end of your opponent's next turn.

export const OP11_077_RANDOLPH: EffectSchema = {
  card_id: "OP11-077",
  card_name: "Randolph",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_cost_boost",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Big Mom Pirates"] },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-080 Gear Two (Event) ────────────────────────────────────────────────
// [Main] You may rest 2 of your DON!! cards: If your Leader's colors include
// blue, add up to 1 DON!! card from your DON!! deck and rest it.
// [Counter] Up to 1 of your Leader gains +3000 power during this battle.

export const OP11_080_GEAR_TWO: EffectSchema = {
  card_id: "OP11-080",
  card_name: "Gear Two",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "REST_DON", amount: 2 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { color_includes: "BLUE" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
    {
      id: "counter_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Navy / SWORD / Wano (OP11-082 to OP11-099)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP11-082 Aramaki (Character) ─────────────────────────────────────────────
// [Activate: Main] You may trash this Character: If your Leader has the {Navy}
// type, up to 1 of your {Navy} type Characters can also attack active Characters
// during this turn. Then, trash 2 cards from the top of your deck.

export const OP11_082_ARAMAKI: EffectSchema = {
  card_id: "OP11-082",
  card_name: "Aramaki",
  card_type: "Character",
  effects: [
    {
      id: "activate_grant_and_mill",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Navy"] },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-083 Caribou (Character) ─────────────────────────────────────────────
// [Blocker]
// [On Play] Trash 2 cards from your hand.

export const OP11_083_CARIBOU: EffectSchema = {
  card_id: "OP11-083",
  card_name: "Caribou",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_trash_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP11-084 Kuzan (Character) ───────────────────────────────────────────────
// [On Play] Trash 3 cards from the top of your deck.
// [When Attacking] Up to 1 of your {Navy} type Leader or Character cards can
// also attack active Characters during this turn.

export const OP11_084_KUZAN: EffectSchema = {
  card_id: "OP11-084",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "on_play_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "when_attacking_grant_attack_active",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Navy"] },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP11-085 Kurozumi Orochi (Character) ─────────────────────────────────────
// [On Play] Add up to 1 {SMILE} type card with a cost of 5 or less from your
// trash to your hand.

export const OP11_085_KUROZUMI_OROCHI: EffectSchema = {
  card_id: "OP11-085",
  card_name: "Kurozumi Orochi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["SMILE"], cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-086 Coribou (Character) ─────────────────────────────────────────────
// [On Play] Trash 1 card from your hand.
// [Activate: Main] You may trash this Character: Play up to 1 [Caribou] with a
// cost of 4 or less from your trash.

export const OP11_086_CORIBOU: EffectSchema = {
  card_id: "OP11-086",
  card_name: "Coribou",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "activate_play_from_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { name: "Caribou", cost_max: 4 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP11-088 Shu (Character) ─────────────────────────────────────────────────
// [Blocker]
// [Once Per Turn] This effect can be activated when your opponent's Character
// attacks. If that Character has the ＜Slash＞ attribute, this Character gains
// +5000 power during this battle.

export const OP11_088_SHU: EffectSchema = {
  card_id: "OP11-088",
  card_name: "Shu",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "slash_attacker_buff",
      category: "auto",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
        once_per_turn: true,
      },
      conditions: {
        type: "SOURCE_PROPERTY",
        context: "KO_IN_BATTLE" as never,
        source_filter: { attribute: "SLASH" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 5000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP11-090 Briscola (Character) ────────────────────────────────────────────
// [Blocker]

export const OP11_090_BRISCOLA: EffectSchema = {
  card_id: "OP11-090",
  card_name: "Briscola",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP11-091 Berry Good (Character) ──────────────────────────────────────────
// [On Play] Your opponent places 3 Events from their trash at the bottom of
// their deck in any order.

export const OP11_091_BERRY_GOOD: EffectSchema = {
  card_id: "OP11-091",
  card_name: "Berry Good",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_return_events",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "RETURN_TO_DECK",
              target: {
                type: "CARD_IN_TRASH",
                controller: "SELF",
                count: { exact: 3 },
                filter: { card_type: "EVENT" },
              },
              params: { position: "BOTTOM" },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP11-092 Helmeppo (Character) ────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Draw 1 card and play up to 1
// {SWORD} type Character card with a cost of 8 or less other than [Helmeppo]
// from your trash. Then, place the 1 Character played by this effect at the
// bottom of the owner's deck at the end of this turn.

export const OP11_092_HELMEPPO: EffectSchema = {
  card_id: "OP11-092",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["SWORD"],
              cost_max: 8,
              exclude_name: "Helmeppo",
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          result_ref: "played_character",
          chain: "AND",
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "RETURN_TO_DECK",
              target_ref: "played_character",
              params: { position: "BOTTOM" },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-095 Monkey.D.Garp (Character) ───────────────────────────────────────
// [On Play] You may place 3 {Navy} type cards from your trash at the bottom of
// your deck in any order: Give up to 1 rested DON!! card to 1 of your Leader.
// Then, if there is a Character with a cost of 9 or more, K.O. up to 1 of your
// opponent's Characters with a cost of 7 or less.

export const OP11_095_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP11-095",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_and_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 3,
          filter: { traits: ["Navy"] },
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1 },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", cost_min: 9 },
            count: { operator: ">=", value: 1 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-096 Ripper (Character) ──────────────────────────────────────────────
// If you have a black {Navy} type Character other than [Ripper], this Character
// gains [Blocker].

export const OP11_096_RIPPER: EffectSchema = {
  card_id: "OP11-096",
  card_name: "Ripper",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          color: "BLACK",
          traits: ["Navy"],
          exclude_name: "Ripper",
        },
        count: { operator: ">=", value: 1 },
        exclude_self: true,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP11-097 After All These Years I'm Losing My Edge!!! (Event) ─────────────
// [Counter] Up to 1 of your Leader or Character cards gains +1000 power during
// this battle. Then, if you have 10 or more cards in your trash, add up to 1
// black Character card with a cost of 3 or less from your trash to your hand.

export const OP11_097_AFTER_ALL_THESE_YEARS: EffectSchema = {
  card_id: "OP11-097",
  card_name: "After All These Years I'm Losing My Edge!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_retrieve",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "BLACK",
              card_type: "CHARACTER",
              cost_max: 3,
            },
          },
          conditions: {
            type: "TRASH_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 10,
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-098 Blue Hole (Event) ───────────────────────────────────────────────
// [Main] You may trash 3 cards from the top of your deck: K.O. up to 1 of your
// opponent's Characters with a cost of 2 or less.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP11_098_BLUE_HOLE: EffectSchema = {
  card_id: "OP11-098",
  card_name: "Blue Hole",
  card_type: "Event",
  effects: [
    {
      id: "main_mill_and_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          chain: "IF_DO",
        },
      ],
    },
    {
      id: "trigger_buff",
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

// ─── OP11-099 I'm Gonna Be a Navy Officer!!! (Event) ──────────────────────────
// [Main] Look at 3 cards from the top of your deck; reveal up to 1 {Navy} type
// card other than [I'm Gonna Be a Navy Officer!!!] and add it to your hand.
// Then, trash the rest.
// [Trigger] Activate this card's [Main] effect.

export const OP11_099_IM_GONNA_BE_A_NAVY_OFFICER: EffectSchema = {
  card_id: "OP11-099",
  card_name: "I'm Gonna Be a Navy Officer!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Navy"],
              exclude_name: "I'm Gonna Be a Navy Officer!!!",
            },
          },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "main_search" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Shirahoshi / Fish-Man Island / Supernovas (OP11-100 to OP11-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP11-100 Otohime (Character) ─────────────────────────────────────────────
// [On Play] If your Leader is [Shirahoshi], you may turn 1 card from the top of
// your Life cards face-down: Draw 1 card.

export const OP11_100_OTOHIME: EffectSchema = {
  card_id: "OP11-100",
  card_name: "Otohime",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      flags: { optional: true },
      actions: [
        {
          type: "TURN_LIFE_FACE_DOWN",
          params: { amount: 1 },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP11-101 Capone"Gang"Bege (Character) ────────────────────────────────────
// [Blocker]
// [Once Per Turn] If your {Supernovas} type Character other than
// [Capone"Gang"Bege] would be removed from the field by your opponent's effect,
// you may add it to the top of your Life cards face-down instead.

export const OP11_101_CAPONE_GANG_BEGE: EffectSchema = {
  card_id: "OP11-101",
  card_name: 'Capone"Gang"Bege',
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "replacement_protect_supernovas",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Supernovas"],
          exclude_name: 'Capone"Gang"Bege',
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: { type: "SELF" },
          params: { face: "DOWN", position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP11-102 Camie (Character) ───────────────────────────────────────────────
// [Your Turn] [Once Per Turn] This effect can be activated when your opponent
// activates an Event or [Trigger]. If your opponent has 2 or more Life cards,
// trash 1 card from the top of each of your and your opponent's Life cards.

export const OP11_102_CAMIE: EffectSchema = {
  card_id: "OP11-102",
  card_name: "Camie",
  card_type: "Character",
  effects: [
    {
      id: "event_or_trigger_life_trash",
      category: "auto",
      trigger: {
        any_of: [
          {
            event: "EVENT_ACTIVATED",
            filter: { controller: "OPPONENT" },
            turn_restriction: "YOUR_TURN",
          },
          {
            event: "TRIGGER_ACTIVATED",
            filter: { controller: "OPPONENT" },
            turn_restriction: "YOUR_TURN",
          },
        ],
      },
      flags: { once_per_turn: true },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 2,
      },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP", controller: "OPPONENT" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP11-103 Long-Jaw Neptunian (Character) ─────────────────────────────────
// [Activate: Main] If your Leader is [Shirahoshi], you may rest this Character
// and turn 1 card from the top of your Life cards face-down: K.O. up to 1 of
// your opponent's Characters with a cost of 3 or less.

export const OP11_103_LONG_JAW_NEPTUNIAN: EffectSchema = {
  card_id: "OP11-103",
  card_name: "Long-Jaw Neptunian",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      actions: [
        {
          type: "TURN_LIFE_FACE_DOWN",
          params: { amount: 1 },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP11-104 Shirley (Character) ─────────────────────────────────────────────
// [Blocker]
// [On Play] You may turn 1 card from the top of your Life cards face-down: Look
// at 3 cards from the top of your deck; reveal up to 1 {Fish-Man Island} type
// card and add it to your hand. Then, place the rest at the top or bottom of
// the deck in any order.

export const OP11_104_SHIRLEY: EffectSchema = {
  card_id: "OP11-104",
  card_name: "Shirley",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      actions: [
        {
          type: "TURN_LIFE_FACE_DOWN",
          params: { amount: 1 },
        },
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Fish-Man Island"] },
            rest_destination: "TOP_OR_BOTTOM",
          },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP11-106 Zeus (Character) ────────────────────────────────────────────────
// [On Play] You may add 1 card from the top or bottom of your Life cards to
// your hand: K.O. up to 1 of your opponent's Characters with a cost of 5 or
// less.

export const OP11_106_ZEUS: EffectSchema = {
  card_id: "OP11-106",
  card_name: "Zeus",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_for_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-107 Topknot Neptunian (Character) ───────────────────────────────────
// [Blocker]
// [Activate: Main] [Once Per Turn] If your Leader is [Shirahoshi], you may turn
// 1 card from the top of your Life cards face-down: Set this Character as active
// at the end of this turn.

export const OP11_107_TOPKNOT_NEPTUNIAN: EffectSchema = {
  card_id: "OP11-107",
  card_name: "Topknot Neptunian",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "activate_set_active_at_eot",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      actions: [
        {
          type: "TURN_LIFE_FACE_DOWN",
          params: { amount: 1 },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_ACTIVE",
              target: { type: "SELF" },
            },
          },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP11-108 Neptune (Character) ─────────────────────────────────────────────
// [On Play] If your Leader is [Shirahoshi], you may turn 1 card from the top of
// your Life cards face-down: Draw 2 cards and trash 1 card from your hand.

export const OP11_108_NEPTUNE: EffectSchema = {
  card_id: "OP11-108",
  card_name: "Neptune",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      flags: { optional: true },
      actions: [
        {
          type: "TURN_LIFE_FACE_DOWN",
          params: { amount: 1 },
        },
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "IF_DO",
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP11-109 Pappag (Character) ──────────────────────────────────────────────
// [On Play] If you have [Camie], draw 2 cards and trash 2 cards from your hand.

export const OP11_109_PAPPAG: EffectSchema = {
  card_id: "OP11-109",
  card_name: "Pappag",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Camie" },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP11-110 Fukaboshi (Character) ───────────────────────────────────────────
// If this Character would be K.O.'d, you may rest 1 of your [Fish-Man Island]
// or your [Shirahoshi] Leader instead.
// [On Play] You may add 1 card from the top or bottom of your Life cards to
// your hand: K.O. up to 1 of your opponent's Characters with a cost of 1 or
// less.

export const OP11_110_FUKABOSHI: EffectSchema = {
  card_id: "OP11-110",
  card_name: "Fukaboshi",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement",
      category: "replacement",
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_KO",
        cause_filter: { by: "ANY" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: {
              any_of: [
                { name: "Fish-Man Island", card_type: "STAGE" },
                { name: "Shirahoshi", card_type: "LEADER" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "on_play_life_for_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP11-112 Megalo (Character) ──────────────────────────────────────────────
// [Blocker]
// [Opponent's Turn] If your Leader is [Shirahoshi], this Character gains +4000
// power.

export const OP11_112_MEGALO: EffectSchema = {
  card_id: "OP11-112",
  card_name: "Megalo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "opponent_turn_power_boost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      duration: { type: "WHILE_CONDITION", condition: { type: "SELF_STATE", required_state: "ACTIVE" } },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 4000 },
        },
      ],
    },
  ],
};

// ─── OP11-114 Gum-Gum Fire-Fist Pistol Red Hawk (Event) ─────────────────────
// [Main] You may rest 3 of your DON!! cards: If you and your opponent have a
// total of 5 or more Life cards, K.O. up to 1 of your opponent's Characters
// with a base cost of 5 or less.
// [Counter] Up to 1 of your Leader gains +3000 power during this battle.

export const OP11_114_GUM_GUM_FIRE_FIST_PISTOL_RED_HAWK: EffectSchema = {
  card_id: "OP11-114",
  card_name: "Gum-Gum Fire-Fist Pistol Red Hawk",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "REST_DON", amount: 3 }],
      conditions: {
        type: "COMBINED_TOTAL",
        metric: "LIFE_COUNT",
        operator: ">=",
        value: 5,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 5 },
          },
        },
      ],
    },
    {
      id: "counter_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP11-115 You're Just Not My Type! (Event) ───────────────────────────────
// [Counter] If your Leader is [Shirahoshi], up to 1 of your Leader or Character
// cards gains +4000 power during this battle.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 2 or less.

export const OP11_115_YOURE_JUST_NOT_MY_TYPE: EffectSchema = {
  card_id: "OP11-115",
  card_name: "You're Just Not My Type!",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
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
      ],
    },
    {
      id: "trigger_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
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

// ─── OP11-116 Merman Combat Ultramarine (Event) ──────────────────────────────
// [Main] Add up to 1 Character with a cost of 6 or less to the top or bottom
// of the owner's Life cards face-up.
// [Trigger] Add up to 1 of your opponent's Characters with a cost of 4 or less
// to the top or bottom of the owner's Life cards face-up.

export const OP11_116_MERMAN_COMBAT_ULTRAMARINE: EffectSchema = {
  card_id: "OP11-116",
  card_name: "Merman Combat Ultramarine",
  card_type: "Event",
  effects: [
    {
      id: "main_add_to_life",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          params: { face: "UP", position: "TOP_OR_BOTTOM" },
        },
      ],
    },
    {
      id: "trigger_add_to_life",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { face: "UP", position: "TOP_OR_BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP11-117 Fish-Man Island (Stage) ─────────────────────────────────────────
// [Activate: Main] [Once Per Turn] If your Leader is [Shirahoshi], you may turn
// 1 card from the top of your Life cards face-up: Up to 1 of your {Neptunian},
// {Fish-Man}, or {Merfolk} type Characters gains +1000 power during this turn.

export const OP11_117_FISH_MAN_ISLAND: EffectSchema = {
  card_id: "OP11-117",
  card_name: "Fish-Man Island",
  card_type: "Stage",
  effects: [
    {
      id: "activate_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_any_of: ["Neptunian", "Fish-Man", "Merfolk"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP11-118 Monkey.D.Luffy (Character) ──────────────────────────────────────
// [Rush]
// [When Attacking] You may trash 1 card from your hand: Return up to 1
// Character with a cost of 4 or less to the owner's hand. Then, give up to 1
// rested DON!! card to your Leader or 1 of your Characters.

export const OP11_118_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP11-118",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "when_attacking_bounce_and_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP11-119 Koby (Character) ────────────────────────────────────────────────
// [On Play] Up to 1 of your Characters can also attack active Characters during
// this turn.
// [When Attacking] You may place 2 cards from your trash at the bottom of your
// deck in any order: Up to 1 of your Leader or Character cards gains +1000
// power until the end of your opponent's next turn.

export const OP11_119_KOBY: EffectSchema = {
  card_id: "OP11-119",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_attack_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "when_attacking_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP11_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP11-001": OP11_001_KOBY,
  "OP11-002": OP11_002_AIN,
  "OP11-004": OP11_004_KUJYAKU,
  "OP11-005": OP11_005_SMOKER,
  "OP11-006": OP11_006_ZEPHYR,
  "OP11-007": OP11_007_TASHIGI,
  "OP11-008": OP11_008_DOLL,
  "OP11-009": OP11_009_NICO_ROBIN,
  "OP11-010": OP11_010_HIBARI,
  "OP11-012": OP11_012_FRANKY,
  "OP11-013": OP11_013_PRINCE_GRUS,
  "OP11-014": OP11_014_BORSALINO,
  "OP11-016": OP11_016_RORONOA_ZORO,
  "OP11-018": OP11_018_HONESTY_IMPACT,
  "OP11-019": OP11_019_GLORP_WEB,
  "OP11-020": OP11_020_X_CALIBUR,
  // Green
  "OP11-021": OP11_021_JINBE,
  "OP11-022": OP11_022_SHIRAHOSHI,
  "OP11-023": OP11_023_ARLONG,
  "OP11-024": OP11_024_ALADINE,
  "OP11-025": OP11_025_ISHILLY,
  "OP11-027": OP11_027_BULGE_EYED_NEPTUNIAN,
  "OP11-028": OP11_028_LORD_OF_THE_COAST,
  "OP11-029": OP11_029_CHARLOTTE_PRALINE,
  "OP11-030": OP11_030_SHIRAHOSHI,
  "OP11-031": OP11_031_JINBE,
  "OP11-034": OP11_034_HATCHAN,
  "OP11-035": OP11_035_FISHER_TIGER,
  "OP11-036": OP11_036_SPOTTED_NEPTUNIAN,
  "OP11-037": OP11_037_ANCIENT_WEAPON_POSEIDON,
  "OP11-038": OP11_038_GUM_GUM_ELEPHANT_GATLING,
  "OP11-039": OP11_039_VAGABOND_DRILL,
  // Blue
  "OP11-040": OP11_040_MONKEY_D_LUFFY,
  "OP11-041": OP11_041_NAMI,
  "OP11-042": OP11_042_VITO,
  "OP11-043": OP11_043_VINSMOKE_ICHIJI,
  "OP11-044": OP11_044_VINSMOKE_JUDGE,
  "OP11-046": OP11_046_VINSMOKE_YONJI,
  "OP11-047": OP11_047_VINSMOKE_REIJU,
  "OP11-048": OP11_048_CAPONE_GANG_BEGE,
  "OP11-049": OP11_049_CARROT,
  "OP11-050": OP11_050_GOTTI,
  "OP11-051": OP11_051_SANJI,
  "OP11-054": OP11_054_NAMI,
  "OP11-056": OP11_056_BROOK,
  "OP11-057": OP11_057_PEDRO,
  "OP11-058": OP11_058_MONKEY_D_LUFFY,
  "OP11-059": OP11_059_GUM_GUM_KING_COBRA,
  "OP11-060": OP11_060_LETS_CRASH_THIS_WEDDING,
  "OP11-061": OP11_061_GUM_GUM_JET_CULVERIN,
  // Purple
  "OP11-062": OP11_062_CHARLOTTE_KATAKURI,
  "OP11-063": OP11_063_LITTLE_SADI,
  "OP11-065": OP11_065_CHARLOTTE_ANANA,
  "OP11-067": OP11_067_CHARLOTTE_KATAKURI,
  "OP11-069": OP11_069_CHARLOTTE_BRULEE,
  "OP11-070": OP11_070_CHARLOTTE_PUDDING,
  "OP11-072": OP11_072_CHARLOTTE_MONT_DOR,
  "OP11-075": OP11_075_JAGUAR_D_SAUL,
  "OP11-076": OP11_076_HANNYABAL,
  "OP11-077": OP11_077_RANDOLPH,
  "OP11-080": OP11_080_GEAR_TWO,
  // Black
  "OP11-082": OP11_082_ARAMAKI,
  "OP11-083": OP11_083_CARIBOU,
  "OP11-084": OP11_084_KUZAN,
  "OP11-085": OP11_085_KUROZUMI_OROCHI,
  "OP11-086": OP11_086_CORIBOU,
  "OP11-088": OP11_088_SHU,
  "OP11-090": OP11_090_BRISCOLA,
  "OP11-091": OP11_091_BERRY_GOOD,
  "OP11-092": OP11_092_HELMEPPO,
  "OP11-095": OP11_095_MONKEY_D_GARP,
  "OP11-096": OP11_096_RIPPER,
  "OP11-097": OP11_097_AFTER_ALL_THESE_YEARS,
  "OP11-098": OP11_098_BLUE_HOLE,
  "OP11-099": OP11_099_IM_GONNA_BE_A_NAVY_OFFICER,
  // Yellow
  "OP11-100": OP11_100_OTOHIME,
  "OP11-101": OP11_101_CAPONE_GANG_BEGE,
  "OP11-102": OP11_102_CAMIE,
  "OP11-103": OP11_103_LONG_JAW_NEPTUNIAN,
  "OP11-104": OP11_104_SHIRLEY,
  "OP11-106": OP11_106_ZEUS,
  "OP11-107": OP11_107_TOPKNOT_NEPTUNIAN,
  "OP11-108": OP11_108_NEPTUNE,
  "OP11-109": OP11_109_PAPPAG,
  "OP11-110": OP11_110_FUKABOSHI,
  "OP11-112": OP11_112_MEGALO,
  "OP11-114": OP11_114_GUM_GUM_FIRE_FIST_PISTOL_RED_HAWK,
  "OP11-115": OP11_115_YOURE_JUST_NOT_MY_TYPE,
  "OP11-116": OP11_116_MERMAN_COMBAT_ULTRAMARINE,
  "OP11-117": OP11_117_FISH_MAN_ISLAND,
  "OP11-118": OP11_118_MONKEY_D_LUFFY,
  "OP11-119": OP11_119_KOBY,
};
