/**
 * P (Promo) Effect Schemas
 *
 * Red: P-001 to P-101 (19 cards)
 * Green: P-003 to P-111 (18 cards)
 * Blue: P-004 to P-117 (27 cards, includes P-076 Blue/Black)
 * Purple: P-005 to P-107 (11 cards)
 * Black: P-025 to P-105 (8 cards)
 * Yellow: P-034 to P-115 (8 cards)
 *
 * Deferred: P-106 End of Turn effect (LIFE_FACE_COST)
 * Truncated text: P-025, P-052, P-054 (attribute name missing)
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Promo Cards (P-001 to P-101)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── P-001 Monkey.D.Luffy (Character) — DON!!x2 Rush
// [DON!! x2] This Character gains [Rush].

export const P_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "don_rush",
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
  ],
};

// ─── P-002 I Smell Adventure!!! (Event) — return hand to deck, shuffle, draw equal
// [Main] Return all cards in your hand to your deck and shuffle your deck. Then, draw cards equal to the number you returned to your deck.
// [Trigger] Activate this card's [Main] effect.

export const P_002_I_SMELL_ADVENTURE: EffectSchema = {
  card_id: "P-002",
  card_name: "I Smell Adventure!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_return_and_draw",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_HAND_TO_DECK",
          params: { position: "BOTTOM" },
          result_ref: "returned_count",
        },
        {
          type: "SHUFFLE_DECK",
          chain: "AND",
        },
        {
          type: "DRAW",
          params: { amount: { type: "ACTION_RESULT", ref: "returned_count" } },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Promo Cards (P-003 to P-111)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── P-003 Eustass"Captain"Kid (Character) — DON!!x2 Double Attack
// [DON!! x2] This Character gains [Double Attack].

export const P_003_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "P-003",
  card_name: 'Eustass"Captain"Kid',
  card_type: "Character",
  effects: [
    {
      id: "don_double_attack",
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
          params: { keyword: "DOUBLE_ATTACK" },
        },
      ],
    },
  ],
};

// ─── P-004 Crocodile (Character) — DON!!x1 Blocker
// [DON!! x1] This Character gains [Blocker].

export const P_004_CROCODILE: EffectSchema = {
  card_id: "P-004",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "don_blocker",
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
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── P-005 Kaido (Character) — Activate:Main DON!!-2 gain Banish this turn
// [Activate: Main] DON!! -2: This Character gains [Banish] during this turn.

export const P_005_KAIDO: EffectSchema = {
  card_id: "P-005",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "activate_banish",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── P-006 Monkey.D.Luffy (Character) — DON!!x2 Your Turn +2000
// [DON!! x2] [Your Turn] This Character gains +2000 power.
// NOTE: [Your Turn] scoped — only active during your turn

export const P_006_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-006",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "don_your_turn_power",
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
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
  ],
};

// ─── P-007 Monkey.D.Luffy (Character) — DON!!x1 cannot be KO'd in battle by Strike attribute
// [DON!! x1] This Character cannot be K.O.'d in battle by <Strike> attribute Leaders or Characters.

export const P_007_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-007",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "don_ko_protection_strike",
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
          scope: { cause: "BATTLE", source_filter: { attribute: "STRIKE" } },
        },
      ],
    },
  ],
};

// ─── P-008 Yamato (Character) — Activate:Main rest self to rest opponent
// [Activate: Main] You may rest this Character: Rest 1 of your opponent's Characters with a cost of 2 or less.

export const P_008_YAMATO: EffectSchema = {
  card_id: "P-008",
  card_name: "Yamato",
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
            count: { exact: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-009 Trafalgar Law (Character) — On Play opponent life to hand
// [On Play] If your opponent has 6 or more cards in their hand, your opponent adds 1 card from their Life area to their hand.

export const P_009_TRAFALGAR_LAW: EffectSchema = {
  card_id: "P-009",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_life_to_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "LIFE_TO_HAND",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── P-010 Kaido (Character) — End of Your Turn add 1 active DON
// [End of Your Turn] Add 1 DON!! card from your DON!! deck and set it as active.

export const P_010_KAIDO: EffectSchema = {
  card_id: "P-010",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "eot_add_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── P-011 Uta (Leader) — Activate Main Once Per Turn rest 1 DON: +2000 to no-base-effect Character
// [Activate: Main] [Once Per Turn] ①: Up to 1 of your Characters with no base effect gains +2000 power during this turn.

export const P_011_UTA: EffectSchema = {
  card_id: "P-011",
  card_name: "Uta",
  card_type: "Leader",
  effects: [
    {
      id: "activate_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { no_base_effect: true },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── P-013 Gordon (Character) — Activate Main place self to deck bottom: opponent -3000
// [Activate: Main] You may place this Character at the bottom of the owner's deck: Give up to 1 of your opponent's Characters -3000 power during this turn.

export const P_013_GORDON: EffectSchema = {
  card_id: "P-013",
  card_name: "Gordon",
  card_type: "Character",
  effects: [
    {
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "PLACE_OWN_CHARACTER_TO_DECK", position: "BOTTOM" }],
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
      flags: { optional: true },
    },
  ],
};

// ─── P-014 Koby (Character) — Blocker + Trigger play self
// [Blocker]
// [Trigger] Play this card.

export const P_014_KOBY: EffectSchema = {
  card_id: "P-014",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── P-017 Trafalgar Law (Character) — On Play opponent -2000
// [On Play] Give up to 1 of your opponent's Characters -2000 power during this turn.

export const P_017_TRAFALGAR_LAW: EffectSchema = {
  card_id: "P-017",
  card_name: "Trafalgar Law",
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
  ],
};

// ─── P-018 Bartolomeo (Character) — Blocker
// [Blocker]

export const P_018_BARTOLOMEO: EffectSchema = {
  card_id: "P-018",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── P-019 Bepo (Character) — DON!!x1 When Attacking KO 3000 or less
// [DON!! x1] [When Attacking] K.O. up to 1 of your opponent's Characters with 3000 power or less.

export const P_019_BEPO: EffectSchema = {
  card_id: "P-019",
  card_name: "Bepo",
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
            filter: { power_max: 3000 },
          },
        },
      ],
    },
  ],
};

// ─── P-020 Helmeppo (Character) — On Play +1000 to Leader or Character
// [On Play] Up to 1 of your Leader or Character cards gains +1000 power during this turn.

export const P_020_HELMEPPO: EffectSchema = {
  card_id: "P-020",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_power_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── P-024 I'm Gonna Be King of the Pirates!! (Event) — Main dynamic power + Trigger power
// [Main] Your Leader gains +1000 power for each of your Characters during this turn.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.

export const P_024_IM_GONNA_BE_KING_OF_THE_PIRATES: EffectSchema = {
  card_id: "P-024",
  card_name: "I'm Gonna Be King of the Pirates!!",
  card_type: "Event",
  effects: [
    {
      id: "main_dynamic_power",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "MATCHING_CHARACTERS_ON_FIELD",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_TURN" },
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

// ─── P-025 Smoker (Character) — DON!!x1 cannot be KO'd in battle (truncated attribute)
// [DON!! x1] This Character cannot be K.O.'d in battle by Characters without the  attribute.
// Truncated: attribute name missing from source text

export const P_025_SMOKER: EffectSchema = {
  card_id: "P-025",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "don_cannot_be_ko_in_battle",
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
          // Truncated: attribute name missing — source_filter for attribute cannot be encoded
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
  ],
};

// ─── P-026 Morgan (Character) — When Attacking give opponent -3 cost
// [When Attacking] Give up to 1 of your opponent's Characters -3 cost during this turn.

export const P_026_MORGAN: EffectSchema = {
  card_id: "P-026",
  card_name: "Morgan",
  card_type: "Character",
  effects: [
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
          params: { amount: -3 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── P-027 General Franky (Character) — Name alias [Franky] + Opponent's Turn aura +1000
// Also treat this card's name as [Franky] according to the rules.
// [Opponent's Turn] All of your Characters with 3000 base power or less gain +1000 power.
// NOTE: [Opponent's Turn] scoped — only active during opponent's turn

export const P_027_GENERAL_FRANKY: EffectSchema = {
  card_id: "P-027",
  card_name: "General Franky",
  card_type: "Character",
  effects: [
    {
      id: "name_alias",
      category: "rule_modification",
      rule: {
        rule_type: "NAME_ALIAS",
        aliases: ["Franky"],
      },
      zone: "ANY",
    },
    {
      // NOTE: [Opponent's Turn] scoped — only active during opponent's turn
      id: "opponent_turn_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { base_power_max: 3000 },
          },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── P-028 Portgas.D.Ace (Character) — Double Attack
// [Double Attack]

export const P_028_PORTGAS_D_ACE: EffectSchema = {
  card_id: "P-028",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "double_attack",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
  ],
};

// ─── P-029 Bartolomeo (Character) — End of Turn rest self to set active FILM Character
// [End of Your Turn] You may rest this Character: Set up to 1 of your {FILM} type Characters other than [Bartolomeo] as active.

export const P_029_BARTOLOMEO: EffectSchema = {
  card_id: "P-029",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "eot_set_active_film",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["FILM"], exclude_name: "Bartolomeo" },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-030 Jinbe (Character) — On K.O. bottom deck a Character
// [On K.O.] Place up to 1 Character with a cost of 3 or less at the bottom of the owner's deck.

export const P_030_JINBE: EffectSchema = {
  card_id: "P-030",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_return_to_deck",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── P-031 Uta (Character) — On Play add up to 1 rested DON
// [On Play] Add up to 1 DON!! card from your DON!! deck and rest it.

export const P_031_UTA: EffectSchema = {
  card_id: "P-031",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── P-032 Sengoku (Character) — DON!!x1 Your Turn aura: all opponent Characters -2 cost
// [DON!! x1] [Your Turn] Give all of your opponent's Characters -2 cost.
// NOTE: [Your Turn] scoped — only active during your turn

export const P_032_SENGOKU: EffectSchema = {
  card_id: "P-032",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "don_your_turn_reduce_cost_aura",
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
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -2 },
        },
      ],
    },
  ],
};

// ─── P-033 Monkey.D.Luffy (Character) — Activate place self to deck, draw
// [Activate: Main] You may place this Character at the bottom of the owner's deck: Draw 1 card.

export const P_033_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-033",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "activate_self_to_deck_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "PLACE_OWN_CHARACTER_TO_DECK", position: "BOTTOM" }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-034 Sanji (Character) — DON!!x1 Your Turn +2000 if 2 or less life
// [DON!! x1] [Your Turn] If you have 2 or less Life cards, this Character gains +2000 power.
// NOTE: [Your Turn] scoped — only active during your turn

export const P_034_SANJI: EffectSchema = {
  card_id: "P-034",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "don_your_turn_life_power",
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
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
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

// ─── P-035 Monkey.D.Luffy (Character) — DON!!x1 When Attacking trash from hand: KO cost 0
// [DON!! x1] [When Attacking] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 0.

export const P_035_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-035",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_trash_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-036 Monkey.D.Luffy (Character) — When Attacking life cost for +1000 to self and leader
// [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: This Character and up to 1 of your Leader gain +1000 power during this turn.

export const P_036_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-036",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_life_cost_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── P-037 Monkey.D.Luffy (Character) — When Attacking conditional +1000
// [When Attacking] If you have 2 or more rested Characters, this Character gains +1000 power during this turn.

export const P_037_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-037",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_conditional_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
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

// ─── P-039 Bellamy (Character) — Banish + DON!!x2 +2000 if 0 life
// [Banish]
// [DON!! x2] If you have 0 Life cards, this Character gains +2000 power.

export const P_039_BELLAMY: EffectSchema = {
  card_id: "P-039",
  card_name: "Bellamy",
  card_type: "Character",
  effects: [
    {
      id: "banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
    {
      id: "don_zero_life_power",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "SPECIFIC_CARD",
            operator: ">=",
            value: 2,
          },
          {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 0,
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

// ─── P-043 Monkey.D.Luffy (Character) — On Play bounce cost 3 or less
// [On Play] Return up to 1 Character with a cost of 3 or less to the owner's hand.

export const P_043_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-043",
  card_name: "Monkey.D.Luffy",
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
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── P-044 Sabo (Character) — DON!!x1 + hand count <=4 -> +2000 power
// [DON!! x1] If you have 4 or less cards in your hand, this Character gains +2000 power.

export const P_044_SABO: EffectSchema = {
  card_id: "P-044",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "don_hand_count_power",
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
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 4,
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

// ─── P-045 Roronoa Zoro (Character) — Banish
// [Banish]

export const P_045_RORONOA_ZORO: EffectSchema = {
  card_id: "P-045",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
  ],
};

// ─── P-046 Yamato (Character) — On Play place all hand to bottom, draw equal
// [On Play] You may place all cards in your hand at the bottom of your deck in any order. If you do, draw cards equal to the number you placed at the bottom of your deck.

export const P_046_YAMATO: EffectSchema = {
  card_id: "P-046",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "on_play_hand_cycle",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_HAND_TO_DECK",
          params: { position: "BOTTOM" },
          result_ref: "placed_count",
        },
        {
          type: "DRAW",
          params: { amount: { type: "ACTION_RESULT", ref: "placed_count" } },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── P-047 Monkey.D.Luffy (Leader) — DON!!x1 When Attacking conditional draw
// [DON!! x1] [When Attacking] Draw 1 card if you have 3 or less cards in your hand.

export const P_047_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-047",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_conditional_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── P-048 Arlong (Character) — DON!!x1 When Attacking opponent places hand to deck
// [DON!! x1] [When Attacking] If you have 4 or more Life cards, your opponent places 1 card from their hand at the bottom of their deck.

export const P_048_ARLONG: EffectSchema = {
  card_id: "P-048",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_opponent_hand_to_deck",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 4,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "PLACE_HAND_TO_DECK",
              params: { amount: 1, position: "BOTTOM" },
            },
          },
        },
      ],
    },
  ],
};

// ─── P-049 Usopp (Character) — On Play Deck Scry 5
// [On Play] Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.

export const P_049_USOPP: EffectSchema = {
  card_id: "P-049",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DECK_SCRY", params: { look_at: 5 } },
      ],
    },
  ],
};

// ─── P-050 Sanji (Character) — Blocker + DON!!x1 Your Turn conditional +4000
// [Blocker]
// [DON!! x1] [Your Turn] If you have 3 or less cards in your hand, this Character gains +4000 power.
// NOTE: [Your Turn] scoped — only active during your turn

export const P_050_SANJI: EffectSchema = {
  card_id: "P-050",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "don_your_turn_power_boost",
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
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 3,
          },
        ],
      },
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

// ─── P-051 Shanks (Character) — When Attacking trash any number for power
// [When Attacking] You may trash any number of cards from your hand. This Character gains +1000 power during this battle for every card trashed.

export const P_051_SHANKS: EffectSchema = {
  card_id: "P-051",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_trash_for_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: "ANY_NUMBER" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_TRASHED_THIS_WAY",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-052 Dracule Mihawk (Character) — DON!!x1 cannot be KO'd by attribute (truncated)
// [DON!! x1] This Character cannot be K.O.'d in battle by  attribute cards.
// Truncated: attribute name missing from source text

export const P_052_DRACULE_MIHAWK: EffectSchema = {
  card_id: "P-052",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "don_battle_ko_protection",
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
          // Truncated: attribute name missing — source_filter cannot be encoded
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
  ],
};

// ─── P-053 Nami (Character) — On Play conditional bounce opponent's character
// [On Play] If you have 3 or less cards in your hand, return up to 1 of your opponent's Characters with a cost of 3 or less to the owner's hand.

export const P_053_NAMI: EffectSchema = {
  card_id: "P-053",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── P-054 Monkey.D.Garp (Character) — DON!!x1 cannot be KO'd by attribute (truncated)
// [DON!! x1] This Character cannot be K.O.'d in battle by  attribute cards.
// Truncated: attribute name missing from source text

export const P_054_MONKEY_D_GARP: EffectSchema = {
  card_id: "P-054",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "don_battle_ko_protection",
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
          // Truncated: attribute name missing — source_filter cannot be encoded
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
  ],
};

// ─── P-055 Monkey.D.Luffy (Character) — On Play trash 2 from hand, opponent bottom decks
// [On Play] You may trash 2 cards from your hand: Your opponent places 1 of their Characters at the bottom of the owner's deck.

export const P_055_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-055",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_to_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "RETURN_TO_DECK",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { exact: 1 },
              },
              params: { position: "BOTTOM" },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-056 Roronoa Zoro (Character) — On Play DON rest 2, bounce cost 5 or less
// [On Play] ②: Return up to 1 Character with a cost of 5 or less to the owner's hand.

export const P_056_RORONOA_ZORO: EffectSchema = {
  card_id: "P-056",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_rest_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 2 }],
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

// ─── P-057 Fleeting Lullaby (Event) — Main skip refresh + Trigger reuse
// [Main] If your Leader is [Uta], up to 2 of your opponent's rested Characters with a cost of 4 or less will not become active in your opponent's next Refresh Phase.
// [Trigger] Activate this card's [Main] effect.

export const P_057_FLEETING_LULLABY: EffectSchema = {
  card_id: "P-057",
  card_name: "Fleeting Lullaby",
  card_type: "Event",
  effects: [
    {
      id: "main_skip_refresh",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Uta" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 4, is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── P-058 Where the Wind Blows (Event) — Main schedule set active FILM + Trigger set active
// [Main] If your Leader is [Uta], set all of your {FILM} type Characters as active at the end of this turn.
// [Trigger] Set all of your {FILM} type Characters as active.

export const P_058_WHERE_THE_WIND_BLOWS: EffectSchema = {
  card_id: "P-058",
  card_name: "Where the Wind Blows",
  card_type: "Event",
  effects: [
    {
      id: "main_schedule_set_active",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Uta" },
      },
      actions: [
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_ACTIVE",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { all: true },
                filter: { traits: ["FILM"] },
              },
            },
          },
        },
      ],
    },
    {
      id: "trigger_set_active_film",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["FILM"] },
          },
        },
      ],
    },
  ],
};

// ─── P-059 The World's Continuation (Event) — Counter bounce own + dynamic power
// [Counter] If your Leader is [Uta], you may return any number of Characters on your field to the owner's hand. Up to 1 of your Leader or Character cards gains +2000 power during this battle for every returned Character.

export const P_059_THE_WORLDS_CONTINUATION: EffectSchema = {
  card_id: "P-059",
  card_name: "The World's Continuation",
  card_type: "Event",
  effects: [
    {
      id: "counter_bounce_and_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Uta" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { any_number: true },
          },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CHARACTERS_RETURNED_THIS_WAY",
              multiplier: 2000,
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-060 Tot Musica (Event) — Main rest Uta to rest opponent DON
// [Main] You may rest 1 of your [Uta] cards: Rest up to 2 of your opponent's DON!! cards.

export const P_060_TOT_MUSICA: EffectSchema = {
  card_id: "P-060",
  card_name: "Tot Musica",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_opponent_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_NAMED_CARD", filter: { name: "Uta" }, amount: 1 }],
      actions: [
        {
          type: "REST_OPPONENT_DON",
          params: { amount: 2 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-062 Hody & Hyouzou (Character) — Activate:Main once per turn rest + power + life to hand
// [Activate: Main] [Once Per Turn] Rest up to 1 of your opponent's Characters with a cost of 4 or less and this Character gains +1000 power during this turn. Then, add 1 card from the top of your Life cards to your hand.

export const P_062_HODY_AND_HYOUZOU: EffectSchema = {
  card_id: "P-062",
  card_name: "Hody & Hyouzou",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_power_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
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
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
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

// ─── P-063 Jinbe (Character) — On Play rest opponent cost 1 or less
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 1 or less.

export const P_063_JINBE: EffectSchema = {
  card_id: "P-063",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_opponent",
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

// ─── P-065 Tony Tony.Chopper (Character) — When Attacking conditional +2000 power
// [When Attacking] If your opponent has a Character with a cost of 0, this Character gains +2000 power until the start of your next turn.

export const P_065_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "P-065",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_conditional_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { cost_exact: 0, card_type: "CHARACTER" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── P-068 Sanji (Character) — Activate trash self, scry 5
// [Activate: Main] You may trash this Character: Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.

export const P_068_SANJI: EffectSchema = {
  card_id: "P-068",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_self_scry",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        { type: "DECK_SCRY", params: { look_at: 5 } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-069 Koala (Character) — Activate Main Once Per Turn give rested DON
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const P_069_KOALA: EffectSchema = {
  card_id: "P-069",
  card_name: "Koala",
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

// ─── P-070 Carrot (Character) — Blocker
// [Blocker]

export const P_070_CARROT: EffectSchema = {
  card_id: "P-070",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── P-071 Marco (Character) — On K.O. return self to hand
// [On K.O.] You may add this Character card to your hand.

export const P_071_MARCO: EffectSchema = {
  card_id: "P-071",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_return_self_to_hand",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-072 Ryuma (Character) — On Play / On K.O. rest opponent cost 4 or less
// [On Play]/[On K.O.] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const P_072_RYUMA: EffectSchema = {
  card_id: "P-072",
  card_name: "Ryuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_rest_opponent",
      category: "auto",
      trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "ON_KO" }] },
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

// ─── P-073 Sabo (Character) — Activate:Main once per turn life cost +1000
// [Activate: Main] [Once Per Turn] You may add 1 card from the top or bottom of your Life cards to your hand: This Character gains +1000 power during this turn.

export const P_073_SABO: EffectSchema = {
  card_id: "P-073",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "activate_life_cost_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
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

// ─── P-074 Portgas.D.Ace (Character) — Activate return self to hand, scry 5
// [Activate: Main] You may return this Character to the owner's hand: Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.

export const P_074_PORTGAS_D_ACE: EffectSchema = {
  card_id: "P-074",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "activate_return_self_scry",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      actions: [
        { type: "DECK_SCRY", params: { look_at: 5 } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-075 Monkey.D.Luffy (Character) — On Play give DON + When Attacking conditional draw/trash
// [On Play] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
// [When Attacking] If you have a Character with a cost of 8 or more on your field, draw 1 card and trash 1 card from your hand.

export const P_075_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-075",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { cost_min: 8, card_type: "CHARACTER" },
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

// ─── P-076 Sakazuki (Leader · Blue/Black) — Activate trash Navy to reduce cost
// [Activate: Main] [Once Per Turn] You may trash 1 {Navy} type card from your hand: Give up to 1 of your opponent's Characters -1 cost during this turn.

export const P_076_SAKAZUKI: EffectSchema = {
  card_id: "P-076",
  card_name: "Sakazuki",
  card_type: "Leader",
  effects: [
    {
      id: "activate_trash_navy_reduce_cost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Navy"] } }],
      flags: { once_per_turn: true, optional: true },
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

// ─── P-077 Ulti (Character) — Once Per Turn DON returned trigger: add DON + set Stage active
// [Once Per Turn] When 2 or more DON!! cards on your field are returned to your DON!! deck, add up to 1 DON!! card from your DON!! deck and rest it. Then, set up to 1 of your purple Stages as active.

export const P_077_ULTI: EffectSchema = {
  card_id: "P-077",
  card_name: "Ulti",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_add_don_set_stage",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        quantity_threshold: 2,
        once_per_turn: true,
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
        {
          type: "SET_ACTIVE",
          target: {
            type: "STAGE",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "PURPLE" },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── P-078 Adio (Character) — Permanent conditional +1000 with rested ODYSSEY Characters
// If you have 2 or more rested {ODYSSEY} type Characters, this Character gains +1000 power.

export const P_078_ADIO: EffectSchema = {
  card_id: "P-078",
  card_name: "Adio",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power_rested_odyssey",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["ODYSSEY"], card_type: "CHARACTER", is_rested: true },
        count: { operator: ">=", value: 2 },
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

// ─── P-079 Lim (Character) — Blocker + End of Turn conditional set active
// [Blocker]
// [End of Your Turn] If you have 2 or more rested {ODYSSEY} type Characters, set this Character as active.

export const P_079_LIM: EffectSchema = {
  card_id: "P-079",
  card_name: "Lim",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "eot_conditional_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["ODYSSEY"], card_type: "CHARACTER", is_rested: true },
        count: { operator: ">=", value: 2 },
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

// ─── P-081 Dracule Mihawk (Character) — Activate return self, conditional play Cross Guild
// [Activate: Main] You may return this Character to the owner's hand: If you have 3 or more blue {Cross Guild} type Characters, play up to 1 {Cross Guild} type Character card with a cost of 5 from your hand.

export const P_081_DRACULE_MIHAWK: EffectSchema = {
  card_id: "P-081",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "activate_return_self_play_cross_guild",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", color: "BLUE", traits: ["Cross Guild"] },
        count: { operator: ">=", value: 3 },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Cross Guild"], cost_exact: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-082 Crocodile (Character) — Your Turn On Play conditional bottom deck
// [Your Turn] [On Play] If your Leader has the {Cross Guild} type or a type including "Baroque Works", place up to 1 of your opponent's Characters with 2000 power or less at the bottom of the owner's deck.

export const P_082_CROCODILE: EffectSchema = {
  card_id: "P-082",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Cross Guild" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait_contains: "Baroque Works" },
          },
        ],
      },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 2000 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── P-083 Shanks (Character) — DON!!x1 When Attacking trash Character from hand: -1000 + draw
// [DON!! x1] [When Attacking] You may trash 1 Character card from your hand: Give up to 1 of your opponent's Characters -1000 power during this turn. Then, draw 1 card.

export const P_083_SHANKS: EffectSchema = {
  card_id: "P-083",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "CHARACTER" },
        },
      ],
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
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-084 Buggy (Character) — Cannot attack + leader Buggy prohibition + On Play free play
// This Character cannot attack.
// If your Leader is [Buggy], all Characters with a cost of 3 or 4 cannot attack.
// [On Play] Play up to 1 {Cross Guild} type Character card with a cost of 6 or less from your hand.

export const P_084_BUGGY: EffectSchema = {
  card_id: "P-084",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "cannot_attack_self",
      category: "permanent",
      prohibitions: [
        { type: "CANNOT_ATTACK" },
      ],
    },
    {
      id: "leader_buggy_cannot_attack_aura",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Buggy" },
      },
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { cost_range: { min: 3, max: 4 } },
          },
        },
      ],
    },
    {
      id: "on_play_free_play_cross_guild",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Cross Guild"], cost_max: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── P-085 Jewelry Bonney (Character) — On Play conditional add to life
// [On Play] If your Leader has the {Supernovas} type and the number of your Life cards is equal to or less than the number of your opponent's Life cards, add up to 1 of your opponent's Characters with a cost of 4 or less to the top or bottom of the owner's Life cards face-up.

export const P_085_JEWELRY_BONNEY: EffectSchema = {
  card_id: "P-085",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_add_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Supernovas" },
          },
          {
            type: "COMPARATIVE",
            metric: "LIFE_COUNT",
            operator: "<=",
          },
        ],
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { face: "UP" },
        },
      ],
    },
  ],
};

// ─── P-090 Charlotte Smoothie (Character) — Opponent's Turn On K.O. DON-1 play Big Mom Pirates
// [Opponent's Turn] [On K.O.] DON!! -1: Play up to 1 {Big Mom Pirates} type Character card with a cost equal to or less than the number of DON!! cards on your opponent's field other than [Charlotte Smoothie] from your hand.

export const P_090_CHARLOTTE_SMOOTHIE: EffectSchema = {
  card_id: "P-090",
  card_name: "Charlotte Smoothie",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_from_hand",
      category: "auto",
      trigger: {
        keyword: "ON_KO",
        turn_restriction: "OPPONENT_TURN",
      },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Big Mom Pirates"],
              exclude_name: "Charlotte Smoothie",
              cost_max: {
                type: "GAME_STATE",
                source: "OPPONENT_DON_FIELD_COUNT",
              },
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── P-091 Shirahoshi (Character) — On Play play Neptunian/Fish-Man Island + Activate grant Rush Character
// [On Play] Play up to 1 {Neptunian} or {Fish-Man Island} type Character card with a cost of 5 or less from your hand.
// [Activate: Main] You may rest this Character: Up to 1 of your {Neptunian} type Characters can attack Characters on the turn in which it is played.

export const P_091_SHIRAHOSHI: EffectSchema = {
  card_id: "P-091",
  card_name: "Shirahoshi",
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
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Neptunian", "Fish-Man Island"],
              cost_max: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "activate_grant_rush_character",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Neptunian"] },
          },
          params: { keyword: "RUSH_CHARACTER" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── P-092 Koby (Character) — Opponent's Turn self -3000 + When Attacking Navy leader base power
// [Opponent's Turn] Give this Character -3000 power.
// [When Attacking] If your Leader has the {Navy} type, your Leader's base power becomes 7000 until the end of your opponent's next turn.
// NOTE: [Opponent's Turn] scoped — only active during opponent's turn

export const P_092_KOBY: EffectSchema = {
  card_id: "P-092",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_self_debuff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -3000 },
        },
      ],
    },
    {
      id: "when_attacking_set_leader_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { value: 7000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── P-093 Trafalgar Law (Character) — Blocker + On Play conditional add DON
// [Blocker]
// [On Play] If the number of DON!! cards on your field is equal to or less than the number on your opponent's field, add up to 1 DON!! card from your DON!! deck and rest it.

export const P_093_TRAFALGAR_LAW: EffectSchema = {
  card_id: "P-093",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_conditional_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── P-096 Girl (Character) — On Play draw + trash; Activate give DON to Nami
// [On Play] Draw 1 card and trash 1 card from your hand.
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your [Nami] cards.

export const P_096_GIRL: EffectSchema = {
  card_id: "P-096",
  card_name: "Girl",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
    {
      id: "activate_give_don_to_nami",
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
            filter: { name: "Nami" },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── P-097 Shanks (Character) — On Play / When Attacking blocker prohibition
// [On Play]/[When Attacking] Your opponent cannot activate [Blocker] during this turn.

export const P_097_SHANKS: EffectSchema = {
  card_id: "P-097",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_no_blocker",
      category: "auto",
      trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "WHEN_ATTACKING" }] },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── P-098 Buggy (Character) — Blocker + On Play conditional self bottom deck
// [Blocker]
// [On Play] If you do not have 5 Characters with a cost of 5 or more, place this Character at the bottom of the owner's deck.

export const P_098_BUGGY: EffectSchema = {
  card_id: "P-098",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_conditional_self_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { card_type: "CHARACTER", cost_min: 5 },
          count: { operator: ">=", value: 5 },
        },
      },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: { type: "SELF" },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── P-099 Monkey.D.Luffy (Character) — When Attacking DON-10 set self active
// [When Attacking] DON!! -10: Set this Character as active.

export const P_099_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-099",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_set_active",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 10 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── P-100 Marshall.D.Teach (Character) — When Attacking negate all opponent effects
// [When Attacking] Negate the effects of your opponent's Leader and all of their Characters during this turn.

export const P_100_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "P-100",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_negate_all",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: { type: "OPPONENT_LEADER" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "NEGATE_EFFECTS",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── P-101 Tony Tony.Chopper (Character) — Blocker + On Play give rested DON to Leader
// [Blocker]
// [On Play] Give up to 1 rested DON!! card to your Leader.

export const P_101_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "P-101",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── P-102 Nami (Character) — On Play conditional set DON active
// [On Play] If your Leader has the {Straw Hat Crew} type, set up to 2 of your DON!! cards as active.

export const P_102_NAMI: EffectSchema = {
  card_id: "P-102",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_don_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
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

// ─── P-103 Portgas.D.Ace (Character) — On Play draw 2, place 2 to deck, give DON to leader
// [On Play] Draw 2 cards and place 2 cards from your hand at the top or bottom of your deck in any order. Then, give up to 1 rested DON!! card to your Leader.

export const P_103_PORTGAS_D_ACE: EffectSchema = {
  card_id: "P-103",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_place_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2 },
          chain: "AND",
        },
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── P-104 Shanks (Character) — cannot be removed if either player has 10 DON
// If either you or your opponent has 10 DON!! cards on the field, this Character cannot be removed from the field by your opponent's effects.

export const P_104_SHANKS: EffectSchema = {
  card_id: "P-104",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "conditional_removal_protection",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "EITHER",
        operator: ">=",
        value: 10,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
  ],
};

// ─── P-105 Sabo (Character) — Permanent conditional Blocker + cost / On Play life to hand: give DON
// If your Leader has the {Revolutionary Army} type, this Character gains [Blocker] and +4 cost.
// [On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const P_105_SABO: EffectSchema = {
  card_id: "P-105",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker_and_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 4 },
        },
      ],
    },
    {
      id: "on_play_life_to_hand_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
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

// ─── P-106 Monkey.D.Luffy (Character) — End of Turn face-up life (DEFERRED) + Trigger draw+KO
// [End of Your Turn] You may turn 1 card from the top of your Life cards face-up: Set up to 1 of your {Egghead} type Characters as active.
// [Trigger] Draw 1 card and K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
// DEFERRED: End of Turn effect requires TURN_LIFE_FACE_UP as cost type (LIFE_FACE_COST)

export const P_106_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "P-106",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    // DEFERRED: End of Turn effect requires TURN_LIFE_FACE_UP as cost type (LIFE_FACE_COST)
    {
      id: "trigger_draw_and_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── P-107 Gol.D.Roger (Character) — On Play if either has 10 DON, leader +2000
// [On Play] If either you or your opponent has 10 DON!! cards on the field, your Leader gains +2000 power until the end of your opponent's next End Phase.

export const P_107_GOL_D_ROGER: EffectSchema = {
  card_id: "P-107",
  card_name: "Gol.D.Roger",
  card_type: "Character",
  effects: [
    {
      id: "on_play_leader_power_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "EITHER",
        operator: ">=",
        value: 10,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── P-111 Nico Robin (Character) — Replacement protect Straw Hat Crew Characters
// [Once Per Turn] If your {Straw Hat Crew} type Character would be removed from the field by your opponent's effect, you may rest 1 of your DON!! cards instead.

export const P_111_NICO_ROBIN: EffectSchema = {
  card_id: "P-111",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "replacement_protect_straw_hat",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { traits: ["Straw Hat Crew"], card_type: "CHARACTER" },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "REST_DON",
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── P-112 Nami (Character) — On Play if leader Nami, give DON then play cost 2
// [On Play] If your Leader is [Nami], give up to 1 rested DON!! card to your Leader. Then, play up to 1 Character card with a cost of 2 or less from your hand.

export const P_112_NAMI: EffectSchema = {
  card_id: "P-112",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don_then_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nami" },
      },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1 },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── P-113 Jewelry Bonney (Character) — DON!!x2 Opponent's Turn Blocker +2000 + Trigger KO
// [DON!! x2] [Opponent's Turn] This Character gains [Blocker] and +2000 power.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.
// NOTE: [Opponent's Turn] scoped — only active during opponent's turn

export const P_113_JEWELRY_BONNEY: EffectSchema = {
  card_id: "P-113",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "don_opponent_turn_blocker_power",
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
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
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
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── P-115 Boa Hancock (Character) — On Play give rested DON + Trigger play yellow with trigger
// [On Play] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
// [Trigger] Play up to 1 yellow Character card with 5000 power or less and a [Trigger] from your hand.

export const P_115_BOA_HANCOCK: EffectSchema = {
  card_id: "P-115",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
    {
      id: "trigger_play_yellow_with_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { color: "YELLOW", power_max: 5000, has_trigger: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── P-117 Nami (Leader) — Deck restriction + deck-out win + DON!!x1 leader damage mill
// Under the rules of this game, you can only include {East Blue} type cards in your deck and when your deck is reduced to 0, you win the game instead of losing.
// [DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.

export const P_117_NAMI: EffectSchema = {
  card_id: "P-117",
  card_name: "Nami",
  card_type: "Leader",
  effects: [
    {
      id: "deck_restriction",
      category: "rule_modification",
      rule: {
        rule_type: "DECK_RESTRICTION",
        restriction: "ONLY_INCLUDE",
        filter: { traits: ["East Blue"] },
      },
    },
    {
      id: "deck_out_win",
      category: "rule_modification",
      rule: {
        rule_type: "LOSS_CONDITION_MOD",
        trigger_event: "DECK_OUT",
        modification: "WIN_INSTEAD",
      },
    },
    {
      id: "leader_damage_mill",
      category: "auto",
      trigger: {
        event: "LEADER_ATTACK_DEALS_DAMAGE",
        don_requirement: 1,
      },
      actions: [
        {
          type: "MILL",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const P_SCHEMAS: Record<string, EffectSchema> = {
  "P-001": P_001_MONKEY_D_LUFFY,
  "P-002": P_002_I_SMELL_ADVENTURE,
  "P-003": P_003_EUSTASS_CAPTAIN_KID,
  "P-004": P_004_CROCODILE,
  "P-005": P_005_KAIDO,
  "P-006": P_006_MONKEY_D_LUFFY,
  "P-007": P_007_MONKEY_D_LUFFY,
  "P-008": P_008_YAMATO,
  "P-009": P_009_TRAFALGAR_LAW,
  "P-010": P_010_KAIDO,
  "P-011": P_011_UTA,
  "P-013": P_013_GORDON,
  "P-014": P_014_KOBY,
  "P-017": P_017_TRAFALGAR_LAW,
  "P-018": P_018_BARTOLOMEO,
  "P-019": P_019_BEPO,
  "P-020": P_020_HELMEPPO,
  "P-024": P_024_IM_GONNA_BE_KING_OF_THE_PIRATES,
  "P-025": P_025_SMOKER,
  "P-026": P_026_MORGAN,
  "P-027": P_027_GENERAL_FRANKY,
  "P-028": P_028_PORTGAS_D_ACE,
  "P-029": P_029_BARTOLOMEO,
  "P-030": P_030_JINBE,
  "P-031": P_031_UTA,
  "P-032": P_032_SENGOKU,
  "P-033": P_033_MONKEY_D_LUFFY,
  "P-034": P_034_SANJI,
  "P-035": P_035_MONKEY_D_LUFFY,
  "P-036": P_036_MONKEY_D_LUFFY,
  "P-037": P_037_MONKEY_D_LUFFY,
  "P-039": P_039_BELLAMY,
  "P-043": P_043_MONKEY_D_LUFFY,
  "P-044": P_044_SABO,
  "P-045": P_045_RORONOA_ZORO,
  "P-046": P_046_YAMATO,
  "P-047": P_047_MONKEY_D_LUFFY,
  "P-048": P_048_ARLONG,
  "P-049": P_049_USOPP,
  "P-050": P_050_SANJI,
  "P-051": P_051_SHANKS,
  "P-052": P_052_DRACULE_MIHAWK,
  "P-053": P_053_NAMI,
  "P-054": P_054_MONKEY_D_GARP,
  "P-055": P_055_MONKEY_D_LUFFY,
  "P-056": P_056_RORONOA_ZORO,
  "P-057": P_057_FLEETING_LULLABY,
  "P-058": P_058_WHERE_THE_WIND_BLOWS,
  "P-059": P_059_THE_WORLDS_CONTINUATION,
  "P-060": P_060_TOT_MUSICA,
  "P-062": P_062_HODY_AND_HYOUZOU,
  "P-063": P_063_JINBE,
  "P-065": P_065_TONY_TONY_CHOPPER,
  "P-068": P_068_SANJI,
  "P-069": P_069_KOALA,
  "P-070": P_070_CARROT,
  "P-071": P_071_MARCO,
  "P-072": P_072_RYUMA,
  "P-073": P_073_SABO,
  "P-074": P_074_PORTGAS_D_ACE,
  "P-075": P_075_MONKEY_D_LUFFY,
  "P-076": P_076_SAKAZUKI,
  "P-077": P_077_ULTI,
  "P-078": P_078_ADIO,
  "P-079": P_079_LIM,
  "P-081": P_081_DRACULE_MIHAWK,
  "P-082": P_082_CROCODILE,
  "P-083": P_083_SHANKS,
  "P-084": P_084_BUGGY,
  "P-085": P_085_JEWELRY_BONNEY,
  "P-090": P_090_CHARLOTTE_SMOOTHIE,
  "P-091": P_091_SHIRAHOSHI,
  "P-092": P_092_KOBY,
  "P-093": P_093_TRAFALGAR_LAW,
  "P-096": P_096_GIRL,
  "P-097": P_097_SHANKS,
  "P-098": P_098_BUGGY,
  "P-099": P_099_MONKEY_D_LUFFY,
  "P-100": P_100_MARSHALL_D_TEACH,
  "P-101": P_101_TONY_TONY_CHOPPER,
  "P-102": P_102_NAMI,
  "P-103": P_103_PORTGAS_D_ACE,
  "P-104": P_104_SHANKS,
  "P-105": P_105_SABO,
  "P-106": P_106_MONKEY_D_LUFFY,
  "P-107": P_107_GOL_D_ROGER,
  "P-111": P_111_NICO_ROBIN,
  "P-112": P_112_NAMI,
  "P-113": P_113_JEWELRY_BONNEY,
  "P-115": P_115_BOA_HANCOCK,
  "P-117": P_117_NAMI,
};
