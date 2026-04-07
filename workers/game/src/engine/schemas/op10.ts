/**
 * OP10 Effect Schemas
 *
 * Red (Smoker / Punk Hazard): OP10-001 to OP10-021
 * Green (Trafalgar Law / ODYSSEY / Navy): OP10-022 to OP10-041
 * Blue (Usopp / Dressrosa): OP10-042 to OP10-061
 * Purple (Donquixote Pirates / GERMA): OP10-062 to OP10-080
 * Black (Dressrosa / Blackbeard Pirates / Thriller Bark): OP10-081 to OP10-098
 * Yellow (Supernovas / Revolutionary Army): OP10-099 to OP10-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Smoker / Punk Hazard (OP10-001 to OP10-021)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP10-001 Smoker (Leader) ─────────────────────────────────────────────────
// [Opponent's Turn] All of your {Navy} or {Punk Hazard} type Characters gain
// +1000 power.
// [Activate: Main] [Once Per Turn] If you have a Character with 7000 power or
// more, set up to 2 of your DON!! cards as active.

export const OP10_001_SMOKER: EffectSchema = {
  card_id: "OP10-001",
  card_name: "Smoker",
  card_type: "Leader",
  effects: [
    {
      id: "opponent_turn_power_buff",
      category: "permanent",
      duration: { type: "WHILE_CONDITION", condition: { type: "TURN_COUNT", controller: "OPPONENT", operator: ">=", value: 0 } },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits_any_of: ["Navy", "Punk Hazard"] },
          },
          params: { amount: 1000 },
        },
      ],
      flags: { keywords: [] },
      zone: "FIELD",
    },
    {
      id: "activate_set_don_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { power_min: 7000, card_type: "CHARACTER" },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP10-002 Caesar Clown (Character) ────────────────────────────────────────
// [DON!! x2] [When Attacking] You may return 1 of your {Punk Hazard} type
// Characters with a cost of 2 or more to the owner's hand: K.O. up to 1 of
// your opponent's Characters with 4000 power or less.

export const OP10_002_CAESAR_CLOWN: EffectSchema = {
  card_id: "OP10-002",
  card_name: "Caesar Clown",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          filter: { traits: ["Punk Hazard"], cost_min: 2 },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 4000 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-003 Sugar (Character) ───────────────────────────────────────────────
// [End of Your Turn] If you have a {Donquixote Pirates} type Character with
// 6000 power or more, set up to 1 of your DON!! cards as active.
// [Opponent's Turn] [Once Per Turn] When you activate an Event, add up to 1
// DON!! card from your DON!! deck and set it as active.

export const OP10_003_SUGAR: EffectSchema = {
  card_id: "OP10-003",
  card_name: "Sugar",
  card_type: "Character",
  effects: [
    {
      id: "eot_set_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["Donquixote Pirates"], power_min: 6000, card_type: "CHARACTER" },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "opponent_turn_event_add_don",
      category: "auto",
      trigger: {
        event: "EVENT_ACTIVATED",
        filter: { controller: "SELF" },
        turn_restriction: "OPPONENT_TURN",
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP10-004 Vergo (Character) ───────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Punk Hazard} type card other than [Vergo] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.

export const OP10_004_VERGO: EffectSchema = {
  card_id: "OP10-004",
  card_name: "Vergo",
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
            filter: { traits: ["Punk Hazard"], exclude_name: "Vergo" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-005 Sanji (Character) ───────────────────────────────────────────────
// [Your Turn] This Character gains +3000 power.
// [On K.O.] Draw 1 card.

export const OP10_005_SANJI: EffectSchema = {
  card_id: "OP10-005",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_power_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
      zone: "FIELD",
      duration: { type: "WHILE_CONDITION", condition: { type: "TURN_COUNT", controller: "SELF", operator: ">=", value: 0 } },
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP10-006 Caesar Clown (Character) ────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Smiley]
// and add it to your hand. Then, place the rest at the bottom of your deck in
// any order and play up to 1 [Smiley] from your hand.

export const OP10_006_CAESAR_CLOWN: EffectSchema = {
  card_id: "OP10-006",
  card_name: "Caesar Clown",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_play_smiley",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { name: "Smiley" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Smiley" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-007 Ceaser Soldier (Character) ──────────────────────────────────────
// [On Play] Play up to 1 {Punk Hazard} type Character card with a cost of 2 or
// less from your hand.

export const OP10_007_CEASER_SOLDIER: EffectSchema = {
  card_id: "OP10-007",
  card_name: "Ceaser Soldier",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Punk Hazard"], cost_max: 2 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP10-008 Scotch (Character) ──────────────────────────────────────────────
// [Blocker]
// [On Play] If you don't have [Rock], play up to 1 [Rock] from your hand.

export const OP10_008_SCOTCH: EffectSchema = {
  card_id: "OP10-008",
  card_name: "Scotch",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_play_rock",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { name: "Rock" },
          count: { operator: ">=", value: 1 },
        },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Rock" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP10-009 Smiley (Character) ──────────────────────────────────────────────
// [On Play] If your Leader has the {Punk Hazard} type, give up to 1 of your
// opponent's Characters −3000 power during this turn.

export const OP10_009_SMILEY: EffectSchema = {
  card_id: "OP10-009",
  card_name: "Smiley",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Punk Hazard" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-010 Chadros.Higelyges (Brownbeard) (Character) ─────────────────────
// [When Attacking] If you have 1 or less Characters with 6000 power or more,
// this Character gains +1000 power during this turn.

export const OP10_010_CHADROS_HIGELYGES: EffectSchema = {
  card_id: "OP10-010",
  card_name: "Chadros.Higelyges (Brownbeard)",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_conditional_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { power_min: 6000, card_type: "CHARACTER" },
        count: { operator: "<=", value: 1 },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-011 Tony Tony.Chopper (Character) ───────────────────────────────────
// [Blocker]
// [Opponent's Turn] This Character gains +2000 power.

export const OP10_011_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP10-011",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "opponent_turn_power_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "TURN_COUNT", controller: "OPPONENT", operator: ">=", value: 0 } },
    },
  ],
};

// ─── OP10-012 Dragon Number Thirteen (Character) ──────────────────────────────
// [Blocker]

export const OP10_012_DRAGON_NUMBER_THIRTEEN: EffectSchema = {
  card_id: "OP10-012",
  card_name: "Dragon Number Thirteen",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP10-015 Mocha (Character) ───────────────────────────────────────────────
// [On Play] Give up to 1 of your opponent's Characters −1000 power during
// this turn.

export const OP10_015_MOCHA: EffectSchema = {
  card_id: "OP10-015",
  card_name: "Mocha",
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
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-016 Monet (Character) ───────────────────────────────────────────────
// [Activate: Main] You may rest this Character: Give up to 2 rested DON!! cards
// to your Leader or 1 of your Characters. Then, give up to 1 of your opponent's
// Characters −1000 power during this turn.

export const OP10_016_MONET: EffectSchema = {
  card_id: "OP10-016",
  card_name: "Monet",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don_and_debuff",
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
          },
          params: { amount: 2, don_state: "RESTED" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-017 Rock (Character) ────────────────────────────────────────────────
// [On Play] If you don't have [Scotch], play up to 1 [Scotch] from your hand.

export const OP10_017_ROCK: EffectSchema = {
  card_id: "OP10-017",
  card_name: "Rock",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_scotch",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { name: "Scotch" },
          count: { operator: ">=", value: 1 },
        },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Scotch" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP10-018 Ten-Layer Igloo (Event) ─────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +3000 power during
// this battle. Then, give up to 1 of your opponent's Leader or Character cards
// −2000 power during this turn.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP10_018_TEN_LAYER_IGLOO: EffectSchema = {
  card_id: "OP10-018",
  card_name: "Ten-Layer Igloo",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_debuff",
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
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
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

// ─── OP10-019 Divine Departure (Event) ────────────────────────────────────────
// [Main] You may rest 5 of your DON!! cards: K.O. up to 1 of your opponent's
// Characters with 8000 power or less.
// [Counter] Up to 1 of your Leader gains +3000 power during this battle.

export const OP10_019_DIVINE_DEPARTURE: EffectSchema = {
  card_id: "OP10-019",
  card_name: "Divine Departure",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 5 }],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 8000 },
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
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "LEADER" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP10-020 Gum-Gum UFO (Event) ────────────────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters −4000 power during this
// turn. Then, if you have 2 or less Life cards, up to 1 of your Leader or
// Character cards gains +1000 power during this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with 3000 power or less.

export const OP10_020_GUM_GUM_UFO: EffectSchema = {
  card_id: "OP10-020",
  card_name: "Gum-Gum UFO",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff_and_buff",
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
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
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
            filter: { power_max: 3000 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-021 Punk Hazard (Stage) ─────────────────────────────────────────────
// [Activate: Main] You may rest this Stage: If your Leader is [Caesar Clown],
// give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const OP10_021_PUNK_HAZARD: EffectSchema = {
  card_id: "OP10-021",
  card_name: "Punk Hazard",
  card_type: "Stage",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Caesar Clown" },
      },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Trafalgar Law / ODYSSEY / Navy (OP10-022 to OP10-041)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP10-022 Trafalgar Law (Leader) ──────────────────────────────────────────
// [DON!! x1] [Activate: Main] [Once Per Turn] If the total cost of your
// Characters is 5 or more, you may return 1 of your Characters to the owner's
// hand: Reveal 1 card from the top of your Life cards. If that card is a
// {Supernovas} type Character card with a cost of 5 or less, you may play
// that card.

export const OP10_022_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP10-022",
  card_name: "Trafalgar Law",
  card_type: "Leader",
  effects: [
    {
      id: "activate_reveal_life_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER" },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        {
          type: "REVEAL",
          target: { type: "LIFE_CARD", controller: "SELF" },
          params: { amount: 1, source: "LIFE_TOP" },
        },
        {
          type: "PLAY_FROM_LIFE",
          params: { position: "TOP" },
          conditions: {
            type: "SOURCE_PROPERTY",
            context: "KO_BY_EFFECT" as never,
            source_filter: {
              traits: ["Supernovas"],
              card_type: "CHARACTER",
              cost_max: 5,
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-023 Issho (Character) ───────────────────────────────────────────────
// [On Play] If your Leader has the {Navy} type, rest up to 2 of your opponent's
// Characters with a cost of 5 or less.

export const OP10_023_ISSHO: EffectSchema = {
  card_id: "OP10-023",
  card_name: "Issho",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_opponents",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-024 Edward.Newgate (Character) ──────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, rest up to 1 of your
// opponent's Characters with a cost of 5 or less. Then, K.O. up to 1 of your
// opponent's rested Characters with a cost of 3 or less.

export const OP10_024_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP10-024",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_and_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
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
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 3 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-025 Enel (Character) ────────────────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, draw 3 cards and trash 2
// cards from your hand.

export const OP10_025_ENEL: EffectSchema = {
  card_id: "OP10-025",
  card_name: "Enel",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        { type: "DRAW", params: { amount: 3 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP10-026 Kin'emon (Character) ────────────────────────────────────────────
// [Activate: Main] You may place this Character and 1 [Kin'emon] with 0 power
// from your trash at the bottom of your deck in any order: Play up to 1
// [Kin'emon] with a cost of 6 from your hand.

export const OP10_026_KINEMON: EffectSchema = {
  card_id: "OP10-026",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    {
      id: "activate_place_and_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "PLACE_OWN_CHARACTER_TO_DECK", position: "BOTTOM" },
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 1,
          filter: { name: "Kin'emon", base_power_exact: 0 },
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Kin'emon", cost_exact: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP10-027 Kin'emon (Character) ────────────────────────────────────────────
// [Activate: Main] You may place this Character and 1 [Kin'emon] with 1000
// power from your trash at the bottom of your deck in any order: Play up to 1
// [Kin'emon] with a cost of 6 from your hand.

export const OP10_027_KINEMON: EffectSchema = {
  card_id: "OP10-027",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    {
      id: "activate_place_and_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "PLACE_OWN_CHARACTER_TO_DECK", position: "BOTTOM" },
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 1,
          filter: { name: "Kin'emon", base_power_exact: 1000 },
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Kin'emon", cost_exact: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP10-028 Kouzuki Momonosuke (Character) ─────────────────────────────────
// [Activate: Main] You may rest 2 of your DON!! cards and trash this Character:
// Look at 5 cards from the top of your deck; reveal up to 2 {The Akazaya Nine}
// type cards and add them to your hand. Then, place the rest at the bottom of
// your deck in any order.

export const OP10_028_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "OP10-028",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 2 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { traits: ["The Akazaya Nine"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-029 Dracule Mihawk (Character) ──────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, set up to 1 of your
// rested {ODYSSEY} type Characters with a cost of 5 or less as active.

export const OP10_029_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP10-029",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["ODYSSEY"], cost_max: 5, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── OP10-030 Smoker (Character) ──────────────────────────────────────────────
// [Banish]
// [Activate: Main] Set up to 1 of your DON!! cards as active. Then, you cannot
// set DON!! cards as active using Character effects during this turn.

export const OP10_030_SMOKER: EffectSchema = {
  card_id: "OP10-030",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
    {
      id: "activate_set_don_active_then_prohibit",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "SELF" },
          params: {
            prohibition_type: "CANNOT_SET_DON_ACTIVE",
            scope: { card_type_filter: "CHARACTER" },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-032 Tashigi (Character) ─────────────────────────────────────────────
// If you have a green Character other than [Tashigi] that would be removed from
// the field by your opponent's effect, you may rest this Character instead.

export const OP10_032_TASHIGI: EffectSchema = {
  card_id: "OP10-032",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "replacement_protect_green_characters",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          color: "GREEN",
          exclude_name: "Tashigi",
          card_type: "CHARACTER",
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP10-033 Nami (Character) ────────────────────────────────────────────────
// [On Play] If you have 2 or more rested {ODYSSEY} type Characters, up to 1 of
// your opponent's rested DON!! cards will not become active in your opponent's
// next Refresh Phase.

export const OP10_033_NAMI: EffectSchema = {
  card_id: "OP10-033",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_refresh_lock",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["ODYSSEY"], card_type: "CHARACTER", is_rested: true },
        count: { operator: ">=", value: 2 },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

// ─── OP10-034 Franky (Character) ──────────────────────────────────────────────
// [Once Per Turn] If this Character would be K.O.'d in battle, you may add 1
// card from the top of your Life cards to your hand instead.

export const OP10_034_FRANKY: EffectSchema = {
  card_id: "OP10-034",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "replacement_ko_protection_battle",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        cause_filter: { by: "ANY" },
      },
      replacement_actions: [
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true, once_per_turn: true },
    },
  ],
};

// ─── OP10-035 Brook (Character) ───────────────────────────────────────────────
// [On K.O.] Rest up to 1 of your opponent's Leader or Character cards with a
// cost of 5 or less.

export const OP10_035_BROOK: EffectSchema = {
  card_id: "OP10-035",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-036 Perona (Character) ──────────────────────────────────────────────
// [Your Turn] [Once Per Turn] If a Character is rested by your effect, set up
// to 1 of your DON!! cards as active.

export const OP10_036_PERONA: EffectSchema = {
  card_id: "OP10-036",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "character_rested_set_don_active",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        filter: { cause: "BY_YOUR_EFFECT" },
        turn_restriction: "YOUR_TURN",
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP10-037 Lim (Character) ─────────────────────────────────────────────────
// [Once Per Turn] If this Character would be removed from the field by your
// opponent's effect, you may rest 1 of your {ODYSSEY} type Characters instead.
// [End of Your Turn] Set up to 1 of your {ODYSSEY} type Characters as active.

export const OP10_037_LIM: EffectSchema = {
  card_id: "OP10-037",
  card_name: "Lim",
  card_type: "Character",
  effects: [
    {
      id: "replacement_self_removal_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { traits: ["ODYSSEY"] },
          },
        },
      ],
      flags: { optional: true, once_per_turn: true },
    },
    {
      id: "eot_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["ODYSSEY"] },
          },
        },
      ],
    },
  ],
};

// ─── OP10-038 Roronoa Zoro (Character) ────────────────────────────────────────
// [Opponent's Turn] If you have 2 or more rested Characters, this Character
// gains +2000 power.

export const OP10_038_RORONOA_ZORO: EffectSchema = {
  card_id: "OP10-038",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_conditional_buff",
      category: "permanent",
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "TURN_COUNT", controller: "OPPONENT", operator: ">=", value: 0 } },
    },
  ],
};

// ─── OP10-039 Gum-Gum Dragon Fire Pistol Twister Star (Event) ────────────────
// [Main] If your Leader has the {ODYSSEY} type, look at 5 cards from the top of
// your deck; reveal up to 2 {ODYSSEY} type Character cards and add them to your
// hand. Then, place the rest at the bottom of your deck in any order.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 5 or less.

export const OP10_039_GUM_GUM_DRAGON_FIRE_PISTOL_TWISTER_STAR: EffectSchema = {
  card_id: "OP10-039",
  card_name: "Gum-Gum Dragon Fire Pistol Twister Star",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "ODYSSEY" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { traits: ["ODYSSEY"], card_type: "CHARACTER" },
            rest_destination: "BOTTOM",
          },
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
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-040 The Weak Do Not Have the Right to Choose How They Die (Event) ───
// [Main]/[Counter] K.O. up to 1 of your opponent's rested Characters with a
// cost of 7 or less.

export const OP10_040_THE_WEAK_DO_NOT_HAVE_THE_RIGHT: EffectSchema = {
  card_id: "OP10-040",
  card_name: "The Weak Do Not Have the Right to Choose How They Die",
  card_type: "Event",
  effects: [
    {
      id: "main_counter_ko",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "MAIN_EVENT" },
          { keyword: "COUNTER_EVENT" },
        ],
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-041 Radio Knife (Event) ─────────────────────────────────────────────
// [Main] Rest up to 1 of your opponent's Characters with a cost of 6 or less.
// Then, K.O. up to 1 of your opponent's rested Characters with a cost of 5 or
// less.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP10_041_RADIO_KNIFE: EffectSchema = {
  card_id: "OP10-041",
  card_name: "Radio Knife",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_and_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 5 },
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
// BLUE — Usopp / Dressrosa (OP10-042 to OP10-061)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP10-042 Usopp (Leader) ──────────────────────────────────────────────────
// All of your {Dressrosa} type Characters with a cost of 2 or more gain +1 cost.
// [Opponent's Turn] [Once Per Turn] This effect can be activated when your
// {Dressrosa} type Character is removed from the field by your opponent's effect
// or K.O.'d. If you have 5 or less cards in your hand, draw 1 card.

export const OP10_042_USOPP: EffectSchema = {
  card_id: "OP10-042",
  card_name: "Usopp",
  card_type: "Leader",
  effects: [
    {
      id: "permanent_cost_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits: ["Dressrosa"], cost_min: 2 },
          },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "opponent_turn_character_removed_draw",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        filter: {
          controller: "SELF",
          target_filter: { traits: ["Dressrosa"] },
          cause: "ANY",
        },
        turn_restriction: "OPPONENT_TURN",
      },
      flags: { once_per_turn: true },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP10-043 Moocy (Character) ───────────────────────────────────────────────
// [On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards: Up
// to 1 of your [Monkey.D.Luffy] Characters gains [Banish] during this turn.

export const OP10_043_MOOCY: EffectSchema = {
  card_id: "OP10-043",
  card_name: "Moocy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_banish",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-044 Cub (Character) ─────────────────────────────────────────────────
// [On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards:
// Return up to 1 of your opponent's Characters with a cost of 1 or less to the
// owner's hand.

export const OP10_044_CUB: EffectSchema = {
  card_id: "OP10-044",
  card_name: "Cub",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP10-045 Cavendish (Character) ───────────────────────────────────────────
// [When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.

export const OP10_045_CAVENDISH: EffectSchema = {
  card_id: "OP10-045",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { once_per_turn: true },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP10-046 Kyros (Character) ───────────────────────────────────────────────
// [On Play] Return up to 1 Character with a cost of 5 or less to the owner's
// hand.

export const OP10_046_KYROS: EffectSchema = {
  card_id: "OP10-046",
  card_name: "Kyros",
  card_type: "Character",
  effects: [
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
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-047 Koala (Character) ───────────────────────────────────────────────
// [When Attacking] You may return 1 of your {Revolutionary Army} type
// Characters with a cost of 3 or more to the owner's hand: This Character
// gains +3000 power during this turn.

export const OP10_047_KOALA: EffectSchema = {
  card_id: "OP10-047",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce_for_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          filter: { traits: ["Revolutionary Army"], cost_min: 3 },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-048 Sai (Character) ─────────────────────────────────────────────────
// [On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards:
// Return up to 1 of your opponent's Characters with a cost of 1 or less to the
// owner's hand.

export const OP10_048_SAI: EffectSchema = {
  card_id: "OP10-048",
  card_name: "Sai",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP10-049 Sabo (Character) ────────────────────────────────────────────────
// If your Character with a base cost of 7 or less other than [Sabo] would be
// removed from the field by your opponent's effect, you may return this
// Character to the owner's hand instead.

export const OP10_049_SABO: EffectSchema = {
  card_id: "OP10-049",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "replacement_protect_characters",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          base_cost_max: 7,
          exclude_name: "Sabo",
          card_type: "CHARACTER",
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP10-051 Hack (Character) ────────────────────────────────────────────────
// [DON!! x1] [When Attacking] Look at 3 cards from the top of your deck; reveal
// up to 1 {Revolutionary Army} type Character card and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP10_051_HACK: EffectSchema = {
  card_id: "OP10-051",
  card_name: "Hack",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_search",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"], card_type: "CHARACTER" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-052 Bartolomeo (Character) ──────────────────────────────────────────
// [Blocker]
// [On Play] Place up to 1 Character with a cost of 1 or less at the bottom of
// the owner's deck.

export const OP10_052_BARTOLOMEO: EffectSchema = {
  card_id: "OP10-052",
  card_name: "Bartolomeo",
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
            filter: { cost_max: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP10-053 Bian (Character) ────────────────────────────────────────────────
// If you have a {The Tontattas} type Character other than [Bian], this
// Character gains [Blocker].

export const OP10_053_BIAN: EffectSchema = {
  card_id: "OP10-053",
  card_name: "Bian",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["The Tontattas"], card_type: "CHARACTER", exclude_name: "Bian" },
        count: { operator: ">=", value: 1 },
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

// ─── OP10-055 Marco (Character) ───────────────────────────────────────────────
// [Blocker]
// [On K.O.] Return up to 1 of your opponent's Characters with a cost of 4 or
// less to the owner's hand.

export const OP10_055_MARCO: EffectSchema = {
  card_id: "OP10-055",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_bounce",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP10-056 Mansherry (Character) ───────────────────────────────────────────
// [On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards, and
// return 1 of your {Dressrosa} type Characters with a cost of 4 or more to the
// owner's hand: Return up to 1 of your opponent's Characters with a cost of 4
// or less to the owner's hand.

export const OP10_056_MANSHERRY: EffectSchema = {
  card_id: "OP10-056",
  card_name: "Mansherry",
  card_type: "Character",
  effects: [
    {
      id: "on_play_double_cost_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          filter: { traits: ["Dressrosa"], cost_min: 4 },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP10-057 Leo (Character) ─────────────────────────────────────────────────
// [On Play] You may rest your Leader or 1 of your Stage cards: If your Leader
// is [Usopp], look at 5 cards from the top of your deck; reveal up to 2
// {Dressrosa} type cards other than [Leo] and add them to your hand. Then,
// place the rest at the bottom of your deck in any order, and trash 1 card
// from your hand.

export const OP10_057_LEO: EffectSchema = {
  card_id: "OP10-057",
  card_name: "Leo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Usopp" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { traits: ["Dressrosa"], exclude_name: "Leo" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-058 Rebecca (Character) ─────────────────────────────────────────────
// [On Play] If there is a Character with a cost of 8 or more, draw 1 card.
// Then, reveal up to 2 {Dressrosa} type Character cards with a cost of 7 or
// less other than [Rebecca] from your hand. Play 1 of the revealed cards and
// play the other card rested if it has a cost of 4 or less.

export const OP10_058_REBECCA: EffectSchema = {
  card_id: "OP10-058",
  card_name: "Rebecca",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_multi_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", cost_min: 8 },
            count: { operator: ">=", value: 1 },
          },
        },
        {
          type: "REVEAL",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 2 },
            filter: {
              traits: ["Dressrosa"],
              card_type: "CHARACTER",
              cost_max: 7,
              exclude_name: "Rebecca",
            },
          },
          result_ref: "revealed_cards",
          chain: "THEN",
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "SELECTED_CARDS",
            count: { exact: 1 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          target_ref: "revealed_cards",
          chain: "THEN",
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "SELECTED_CARDS",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
          target_ref: "revealed_cards",
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP10-059 Fo...llow...Me...and...I...Will...Gui...de...You (Event) ───────
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 {Dressrosa}
// type Character card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const OP10_059_FOLLOW_ME_AND_I_WILL_GUIDE_YOU: EffectSchema = {
  card_id: "OP10-059",
  card_name: "Fo...llow...Me...and...I...Will...Gui...de...You",
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
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Dressrosa"], card_type: "CHARACTER" },
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
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP10-060 Barrier-Barrier Pistol (Event) ──────────────────────────────────
// [Main] Place up to 1 of your opponent's Characters with 6000 power or less at
// the bottom of the owner's deck.
// [Trigger] Activate this card's [Main] effect.

export const OP10_060_BARRIER_BARRIER_PISTOL: EffectSchema = {
  card_id: "OP10-060",
  card_name: "Barrier-Barrier Pistol",
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
            filter: { power_max: 6000 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP10-061 Special Long-Range Attack!! Bagworm (Event) ─────────────────────
// [Main] Draw 1 card. Then, return up to 1 of your opponent's Characters with a
// cost of 2 or less to the owner's hand.
// [Trigger] Return up to 1 Character with a cost of 2 or less to the owner's
// hand.

export const OP10_061_SPECIAL_LONG_RANGE_ATTACK_BAGWORM: EffectSchema = {
  card_id: "OP10-061",
  card_name: "Special Long-Range Attack!! Bagworm",
  card_type: "Event",
  effects: [
    {
      id: "main_draw_and_bounce",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
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

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Donquixote Pirates / GERMA (OP10-062 to OP10-080)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP10-062 Violet (Character) ──────────────────────────────────────────────
// [Blocker]
// [On K.O.] DON!! −1: If your Leader has the {Donquixote Pirates} type, add up
// to 1 purple Event from your trash to your hand.

export const OP10_062_VIOLET: EffectSchema = {
  card_id: "OP10-062",
  card_name: "Violet",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_reclaim_event",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "PURPLE", card_type: "EVENT" },
          },
        },
      ],
    },
  ],
};

// ─── OP10-063 Vinsmoke Sanji (Character) ──────────────────────────────────────
// [On Play] If your Leader's type includes "GERMA", look at 5 cards from the
// top of your deck; reveal up to 1 card with a type including "GERMA" and add
// it to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP10_063_VINSMOKE_SANJI: EffectSchema = {
  card_id: "OP10-063",
  card_name: "Vinsmoke Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "GERMA" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_contains: ["GERMA"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-064 Clone Soldier (Character) ───────────────────────────────────────
// [Blocker]

export const OP10_064_CLONE_SOLDIER: EffectSchema = {
  card_id: "OP10-064",
  card_name: "Clone Soldier",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP10-065 Sugar (Character) ───────────────────────────────────────────────
// [Activate: Main] You may rest 1 of your DON!! cards and this Character: Look
// at 5 cards from the top of your deck; reveal up to 1 {Donquixote Pirates}
// type card and add it to your hand. Then, place the rest at the bottom of your
// deck in any order.

export const OP10_065_SUGAR: EffectSchema = {
  card_id: "OP10-065",
  card_name: "Sugar",
  card_type: "Character",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Donquixote Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-066 Giolla (Character) ──────────────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] You may rest 2 of your DON!!
// cards: Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP10_066_GIOLLA: EffectSchema = {
  card_id: "OP10-066",
  card_name: "Giolla",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_rest",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 2 }],
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

// ─── OP10-067 Senor Pink (Character) ──────────────────────────────────────────
// [On Play] DON!! −1: Add up to 1 purple Event with a cost of 5 or less from
// your trash to your hand. Then, set up to 1 of your DON!! cards as active.

export const OP10_067_SENOR_PINK: EffectSchema = {
  card_id: "OP10-067",
  card_name: "Senor Pink",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reclaim_event_and_set_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "PURPLE", card_type: "EVENT", cost_max: 5 },
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

// ─── OP10-069 Fighting Fish (Character) ───────────────────────────────────────
// [DON!! x1] [When Attacking] DON!! −1: K.O. up to 1 of your opponent's
// Characters with a cost of 1 or less.

export const OP10_069_FIGHTING_FISH: EffectSchema = {
  card_id: "OP10-069",
  card_name: "Fighting Fish",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP10-070 Trebol (Character) ──────────────────────────────────────────────
// [Blocker]
// [On Play] All of your Characters with 1000 base power or less cannot be
// K.O.'d by your opponent's effects until the end of your opponent's next turn.

export const OP10_070_TREBOL: EffectSchema = {
  card_id: "OP10-070",
  card_name: "Trebol",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_ko_protection",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { base_power_max: 1000 },
          },
          params: {
            prohibition_type: "CANNOT_BE_KO",
            scope: { cause: "BY_OPPONENT_EFFECT" },
          },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-071 Donquixote Doflamingo (Character) ──────────────────────────────
// [On Play] DON!! −1: Play up to 1 {Donquixote Pirates} type Character card
// with a cost of 5 or less from your hand.
// [On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!!
// cards: Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP10_071_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP10-071",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Donquixote Pirates"], cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "on_opponent_attack_add_don",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP10-072 Donquixote Rosinante (Character) ───────────────────────────────
// [On Play] You may trash 1 Event from your hand: Draw 2 cards.
// [End of Your Turn] If you have 7 or more DON!! cards on your field, set up to
// 2 of your DON!! cards as active.

export const OP10_072_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP10-072",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_event_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "EVENT" } }],
      flags: { optional: true },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
    {
      id: "eot_set_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP10-074 Pica (Character) ────────────────────────────────────────────────
// [Once Per Turn] If this Character would be K.O.'d by your opponent's effect,
// you may rest 2 of your active DON!! cards instead.

export const OP10_074_PICA: EffectSchema = {
  card_id: "OP10-074",
  card_name: "Pica",
  card_type: "Character",
  effects: [
    {
      id: "replacement_ko_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "REST_DON",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { exact: 2 },
            filter: { is_active: true },
          },
        },
      ],
      flags: { optional: true, once_per_turn: true },
    },
  ],
};

// ─── OP10-075 Foxy (Character) ────────────────────────────────────────────────
// [Activate: Main] You may trash this Character: If the number of DON!! cards
// on your field is equal to or less than the number on your opponent's field,
// draw 1 card.

export const OP10_075_FOXY: EffectSchema = {
  card_id: "OP10-075",
  card_name: "Foxy",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP10-076 Baby 5 (Character) ──────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: If your Leader has the
// {Donquixote Pirates} type, add up to 1 DON!! card from your DON!! deck and
// set it as active.

export const OP10_076_BABY_5: EffectSchema = {
  card_id: "OP10-076",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_for_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
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

// ─── OP10-077 Bellamy (Character) ─────────────────────────────────────────────
// [Blocker]
// [On Block] You may rest 2 of your DON!! cards: Add up to 1 DON!! card from
// your DON!! deck and set it as active.

export const OP10_077_BELLAMY: EffectSchema = {
  card_id: "OP10-077",
  card_name: "Bellamy",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_add_don",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
      costs: [{ type: "REST_DON", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP10-078 I Do Not Forgive Those Who Laugh at My Family!!! (Event) ────────
// [Main]/[Counter] Look at 3 cards from the top of your deck; reveal up to 1
// {Donquixote Pirates} type card other than [I Do Not Forgive Those Who Laugh
// at My Family!!!] and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.

export const OP10_078_I_DO_NOT_FORGIVE: EffectSchema = {
  card_id: "OP10-078",
  card_name: "I Do Not Forgive Those Who Laugh at My Family!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_counter_search",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "MAIN_EVENT" },
          { keyword: "COUNTER_EVENT" },
        ],
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Donquixote Pirates"],
              exclude_name: "I Do Not Forgive Those Who Laugh at My Family!!!",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-079 God Thread (Event) ──────────────────────────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with a cost 5 or less.
// Then, add up to 1 DON!! card from your DON!! deck and set it as active.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP10_079_GOD_THREAD: EffectSchema = {
  card_id: "OP10-079",
  card_name: "God Thread",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_and_add_don",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP10-080 Little Black Bears (Event) ──────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, if you have 7 or more DON!! cards on your field and 5 or
// less cards in your hand, draw 1 card.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP10_080_LITTLE_BLACK_BEARS: EffectSchema = {
  card_id: "OP10-080",
  card_name: "Little Black Bears",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_draw",
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            all_of: [
              { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 7 },
              { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 5 },
            ],
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Dressrosa / Blackbeard Pirates / Thriller Bark (OP10-081 to OP10-098)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP10-081 Usopp (Character) ───────────────────────────────────────────────
// [On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards: K.O.
// up to 1 of your opponent's Characters with a cost of 2 or less. Then, trash 2
// cards from the top of your deck.

export const OP10_081_USOPP: EffectSchema = {
  card_id: "OP10-081",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_and_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
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
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-082 Kuzan (Character) ───────────────────────────────────────────────
// This Character cannot be removed from the field by your opponent's effects.
// [Activate: Main] You may trash this Character: Draw 1 card. Then, play up to
// 1 {Blackbeard Pirates} type Character card with a cost of 5 or less other
// than [Kuzan] from your trash.

export const OP10_082_KUZAN: EffectSchema = {
  card_id: "OP10-082",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "removal_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
    {
      id: "activate_trash_draw_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Blackbeard Pirates"],
              cost_max: 5,
              exclude_name: "Kuzan",
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-083 Kouzuki Momonosuke (Character) ─────────────────────────────────
// [Activate: Main] You may rest this Character and 1 of your {Dressrosa} type
// Leader or Stage cards: Give up to 1 of your opponent's Characters -2 cost
// during this turn.

export const OP10_083_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "OP10-083",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-085 Jesus Burgess (Character) ───────────────────────────────────────
// [DON!! x1] If you have 8 or more cards in your trash, this Character gains
// [Rush].

export const OP10_085_JESUS_BURGESS: EffectSchema = {
  card_id: "OP10-085",
  card_name: "Jesus Burgess",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
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
            type: "TRASH_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 8,
          },
        ],
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
  ],
};

// ─── OP10-086 Shiryu (Character) ──────────────────────────────────────────────
// [Opponent's Turn] This Character gains +2000 power.
// [Activate: Main] [Once Per Turn] If your Leader has the {Blackbeard Pirates}
// type, and this Character was played on this turn, K.O. up to 1 of your
// opponent's Characters with a base cost of 3 or less.

export const OP10_086_SHIRYU: EffectSchema = {
  card_id: "OP10-086",
  card_name: "Shiryu",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_power_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "TURN_COUNT", controller: "OPPONENT", operator: ">=", value: 0 } },
    },
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Blackbeard Pirates" } },
          { type: "WAS_PLAYED_THIS_TURN" },
        ],
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-087 Tony Tony.Chopper (Character) ───────────────────────────────────
// [Activate: Main] You may rest this Character and 1 of your {Dressrosa} type
// Leader or Stage cards: If your opponent has 5 or more cards in their hand,
// your opponent trashes 1 card from their hand. Then, trash 2 cards from the
// top of your deck.

export const OP10_087_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP10-087",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "activate_discard_and_mill",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 5,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
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

// ─── OP10-088 Nami (Character) ────────────────────────────────────────────────
// [Activate: Main] You may rest this Character and 1 of your {Dressrosa} type
// Leader or Stage cards: Draw 1 card. Then, trash 2 cards from the top of your
// deck.

export const OP10_088_NAMI: EffectSchema = {
  card_id: "OP10-088",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "activate_draw_and_mill",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-090 Franky (Character) ──────────────────────────────────────────────
// [Blocker]
// [On K.O.] Play up to 1 {Dressrosa} type Character card with a cost of 3 or
// less from your trash rested.

export const OP10_090_FRANKY: EffectSchema = {
  card_id: "OP10-090",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"], cost_max: 3 },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP10-091 Brook (Character) ───────────────────────────────────────────────
// [Activate: Main] You may rest this Character and 1 of your {Dressrosa} type
// Leader or Stage cards: K.O. up to 1 of your opponent's Characters with a cost
// of 1 or less. Then, trash 2 cards from the top of your deck.

export const OP10_091_BROOK: EffectSchema = {
  card_id: "OP10-091",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko_and_mill",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
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
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-092 Perona (Character) ──────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may place 2 {Thriller Bark Pirates} type
// cards from your trash at the bottom of your deck in any order: Up to 1 of
// your Characters other than [Perona] gains +2000 power during this turn.

export const OP10_092_PERONA: EffectSchema = {
  card_id: "OP10-092",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "activate_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          filter: { traits: ["Thriller Bark Pirates"] },
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { exclude_name: "Perona" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-093 Saint Homing (Character) ────────────────────────────────────────
// [Activate: Main] You may trash this Character: Up to 1 of your black
// Characters gains +3 cost until the end of your opponent's next turn.

export const OP10_093_SAINT_HOMING: EffectSchema = {
  card_id: "OP10-093",
  card_name: "Saint Homing",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK" },
          },
          params: { amount: 3 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP10-094 Ryuma (Character) ───────────────────────────────────────────────
// [DON!! x1] This Character gains [Double Attack].

export const OP10_094_RYUMA: EffectSchema = {
  card_id: "OP10-094",
  card_name: "Ryuma",
  card_type: "Character",
  effects: [
    {
      id: "don_x1_double_attack",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
        },
      ],
    },
  ],
};

// ─── OP10-095 Roronoa Zoro (Character) ────────────────────────────────────────
// [On Play] You may rest 1 of your {Dressrosa} type Leader or Stage cards: K.O.
// up to 1 of your opponent's Characters with a cost of 4 or less. Then, trash 2
// cards from the top of your deck.

export const OP10_095_RORONOA_ZORO: EffectSchema = {
  card_id: "OP10-095",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_and_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
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

// ─── OP10-096 There's No Longer Any Need for the Seven Warlords of the Sea!!! (Event)
// [Main] K.O. up to 1 of your opponent's {The Seven Warlords of the Sea} type
// Characters with a cost of 8 or less.
// [Trigger] K.O. up to 1 of your opponent's {The Seven Warlords of the Sea}
// type Characters with a cost of 4 or less.

export const OP10_096_NO_LONGER_NEED_WARLORDS: EffectSchema = {
  card_id: "OP10-096",
  card_name: "There's No Longer Any Need for the Seven Warlords of the Sea!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { traits: ["The Seven Warlords of the Sea"], cost_max: 8 },
          },
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
            filter: { traits: ["The Seven Warlords of the Sea"], cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP10-097 Gum-Gum Rhino Schneider (Event) ────────────────────────────────
// [Main] Up to 1 of your {Dressrosa} type Characters gains +2000 power during
// this turn. Then, if you have 10 or more cards in your trash, that card gains
// [Banish] during this turn.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP10_097_GUM_GUM_RHINO_SCHNEIDER: EffectSchema = {
  card_id: "OP10-097",
  card_name: "Gum-Gum Rhino Schneider",
  card_type: "Event",
  effects: [
    {
      id: "main_buff_and_banish",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
          result_ref: "buffed_character",
        },
        {
          type: "GRANT_KEYWORD",
          target_ref: "buffed_character",
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
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
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP10-098 Liberation (Event) ──────────────────────────────────────────────
// [Main] If the number of your Characters is at least 2 less than the number of
// your opponent's Characters, K.O. up to 1 of your opponent's Characters with a
// base cost of 6 or less and up to 1 of your opponent's Characters with a base
// cost of 4 or less.
// [Trigger] Negate the effect of up to 1 of each of your opponent's Leader and
// Character cards during this turn.

export const OP10_098_LIBERATION: EffectSchema = {
  card_id: "OP10-098",
  card_name: "Liberation",
  card_type: "Event",
  effects: [
    {
      id: "main_multi_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "COMPARATIVE",
        metric: "CHARACTER_COUNT",
        operator: "<=",
        margin: -2,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            dual_targets: [
              { filter: { base_cost_max: 6 }, count: { up_to: 1 } },
              { filter: { base_cost_max: 4 }, count: { up_to: 1 } },
            ],
          },
        },
      ],
    },
    {
      id: "trigger_negate",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { card_type: "LEADER" },
          },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Supernovas / Revolutionary Army (OP10-099 to OP10-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP10-099 Eustass"Captain"Kid (Leader) ────────────────────────────────────
// [End of Your Turn] You may turn 1 card from the top of your Life cards
// face-up: Set up to 1 of your {Supernovas} type Characters with a cost of 3
// to 8 as active. That Character gains [Blocker] until the end of your
// opponent's next turn.

export const OP10_099_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "OP10-099",
  card_name: 'Eustass"Captain"Kid',
  card_type: "Leader",
  effects: [
    {
      id: "eot_set_active_and_blocker",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "TURN_LIFE_FACE_UP", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Supernovas"], cost_range: { min: 3, max: 8 } },
          },
          result_ref: "activated_character",
        },
        {
          type: "GRANT_KEYWORD",
          target_ref: "activated_character",
          params: { keyword: "BLOCKER" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP10-100 Inazuma (Character) ─────────────────────────────────────────────
// [DON!! x1] [When Attacking] Rest up to 1 of your opponent's Characters with a
// cost equal to or less than the total of your and your opponent's Life cards.
// [Trigger] If your Leader has the {Revolutionary Army} type and you and your
// opponent have a total of 5 or less Life cards, play this card.

export const OP10_100_INAZUMA: EffectSchema = {
  card_id: "OP10-100",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: {
                type: "GAME_STATE",
                source: "COMBINED_LIFE_COUNT",
              },
            },
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Revolutionary Army" } },
          { type: "COMBINED_TOTAL", metric: "LIFE_COUNT", operator: "<=", value: 5 },
        ],
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP10-102 Emporio.Ivankov (Character) ─────────────────────────────────────
// [Activate: Main] [Once Per Turn] Up to 3 of your {Revolutionary Army} type
// Characters gain +1000 power during this turn. Then, add 1 card from the top
// of your Life cards to your hand.

export const OP10_102_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP10-102",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "activate_buff_and_life_to_hand",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 3 },
            filter: { traits: ["Revolutionary Army"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
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

// ─── OP10-103 Capone"Gang"Bege (Character) ────────────────────────────────────
// [On Play] You may add 1 card from the top or bottom of your Life cards to
// your hand: Add up to 1 {Supernovas} type Character card from your hand to the
// top of your Life cards face-up.

export const OP10_103_CAPONE_GANG_BEGE: EffectSchema = {
  card_id: "OP10-103",
  card_name: 'Capone"Gang"Bege',
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_swap",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Supernovas"] },
          },
          params: { face: "UP", position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP10-104 Caribou (Character) ─────────────────────────────────────────────
// [DON!! x1] If your Leader has the {Supernovas} type and your opponent has 3
// or more Life cards, this Character cannot be K.O.'d in battle.

export const OP10_104_CARIBOU: EffectSchema = {
  card_id: "OP10-104",
  card_name: "Caribou",
  card_type: "Character",
  effects: [
    {
      id: "conditional_ko_protection",
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
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Supernovas" },
          },
          {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 3,
          },
        ],
      },
      prohibitions: [
        { type: "CANNOT_BE_KO", scope: { cause: "BATTLE" } },
      ],
    },
  ],
};

// ─── OP10-106 Killer (Character) ──────────────────────────────────────────────
// [On K.O.] If your Leader has the {Supernovas} type, look at 3 cards from the
// top of your deck; reveal up to 1 {Supernovas} or {Kid Pirates} type card and
// add it to your hand. Then, place the rest at the bottom of your deck in any
// order.

export const OP10_106_KILLER: EffectSchema = {
  card_id: "OP10-106",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_search",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits_any_of: ["Supernovas", "Kid Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-107 Jewelry Bonney (Character) ──────────────────────────────────────
// [Blocker]
// [On Play] You may add 1 card from the top or bottom of your Life cards to
// your hand: Add up to 1 {Supernovas} type Character card with a cost of 5
// from your hand to the top of your Life cards face-up.

export const OP10_107_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP10-107",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_life_swap",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Supernovas"], cost_exact: 5 },
          },
          params: { face: "UP", position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP10-108 Scratchmen Apoo (Character) ─────────────────────────────────────
// If you have a yellow {Supernovas} type Character other than
// [Scratchmen Apoo], this Character gains [Blocker].

export const OP10_108_SCRATCHMEN_APOO: EffectSchema = {
  card_id: "OP10-108",
  card_name: "Scratchmen Apoo",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          color: "YELLOW",
          traits: ["Supernovas"],
          card_type: "CHARACTER",
          exclude_name: "Scratchmen Apoo",
        },
        count: { operator: ">=", value: 1 },
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

// ─── OP10-109 Basil Hawkins (Character) ───────────────────────────────────────
// [On K.O.] Trash up to 1 card from the top of your opponent's Life cards.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP10_109_BASIL_HAWKINS: EffectSchema = {
  card_id: "OP10-109",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_trash_life",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP10-110 Heat & Wire (Character) ─────────────────────────────────────────
// [On Play] Rest up to 1 of your opponent's Characters with a cost equal to or
// less than the number of your opponent's Life cards.
// [Trigger] If you have 2 or less Life cards, play this card.

export const OP10_110_HEAT_AND_WIRE: EffectSchema = {
  card_id: "OP10-110",
  card_name: "Heat & Wire",
  card_type: "Character",
  effects: [
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
            filter: {
              cost_max: {
                type: "GAME_STATE",
                source: "OPPONENT_LIFE_COUNT",
              },
            },
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP10-111 Monkey.D.Luffy (Character) ──────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Supernovas} type card other than [Monkey.D.Luffy] and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP10_111_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP10-111",
  card_name: "Monkey.D.Luffy",
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
            filter: { traits: ["Supernovas"], exclude_name: "Monkey.D.Luffy" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP10-112 Eustass"Captain"Kid (Character) ─────────────────────────────────
// [On Play] You may rest this Character: Trash up to 1 card from the top of
// your opponent's Life cards.
// [End of Your Turn] If your opponent has 2 or less Life cards, draw 1 card and
// trash 1 card from your hand.

export const OP10_112_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "OP10-112",
  card_name: 'Eustass"Captain"Kid',
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "eot_draw_trash",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 2,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP10-113 Roronoa Zoro (Character) ────────────────────────────────────────
// If you have less Life cards than your opponent, this Character gains [Rush].
// [Trigger] You may trash 1 card from your hand: If your Leader has the
// {Supernovas} type, play this card.

export const OP10_113_RORONOA_ZORO: EffectSchema = {
  card_id: "OP10-113",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<",
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
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP10-114 X.Drake (Character) ─────────────────────────────────────────────
// [Activate: Main] You may rest this Character: If the number of your Life
// cards is equal to or less than the number of your opponent's Life cards, rest
// up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP10_114_X_DRAKE: EffectSchema = {
  card_id: "OP10-114",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_opponent",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<=",
      },
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

// ─── OP10-115 Let's Meet Again in the New World (Event) ───────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, if you have 0 Life cards, draw 1 card.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost equal to or
// less than the number of your opponent's Life cards.

export const OP10_115_LETS_MEET_AGAIN_IN_THE_NEW_WORLD: EffectSchema = {
  card_id: "OP10-115",
  card_name: "Let's Meet Again in the New World",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_draw",
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "==",
            value: 0,
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
            filter: {
              cost_max: {
                type: "GAME_STATE",
                source: "OPPONENT_LIFE_COUNT",
              },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP10-116 Damned Punk (Event) ─────────────────────────────────────────────
// [Main] Look at up to 1 card from the top of your or your opponent's Life
// cards and place it at the top or bottom of the Life cards. Then, K.O. up to 1
// of your opponent's Characters with a cost of 5 or less.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP10_116_DAMNED_PUNK: EffectSchema = {
  card_id: "OP10-116",
  card_name: "Damned Punk",
  card_type: "Event",
  effects: [
    {
      id: "main_scry_and_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "LIFE_SCRY",
          target: {
            type: "LIFE_CARD",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { look_at: 1 },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP10-117 ROOM (Event) ────────────────────────────────────────────────────
// [Counter] If you have 1 or less Life cards, up to 1 of your Leader or
// Character cards gains +3000 power during this battle. Then, set up to 1 of
// your Characters with a cost of 5 or less as active.
// [Trigger] Draw 1 card.

export const OP10_117_ROOM: EffectSchema = {
  card_id: "OP10-117",
  card_name: "ROOM",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_set_active",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          chain: "THEN",
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

// ─── OP10-118 Monkey.D.Luffy (Character) ──────────────────────────────────────
// Once per turn, this Character cannot be K.O.'d by your opponent's effects.
// [When Attacking] You may place 3 cards from your trash at the bottom of your
// deck in any order: If your opponent has 5 or more cards in their hand, your
// opponent trashes 1 card from their hand.

export const OP10_118_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP10-118",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection_once",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BY_OPPONENT_EFFECT", uses_per_turn: 1 },
        },
      ],
    },
    {
      id: "when_attacking_discard",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 3,
          position: "BOTTOM",
        },
      ],
      flags: { optional: true },
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 5,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP10-119 Trafalgar Law (Character) ───────────────────────────────────────
// [On Play] Reveal up to 1 {Supernovas} type Character card from your hand and
// add it to the top of your Life cards face-down. Then, give up to 1 rested
// DON!! card to 1 of your {Supernovas} type Leader.

export const OP10_119_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP10-119",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_life_and_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Supernovas"] },
          },
          params: { face: "DOWN", position: "TOP" },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Supernovas"], card_type: "LEADER" },
          },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP10_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP10-001": OP10_001_SMOKER,
  "OP10-002": OP10_002_CAESAR_CLOWN,
  "OP10-003": OP10_003_SUGAR,
  "OP10-004": OP10_004_VERGO,
  "OP10-005": OP10_005_SANJI,
  "OP10-006": OP10_006_CAESAR_CLOWN,
  "OP10-007": OP10_007_CEASER_SOLDIER,
  "OP10-008": OP10_008_SCOTCH,
  "OP10-009": OP10_009_SMILEY,
  "OP10-010": OP10_010_CHADROS_HIGELYGES,
  "OP10-011": OP10_011_TONY_TONY_CHOPPER,
  "OP10-012": OP10_012_DRAGON_NUMBER_THIRTEEN,
  "OP10-015": OP10_015_MOCHA,
  "OP10-016": OP10_016_MONET,
  "OP10-017": OP10_017_ROCK,
  "OP10-018": OP10_018_TEN_LAYER_IGLOO,
  "OP10-019": OP10_019_DIVINE_DEPARTURE,
  "OP10-020": OP10_020_GUM_GUM_UFO,
  "OP10-021": OP10_021_PUNK_HAZARD,
  // Green
  "OP10-022": OP10_022_TRAFALGAR_LAW,
  "OP10-023": OP10_023_ISSHO,
  "OP10-024": OP10_024_EDWARD_NEWGATE,
  "OP10-025": OP10_025_ENEL,
  "OP10-026": OP10_026_KINEMON,
  "OP10-027": OP10_027_KINEMON,
  "OP10-028": OP10_028_KOUZUKI_MOMONOSUKE,
  "OP10-029": OP10_029_DRACULE_MIHAWK,
  "OP10-030": OP10_030_SMOKER,
  "OP10-032": OP10_032_TASHIGI,
  "OP10-033": OP10_033_NAMI,
  "OP10-034": OP10_034_FRANKY,
  "OP10-035": OP10_035_BROOK,
  "OP10-036": OP10_036_PERONA,
  "OP10-037": OP10_037_LIM,
  "OP10-038": OP10_038_RORONOA_ZORO,
  "OP10-039": OP10_039_GUM_GUM_DRAGON_FIRE_PISTOL_TWISTER_STAR,
  "OP10-040": OP10_040_THE_WEAK_DO_NOT_HAVE_THE_RIGHT,
  "OP10-041": OP10_041_RADIO_KNIFE,
  // Blue
  "OP10-042": OP10_042_USOPP,
  "OP10-043": OP10_043_MOOCY,
  "OP10-044": OP10_044_CUB,
  "OP10-045": OP10_045_CAVENDISH,
  "OP10-046": OP10_046_KYROS,
  "OP10-047": OP10_047_KOALA,
  "OP10-048": OP10_048_SAI,
  "OP10-049": OP10_049_SABO,
  "OP10-051": OP10_051_HACK,
  "OP10-052": OP10_052_BARTOLOMEO,
  "OP10-053": OP10_053_BIAN,
  "OP10-055": OP10_055_MARCO,
  "OP10-056": OP10_056_MANSHERRY,
  "OP10-057": OP10_057_LEO,
  "OP10-058": OP10_058_REBECCA,
  "OP10-059": OP10_059_FOLLOW_ME_AND_I_WILL_GUIDE_YOU,
  "OP10-060": OP10_060_BARRIER_BARRIER_PISTOL,
  "OP10-061": OP10_061_SPECIAL_LONG_RANGE_ATTACK_BAGWORM,
  // Purple
  "OP10-062": OP10_062_VIOLET,
  "OP10-063": OP10_063_VINSMOKE_SANJI,
  "OP10-064": OP10_064_CLONE_SOLDIER,
  "OP10-065": OP10_065_SUGAR,
  "OP10-066": OP10_066_GIOLLA,
  "OP10-067": OP10_067_SENOR_PINK,
  "OP10-069": OP10_069_FIGHTING_FISH,
  "OP10-070": OP10_070_TREBOL,
  "OP10-071": OP10_071_DONQUIXOTE_DOFLAMINGO,
  "OP10-072": OP10_072_DONQUIXOTE_ROSINANTE,
  "OP10-074": OP10_074_PICA,
  "OP10-075": OP10_075_FOXY,
  "OP10-076": OP10_076_BABY_5,
  "OP10-077": OP10_077_BELLAMY,
  "OP10-078": OP10_078_I_DO_NOT_FORGIVE,
  "OP10-079": OP10_079_GOD_THREAD,
  "OP10-080": OP10_080_LITTLE_BLACK_BEARS,
  // Black
  "OP10-081": OP10_081_USOPP,
  "OP10-082": OP10_082_KUZAN,
  "OP10-083": OP10_083_KOUZUKI_MOMONOSUKE,
  "OP10-085": OP10_085_JESUS_BURGESS,
  "OP10-086": OP10_086_SHIRYU,
  "OP10-087": OP10_087_TONY_TONY_CHOPPER,
  "OP10-088": OP10_088_NAMI,
  "OP10-090": OP10_090_FRANKY,
  "OP10-091": OP10_091_BROOK,
  "OP10-092": OP10_092_PERONA,
  "OP10-093": OP10_093_SAINT_HOMING,
  "OP10-094": OP10_094_RYUMA,
  "OP10-095": OP10_095_RORONOA_ZORO,
  "OP10-096": OP10_096_NO_LONGER_NEED_WARLORDS,
  "OP10-097": OP10_097_GUM_GUM_RHINO_SCHNEIDER,
  "OP10-098": OP10_098_LIBERATION,
  // Yellow
  "OP10-099": OP10_099_EUSTASS_CAPTAIN_KID,
  "OP10-100": OP10_100_INAZUMA,
  "OP10-102": OP10_102_EMPORIO_IVANKOV,
  "OP10-103": OP10_103_CAPONE_GANG_BEGE,
  "OP10-104": OP10_104_CARIBOU,
  "OP10-106": OP10_106_KILLER,
  "OP10-107": OP10_107_JEWELRY_BONNEY,
  "OP10-108": OP10_108_SCRATCHMEN_APOO,
  "OP10-109": OP10_109_BASIL_HAWKINS,
  "OP10-110": OP10_110_HEAT_AND_WIRE,
  "OP10-111": OP10_111_MONKEY_D_LUFFY,
  "OP10-112": OP10_112_EUSTASS_CAPTAIN_KID,
  "OP10-113": OP10_113_RORONOA_ZORO,
  "OP10-114": OP10_114_X_DRAKE,
  "OP10-115": OP10_115_LETS_MEET_AGAIN_IN_THE_NEW_WORLD,
  "OP10-116": OP10_116_DAMNED_PUNK,
  "OP10-117": OP10_117_ROOM,
  "OP10-118": OP10_118_MONKEY_D_LUFFY,
  "OP10-119": OP10_119_TRAFALGAR_LAW,
};
