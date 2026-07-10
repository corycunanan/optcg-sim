/**
 * OP16 Effect Schemas
 *
 * Red/Green/Blue/Purple/Black/Yellow: OP16-001 to OP16-119
 */

import type { EffectSchema } from "../effect-types.js";

export const OP16_001_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP16-001",
  card_name: "Portgas.D.Ace",
  card_type: "Leader",
  effects: [
    {
      id: "activate_grant_rush",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Monkey.D.Luffy", power_min: 8000 },
                { traits_contains: ["Whitebeard Pirates"], power_min: 8000 },
              ],
            },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP16_002_IZO: EffectSchema = {
  card_id: "OP16-002",
  card_name: "Izo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { optional: true },
    },
  ],
};

export const OP16_003_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP16-003",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_leader_double_attack_power",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", filter: { card_type: "LEADER" } },
          params: { keyword: "DOUBLE_ATTACK" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", filter: { card_type: "LEADER" } },
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
    {
      id: "on_play_reveal_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 2, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -6000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_005_THATCH: EffectSchema = {
  card_id: "OP16-005",
  card_name: "Thatch",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", power_min: 8000, traits_contains: ["Whitebeard Pirates"] },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { self_ref: true },
          params: { amount: -3 },
        },
      ],
    },
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

export const OP16_006_SHANKS: EffectSchema = {
  card_id: "OP16-006",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_don_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { power_max: 4000 } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_007_JOZU: EffectSchema = {
  card_id: "OP16-007",
  card_name: "Jozu",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_reveal_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_008_SQUARD: EffectSchema = {
  card_id: "OP16-008",
  card_name: "Squard",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_big_character_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_OWN_CHARACTER", amount: 1, filter: { base_power_exact: 10000 } }],
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { power_max: 8000 } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_009_SPEED_JIL: EffectSchema = {
  card_id: "OP16-009",
  card_name: "Speed Jil",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_rush_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_010_NAMULE: EffectSchema = {
  card_id: "OP16-010",
  card_name: "Namule",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { base_power_max: 2000 } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_011_VISTA: EffectSchema = {
  card_id: "OP16-011",
  card_name: "Vista",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { optional: true },
    },
    {
      id: "when_attacking_ko_small",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 }, filter: { base_power_max: 2000 } },
        },
      ],
    },
  ],
};

export const OP16_012_BENN_BECKMAN: EffectSchema = {
  card_id: "OP16-012",
  card_name: "Benn.Beckman",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_rest_don_play_shanks",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: {
            all_of: [
              { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Red-Haired Pirates" } },
              { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 10 },
            ],
          },
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { name: "Shanks" } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_013_MCGUY: EffectSchema = {
  card_id: "OP16-013",
  card_name: "McGuy",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { base_power_max: 8000 } },
        },
      ],
    },
  ],
};

export const OP16_014_MARCO: EffectSchema = {
  card_id: "OP16-014",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "removed_replacement_ko_self",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER" },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [{ type: "KO", target: { type: "SELF" } }],
      flags: { optional: true },
    },
    {
      id: "on_ko_revive",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "SELF" },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_015_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP16-015",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { name_includes: "Ace" } },
          { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 6 },
        ],
      },
      modifiers: [{ type: "MODIFY_COST", target: { self_ref: true }, params: { amount: -2 } }],
    },
    {
      id: "opponent_attack_set_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } }],
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SET_BASE_POWER",
          target: { type: "SELF" },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_017_LITTLEOARS_JR: EffectSchema = {
  card_id: "OP16-017",
  card_name: "LittleOars Jr.",
  card_type: "Character",
  effects: [
    {
      id: "no_whitebeard_big_character_debuff",
      category: "permanent",
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { card_type: "CHARACTER", traits_contains: ["Whitebeard Pirates"], cost_min: 8 },
        },
      },
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: -4000 } }],
    },
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
  ],
};

export const OP16_018_ROCKSTAR: EffectSchema = {
  card_id: "OP16-018",
  card_name: "Rockstar",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement_trash_from_hand",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: { controller: "SELF", card_type: "CHARACTER", traits: ["Red-Haired Pirates"] },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 }, filter: { card_type: "CHARACTER", power_min: 6000 } },
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

export const OP16_019_LETS_SHOW_EM: EffectSchema = {
  card_id: "OP16-019",
  card_name: "Let's Show 'Em What We're Made Of!!",
  card_type: "Event",
  effects: [
    {
      id: "main_play_whitebeard",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 2 },
            filter: { traits_contains: ["Whitebeard Pirates"], power_exact: 8000 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "trigger_leader_power",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
    },
  ],
};

export const OP16_020_KISS_YOUR_LIVES_GOODBYE: EffectSchema = {
  card_id: "OP16-020",
  card_name: "If You're Coming with Me... Kiss Your Lives Goodbye!!",
  card_type: "Event",
  effects: [
    {
      id: "main_reveal_draw",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REVEAL_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_exact: 8000 } },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { optional: true },
    },
    {
      id: "counter_trash_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_021_MOBY_DICK: EffectSchema = {
  card_id: "OP16-021",
  card_name: "Moby Dick",
  card_type: "Stage",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Whitebeard Pirates" } },
      actions: [{ type: "SEARCH_DECK", params: { look_at: 3, pick: { up_to: 1 }, rest_destination: "BOTTOM" } }],
    },
    {
      id: "activate_trash_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_OWN_STAGE" }],
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_022_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP16-022",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_set_don_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: { type: "FIELD_PURITY", controller: "SELF", filter: { traits: ["Impel Down"] } },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 2 } }],
    },
  ],
};

