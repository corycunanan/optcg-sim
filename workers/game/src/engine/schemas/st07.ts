/**
 * ST07 Effect Schemas
 *
 * Yellow (Big Mom Pirates): ST07-001 to ST07-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Big Mom Pirates (ST07-001 to ST07-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST07-001 Charlotte Linlin (Leader) — When Attacking life manipulation
// [DON!! x2] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: If you have 2 or less Life cards, add up to 1 card from your hand to the top of your Life cards.

export const ST07_001_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "ST07-001",
  card_name: "Charlotte Linlin",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_life_swap",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
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

// ─── ST07-003 Charlotte Katakuri (Character) — On Play life scry then conditional Rush
// [On Play] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards. Then, if you have less Life cards than your opponent, this Character gains [Rush] during this turn.

export const ST07_003_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "ST07-003",
  card_name: "Charlotte Katakuri",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry_and_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "LIFE_SCRY",
          target: { type: "LIFE_CARD", controller: "EITHER", count: { up_to: 1 } },
          params: { look_at: 1 },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "COMPARATIVE",
            metric: "LIFE_COUNT",
            operator: "<",
          },
        },
      ],
    },
  ],
};

// ─── ST07-004 Charlotte Snack (Character) — When Attacking life cost, Banish + power
// [DON!! x1] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: This Character gains [Banish] and +1000 power during this battle.

export const ST07_004_CHARLOTTE_SNACK: EffectSchema = {
  card_id: "ST07-004",
  card_name: "Charlotte Snack",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_banish_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST07-005 Charlotte Daifuku (Character) — When Attacking life cost, add to life
// [DON!! x1] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 card from the top of your deck to the top of your Life cards.

export const ST07_005_CHARLOTTE_DAIFUKU: EffectSchema = {
  card_id: "ST07-005",
  card_name: "Charlotte Daifuku",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_life_cycle",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
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

// ─── ST07-007 Charlotte Brulee (Character) — Blocker + trigger play self
// [Blocker]
// [Trigger] Play this card.

export const ST07_007_CHARLOTTE_BRULEE: EffectSchema = {
  card_id: "ST07-007",
  card_name: "Charlotte Brulee",
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

// ─── ST07-008 Charlotte Pudding (Character) — On Play life scry
// [On Play] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards.

export const ST07_008_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "ST07-008",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "LIFE_SCRY",
          target: { type: "LIFE_CARD", controller: "EITHER", count: { up_to: 1 } },
          params: { look_at: 1 },
        },
      ],
    },
  ],
};

// ─── ST07-009 Charlotte Mont-d'or (Character) — activate KO + trigger conditional play self
// [Activate: Main] You may rest this Character and add 1 card from the top or bottom of your Life cards to your hand: K.O. up to 1 of your opponent's Characters with a cost of 3 or less.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const ST07_009_CHARLOTTE_MONT_DOR: EffectSchema = {
  card_id: "ST07-009",
  card_name: "Charlotte Mont-d'or",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
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
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── ST07-010 Charlotte Linlin (Character) — On Play opponent choice
// [On Play] Your opponent chooses one:
// - Trash 1 card from the top of your opponent's Life cards.
// - Add 1 card from the top of your deck to the top of your Life cards.

export const ST07_010_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "ST07-010",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_choice",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            options: [
              [
                {
                  type: "TRASH_FROM_LIFE",
                  params: { amount: 1, position: "TOP", controller: "OPPONENT" },
                },
              ],
              [
                {
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP", face: "DOWN" },
                },
              ],
            ],
          },
        },
      ],
    },
  ],
};

// ─── ST07-011 Zeus (Character) — activate grant Banish to Charlotte Linlin
// [Activate: Main] You may rest this Character: Up to 1 of your [Charlotte Linlin] cards gains [Banish] during this turn.
// [Trigger] Play this card.

export const ST07_011_ZEUS: EffectSchema = {
  card_id: "ST07-011",
  card_name: "Zeus",
  card_type: "Character",
  effects: [
    {
      id: "activate_grant_banish",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
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

// ─── ST07-013 Prometheus (Character) — activate grant Double Attack to Charlotte Linlin
// [Activate: Main] You may rest this Character: Up to 1 of your [Charlotte Linlin] cards gains [Double Attack] during this turn.
// [Trigger] Play this card.

export const ST07_013_PROMETHEUS: EffectSchema = {
  card_id: "ST07-013",
  card_name: "Prometheus",
  card_type: "Character",
  effects: [
    {
      id: "activate_grant_double_attack",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
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

// ─── ST07-015 Soul Pocus (Event) — opponent choice + trigger reuse
// [Main] Your opponent chooses one:
// - Trash 1 card from the top of your opponent's Life cards.
// - Add 1 card from the top of your deck to the top of your Life cards.
// [Trigger] Activate this card's [Main] effect.

export const ST07_015_SOUL_POCUS: EffectSchema = {
  card_id: "ST07-015",
  card_name: "Soul Pocus",
  card_type: "Event",
  effects: [
    {
      id: "main_opponent_choice",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            options: [
              [
                {
                  type: "TRASH_FROM_LIFE",
                  params: { amount: 1, position: "TOP", controller: "OPPONENT" },
                },
              ],
              [
                {
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP", face: "DOWN" },
                },
              ],
            ],
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

// ─── ST07-016 Power Mochi (Event) — Counter life scry + power + trigger draw + scry
// [Counter] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards. Then, up to 1 of your Leader or Character cards gains +2000 power during this battle.
// [Trigger] Draw 1 card, look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards.

export const ST07_016_POWER_MOCHI: EffectSchema = {
  card_id: "ST07-016",
  card_name: "Power Mochi",
  card_type: "Event",
  effects: [
    {
      id: "counter_scry_and_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "LIFE_SCRY",
          target: { type: "LIFE_CARD", controller: "EITHER", count: { up_to: 1 } },
          params: { look_at: 1 },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw_and_scry",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "LIFE_SCRY",
          target: { type: "LIFE_CARD", controller: "EITHER", count: { up_to: 1 } },
          params: { look_at: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST07-017 Queen Mama Chanter (Stage) — activate life cost, add character to life
// [Activate: Main] You may rest this Stage and add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 of your Characters with a cost of 3 to the top of the owner's Life cards face-up.

export const ST07_017_QUEEN_MAMA_CHANTER: EffectSchema = {
  card_id: "ST07-017",
  card_name: "Queen Mama Chanter",
  card_type: "Stage",
  effects: [
    {
      id: "activate_add_to_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_exact: 3 },
          },
          params: { face: "UP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST07_SCHEMAS: Record<string, EffectSchema> = {
  "ST07-001": ST07_001_CHARLOTTE_LINLIN,
  "ST07-003": ST07_003_CHARLOTTE_KATAKURI,
  "ST07-004": ST07_004_CHARLOTTE_SNACK,
  "ST07-005": ST07_005_CHARLOTTE_DAIFUKU,
  "ST07-007": ST07_007_CHARLOTTE_BRULEE,
  "ST07-008": ST07_008_CHARLOTTE_PUDDING,
  "ST07-009": ST07_009_CHARLOTTE_MONT_DOR,
  "ST07-010": ST07_010_CHARLOTTE_LINLIN,
  "ST07-011": ST07_011_ZEUS,
  "ST07-013": ST07_013_PROMETHEUS,
  "ST07-015": ST07_015_SOUL_POCUS,
  "ST07-016": ST07_016_POWER_MOCHI,
  "ST07-017": ST07_017_QUEEN_MAMA_CHANTER,
};
