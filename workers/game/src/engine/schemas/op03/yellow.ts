/**
 * OP03 Yellow — Big Mom Pirates (OP03-099 to OP03-123)
 */

import type { EffectSchema } from "../../effect-types.js";

// ─── OP03-099 Charlotte Katakuri (Leader) — Life scry + power boost ─────────
// [DON!! x1] [When Attacking] Look at up to 1 card from the top of your or your
// opponent's Life cards, and place it at the top or bottom of the Life cards.
// Then, this Leader gains +1000 power during this battle.

export const OP03_099_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "OP03-099",
  card_name: "Charlotte Katakuri",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_life_scry_and_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP03-102 Sanji — Life cost → add to life from deck ────────────────────
// [DON!! x2] [When Attacking] You may add 1 card from the top or bottom of your
// Life cards to your hand: Add up to 1 card from the top of your deck to the
// top of your Life cards.

export const OP03_102_SANJI: EffectSchema = {
  card_id: "OP03-102",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_life_swap",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-104 Shirley — Blocker + Life scry ─────────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [On Play] Look at up to 1 card from the top of your or your opponent's Life
// cards, and place it at the top or bottom of the Life cards.

export const OP03_104_SHIRLEY: EffectSchema = {
  card_id: "OP03-104",
  card_name: "Shirley",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_life_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
      ],
    },
  ],
};

// ─── OP03-105 Charlotte Oven — Trash trigger card for power boost ───────────
// [DON!! x1] [When Attacking] You may trash 1 card with a [Trigger] from your
// hand: This Character gains +3000 power during this battle.

export const OP03_105_CHARLOTTE_OVEN: EffectSchema = {
  card_id: "OP03-105",
  card_name: "Charlotte Oven",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_trash_for_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-107 Charlotte Galette — Blocker only ─────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)