export const OP16_024_INAZUMA: EffectSchema = {
  card_id: "OP16-024",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_by_opponent_effect_rest",
      category: "auto",
      trigger: { keyword: "ON_KO", cause: "OPPONENT_EFFECT" },
      actions: [{ type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }],
    },
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
  ],
};

export const OP16_025_BUNKOV: EffectSchema = {
  card_id: "OP16-025",
  card_name: "Bunkov",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_play",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Antlerkov" } },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { cost_max: 2 } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

export const OP16_026_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP16-026",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_then_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "SEARCH_DECK", params: { look_at: 3, pick: { up_to: 1 }, filter: { traits: ["Impel Down"] }, rest_destination: "BOTTOM" } },
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { cost_max: 2 } },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP16_027_JINBE: EffectSchema = {
  card_id: "OP16-027",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "don_power",
      category: "permanent",
      conditions: { type: "DON_GIVEN", controller: "SELF", mode: "SPECIFIC_CARD", operator: ">=", value: 1 },
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 2000 } }],
    },
  ],
};

export const OP16_029_ANTLERKOV: EffectSchema = {
  card_id: "OP16-029",
  card_name: "Antlerkov",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_play",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Bunkov" } },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { cost_max: 2 } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

export const OP16_030_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP16-030",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_skip_refresh",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { is_rested: true } },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
    {
      id: "end_turn_set_green_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { color: "GREEN", cost_max: 5 } },
        },
      ],
    },
  ],
};

export const OP16_031_BUGGY: EffectSchema = {
  card_id: "OP16-031",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_prisoner",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { name: "Prisoner of Impel Down" } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

export const OP16_032_BOA_HANCOCK: EffectSchema = {
  card_id: "OP16-032",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    { id: "unblockable", category: "permanent", flags: { keywords: ["UNBLOCKABLE"] } },
    {
      id: "on_play_cannot_be_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { exclude_name: "Monkey.D.Luffy" } },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

export const OP16_033_MORLEY: EffectSchema = {
  card_id: "OP16-033",
  card_name: "Morley",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement_rest_cards",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      // "rest 2 of your cards" — any mix of field cards (Leader/Character/
      // Stage) and DON!!, expressed as a payment choice.
      replacement_actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            labels: ["Rest 2 of your field cards", "Rest 1 field card and 1 DON!!", "Rest 2 DON!! cards"],
            options: [
              [{ type: "SET_REST", target: { type: "FIELD_CARD", controller: "SELF", count: { exact: 2 } } }],
              [
                { type: "SET_REST", target: { type: "FIELD_CARD", controller: "SELF", count: { exact: 1 } } },
                { type: "REST_DON", params: { amount: 1 } },
              ],
              [{ type: "REST_DON", params: { amount: 2 } }],
            ],
          },
        },
      ],
      flags: { optional: true },
    },
    { id: "unblockable", category: "permanent", flags: { keywords: ["UNBLOCKABLE"] } },
  ],
};

export const OP16_034_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP16-034",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "don_your_turn_unique_names_power",
      category: "permanent",
      conditions: { type: "DON_GIVEN", controller: "SELF", mode: "SPECIFIC_CARD", operator: ">=", value: 1 },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: { type: "PER_COUNT", source: "MATCHING_CHARACTERS_ON_FIELD", multiplier: 1000, filter: { unique_names: true } } },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "SEARCH_DECK", params: { look_at: 3, pick: { up_to: 1 }, filter: { traits: ["Impel Down"] }, rest_destination: "BOTTOM" } }],
    },
  ],
};

export const OP16_035_RORONOA_ZORO: EffectSchema = {
  card_id: "OP16-035",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_trash_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        // "Rest up to 1 of your opponent's cards" — field card or DON!!.
        {
          type: "PLAYER_CHOICE",
          params: {
            labels: ["Rest an opponent Leader, Character, or Stage", "Rest 1 opponent DON!!", "Rest nothing"],
            options: [
              [{ type: "SET_REST", target: { type: "FIELD_CARD", controller: "OPPONENT", count: { exact: 1 } } }],
              [{ type: "REST_OPPONENT_DON", params: { amount: 1 } }],
              [],
            ],
          },
        },
        { type: "TRASH_FROM_HAND", params: { amount: 1, optional: true }, chain: "THEN" },
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3, don_state: "RESTED" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

export const OP16_036_MR_2_BON_KUREI: EffectSchema = {
  card_id: "OP16-036",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 4 } } }],
    },
    {
      id: "when_attacking_copy_leader_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      // "becomes the same as your opponent's Leader" — the Leader's printed
      // power, unlike OP16-055 which copies "your opponent's Leader's power".
      actions: [{ type: "COPY_POWER", target: { type: "SELF" }, params: { source: "OPPONENT_LEADER", source_power: "BASE" }, duration: { type: "THIS_TURN" } }],
    },
  ],
};

export const OP16_037_MR_3_GALDINO: EffectSchema = {
  card_id: "OP16-037",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Impel Down" } },
      actions: [{ type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 5 } } }],
    },
  ],
};

