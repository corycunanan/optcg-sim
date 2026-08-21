/**
 * OP17 Effect Schemas
 *
 * OPT-727 slice: 6 Leaders, 15 Events, and 1 Stage.
 * OPT-728 slice: 44 Characters (red, green, blue, and first yellow group).
 * OPT-729 slice: final 42 Characters and manifest closure.
 */

import type { EffectSchema } from "../effect-types.js";

// ─── OP17-002 Atmos (Character) ─────────────────────────────────────────────

export const OP17_002_ATMOS: EffectSchema = {
  card_id: "OP17-002",
  card_name: "Atmos",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
      },
    },
  ],
};

// ─── OP17-003 Izo (Character) ───────────────────────────────────────────────

export const OP17_003_IZO: EffectSchema = {
  card_id: "OP17-003",
  card_name: "Izo",
  card_type: "Character",
  effects: [
    {
      id: "rush_character",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "on_play_debuff_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Edward.Newgate" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Land of Wano" },
          },
        ],
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { amount: -6000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-004 Inuarashi & Nekomamushi (Character) ──────────────────────────

export const OP17_004_INUARASHI_NEKOMAMUSHI: EffectSchema = {
  card_id: "OP17-004",
  card_name: "Inuarashi & Nekomamushi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { traits: ["Land of Wano"] },
                { traits_contains: ["Whitebeard Pirates"] },
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

// ─── OP17-005 Edward.Newgate (Character) ────────────────────────────────────

export const OP17_005_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP17-005",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", controller: "OPPONENT", power_min: 10000 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: -4 },
        },
      ],
    },
    {
      id: "on_play_set_leader_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: false },
      },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { value: 8000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP17-007 Kouzuki Oden (Character) ──────────────────────────────────────

export const OP17_007_KOUZUKI_ODEN: EffectSchema = {
  card_id: "OP17-007",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Edward.Newgate" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Land of Wano" },
          },
        ],
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              power_max: 6000,
              any_of: [
                { traits: ["Land of Wano"] },
                { traits_contains: ["Whitebeard Pirates"] },
              ],
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP17-008 Jozu (Character) ──────────────────────────────────────────────

export const OP17_008_JOZU: EffectSchema = {
  card_id: "OP17-008",
  card_name: "Jozu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_newgate_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER", filter: { name: "Edward.Newgate" } },
          params: { value: 8000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP17-009 Haruta (Character) ────────────────────────────────────────────

export const OP17_009_HARUTA: EffectSchema = {
  card_id: "OP17-009",
  card_name: "Haruta",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
      },
    },
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 2000 },
          },
        },
      ],
    },
  ],
};

// ─── OP17-010 Fossa (Character) ─────────────────────────────────────────────

export const OP17_010_FOSSA: EffectSchema = {
  card_id: "OP17-010",
  card_name: "Fossa",
  card_type: "Character",
  effects: [
    {
      id: "activate_blocker_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        all_of: [
          {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", controller: "OPPONENT", power_min: 10000 },
          },
          {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { name: "Fossa" },
              exclude_self: true,
            },
          },
        ],
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP17-011 Blamenco (Character) ──────────────────────────────────────────

export const OP17_011_BLAMENCO: EffectSchema = {
  card_id: "OP17-011",
  card_name: "Blamenco",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-012 Blenheim (Character) ──────────────────────────────────────────

export const OP17_012_BLENHEIM: EffectSchema = {
  card_id: "OP17-012",
  card_name: "Blenheim",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_ko_play_card",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_exact: 1, traits_contains: ["Whitebeard Pirates"] },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP17-013 Portgas.D.Ace (Character) ─────────────────────────────────────

export const OP17_013_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP17-013",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", controller: "OPPONENT", power_min: 10000 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: -2 },
        },
      ],
    },
    {
      id: "on_play_debuff_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Edward.Newgate" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { amount: -6000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-014 Whitey Bay (Character) ────────────────────────────────────────

export const OP17_014_WHITEY_BAY: EffectSchema = {
  card_id: "OP17-014",
  card_name: "Whitey Bay",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 2000 },
          },
        },
      ],
    },
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-015 Marco (Character) ─────────────────────────────────────────────

export const OP17_015_MARCO: EffectSchema = {
  card_id: "OP17-015",
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
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits_contains: ["Whitebeard Pirates"] },
        },
      ],
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

// ─── OP17-016 Rakuyo (Character) ────────────────────────────────────────────

export const OP17_016_RAKUYO: EffectSchema = {
  card_id: "OP17-016",
  card_name: "Rakuyo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_two",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { base_power_max: 2000 },
          },
        },
      ],
    },
  ],
};

// ─── OP17-001 Edward.Newgate (Leader) ───────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
// hand: Up to 1 of your Leader or Characters gains +4000 power during this battle.

