/**
 * ST13 Effect Schemas
 *
 * Red/Yellow, Blue/Yellow, Black/Yellow Leaders + Yellow Characters: ST13-001 to ST13-019
 *
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERS (ST13-001 to ST13-003)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST13-001 Sabo (Leader) — activate add character to life + power boost
// [DON!! x1] [Activate: Main] [Once Per Turn] You may add 1 of your Characters with a cost of 3 or more and 7000 power or more to the top of your Life cards face-up: Up to 1 of your Characters gains +2000 power until the start of your next turn.

export const ST13_001_SABO: EffectSchema = {
  card_id: "ST13-001",
  card_name: "Sabo",
  card_type: "Leader",
  effects: [
    {
      id: "activate_add_to_life_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
      costs: [
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          filter: { cost_min: 3, power_min: 7000 },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST13-002 Portgas.D.Ace (Leader) — search deck to life + end of turn trash face-up
// [DON!! x2] [Activate: Main] [Once Per Turn] Look at 5 cards from the top of your deck and add up to 1 Character card with a cost of 5 to the top of your Life cards face-up. Then, place the rest at the bottom of your deck in any order.
// [End of Your Turn] Trash all your face-up Life cards.

export const ST13_002_PORTGAS_D_ACE: EffectSchema = {
  card_id: "ST13-002",
  card_name: "Portgas.D.Ace",
  card_type: "Leader",
  effects: [
    {
      id: "activate_search_to_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 2 },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_exact: 5 },
            rest_destination: "BOTTOM",
            pick_destination: "LIFE_TOP_FACE_UP",
          },
        },
      ],
      flags: { once_per_turn: true },
    },
    {
      id: "end_of_turn_trash_face_up",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        { type: "TRASH_FACE_UP_LIFE" },
      ],
    },
  ],
};

// ─── ST13-003 Monkey.D.Luffy (Leader) — face-up life rule mod + activate add to life
// Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules.
// [DON!! x2] [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: If you have 0 Life cards, add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up.

export const ST13_003_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST13-003",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "face_up_life_rule",
      category: "rule_modification",
      rule: {
        rule_type: "DAMAGE_RULE_MOD",
        applies_to: "FACE_UP_LIFE",
        destination: "DECK_BOTTOM",
        instead_of: "HAND",
      },
      zone: "ANY",
    },
    {
      id: "activate_add_to_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 2 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "==",
        value: 0,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 2 },
            source_zone: ["HAND", "TRASH"],
            filter: { card_type: "CHARACTER", cost_exact: 5 },
          },
          params: { amount: 2, position: "TOP", face: "UP" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Characters (ST13-004 to ST13-016)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST13-004 Edward.Newgate (Character) — On Play add to life then reorder
// [On Play] Add 1 card from the top of your deck to the top of your Life cards. Then, look at all your Life cards; place 1 card at the top of your deck and place the rest back in your Life area in any order.

export const ST13_004_EDWARD_NEWGATE: EffectSchema = {
  card_id: "ST13-004",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_life_reorder",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
        {
          type: "LIFE_CARD_TO_DECK",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
        {
          type: "REORDER_ALL_LIFE",
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST13-005 Emporio.Ivankov (Character) — Blocker + On Play life cost add to life
// [Blocker]
// [On Play] You may trash 1 card from the top or bottom of your Life cards: Reveal up to 1 Character card with a cost of 5 from your hand and add it to the top of your Life cards face-down.

export const ST13_005_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "ST13-005",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_swap_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_LIFE", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_exact: 5 },
          },
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST13-006 Curly.Dadan (Character) — Blocker + On Play play named cards
// [Blocker]
// [On Play] Play up to 1 each of [Sabo], [Portgas.D.Ace], and [Monkey.D.Luffy] with a cost of 2 from your hand.

export const ST13_006_CURLY_DADAN: EffectSchema = {
  card_id: "ST13-006",
  card_name: "Curly.Dadan",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_play_named",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 3 },
            filter: {
              name_any_of: ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"],
              cost_exact: 2,
            },
            named_distribution: {
              names: ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"],
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── ST13-007 Sabo (Character, cost 2) — Activate trash self, reveal life, conditional play + power
// [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards.
// If that card is a [Sabo] with a cost of 5, you may play that card.
// If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

export const ST13_007_SABO_COST2: EffectSchema = {
  card_id: "ST13-007",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "activate_reveal_life_play",
      category: "activate",
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "LIFE_TOP" },
          result_ref: "revealed_life",
        },
        {
          type: "PLAY_CARD",
          target: { type: "SELECTED_CARDS", ref: "revealed_life" },
          params: { source_zone: "LIFE", cost_override: "FREE" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed_life",
            filter: { name: "Sabo", cost_exact: 5 },
          },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── ST13-010 Portgas.D.Ace (Character, cost 2) — Activate trash self, reveal life, conditional play + power
// [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards.
// If that card is a [Portgas.D.Ace] with a cost of 5, you may play that card.
// If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

export const ST13_010_PORTGAS_D_ACE_COST2: EffectSchema = {
  card_id: "ST13-010",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "activate_reveal_life_play",
      category: "activate",
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "LIFE_TOP" },
          result_ref: "revealed_life",
        },
        {
          type: "PLAY_CARD",
          target: { type: "SELECTED_CARDS", ref: "revealed_life" },
          params: { source_zone: "LIFE", cost_override: "FREE" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed_life",
            filter: { name: "Portgas.D.Ace", cost_exact: 5 },
          },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── ST13-014 Monkey.D.Luffy (Character, cost 2) — Activate trash self, reveal life, conditional play + power
// [Activate: Main] You may trash this Character: Reveal 1 card from the top of your Life cards.
// If that card is a [Monkey.D.Luffy] with a cost of 5, you may play that card.
// If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

export const ST13_014_MONKEY_D_LUFFY_COST2: EffectSchema = {
  card_id: "ST13-014",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "activate_reveal_life_play",
      category: "activate",
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "LIFE_TOP" },
          result_ref: "revealed_life",
        },
        {
          type: "PLAY_CARD",
          target: { type: "SELECTED_CARDS", ref: "revealed_life" },
          params: { source_zone: "LIFE", cost_override: "FREE" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed_life",
            filter: { name: "Monkey.D.Luffy", cost_exact: 5 },
          },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── ST13-008 Sabo (Character, cost 5) — On Play life cost KO
// [On Play] You may trash 1 card from the top or bottom of your Life cards: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.

export const ST13_008_SABO: EffectSchema = {
  card_id: "ST13-008",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_cost_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_LIFE", amount: 1, position: "TOP_OR_BOTTOM" }],
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
      flags: { optional: true },
    },
  ],
};

// ST13-009 Shanks — deferred: TURN_LIFE_FACE_DOWN not a valid CostType
// [On Play] You may turn 1 of your face-up Life cards face-down: If your opponent has 7 or more cards in their hand, trash up to 1 card from the top of your opponent's Life cards.

// ─── ST13-011 Portgas.D.Ace (Character, cost 5) — On Play conditional Rush
// [On Play] If you have 2 or less Life cards, this Character gains [Rush].

export const ST13_011_PORTGAS_D_ACE: EffectSchema = {
  card_id: "ST13-011",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
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

// ─── ST13-012 Makino (Character) — On Play life cost reorder life
// [On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Look at all of your Life cards and place them back in your Life area in any order.

export const ST13_012_MAKINO: EffectSchema = {
  card_id: "ST13-012",
  card_name: "Makino",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_reorder",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        { type: "REORDER_ALL_LIFE" },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST13-013 Monkey.D.Garp (Character) — On Play search named characters
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Sabo], [Portgas.D.Ace], or [Monkey.D.Luffy] with a cost of 5 or less and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const ST13_013_MONKEY_D_GARP: EffectSchema = {
  card_id: "ST13-013",
  card_name: "Monkey.D.Garp",
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
              name_any_of: ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"],
              cost_max: 5,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── ST13-015 Monkey.D.Luffy (Character) — activate power + conditional draw/trash life
// [Activate: Main] [Once Per Turn] This Character gains +2000 power until the start of your next turn. Then, if you have 1 or more Life cards, draw 1 card and trash 1 card from the top of your Life cards.

export const ST13_015_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST13-015",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_draw_trash_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 1,
          },
        },
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
          chain: "AND",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 1,
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST13-016 Yamato (Character) — Rush + On Play reorder life
// [Rush]
// [On Play] Look at all your Life cards; place 1 at the top of your deck and place the rest back in your Life area in any order.

export const ST13_016_YAMATO: EffectSchema = {
  card_id: "ST13-016",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "on_play_life_to_deck_reorder",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "LIFE_CARD_TO_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "REORDER_ALL_LIFE",
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Events (ST13-017 to ST13-019)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST13-017 Flame Dragon King (Event) — Counter +4000 then reorder life
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, look at all your Life cards and place them back in your Life area in any order.
// [Trigger] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 card from your hand to the top of your Life cards.

export const ST13_017_FLAME_DRAGON_KING: EffectSchema = {
  card_id: "ST13-017",
  card_name: "Flame Dragon King",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_reorder",
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
          type: "REORDER_ALL_LIFE",
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_life_swap",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST13-018 Gum-Gum Jet Spear (Event) — Counter +2000 then conditional draw
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 0 Life cards, draw 1 card.
// [Trigger] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 card from your hand to the top of your Life cards.

export const ST13_018_GUM_GUM_JET_SPEAR: EffectSchema = {
  card_id: "ST13-018",
  card_name: "Gum-Gum Jet Spear",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_draw",
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
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "==",
            value: 0,
          },
        },
      ],
    },
    {
      id: "trigger_life_swap",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST13-019 The Three Brothers' Bond (Event) — search named + trigger reuse
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 [Sabo], [Portgas.D.Ace], or [Monkey.D.Luffy] with a cost of 5 or less and add it to your hand. Then, place the rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const ST13_019_THE_THREE_BROTHERS_BOND: EffectSchema = {
  card_id: "ST13-019",
  card_name: "The Three Brothers' Bond",
  card_type: "Event",
  effects: [
    {
      id: "main_search_named",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              name_any_of: ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"],
              cost_max: 5,
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
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST13_SCHEMAS: Record<string, EffectSchema> = {
  "ST13-001": ST13_001_SABO,
  "ST13-002": ST13_002_PORTGAS_D_ACE,
  "ST13-003": ST13_003_MONKEY_D_LUFFY,
  "ST13-004": ST13_004_EDWARD_NEWGATE,
  "ST13-005": ST13_005_EMPORIO_IVANKOV,
  "ST13-006": ST13_006_CURLY_DADAN,
  "ST13-007": ST13_007_SABO_COST2,
  "ST13-008": ST13_008_SABO,
  // ST13-009 Shanks — deferred: TURN_LIFE_FACE_DOWN cost type unsupported
  "ST13-010": ST13_010_PORTGAS_D_ACE_COST2,
  "ST13-011": ST13_011_PORTGAS_D_ACE,
  "ST13-012": ST13_012_MAKINO,
  "ST13-013": ST13_013_MONKEY_D_GARP,
  "ST13-014": ST13_014_MONKEY_D_LUFFY_COST2,
  "ST13-015": ST13_015_MONKEY_D_LUFFY,
  "ST13-016": ST13_016_YAMATO,
  "ST13-017": ST13_017_FLAME_DRAGON_KING,
  "ST13-018": ST13_018_GUM_GUM_JET_SPEAR,
  "ST13-019": ST13_019_THE_THREE_BROTHERS_BOND,
};