export const OP16_038_LETS_GO_TO_NAVY_HEADQUARTERS: EffectSchema = {
  card_id: "OP16-038",
  card_name: "Let's Go!! To the Navy Headquarters!!",
  card_type: "Event",
  effects: [
    {
      id: "main_set_all_active",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      actions: [
        {
          type: "SET_ACTIVE",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", traits: ["Impel Down"], unique_names: true },
            count: { operator: ">=", value: 5 },
          },
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { all: true } },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }],
    },
  ],
};

export const OP16_039_GUM_GUM_TWIN_JET_PISTOL: EffectSchema = {
  card_id: "OP16-039",
  card_name: "Gum-Gum Twin Jet Pistol",
  card_type: "Event",
  effects: [
    {
      id: "main_double_attack_then_rest",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Monkey.D.Luffy" } },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 }, filter: { cost_max: 3 } },
          chain: "THEN",
          conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Impel Down" } },
        },
      ],
    },
    {
      id: "trigger_rest_leader",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "SET_REST", target: { type: "OPPONENT_LEADER" } }],
    },
  ],
};

export const OP16_040_GUM_GUM_HAMMER_RIFLE: EffectSchema = {
  card_id: "OP16-040",
  card_name: "Gum-Gum Hammer Rifle",
  card_type: "Event",
  effects: [
    {
      id: "main_skip_refresh",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: { type: "MULTIPLE_NAMED_CARDS", controller: "SELF", names: ["Monkey.D.Luffy", "Mr.3(Galdino)"] },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { is_rested: true, cost_max: 6 } },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
    {
      id: "counter_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }],
    },
  ],
};

export const OP16_041_BUGGY: EffectSchema = {
  card_id: "OP16-041",
  card_name: "Buggy",
  card_type: "Leader",
  effects: [
    {
      id: "impel_down_removed_play_prisoner",
      category: "auto",
      trigger: {
        event: "CHARACTER_REMOVED_FROM_FIELD",
        filter: { controller: "SELF", target_filter: { card_type: "CHARACTER", traits: ["Impel Down"] } },
        don_requirement: 1,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { name: "Prisoner of Impel Down" } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true, once_per_turn: true },
    },
  ],
};

export const OP16_042_PRISONER_OF_IMPEL_DOWN: EffectSchema = {
  card_id: "OP16-042",
  card_name: "Prisoner of Impel Down",
  card_type: "Character",
  effects: [
    { id: "unlimited_copies", category: "rule_modification", rule: { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" } },
  ],
};

export const OP16_043_USOPP: EffectSchema = {
  card_id: "OP16-043",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_ko_rest_dressrosa_bounce",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "REST_CARDS", amount: 1, filter: { traits: ["Dressrosa"], card_type: ["LEADER", "STAGE"] } }],
      actions: [{ type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 5 } } }],
      flags: { optional: true },
    },
  ],
};

export const OP16_044_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP16-044",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [{ id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } }],
};

export const OP16_045_CROCODILE: EffectSchema = {
  card_id: "OP16-045",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_bounce_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1, filter: { cost_min: 2 } }],
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { traits: ["Impel Down"], cost_max: 2 } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_047_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP16-047",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "activate_opponent_hand_to_deck",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "OPPONENT_ACTION",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: { type: "HAND_COUNT", controller: "OPPONENT", operator: ">=", value: 8 },
          params: { mandatory: true, action: { type: "PLACE_HAND_TO_DECK", params: { amount: 2, position: "BOTTOM" } } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_048_BUGGY: EffectSchema = {
  card_id: "OP16-048",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_play_prisoner",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Impel Down" } },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { name: "Prisoner of Impel Down" } },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "AND",
        },
      ],
    },
    {
      id: "opponent_attack_grant_blocker",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Prisoner of Impel Down" } },
          params: { keyword: "BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true, once_per_turn: true },
    },
  ],
};

export const OP16_049_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP16-049",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { optional: true },
    },
  ],
};

export const OP16_050_MISS_OLIVE: EffectSchema = {
  card_id: "OP16-050",
  card_name: "Miss Olive",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_bounce_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1, filter: { cost_min: 2 } }],
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_051_MOHJI_CABAJI: EffectSchema = {
  card_id: "OP16-051",
  card_name: "Mohji & Cabaji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_hand_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 5 },
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

export const OP16_052_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP16-052",
  card_name: "Monkey.D.Luffy",
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
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

export const OP16_053_RORONOA_ZORO: EffectSchema = {
  card_id: "OP16-053",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_hand_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 6 },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

export const OP16_054_MR_1_DAZ_BONEZ: EffectSchema = {
  card_id: "OP16-054",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "don_your_turn_hand_power",
      category: "permanent",
      conditions: {
        all_of: [
          { type: "DON_GIVEN", controller: "SELF", mode: "SPECIFIC_CARD", operator: ">=", value: 1 },
          { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 5 },
        ],
      },
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } }],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
    { id: "on_play_draw", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ],
};

export const OP16_055_MR_2_BON_KUREI: EffectSchema = {
  card_id: "OP16-055",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    { id: "on_play_draw", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
    {
      id: "when_attacking_copy_leader_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [{ type: "COPY_POWER", target: { type: "SELF" }, params: { source: "OPPONENT_LEADER" }, duration: { type: "THIS_TURN" } }],
    },
  ],
};