export const OP17_001_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP17-001",
  card_name: "Edward.Newgate",
  card_type: "Leader",
  effects: [
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-017 Ga Ha Ha Ha!! (Event) ─────────────────────────────────────────

export const OP17_017_GA_HA_HA_HA: EffectSchema = {
  card_id: "OP17-017",
  card_name: "Ga Ha Ha Ha!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_swing",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-019 I Don't Have Time to Chat with Snot-Nosed Brats (Event) ───────

export const OP17_019_I_DONT_HAVE_TIME_TO_CHAT: EffectSchema = {
  card_id: "OP17-019",
  card_name: "I Don't Have Time to Chat with Snot-Nosed Brats",
  card_type: "Event",
  effects: [
    {
      id: "main_search_whitebeard",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Whitebeard Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_leader_power",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-020 Shanks (Leader) ───────────────────────────────────────────────

export const OP17_020_SHANKS: EffectSchema = {
  card_id: "OP17-020",
  card_name: "Shanks",
  card_type: "Leader",
  effects: [
    {
      id: "activate_skip_refresh",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "CHOICE",
          labels: ["Trash card from hand", "Rest 1 DON"],
          options: [
            [{ type: "TRASH_FROM_HAND", amount: 1 }],
            [{ type: "REST_DON", amount: 1 }],
          ],
        },
      ],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-021 Crone Oli (Character) ─────────────────────────────────────────

export const OP17_021_CRONE_OLI: EffectSchema = {
  card_id: "OP17-021",
  card_name: "Crone Oli",
  card_type: "Character",
  effects: [
    {
      id: "removed_replacement_rest_card",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          controller: "SELF",
          card_type: "CHARACTER",
          traits_contains: ["Red-Haired Pirates"],
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          // GAP: PLAYER_CHOICE has no branch-feasibility contract, so a rest
          // branch cannot be hidden when that card class has no active target.
          type: "PLAYER_CHOICE",
          params: {
            labels: ["Rest 1 field card", "Rest 1 DON!! card"],
            options: [
              [
                {
                  type: "SET_REST",
                  target: {
                    type: "FIELD_CARD",
                    controller: "SELF",
                    count: { exact: 1 },
                  },
                },
              ],
              [{ type: "REST_DON", params: { amount: 1 } }],
            ],
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-022 Shanks (Character) ────────────────────────────────────────────

export const OP17_022_SHANKS: EffectSchema = {
  card_id: "OP17-022",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    { id: "rush", category: "permanent", flags: { keywords: ["RUSH"] } },
    {
      id: "on_play_active_then_rest_all",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "SET_DON_ACTIVE", params: { amount: 2 } },
        {
          type: "SET_REST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-023 Nami (Character) ──────────────────────────────────────────────

export const OP17_023_NAMI: EffectSchema = {
  card_id: "OP17-023",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement_rest_self",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          controller: "SELF",
          card_type: "CHARACTER",
          traits_any_of: ["East Blue", "Straw Hat Crew"],
        },
      },
      replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-024 Howling Gab (Character) ───────────────────────────────────────

export const OP17_024_HOWLING_GAB: EffectSchema = {
  card_id: "OP17-024",
  card_name: "Howling Gab",
  card_type: "Character",
  effects: [
    { id: "banish", category: "permanent", flags: { keywords: ["BANISH"] } },
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        },
      ],
    },
  ],
};

// ─── OP17-025 Building Snake (Character) ────────────────────────────────────

export const OP17_025_BUILDING_SNAKE: EffectSchema = {
  card_id: "OP17-025",
  card_name: "Building Snake",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_ko_rested",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 6 },
          },
        },
      ],
    },
    {
      id: "activate_give_rested_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER", filter: { name: "Shanks" } },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP17-026 Fugar (Character) ─────────────────────────────────────────────

export const OP17_026_FUGAR: EffectSchema = {
  card_id: "OP17-026",
  card_name: "Fugar",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
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
      ],
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP17-027 Benn.Beckman (Character) ──────────────────────────────────────

export const OP17_027_BENN_BECKMAN: EffectSchema = {
  card_id: "OP17-027",
  card_name: "Benn.Beckman",
  card_type: "Character",
  effects: [
    {
      id: "rush_character",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "on_play_draw_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 } },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-028 Bonk Punch & Monster (Character) ──────────────────────────────

export const OP17_028_BONK_PUNCH_MONSTER: EffectSchema = {
  card_id: "OP17-028",
  card_name: "Bonk Punch & Monster",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
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
            filter: { is_rested: true, cost_max: 6 },
          },
        },
      ],
    },
  ],
};

// ─── OP17-029 Hongo (Character) ─────────────────────────────────────────────

export const OP17_029_HONGO: EffectSchema = {
  card_id: "OP17-029",
  card_name: "Hongo",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_active_then_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "SET_DON_ACTIVE", params: { amount: 1 } },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 2 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-030 Monkey.D.Luffy (Character) ────────────────────────────────────

export const OP17_030_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP17-030",
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
      id: "activate_set_don_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
      },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 1 } }],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP17-031 Yasopp (Character) ────────────────────────────────────────────

export const OP17_031_YASOPP: EffectSchema = {
  card_id: "OP17-031",
  card_name: "Yasopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "end_turn_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Red-Haired Pirates"] },
          },
        },
      ],
    },
  ],
};

// ─── OP17-032 Limejuice (Character) ─────────────────────────────────────────

