/**
 * OP03 Green — Kuro / East Blue (OP03-021 to OP03-039)
 */

import type { EffectSchema } from "../../effect-types.js";

// ─── OP03-021 Kuro (Leader) — ACTIVATE_MAIN ③ + rest 2 East Blue Characters ─
// [Activate: Main] ③ You may rest 2 of your {East Blue} type Characters: Set
// this Leader as active, and rest up to 1 of your opponent's Characters with a
// cost of 5 or less.

export const OP03_021_KURO: EffectSchema = {
  card_id: "OP03-021",
  card_name: "Kuro",
  card_type: "Leader",
  effects: [
    {
      id: "activate_rest_and_rest_opponent",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 3 },
        {
          type: "REST_CARDS",
          amount: 2,
          filter: {
            card_type: "CHARACTER",
            traits_contains: ["East Blue"],
          },
        },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
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
      flags: { optional: true },
    },
  ],
};

// ─── OP03-022 Arlong — DON!!x2 WHEN_ATTACKING ① play trigger card ──────────
// [DON!! x2] [When Attacking] ① Play up to 1 Character card with a cost of 4
// or less and a [Trigger] from your hand.

export const OP03_022_ARLONG: EffectSchema = {
  card_id: "OP03-022",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_play_trigger_card",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 4, has_trigger: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-024 Gin — ON_PLAY conditional East Blue leader → rest 2 ───────────
// [On Play] If your Leader has the {East Blue} type, rest up to 2 of your
// opponent's Characters with a cost of 4 or less.

export const OP03_024_GIN: EffectSchema = {
  card_id: "OP03-024",
  card_name: "Gin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_opponents",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "East Blue" },
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP03-025 Krieg — ON_PLAY trash cost → KO rested + DON!!x1 Double Attack
// [On Play] You may trash 1 card from your hand: K.O. up to 2 of your
// opponent's rested Characters with a cost of 4 or less.
// [DON!! x1] This Character gains [Double Attack].

export const OP03_025_KRIEG: EffectSchema = {
  card_id: "OP03-025",
  card_name: "Krieg",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 4, is_rested: true },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "don_double_attack",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: {
            type: "WHILE_CONDITION",
            condition: {
              type: "DON_FIELD_COUNT",
              controller: "SELF",
              operator: ">=",
              value: 1,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP03-026 Kuroobi — ON_PLAY conditional East Blue leader → rest 1 ──────
// [On Play] If your Leader has the {East Blue} type, rest up to 1 of your
// opponent's Characters.
// [Trigger] Play this card.

export const OP03_026_KUROOBI: EffectSchema = {
  card_id: "OP03-026",
  card_name: "Kuroobi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "East Blue" },
      },
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
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP03-027 Sham — ON_PLAY conditional rest + play Buchi ──────────────────
// [On Play] If your Leader has the {East Blue} type, rest up to 1 of your
// opponent's Characters with a cost of 2 or less and, if you don't have
// [Buchi], play up to 1 [Buchi] from your hand.

export const OP03_027_SHAM: EffectSchema = {
  card_id: "OP03-027",
  card_name: "Sham",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_and_play_buchi",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "East Blue" },
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Buchi" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          conditions: {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { name: "Buchi" },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP03-028 Jango — ON_PLAY choose one: set active OR rest self + opponent
// [On Play] Choose one:
// • Set up to 1 of your {East Blue} type Leader or Character cards with a
//   cost of 6 or less as active.
// • Rest this Character and up to 1 of your opponent's Characters.

export const OP03_028_JANGO: EffectSchema = {
  card_id: "OP03-028",
  card_name: "Jango",
  card_type: "Character",
  effects: [
    {
      id: "on_play_choice",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "SET_ACTIVE",
                  target: {
                    type: "LEADER_OR_CHARACTER",
                    controller: "SELF",
                    count: { up_to: 1 },
                    filter: {
                      traits_contains: ["East Blue"],
                      cost_max: 6,
                    },
                  },
                },
              ],
              [
                {
                  type: "SET_REST",
                  target: { type: "SELF" },
                },
                {
                  type: "SET_REST",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                  },
                },
              ],
            ],
            labels: [
              "Set active: East Blue Leader/Character cost 6 or less",
              "Rest this Character and opponent's Character",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP03-029 Chew — ON_PLAY KO rested opponent cost 4 or less ─────────────
// [On Play] K.O. up to 1 of your opponent's rested Characters with a cost of
// 4 or less.
// [Trigger] Play this card.

export const OP03_029_CHEW: EffectSchema = {
  card_id: "OP03-029",
  card_name: "Chew",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4, is_rested: true },
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

// ─── OP03-030 Nami — ON_PLAY search top 5 for green East Blue (not Nami) ───
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 green
// {East Blue} type card other than [Nami] and add it to your hand. Then, place
// the rest at the bottom of your deck in any order.
// [Trigger] Play this card.

export const OP03_030_NAMI: EffectSchema = {
  card_id: "OP03-030",
  card_name: "Nami",
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
              color: "GREEN",
              traits_contains: ["East Blue"],
              exclude_name: "Nami",
            },
            rest_destination: "BOTTOM",
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

// ─── OP03-031 Pearl — Blocker ──────────────────────────────────────────────
// [Blocker]

export const OP03_031_PEARL: EffectSchema = {
  card_id: "OP03-031",
  card_name: "Pearl",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP03-032 Buggy — CANNOT_BE_KO in battle (incomplete card text) ────────
// This Character cannot be K.O.'d in battle by (card text is incomplete)

export const OP03_032_BUGGY: EffectSchema = {
  card_id: "OP03-032",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection_battle",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP03-034 Buchi — ON_PLAY KO rested opponent cost 2 or less ────────────
// [On Play] K.O. up to 1 of your opponent's rested Characters with a cost of
// 2 or less.

export const OP03_034_BUCHI: EffectSchema = {
  card_id: "OP03-034",
  card_name: "Buchi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── OP03-036 Out-of-the-Bag (Event) — MAIN rest East Blue → set Kuro active
// [Main] You may rest 1 of your {East Blue} type Characters: Set up to 1 of
// your [Kuro] cards as active.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of
// 3 or less.

export const OP03_036_OUT_OF_THE_BAG: EffectSchema = {
  card_id: "OP03-036",
  card_name: "Out-of-the-Bag",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_set_kuro_active",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: {
            card_type: "CHARACTER",
            traits_contains: ["East Blue"],
          },
        },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Kuro" },
          },
        },
      ],
      flags: { optional: true },
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
            filter: { cost_max: 3, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── OP03-037 Tooth Attack (Event) — MAIN rest East Blue → KO rested ────────
// [Main] You may rest 1 of your {East Blue} type Characters: K.O. up to 1 of
// your opponent's rested Characters with a cost of 3 or less.
// [Trigger] Play up to 1 Character card with a cost of 4 or less and a
// [Trigger] from your hand.

export const OP03_037_TOOTH_ATTACK: EffectSchema = {
  card_id: "OP03-037",
  card_name: "Tooth Attack",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_ko_rested",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: {
            card_type: "CHARACTER",
            traits_contains: ["East Blue"],
          },
        },
      ],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3, is_rested: true },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_trigger_card",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 4, has_trigger: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP03-038 Deathly Poison Gas Bomb MH5 (Event) — MAIN rest 2 cost ≤2 ────
// [Main] Rest up to 2 of your opponent's Characters with a cost of 2 or less.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 5 or
// less.

export const OP03_038_DEATHLY_POISON_GAS_BOMB_MH5: EffectSchema = {
  card_id: "OP03-038",
  card_name: "Deathly Poison Gas Bomb MH5",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_opponents",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 2 },
          },
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

// ─── OP03-039 One, Two, Jango (Event) — MAIN rest 1 cost ≤1 then +1000 ─────
// [Main] Rest up to 1 of your opponent's Characters with a cost of 1 or less.
// Then, up to 1 of your Characters gains +1000 power during this turn.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or
// less.

export const OP03_039_ONE_TWO_JANGO: EffectSchema = {
  card_id: "OP03-039",
  card_name: "One, Two, Jango",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_then_buff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
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
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
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

export const OP03_GREEN_SCHEMAS: EffectSchema[] = [
  OP03_021_KURO,
  OP03_022_ARLONG,
  OP03_024_GIN,
  OP03_025_KRIEG,
  OP03_026_KUROOBI,
  OP03_027_SHAM,
  OP03_028_JANGO,
  OP03_029_CHEW,
  OP03_030_NAMI,
  OP03_031_PEARL,
  OP03_032_BUGGY,
  OP03_034_BUCHI,
  OP03_036_OUT_OF_THE_BAG,
  OP03_037_TOOTH_ATTACK,
  OP03_038_DEATHLY_POISON_GAS_BOMB_MH5,
  OP03_039_ONE_TWO_JANGO,
];
