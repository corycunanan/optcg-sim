/**
 * ST30 Effect Schemas
 *
 * Red/Green (Luffy & Ace): ST30-001 to ST30-017
 */

import type { EffectSchema } from "../effect-types.js";

export const ST30_001_LUFFY_ACE: EffectSchema = {
  card_id: "ST30-001",
  card_name: "Luffy & Ace",
  card_type: "Leader",
  effects: [
    {
      id: "base_power_character_self_debuff",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_power_min: 7000 },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -2000 },
        },
      ],
    },
    {
      id: "opponent_turn_luffy_ace_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { name_any_of: ["Portgas.D.Ace", "Monkey.D.Luffy"] },
          },
          params: { amount: 3000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
  ],
};

export const ST30_002_INAZUMA: EffectSchema = {
  card_id: "ST30-002",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_6000_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { card_type: "CHARACTER", power_exact: 6000 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

export const ST30_003_EDWARD_NEWGATE: EffectSchema = {
  card_id: "ST30-003",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_6000_base_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { base_power_exact: 6000 },
          },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
  ],
};

export const ST30_004_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "ST30-004",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "CHARACTER", power_exact: 6000 },
        },
      ],
      actions: [
        { type: "DRAW", params: { amount: 3 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "THEN" },
      ],
      flags: { optional: true },
    },
  ],
};

export const ST30_006_JINBE: EffectSchema = {
  card_id: "ST30-006",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "CHARACTER", power_exact: 6000 },
        },
      ],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

export const ST30_007_PORTGAS_D_ACE: EffectSchema = {
  card_id: "ST30-007",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_don_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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
      ],
    },
  ],
};

export const ST30_008_MARCO: EffectSchema = {
  card_id: "ST30-008",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_revive",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "CHARACTER", power_exact: 6000 },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "SELF" },
          params: { source_zone: "TRASH", entry_state: "RESTED", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const ST30_009_LITTLEOARS_JR: EffectSchema = {
  card_id: "ST30-009",
  card_name: "LittleOars Jr.",
  card_type: "Character",
  effects: [
    {
      id: "removed_replacement_trash_draw",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", base_power_exact: 6000 },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        { type: "TRASH_CARD", target: { type: "SELF" } },
        { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
      ],
      flags: { optional: true },
    },
  ],
};

export const ST30_010_CROCODILE: EffectSchema = {
  card_id: "ST30-010",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_skip_refresh",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

export const ST30_011_BUGGY: EffectSchema = {
  card_id: "ST30-011",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "removed_replacement_rest_self",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", base_power_exact: 6000 },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        { type: "SET_REST", target: { type: "SELF" } },
      ],
      flags: { optional: true },
    },
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

export const ST30_012_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST30-012",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_don_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "when_attacking_rest_blocker",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { keywords: ["BLOCKER"] },
          },
        },
      ],
    },
  ],
};

export const ST30_014_MR_3_GALDINO: EffectSchema = {
  card_id: "ST30-014",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_rest_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 2 },
            filter: { base_power_exact: 6000 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const ST30_015_THE_NAME_OF_THIS_ERA_IS_WHITEBEARD: EffectSchema = {
  card_id: "ST30-015",
  card_name: 'The Name of This Era Is "Whitebeard"!!',
  card_type: "Event",
  effects: [
    {
      id: "counter_power",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_power_exact: 6000 },
        count: { operator: ">=", value: 2 },
      },
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
            filter: { power_max: 6000 },
          },
        },
      ],
    },
  ],
};

export const ST30_016_CAN_YOU_STILL_FIGHT_LUFFY: EffectSchema = {
  card_id: "ST30-016",
  card_name: "Can You Still Fight, Luffy?! Of Course!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_then_draw",
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
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            all_of: [
              {
                type: "CARD_ON_FIELD",
                controller: "SELF",
                filter: { card_type: "CHARACTER", name: "Portgas.D.Ace", base_power_exact: 6000 },
              },
              {
                type: "CARD_ON_FIELD",
                controller: "SELF",
                filter: { card_type: "CHARACTER", name: "Monkey.D.Luffy", base_power_exact: 6000 },
              },
            ],
          },
        },
      ],
    },
  ],
};

export const ST30_017_AND_YOU_GET_YOURSELF_IN_BIG_TROUBLE: EffectSchema = {
  card_id: "ST30-017",
  card_name: "And You Get Yourself in Big Trouble!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search_6000_character",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { card_type: "CHARACTER", power_exact: 6000 },
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

export const ST30_SCHEMAS: Record<string, EffectSchema> = {
  "ST30-001": ST30_001_LUFFY_ACE,
  "ST30-002": ST30_002_INAZUMA,
  "ST30-003": ST30_003_EDWARD_NEWGATE,
  "ST30-004": ST30_004_EMPORIO_IVANKOV,
  "ST30-006": ST30_006_JINBE,
  "ST30-007": ST30_007_PORTGAS_D_ACE,
  "ST30-008": ST30_008_MARCO,
  "ST30-009": ST30_009_LITTLEOARS_JR,
  "ST30-010": ST30_010_CROCODILE,
  "ST30-011": ST30_011_BUGGY,
  "ST30-012": ST30_012_MONKEY_D_LUFFY,
  "ST30-014": ST30_014_MR_3_GALDINO,
  "ST30-015": ST30_015_THE_NAME_OF_THIS_ERA_IS_WHITEBEARD,
  "ST30-016": ST30_016_CAN_YOU_STILL_FIGHT_LUFFY,
  "ST30-017": ST30_017_AND_YOU_GET_YOURSELF_IN_BIG_TROUBLE,
};