export const OP17_032_LIMEJUICE: EffectSchema = {
  card_id: "OP17-032",
  card_name: "Limejuice",
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
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Red-Haired Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP17-033 Lucky.Roux (Character) ────────────────────────────────────────

export const OP17_033_LUCKY_ROUX: EffectSchema = {
  card_id: "OP17-033",
  card_name: "Lucky.Roux",
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
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Red-Haired Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "on_opponent_attack_rest",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-034 Rockstar (Character) ──────────────────────────────────────────

export const OP17_034_ROCKSTAR: EffectSchema = {
  card_id: "OP17-034",
  card_name: "Rockstar",
  card_type: "Character",
  effects: [
    {
      id: "activate_don_leader_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "OPPONENT",
        property: { power: { operator: ">=", value: 6000 } },
      },
      actions: [
        { type: "SET_DON_ACTIVE", params: { amount: 1 } },
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER", filter: { traits: ["Red-Haired Pirates"] } },
          params: { value: 6000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP17-036 Withdraw Now and Allow Me to Save Face (Event) ────────────────

export const OP17_036_WITHDRAW_NOW: EffectSchema = {
  card_id: "OP17-036",
  card_name: "Withdraw Now and Allow Me to Save Face",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_then_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { is_rested: true, cost_max: 6 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_shanks_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Shanks" },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-037 Are You That Afraid of the New Era?!! (Event) ────────────────

export const OP17_037_AFRAID_OF_THE_NEW_ERA: EffectSchema = {
  card_id: "OP17-037",
  card_name: "Are You That Afraid of the New Era?!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search_red_hair",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Red-Haired Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "counter_rest_card_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        {
          type: "CHOICE",
          labels: ["Rest 1 field card", "Rest 1 DON!! card"],
          options: [
            [
              {
                type: "REST_CARDS",
                amount: 1,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
            ],
            [{ type: "REST_DON", amount: 1 }],
          ],
        },
      ],
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
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-038 I Think He's Seen an Ugly Future... (Event) ──────────────────

export const OP17_038_UGLY_FUTURE: EffectSchema = {
  card_id: "OP17-038",
  card_name: "I Think He's Seen an Ugly Future...",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_character",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "CHOICE",
          labels: [
            "Rest 4 field cards",
            "Rest 3 field cards and 1 DON!! card",
            "Rest 2 field cards and 2 DON!! cards",
            "Rest 1 field card and 3 DON!! cards",
            "Rest 4 DON!! cards",
          ],
          options: [
            [
              {
                type: "REST_CARDS",
                amount: 4,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
            ],
            [
              {
                type: "REST_CARDS",
                amount: 3,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
              { type: "REST_DON", amount: 1 },
            ],
            [
              {
                type: "REST_CARDS",
                amount: 2,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
              { type: "REST_DON", amount: 2 },
            ],
            [
              {
                type: "REST_CARDS",
                amount: 1,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
              { type: "REST_DON", amount: 3 },
            ],
            [{ type: "REST_DON", amount: 4 }],
          ],
        },
      ],
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
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-039 Rocks.D.Xebec (Leader) ────────────────────────────────────────

export const OP17_039_ROCKS_D_XEBEC: EffectSchema = {
  card_id: "OP17-039",
  card_name: "Rocks.D.Xebec",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_reveal_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Rocks Pirates"] },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-040 Edward.Newgate (Character) ────────────────────────────────────

export const OP17_040_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP17-040",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "rocks_leader_attack_or_attacked_power",
      category: "auto",
      trigger: {
        any_of: [
          {
            keyword: "WHEN_ATTACKING",
            source_filter: {
              controller: "SELF",
              card_type: "LEADER",
              traits_contains: ["Rocks Pirates"],
            },
          },
          {
            keyword: "WHEN_ATTACKED",
            source_filter: {
              controller: "SELF",
              card_type: "LEADER",
              traits_contains: ["Rocks Pirates"],
            },
          },
        ],
      },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-042 Kaido (Character) ─────────────────────────────────────────────

export const OP17_042_KAIDO: EffectSchema = {
  card_id: "OP17-042",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_reveal_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 3,
          filter: { traits_contains: ["Rocks Pirates"] },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-043 Ganzui (Character) ────────────────────────────────────────────

export const OP17_043_GANZUI: EffectSchema = {
  card_id: "OP17-043",
  card_name: "Ganzui",
  card_type: "Character",
  effects: [
    {
      id: "removed_replacement_trash_hand",
      category: "replacement",
      replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" },
      replacement_actions: [
        { type: "TRASH_FROM_HAND", params: { amount: 2 } },
      ],
      flags: { optional: true },
    },
    {
      id: "on_play_set_leader_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { value: 6000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP17-044 Captain John (Character) ──────────────────────────────────────

export const OP17_044_CAPTAIN_JOHN: EffectSchema = {
  card_id: "OP17-044",
  card_name: "Captain John",
  card_type: "Character",
  effects: [
    {
      id: "rested_attack_taunt",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait_contains: "Rocks Pirates" },
          },
          { type: "SELF_STATE", required_state: "RESTED" },
        ],
      },
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { all: true },
          },
          scope: {
            controller: "OPPONENT",
            when_attacking: {
              type: "LEADER_OR_CHARACTER",
              controller: "EITHER",
              filter: { exclude_name: "Captain John" },
            },
          },
        },
      ],
    },
    {
      id: "activate_draw_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-045 Kyo (Character) ───────────────────────────────────────────────

export const OP17_045_KYO: EffectSchema = {
  card_id: "OP17-045",
  card_name: "Kyo",
  card_type: "Character",
  effects: [
    {
      id: "removed_replacement_trash_hand",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER" },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        { type: "TRASH_FROM_HAND", params: { amount: 2 } },
      ],
      flags: { optional: true },
    },
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP17-046 Gloriosa (Character) ──────────────────────────────────────────

export const OP17_046_GLORIOSA: EffectSchema = {
  card_id: "OP17-046",
  card_name: "Gloriosa",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
  ],
};

// ─── OP17-047 Shiki (Character) ─────────────────────────────────────────────

export const OP17_047_SHIKI: EffectSchema = {
  card_id: "OP17-047",
  card_name: "Shiki",
  card_type: "Character",
  effects: [
    {
      id: "end_turn_opponent_bottom_deck",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "RETURN_TO_DECK",
              target: {
                type: "CARD_IN_HAND",
                controller: "SELF",
                count: { exact: 1 },
              },
              params: { position: "BOTTOM" },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP17-048 Shiki (Character) ─────────────────────────────────────────────

export const OP17_048_SHIKI: EffectSchema = {
  card_id: "OP17-048",
  card_name: "Shiki",
  card_type: "Character",
  effects: [
    {
      id: "rush_character",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "attack_timing_debuff",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING" },
          { keyword: "ON_OPPONENT_ATTACK" },
        ],
      },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits_contains: ["Rocks Pirates"] },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-049 Charlotte Linlin (Character) ──────────────────────────────────

export const OP17_049_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "OP17-049",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_choice",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          // GAP: OPPONENT_CHOICE has no branch-feasibility contract, so the
          // exact-2 trash branch cannot be hidden when the opponent has fewer
          // than 2 cards without changing engine vocabulary.
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            labels: ["Draw 2 cards", "Trash 2 cards from hand"],
            options: [
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: { type: "DRAW", params: { amount: 2 } },
                  },
                },
              ],
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: {
                      type: "TRASH_CARD",
                      target: {
                        type: "CARD_IN_HAND",
                        controller: "SELF",
                        count: { exact: 2 },
                      },
                    },
                  },
                },
              ],
            ],
          },
        },
      ],
    },
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-050 Streusen (Character) ──────────────────────────────────────────

export const OP17_050_STREUSEN: EffectSchema = {
  card_id: "OP17-050",
  card_name: "Streusen",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DECK_SCRY", params: { look_at: 2 } },
        { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
      ],
    },
  ],
};

// ─── OP17-052 Don Marlon (Character) ───────────────────────────────────────

export const OP17_052_DON_MARLON: EffectSchema = {
  card_id: "OP17-052",
  card_name: "Don Marlon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_recover_event",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "EVENT_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { color: "BLUE", cost_exact: 0 },
          },
        },
      ],
    },
  ],
};

