/**
 * ST06 Effect Schemas
 *
 * Black (Navy): ST06-001 to ST06-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Navy (ST06-001 to ST06-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST06-001 Sakazuki (Leader) — activate KO cost 0
// [Activate: Main] [Once Per Turn] ③ You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 0.

export const ST06_001_SAKAZUKI: EffectSchema = {
  card_id: "ST06-001",
  card_name: "Sakazuki",
  card_type: "Leader",
  effects: [
    {
      id: "activate_ko_zero",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 3 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST06-002 Koby (Character) — On Play KO cost 0
// [On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 0.

export const ST06_002_KOBY: EffectSchema = {
  card_id: "ST06-002",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_zero",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── ST06-004 Smoker (Character) — cannot be KO'd by effects + DON!!x1 Double Attack
// This Character cannot be K.O.'d by effects.
// [DON!! x1] If there is a Character with a cost of 0, this Character gains [Double Attack].

export const ST06_004_SMOKER: EffectSchema = {
  card_id: "ST06-004",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "permanent",
      prohibitions: [
        { type: "CANNOT_BE_KO", target: { type: "SELF" }, scope: { cause: "BY_OPPONENT_EFFECT" } },
      ],
    },
    {
      id: "don_double_attack",
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
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", cost_exact: 0 },
          },
        ],
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

// ─── ST06-005 Sengoku (Character) — When Attacking -4 cost
// [When Attacking] Give up to 1 of your opponent's Characters −4 cost during this turn.

export const ST06_005_SENGOKU: EffectSchema = {
  card_id: "ST06-005",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_cost_reduction",
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
          params: { amount: -4 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST06-006 Tashigi (Character) — activate rest self -2 cost
// [Activate: Main] You may rest this Character: Give up to 1 of your opponent's Characters −2 cost during this turn.

export const ST06_006_TASHIGI: EffectSchema = {
  card_id: "ST06-006",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
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
      flags: { optional: true },
    },
  ],
};

// ─── ST06-007 Tsuru (Character) — Blocker
// [Blocker]

export const ST06_007_TSURU: EffectSchema = {
  card_id: "ST06-007",
  card_name: "Tsuru",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST06-008 Hina (Character) — On Play -4 cost
// [On Play] Give up to 1 of your opponent's Characters −4 cost during this turn.

export const ST06_008_HINA: EffectSchema = {
  card_id: "ST06-008",
  card_name: "Hina",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cost_reduction",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST06-010 Helmeppo (Character) — On Play -3 cost
// [On Play] Give up to 1 of your opponent's Characters −3 cost during this turn.

export const ST06_010_HELMEPPO: EffectSchema = {
  card_id: "ST06-010",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cost_reduction",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── ST06-012 Monkey.D.Garp (Character) — activate trash + rest self, KO cost 4
// [Activate: Main] You may trash 1 card from your hand and rest this Character: K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const ST06_012_MONKEY_D_GARP: EffectSchema = {
  card_id: "ST06-012",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── ST06-014 Shockwave (Event) — Counter +4000 then KO active + trigger KO
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, K.O. up to 1 of your opponent's active Characters with a cost of 3 or less.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const ST06_014_SHOCKWAVE: EffectSchema = {
  card_id: "ST06-014",
  card_name: "Shockwave",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_ko",
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
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_active: true, cost_max: 3 },
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
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── ST06-015 Great Eruption (Event) — draw then -2 cost + trigger opponent trash
// [Main] Draw 1 card. Then, give up to 1 of your opponent's Characters −2 cost during this turn.
// [Trigger] Your opponent chooses 1 card from their hand and trashes it.

export const ST06_015_GREAT_ERUPTION: EffectSchema = {
  card_id: "ST06-015",
  card_name: "Great Eruption",
  card_type: "Event",
  effects: [
    {
      id: "main_draw_and_cost_reduction",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_opponent_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_CARD",
              target: {
                type: "CARD_IN_HAND",
                controller: "OPPONENT",
                count: { exact: 1 },
              },
            },
          },
        },
      ],
    },
  ],
};

// ─── ST06-016 White Out (Event) — Counter +2000 + trigger draw and KO protection
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle.
// [Trigger] Draw 1 card and none of your Characters can be K.O.'d during this turn.

export const ST06_016_WHITE_OUT: EffectSchema = {
  card_id: "ST06-016",
  card_name: "White Out",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
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
      ],
    },
    {
      id: "trigger_draw_and_protection",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "ALL_YOUR_CHARACTERS" },
          params: { prohibition_type: "CANNOT_BE_KO" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST06-017 Navy HQ (Stage) — On Play -1 cost + activate -1 cost
// [On Play] Give up to 1 of your opponent's Characters −1 cost during this turn.
// [Activate: Main] You may rest this Stage: If your Leader has the {Navy} type, give up to 1 of your opponent's Characters −1 cost during this turn.

export const ST06_017_NAVY_HQ: EffectSchema = {
  card_id: "ST06-017",
  card_name: "Navy HQ",
  card_type: "Stage",
  effects: [
    {
      id: "on_play_cost_reduction",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
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
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST06_SCHEMAS: Record<string, EffectSchema> = {
  "ST06-001": ST06_001_SAKAZUKI,
  "ST06-002": ST06_002_KOBY,
  "ST06-004": ST06_004_SMOKER,
  "ST06-005": ST06_005_SENGOKU,
  "ST06-006": ST06_006_TASHIGI,
  "ST06-007": ST06_007_TSURU,
  "ST06-008": ST06_008_HINA,
  "ST06-010": ST06_010_HELMEPPO,
  "ST06-012": ST06_012_MONKEY_D_GARP,
  "ST06-014": ST06_014_SHOCKWAVE,
  "ST06-015": ST06_015_GREAT_ERUPTION,
  "ST06-016": ST06_016_WHITE_OUT,
  "ST06-017": ST06_017_NAVY_HQ,
};
