/**
 * ST12 Effect Schemas
 *
 * Green (Zoro / Muggy Kingdom): ST12-001 to ST12-008
 * Blue (Sanji / Baratie): ST12-010 to ST12-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Zoro / Muggy Kingdom (ST12-001 to ST12-008)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST12-001 Roronoa Zoro & Sanji (Leader) — DON!!x1 bounce + set active
// [DON!! x1] [When Attacking] [Once Per Turn] You may return 1 of your Characters with a cost of 2 or more to the owner's hand: Set up to 1 of your Characters with 7000 power or less as active.

export const ST12_001_RORONOA_ZORO_AND_SANJI: EffectSchema = {
  card_id: "ST12-001",
  card_name: "Roronoa Zoro & Sanji",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_bounce_set_active",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1, once_per_turn: true },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND", filter: { cost_min: 2 } }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { power_max: 7000 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST12-002 Kuina (Character) — activate rest opponent + trigger play self
// [Activate: Main] You may rest this Character: Rest up to 1 of your opponent's Characters with a cost of 4 or less.
// [Trigger] Play this card.

export const ST12_002_KUINA: EffectSchema = {
  card_id: "ST12-002",
  card_name: "Kuina",
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
            filter: { cost_max: 4 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── ST12-003 Dracule Mihawk (Character) — On Play conditional play from hand rested
// [On Play] If you have 2 or less Characters, play up to 1 {Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk] from your hand rested.

export const ST12_003_DRACULE_MIHAWK: EffectSchema = {
  card_id: "ST12-003",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER" },
        count: { operator: "<=", value: 2 },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              cost_max: 4,
              exclude_name: "Dracule Mihawk",
              any_of: [
                { traits: ["Muggy Kingdom"] },
                { attribute: "SLASH" },
              ],
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── ST12-006 Yosaku & Johnny (Character) — DON!!x1 When Attacking choice
// [DON!! x1] [When Attacking] Choose one:
// • Rest up to 1 of your opponent's Characters with a cost of 2 or less.
// • K.O. up to 1 of your opponent's rested Characters with a cost of 2 or less.

export const ST12_006_YOSAKU_AND_JOHNNY: EffectSchema = {
  card_id: "ST12-006",
  card_name: "Yosaku & Johnny",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_choice",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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
                    filter: { cost_max: 2 },
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
                    filter: { is_rested: true, cost_max: 2 },
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

// ─── ST12-007 Rika (Character) — On Play DON rest cost, conditional set active
// [On Play] ➁: If your opponent has 3 or more Life cards, set up to 1 of your <Slash> attribute Characters with a cost of 4 or less as active.

export const ST12_007_RIKA: EffectSchema = {
  card_id: "ST12-007",
  card_name: "Rika",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 2 }],
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 3,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { attribute: "SLASH", cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── ST12-008 Roronoa Zoro (Character) — DON!!x1 When Attacking rest opponent
// [DON!! x1] [When Attacking] Rest up to 1 of your opponent's Characters with a cost of 6 or less.

export const ST12_008_RORONOA_ZORO: EffectSchema = {
  card_id: "ST12-008",
  card_name: "Roronoa Zoro",
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
            filter: { cost_max: 6 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Sanji / Baratie (ST12-010 to ST12-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST12-010 Emporio.Ivankov (Character) — On Play reveal+play + When Attacking draw
// [On Play] Reveal 1 card from the top of your deck and play up to 1 Character card with a cost of 2. Then, place the rest at the top or bottom of your deck.
// [When Attacking] [Once Per Turn] Draw 1 card if you have 6 or less cards in your hand.

export const ST12_010_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "ST12-010",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 1,
            filter: { card_type: "CHARACTER", cost_exact: 2 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "when_attacking_conditional_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", once_per_turn: true },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST12-011 Sanji (Character) — DON!!x1 conditional power boost
// [DON!! x1] [When Attacking] If you have 5 or less cards in your hand, this Character gains +2000 power until the start of your next turn.

export const ST12_011_SANJI: EffectSchema = {
  card_id: "ST12-011",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_conditional_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
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

// ─── ST12-012 Charlotte Pudding (Character) — activate self-bounce
// [Activate: Main] Return this Character to the owner's hand.

export const ST12_012_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "ST12-012",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "activate_self_bounce",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        { type: "RETURN_TO_HAND", target: { type: "SELF" } },
      ],
    },
  ],
};

// ─── ST12-013 Zeff (Character) — On Play scry + When Attacking reveal play
// [On Play] Look at 3 cards from the top of your deck and place them at the top or bottom of the deck in any order.
// [When Attacking] Reveal 1 card from the top of your deck and play up to 1 Character card with a cost of 2 rested. Then, place the rest at the top or bottom of your deck.

export const ST12_013_ZEFF: EffectSchema = {
  card_id: "ST12-013",
  card_name: "Zeff",
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
      id: "when_attacking_reveal_play",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 1,
            filter: { card_type: "CHARACTER", cost_exact: 2 },
            rest_destination: "BOTTOM",
            entry_state: "RESTED",
          },
        },
      ],
    },
  ],
};

// ─── ST12-014 Duval (Character) — Blocker + On Play scry
// [Blocker]
// [On Play] Look at 3 cards from the top of your deck and place them at the top or bottom of the deck in any order.

export const ST12_014_DUVAL: EffectSchema = {
  card_id: "ST12-014",
  card_name: "Duval",
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
        { type: "DECK_SCRY", params: { look_at: 3 } },
      ],
    },
  ],
};

// ─── ST12-016 Lion Strike (Event) — Main/Counter rest opponent
// [Main]/[Counter] Rest up to 1 of your opponent's Leader or Character cards with a cost of 4 or less.
// [Trigger] Activate this card's [Main] effect.

export const ST12_016_LION_STRIKE: EffectSchema = {
  card_id: "ST12-016",
  card_name: "Lion Strike",
  card_type: "Event",
  effects: [
    {
      id: "main_counter_rest",
      category: "activate",
      trigger: {
        any_of: [
          { keyword: "MAIN_EVENT" },
          { keyword: "COUNTER_EVENT" },
        ],
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
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

// ─── ST12-017 Plastic Surgery Shot (Event) — Counter +2000 then reveal play
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, reveal 1 card from the top of your deck, play up to 1 Character card with a cost of 2, and place the rest at the top or bottom of your deck.

export const ST12_017_PLASTIC_SURGERY_SHOT: EffectSchema = {
  card_id: "ST12-017",
  card_name: "Plastic Surgery Shot",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_reveal_play",
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
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 1,
            filter: { card_type: "CHARACTER", cost_exact: 2 },
            rest_destination: "BOTTOM",
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

export const ST12_SCHEMAS: Record<string, EffectSchema> = {
  "ST12-001": ST12_001_RORONOA_ZORO_AND_SANJI,
  "ST12-002": ST12_002_KUINA,
  "ST12-003": ST12_003_DRACULE_MIHAWK,
  "ST12-006": ST12_006_YOSAKU_AND_JOHNNY,
  "ST12-007": ST12_007_RIKA,
  "ST12-008": ST12_008_RORONOA_ZORO,
  "ST12-010": ST12_010_EMPORIO_IVANKOV,
  "ST12-011": ST12_011_SANJI,
  "ST12-012": ST12_012_CHARLOTTE_PUDDING,
  "ST12-013": ST12_013_ZEFF,
  "ST12-014": ST12_014_DUVAL,
  "ST12-016": ST12_016_LION_STRIKE,
  "ST12-017": ST12_017_PLASTIC_SURGERY_SHOT,
};