// ─── OP17-053 Barbell (Character) ──────────────────────────────────────────

export const OP17_053_BARBELL: EffectSchema = {
  card_id: "OP17-053",
  card_name: "Barbell",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_opponent_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "RETURN_TO_DECK",
              target: {
                type: "CARD_IN_HAND",
                controller: "SELF",
                count: { exact: 2 },
              },
              params: { position: "BOTTOM" },
            },
          },
        },
      ],
    },
    {
      id: "activate_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-054 Miss Buckingham Stussy (Character) ───────────────────────────

export const OP17_054_MISS_BUCKINGHAM_STUSSY: EffectSchema = {
  card_id: "OP17-054",
  card_name: "Miss Buckingham Stussy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 6 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "activate_cannot_attack",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 3 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-059 Aramaki (Character) ──────────────────────────────────────────

export const OP17_059_ARAMAKI: EffectSchema = {
  card_id: "OP17-059",
  card_name: "Aramaki",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_draw_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 2 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-060 Ulti & Page One (Character) ──────────────────────────────────

export const OP17_060_ULTI_PAGE_ONE: EffectSchema = {
  card_id: "OP17-060",
  card_name: "Ulti & Page One",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          // OPT-731: ADD_DON_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-061 Lead Performers (Character) ──────────────────────────────────

export const OP17_061_LEAD_PERFORMERS: EffectSchema = {
  card_id: "OP17-061",
  card_name: "Lead Performers",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          // OPT-731: ADD_TO_LIFE_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
    },
    {
      id: "activate_play_performer",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name_any_of: ["King", "Queen", "Jack"] },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-062 Kaido (Character) ────────────────────────────────────────────

export const OP17_062_KAIDO: EffectSchema = {
  card_id: "OP17-062",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "don_returned_refresh",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          // OPT-731: ADD_DON_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          // OPT-731: SET_DON_ACTIVE cannot yet model printed “up to 1”.
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP17-063 Kaido (Character) ────────────────────────────────────────────

export const OP17_063_KAIDO: EffectSchema = {
  card_id: "OP17-063",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "counter_grant_rule",
      category: "rule_modification",
      rule: {
        rule_type: "COUNTER_GRANT",
        value: 1000,
        filter: { card_type: "CHARACTER", has_counter: false },
      },
    },
    {
      id: "activate_negate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: { type: "WAS_PLAYED_THIS_TURN" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          duration: { type: "THIS_TURN" },
          result_ref: "negated_character",
        },
        { type: "KO", target_ref: "negated_character", chain: "THEN" },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP17-064 King (Character) ─────────────────────────────────────────────

export const OP17_064_KING: EffectSchema = {
  card_id: "OP17-064",
  card_name: "King",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-065 Queen (Character) ────────────────────────────────────────────

export const OP17_065_QUEEN: EffectSchema = {
  card_id: "OP17-065",
  card_name: "Queen",
  card_type: "Character",
  effects: [
    { id: "banish", category: "permanent", flags: { keywords: ["BANISH"] } },
    {
      id: "on_play_draw_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 5 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-066 Kurozumi Orochi (Character) ──────────────────────────────────

export const OP17_066_KUROZUMI_OROCHI: EffectSchema = {
  card_id: "OP17-066",
  card_name: "Kurozumi Orochi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 10 },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
      ],
    },
  ],
};

// ─── OP17-067 Kurozumi Kanjuro (Character) ─────────────────────────────────

export const OP17_067_KUROZUMI_KANJURO: EffectSchema = {
  card_id: "OP17-067",
  card_name: "Kurozumi Kanjuro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 10 },
      },
      actions: [
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        },
      ],
    },
  ],
};

// ─── OP17-068 Sasaki (Character) ───────────────────────────────────────────

export const OP17_068_SASAKI: EffectSchema = {
  card_id: "OP17-068",
  card_name: "Sasaki",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_add_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          // OPT-731: ADD_DON_FROM_DECK cannot yet model printed “up to 2”.
          type: "ADD_DON_FROM_DECK",
          params: { amount: 2, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-069 Jack (Character) ─────────────────────────────────────────────

export const OP17_069_JACK: EffectSchema = {
  card_id: "OP17-069",
  card_name: "Jack",
  card_type: "Character",
  effects: [
    { id: "rush_character", category: "permanent", flags: { keywords: ["RUSH_CHARACTER"] } },
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-071 Who's.Who (Character) ────────────────────────────────────────

export const OP17_071_WHOS_WHO: EffectSchema = {
  card_id: "OP17-071",
  card_name: "Who's.Who",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "KO",
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
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP17-072 Black Maria (Character) ──────────────────────────────────────

export const OP17_072_BLACK_MARIA: EffectSchema = {
  card_id: "OP17-072",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-073 Basil Hawkins (Character) ────────────────────────────────────

export const OP17_073_BASIL_HAWKINS: EffectSchema = {
  card_id: "OP17-073",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          // OPT-731: ADD_DON_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-074 Yamato (Character) ───────────────────────────────────────────

export const OP17_074_YAMATO: EffectSchema = {
  card_id: "OP17-074",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          // OPT-731: ADD_DON_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP17-075 X.Drake (Character) ──────────────────────────────────────────

export const OP17_075_X_DRAKE: EffectSchema = {
  card_id: "OP17-075",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: { type: "TRASH_FROM_HAND", params: { amount: 1 } },
          },
        },
      ],
    },
  ],
};

// ─── OP17-055 There's No Authority in the World That Lasts Forever (Event) ─

export const OP17_055_NO_AUTHORITY_LASTS_FOREVER: EffectSchema = {
  card_id: "OP17-055",
  card_name: "There's No Authority in the World That Lasts Forever!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_xebec_unblockable",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Rocks.D.Xebec" },
          },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_rocks_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Rocks Pirates"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-056 Rocks Pirates (Event) ─────────────────────────────────────────

export const OP17_056_ROCKS_PIRATES: EffectSchema = {
  card_id: "OP17-056",
  card_name: "Rocks Pirates",
  card_type: "Event",
  effects: [
    {
      id: "main_return_character",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 5 }],
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
      ],
      flags: { optional: true },
    },
    {
      id: "counter_rocks_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Rocks Pirates"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-057 Fullalead (Stage) ─────────────────────────────────────────────

export const OP17_057_FULLALEAD: EffectSchema = {
  card_id: "OP17-057",
  card_name: "Fullalead",
  card_type: "Stage",
  effects: [
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "REST_SELF" }, { type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Rocks Pirates"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-058 Kaido (Leader) ────────────────────────────────────────────────

export const OP17_058_KAIDO: EffectSchema = {
  card_id: "OP17-058",
  card_name: "Kaido",
  card_type: "Leader",
  effects: [
    {
      id: "attack_timing_debuff",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING" },
          { keyword: "ON_OPPONENT_ATTACK" },
        ],
      },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-076 Wo Ro Ro Ro Ro... I Think I've Sobered Up (Event) ────────────

export const OP17_076_I_THINK_IVE_SOBERED_UP: EffectSchema = {
  card_id: "OP17-076",
  card_name: "Wo Ro Ro Ro Ro... I Think I've Sobered Up",
  card_type: "Event",
  effects: [
    {
      id: "counter_trash_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      // Official print typo: "Charactes" is interpreted as "Characters".
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

// ─── OP17-077 Kundali Dragon Swarm (Event) ──────────────────────────────────

export const OP17_077_KUNDALI_DRAGON_SWARM: EffectSchema = {
  card_id: "OP17-077",
  card_name: "Kundali Dragon Swarm",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "REST_DON", amount: 3 },
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 3, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_leader_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-078 Drunken Dragon Bagua (Event) ──────────────────────────────────

export const OP17_078_DRUNKEN_DRAGON_BAGUA: EffectSchema = {
  card_id: "OP17-078",
  card_name: "Drunken Dragon Bagua",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "REST_DON", amount: 2 },
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 3, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_power",
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
      ],
    },
  ],
};

// ─── OP17-079 Monkey.D.Luffy (Leader) ───────────────────────────────────────

export const OP17_079_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP17-079",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "cost_12_blocker_aura",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { cost_min: 12 },
          },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP17-080 Usopp (Character) ─────────────────────────────────────────────

export const OP17_080_USOPP: EffectSchema = {
  card_id: "OP17-080",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_power",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
    {
      id: "on_play_search_elbaph",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Elbaph"] },
          },
        },
      ],
    },
  ],
};

// ─── OP17-081 Gerd (Character) ─────────────────────────────────────────────

export const OP17_081_GERD: EffectSchema = {
  card_id: "OP17-081",
  card_name: "Gerd",
  card_type: "Character",
  effects: [
    {
      id: "elbaph_leader_cost",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "LEADER_PROPERTY",
          controller: "SELF",
          property: { trait: "Elbaph" },
        },
      },
    },
    {
      id: "on_play_recover_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { cost_max: 8, exclude_name: "Gerd" },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-082 Sanji (Character) ────────────────────────────────────────────

export const OP17_082_SANJI: EffectSchema = {
  card_id: "OP17-082",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_power",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "THEN" },
      ],
    },
  ],
};