export const OP16_056_MR_3_GALDINO: EffectSchema = {
  card_id: "OP16-056",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_draw_lock",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 9 } },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_057_CAPTAIN_BUGGYS_OUR_SAVIOR: EffectSchema = {
  card_id: "OP16-057",
  card_name: "Captain Buggy's Our Savior!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Prisoner of Impel Down" }, count: { operator: ">=", value: 2 } },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "DRAW", params: { amount: 2 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" }],
    },
  ],
};

export const OP16_058_THE_PRISONERS_ARE_RIOTING: EffectSchema = {
  card_id: "OP16-058",
  card_name: "The Prisoners Are Rioting!!",
  card_type: "Event",
  effects: [
    {
      id: "main_prisoner_base_power",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 10 },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { name: "Prisoner of Impel Down" } },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_buggy_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Buggy" } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

export const OP16_059_SNEAKY_TO_FLASHY: EffectSchema = {
  card_id: "OP16-059",
  card_name: "We'll Change This Mission from Sneaky to Flashy!",
  card_type: "Event",
  effects: [
    {
      id: "main_search_play",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 7 }],
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { traits: ["Impel Down"], card_type: "CHARACTER", power_max: 6000 },
            rest_destination: "BOTTOM",
            cost_override: "FREE",
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }],
    },
  ],
};

export const OP16_060_SENGOKU: EffectSchema = {
  card_id: "OP16-060",
  card_name: "Sengoku",
  card_type: "Leader",
  effects: [
    {
      id: "activate_return_active_don_play_admirals",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 8, filter: { is_active: true } }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 3 },
            filter: { traits: ["Admiral"], unique_names: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_063_KUZAN: EffectSchema = {
  card_id: "OP16-063",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    { id: "on_play_add_don", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 2, target_state: "RESTED" } }] },
    {
      id: "activate_blocker_lock",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP16_064_KOBY: EffectSchema = {
  card_id: "OP16-064",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "SEARCH_DECK", params: { look_at: 5, pick: { up_to: 1 }, filter: { traits: ["Navy"], exclude_name: "Koby" }, rest_destination: "BOTTOM" } }],
    },
  ],
};

export const OP16_065_SAKAZUKI: EffectSchema = {
  card_id: "OP16-065",
  card_name: "Sakazuki",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -6000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "activate_rest_don_add_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Navy" } },
          params: { amount: 2, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

export const OP16_066_SENGOKU: EffectSchema = {
  card_id: "OP16-066",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Navy" } },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 2, target_state: "RESTED" } },
        { type: "DRAW", params: { amount: 2 }, chain: "THEN" },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

export const OP16_067_TSURU: EffectSchema = {
  card_id: "OP16-067",
  card_name: "Tsuru",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "SEARCH_DECK", params: { look_at: 5, pick: { up_to: 1 }, filter: { traits: ["Navy"] }, rest_destination: "BOTTOM" } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
      ],
    },
  ],
};

export const OP16_068_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP16-068",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    { id: "on_play_add_don", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } }] },
    {
      id: "when_attacking_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Donquixote Pirates" } },
      actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 }, duration: { type: "THIS_TURN" } }],
    },
  ],
};

export const OP16_069_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP16-069",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_add_don",
      category: "auto",
      trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "WHEN_ATTACKING" }] },
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } }],
    },
  ],
};

export const OP16_070_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP16-070",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_rest_don_add",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Navy" } },
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_071_BENEVOLENT_KING_OF_THE_WAVES: EffectSchema = {
  card_id: "OP16-071",
  card_name: "Benevolent King of the Waves",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } }],
      flags: { optional: true },
    },
    { id: "on_ko_add_don", category: "auto", trigger: { keyword: "ON_KO" }, actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } }] },
  ],
};

export const OP16_072_HANNYABAL: EffectSchema = {
  card_id: "OP16-072",
  card_name: "Hannyabal",
  card_type: "Character",
  effects: [
    { id: "on_play_search", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "SEARCH_DECK", params: { look_at: 5, pick: { up_to: 1 }, filter: { traits: ["Impel Down"] }, rest_destination: "BOTTOM" } }] },
  ],
};

export const OP16_073_BORSALINO: EffectSchema = {
  card_id: "OP16-073",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_active_and_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } },
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" }, chain: "AND" },
      ],
    },
    {
      id: "end_turn_active_blocker",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
        { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" }, duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }, chain: "THEN" },
      ],
    },
  ],
};

export const OP16_074_MAGELLAN: EffectSchema = {
  card_id: "OP16-074",
  card_name: "Magellan",
  card_type: "Character",
  effects: [
    {
      id: "on_play_force_don_return",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Impel Down" } },
      actions: [{ type: "FORCE_OPPONENT_DON_RETURN", params: { amount: 1 } }],
    },
    { id: "on_ko_force_don_return", category: "auto", trigger: { keyword: "ON_KO" }, actions: [{ type: "FORCE_OPPONENT_DON_RETURN", params: { amount: 4 } }] },
  ],
};

export const OP16_075_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP16-075",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_active_and_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Navy" } },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } },
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" }, chain: "AND" },
      ],
    },
  ],
};

export const OP16_076_THE_THREE_ADMIRALS: EffectSchema = {
  card_id: "OP16-076",
  card_name: "The Three Admirals!!",
  card_type: "Event",
  effects: [
    {
      id: "main_admiral_power",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 3 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 3 }, filter: { traits: ["Admiral"] } },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "CHARACTER", traits: ["Admiral"] } },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

