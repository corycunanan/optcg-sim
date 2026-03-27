/**
 * OP03 Blue — Nami / East Blue (OP03-040 to OP03-057)
 */

import type { EffectSchema } from "../../effect-types.js";

// ─── OP03-040 Nami (Leader) — Deck-out win + mill on damage ─────────────────
// When your deck is reduced to 0, you win the game instead of losing,
// according to the rules.
// [DON!! x1] When this Leader's attack deals damage to your opponent's Life,
// you may trash 1 card from the top of your deck.

export const OP03_040_NAMI: EffectSchema = {
  card_id: "OP03-040",
  card_name: "Nami",
  card_type: "Leader",
  effects: [
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

// ─── OP03-041 Usopp — Rush + mill 7 on damage ──────────────────────────────
// [Rush] (This card can attack on the turn in which it is played.)
// [DON!! x1] When this Character's attack deals damage to your opponent's
// Life, you may trash 7 cards from the top of your deck.

export const OP03_041_USOPP: EffectSchema = {
  card_id: "OP03-041",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "rush_keyword",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "damage_mill_7",
      category: "auto",
      trigger: {
        event: "LEADER_ATTACK_DEALS_DAMAGE",
        don_requirement: 1,
      },
      actions: [
        {
          type: "MILL",
          params: { amount: 7 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-042 Usopp's Pirate Crew — Retrieve Usopp from trash ──────────────
// [On Play] Add up to 1 blue [Usopp] from your trash to your hand.

export const OP03_042_USOPPS_PIRATE_CREW: EffectSchema = {
  card_id: "OP03-042",
  card_name: "Usopp's Pirate Crew",
  card_type: "Character",
  effects: [
    {
      id: "on_play_retrieve_usopp",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLUE", name: "Usopp" },
          },
        },
      ],
    },
  ],
};

// ─── OP03-043 Gaimon — Mill 3 on damage, self-trash if you do ──────────────
// When you deal damage to your opponent's Life, you may trash 3 cards from the
// top of your deck. If you do, trash this Character.

export const OP03_043_GAIMON: EffectSchema = {
  card_id: "OP03-043",
  card_name: "Gaimon",
  card_type: "Character",
  effects: [
    {
      id: "damage_mill_3_self_trash",
      category: "auto",
      trigger: {
        event: "LEADER_ATTACK_DEALS_DAMAGE",
      },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
        {
          type: "TRASH_CARD",
          target: { type: "SELF" },
          chain: "IF_DO",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-044 Kaya — Draw 2 and trash 2 ────────────────────────────────────
// [On Play] Draw 2 cards and trash 2 cards from your hand.

export const OP03_044_KAYA: EffectSchema = {
  card_id: "OP03-044",
  card_name: "Kaya",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── OP03-045 Carne — Blocker + conditional power buff ──────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [Opponent's Turn] If you have 20 or less cards in your deck, this Character
// gains +3000 power.

export const OP03_045_CARNE: EffectSchema = {
  card_id: "OP03-045",
  card_name: "Carne",
  card_type: "Character",
  effects: [
    {
      id: "blocker_keyword",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "conditional_power_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: {
              all_of: [
                { type: "DECK_COUNT", controller: "SELF", operator: "<=", value: 20 },
              ],
            },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          all_of: [
            { type: "DECK_COUNT", controller: "SELF", operator: "<=", value: 20 },
          ],
        },
      },
    },
  ],
};

// ─── OP03-047 Zeff — Mill 7 on damage + On Play bounce and mill ────────────
// [DON!! x1] When this Character's attack deals damage to your opponent's
// Life, you may trash 7 cards from the top of your deck.
// [On Play] Return up to 1 Character with a cost of 3 or less to the owner's
// hand, and you may trash 2 cards from the top of your deck.

export const OP03_047_ZEFF: EffectSchema = {
  card_id: "OP03-047",
  card_name: "Zeff",
  card_type: "Character",
  effects: [
    {
      id: "damage_mill_7",
      category: "auto",
      trigger: {
        event: "LEADER_ATTACK_DEALS_DAMAGE",
        don_requirement: 1,
      },
      actions: [
        {
          type: "MILL",
          params: { amount: 7 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_play_bounce_and_mill",
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
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-048 Nojiko — Conditional bounce ───────────────────────────────────
// [On Play] If your Leader is [Nami], return up to 1 of your opponent's
// Characters with a cost of 5 or less to the owner's hand.

export const OP03_048_NOJIKO: EffectSchema = {
  card_id: "OP03-048",
  card_name: "Nojiko",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nami" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP03-049 Patty — Conditional bounce ────────────────────────────────────
// [On Play] If you have 20 or less cards in your deck, return up to 1
// Character with a cost of 3 or less to the owner's hand.

export const OP03_049_PATTY: EffectSchema = {
  card_id: "OP03-049",
  card_name: "Patty",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DECK_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 20,
      },
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

// ─── OP03-050 Boodle — Blocker + mill on KO ─────────────────────────────────
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)
// [On K.O.] You may trash 1 card from the top of your deck.

export const OP03_050_BOODLE: EffectSchema = {
  card_id: "OP03-050",
  card_name: "Boodle",
  card_type: "Character",
  effects: [
    {
      id: "blocker_keyword",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_mill",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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

// ─── OP03-051 Bell-mère — Mill 7 on damage + mill 3 on KO ──────────────────
// [DON!! x1] When this Character's attack deals damage to your opponent's
// Life, you may trash 7 cards from the top of your deck.
// [On K.O.] You may trash 3 cards from the top of your deck.

export const OP03_051_BELLMERE: EffectSchema = {
  card_id: "OP03-051",
  card_name: "Bell-mère",
  card_type: "Character",
  effects: [
    {
      id: "damage_mill_7",
      category: "auto",
      trigger: {
        event: "LEADER_ATTACK_DEALS_DAMAGE",
        don_requirement: 1,
      },
      actions: [
        {
          type: "MILL",
          params: { amount: 7 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_ko_mill_3",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-053 Yosaku & Johnny — Conditional power buff ──────────────────────
// [DON!! x1] If you have 20 or less cards in your deck, this Character gains
// +2000 power.

export const OP03_053_YOSAKU_AND_JOHNNY: EffectSchema = {
  card_id: "OP03-053",
  card_name: "Yosaku & Johnny",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: {
              all_of: [
                { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
                { type: "DECK_COUNT", controller: "SELF", operator: "<=", value: 20 },
              ],
            },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          all_of: [
            { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
            { type: "DECK_COUNT", controller: "SELF", operator: "<=", value: 20 },
          ],
        },
      },
    },
  ],
};

// ─── OP03-054 Usopp's Rubber Band of Doom!!! — Counter + Trigger ────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, you may trash 1 card from the top of your deck.
// [Trigger] Draw 1 card and you may trash 1 card from the top of your deck.

export const OP03_054_USOPPS_RUBBER_BAND: EffectSchema = {
  card_id: "OP03-054",
  card_name: "Usopp's Rubber Band of Doom!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_mill",
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
          type: "MILL",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_draw_and_mill",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "MILL",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-055 Gum-Gum Giant Gavel — Counter with hand cost + Trigger ────────
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader gains
// +4000 power during this battle. Then, you may trash 2 cards from the top of
// your deck.
// [Trigger] Return up to 1 Character with a cost of 4 or less to the owner's
// hand.

export const OP03_055_GUM_GUM_GIANT_GAVEL: EffectSchema = {
  card_id: "OP03-055",
  card_name: "Gum-Gum Giant Gavel",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "YOUR_LEADER",
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
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
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP03-056 Sanji's Pilaf — Draw 2 + Trigger reuse ───────────────────────
// [Main] Draw 2 cards.
// [Trigger] Activate this card's [Main] effect.

export const OP03_056_SANJIS_PILAF: EffectSchema = {
  card_id: "OP03-056",
  card_name: "Sanji's Pilaf",
  card_type: "Event",
  effects: [
    {
      id: "main_draw_2",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
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

// ─── OP03-057 Three Thousand Worlds — Return to deck bottom + Trigger ───────
// [Main] Place up to 1 Character with a cost of 5 or less at the bottom of
// the owner's deck.
// [Trigger] Place up to 1 Character with a cost of 3 or less at the bottom of
// the owner's deck.

export const OP03_057_THREE_THOUSAND_WORLDS: EffectSchema = {
  card_id: "OP03-057",
  card_name: "Three Thousand Worlds",
  card_type: "Event",
  effects: [
    {
      id: "main_return_to_deck",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "trigger_return_to_deck",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

export const OP03_BLUE_SCHEMAS: EffectSchema[] = [
  OP03_040_NAMI,
  OP03_041_USOPP,
  OP03_042_USOPPS_PIRATE_CREW,
  OP03_043_GAIMON,
  OP03_044_KAYA,
  OP03_045_CARNE,
  OP03_047_ZEFF,
  OP03_048_NOJIKO,
  OP03_049_PATTY,
  OP03_050_BOODLE,
  OP03_051_BELLMERE,
  OP03_053_YOSAKU_AND_JOHNNY,
  OP03_054_USOPPS_RUBBER_BAND,
  OP03_055_GUM_GUM_GIANT_GAVEL,
  OP03_056_SANJIS_PILAF,
  OP03_057_THREE_THOUSAND_WORLDS,
];