// ─── OP17-083 Jinbe (Character) ────────────────────────────────────────────

export const OP17_083_JINBE: EffectSchema = {
  card_id: "OP17-083",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_blocker_power",
      category: "permanent",
      modifiers: [
        { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" } },
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
  ],
};

// ─── OP17-084 Tony Tony.Chopper (Character) ────────────────────────────────

export const OP17_084_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP17-084",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_unblockable",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-085 Dorry (Character) ────────────────────────────────────────────

export const OP17_085_DORRY: EffectSchema = {
  card_id: "OP17-085",
  card_name: "Dorry",
  card_type: "Character",
  effects: [
    {
      id: "cost_increase",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } },
      ],
    },
    {
      id: "on_play_play_brogy",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Elbaph" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { name: "Brogy", cost_max: 5 },
          },
          params: { cost_override: "FREE" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "SELF" },
          params: { prohibition_type: "CANNOT_PLAY_CHARACTER" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-086 Nami (Character) ─────────────────────────────────────────────

export const OP17_086_NAMI: EffectSchema = {
  card_id: "OP17-086",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Elbaph"] } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-087 Nico Robin (Character) ───────────────────────────────────────

export const OP17_087_NICO_ROBIN: EffectSchema = {
  card_id: "OP17-087",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_power",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-089 Jaguar.D.Saul (Character) ────────────────────────────────────

export const OP17_089_JAGUAR_D_SAUL: EffectSchema = {
  card_id: "OP17-089",
  card_name: "Jaguar.D.Saul",
  card_type: "Character",
  effects: [
    {
      id: "cost_increase",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } },
      ],
    },
    {
      id: "on_play_search_elbaph",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Elbaph"] },
          },
        },
      ],
    },
  ],
};

// ─── OP17-090 Franky (Character) ───────────────────────────────────────────

export const OP17_090_FRANKY: EffectSchema = {
  card_id: "OP17-090",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_power",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP17-091 Brook (Character) ────────────────────────────────────────────

export const OP17_091_BROOK: EffectSchema = {
  card_id: "OP17-091",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_power",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
    {
      id: "on_play_opponent_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: { type: "TRASH_FROM_HAND", params: { amount: 1 } },
          },
        },
      ],
    },
  ],
};

// ─── OP17-092 Brogy (Character) ────────────────────────────────────────────