export const OP16_077_BUDDHA_SENGOKU: EffectSchema = {
  card_id: "OP16-077",
  card_name: '"Buddha" Sengoku',
  card_type: "Event",
  effects: [
    {
      id: "main_search_trash",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "SEARCH_DECK", params: { look_at: 5, pick: { up_to: 2 }, filter: { traits: ["Navy"] }, rest_destination: "BOTTOM" } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
      ],
    },
  ],
};

export const OP16_078_MARINEFORD: EffectSchema = {
  card_id: "OP16-078",
  card_name: "Marineford",
  card_type: "Stage",
  effects: [
    { id: "on_play_search", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "SEARCH_DECK", params: { look_at: 5, pick: { up_to: 1 }, filter: { traits: ["Navy"] }, rest_destination: "BOTTOM" } }] },
    {
      id: "activate_draw_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 1 }, { type: "REST_SELF" }],
      actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" }],
      flags: { optional: true },
    },
  ],
};

export const OP16_079_YAMATO: EffectSchema = {
  card_id: "OP16-079",
  card_name: "Yamato",
  card_type: "Leader",
  effects: [
    {
      id: "trash_played_wano_gets_rush",
      category: "auto",
      trigger: { event: "CHARACTER_PLAYED", filter: { controller: "SELF", source_zone: "TRASH", target_filter: { card_type: "CHARACTER", traits: ["Land of Wano"] } } },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "TRIGGERING_CARD" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP16_080_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP16-080",
  card_name: "Marshall.D.Teach",
  card_type: "Leader",
  effects: [
    {
      id: "opponent_turn_character_cost",
      category: "permanent",
      modifiers: [{ type: "MODIFY_COST", target: { type: "CHARACTER", controller: "SELF", count: { all: true } }, params: { amount: 1 } }],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
    {
      id: "opponent_attack_redirect",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } }],
      actions: [
        {
          type: "REDIRECT_ATTACK",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { any_of: [{ card_type: "LEADER" }, { card_type: "CHARACTER", traits: ["Blackbeard Pirates"] }] },
          },
        },
      ],
      flags: { optional: true, once_per_turn: true },
    },
  ],
};

export const OP16_081_OTAMA: EffectSchema = {
  card_id: "OP16-081",
  card_name: "Otama",
  card_type: "Character",
  effects: [
    {
      id: "activate_big_character_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          // FAQ: an opponent's cost-8+ Character also satisfies the condition —
          // the JP text is controller-agnostic (OPT-413).
          conditions: { type: "CARD_ON_FIELD", controller: "EITHER", filter: { card_type: "CHARACTER", cost_min: 8 } },
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_082_KINEMON: EffectSchema = {
  card_id: "OP16-082",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    { id: "self_cost_plus", category: "permanent", modifiers: [{ type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 3 } }] },
    {
      id: "on_play_search_trash_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Land of Wano" } },
      actions: [{ type: "SEARCH_TRASH_THE_REST", params: { look_at: 5, pick: { up_to: 1 }, filter: { traits: ["Land of Wano"] } } }],
    },
  ],
};

export const OP16_083_KOUZUKI_ODEN: EffectSchema = {
  card_id: "OP16-083",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", cost_min: 8 } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

export const OP16_084_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "OP16-084",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_self_play_momonosuke",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        all_of: [
          { type: "SELF_COST", operator: ">=", value: 20 },
          { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 9 },
        ],
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 }, filter: { name: "Kouzuki Momonosuke", cost_exact: 9 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_085_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "OP16-085",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_play_wano_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 }, filter: { traits: ["Land of Wano"], cost_max: 6, exclude_name: "Kouzuki Momonosuke" } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

export const OP16_087_SHINOBU: EffectSchema = {
  card_id: "OP16-087",
  card_name: "Shinobu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_draw_cost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "DRAW",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Land of Wano" } },
          params: { amount: 1 },
        },
        {
          type: "MODIFY_COST",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Land of Wano" } },
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Kouzuki Momonosuke" } },
          params: { amount: 20 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_088_SHIMOTSUKI_USHIMARU: EffectSchema = {
  card_id: "OP16-088",
  card_name: "Shimotsuki Ushimaru",
  card_type: "Character",
  effects: [{ id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } }],
};

export const OP16_089_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP16-089",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    { id: "rush_character", category: "permanent", flags: { keywords: ["RUSH_CHARACTER"] } },
    {
      id: "on_play_draw_trash_reduce_cost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
        {
          type: "MODIFY_COST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -4 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP16_090_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP16-090",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 1 } }, chain: "THEN" },
      ],
    },
  ],
};

export const OP16_091_NAMI: EffectSchema = {
  card_id: "OP16-091",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_trash_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Land of Wano" } },
      actions: [{ type: "SEARCH_TRASH_THE_REST", params: { look_at: 4, pick: { up_to: 1 }, filter: { traits: ["Land of Wano"], exclude_name: "Nami" } } }],
    },
  ],
};

