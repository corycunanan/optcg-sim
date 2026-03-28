/**
 * M4 Effect Schema — OP05 Card Encodings
 *
 * Red (Sabo / Belo Betty / Revolutionary Army): OP05-001 through OP05-021
 * Green (Donquixote Rosinante / Donquixote Pirates): OP05-022 through OP05-040
 * Blue (Sakazuki / Navy / Marines): OP05-041 through OP05-059
 * Purple (Monkey.D.Luffy / Kid Pirates / Heart Pirates): OP05-060 through OP05-078
 * Black (Dressrosa / Celestial Dragons): OP05-079 through OP05-097
 * Yellow (Enel / Sky Island): OP05-098 through OP05-117
 * Secret Rares: OP05-118 (Blue), OP05-119 (Purple)
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-001 Sabo (Leader, Red/Black)
// [DON!! x1] [Opponent's Turn] [Once Per Turn] If your Character with 5000
// power or more would be K.O.'d, you may give that Character -1000 power
// during this turn instead of that Character being K.O.'d.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_001_SABO: EffectSchema = {
  card_id: "OP05-001",
  card_name: "Sabo",
  card_type: "Leader",
  effects: [
    {
      id: "ko_replacement_power_reduction",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          power_min: 5000,
        },
      },
      replacement_actions: [
        {
          type: "MODIFY_POWER",
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      conditions: {
        all_of: [
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "ANY_CARD_HAS_DON",
            operator: ">=",
            value: 1,
          },
        ],
      },
      flags: { once_per_turn: true, optional: true },
      // _comment: "[Opponent's Turn] restriction — this replacement only activates during opponent's turn
      zone: "FIELD",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-002 Belo Betty (Leader, Red/Yellow)
// [Activate: Main] [Once Per Turn] You may trash 1 {Revolutionary Army} type
// card from your hand: Up to 3 of your {Revolutionary Army} type Characters
// or Characters with a [Trigger] gain +3000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_002_BELO_BETTY: EffectSchema = {
  card_id: "OP05-002",
  card_name: "Belo Betty",
  card_type: "Leader",
  effects: [
    {
      id: "activate_trash_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits: ["Revolutionary Army"] },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 3 },
            filter: {
              any_of: [
                { traits: ["Revolutionary Army"] },
                { has_trigger: true },
              ],
            },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-003 Inazuma (Character)
// If you have a Character with 7000 power or more other than this Character,
// this Character gains [Rush].
// (This card can attack on the turn in which it is played.)
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_003_INAZUMA: EffectSchema = {
  card_id: "OP05-003",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", power_min: 7000, exclude_self: true },
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-004 Emporio.Ivankov (Character)
// [Activate: Main] [Once Per Turn] If this Character has 7000 power or more,
// play up to 1 {Revolutionary Army} type Character card with 5000 power or
// less other than [Emporio.Ivankov] from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_004_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP05-004",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_revolutionary",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 7000,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Revolutionary Army"],
              power_max: 5000,
              exclude_name: "Emporio.Ivankov",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-005 Karasu (Character)
// [On Play] If your Leader has the {Revolutionary Army} type, give up to 1 of
// your opponent's Leader or Character cards -1000 power during this turn.
// [When Attacking] If this Character has 7000 power or more, give up to 1 of
// your opponent's Leader or Character cards -1000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_005_KARASU: EffectSchema = {
  card_id: "OP05-005",
  card_name: "Karasu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 7000,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-006 Koala (Character)
// [On Play] If your Leader has the {Revolutionary Army} type, give up to 1 of
// your opponent's Characters -3000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_006_KOALA: EffectSchema = {
  card_id: "OP05-006",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-007 Sabo (Character)
// [On Play] K.O. up to 2 of your opponent's Characters with a total power of
// 4000 or less.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_007_SABO: EffectSchema = {
  card_id: "OP05-007",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_aggregate",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            aggregate_constraint: {
              property: "power",
              operator: "<=",
              value: 4000,
            },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-008 Chaka (Character)
// [DON!! x1] [Activate: Main] [Once Per Turn] Give up to 2 rested DON!! cards
// to your Leader or 1 of your Characters.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_008_CHAKA: EffectSchema = {
  card_id: "OP05-008",
  card_name: "Chaka",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2 },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-009 Toh-Toh (Character)
// [On Play] Draw 1 card if your Leader has 0 power or less.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_009_TOH_TOH: EffectSchema = {
  card_id: "OP05-009",
  card_name: "Toh-Toh",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { power: { operator: "<=", value: 0 } },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-010 Nico Robin (Character)
// [On Play] K.O. up to 1 of your opponent's Characters with 1000 power or less.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_010_NICO_ROBIN: EffectSchema = {
  card_id: "OP05-010",
  card_name: "Nico Robin",
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
            filter: { power_max: 1000 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-011 Bartholomew Kuma (Character)
// [On Play] K.O. up to 1 of your opponent's Characters with 2000 power or less.
// Trigger: [Trigger] If your Leader is multicolored, play this card.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_011_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "OP05-011",
  card_name: "Bartholomew Kuma",
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
            filter: { power_max: 2000 },
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-012 Hack — Vanilla (skipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-013 Bunny Joe (Character)
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_013_BUNNY_JOE: EffectSchema = {
  card_id: "OP05-013",
  card_name: "Bunny Joe",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-014 Pell (Character)
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters
// -2000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_014_PELL: EffectSchema = {
  card_id: "OP05-014",
  card_name: "Pell",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-015 Belo Betty (Character)
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Revolutionary Army} type card other than [Belo Betty] and add it to your
// hand. Then, place the rest at the bottom of your deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_015_BELO_BETTY: EffectSchema = {
  card_id: "OP05-015",
  card_name: "Belo Betty",
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
            filter: {
              traits: ["Revolutionary Army"],
              exclude_name: "Belo Betty",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-016 Morley (Character)
// [When Attacking] If this Character has 7000 power or more, your opponent
// cannot activate [Blocker] during this battle.
// Trigger: [Trigger] You may trash 1 card from your hand: If your Leader is
// multicolored, play this card.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_016_MORLEY: EffectSchema = {
  card_id: "OP05-016",
  card_name: "Morley",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_blocker_prohibition",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 7000,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "OPPONENT" },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-017 Lindbergh (Character)
// [When Attacking] If this Character has 7000 power or more, K.O. up to 1 of
// your opponent's Characters with 3000 power or less.
// Trigger: [Trigger] You may trash 1 card from your hand: If your Leader is
// multicolored, play this card.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_017_LINDBERGH: EffectSchema = {
  card_id: "OP05-017",
  card_name: "Lindbergh",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 7000,
      },
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
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-018 Emporio Energy Hormone (Event)
// [Counter] Up to 1 of your Leader or Character cards gains +3000 power during
// this battle. Then, play up to 1 {Revolutionary Army} type Character card with
// 5000 power or less from your hand.
// Trigger: [Trigger] Play up to 1 {Revolutionary Army} type Character card with
// 5000 power or less from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_018_EMPORIO_ENERGY_HORMONE: EffectSchema = {
  card_id: "OP05-018",
  card_name: "Emporio Energy Hormone",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost_and_play",
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
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Revolutionary Army"],
              power_max: 5000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_play_revolutionary",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Revolutionary Army"],
              power_max: 5000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-019 Fire Fist (Event)
// [Main] Give up to 1 of your opponent's Characters -4000 power during this
// turn. Then, if you have 2 or less Life cards, K.O. up to 1 of your
// opponent's Characters with 0 power or less.
// Trigger: [Trigger] Activate this card's [Main] effect.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_019_FIRE_FIST: EffectSchema = {
  card_id: "OP05-019",
  card_name: "Fire Fist",
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
            filter: { power_max: 0 },
          },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "MAIN_EVENT" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-020 Four Thousand-Brick Fist (Event)
// [Main] Up to 1 of your Leader or Character cards gains +2000 power during
// this turn. Then, K.O. up to 1 of your opponent's Characters with 2000 power
// or less.
// Trigger: [Trigger] Up to 1 of your Leader or Character cards gains +1000
// power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_020_FOUR_THOUSAND_BRICK_FIST: EffectSchema = {
  card_id: "OP05-020",
  card_name: "Four Thousand-Brick Fist",
  card_type: "Event",
  effects: [
    {
      id: "main_power_boost_and_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 2000 },
          },
          chain: "THEN",
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
// OP05-021 Revolutionary Army HQ (Stage)
// [Activate: Main] You may trash 1 card from your hand and rest this Stage:
// Look at 3 cards from the top of your deck; reveal up to 1 {Revolutionary
// Army} type card and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_021_REVOLUTIONARY_ARMY_HQ: EffectSchema = {
  card_id: "OP05-021",
  card_name: "Revolutionary Army HQ",
  card_type: "Stage",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Revolutionary Army"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-022 Donquixote Rosinante (Leader, Green/Blue) ─────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [End of Your Turn] If you have 6 or less cards in your hand, set this Leader
// as active.

export const OP05_022_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP05-022",
  card_name: "Donquixote Rosinante",
  card_type: "Leader",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "end_turn_set_active",
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
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP05-023 Vergo (Character) ─────────────────────────────────────────────
// [DON!! x1] [When Attacking] K.O. up to 1 of your opponent's rested
// Characters with a cost of 3 or less.

export const OP05_023_VERGO: EffectSchema = {
  card_id: "OP05-023",
  card_name: "Vergo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP05-024 Kuween (Character) ────────────────────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)

export const OP05_024_KUWEEN: EffectSchema = {
  card_id: "OP05-024",
  card_name: "Kuween",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP05-025 Gladius (Character) ───────────────────────────────────────────
// [Activate: Main] You may rest this Character: Rest up to 1 of your
// opponent's Characters with a cost of 3 or less.

export const OP05_025_GLADIUS: EffectSchema = {
  card_id: "OP05-025",
  card_name: "Gladius",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_opponent",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP05-026 Sarquiss (Character) ──────────────────────────────────────────
// [DON!! x1] [When Attacking] [Once Per Turn] You may rest 1 of your
// Characters with a cost of 3 or more: Set this Character as active.

export const OP05_026_SARQUISS: EffectSchema = {
  card_id: "OP05-026",
  card_name: "Sarquiss",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_set_active",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
        once_per_turn: true,
      },
      costs: [{ type: "REST_CARDS", amount: 1, filter: { cost_min: 3 } }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-027 Trafalgar Law (Character) ─────────────────────────────────────
// [Activate: Main] You may trash this Character: Rest up to 1 of your
// opponent's Characters with a cost of 3 or less.

export const OP05_027_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP05-027",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_opponent",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP05-028 Donquixote Doflamingo (Character) ────────────────────────────
// [Activate: Main] You may trash this Character: K.O. up to 1 of your
// opponent's rested Characters with a cost of 2 or less.

export const OP05_028_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP05-028",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko_rested",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 2 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-029 Donquixote Doflamingo (Character) ────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] ➀ (You may rest the specified
// number of DON!! cards in your cost area.): Rest up to 1 of your opponent's
// Characters with a cost of 6 or less.

export const OP05_029_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP05-029",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_rest",
      category: "auto",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
        once_per_turn: true,
      },
      costs: [{ type: "DON_REST", amount: 1 }],
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
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP05-030 Donquixote Rosinante (Character) ─────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [Opponent's Turn] If your rested Character would be K.O.'d, you may trash
// this Character instead.
// NOTE: [Opponent's Turn] restriction — this replacement only applies during
// the opponent's turn. Encoded via zone: "FIELD" as a semantic marker; the
// engine should check turn ownership at resolution time.

export const OP05_030_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP05-030",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "replacement_protect_rested",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: { is_rested: true },
      },
      replacement_actions: [
        {
          type: "TRASH_CARD",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-031 Buffalo (Character) ───────────────────────────────────────────
// [When Attacking] [Once Per Turn] If you have 2 or more rested Characters,
// set up to 1 of your rested Characters with a cost of 1 as active.

export const OP05_031_BUFFALO: EffectSchema = {
  card_id: "OP05-031",
  card_name: "Buffalo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_set_active",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
        once_per_turn: true,
      },
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
            filter: { is_rested: true, cost_exact: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP05-032 Pica (Character) ──────────────────────────────────────────────
// [End of Your Turn] ①: Set this Character as active.
// [Once Per Turn] If this Character would be K.O.'d, you may rest up to 1 of
// your Characters with a cost of 3 or more other than [Pica] instead.

export const OP05_032_PICA: EffectSchema = {
  card_id: "OP05-032",
  card_name: "Pica",
  card_type: "Character",
  effects: [
    {
      id: "end_turn_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
    {
      id: "replacement_ko_protection",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_min: 3, exclude_name: "Pica" },
          },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP05-033 Baby 5 (Character) ────────────────────────────────────────────
// [Activate: Main] ➀ (You may rest the specified number of DON!! cards in
// your cost area.) You may rest this Character: Play up to 1 {Donquixote
// Pirates} type Character card with a cost of 2 or less from your hand.

export const OP05_033_BABY_5: EffectSchema = {
  card_id: "OP05-033",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_from_hand",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { traits: ["Donquixote Pirates"], cost_max: 2 },
          },
          params: { cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-034 Baby 5 (Character) ────────────────────────────────────────────
// [Activate: Main] ➀ (You may rest the specified number of DON!! cards in
// your cost area.) You may rest this Character: Look at 5 cards from the top
// of your deck; reveal up to 1 {Donquixote Pirates} type card and add it to
// your hand. Then, place the rest at the bottom of your deck in any order.

export const OP05_034_BABY_5: EffectSchema = {
  card_id: "OP05-034",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "activate_search_deck",
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
            filter: { traits: ["Donquixote Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-035 Bellamy — Vanilla (skipped) ───────────────────────────────────

// ─── OP05-036 Monet (Character) ─────────────────────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [On Block] Rest up to 1 of your opponent's Characters with a cost of 4 or
// less.

export const OP05_036_MONET: EffectSchema = {
  card_id: "OP05-036",
  card_name: "Monet",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
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

// ─── OP05-037 Because the Side of Justice Will Be Whichever Side Wins!! (Event)
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.
// Trigger: [Trigger] Rest up to 1 of your opponent's Characters with a cost
// of 4 or less.

export const OP05_037_BECAUSE_THE_SIDE_OF_JUSTICE: EffectSchema = {
  card_id: "OP05-037",
  card_name: "Because the Side of Justice Will Be Whichever Side Wins!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_rest_opponent",
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

// ─── OP05-038 Charlestone (Event) ───────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power
// during this battle. Then, you may trash 1 card from your hand. If you do,
// set up to 3 of your DON!! cards as active.
// Trigger: [Trigger] Rest up to 1 of your opponent's Leader or Character
// cards with a cost of 3 or less.

export const OP05_038_CHARLESTONE: EffectSchema = {
  card_id: "OP05-038",
  card_name: "Charlestone",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_don",
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
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 3 },
          },
          chain: "IF_DO",
        },
      ],
    },
    {
      id: "trigger_rest_opponent",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP05-039 Stick-Stickem Meteora (Event) ─────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power
// during this battle. Then, K.O. up to 1 of your opponent's rested Characters
// with a cost of 3 or less.
// Trigger: [Trigger] K.O. up to 1 of your opponent's rested Characters with a
// cost of 5 or less.

export const OP05_039_STICK_STICKEM_METEORA: EffectSchema = {
  card_id: "OP05-039",
  card_name: "Stick-Stickem Meteora",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_ko",
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
            filter: { is_rested: true, cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP05-040 Birdcage (Stage) ──────────────────────────────────────────────
// If your Leader is [Donquixote Doflamingo], all Characters with a cost of 5
// or less do not become active in your and your opponent's Refresh Phases.
// [End of Your Turn] If you have 10 DON!! cards on your field, K.O. all
// rested Characters with a cost of 5 or less. Then, trash this Stage.

export const OP05_040_BIRDCAGE: EffectSchema = {
  card_id: "OP05-040",
  card_name: "Birdcage",
  card_type: "Stage",
  effects: [
    {
      id: "permanent_no_refresh",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Donquixote Doflamingo" },
      },
      prohibitions: [
        {
          type: "CANNOT_REFRESH",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
    {
      id: "end_turn_ko_and_trash",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { is_rested: true, cost_max: 5 },
          },
        },
        {
          type: "TRASH_CARD",
          target: { type: "SELF" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-041 Sakazuki (Leader, Blue/Black)
// [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: Draw 1 card.
// [When Attacking] Give up to 1 of your opponent's Characters −1 cost during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_041_SAKAZUKI: EffectSchema = {
  card_id: "OP05-041",
  card_name: "Sakazuki",
  card_type: "Leader",
  effects: [
    {
      id: "activate_trash_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
        },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "when_attacking_reduce_cost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-042 Issho (Character)
// [On Play] Up to 1 of your opponent's Characters with a cost of 7 or less
// cannot attack until the start of your next turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_042_ISSHO: EffectSchema = {
  card_id: "OP05-042",
  card_name: "Issho",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
          params: {
            prohibition_type: "CANNOT_ATTACK",
          },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-043 Ulti (Character)
// [On Play] If your Leader is multicolored, look at 3 cards from the top of
// your deck and add up to 1 card to your hand. Then, place the rest at the
// top or bottom of the deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_043_ULTI: EffectSchema = {
  card_id: "OP05-043",
  card_name: "Ulti",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_top",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            rest_destination: "TOP_OR_BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-044 John Giant — VANILLA (no effect text, skipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-045 Stainless (Character)
// [Activate: Main] You may trash 1 card from your hand and rest this Character:
// Place up to 1 Character with a cost of 2 or less at the bottom of the
// owner's deck.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_045_STAINLESS: EffectSchema = {
  card_id: "OP05-045",
  card_name: "Stainless",
  card_type: "Character",
  effects: [
    {
      id: "activate_remove_low_cost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          params: { position: "BOTTOM" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-046 Dalmatian (Character)
// [On K.O.] Draw 1 card and place 1 card from your hand at the bottom of
// your deck.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_046_DALMATIAN: EffectSchema = {
  card_id: "OP05-046",
  card_name: "Dalmatian",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw_and_place",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 1, position: "BOTTOM" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-047 Basil Hawkins (Character)
// [Blocker]
// [On Block] Draw 1 card if you have 3 or less cards in your hand. Then,
// this Character gains +1000 power during this battle.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_047_BASIL_HAWKINS: EffectSchema = {
  card_id: "OP05-047",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_draw_and_power",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 3,
          },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-048 Bastille (Character)
// [DON!! x1] [When Attacking] Place up to 1 Character with a cost of 2 or
// less at the bottom of the owner's deck.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_048_BASTILLE: EffectSchema = {
  card_id: "OP05-048",
  card_name: "Bastille",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_remove_low_cost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-049 Haccha (Character)
// [DON!! x1] [When Attacking] Return up to 1 Character with a cost of 3 or
// less to the owner's hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_049_HACCHA: EffectSchema = {
  card_id: "OP05-049",
  card_name: "Haccha",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-050 Hina (Character)
// [On Play] Draw 1 card if you have 5 or less cards in your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_050_HINA: EffectSchema = {
  card_id: "OP05-050",
  card_name: "Hina",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-051 Borsalino (Character)
// [On Play] Place up to 1 Character with a cost of 4 or less at the bottom
// of the owner's deck.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_051_BORSALINO: EffectSchema = {
  card_id: "OP05-051",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "on_play_remove_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-052 Maynard (Character)
// [Blocker]
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_052_MAYNARD: EffectSchema = {
  card_id: "OP05-052",
  card_name: "Maynard",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-053 Mozambia (Character)
// [Your Turn] [Once Per Turn] When you draw a card outside of your Draw Phase,
// this Character gains +2000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_053_MOZAMBIA: EffectSchema = {
  card_id: "OP05-053",
  card_name: "Mozambia",
  card_type: "Character",
  effects: [
    {
      id: "draw_outside_phase_power_boost",
      category: "auto",
      trigger: {
        event: "DRAW_OUTSIDE_DRAW_PHASE",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-054 Monkey.D.Garp (Character)
// [On Play] Draw 2 cards and place 2 cards from your hand at the bottom of
// your deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_054_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP05-054",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_place",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "BOTTOM" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-055 X.Drake (Character)
// [Blocker]
// [On Play] Look at 5 cards from the top of your deck and place them at the
// top or bottom of the deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_055_X_DRAKE: EffectSchema = {
  card_id: "OP05-055",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 5 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-056 X.Barrels (Character)
// [On Play] You may place 1 of your Characters other than this Character at
// the bottom of your deck: Draw 1 card.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_056_X_BARRELS: EffectSchema = {
  card_id: "OP05-056",
  card_name: "X.Barrels",
  card_type: "Character",
  effects: [
    {
      id: "on_play_place_character_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          amount: 1,
          filter: { exclude_self: true },
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-057 Hound Blaze (Event)
// [Main] Up to 1 of your Leader or Character cards gains +3000 power during
// this turn. Then, place up to 1 Character with a cost of 2 or less at the
// bottom of the owner's deck.
// [Trigger] Return up to 1 Character with a cost of 3 or less to the
// owner's hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_057_HOUND_BLAZE: EffectSchema = {
  card_id: "OP05-057",
  card_name: "Hound Blaze",
  card_type: "Event",
  effects: [
    {
      id: "main_power_and_remove",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          params: { position: "BOTTOM" },
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
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-058 It's a Waste of Human Life!! (Event)
// [Main] Place all Characters with a cost of 3 or less at the bottom of the
// owner's deck. Then, you and your opponent trash cards from your hands until
// you each have 5 cards in your hands.
// [Trigger] Place all Characters with a cost of 2 or less at the bottom of
// the owner's deck.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_058_WASTE_OF_HUMAN_LIFE: EffectSchema = {
  card_id: "OP05-058",
  card_name: "It's a Waste of Human Life!!",
  card_type: "Event",
  effects: [
    {
      id: "main_mass_removal_and_hand_trim",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { cost_max: 3 },
          },
          params: { position: "BOTTOM" },
        },
        {
          // Both players trash down to 5 cards in hand
          type: "TRASH_FROM_HAND",
          params: {
            amount: {
              type: "GAME_STATE",
              source: "HAND_COUNT",
              controller: "SELF",
            },
            _comment:
              "Dynamic: trash (hand_count - 5) cards. Both self and opponent trim to 5.",
          },
          chain: "THEN",
        },
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              params: {
                amount: {
                  type: "GAME_STATE",
                  source: "HAND_COUNT",
                  controller: "OPPONENT",
                },
                _comment: "Dynamic: opponent trashes down to 5 cards in hand.",
              },
            },
          },
          chain: "AND",
        },
      ],
    },
    {
      id: "trigger_mass_removal",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { cost_max: 2 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-059 Let Us Begin the World of Violence!!! (Event)
// [Main] If your Leader is multicolored, draw 1 card. Then, return up to 1
// Character with a cost of 5 or less to the owner's hand.
// [Trigger] If your Leader is multicolored, draw 2 cards.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_059_WORLD_OF_VIOLENCE: EffectSchema = {
  card_id: "OP05-059",
  card_name: "Let Us Begin the World of Violence!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_draw_and_bounce",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
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
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-060 Monkey.D.Luffy (Leader, Purple)
// [Activate: Main] [Once Per Turn] You may add 1 card from the top of your
// Life cards to your hand: If you have 0 or 3 or more DON!! cards on your
// field, add up to 1 DON!! card from your DON!! deck and set it as active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_060_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP05-060",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_life_to_hand_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP" },
      ],
      conditions: {
        any_of: [
          { type: "DON_FIELD_COUNT", controller: "SELF", operator: "==", value: 0 },
          { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 3 },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-061 Uso-Hachi (Character)
// [DON!! x1] [When Attacking] If you have 8 or more DON!! cards on your field,
// rest up to 1 of your opponent's Characters with a cost of 4 or less.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_061_USO_HACHI: EffectSchema = {
  card_id: "OP05-061",
  card_name: "Uso-Hachi",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest_opponent",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-062 O-Nami (Character)
// If you have 10 DON!! cards on your field, this Character gains [Blocker].
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_062_O_NAMI: EffectSchema = {
  card_id: "OP05-062",
  card_name: "O-Nami",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-063 O-Robi (Character)
// [On Play] If you have 8 or more DON!! cards on your field, K.O. up to 1 of
// your opponent's Characters with a cost of 3 or less.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_063_O_ROBI: EffectSchema = {
  card_id: "OP05-063",
  card_name: "O-Robi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        {
          type: "KO",
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-064 Killer (Character)
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Kid Pirates} type card other than [Killer] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_064_KILLER: EffectSchema = {
  card_id: "OP05-064",
  card_name: "Killer",
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
            filter: {
              traits: ["Kid Pirates"],
              exclude_name: "Killer",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-065 San-Gorou — Vanilla (skipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-066 Jinbe (Character)
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [Opponent's Turn] If you have 10 DON!! cards on your field, this Character
// gains +1000 power.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_066_JINBE: EffectSchema = {
  card_id: "OP05-066",
  card_name: "Jinbe",
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
      // _comment: "[Opponent's Turn] restriction — power boost only applies during opponent's turn
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-067 Zoro-Juurou (Character)
// [When Attacking] If you have 3 or less Life cards, add up to 1 DON!! card
// from your DON!! deck and set it as active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_067_ZORO_JUUROU: EffectSchema = {
  card_id: "OP05-067",
  card_name: "Zoro-Juurou",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_add_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-068 Chopa-Emon (Character)
// [On Play] If you have 8 or more DON!! cards on your field, set up to 1 of
// your purple {Straw Hat Crew} type Characters with 6000 power or less as
// active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_068_CHOPA_EMON: EffectSchema = {
  card_id: "OP05-068",
  card_name: "Chopa-Emon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "PURPLE",
              traits: ["Straw Hat Crew"],
              power_max: 6000,
            },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-069 Trafalgar Law (Character)
// [When Attacking] If your opponent has more DON!! cards on their field than
// you, look at 5 cards from the top of your deck; reveal up to 1 {Heart
// Pirates} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_069_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP05-069",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_search",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<",
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Heart Pirates"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-070 Fra-Nosuke (Character)
// [DON!! x1] If you have 8 or more DON!! cards on your field, this Character
// gains [Rush].
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_070_FRA_NOSUKE: EffectSchema = {
  card_id: "OP05-070",
  card_name: "Fra-Nosuke",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      // _comment: "[DON!! x1] requirement — 1 DON must be attached to this Character
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-071 Bepo (Character)
// [When Attacking] If your opponent has more DON!! cards on their field than
// you, give up to 1 of your opponent's Characters -2000 power during this
// turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_071_BEPO: EffectSchema = {
  card_id: "OP05-071",
  card_name: "Bepo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<",
      },
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
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-072 Hone-Kichi (Character)
// [On Play] If you have 8 or more DON!! cards on your field, give up to 2 of
// your opponent's Characters -2000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_072_HONE_KICHI: EffectSchema = {
  card_id: "OP05-072",
  card_name: "Hone-Kichi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-073 Miss Doublefinger(Zala) (Character)
// [On Play] You may trash 1 card from your hand: Add up to 1 DON!! card from
// your DON!! deck and rest it.
// Trigger: [Trigger] DON!! -1 (You may return the specified number of DON!!
// cards from your field to your DON!! deck.): Play this card.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_073_MISS_DOUBLEFINGER: EffectSchema = {
  card_id: "OP05-073",
  card_name: "Miss Doublefinger(Zala)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_don_minus_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
      ],
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-074 Eustass"Captain"Kid (Character)
// [Blocker]
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to
// your DON!! deck, add up to 1 DON!! card from your DON!! deck and set it as
// active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_074_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "OP05-074",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-075 Mr.1(Daz.Bonez) (Character)
// [On Your Opponent's Attack] [Once Per Turn] DON!! -1 (You may return the
// specified number of DON!! cards from your field to your DON!! deck.): Play
// up to 1 {Baroque Works} type Character card with a cost of 3 or less from
// your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_075_MR_1: EffectSchema = {
  card_id: "OP05-075",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_play_card",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Baroque Works"],
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-076 When You're at Sea You Fight against Pirates!! (Event)
// [Main] Look at 3 cards from the top of your deck; reveal up to 1 {Straw Hat
// Crew}, {Kid Pirates}, or {Heart Pirates} type card and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.
// Trigger: [Trigger] Activate this card's [Main] effect.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_076_WHEN_YOURE_AT_SEA: EffectSchema = {
  card_id: "OP05-076",
  card_name: "When You're at Sea You Fight against Pirates!!",
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
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Straw Hat Crew", "Kid Pirates", "Heart Pirates"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "MAIN_EVENT" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-077 Gamma Knife (Event)
// [Main] DON!! -1: Give up to 1 of your opponent's Characters -5000 power
// during this turn.
// Trigger: [Trigger] Add up to 1 DON!! card from your DON!! deck and set it
// as active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_077_GAMMA_KNIFE: EffectSchema = {
  card_id: "OP05-077",
  card_name: "Gamma Knife",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -5000 },
          duration: { type: "THIS_TURN" },
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
// OP05-078 Punk Rotten (Event)
// [Main] DON!! -1: Up to 1 of your {Kid Pirates} type Leader or Character
// cards gains +5000 power during this turn.
// Trigger: [Trigger] Add up to 1 DON!! card from your DON!! deck and set it
// as active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_078_PUNK_ROTTEN: EffectSchema = {
  card_id: "OP05-078",
  card_name: "Punk Rotten",
  card_type: "Event",
  effects: [
    {
      id: "main_power_boost",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Kid Pirates"],
            },
          },
          params: { amount: 5000 },
          duration: { type: "THIS_TURN" },
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

// ─── OP05-079 Viola (Character) ────────────────────────────────────────────────
// [On Play] Your opponent places 3 cards from their trash at the bottom of
// their deck in any order.

export const OP05_079_VIOLA: EffectSchema = {
  card_id: "OP05-079",
  card_name: "Viola",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_return_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "RETURN_TO_DECK",
              target: {
                type: "CARD_IN_TRASH",
                controller: "OPPONENT",
                count: { exact: 3 },
              },
              params: { position: "BOTTOM" },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP05-080 Elizabello II (Character) ────────────────────────────────────────
// [When Attacking] [Once Per Turn] You may return 20 cards from your trash to
// your deck and shuffle it: This Character gains [Double Attack] and +10000
// power during this battle.

export const OP05_080_ELIZABELLO_II: EffectSchema = {
  card_id: "OP05-080",
  card_name: "Elizabello II",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_double_attack_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", once_per_turn: true },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 20 },
      ],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 10000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SHUFFLE_DECK",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-081 One-Legged Toy Soldier (Character) ──────────────────────────────
// [Activate: Main] You may trash this Character: Give up to 1 of your
// opponent's Characters −3 cost during this turn.

export const OP05_081_ONE_LEGGED_TOY_SOLDIER: EffectSchema = {
  card_id: "OP05-081",
  card_name: "One-Legged Toy Soldier",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_self_reduce_cost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_SELF" },
      ],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-082 Shirahoshi (Character) ───────────────────────────────────────────
// [Activate: Main] You may rest this Character and place 2 cards from your
// trash at the bottom of your deck in any order: If your opponent has 6 or more
// cards in their hand, your opponent trashes 1 card from their hand.

export const OP05_082_SHIRAHOSHI: EffectSchema = {
  card_id: "OP05-082",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "activate_opponent_discard",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 2, position: "BOTTOM" },
      ],
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-083 Sterry — Vanilla (skipped) ──────────────────────────────────────

// ─── OP05-084 Saint Charlos (Character) ────────────────────────────────────────
// [Your Turn] If the only Characters on your field are {Celestial Dragons} type
// Characters, give all of your opponent's Characters −4 cost.

export const OP05_084_SAINT_CHARLOS: EffectSchema = {
  card_id: "OP05-084",
  card_name: "Saint Charlos",
  card_type: "Character",
  effects: [
    {
      id: "permanent_opponent_cost_reduction",
      category: "permanent",
      // _comment: "[Your Turn] restriction — modifier only active during your turn
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { traits: ["Celestial Dragons"] },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -4 },
        },
      ],
    },
  ],
};

// ─── OP05-085 Nefeltari Cobra (Character) ──────────────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [On Play] Trash 1 card from the top of your deck.

export const OP05_085_NEFELTARI_COBRA: EffectSchema = {
  card_id: "OP05-085",
  card_name: "Nefeltari Cobra",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP05-086 Nefeltari Vivi (Character) ───────────────────────────────────────
// If you have 10 or more cards in your trash, this Character gains [Blocker].

export const OP05_086_NEFELTARI_VIVI: EffectSchema = {
  card_id: "OP05-086",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
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

// ─── OP05-087 Hakuba (Character) ───────────────────────────────────────────────
// [DON!! x1] [When Attacking] You may K.O. 1 of your Characters other than
// this Character: Give up to 1 of your opponent's Characters −5 cost during
// this turn.

export const OP05_087_HAKUBA: EffectSchema = {
  card_id: "OP05-087",
  card_name: "Hakuba",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko_own_reduce_cost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [
        {
          type: "KO_OWN_CHARACTER",
          amount: 1,
          filter: { exclude_self: true },
        },
      ],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -5 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-088 Mansherry (Character) ────────────────────────────────────────────
// [Activate: Main] ➀ (You may rest the specified number of DON!! cards in your
// cost area.) You may rest this Character and place 2 cards from your trash at
// the bottom of your deck in any order: Add up to 1 black Character card with a
// cost of 3 to 5 from your trash to your hand.

export const OP05_088_MANSHERRY: EffectSchema = {
  card_id: "OP05-088",
  card_name: "Mansherry",
  card_type: "Character",
  effects: [
    {
      id: "activate_recover_from_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "REST_SELF" },
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 2, position: "BOTTOM" },
      ],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "BLACK",
              card_type: "CHARACTER",
              cost_range: { min: 3, max: 5 },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-089 Saint Mjosgard (Character) ───────────────────────────────────────
// [Activate: Main] ➀ (You may rest the specified number of DON!! cards in your
// cost area.) You may rest this Character and 1 of your Characters: Add up to 1
// black Character card with a cost of 1 from your trash to your hand.

export const OP05_089_SAINT_MJOSGARD: EffectSchema = {
  card_id: "OP05-089",
  card_name: "Saint Mjosgard",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_recover_from_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "REST_SELF" },
        { type: "REST_CARDS", amount: 1 },
      ],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "BLACK",
              card_type: "CHARACTER",
              cost_exact: 1,
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-090 Riku Doldo III (Character) ───────────────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [On Play]/[On K.O.] Up to 1 of your {Dressrosa} type Characters gains +2000
// power during this turn.

export const OP05_090_RIKU_DOLDO_III: EffectSchema = {
  card_id: "OP05-090",
  card_name: "Riku Doldo III",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_or_ko_power_boost",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "ON_KO" },
        ],
      },
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
        },
      ],
    },
  ],
};

// ─── OP05-091 Rebecca (Character) ──────────────────────────────────────────────
// [Blocker]
// [On Play] Add up to 1 black Character card with a cost of 3 to 7 other than
// [Rebecca] from your trash to your hand. Then, play up to 1 black Character
// card with a cost of 3 or less from your hand rested.

export const OP05_091_REBECCA: EffectSchema = {
  card_id: "OP05-091",
  card_name: "Rebecca",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_recover_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "BLACK",
              card_type: "CHARACTER",
              cost_range: { min: 3, max: 7 },
              exclude_name: "Rebecca",
            },
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "BLACK",
              card_type: "CHARACTER",
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", entry_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP05-092 Saint Rosward (Character) ────────────────────────────────────────
// [Your Turn] If the only Characters on your field are {Celestial Dragons} type
// Characters, give all of your opponent's Characters −6 cost.

export const OP05_092_SAINT_ROSWARD: EffectSchema = {
  card_id: "OP05-092",
  card_name: "Saint Rosward",
  card_type: "Character",
  effects: [
    {
      id: "permanent_opponent_cost_reduction",
      category: "permanent",
      // _comment: "[Your Turn] restriction — modifier only active during your turn
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { traits: ["Celestial Dragons"] },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -6 },
        },
      ],
    },
  ],
};

// ─── OP05-093 Rob Lucci (Character) ────────────────────────────────────────────
// [On Play] You may place 3 cards from your trash at the bottom of your deck in
// any order: K.O. up to 1 of your opponent's Characters with a cost of 2 or
// less and up to 1 of your opponent's Characters with a cost of 1 or less.

export const OP05_093_ROB_LUCCI: EffectSchema = {
  card_id: "OP05-093",
  card_name: "Rob Lucci",
  card_type: "Character",
  effects: [
    {
      id: "on_play_double_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 3, position: "BOTTOM" },
      ],
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
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP05-094 Haute Couture Patch★Work (Event) ─────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters −3 cost during this turn.
// Then, up to 1 of your opponent's Characters with a cost of 0 will not become
// active in the next Refresh Phase.
// Trigger: [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP05_094_HAUTE_COUTURE_PATCHWORK: EffectSchema = {
  card_id: "OP05-094",
  card_name: "Haute Couture Patch★Work",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_reduction_and_freeze",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
          params: {
            prohibition_type: "CANNOT_REFRESH",
          },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw_and_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
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

// ─── OP05-095 Dragon Claw (Event) ──────────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, if you have 15 or more cards in your trash, K.O. up to 1
// of your opponent's Characters with a cost of 4 or less.

export const OP05_095_DRAGON_CLAW: EffectSchema = {
  card_id: "OP05-095",
  card_name: "Dragon Claw",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_ko",
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
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          conditions: {
            type: "TRASH_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 15,
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP05-096 I Bid 500 Million!! (Event) ──────────────────────────────────────
// [Main] Choose one:
// * K.O. up to 1 of your opponent's Characters with a cost of 1 or less.
// * Return up to 1 of your opponent's Characters with a cost of 1 or less to
//   the owner's hand.
// * Place up to 1 of your opponent's Characters with a cost of 1 or less at
//   the top or bottom of their Life cards face-up.
// Then, if you have a {Celestial Dragons} type Character, draw 1 card.
// Trigger: [Trigger] K.O. up to 1 of your opponent's Characters with a cost of
// 6 or less, or return it to the owner's hand.

export const OP05_096_I_BID_500_MILLION: EffectSchema = {
  card_id: "OP05-096",
  card_name: "I Bid 500 Million!!",
  card_type: "Event",
  effects: [
    {
      id: "main_choose_one_removal",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
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
              [
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
              [
                {
                  type: "ADD_TO_LIFE_FROM_FIELD",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 1 },
                  },
                  params: { face: "UP" },
                },
              ],
            ],
            labels: [
              "K.O. up to 1 of your opponent's Characters with cost 1 or less",
              "Return up to 1 of your opponent's Characters with cost 1 or less to hand",
              "Place up to 1 of your opponent's Characters with cost 1 or less to Life face-up",
            ],
          },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { traits: ["Celestial Dragons"], card_type: "CHARACTER" },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_ko_or_bounce",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 6 },
                  },
                },
              ],
              [
                {
                  type: "RETURN_TO_HAND",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 6 },
                  },
                },
              ],
            ],
            labels: [
              "K.O. up to 1 of your opponent's Characters with cost 6 or less",
              "Return up to 1 of your opponent's Characters with cost 6 or less to hand",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP05-097 Mary Geoise (Stage) ──────────────────────────────────────────────
// [Your Turn] The cost of playing {Celestial Dragons} type Character cards with
// a cost of 2 or more from your hand will be reduced by 1.

export const OP05_097_MARY_GEOISE: EffectSchema = {
  card_id: "OP05-097",
  card_name: "Mary Geoise",
  card_type: "Stage",
  effects: [
    {
      id: "permanent_play_cost_reduction",
      category: "permanent",
      // _comment: "[Your Turn] restriction — modifier only active during your turn. Applies to play cost of cards in hand.
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            filter: {
              traits: ["Celestial Dragons"],
              cost_min: 2,
            },
          },
          params: { amount: -1 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-098 Enel (Leader, Yellow)
// [Opponent's Turn] [Once Per Turn] When your number of Life cards becomes 0,
// add 1 card from the top of your deck to the top of your Life cards. Then,
// trash 1 card from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_098_ENEL: EffectSchema = {
  card_id: "OP05-098",
  card_name: "Enel",
  card_type: "Leader",
  effects: [
    {
      id: "life_zero_restore",
      category: "auto",
      trigger: {
        event: "LIFE_COUNT_BECOMES_ZERO",
        filter: { controller: "SELF" },
        turn_restriction: "OPPONENT_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-099 Amazon (Character)
// [On Your Opponent's Attack] You may rest this Character: Your opponent may
// trash 1 card from the top of their Life cards. If they do not, give up to 1
// of your opponent's Leader or Character cards −2000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_099_AMAZON: EffectSchema = {
  card_id: "OP05-099",
  card_name: "Amazon",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_choice",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            options: [
              [
                {
                  type: "TRASH_FROM_LIFE",
                  params: { amount: 1, position: "TOP", controller: "OPPONENT" },
                },
              ],
              [
                {
                  type: "MODIFY_POWER",
                  target: {
                    type: "LEADER_OR_CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                  },
                  params: { amount: -2000 },
                  duration: { type: "THIS_TURN" },
                },
              ],
            ],
            labels: ["Trash 1 from Life", "Receive -2000 power"],
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-100 Enel (Character)
// [Rush]
// [Once Per Turn] If this Character would leave the field, you may trash 1 card
// from the top of your Life cards instead. If there is a [Monkey.D.Luffy]
// Character, this effect is negated.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_100_ENEL: EffectSchema = {
  card_id: "OP05-100",
  card_name: "Enel",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "leave_field_replacement",
      category: "replacement",
      replaces: { event: "WOULD_LEAVE_FIELD" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "EITHER",
          filter: { name: "Monkey.D.Luffy", card_type: "CHARACTER" },
        },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-101 Ohm (Character)
// If you have 2 or less Life cards, this Character gains +1000 power.
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Holly]
// and add it to your hand. Then, place the rest at the bottom of your deck in
// any order and play up to 1 [Holly] from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_101_OHM: EffectSchema = {
  card_id: "OP05-101",
  card_name: "Ohm",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power_boost",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
    },
    {
      id: "on_play_search_holly",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { name: "Holly" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Holly" },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-102 Gedatsu (Character)
// [On Play] K.O. up to 1 of your opponent's Characters with a cost equal to or
// less than the number of your opponent's Life cards.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_102_GEDATSU: EffectSchema = {
  card_id: "OP05-102",
  card_name: "Gedatsu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_by_life_count",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: { type: "GAME_STATE", source: "OPPONENT_LIFE_COUNT" },
            },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-103 Kotori (Character)
// [On Play] If you have [Hotori], K.O. up to 1 of your opponent's Characters
// with a cost equal to or less than the number of your opponent's Life cards.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_103_KOTORI: EffectSchema = {
  card_id: "OP05-103",
  card_name: "Kotori",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_with_hotori",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Hotori" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: { type: "GAME_STATE", source: "OPPONENT_LIFE_COUNT" },
            },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-104 Conis (Character)
// [On Play] You may place 1 of your Stages at the bottom of your deck: Draw 1
// card and trash 1 card from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_104_CONIS: EffectSchema = {
  card_id: "OP05-104",
  card_name: "Conis",
  card_type: "Character",
  effects: [
    {
      id: "on_play_stage_cycle",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "PLACE_STAGE_TO_DECK", amount: 1, position: "BOTTOM" }],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-105 Holly — Vanilla (skipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-106 Shura (Character)
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Sky Island} type card other than [Shura] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// Trigger: [Trigger] Play this card.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_106_SHURA: EffectSchema = {
  card_id: "OP05-106",
  card_name: "Shura",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_sky_island",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Sky Island"], exclude_name: "Shura" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-107 Lieutenant Spacey (Character)
// [Your Turn] [Once Per Turn] When a card is added to your hand from your Life,
// this Character gains +2000 power during this turn.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_107_LIEUTENANT_SPACEY: EffectSchema = {
  card_id: "OP05-107",
  card_name: "Lieutenant Spacey",
  card_type: "Character",
  effects: [
    {
      id: "life_to_hand_power_boost",
      category: "auto",
      trigger: {
        event: "CARD_ADDED_TO_HAND_FROM_LIFE",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-108 Satori — Vanilla (skipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-109 Pagaya (Character)
// [Once Per Turn] When a [Trigger] activates, draw 2 cards and trash 2 cards
// from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_109_PAGAYA: EffectSchema = {
  card_id: "OP05-109",
  card_name: "Pagaya",
  card_type: "Character",
  effects: [
    {
      id: "trigger_activated_draw_trash",
      category: "auto",
      trigger: {
        event: "TRIGGER_ACTIVATED",
        once_per_turn: true,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-110 Gan Fall — Vanilla (skipped)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-111 Hotori (Character)
// [On Play] You may play 1 [Kotori] from your hand: Add up to 1 of your
// opponent's Characters with a cost of 3 or less to the top or bottom of your
// opponent's Life cards face-up.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_111_HOTORI: EffectSchema = {
  card_id: "OP05-111",
  card_name: "Hotori",
  card_type: "Character",
  effects: [
    {
      id: "on_play_kotori_add_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLAY_NAMED_CARD_FROM_HAND",
          filter: { name: "Kotori" },
        },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP" },
          // _comment: "Player chooses top or bottom of opponent's Life cards"
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-112 Captain McKinley (Character)
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [On K.O.] Play up to 1 {Sky Island} type Character card with a cost of 1
// from your hand.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_112_CAPTAIN_MCKINLEY: EffectSchema = {
  card_id: "OP05-112",
  card_name: "Captain McKinley",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_play_sky_island",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Sky Island"],
              card_type: "CHARACTER",
              cost_exact: 1,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-113 Yama (Character)
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_113_YAMA: EffectSchema = {
  card_id: "OP05-113",
  card_name: "Yama",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-114 El Thor (Event)
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if your opponent has 2 or less Life cards, that card gains
// an additional +2000 power during this battle.
// Trigger: [Trigger] K.O. up to 1 of your opponent's Characters with a cost
// equal to or less than the number of your opponent's Life cards.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_114_EL_THOR: EffectSchema = {
  card_id: "OP05-114",
  card_name: "El Thor",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
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
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          target_ref: "boosted_card",
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "trigger_ko_by_life_count",
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
              cost_max: { type: "GAME_STATE", source: "OPPONENT_LIFE_COUNT" },
            },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-115 Two-Hundred Million Volts Amaru (Event)
// [Main] Up to 1 of your Leader or Character cards gains +3000 power during
// this turn. Then, if you have 1 or less Life cards, rest up to 1 of your
// opponent's Characters with a cost of 4 or less.
// Trigger: [Trigger] You may trash 2 cards from your hand: Add up to 1 card
// from the top of your deck to the top of your Life cards.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_115_TWO_HUNDRED_MILLION_VOLTS_AMARU: EffectSchema = {
  card_id: "OP05-115",
  card_name: "Two-Hundred Million Volts Amaru",
  card_type: "Event",
  effects: [
    {
      id: "main_power_boost_and_rest",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 1,
          },
        },
      ],
    },
    {
      id: "trigger_add_to_life",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-116 Hino Bird Zap (Event)
// [Main] K.O. up to 1 of your opponent's Characters with a cost equal to or
// less than the number of your opponent's Life cards.
// Trigger: [Trigger] Activate this card's [Main] effect.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_116_HINO_BIRD_ZAP: EffectSchema = {
  card_id: "OP05-116",
  card_name: "Hino Bird Zap",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_by_life_count",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: { type: "GAME_STATE", source: "OPPONENT_LIFE_COUNT" },
            },
          },
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "main_ko_by_life_count" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-117 Upper Yard (Stage)
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Sky Island} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_117_UPPER_YARD: EffectSchema = {
  card_id: "OP05-117",
  card_name: "Upper Yard",
  card_type: "Stage",
  effects: [
    {
      id: "on_play_search_sky_island",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Sky Island"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-118 Kaido (Character, Blue — Secret Rare)
// [On Play] Draw 4 cards if your opponent has 3 or less Life cards.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_118_KAIDO: EffectSchema = {
  card_id: "OP05-118",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_draw_4",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 4 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP05-119 Monkey.D.Luffy (Character, Purple — Secret Rare)
// [On Play] DON!! -10: Place all of your Characters except this Character at
// the bottom of your deck in any order. Then, take an extra turn after this
// one.
// [Activate: Main] [Once Per Turn] ➀: Add up to 1 DON!! card from your DON!!
// deck and set it as active.
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_119_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP05-119",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_minus_return_extra_turn",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "DON_MINUS", amount: 10 },
      ],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { exclude_self: true },
          },
          params: { position: "BOTTOM" },
        },
        {
          type: "EXTRA_TURN",
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "activate_don_rest_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
      ],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Combined OP05 Schemas Export
// ═══════════════════════════════════════════════════════════════════════════════

export const OP05_SCHEMAS: Record<string, EffectSchema> = {
  [OP05_001_SABO.card_id!]: OP05_001_SABO,
  [OP05_002_BELO_BETTY.card_id!]: OP05_002_BELO_BETTY,
  [OP05_003_INAZUMA.card_id!]: OP05_003_INAZUMA,
  [OP05_004_EMPORIO_IVANKOV.card_id!]: OP05_004_EMPORIO_IVANKOV,
  [OP05_005_KARASU.card_id!]: OP05_005_KARASU,
  [OP05_006_KOALA.card_id!]: OP05_006_KOALA,
  [OP05_007_SABO.card_id!]: OP05_007_SABO,
  [OP05_008_CHAKA.card_id!]: OP05_008_CHAKA,
  [OP05_009_TOH_TOH.card_id!]: OP05_009_TOH_TOH,
  [OP05_010_NICO_ROBIN.card_id!]: OP05_010_NICO_ROBIN,
  [OP05_011_BARTHOLOMEW_KUMA.card_id!]: OP05_011_BARTHOLOMEW_KUMA,
  [OP05_013_BUNNY_JOE.card_id!]: OP05_013_BUNNY_JOE,
  [OP05_014_PELL.card_id!]: OP05_014_PELL,
  [OP05_015_BELO_BETTY.card_id!]: OP05_015_BELO_BETTY,
  [OP05_016_MORLEY.card_id!]: OP05_016_MORLEY,
  [OP05_017_LINDBERGH.card_id!]: OP05_017_LINDBERGH,
  [OP05_018_EMPORIO_ENERGY_HORMONE.card_id!]: OP05_018_EMPORIO_ENERGY_HORMONE,
  [OP05_019_FIRE_FIST.card_id!]: OP05_019_FIRE_FIST,
  [OP05_020_FOUR_THOUSAND_BRICK_FIST.card_id!]: OP05_020_FOUR_THOUSAND_BRICK_FIST,
  [OP05_021_REVOLUTIONARY_ARMY_HQ.card_id!]: OP05_021_REVOLUTIONARY_ARMY_HQ,
  [OP05_022_DONQUIXOTE_ROSINANTE.card_id!]: OP05_022_DONQUIXOTE_ROSINANTE,
  [OP05_023_VERGO.card_id!]: OP05_023_VERGO,
  [OP05_024_KUWEEN.card_id!]: OP05_024_KUWEEN,
  [OP05_025_GLADIUS.card_id!]: OP05_025_GLADIUS,
  [OP05_026_SARQUISS.card_id!]: OP05_026_SARQUISS,
  [OP05_027_TRAFALGAR_LAW.card_id!]: OP05_027_TRAFALGAR_LAW,
  [OP05_028_DONQUIXOTE_DOFLAMINGO.card_id!]: OP05_028_DONQUIXOTE_DOFLAMINGO,
  [OP05_029_DONQUIXOTE_DOFLAMINGO.card_id!]: OP05_029_DONQUIXOTE_DOFLAMINGO,
  [OP05_030_DONQUIXOTE_ROSINANTE.card_id!]: OP05_030_DONQUIXOTE_ROSINANTE,
  [OP05_031_BUFFALO.card_id!]: OP05_031_BUFFALO,
  [OP05_032_PICA.card_id!]: OP05_032_PICA,
  [OP05_033_BABY_5.card_id!]: OP05_033_BABY_5,
  [OP05_034_BABY_5.card_id!]: OP05_034_BABY_5,
  [OP05_036_MONET.card_id!]: OP05_036_MONET,
  [OP05_037_BECAUSE_THE_SIDE_OF_JUSTICE.card_id!]: OP05_037_BECAUSE_THE_SIDE_OF_JUSTICE,
  [OP05_038_CHARLESTONE.card_id!]: OP05_038_CHARLESTONE,
  [OP05_039_STICK_STICKEM_METEORA.card_id!]: OP05_039_STICK_STICKEM_METEORA,
  [OP05_040_BIRDCAGE.card_id!]: OP05_040_BIRDCAGE,
  [OP05_041_SAKAZUKI.card_id!]: OP05_041_SAKAZUKI,
  [OP05_042_ISSHO.card_id!]: OP05_042_ISSHO,
  [OP05_043_ULTI.card_id!]: OP05_043_ULTI,
  [OP05_045_STAINLESS.card_id!]: OP05_045_STAINLESS,
  [OP05_046_DALMATIAN.card_id!]: OP05_046_DALMATIAN,
  [OP05_047_BASIL_HAWKINS.card_id!]: OP05_047_BASIL_HAWKINS,
  [OP05_048_BASTILLE.card_id!]: OP05_048_BASTILLE,
  [OP05_049_HACCHA.card_id!]: OP05_049_HACCHA,
  [OP05_050_HINA.card_id!]: OP05_050_HINA,
  [OP05_051_BORSALINO.card_id!]: OP05_051_BORSALINO,
  [OP05_052_MAYNARD.card_id!]: OP05_052_MAYNARD,
  [OP05_053_MOZAMBIA.card_id!]: OP05_053_MOZAMBIA,
  [OP05_054_MONKEY_D_GARP.card_id!]: OP05_054_MONKEY_D_GARP,
  [OP05_055_X_DRAKE.card_id!]: OP05_055_X_DRAKE,
  [OP05_056_X_BARRELS.card_id!]: OP05_056_X_BARRELS,
  [OP05_057_HOUND_BLAZE.card_id!]: OP05_057_HOUND_BLAZE,
  [OP05_058_WASTE_OF_HUMAN_LIFE.card_id!]: OP05_058_WASTE_OF_HUMAN_LIFE,
  [OP05_059_WORLD_OF_VIOLENCE.card_id!]: OP05_059_WORLD_OF_VIOLENCE,
  [OP05_060_MONKEY_D_LUFFY.card_id!]: OP05_060_MONKEY_D_LUFFY,
  [OP05_061_USO_HACHI.card_id!]: OP05_061_USO_HACHI,
  [OP05_062_O_NAMI.card_id!]: OP05_062_O_NAMI,
  [OP05_063_O_ROBI.card_id!]: OP05_063_O_ROBI,
  [OP05_064_KILLER.card_id!]: OP05_064_KILLER,
  [OP05_066_JINBE.card_id!]: OP05_066_JINBE,
  [OP05_067_ZORO_JUUROU.card_id!]: OP05_067_ZORO_JUUROU,
  [OP05_068_CHOPA_EMON.card_id!]: OP05_068_CHOPA_EMON,
  [OP05_069_TRAFALGAR_LAW.card_id!]: OP05_069_TRAFALGAR_LAW,
  [OP05_070_FRA_NOSUKE.card_id!]: OP05_070_FRA_NOSUKE,
  [OP05_071_BEPO.card_id!]: OP05_071_BEPO,
  [OP05_072_HONE_KICHI.card_id!]: OP05_072_HONE_KICHI,
  [OP05_073_MISS_DOUBLEFINGER.card_id!]: OP05_073_MISS_DOUBLEFINGER,
  [OP05_074_EUSTASS_CAPTAIN_KID.card_id!]: OP05_074_EUSTASS_CAPTAIN_KID,
  [OP05_075_MR_1.card_id!]: OP05_075_MR_1,
  [OP05_076_WHEN_YOURE_AT_SEA.card_id!]: OP05_076_WHEN_YOURE_AT_SEA,
  [OP05_077_GAMMA_KNIFE.card_id!]: OP05_077_GAMMA_KNIFE,
  [OP05_078_PUNK_ROTTEN.card_id!]: OP05_078_PUNK_ROTTEN,
  [OP05_079_VIOLA.card_id!]: OP05_079_VIOLA,
  [OP05_080_ELIZABELLO_II.card_id!]: OP05_080_ELIZABELLO_II,
  [OP05_081_ONE_LEGGED_TOY_SOLDIER.card_id!]: OP05_081_ONE_LEGGED_TOY_SOLDIER,
  [OP05_082_SHIRAHOSHI.card_id!]: OP05_082_SHIRAHOSHI,
  [OP05_084_SAINT_CHARLOS.card_id!]: OP05_084_SAINT_CHARLOS,
  [OP05_085_NEFELTARI_COBRA.card_id!]: OP05_085_NEFELTARI_COBRA,
  [OP05_086_NEFELTARI_VIVI.card_id!]: OP05_086_NEFELTARI_VIVI,
  [OP05_087_HAKUBA.card_id!]: OP05_087_HAKUBA,
  [OP05_088_MANSHERRY.card_id!]: OP05_088_MANSHERRY,
  [OP05_089_SAINT_MJOSGARD.card_id!]: OP05_089_SAINT_MJOSGARD,
  [OP05_090_RIKU_DOLDO_III.card_id!]: OP05_090_RIKU_DOLDO_III,
  [OP05_091_REBECCA.card_id!]: OP05_091_REBECCA,
  [OP05_092_SAINT_ROSWARD.card_id!]: OP05_092_SAINT_ROSWARD,
  [OP05_093_ROB_LUCCI.card_id!]: OP05_093_ROB_LUCCI,
  [OP05_094_HAUTE_COUTURE_PATCHWORK.card_id!]: OP05_094_HAUTE_COUTURE_PATCHWORK,
  [OP05_095_DRAGON_CLAW.card_id!]: OP05_095_DRAGON_CLAW,
  [OP05_096_I_BID_500_MILLION.card_id!]: OP05_096_I_BID_500_MILLION,
  [OP05_097_MARY_GEOISE.card_id!]: OP05_097_MARY_GEOISE,
  [OP05_098_ENEL.card_id!]: OP05_098_ENEL,
  [OP05_099_AMAZON.card_id!]: OP05_099_AMAZON,
  [OP05_100_ENEL.card_id!]: OP05_100_ENEL,
  [OP05_101_OHM.card_id!]: OP05_101_OHM,
  [OP05_102_GEDATSU.card_id!]: OP05_102_GEDATSU,
  [OP05_103_KOTORI.card_id!]: OP05_103_KOTORI,
  [OP05_104_CONIS.card_id!]: OP05_104_CONIS,
  [OP05_106_SHURA.card_id!]: OP05_106_SHURA,
  [OP05_107_LIEUTENANT_SPACEY.card_id!]: OP05_107_LIEUTENANT_SPACEY,
  [OP05_109_PAGAYA.card_id!]: OP05_109_PAGAYA,
  [OP05_111_HOTORI.card_id!]: OP05_111_HOTORI,
  [OP05_112_CAPTAIN_MCKINLEY.card_id!]: OP05_112_CAPTAIN_MCKINLEY,
  [OP05_113_YAMA.card_id!]: OP05_113_YAMA,
  [OP05_114_EL_THOR.card_id!]: OP05_114_EL_THOR,
  [OP05_115_TWO_HUNDRED_MILLION_VOLTS_AMARU.card_id!]: OP05_115_TWO_HUNDRED_MILLION_VOLTS_AMARU,
  [OP05_116_HINO_BIRD_ZAP.card_id!]: OP05_116_HINO_BIRD_ZAP,
  [OP05_117_UPPER_YARD.card_id!]: OP05_117_UPPER_YARD,
  [OP05_118_KAIDO.card_id!]: OP05_118_KAIDO,
  [OP05_119_MONKEY_D_LUFFY.card_id!]: OP05_119_MONKEY_D_LUFFY,
};