export const OP03_107_CHARLOTTE_GALETTE: EffectSchema = {
  card_id: "OP03-107",
  card_name: "Charlotte Galette",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP03-108 Charlotte Cracker — Conditional Double Attack + power, Trigger
// [DON!! x1] If you have less Life cards than your opponent, this Character
// gains [Double Attack] and +1000 power.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP03_108_CHARLOTTE_CRACKER: EffectSchema = {
  card_id: "OP03-108",
  card_name: "Charlotte Cracker",
  card_type: "Character",
  effects: [
    {
      id: "conditional_double_attack_and_power",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          all_of: [
            { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
            { type: "COMPARATIVE", metric: "LIFE_COUNT", operator: "<" },
          ],
        },
      },
    },
    {
      id: "trigger_trash_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-109 Charlotte Chiffon — Trash life → add to life from deck ───────
// [On Play] You may trash 1 card from the top or bottom of your Life cards: Add
// up to 1 card from the top of your deck to the top of your Life cards.

export const OP03_109_CHARLOTTE_CHIFFON: EffectSchema = {
  card_id: "OP03-109",
  card_name: "Charlotte Chiffon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_life_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_FROM_LIFE", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-110 Charlotte Smoothie — Life to hand for power + Trigger ─────────
// [When Attacking] You may add 1 card from the top or bottom of your Life cards
// to your hand: This Character gains +2000 power during this battle.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP03_110_CHARLOTTE_SMOOTHIE: EffectSchema = {
  card_id: "OP03-110",
  card_name: "Charlotte Smoothie",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_life_for_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_trash_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-112 Charlotte Pudding — Search deck for Sanji or Big Mom Pirates ──
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 [Sanji]
// or {Big Mom Pirates} type card other than [Charlotte Pudding] and add it to
// your hand. Then, place the rest at the bottom of your deck in any order.

export const OP03_112_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "OP03-112",
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
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Sanji" },
                { traits_contains: ["Big Mom Pirates"] },
              ],
              exclude_name: "Charlotte Pudding",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP03-113 Charlotte Perospero — On K.O. search + Trigger ────────────────
// [On K.O.] Look at 3 cards from the top of your deck; reveal up to 1 {Big Mom
// Pirates} type card and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP03_113_CHARLOTTE_PEROSPERO: EffectSchema = {
  card_id: "OP03-113",
  card_name: "Charlotte Perospero",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_search",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Big Mom Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_trash_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-114 Charlotte Linlin (Yellow) — Add to life + trash opponent life ─
// [On Play] If your Leader has the {Big Mom Pirates} type, add up to 1 card from
// the top of your deck to the top of your Life cards. Then, trash up to 1 card
// from the top of your opponent's Life cards.

export const OP03_114_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "OP03-114",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_manipulation",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Big Mom Pirates" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "TRASH_FROM_LIFE",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP03-115 Streusen — Trash trigger card → KO cost 1 or less ────────────
// [On Play] You may trash 1 card with a [Trigger] from your hand: K.O. up to 1
// of your opponent's Characters with a cost of 1 or less.

export const OP03_115_STREUSEN: EffectSchema = {
  card_id: "OP03-115",
  card_name: "Streusen",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP03-116 Shirahoshi — Draw 3 trash 2 + Trigger play self ──────────────
// [On Play] Draw 3 cards and trash 2 cards from your hand.
// [Trigger] Play this card.

export const OP03_116_SHIRAHOSHI: EffectSchema = {
  card_id: "OP03-116",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 3 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
          chain: "AND",
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

// ─── OP03-117 Napoleon — Activate: Main rest self → buff Charlotte Linlin ───
// [Activate: Main] You may rest this Character: Up to 1 of your [Charlotte
// Linlin] cards gains +1000 power until the start of your next turn.
// [Trigger] Play this card.

export const OP03_117_NAPOLEON: EffectSchema = {
  card_id: "OP03-117",
  card_name: "Napoleon",
  card_type: "Character",
  effects: [
    {
      id: "activate_buff_linlin",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { amount: 1000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
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

// ─── OP03-118 Ikoku Sovereignty — Counter +5000 + Trigger trash 2 → add life
// [Counter] Up to 1 of your Leader or Character cards gains +5000 power during
// this battle.
// [Trigger] You may trash 2 cards from your hand: Add up to 1 card from the top
// of your deck to the top of your Life cards.

export const OP03_118_IKOKU_SOVEREIGNTY: EffectSchema = {
  card_id: "OP03-118",
  card_name: "Ikoku Sovereignty",
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
          params: { amount: 5000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_trash_add_life",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-119 Buzz Cut Mochi — Conditional KO + Trigger play from hand ──────
// [Main] If you have less Life cards than your opponent, K.O. up to 1 of your
// opponent's Characters with a cost of 4 or less.
// [Trigger] Play up to 1 Character card with a cost of 4 or less and a [Trigger]
// from your hand.

export const OP03_119_BUZZ_CUT_MOCHI: EffectSchema = {
  card_id: "OP03-119",
  card_name: "Buzz Cut Mochi",
  card_type: "Event",
  effects: [
    {
      id: "main_conditional_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<",
      },
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
            filter: { card_type: "CHARACTER", cost_max: 4, has_trigger: true },
          },
        },
      ],
    },
  ],
};

// ─── OP03-120 Tropical Torment — Conditional trash opponent life + Trigger ──
// [Main] If your opponent has 4 or more Life cards, trash up to 1 card from the
// top of your opponent's Life cards.
// [Trigger] Activate this card's [Main] effect.

export const OP03_120_TROPICAL_TORMENT: EffectSchema = {
  card_id: "OP03-120",
  card_name: "Tropical Torment",
  card_type: "Event",
  effects: [
    {
      id: "main_trash_opponent_life",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 4,
      },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
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

// ─── OP03-121 Thunder Bolt — Trash own life → KO + Trigger KO ──────────────
// [Main] You may trash 1 card from the top of your Life cards: K.O. up to 1 of
// your opponent's Characters with a cost of 5 or less.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 5 or less.

export const OP03_121_THUNDER_BOLT: EffectSchema = {
  card_id: "OP03-121",
  card_name: "Thunder Bolt",
  card_type: "Event",
  effects: [
    {
      id: "main_trash_life_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "TRASH_FROM_LIFE", amount: 1, position: "TOP" },
      ],
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
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP03-122 Sogeking — Name alias Usopp + return to hand, draw, trash ────
// Also treat this card's name as [Usopp] according to the rules.
// [On Play] Return up to 1 Character with a cost of 6 or less to the owner's
// hand. Then, draw 2 cards and trash 2 cards from your hand.

export const OP03_122_SOGEKING: EffectSchema = {
  card_id: "OP03-122",
  card_name: "Sogeking",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "NAME_ALIAS", aliases: ["Usopp"] } as never,
  ],
  effects: [
    {
      id: "name_alias",
      category: "rule_modification",
      rule: { rule_type: "NAME_ALIAS", aliases: ["Usopp"] } as never,
    },
    {
      id: "on_play_return_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
        },
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "THEN",
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

// ─── OP03-123 Charlotte Katakuri (Character) — Add character to life ────────
// [On Play] Add up to 1 Character with a cost of 8 or less to the top or bottom
// of the owner's Life cards face-up.

export const OP03_123_CHARLOTTE_KATAKURI_CHARACTER: EffectSchema = {
  card_id: "OP03-123",
  card_name: "Charlotte Katakuri",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_character_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
          params: { face: "UP", position: "TOP_OR_BOTTOM" },
        },
      ],
    },
  ],
};

export const OP03_YELLOW_SCHEMAS: EffectSchema[] = [
  OP03_099_CHARLOTTE_KATAKURI,
  OP03_102_SANJI,
  OP03_104_SHIRLEY,
  OP03_105_CHARLOTTE_OVEN,
  OP03_107_CHARLOTTE_GALETTE,
  OP03_108_CHARLOTTE_CRACKER,
  OP03_109_CHARLOTTE_CHIFFON,
  OP03_110_CHARLOTTE_SMOOTHIE,
  OP03_112_CHARLOTTE_PUDDING,
  OP03_113_CHARLOTTE_PEROSPERO,
  OP03_114_CHARLOTTE_LINLIN,
  OP03_115_STREUSEN,
  OP03_116_SHIRAHOSHI,
  OP03_117_NAPOLEON,
  OP03_118_IKOKU_SOVEREIGNTY,
  OP03_119_BUZZ_CUT_MOCHI,
  OP03_120_TROPICAL_TORMENT,
  OP03_121_THUNDER_BOLT,
  OP03_122_SOGEKING,
  OP03_123_CHARLOTTE_KATAKURI_CHARACTER,
];