export const OP16_092_NICO_ROBIN: EffectSchema = {
  card_id: "OP16-092",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", cost_min: 8 } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

export const OP16_093_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "OP16-093",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
        {
          type: "GIVE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP16_094_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP16-094",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    { id: "on_ko_opponent_discards", category: "auto", trigger: { keyword: "ON_KO" }, actions: [{ type: "OPPONENT_ACTION", params: { mandatory: true, action: { type: "TRASH_FROM_HAND", params: { amount: 2 } } } }] },
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Land of Wano"] } },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

export const OP16_095_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP16-095",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_unblockable",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { color: "BLACK", traits: ["Land of Wano"] } },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP16_096_YAMATO: EffectSchema = {
  card_id: "OP16-096",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    { id: "unblockable", category: "permanent", flags: { keywords: ["UNBLOCKABLE"] } },
    {
      id: "on_ko_play_yamato",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 }, filter: { name: "Yamato", cost_max: 6 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

export const OP16_097_YAMATO: EffectSchema = {
  card_id: "OP16-097",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "on_play_recover_then_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "CARD_IN_TRASH", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Land of Wano"], card_type: "CHARACTER", cost_max: 6 } },
        },
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { cost_max: 2 } },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP16_098_YAMATO: EffectSchema = {
  card_id: "OP16-098",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    { id: "on_play_draw_trash", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" }] },
    {
      id: "activate_trash_play_yamato",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 }, filter: { name: "Yamato", color: "BLACK", cost_exact: 8 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

export const OP16_099_CUT_THOSE_CHAINS: EffectSchema = {
  card_id: "OP16-099",
  card_name: "I've Come Here... To Cut Those Chains!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_mill_play",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      actions: [
        { type: "MILL", params: { amount: 5 } },
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 }, filter: { traits: ["Land of Wano"], cost_max: 6 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    { id: "counter_power", category: "activate", trigger: { keyword: "COUNTER_EVENT" }, actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }] },
  ],
};

export const OP16_100_HALLOWED_GLACIER_SLASH: EffectSchema = {
  card_id: "OP16-100",
  card_name: "Hallowed Glacier Slash",
  card_type: "Event",
  effects: [
    {
      id: "main_set_yamato_active",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        {
          type: "SET_ACTIVE",
          // Post-colon "If" clause gates only this action, not the cost — see Rules 8-3-1/8-3-3.
          // (The [Yamato] leader check encodes the post-colon target "your Leader [Yamato]".)
          conditions: {
            all_of: [
              { type: "LEADER_PROPERTY", controller: "SELF", property: { name: "Yamato" } },
              { type: "ACTION_PERFORMED_THIS_TURN", controller: "OPPONENT", action: "CHARACTER_KO" },
            ],
          },
          target: { type: "YOUR_LEADER" },
        },
      ],
      flags: { optional: true },
    },
    { id: "counter_power", category: "activate", trigger: { keyword: "COUNTER_EVENT" }, actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }] },
  ],
};

export const OP16_101_MAHOROBA: EffectSchema = {
  card_id: "OP16-101",
  card_name: "Mahoroba",
  card_type: "Event",
  effects: [
    {
      id: "main_power_then_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 2 } },
          chain: "THEN",
          conditions: { type: "TRASH_COUNT", controller: "SELF", operator: ">=", value: 10 },
        },
      ],
    },
    {
      id: "trigger_recover_yamato",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "RETURN_TO_HAND", target: { type: "CARD_IN_TRASH", controller: "SELF", count: { up_to: 1 }, filter: { name: "Yamato" } } }],
    },
  ],
};

export const OP16_102_AVALO_PIZARRO: EffectSchema = {
  card_id: "OP16-102",
  card_name: "Avalo Pizarro",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw_play_fullalead",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          target: { type: "STAGE_CARD", source_zone: ["HAND", "TRASH"], count: { up_to: 1 }, filter: { name: "Fullalead" } },
          params: { source_zone: "HAND_OR_TRASH", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
    { id: "trigger_reuse_on_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }] },
  ],
};

export const OP16_103_VAN_AUGUR: EffectSchema = {
  card_id: "OP16-103",
  card_name: "Van Augur",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_on_ko_draw_debuff",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Blackbeard Pirates" } },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
    { id: "trigger_reuse_on_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }] },
  ],
};

export const OP16_104_CATARINA_DEVON: EffectSchema = {
  card_id: "OP16-104",
  card_name: "Catarina Devon",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_copy_selected_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "COPY_POWER",
          target: { type: "SELF" },
          params: {
            source_target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_draw_play",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 }, filter: { traits: ["Blackbeard Pirates"], cost_exact: 1 } },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "AND",
        },
      ],
    },
  ],
};

export const OP16_106_SANJUAN_WOLF: EffectSchema = {
  card_id: "OP16-106",
  card_name: "Sanjuan.Wolf",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw_set_power",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Blackbeard Pirates" } },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "SET_BASE_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    { id: "trigger_reuse_on_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }] },
  ],
};

export const OP16_107_JESUS_BURGESS: EffectSchema = {
  card_id: "OP16-107",
  card_name: "Jesus Burgess",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_opponent_life_to_hand",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "LIFE_TO_HAND", target: { type: "OPPONENT_LIFE", controller: "OPPONENT" }, params: { amount: 1, position: "TOP" } }],
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

export const OP16_108_SHIRYU: EffectSchema = {
  card_id: "OP16-108",
  card_name: "Shiryu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "ADD_TO_LIFE",
          target: { type: "CARD_IN_TRASH", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Blackbeard Pirates"], cost_max: 6 } },
          params: { face: "UP", position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
    { id: "trigger_draw", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "DRAW", params: { amount: 2 } }] },
  ],
};

export const OP16_109_DOC_Q: EffectSchema = {
  card_id: "OP16-109",
  card_name: "Doc Q",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Blackbeard Pirates" } },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 }, filter: { cost_max: 1 } }, chain: "AND" },
      ],
    },
    { id: "trigger_reuse_on_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }] },
  ],
};