export const OP17_092_BROGY: EffectSchema = {
  card_id: "OP17-092",
  card_name: "Brogy",
  card_type: "Character",
  effects: [
    {
      id: "cost_increase",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } },
      ],
    },
    {
      id: "on_play_play_dorry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Elbaph" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { name: "Dorry", cost_max: 5 },
          },
          params: { cost_override: "FREE" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "SELF" },
          params: { prohibition_type: "CANNOT_PLAY_CHARACTER" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-093 Monkey.D.Luffy (Character) ───────────────────────────────────

export const OP17_093_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP17-093",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "cost_12_rush",
      category: "permanent",
      modifiers: [
        { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "RUSH" } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "BOARD_WIDE_EXISTENCE",
          filter: { card_type: "CHARACTER", cost_min: 12 },
        },
      },
    },
    {
      id: "on_play_draw_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-094 Rodo (Character) ─────────────────────────────────────────────

export const OP17_094_RODO: EffectSchema = {
  card_id: "OP17-094",
  card_name: "Rodo",
  card_type: "Character",
  effects: [
    {
      id: "elbaph_leader_cost",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          type: "LEADER_PROPERTY",
          controller: "SELF",
          property: { trait: "Elbaph" },
        },
      },
    },
  ],
};

// ─── OP17-096 I'm Luffy!! The Man Who Will Be King of the Pirates!! ─────────

export const OP17_096_IM_LUFFY: EffectSchema = {
  card_id: "OP17-096",
  card_name: "I'm Luffy!! The Man Who Will Be King of the Pirates!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_cost_12_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
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
      id: "trigger_recover_elbaph",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Elbaph"] },
          },
        },
      ],
    },
  ],
};

// ─── OP17-097 I'll Feed on This Rage and Use It to Bring the World to Ruin ──

export const OP17_097_FEED_ON_THIS_RAGE: EffectSchema = {
  card_id: "OP17-097",
  card_name: "I'll Feed on This Rage and Use It to Bring the World to Ruin!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_all_opponent_cost",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_leader_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-098 Gum-Gum Kong Gun (Event) ──────────────────────────────────────

export const OP17_098_GUM_GUM_KONG_GUN: EffectSchema = {
  card_id: "OP17-098",
  card_name: "Gum-Gum Kong Gun",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_12_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      post_cost_conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 6 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_leader_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-099 Charlotte Linlin (Leader) ─────────────────────────────────────

export const OP17_099_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "OP17-099",
  card_name: "Charlotte Linlin",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_opponent_choice",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            labels: ["Trash 1 card; add 1 Life", "Trash 1 card from hand"],
            options: [
              [
                { type: "TRASH_FROM_HAND", params: { amount: 1 } },
                {
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP", face: "DOWN" },
                  chain: "THEN",
                },
              ],
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: {
                      type: "TRASH_CARD",
                      target: {
                        type: "CARD_IN_HAND",
                        controller: "SELF",
                        count: { exact: 1 },
                      },
                    },
                  },
                },
              ],
            ],
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-101 Caribou (Character) ───────────────────────────────────────────

