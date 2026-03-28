/**
 * ST03 Effect Schemas
 *
 * Blue (The Seven Warlords of the Sea): ST03-001 to ST03-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — The Seven Warlords of the Sea (ST03-001 to ST03-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST03-001 Crocodile (Leader) — bounce cost 5 or less
// [Activate: Main] [Once Per Turn] DON!! −4: Return up to 1 Character with a cost of 5 or less to the owner's hand.

export const ST03_001_CROCODILE: EffectSchema = {
  card_id: "ST03-001",
  card_name: "Crocodile",
  card_type: "Leader",
  effects: [
    {
      id: "activate_bounce",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 4 }],
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
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST03-003 Crocodile (Character) — Blocker + On Block bottom deck
// [Blocker]
// [DON!! x1] [On Block] Place up to 1 Character with a cost of 2 or less at the bottom of the owner's deck.

export const ST03_003_CROCODILE: EffectSchema = {
  card_id: "ST03-003",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_BLOCK", don_requirement: 1 },
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

// ─── ST03-004 Gecko Moria (Character) — On Play retrieve from trash
// [On Play] Add up to 1 {The Seven Warlords of the Sea} or {Thriller Bark Pirates} type Character with a cost of 4 or less other than [Gecko Moria] from your trash to your hand.

export const ST03_004_GECKO_MORIA: EffectSchema = {
  card_id: "ST03-004",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "on_play_retrieve_trash",
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
              card_type: "CHARACTER",
              traits_any_of: ["The Seven Warlords of the Sea", "Thriller Bark Pirates"],
              cost_max: 4,
              exclude_name: "Gecko Moria",
            },
          },
        },
      ],
    },
  ],
};

// ─── ST03-005 Dracule Mihawk (Character) — DON!!x1 draw 2 trash 2
// [DON!! x1] [When Attacking] Draw 2 cards and trash 2 cards from your hand.

export const ST03_005_DRACULE_MIHAWK: EffectSchema = {
  card_id: "ST03-005",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

// ─── ST03-007 Sentomaru (Character) — activate search and play Pacifista
// [DON!! x1] [Activate: Main] [Once Per Turn] ➁: Play up to 1 [Pacifista] with a cost of 4 or less from your deck, then shuffle your deck.

export const ST03_007_SENTOMARU: EffectSchema = {
  card_id: "ST03-007",
  card_name: "Sentomaru",
  card_type: "Character",
  effects: [
    {
      id: "activate_search_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
      costs: [{ type: "DON_REST", amount: 2 }],
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            search_full_deck: true,
            filter: { name: "Pacifista", cost_max: 4 },
            shuffle_after: true,
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST03-008 Trafalgar Law (Character) — Blocker
// [Blocker]

export const ST03_008_TRAFALGAR_LAW: EffectSchema = {
  card_id: "ST03-008",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST03-009 Donquixote Doflamingo (Character) — On Play bounce cost 7
// [On Play] Return up to 1 Character with a cost of 7 or less to the owner's hand.

export const ST03_009_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "ST03-009",
  card_name: "Donquixote Doflamingo",
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
            filter: { cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── ST03-010 Bartholomew Kuma (Character) — On Play deck scry + trigger play self
// [On Play] Look at 3 cards from the top of your deck and return them to the top or bottom of the deck in any order.
// [Trigger] Play this card.

export const ST03_010_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "ST03-010",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DECK_SCRY", params: { look_at: 3 } },
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

// ─── ST03-013 Boa Hancock (Character) — Blocker + trigger play self
// [Blocker]
// [Trigger] Play this card.

export const ST03_013_BOA_HANCOCK: EffectSchema = {
  card_id: "ST03-013",
  card_name: "Boa Hancock",
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

// ─── ST03-014 Marshall.D.Teach (Character) — On Play bounce cost 3
// [On Play] Return up to 1 Character with a cost of 3 or less to the owner's hand.

export const ST03_014_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "ST03-014",
  card_name: "Marshall.D.Teach",
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

// ─── ST03-015 Sables (Event) — Main bounce cost 7 + trigger reuse
// [Main] Return up to 1 Character with a cost of 7 or less to the owner's hand.
// [Trigger] Activate this card's [Main] effect.

export const ST03_015_SABLES: EffectSchema = {
  card_id: "ST03-015",
  card_name: "Sables",
  card_type: "Event",
  effects: [
    {
      id: "main_bounce",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
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

// ─── ST03-016 Thrust Pad Cannon (Event) — Counter bounce cost 3 + trigger reuse
// [Counter] Return up to 1 Character with a cost of 3 or less to the owner's hand.
// [Trigger] Activate this card's [Counter] effect.

export const ST03_016_THRUST_PAD_CANNON: EffectSchema = {
  card_id: "ST03-016",
  card_name: "Thrust Pad Cannon",
  card_type: "Event",
  effects: [
    {
      id: "counter_bounce",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
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
    {
      id: "trigger_reuse_counter",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "COUNTER_EVENT" } },
      ],
    },
  ],
};

// ─── ST03-017 Love-Love Mellow (Event) — Counter +4000 then conditional draw
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, draw 1 card if you have 3 or less cards in your hand.

export const ST03_017_LOVE_LOVE_MELLOW: EffectSchema = {
  card_id: "ST03-017",
  card_name: "Love-Love Mellow",
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 3,
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST03_SCHEMAS: Record<string, EffectSchema> = {
  "ST03-001": ST03_001_CROCODILE,
  "ST03-003": ST03_003_CROCODILE,
  "ST03-004": ST03_004_GECKO_MORIA,
  "ST03-005": ST03_005_DRACULE_MIHAWK,
  "ST03-007": ST03_007_SENTOMARU,
  "ST03-008": ST03_008_TRAFALGAR_LAW,
  "ST03-009": ST03_009_DONQUIXOTE_DOFLAMINGO,
  "ST03-010": ST03_010_BARTHOLOMEW_KUMA,
  "ST03-013": ST03_013_BOA_HANCOCK,
  "ST03-014": ST03_014_MARSHALL_D_TEACH,
  "ST03-015": ST03_015_SABLES,
  "ST03-016": ST03_016_THRUST_PAD_CANNON,
  "ST03-017": ST03_017_LOVE_LOVE_MELLOW,
};