export const OP16_110_VASCO_SHOT: EffectSchema = {
  card_id: "OP16-110",
  card_name: "Vasco Shot",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw_rest",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        { type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 6 } }, chain: "THEN" },
      ],
    },
    { id: "trigger_reuse_on_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }] },
  ],
};

export const OP16_111_BOA_SANDERSONIA: EffectSchema = {
  card_id: "OP16-111",
  card_name: "Boa Sandersonia",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "trigger_life_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

export const OP16_113_BOA_MARIGOLD: EffectSchema = {
  card_id: "OP16-113",
  card_name: "Boa Marigold",
  card_type: "Character",
  effects: [
    {
      id: "low_life_blocker",
      category: "permanent",
      conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
      modifiers: [{ type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" } }],
    },
    {
      id: "trigger_kuja_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Kuja Pirates" } },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

export const OP16_114_LAFFITTE: EffectSchema = {
  card_id: "OP16-114",
  card_name: "Laffitte",
  card_type: "Character",
  effects: [
    { id: "on_ko_ko", category: "auto", trigger: { keyword: "ON_KO" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 4 } } }] },
    { id: "trigger_reuse_on_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }] },
  ],
};

export const OP16_115_BLACK_VORTEX: EffectSchema = {
  card_id: "OP16-115",
  card_name: "Black Vortex",
  card_type: "Event",
  effects: [
    {
      id: "main_recover_trigger",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Blackbeard Pirates" } },
      actions: [{ type: "RETURN_TO_HAND", target: { type: "CARD_IN_TRASH", controller: "SELF", count: { up_to: 1 }, filter: { has_trigger: true, exclude_name: "Black Vortex" } } }],
    },
    {
      id: "trigger_negate",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP16_116_ZEHAHAHAHAHA: EffectSchema = {
  card_id: "OP16-116",
  card_name: "Zehahahahaha!",
  card_type: "Event",
  effects: [
    {
      id: "main_play_teach_life",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 10 },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { name: "Marshall.D.Teach" } },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        { type: "LIFE_TO_HAND", target: { type: "OPPONENT_LIFE", controller: "OPPONENT" }, params: { amount: 1, position: "TOP" }, chain: "THEN" },
      ],
    },
    { id: "trigger_draw_trash", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "DRAW", params: { amount: 2 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" }] },
  ],
};

export const OP16_117_BLACK_HOLE: EffectSchema = {
  card_id: "OP16-117",
  card_name: "Black Hole",
  card_type: "Event",
  effects: [
    {
      id: "main_trash_negate",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } }],
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 8 } },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_recover_blackbeard",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "RETURN_TO_HAND", target: { type: "CARD_IN_TRASH", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Blackbeard Pirates"] } } }],
    },
  ],
};