export const OP17_101_CARIBOU: EffectSchema = {
  card_id: "OP17-101",
  card_name: "Caribou",
  card_type: "Character",
  effects: [
    {
      id: "activate_life_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "trigger_trash_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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

// ─── OP17-102 Charlotte Oven (Character) ────────────────────────────────────

export const OP17_102_CHARLOTTE_OVEN: EffectSchema = {
  card_id: "OP17-102",
  card_name: "Charlotte Oven",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { power_max: 4000, exclude_name: "Charlotte Oven" },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
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

// ─── OP17-103 Charlotte Katakuri (Character) ────────────────────────────────

export const OP17_103_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "OP17-103",
  card_name: "Charlotte Katakuri",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Big Mom Pirates" },
      },
      actions: [
        {
          // OPT-731: ADD_TO_LIFE_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
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

// ─── OP17-104 Charlotte Cracker (Character) ─────────────────────────────────

export const OP17_104_CHARLOTTE_CRACKER: EffectSchema = {
  card_id: "OP17-104",
  card_name: "Charlotte Cracker",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_don_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      costs: [{ type: "REST_DON", amount: 2 }],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Big Mom Pirates" },
      },
      actions: [
        {
          // OPT-731: ADD_TO_LIFE_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
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

// ─── OP17-105 Charlotte Chiffon (Character) ─────────────────────────────────

export const OP17_105_CHARLOTTE_CHIFFON: EffectSchema = {
  card_id: "OP17-105",
  card_name: "Charlotte Chiffon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_trigger_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { has_trigger: true },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-106 Charlotte Smoothie (Character) ────────────────────────────────

export const OP17_106_CHARLOTTE_SMOOTHIE: EffectSchema = {
  card_id: "OP17-106",
  card_name: "Charlotte Smoothie",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_opponent_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        {
          // OPT-731: ADD_TO_LIFE_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_CARD",
              target: {
                type: "CARD_IN_HAND",
                controller: "SELF",
                count: { exact: 1 },
              },
            },
          },
          chain: "THEN",
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

// ─── OP17-107 Charlotte Daifuku (Character) ─────────────────────────────────

export const OP17_107_CHARLOTTE_DAIFUKU: EffectSchema = {
  card_id: "OP17-107",
  card_name: "Charlotte Daifuku",
  card_type: "Character",
  effects: [
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP17-108 Charlotte Brulee (Character) ─────────────────────────────────

export const OP17_108_CHARLOTTE_BRULEE: EffectSchema = {
  card_id: "OP17-108",
  card_name: "Charlotte Brulee",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "trigger_rest_character",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

// ─── OP17-109 Charlotte Pudding (Character) ────────────────────────────────

export const OP17_109_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "OP17-109",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } }],
      actions: [{ type: "DRAW", params: { amount: 3 } }],
      flags: { optional: true },
    },
    {
      id: "trigger_search_big_mom_pirates",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Big Mom Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP17-110 Charlotte Perospero (Character) ──────────────────────────────

export const OP17_110_CHARLOTTE_PEROSPERO: EffectSchema = {
  card_id: "OP17-110",
  card_name: "Charlotte Perospero",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_and_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Big Mom Pirates"], cost_max: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
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

// ─── OP17-111 Charlotte Mont-d'or (Character) ──────────────────────────────

export const OP17_111_CHARLOTTE_MONT_DOR: EffectSchema = {
  card_id: "OP17-111",
  card_name: "Charlotte Mont-d'or",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 2, filter: { has_trigger: true } }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 1 },
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

// ─── OP17-112 Charlotte Linlin (Character) ─────────────────────────────────

export const OP17_112_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "OP17-112",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_trigger_base_power",
      category: "permanent",
      modifiers: [
        {
          type: "SET_BASE_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { has_trigger: true, base_power_exact: 4000 },
          },
          params: { value: 8000 },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "IS_MY_TURN", controller: "SELF" },
      },
    },
    {
      id: "on_play_draw_choose_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAYER_CHOICE",
          params: {
            mandatory: true,
            labels: ["Add your top deck card to Life", "Take opponent's top Life"],
            options: [
              [
                {
                  // OPT-731: ADD_TO_LIFE_FROM_DECK cannot yet model printed “up to 1”.
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP", face: "DOWN" },
                },
              ],
              [
                {
                  type: "LIFE_TO_HAND",
                  target: { type: "OPPONENT_LIFE", count: { up_to: 1 } },
                  params: { amount: 1, position: "TOP" },
                },
              ],
            ],
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-113 Streusen (Character) ─────────────────────────────────────────

export const OP17_113_STREUSEN: EffectSchema = {
  card_id: "OP17-113",
  card_name: "Streusen",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_big_mom",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Big Mom Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP17-114 Sweet 3 Generals (Character) ─────────────────────────────────

export const OP17_114_SWEET_3_GENERALS: EffectSchema = {
  card_id: "OP17-114",
  card_name: "Sweet 3 Generals",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_life_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          // OPT-731: ADD_TO_LIFE_FROM_DECK cannot yet model printed “up to 1”.
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
          chain: "THEN",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
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

// ─── OP17-115 Don't You Know... There's Still a Code of Honor?!! (Event) ───

export const OP17_115_CODE_OF_HONOR: EffectSchema = {
  card_id: "OP17-115",
  card_name:
    "Don't you know that even in the cruel world of pirates there's still a code of honor?!!",
  card_type: "Event",
  effects: [
    {
      id: "main_linlin_unblockable",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Charlotte Linlin" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "YOUR_LEADER" },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_linlin_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-117 Maser Saber (Event) ───────────────────────────────────────────

export const OP17_117_MASER_SABER: EffectSchema = {
  card_id: "OP17-117",
  card_name: "Maser Saber",
  card_type: "Event",
  effects: [
    {
      id: "counter_linlin_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_discard_or_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            labels: ["Trash 3 cards from hand", "K.O. a Character"],
            options: [
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: {
                      type: "TRASH_CARD",
                      requires: { type: "FULL_TARGET_COUNT" },
                      target: {
                        type: "CARD_IN_HAND",
                        controller: "SELF",
                        count: { exact: 3 },
                      },
                    },
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
                    filter: { cost_max: 6 },
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

// ─── OP17-118 Rocks.D.Xebec (Character) ──────────────────────────────────────

export const OP17_118_ROCKS_D_XEBEC: EffectSchema = {
  card_id: "OP17-118",
  card_name: "Rocks.D.Xebec",
  card_type: "Character",
  effects: [
    {
      id: "hand_counter_grant",
      category: "rule_modification",
      source_text:
        "If you only have Characters without a Counter, this card in your hand has a +2000 Counter.",
      zone: "HAND",
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { card_type: "CHARACTER", has_counter: true },
        },
      },
      rule: {
        rule_type: "COUNTER_GRANT",
        value: 2000,
        filter: { card_type: "CHARACTER" },
      },
    },
    {
      id: "on_play_draw_and_play",
      category: "auto",
      source_text:
        "[On Play] Draw 1 card and play up to 2 {Rocks Pirates} type cards with different card names and a total cost of 9 or less from your hand.",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 2 },
            filter: { traits: ["Rocks Pirates"] },
            uniqueness_constraint: { field: "name" },
            aggregate_constraint: { property: "cost", operator: "<=", value: 9 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-119 Loki (Character) ─────────────────────────────────────────────

export const OP17_119_LOKI: EffectSchema = {
  card_id: "OP17-119",
  card_name: "Loki",
  card_type: "Character",
  effects: [
    {
      id: "cost_increase",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } },
      ],
    },
    {
      id: "opponent_turn_power",
      category: "permanent",
      modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
      },
    },
    {
      id: "on_play_ko_aggregate",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { any_number: true },
            aggregate_constraint: {
              property: "cost",
              operator: "<=",
              value: 4,
            },
          },
        },
      ],
    },
  ],
};

export const OP17_SCHEMAS: Record<string, EffectSchema> = {
  "OP17-001": OP17_001_EDWARD_NEWGATE,
  "OP17-002": OP17_002_ATMOS,
  "OP17-003": OP17_003_IZO,
  "OP17-004": OP17_004_INUARASHI_NEKOMAMUSHI,
  "OP17-005": OP17_005_EDWARD_NEWGATE,
  "OP17-007": OP17_007_KOUZUKI_ODEN,
  "OP17-008": OP17_008_JOZU,
  "OP17-009": OP17_009_HARUTA,
  "OP17-010": OP17_010_FOSSA,
  "OP17-011": OP17_011_BLAMENCO,
  "OP17-012": OP17_012_BLENHEIM,
  "OP17-013": OP17_013_PORTGAS_D_ACE,
  "OP17-014": OP17_014_WHITEY_BAY,
  "OP17-015": OP17_015_MARCO,
  "OP17-016": OP17_016_RAKUYO,
  "OP17-017": OP17_017_GA_HA_HA_HA,
  "OP17-019": OP17_019_I_DONT_HAVE_TIME_TO_CHAT,
  "OP17-020": OP17_020_SHANKS,
  "OP17-021": OP17_021_CRONE_OLI,
  "OP17-022": OP17_022_SHANKS,
  "OP17-023": OP17_023_NAMI,
  "OP17-024": OP17_024_HOWLING_GAB,
  "OP17-025": OP17_025_BUILDING_SNAKE,
  "OP17-026": OP17_026_FUGAR,
  "OP17-027": OP17_027_BENN_BECKMAN,
  "OP17-028": OP17_028_BONK_PUNCH_MONSTER,
  "OP17-029": OP17_029_HONGO,
  "OP17-030": OP17_030_MONKEY_D_LUFFY,
  "OP17-031": OP17_031_YASOPP,
  "OP17-032": OP17_032_LIMEJUICE,
  "OP17-033": OP17_033_LUCKY_ROUX,
  "OP17-034": OP17_034_ROCKSTAR,
  "OP17-036": OP17_036_WITHDRAW_NOW,
  "OP17-037": OP17_037_AFRAID_OF_THE_NEW_ERA,
  "OP17-038": OP17_038_UGLY_FUTURE,
  "OP17-039": OP17_039_ROCKS_D_XEBEC,
  "OP17-040": OP17_040_EDWARD_NEWGATE,
  "OP17-042": OP17_042_KAIDO,
  "OP17-043": OP17_043_GANZUI,
  "OP17-044": OP17_044_CAPTAIN_JOHN,
  "OP17-045": OP17_045_KYO,
  "OP17-046": OP17_046_GLORIOSA,
  "OP17-047": OP17_047_SHIKI,
  "OP17-048": OP17_048_SHIKI,
  "OP17-049": OP17_049_CHARLOTTE_LINLIN,
  "OP17-050": OP17_050_STREUSEN,
  "OP17-052": OP17_052_DON_MARLON,
  "OP17-053": OP17_053_BARBELL,
  "OP17-054": OP17_054_MISS_BUCKINGHAM_STUSSY,
  "OP17-055": OP17_055_NO_AUTHORITY_LASTS_FOREVER,
  "OP17-056": OP17_056_ROCKS_PIRATES,
  "OP17-057": OP17_057_FULLALEAD,
  "OP17-058": OP17_058_KAIDO,
  "OP17-059": OP17_059_ARAMAKI,
  "OP17-060": OP17_060_ULTI_PAGE_ONE,
  "OP17-061": OP17_061_LEAD_PERFORMERS,
  "OP17-062": OP17_062_KAIDO,
  "OP17-063": OP17_063_KAIDO,
  "OP17-064": OP17_064_KING,
  "OP17-065": OP17_065_QUEEN,
  "OP17-066": OP17_066_KUROZUMI_OROCHI,
  "OP17-067": OP17_067_KUROZUMI_KANJURO,
  "OP17-068": OP17_068_SASAKI,
  "OP17-069": OP17_069_JACK,
  "OP17-071": OP17_071_WHOS_WHO,
  "OP17-072": OP17_072_BLACK_MARIA,
  "OP17-073": OP17_073_BASIL_HAWKINS,
  "OP17-074": OP17_074_YAMATO,
  "OP17-075": OP17_075_X_DRAKE,
  "OP17-076": OP17_076_I_THINK_IVE_SOBERED_UP,
  "OP17-077": OP17_077_KUNDALI_DRAGON_SWARM,
  "OP17-078": OP17_078_DRUNKEN_DRAGON_BAGUA,
  "OP17-079": OP17_079_MONKEY_D_LUFFY,
  "OP17-080": OP17_080_USOPP,
  "OP17-081": OP17_081_GERD,
  "OP17-082": OP17_082_SANJI,
  "OP17-083": OP17_083_JINBE,
  "OP17-084": OP17_084_TONY_TONY_CHOPPER,
  "OP17-085": OP17_085_DORRY,
  "OP17-086": OP17_086_NAMI,
  "OP17-087": OP17_087_NICO_ROBIN,
  "OP17-089": OP17_089_JAGUAR_D_SAUL,
  "OP17-090": OP17_090_FRANKY,
  "OP17-091": OP17_091_BROOK,
  "OP17-092": OP17_092_BROGY,
  "OP17-093": OP17_093_MONKEY_D_LUFFY,
  "OP17-094": OP17_094_RODO,
  "OP17-096": OP17_096_IM_LUFFY,
  "OP17-097": OP17_097_FEED_ON_THIS_RAGE,
  "OP17-098": OP17_098_GUM_GUM_KONG_GUN,
  "OP17-099": OP17_099_CHARLOTTE_LINLIN,
  "OP17-101": OP17_101_CARIBOU,
  "OP17-102": OP17_102_CHARLOTTE_OVEN,
  "OP17-103": OP17_103_CHARLOTTE_KATAKURI,
  "OP17-104": OP17_104_CHARLOTTE_CRACKER,
  "OP17-105": OP17_105_CHARLOTTE_CHIFFON,
  "OP17-106": OP17_106_CHARLOTTE_SMOOTHIE,
  "OP17-107": OP17_107_CHARLOTTE_DAIFUKU,
  "OP17-108": OP17_108_CHARLOTTE_BRULEE,
  "OP17-109": OP17_109_CHARLOTTE_PUDDING,
  "OP17-110": OP17_110_CHARLOTTE_PEROSPERO,
  "OP17-111": OP17_111_CHARLOTTE_MONT_DOR,
  "OP17-112": OP17_112_CHARLOTTE_LINLIN,
  "OP17-113": OP17_113_STREUSEN,
  "OP17-114": OP17_114_SWEET_3_GENERALS,
  "OP17-115": OP17_115_CODE_OF_HONOR,
  "OP17-117": OP17_117_MASER_SABER,
  "OP17-118": OP17_118_ROCKS_D_XEBEC,
  "OP17-119": OP17_119_LOKI,
};