export const OP16_118_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP16-118",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "counter_grant_8000_characters",
      category: "rule_modification",
      rule: { rule_type: "COUNTER_GRANT", value: 2000, filter: { card_type: "CHARACTER", power_exact: 8000 } },
    },
    {
      id: "on_play_or_ko_search",
      category: "auto",
      trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "ON_KO" }] },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { any_of: [{ name: "Monkey.D.Luffy" }, { traits_contains: ["Whitebeard Pirates"] }] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

export const OP16_119_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP16-119",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: { look_at: 3, pick: { up_to: 1 }, rest_destination: "BOTTOM", pick_destination: "LIFE_TOP", face: "DOWN" },
        },
      ],
    },
    {
      id: "trigger_negate_then_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 5 } },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP16_SCHEMAS: Record<string, EffectSchema> = {
  "OP16-001": OP16_001_PORTGAS_D_ACE,
  "OP16-002": OP16_002_IZO,
  "OP16-003": OP16_003_EDWARD_NEWGATE,
  "OP16-005": OP16_005_THATCH,
  "OP16-006": OP16_006_SHANKS,
  "OP16-007": OP16_007_JOZU,
  "OP16-008": OP16_008_SQUARD,
  "OP16-009": OP16_009_SPEED_JIL,
  "OP16-010": OP16_010_NAMULE,
  "OP16-011": OP16_011_VISTA,
  "OP16-012": OP16_012_BENN_BECKMAN,
  "OP16-013": OP16_013_MCGUY,
  "OP16-014": OP16_014_MARCO,
  "OP16-015": OP16_015_MONKEY_D_LUFFY,
  "OP16-017": OP16_017_LITTLEOARS_JR,
  "OP16-018": OP16_018_ROCKSTAR,
  "OP16-019": OP16_019_LETS_SHOW_EM,
  "OP16-020": OP16_020_KISS_YOUR_LIVES_GOODBYE,
  "OP16-021": OP16_021_MOBY_DICK,
  "OP16-022": OP16_022_MONKEY_D_LUFFY,
  "OP16-024": OP16_024_INAZUMA,
  "OP16-025": OP16_025_BUNKOV,
  "OP16-026": OP16_026_EMPORIO_IVANKOV,
  "OP16-027": OP16_027_JINBE,
  "OP16-029": OP16_029_ANTLERKOV,
  "OP16-030": OP16_030_TRAFALGAR_LAW,
  "OP16-031": OP16_031_BUGGY,
  "OP16-032": OP16_032_BOA_HANCOCK,
  "OP16-033": OP16_033_MORLEY,
  "OP16-034": OP16_034_MONKEY_D_LUFFY,
  "OP16-035": OP16_035_RORONOA_ZORO,
  "OP16-036": OP16_036_MR_2_BON_KUREI,
  "OP16-037": OP16_037_MR_3_GALDINO,
  "OP16-038": OP16_038_LETS_GO_TO_NAVY_HEADQUARTERS,
  "OP16-039": OP16_039_GUM_GUM_TWIN_JET_PISTOL,
  "OP16-040": OP16_040_GUM_GUM_HAMMER_RIFLE,
  "OP16-041": OP16_041_BUGGY,
  "OP16-042": OP16_042_PRISONER_OF_IMPEL_DOWN,
  "OP16-043": OP16_043_USOPP,
  "OP16-044": OP16_044_EMPORIO_IVANKOV,
  "OP16-045": OP16_045_CROCODILE,
  "OP16-047": OP16_047_DONQUIXOTE_DOFLAMINGO,
  "OP16-048": OP16_048_BUGGY,
  "OP16-049": OP16_049_PORTGAS_D_ACE,
  "OP16-050": OP16_050_MISS_OLIVE,
  "OP16-051": OP16_051_MOHJI_CABAJI,
  "OP16-052": OP16_052_MONKEY_D_LUFFY,
  "OP16-053": OP16_053_RORONOA_ZORO,
  "OP16-054": OP16_054_MR_1_DAZ_BONEZ,
  "OP16-055": OP16_055_MR_2_BON_KUREI,
  "OP16-056": OP16_056_MR_3_GALDINO,
  "OP16-057": OP16_057_CAPTAIN_BUGGYS_OUR_SAVIOR,
  "OP16-058": OP16_058_THE_PRISONERS_ARE_RIOTING,
  "OP16-059": OP16_059_SNEAKY_TO_FLASHY,
  "OP16-060": OP16_060_SENGOKU,
  "OP16-063": OP16_063_KUZAN,
  "OP16-064": OP16_064_KOBY,
  "OP16-065": OP16_065_SAKAZUKI,
  "OP16-066": OP16_066_SENGOKU,
  "OP16-067": OP16_067_TSURU,
  "OP16-068": OP16_068_TRAFALGAR_LAW,
  "OP16-069": OP16_069_DONQUIXOTE_DOFLAMINGO,
  "OP16-070": OP16_070_DONQUIXOTE_ROSINANTE,
  "OP16-071": OP16_071_BENEVOLENT_KING_OF_THE_WAVES,
  "OP16-072": OP16_072_HANNYABAL,
  "OP16-073": OP16_073_BORSALINO,
  "OP16-074": OP16_074_MAGELLAN,
  "OP16-075": OP16_075_MONKEY_D_GARP,
  "OP16-076": OP16_076_THE_THREE_ADMIRALS,
  "OP16-077": OP16_077_BUDDHA_SENGOKU,
  "OP16-078": OP16_078_MARINEFORD,
  "OP16-079": OP16_079_YAMATO,
  "OP16-080": OP16_080_MARSHALL_D_TEACH,
  "OP16-081": OP16_081_OTAMA,
  "OP16-082": OP16_082_KINEMON,
  "OP16-083": OP16_083_KOUZUKI_ODEN,
  "OP16-084": OP16_084_KOUZUKI_MOMONOSUKE,
  "OP16-085": OP16_085_KOUZUKI_MOMONOSUKE,
  "OP16-087": OP16_087_SHINOBU,
  "OP16-088": OP16_088_SHIMOTSUKI_USHIMARU,
  "OP16-089": OP16_089_DRACULE_MIHAWK,
  "OP16-090": OP16_090_TONY_TONY_CHOPPER,
  "OP16-091": OP16_091_NAMI,
  "OP16-092": OP16_092_NICO_ROBIN,
  "OP16-093": OP16_093_BARTHOLOMEW_KUMA,
  "OP16-094": OP16_094_PORTGAS_D_ACE,
  "OP16-095": OP16_095_MONKEY_D_LUFFY,
  "OP16-096": OP16_096_YAMATO,
  "OP16-097": OP16_097_YAMATO,
  "OP16-098": OP16_098_YAMATO,
  "OP16-099": OP16_099_CUT_THOSE_CHAINS,
  "OP16-100": OP16_100_HALLOWED_GLACIER_SLASH,
  "OP16-101": OP16_101_MAHOROBA,
  "OP16-102": OP16_102_AVALO_PIZARRO,
  "OP16-103": OP16_103_VAN_AUGUR,
  "OP16-104": OP16_104_CATARINA_DEVON,
  "OP16-106": OP16_106_SANJUAN_WOLF,
  "OP16-107": OP16_107_JESUS_BURGESS,
  "OP16-108": OP16_108_SHIRYU,
  "OP16-109": OP16_109_DOC_Q,
  "OP16-110": OP16_110_VASCO_SHOT,
  "OP16-111": OP16_111_BOA_SANDERSONIA,
  "OP16-113": OP16_113_BOA_MARIGOLD,
  "OP16-114": OP16_114_LAFFITTE,
  "OP16-115": OP16_115_BLACK_VORTEX,
  "OP16-116": OP16_116_ZEHAHAHAHAHA,
  "OP16-117": OP16_117_BLACK_HOLE,
  "OP16-118": OP16_118_PORTGAS_D_ACE,
  "OP16-119": OP16_119_MARSHALL_D_TEACH,
};
