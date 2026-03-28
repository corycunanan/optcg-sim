/**
 * OP09 Effect Schemas
 *
 * Red (Shanks / Red-Haired Pirates): OP09-001 to OP09-021
 * Green (Lim / ODYSSEY): OP09-022 to OP09-041
 * Blue (Buggy / Cross Guild): OP09-042 to OP09-060
 * Purple (Luffy / Straw Hat Crew / Kid Pirates): OP09-061 to OP09-080
 * Black (Marshall.D.Teach / Blackbeard Pirates): OP09-081 to OP09-099
 * Yellow (Revolutionary Army / Ohara): OP09-100 to OP09-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Shanks / Red-Haired Pirates (OP09-001 to OP09-021)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP09-001 Shanks (Leader) ──────────────────────────────────────────────────
// [Once Per Turn] This effect can be activated when your opponent attacks. Give
// up to 1 of your opponent's Leader or Character cards −1000 power during this turn.

export const OP09_001_SHANKS: EffectSchema = {
  card_id: "OP09-001",
  card_name: "Shanks",
  card_type: "Leader",
  effects: [
    {
      id: "on_opponent_attack_debuff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
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

// ─── OP09-002 Uta (Character) ──────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Red-Haired Pirates} type card and add it to your hand. Then, place the rest
// at the bottom of your deck in any order.

export const OP09_002_UTA: EffectSchema = {
  card_id: "OP09-002",
  card_name: "Uta",
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
            filter: { traits: ["Red-Haired Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP09-003 Shachi & Penguin (Character) ─────────────────────────────────────
// [When Attacking] Give up to 1 of your opponent's Characters −2000 power during
// this turn.

export const OP09_003_SHACHI_AND_PENGUIN: EffectSchema = {
  card_id: "OP09-003",
  card_name: "Shachi & Penguin",
  card_type: "Character",
  effects: [
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
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-004 Shanks (Character) ───────────────────────────────────────────────
// Give all of your opponent's Characters −1000 power.
// [Rush]

export const OP09_004_SHANKS: EffectSchema = {
  card_id: "OP09-004",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "permanent_debuff_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -1000 },
        },
      ],
    },
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
  ],
};

// ─── OP09-005 Silvers Rayleigh (Character) ─────────────────────────────────────
// [Blocker]
// [On Play] If your opponent has 2 or more Characters with a base power of 5000
// or more, draw 2 cards and trash 1 card from your hand.

export const OP09_005_SILVERS_RAYLEIGH: EffectSchema = {
  card_id: "OP09-005",
  card_name: "Silvers Rayleigh",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_and_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { base_power_min: 5000 },
        count: { operator: ">=", value: 2 },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP09-007 Heat (Character) ─────────────────────────────────────────────────
// [Blocker]
// [On Play] Up to 1 of your Leader with 4000 power or less gains +1000 power
// during this turn.

export const OP09_007_HEAT: EffectSchema = {
  card_id: "OP09-007",
  card_name: "Heat",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_leader_buff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { power: { operator: "<=", value: 4000 } },
      },
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

// ─── OP09-008 Building Snake (Character) ───────────────────────────────────────
// [Activate: Main] You may place this Character at the bottom of the owner's
// deck: Give up to 1 of your opponent's Characters −3000 power during this turn.

export const OP09_008_BUILDING_SNAKE: EffectSchema = {
  card_id: "OP09-008",
  card_name: "Building Snake",
  card_type: "Character",
  effects: [
    {
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "PLACE_OWN_CHARACTER_TO_DECK", position: "BOTTOM" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-009 Benn.Beckman (Character) ─────────────────────────────────────────
// [On Play] Trash up to 1 of your opponent's Characters with 6000 power or less.

export const OP09_009_BENN_BECKMAN: EffectSchema = {
  card_id: "OP09-009",
  card_name: "Benn.Beckman",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TRASH_CARD",
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

// ─── OP09-010 Bonk Punch (Character) ───────────────────────────────────────────
// [On Play] Play up to 1 [Monster] from your hand.
// [DON!! x1] [When Attacking] This Character gains +2000 power during this turn.

export const OP09_010_BONK_PUNCH: EffectSchema = {
  card_id: "OP09-010",
  card_name: "Bonk Punch",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_monster",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Monster" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-011 Hongo (Character) ────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: If your Leader has the
// {Red-Haired Pirates} type, give up to 1 of your opponent's Characters −2000
// power during this turn.

export const OP09_011_HONGO: EffectSchema = {
  card_id: "OP09-011",
  card_name: "Hongo",
  card_type: "Character",
  effects: [
    {
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
      },
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
    },
  ],
};

// ─── OP09-012 Monster (Character) ──────────────────────────────────────────────
// If your Character [Bonk Punch] would be K.O.'d by an effect, you may trash
// this Character instead.

export const OP09_012_MONSTER: EffectSchema = {
  card_id: "OP09-012",
  card_name: "Monster",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement_for_bonk_punch",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: { name: "Bonk Punch" },
        cause_filter: { by: "ANY_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_CARD",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP09-013 Yasopp (Character) ───────────────────────────────────────────────
// [On Play] Up to 1 of your Leader gains +1000 power until the end of your
// opponent's next turn.
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters −1000
// power during this turn.

export const OP09_013_YASOPP: EffectSchema = {
  card_id: "OP09-013",
  card_name: "Yasopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_leader_buff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP09-014 Limejuice (Character) ────────────────────────────────────────────
// [On Play] Your opponent cannot activate up to 1 [Blocker] Character that has
// 4000 power or less during this turn.

export const OP09_014_LIMEJUICE: EffectSchema = {
  card_id: "OP09-014",
  card_name: "Limejuice",
  card_type: "Character",
  effects: [
    {
      id: "on_play_block_prohibition",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { keywords: ["BLOCKER"], power_max: 4000 },
          },
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-015 Lucky.Roux (Character) ───────────────────────────────────────────
// [Blocker]
// [On K.O.] If your Leader has the {Red-Haired Pirates} type, K.O. up to 1 of
// your opponent's Characters with a base power of 6000 or less.

export const OP09_015_LUCKY_ROUX: EffectSchema = {
  card_id: "OP09-015",
  card_name: "Lucky.Roux",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_ko_opponent",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 6000 },
          },
        },
      ],
    },
  ],
};

// ─── OP09-017 Wire (Character) ─────────────────────────────────────────────────
// [DON!! x1] If your Leader has 7000 power or more and the {Kid Pirates} type,
// this Character gains [Rush].

export const OP09_017_WIRE: EffectSchema = {
  card_id: "OP09-017",
  card_name: "Wire",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { power: { operator: ">=", value: 7000 } },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Kid Pirates" },
          },
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "SPECIFIC_CARD",
            operator: ">=",
            value: 1,
          },
        ],
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
  ],
};

// ─── OP09-018 Get Out of Here! (Event) ─────────────────────────────────────────
// [Main] K.O. up to 2 of your opponent's Characters with a total power of 4000
// or less.

export const OP09_018_GET_OUT_OF_HERE: EffectSchema = {
  card_id: "OP09-018",
  card_name: "Get Out of Here!",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_aggregate",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            aggregate_constraint: {
              property: "power",
              operator: "<=",
              value: 4000,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP09-019 Nobody Hurts a Friend of Mine!!!! (Event) ────────────────────────
// [Main] If your Leader has the {Red-Haired Pirates} type, give up to 1 of your
// opponent's Characters −3000 power during this turn. Then, if your opponent has
// a Character with 5000 or more power, draw 1 card.
// [Trigger] Draw 1 card.

export const OP09_019_NOBODY_HURTS_A_FRIEND_OF_MINE: EffectSchema = {
  card_id: "OP09-019",
  card_name: "Nobody Hurts a Friend of Mine!!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff_and_draw",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { power_min: 5000 },
            count: { operator: ">=", value: 1 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP09-020 Come On!! We'll Fight You!! (Event) ──────────────────────────────
// [Main] Look at 5 cards from the top of your deck; reveal up to 1
// {Red-Haired Pirates} type card other than [Come On!! We'll Fight You!!] and
// add it to your hand. Then, place the rest at the bottom of your deck.
// [Trigger] Draw 1 card.

export const OP09_020_COME_ON_WELL_FIGHT_YOU: EffectSchema = {
  card_id: "OP09-020",
  card_name: "Come On!! We'll Fight You!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Red-Haired Pirates"],
              exclude_name: "Come On!! We'll Fight You!!",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP09-021 Red Force (Stage) ────────────────────────────────────────────────
// [Activate: Main] You may rest this Stage: If your Leader has the
// {Red-Haired Pirates} type, give up to 1 of your opponent's Characters −1000
// power during this turn.

export const OP09_021_RED_FORCE: EffectSchema = {
  card_id: "OP09-021",
  card_name: "Red Force",
  card_type: "Stage",
  effects: [
    {
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
      },
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

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — ODYSSEY (OP09-022 to OP09-041)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP09-022 Lim (Leader) ─────────────────────────────────────────────────────
// Your Character cards are played rested.
// [Activate: Main] [Once Per Turn] You may rest 3 of your DON!! cards: Add up to
// 1 DON!! card from your DON!! deck and rest it, and play up to 1 {ODYSSEY} type
// Character card with a cost of 5 or less from your hand.

export const OP09_022_LIM: EffectSchema = {
  card_id: "OP09-022",
  card_name: "Lim",
  card_type: "Leader",
  effects: [
    {
      id: "play_state_mod",
      category: "rule_modification",
      rule: { rule_type: "PLAY_STATE_MOD", card_type: "CHARACTER", entry_state: "RESTED" },
    },
    {
      id: "activate_add_don_and_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 3 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["ODYSSEY"], cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP09-023 Adio (Character) ─────────────────────────────────────────────────
// [On Play] If your Leader has the {ODYSSEY} type, set up to 3 of your DON!!
// cards as active.
// [On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!! cards:
// Up to 1 of your Leader or Character cards gains +2000 power during this battle.

export const OP09_023_ADIO: EffectSchema = {
  card_id: "OP09-023",
  card_name: "Adio",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_don_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "ODYSSEY" },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "on_opponent_attack_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 1 }],
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
  ],
};

// ─── OP09-024 Usopp (Character) ────────────────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, draw 2 cards and trash 2
// cards from your hand.

export const OP09_024_USOPP: EffectSchema = {
  card_id: "OP09-024",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP09-025 Crocodile (Character) ────────────────────────────────────────────
// If your Leader has the {ODYSSEY} type, this Character cannot be K.O.'d in
// battle by Leaders.

export const OP09_025_CROCODILE: EffectSchema = {
  card_id: "OP09-025",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection_vs_leaders",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "ODYSSEY" },
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE", source_filter: { card_type: "LEADER" } },
        },
      ],
    },
  ],
};

// ─── OP09-026 Sakazuki (Character) ─────────────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, K.O. up to 1 of your
// opponent's Characters with a cost of 5 or less.

export const OP09_026_SAKAZUKI: EffectSchema = {
  card_id: "OP09-026",
  card_name: "Sakazuki",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
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

// ─── OP09-027 Sabo (Character) ─────────────────────────────────────────────────
// [When Attacking] [Once Per Turn] If you have 3 or more rested Characters,
// draw 1 card.

export const OP09_027_SABO: EffectSchema = {
  card_id: "OP09-027",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { once_per_turn: true },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 3,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP09-028 Sanji (Character) ────────────────────────────────────────────────
// [On K.O.] You may add 1 card from the top or bottom of your Life cards to your
// hand: Play up to 1 {ODYSSEY} or {Straw Hat Crew} type Character card with a
// cost of 4 or less from your trash rested.

export const OP09_028_SANJI: EffectSchema = {
  card_id: "OP09-028",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["ODYSSEY", "Straw Hat Crew"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-029 Tony Tony.Chopper (Character) ────────────────────────────────────
// [End of Your Turn] Set up to 1 of your {ODYSSEY} type Characters with a cost
// of 4 or less as active.

export const OP09_029_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP09-029",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "eot_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["ODYSSEY"], cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP09-030 Trafalgar Law (Character) ────────────────────────────────────────
// [On Play] You may return 1 of your Characters to the owner's hand: Play up to
// 1 {ODYSSEY} type Character card with a cost of 3 or less other than
// [Trafalgar Law] from your hand.

export const OP09_030_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP09-030",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["ODYSSEY"],
              cost_max: 3,
              exclude_name: "Trafalgar Law",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-031 Donquixote Doflamingo (Character) ────────────────────────────────
// [Blocker]
// [End of Your Turn] If you have 2 or more rested Characters, set this Character
// as active.

export const OP09_031_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP09-031",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "eot_set_self_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
    },
  ],
};

// ─── OP09-032 Donquixote Rosinante (Character) ─────────────────────────────────
// [Blocker]
// [On Your Opponent's Attack] [Once Per Turn] Set this Character as active.

export const OP09_032_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP09-032",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_opponent_attack_set_active",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
    },
  ],
};

// ─── OP09-033 Nico Robin (Character) ───────────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, none of your {ODYSSEY} or
// {Straw Hat Crew} type Characters can be K.O.'d by effects until the end of
// your opponent's next turn.

export const OP09_033_NICO_ROBIN: EffectSchema = {
  card_id: "OP09-033",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_protection",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits_any_of: ["ODYSSEY", "Straw Hat Crew"] },
          },
          params: {
            prohibition_type: "CANNOT_BE_KO",
            scope: { cause: "BY_EFFECT" },
          },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-034 Perona (Character) ───────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// [Dracule Mihawk] or {Thriller Bark Pirates} type card and add it to your hand.
// Then, place the rest at the bottom of your deck in any order and trash 1 card
// from your hand.

export const OP09_034_PERONA: EffectSchema = {
  card_id: "OP09-034",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Dracule Mihawk" },
                { traits: ["Thriller Bark Pirates"] },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-035 Portgas.D.Ace (Character) ────────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, rest up to 1 of your
// opponent's Characters with a cost of 5 or less.

export const OP09_035_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP09-035",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
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

// ─── OP09-036 Monkey.D.Luffy (Character) ───────────────────────────────────────
// [On Play] If you have 2 or more rested Characters, rest up to 1 of your
// opponent's DON!! cards or Characters with a cost of 6 or less.

export const OP09_036_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP09-036",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_don_or_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            controller: "OPPONENT",
            count: { up_to: 1 },
            mixed_pool: {
              types: ["DON_IN_COST_AREA", "CHARACTER"],
              total_count: { up_to: 1 },
            },
            filter: { cost_max: 6 },
          },
        },
      ],
    },
  ],
};

// ─── OP09-037 Lim (Character) ──────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {ODYSSEY}
// type card other than [Lim] and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// [End of Your Turn] If you have 3 or more rested Characters, set this Character
// as active.

export const OP09_037_LIM: EffectSchema = {
  card_id: "OP09-037",
  card_name: "Lim",
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
            filter: { traits: ["ODYSSEY"], exclude_name: "Lim" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "eot_set_self_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 3,
      },
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
    },
  ],
};

// ─── OP09-039 Gum-Gum Cuatro Jet Cross Shock Bazooka (Event) ──────────────────
// [Counter] If your Leader has the {ODYSSEY} type and you have 2 or more rested
// Characters, up to 1 of your Leader or Character cards gains +2000 power during
// this turn.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of 4
// or less.

export const OP09_039_GUM_GUM_CUATRO_JET_CROSS_SHOCK_BAZOOKA: EffectSchema = {
  card_id: "OP09-039",
  card_name: "Gum-Gum Cuatro Jet Cross Shock Bazooka",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "ODYSSEY" } },
          { type: "RESTED_CARD_COUNT", controller: "SELF", operator: ">=", value: 2 },
        ],
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
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
            filter: { is_rested: true, cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP09-040 Thunder Lance Flip Caliber Phoenix Shot (Event) ──────────────────
// [Main] If you have 2 or more rested Characters, K.O. up to 1 of your opponent's
// Characters with a cost of 4 or less.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP09_040_THUNDER_LANCE_FLIP_CALIBER_PHOENIX_SHOT: EffectSchema = {
  card_id: "OP09-040",
  card_name: "Thunder Lance Flip Caliber Phoenix Shot",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
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
      id: "trigger_rest",
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

// ─── OP09-041 Soul Franky Swing Arm Boxing Solid (Event) ───────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if your Leader has the {ODYSSEY} type and you have 2 or more
// rested Characters, set up to 2 of your Characters as active.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP09_041_SOUL_FRANKY_SWING_ARM_BOXING_SOLID: EffectSchema = {
  card_id: "OP09-041",
  card_name: "Soul Franky Swing Arm Boxing Solid",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_set_active",
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
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 2 },
          },
          conditions: {
            all_of: [
              { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "ODYSSEY" } },
              { type: "RESTED_CARD_COUNT", controller: "SELF", operator: ">=", value: 2 },
            ],
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_rest",
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Cross Guild / Whitebeard Pirates (OP09-042 to OP09-060)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP09-042 Buggy (Leader) ───────────────────────────────────────────────────
// [Activate: Main] You may rest 5 of your DON!! cards and trash 1 card from your
// hand: Play up to 1 {Cross Guild} type Character card from your hand.

export const OP09_042_BUGGY: EffectSchema = {
  card_id: "OP09-042",
  card_name: "Buggy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_play_cross_guild",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 5 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Cross Guild"] },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-043 Alvida (Character) ───────────────────────────────────────────────
// [On K.O.] If your Leader has the {Cross Guild} type, play up to 1 Character
// card with a cost of 5 or less other than [Alvida] from your hand.

export const OP09_043_ALVIDA: EffectSchema = {
  card_id: "OP09-043",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Cross Guild" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 5, exclude_name: "Alvida" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-044 Izo (Character) ──────────────────────────────────────────────────
// [When Attacking] Look at 5 cards from the top of your deck; reveal up to 1
// {Land of Wano} type card or card with a type including "Whitebeard Pirates"
// and add it to your hand. Then, place the rest at the bottom of your deck in
// any order and trash 1 card from your hand.

export const OP09_044_IZO: EffectSchema = {
  card_id: "OP09-044",
  card_name: "Izo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_search",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { traits: ["Land of Wano"] },
                { traits_contains: ["Whitebeard Pirates"] },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-045 Cabaji (Character) ───────────────────────────────────────────────
// If you have a [Buggy] or [Mohji] Character, this Character cannot be K.O.'d
// in battle.

export const OP09_045_CABAJI: EffectSchema = {
  card_id: "OP09-045",
  card_name: "Cabaji",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection_in_battle",
      category: "permanent",
      conditions: {
        any_of: [
          { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Buggy", card_type: "CHARACTER" } },
          { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Mohji", card_type: "CHARACTER" } },
        ],
      },
      prohibitions: [
        { type: "CANNOT_BE_KO", scope: { cause: "BATTLE" } },
      ],
    },
  ],
};

// ─── OP09-046 Crocodile (Character) ────────────────────────────────────────────
// [On Play] Play up to 1 {Cross Guild} type Character card or Character card
// with a type including "Baroque Works" with a cost of 5 or less from your hand.

export const OP09_046_CROCODILE: EffectSchema = {
  card_id: "OP09-046",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { traits: ["Cross Guild"] },
                { traits_contains: ["Baroque Works"] },
              ],
              cost_max: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-047 Kouzuki Oden (Character) ─────────────────────────────────────────
// [Double Attack]
// [On K.O.] Draw 2 cards and trash 1 card from your hand.

export const OP09_047_KOUZUKI_ODEN: EffectSchema = {
  card_id: "OP09-047",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "double_attack",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
    {
      id: "on_ko_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP09-048 Dracule Mihawk (Character) ───────────────────────────────────────
// [Blocker]
// [On Play] Draw 2 cards and trash 1 card from your hand.

export const OP09_048_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP09-048",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP09-050 Nami (Character) ─────────────────────────────────────────────────
// [When Attacking] Look at 5 cards from the top of your deck; reveal up to 1
// blue Event and add it to your hand. Then, place the rest at the bottom of
// your deck in any order.

export const OP09_050_NAMI: EffectSchema = {
  card_id: "OP09-050",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_search",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { color: "BLUE", card_type: "EVENT" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP09-051 Buggy (Character) ────────────────────────────────────────────────
// [On Play] Place up to 1 of your opponent's Characters at the bottom of the
// owner's deck. Then, if you do not have 5 Characters with a cost of 5 or more,
// place this Character at the bottom of the owner's deck.

export const OP09_051_BUGGY: EffectSchema = {
  card_id: "OP09-051",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { position: "BOTTOM" },
        },
        {
          type: "RETURN_TO_DECK",
          target: { type: "SELF" },
          params: { position: "BOTTOM" },
          conditions: {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { card_type: "CHARACTER", cost_min: 5 },
              count: { operator: ">=", value: 5 },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-052 Marco (Character) ────────────────────────────────────────────────
// [Opponent's Turn] You may trash 1 card from your hand: When this Character is
// K.O.'d by your opponent's effect, play this Character card from your trash rested.

export const OP09_052_MARCO: EffectSchema = {
  card_id: "OP09-052",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_ko_revive",
      category: "auto",
      trigger: {
        keyword: "ON_KO",
        turn_restriction: "OPPONENT_TURN",
        cause: "OPPONENT_EFFECT",
      },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "SELF" },
          params: {
            source_zone: "TRASH",
            entry_state: "RESTED",
            cost_override: "FREE",
          },
        },
      ],
    },
  ],
};

// ─── OP09-053 Mohji (Character) ────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Richie]
// and add it to your hand. Then, place the rest at the bottom of your deck in
// any order and play up to 1 [Richie] from your hand.

export const OP09_053_MOHJI: EffectSchema = {
  card_id: "OP09-053",
  card_name: "Mohji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_play_richie",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { name: "Richie" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Richie" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-054 Richie (Character) ───────────────────────────────────────────────
// [Blocker]

export const OP09_054_RICHIE: EffectSchema = {
  card_id: "OP09-054",
  card_name: "Richie",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP09-056 Mr.3(Galdino) (Character) ───────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 {Cross Guild}
// type card or card with a type including "Baroque Works" other than [Mr.3(Galdino)]
// and add it to your hand. Then, place the rest at the bottom of your deck.

export const OP09_056_MR_3_GALDINO: EffectSchema = {
  card_id: "OP09-056",
  card_name: "Mr.3(Galdino)",
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
                { traits: ["Cross Guild"] },
                { traits_contains: ["Baroque Works"] },
              ],
              exclude_name: "Mr.3(Galdino)",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP09-057 Cross Guild (Event) ──────────────────────────────────────────────
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 {Cross Guild}
// type card and add it to your hand. Then, place the rest at the bottom.
// [Trigger] Activate this card's [Main] effect.

export const OP09_057_CROSS_GUILD: EffectSchema = {
  card_id: "OP09-057",
  card_name: "Cross Guild",
  card_type: "Event",
  effects: [
    {
      id: "main_effect",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { traits: ["Cross Guild"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP09-058 Special Muggy Ball (Event) ───────────────────────────────────────
// [Main] Return up to 1 of your opponent's Characters with a cost of 6 or less
// to the owner's hand.
// [Trigger] Return up to 1 Character with a cost of 3 or less to the owner's hand.

export const OP09_058_SPECIAL_MUGGY_BALL: EffectSchema = {
  card_id: "OP09-058",
  card_name: "Special Muggy Ball",
  card_type: "Event",
  effects: [
    {
      id: "main_effect",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
        },
      ],
    },
    {
      id: "trigger_effect",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

// ─── OP09-059 Murder at the Steam Bath (Event) ────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +3000 power during
// this battle. Then, trash up to 2 cards from your hand. Trash the same number
// of cards from the top of your deck as you did from your hand.
// [Trigger] Draw 1 card.

export const OP09_059_MURDER_AT_THE_STEAM_BATH: EffectSchema = {
  card_id: "OP09-059",
  card_name: "Murder at the Steam Bath",
  card_type: "Event",
  effects: [
    {
      id: "counter_effect",
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
          type: "TRASH_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 2 },
          },
          chain: "THEN",
        },
        {
          type: "MILL",
          params: { amount: { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", multiplier: 1 } },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_effect",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP09-060 Emptee Bluffs Island (Stage) ─────────────────────────────────────
// [Activate: Main] You may place 2 cards from your hand at the bottom of your
// deck in any order and rest this Stage: If your Leader has the {Cross Guild}
// type, draw 2 cards.

export const OP09_060_EMPTEE_BLUFFS_ISLAND: EffectSchema = {
  card_id: "OP09-060",
  card_name: "Emptee Bluffs Island",
  card_type: "Stage",
  effects: [
    {
      id: "activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "PLACE_HAND_TO_DECK", amount: 2, position: "BOTTOM" },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Cross Guild" },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Straw Hat Crew / Kid Pirates / Heart Pirates (OP09-061 to OP09-080)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP09-061 Monkey.D.Luffy (Leader) ──────────────────────────────────────────
// [DON!! x1] All of your Characters gain +1 cost.
// [Your Turn] [Once Per Turn] When 2 or more DON!! cards on your field are
// returned to your DON!! deck, add up to 1 DON!! card from your DON!! deck and
// set it as active, and add up to 1 additional DON!! card and rest it.

export const OP09_061_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP09-061",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "don_x1_modify_cost",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_YOUR_CHARACTERS" },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        quantity_threshold: 2,
        turn_restriction: "YOUR_TURN",
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP09-062 Nico Robin (Character) ───────────────────────────────────────────
// [Banish]
// [When Attacking] You may trash 1 card with a [Trigger] from your hand: Add
// up to 1 DON!! card from your DON!! deck and rest it.

export const OP09_062_NICO_ROBIN: EffectSchema = {
  card_id: "OP09-062",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
    {
      id: "when_attacking_add_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP09-064 Killer (Character) ───────────────────────────────────────────────
// [On Play] DON!! −1: Set up to 1 of your {Kid Pirates} type Leader as active.

export const OP09_064_KILLER: EffectSchema = {
  card_id: "OP09-064",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_leader_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Kid Pirates"], card_type: "LEADER" },
          },
        },
      ],
    },
  ],
};

// ─── OP09-065 Sanji (Character) ────────────────────────────────────────────────
// [On Play] You may return 1 or more DON!! cards from your field to your DON!!
// deck: This Character gains [Rush] during this turn. Then, rest up to 1 of
// your opponent's Characters with a cost of 6 or less.

export const OP09_065_SANJI: EffectSchema = {
  card_id: "OP09-065",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rush_and_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "VARIABLE_DON_RETURN" }],
      flags: { optional: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-066 Jean Bart (Character) ────────────────────────────────────────────
// [On Play] If your opponent has more DON!! cards on their field than you, K.O.
// up to 1 of your opponent's Characters with a cost of 3 or less.

export const OP09_066_JEAN_BART: EffectSchema = {
  card_id: "OP09-066",
  card_name: "Jean Bart",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<",
      },
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
    },
  ],
};

// ─── OP09-068 Tony Tony.Chopper (Character) ────────────────────────────────────
// [End of Your Turn] You may return 1 or more DON!! cards from your field to
// your DON!! deck: Set this Character as active. Then, this Character gains
// [Blocker] until the end of your opponent's next turn.

export const OP09_068_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP09-068",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "eot_active_and_blocker",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "VARIABLE_DON_RETURN" }],
      flags: { optional: true },
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-069 Trafalgar Law (Character) ────────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 {Straw
// Hat Crew} or {Heart Pirates} type card with a cost of 2 or more and add it
// to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP09_069_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP09-069",
  card_name: "Trafalgar Law",
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
              traits_any_of: ["Straw Hat Crew", "Heart Pirates"],
              cost_min: 2,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP09-070 Nami (Character) ─────────────────────────────────────────────────
// [On Play] You may return 1 or more DON!! cards from your field to your DON!!
// deck: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.

export const OP09_070_NAMI: EffectSchema = {
  card_id: "OP09-070",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "VARIABLE_DON_RETURN" }],
      flags: { optional: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP09-071 Nico Robin (Character) ───────────────────────────────────────────
// [Blocker]

export const OP09_071_NICO_ROBIN: EffectSchema = {
  card_id: "OP09-071",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP09-072 Franky (Character) ───────────────────────────────────────────────
// [Blocker]
// [On Play] DON!! −2, You may trash 1 card from your hand: Draw 2 cards.

export const OP09_072_FRANKY: EffectSchema = {
  card_id: "OP09-072",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "DON_MINUS", amount: 2 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      flags: { optional: true },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP09-073 Brook (Character) ────────────────────────────────────────────────
// [When Attacking] You may return 1 or more DON!! cards from your field to your
// DON!! deck: Give up to 2 of your opponent's Characters −2000 power during
// this turn.

export const OP09_073_BROOK: EffectSchema = {
  card_id: "OP09-073",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "VARIABLE_DON_RETURN" }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-074 Bepo (Character) ─────────────────────────────────────────────────
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to
// your DON!! deck, up to 1 of your Leader or Character cards gains +1000 power
// during this turn.

export const OP09_074_BEPO: EffectSchema = {
  card_id: "OP09-074",
  card_name: "Bepo",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_buff",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-075 Eustass"Captain"Kid (Character) ──────────────────────────────────
// [On Play] You may add 1 card from the top of your Life cards to your hand: If
// your Leader has the {Kid Pirates} type, add up to 1 DON!! card from your DON!!
// deck and set it as active.

export const OP09_075_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "OP09-075",
  card_name: 'Eustass"Captain"Kid',
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_for_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kid Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP09-076 Roronoa Zoro (Character) ─────────────────────────────────────────
// [On Play] You may return 1 or more DON!! cards from your field to your DON!!
// deck: Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP09_076_RORONOA_ZORO: EffectSchema = {
  card_id: "OP09-076",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "VARIABLE_DON_RETURN" }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP09-077 Gum-Gum Lightning (Event) ────────────────────────────────────────
// [Main] DON!! −2: K.O. up to 1 of your opponent's Characters with 6000 power
// or less.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP09_077_GUM_GUM_LIGHTNING: EffectSchema = {
  card_id: "OP09-077",
  card_name: "Gum-Gum Lightning",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
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
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP09-078 Gum-Gum Giant (Event) ────────────────────────────────────────────
// [Counter] DON!! −2, You may trash 1 card from your hand: If your Leader has
// the {Straw Hat Crew} type, up to 1 of your Leader or Character cards gains
// +4000 power during this battle. Then, draw 2 cards.

export const OP09_078_GUM_GUM_GIANT: EffectSchema = {
  card_id: "OP09-078",
  card_name: "Gum-Gum Giant",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_draw",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        { type: "DON_MINUS", amount: 2 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
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
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-079 Gum-Gum Jump Rope (Event) ────────────────────────────────────────
// [Main] DON!! −2: Rest up to 1 of your opponent's Characters with a cost of 5
// or less. Then, draw 1 card.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP09_079_GUM_GUM_JUMP_ROPE: EffectSchema = {
  card_id: "OP09-079",
  card_name: "Gum-Gum Jump Rope",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_draw",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
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
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP09-080 Thousand Sunny (Stage) ───────────────────────────────────────────
// [Opponent's Turn] You may rest this Stage: When your {Straw Hat Crew} type
// Character is removed from the field by your opponent's effect, add up to 1
// DON!! card from your DON!! deck and rest it.
// _comment: No exact "CHARACTER_REMOVED_FROM_FIELD" event — using ANY_CHARACTER_KO
// as closest match. Covers KO by opponent effect but not bounce/deck removal.

export const OP09_080_THOUSAND_SUNNY: EffectSchema = {
  card_id: "OP09-080",
  card_name: "Thousand Sunny",
  card_type: "Stage",
  effects: [
    {
      id: "opponent_turn_removed_add_don",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        filter: {
          controller: "SELF",
          target_filter: { traits: ["Straw Hat Crew"] },
          cause: "BY_OPPONENT_EFFECT",
        },
        turn_restriction: "OPPONENT_TURN",
      },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Blackbeard Pirates (OP09-081 to OP09-099)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP09-081 Marshall.D.Teach (Leader) ────────────────────────────────────────
// Your [On Play] effects are negated.
// [Activate: Main] You may trash 1 card from your hand: Your opponent's [On Play]
// effects are negated until the end of your opponent's next turn.

export const OP09_081_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP09-081",
  card_name: "Marshall.D.Teach",
  card_type: "Leader",
  effects: [
    {
      id: "self_on_play_negation",
      category: "rule_modification",
      rule: {
        rule_type: "TRIGGER_TYPE_NEGATION",
        trigger_type: "ON_PLAY",
        affected_controller: "SELF",
      },
    },
    {
      id: "activate_negate_opponent_on_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "NEGATE_TRIGGER_TYPE",
          params: { trigger_type: "ON_PLAY", affected_controller: "OPPONENT" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-083 Van Augur (Character) ────────────────────────────────────────────
// [Activate: Main] You may rest this Character: If your Leader has the
// {Blackbeard Pirates} type, give up to 1 of your opponent's Characters −3 cost
// during this turn.
// [On K.O.] Draw 1 card.

export const OP09_083_VAN_AUGUR: EffectSchema = {
  card_id: "OP09-083",
  card_name: "Van Augur",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
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
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP09-084 Catarina Devon (Character) ───────────────────────────────────────
// [Activate: Main] [Once Per Turn] If your Leader has the {Blackbeard Pirates}
// type, this Character gains [Double Attack], [Banish] or [Blocker] until the end
// of your opponent's next turn.

export const OP09_084_CATARINA_DEVON: EffectSchema = {
  card_id: "OP09-084",
  card_name: "Catarina Devon",
  card_type: "Character",
  effects: [
    {
      id: "activate_keyword_choice",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [{ type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "DOUBLE_ATTACK" }, duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" } }],
              [{ type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BANISH" }, duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" } }],
              [{ type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" }, duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" } }],
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP09-085 Gecko Moria (Character) ──────────────────────────────────────────
// [On Play] Play up to 1 {Thriller Bark Pirates} type Character card with a cost
// of 2 or less from your trash rested.

export const OP09_085_GECKO_MORIA: EffectSchema = {
  card_id: "OP09-085",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "on_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Thriller Bark Pirates"], cost_max: 2 },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-086 Jesus Burgess (Character) ────────────────────────────────────────
// This Character cannot be K.O.'d by your opponent's effects.
// If your Leader has the {Blackbeard Pirates} type, this Character gains +1000
// power for every 4 cards in your trash.

export const OP09_086_JESUS_BURGESS: EffectSchema = {
  card_id: "OP09-086",
  card_name: "Jesus Burgess",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
    {
      id: "conditional_power_boost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: 1000,
              divisor: 4,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP09-087 Charlotte Pudding (Character) ────────────────────────────────────
// [On Play] If your opponent has 5 or more cards in their hand, your opponent
// trashes 1 card from their hand.

export const OP09_087_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "OP09-087",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_discard",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 5,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP09-088 Shiryu (Character) ───────────────────────────────────────────────
// [DON!! x1] [When Attacking] You may trash 2 cards from your hand: Draw 2 cards.

export const OP09_088_SHIRYU: EffectSchema = {
  card_id: "OP09-088",
  card_name: "Shiryu",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      flags: { optional: true },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP09-089 Stronger (Character) ─────────────────────────────────────────────
// [Activate: Main] You may trash 1 card from your hand and trash this Character:
// If your Leader has the {Blackbeard Pirates} type, draw 1 card. Then, give up to
// 1 of your opponent's Characters –2 cost during this turn.

export const OP09_089_STRONGER: EffectSchema = {
  card_id: "OP09-089",
  card_name: "Stronger",
  card_type: "Character",
  effects: [
    {
      id: "activate_draw_and_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
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
  ],
};

// ─── OP09-090 Doc Q (Character) ────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: If your Leader has the
// {Blackbeard Pirates} type, K.O. up to 1 of your opponent's Characters with a
// cost of 1 or less.
// [On K.O.] Draw 1 card.

export const OP09_090_DOC_Q: EffectSchema = {
  card_id: "OP09-090",
  card_name: "Doc Q",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
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
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP09-091 Vasco Shot (Character) ───────────────────────────────────────────
// [Blocker]

export const OP09_091_VASCO_SHOT: EffectSchema = {
  card_id: "OP09-091",
  card_name: "Vasco Shot",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP09-092 Marshall.D.Teach (Character) ─────────────────────────────────────
// [Activate: Main] You may rest this Character: If the number of cards in your
// hand is at least 3 less than the number in your opponent's hand, draw 2 cards
// and trash 1 card from your hand.

export const OP09_092_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP09-092",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "activate_draw_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "HAND_COUNT" as never,
        operator: "<=",
        margin: -3,
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP09-093 Marshall.D.Teach (Character) ─────────────────────────────────────
// [Blocker]
// [Activate: Main] [Once Per Turn] If your Leader has the {Blackbeard Pirates}
// type and this Character was played on this turn, negate the effect of up to 1
// of your opponent's Leader during this turn. Then, negate the effect of up to 1
// of your opponent's Characters and that Character cannot attack until the end of
// your opponent's next turn.

export const OP09_093_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP09-093",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "activate_negate_and_lock",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Blackbeard Pirates" } },
          { type: "WAS_PLAYED_THIS_TURN" },
        ],
      },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { card_type: "LEADER" },
          },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
          result_ref: "negated_character",
          chain: "THEN",
        },
        {
          type: "APPLY_PROHIBITION",
          target_ref: "negated_character",
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP09-095 Laffitte (Character) ─────────────────────────────────────────────
// [Activate: Main] You may rest 1 of your DON!! cards and this Character: Look at
// 5 cards from the top of your deck; reveal up to 1 {Blackbeard Pirates} type
// card and add it to your hand. Then, place the rest at the bottom of your deck.

export const OP09_095_LAFFITTE: EffectSchema = {
  card_id: "OP09-095",
  card_name: "Laffitte",
  card_type: "Character",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Blackbeard Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP09-096 My Era...Begins!! (Event) ────────────────────────────────────────
// [Main] Look at 3 cards from the top of your deck; reveal up to 1
// {Blackbeard Pirates} type card other than [My Era...Begins!!] and add it to
// your hand. Then, trash the rest.
// [Trigger] Activate this card's [Main] effect.

export const OP09_096_MY_ERA_BEGINS: EffectSchema = {
  card_id: "OP09-096",
  card_name: "My Era...Begins!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Blackbeard Pirates"],
              exclude_name: "My Era...Begins!!",
            },
            rest_destination: "TRASH",
          },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP09-097 Black Vortex (Event) ─────────────────────────────────────────────
// [Counter] Negate the effect of up to 1 of your opponent's Leader or Character
// cards and give that card −4000 power during this turn.
// [Trigger] Negate the effect of up to 1 of your opponent's Leader or Character
// cards during this turn.

export const OP09_097_BLACK_VORTEX: EffectSchema = {
  card_id: "OP09-097",
  card_name: "Black Vortex",
  card_type: "Event",
  effects: [
    {
      id: "counter_negate_debuff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
          result_ref: "negated_card",
        },
        {
          type: "MODIFY_POWER",
          target_ref: "negated_card",
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
    {
      id: "trigger_negate",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-098 Black Hole (Event) ───────────────────────────────────────────────
// [Main] If your Leader has the {Blackbeard Pirates} type, negate the effect of
// up to 1 of your opponent's Characters during this turn. Then, if that Character
// has a cost of 4 or less, K.O. it.
// [Trigger] Negate the effect of up to 1 of your opponent's Leader or Character
// cards during this turn.

export const OP09_098_BLACK_HOLE: EffectSchema = {
  card_id: "OP09-098",
  card_name: "Black Hole",
  card_type: "Event",
  effects: [
    {
      id: "main_negate_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
          result_ref: "negated_character",
        },
        {
          type: "KO",
          target_ref: "negated_character",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { cost_max: 4 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_negate",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP09-099 Fullalead (Stage) ────────────────────────────────────────────────
// [Activate: Main] You may trash 1 card from your hand and rest this Stage: Look
// at 3 cards from the top of your deck; reveal up to 1 {Blackbeard Pirates} type
// card and add it to your hand. Then, place the rest at the bottom of your deck.

export const OP09_099_FULLALEAD: EffectSchema = {
  card_id: "OP09-099",
  card_name: "Fullalead",
  card_type: "Stage",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Blackbeard Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Revolutionary Army / Ohara (OP09-100 to OP09-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP09-100 Karasu (Character) ───────────────────────────────────────────────
// [Blocker]
// [Trigger] If your Leader has the {Revolutionary Army} type and you and your
// opponent have a total of 5 or less Life cards, play this card.

export const OP09_100_KARASU: EffectSchema = {
  card_id: "OP09-100",
  card_name: "Karasu",
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
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Revolutionary Army" } },
          { type: "COMBINED_TOTAL", metric: "LIFE_COUNT", operator: "<=", value: 5 },
        ],
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP09-101 Kuzan (Character) ────────────────────────────────────────────────
// [On Play] Place 1 of your opponent's Characters with a cost of 3 or less at
// the top or bottom of your opponent's Life cards face-up: Your opponent trashes
// 1 card from their hand.

export const OP09_101_KUZAN: EffectSchema = {
  card_id: "OP09-101",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "on_play_place_to_life_then_discard",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP" },
        },
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-102 Professor Clover (Character) ─────────────────────────────────────
// [On Play] If your Leader is [Nico Robin], look at 3 cards from the top of your
// deck; reveal up to 1 card with a [Trigger] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [On Play] effect.

export const OP09_102_PROFESSOR_CLOVER: EffectSchema = {
  card_id: "OP09-102",
  card_name: "Professor Clover",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nico Robin" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { has_trigger: true },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "ON_PLAY" } },
      ],
    },
  ],
};

// ─── OP09-103 Koala (Character) ────────────────────────────────────────────────
// [Blocker]
// [On Play] You may add 1 card from the top or bottom of your Life cards to your
// hand: Play up to 1 {Revolutionary Army} type Character card with a cost of 4
// or less from your hand. If you do, draw 1 card.

export const OP09_103_KOALA: EffectSchema = {
  card_id: "OP09-103",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_life_swap_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"], cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP09-104 Sabo (Character) ─────────────────────────────────────────────────
// [On Play] Add up to 1 {Revolutionary Army} type Character card from your hand
// to the top of your Life cards face-up. Then, if you have 2 or more Life cards,
// add 1 card from the top or bottom of your Life cards to your hand.
// [Trigger] If your Leader is multicolored, draw 2 cards.

export const OP09_104_SABO: EffectSchema = {
  card_id: "OP09-104",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_life_then_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Revolutionary Army"] },
          },
          params: { face: "UP", position: "TOP" },
        },
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP_OR_BOTTOM" },
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 2,
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP09-106 Nico Olvia (Character) ───────────────────────────────────────────
// [On Play] Up to 1 of your [Nico Robin] Leader gains +3000 power during this turn.
// [Trigger] If your Leader is [Nico Robin], draw 3 cards and trash 2 cards from
// your hand.

export const OP09_106_NICO_OLVIA: EffectSchema = {
  card_id: "OP09-106",
  card_name: "Nico Olvia",
  card_type: "Character",
  effects: [
    {
      id: "on_play_boost_leader",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Nico Robin", card_type: "LEADER" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nico Robin" },
      },
      actions: [
        { type: "DRAW", params: { amount: 3 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

// ─── OP09-107 Nico Robin (Character) ───────────────────────────────────────────
// [On Play] If your opponent has 3 or more Life cards, trash up to 1 card from
// the top of your opponent's Life cards.
// [Trigger] Play up to 1 yellow Character card with a cost of 3 or less from
// your hand.

export const OP09_107_NICO_ROBIN: EffectSchema = {
  card_id: "OP09-107",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 3,
      },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP", controller: "OPPONENT" },
        },
      ],
    },
    {
      id: "trigger_play_yellow",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { color: "YELLOW", cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-109 Jaguar.D.Saul (Character) ───────────────────────────────────────
// [Blocker]
// [Trigger] If your Leader is [Nico Robin], play this card.

export const OP09_109_JAGUAR_D_SAUL: EffectSchema = {
  card_id: "OP09-109",
  card_name: "Jaguar.D.Saul",
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
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nico Robin" },
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP09-110 Pierre (Character) ───────────────────────────────────────────────
// [On Play] Draw 2 cards and trash 2 cards from your hand.
// [Trigger] Play this card.

export const OP09_110_PIERRE: EffectSchema = {
  card_id: "OP09-110",
  card_name: "Pierre",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "AND" },
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

// ─── OP09-112 Belo Betty (Character) ───────────────────────────────────────────
// [On Play] If you have 2 or less Life cards, draw 1 card.
// [Trigger] If your Leader has the {Revolutionary Army} type and you and your
// opponent have a total of 5 or less Life cards, play this card.

export const OP09_112_BELO_BETTY: EffectSchema = {
  card_id: "OP09-112",
  card_name: "Belo Betty",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Revolutionary Army" } },
          { type: "COMBINED_TOTAL", metric: "LIFE_COUNT", operator: "<=", value: 5 },
        ],
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP09-114 Lindbergh (Character) ───────────────────────────────────────────
// [On Play] If you and your opponent have a total of 5 or less Life cards, K.O.
// up to 1 of your opponent's Characters with 2000 power or less.
// [Trigger] If you and your opponent have a total of 5 or less Life cards, play
// this card.

export const OP09_114_LINDBERGH: EffectSchema = {
  card_id: "OP09-114",
  card_name: "Lindbergh",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMBINED_TOTAL",
        metric: "LIFE_COUNT",
        operator: "<=",
        value: 5,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 2000 },
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "COMBINED_TOTAL",
        metric: "LIFE_COUNT",
        operator: "<=",
        value: 5,
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP09-115 Ice Block Partisan (Event) ───────────────────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 3 or less
// and a [Trigger].
// [Trigger] Draw 1 card.

export const OP09_115_ICE_BLOCK_PARTISAN: EffectSchema = {
  card_id: "OP09-115",
  card_name: "Ice Block Partisan",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3, has_trigger: true },
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP09-116 Never Underestimate the Power of Miracles!! (Event) ──────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle.
// [Trigger] Play up to 1 {Revolutionary Army} type Character card with a cost of
// 4 or less from your hand.

export const OP09_116_NEVER_UNDERESTIMATE: EffectSchema = {
  card_id: "OP09-116",
  card_name: "Never Underestimate the Power of Miracles!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost",
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
      ],
    },
    {
      id: "trigger_play_rev_army",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"], cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP09-117 Dereshi! (Event) ─────────────────────────────────────────────────
// [Main] Look at 5 cards from the top of your deck; reveal up to 2 cards with a
// [Trigger] other than [Dereshi!] and add them to your hand. Then, place the rest
// at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP09_117_DERESHI: EffectSchema = {
  card_id: "OP09-117",
  card_name: "Dereshi!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { has_trigger: true, exclude_name: "Dereshi!" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP09-118 Gol.D.Roger (Character) ──────────────────────────────────────────
// [Rush]
// When your opponent activates [Blocker], if either you or your opponent has 0
// Life cards, you win the game.

export const OP09_118_GOL_D_ROGER: EffectSchema = {
  card_id: "OP09-118",
  card_name: "Gol.D.Roger",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "blocker_win_condition",
      category: "auto",
      trigger: {
        event: "BLOCKER_ACTIVATED",
        filter: { controller: "OPPONENT" },
      },
      conditions: {
        any_of: [
          { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 0 },
          { type: "LIFE_COUNT", controller: "OPPONENT", operator: "==", value: 0 },
        ],
      },
      actions: [{ type: "WIN_GAME" }],
    },
  ],
};

// ─── OP09-119 Monkey.D.Luffy (Character) ───────────────────────────────────────
// [On Play] You may return 1 or more DON!! cards from your field to your DON!!
// deck: Draw 1 card and this Character gains [Rush] during this turn.

export const OP09_119_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP09-119",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_return_draw_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "VARIABLE_DON_RETURN" }],
      flags: { optional: true },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP09_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP09-001": OP09_001_SHANKS,
  "OP09-002": OP09_002_UTA,
  "OP09-003": OP09_003_SHACHI_AND_PENGUIN,
  "OP09-004": OP09_004_SHANKS,
  "OP09-005": OP09_005_SILVERS_RAYLEIGH,
  "OP09-007": OP09_007_HEAT,
  "OP09-008": OP09_008_BUILDING_SNAKE,
  "OP09-009": OP09_009_BENN_BECKMAN,
  "OP09-010": OP09_010_BONK_PUNCH,
  "OP09-011": OP09_011_HONGO,
  "OP09-012": OP09_012_MONSTER,
  "OP09-013": OP09_013_YASOPP,
  "OP09-014": OP09_014_LIMEJUICE,
  "OP09-015": OP09_015_LUCKY_ROUX,
  "OP09-017": OP09_017_WIRE,
  "OP09-018": OP09_018_GET_OUT_OF_HERE,
  "OP09-019": OP09_019_NOBODY_HURTS_A_FRIEND_OF_MINE,
  "OP09-020": OP09_020_COME_ON_WELL_FIGHT_YOU,
  "OP09-021": OP09_021_RED_FORCE,
  // Green
  "OP09-022": OP09_022_LIM,
  "OP09-023": OP09_023_ADIO,
  "OP09-024": OP09_024_USOPP,
  "OP09-025": OP09_025_CROCODILE,
  "OP09-026": OP09_026_SAKAZUKI,
  "OP09-027": OP09_027_SABO,
  "OP09-028": OP09_028_SANJI,
  "OP09-029": OP09_029_TONY_TONY_CHOPPER,
  "OP09-030": OP09_030_TRAFALGAR_LAW,
  "OP09-031": OP09_031_DONQUIXOTE_DOFLAMINGO,
  "OP09-032": OP09_032_DONQUIXOTE_ROSINANTE,
  "OP09-033": OP09_033_NICO_ROBIN,
  "OP09-034": OP09_034_PERONA,
  "OP09-035": OP09_035_PORTGAS_D_ACE,
  "OP09-036": OP09_036_MONKEY_D_LUFFY,
  "OP09-037": OP09_037_LIM,
  "OP09-039": OP09_039_GUM_GUM_CUATRO_JET_CROSS_SHOCK_BAZOOKA,
  "OP09-040": OP09_040_THUNDER_LANCE_FLIP_CALIBER_PHOENIX_SHOT,
  "OP09-041": OP09_041_SOUL_FRANKY_SWING_ARM_BOXING_SOLID,
  // Blue
  "OP09-042": OP09_042_BUGGY,
  "OP09-043": OP09_043_ALVIDA,
  "OP09-044": OP09_044_IZO,
  "OP09-045": OP09_045_CABAJI,
  "OP09-046": OP09_046_CROCODILE,
  "OP09-047": OP09_047_KOUZUKI_ODEN,
  "OP09-048": OP09_048_DRACULE_MIHAWK,
  "OP09-050": OP09_050_NAMI,
  "OP09-051": OP09_051_BUGGY,
  "OP09-052": OP09_052_MARCO,
  "OP09-053": OP09_053_MOHJI,
  "OP09-054": OP09_054_RICHIE,
  "OP09-056": OP09_056_MR_3_GALDINO,
  "OP09-057": OP09_057_CROSS_GUILD,
  "OP09-058": OP09_058_SPECIAL_MUGGY_BALL,
  "OP09-059": OP09_059_MURDER_AT_THE_STEAM_BATH,
  "OP09-060": OP09_060_EMPTEE_BLUFFS_ISLAND,
  // Purple
  "OP09-061": OP09_061_MONKEY_D_LUFFY,
  "OP09-062": OP09_062_NICO_ROBIN,
  "OP09-064": OP09_064_KILLER,
  "OP09-065": OP09_065_SANJI,
  "OP09-066": OP09_066_JEAN_BART,
  "OP09-068": OP09_068_TONY_TONY_CHOPPER,
  "OP09-069": OP09_069_TRAFALGAR_LAW,
  "OP09-070": OP09_070_NAMI,
  "OP09-071": OP09_071_NICO_ROBIN,
  "OP09-072": OP09_072_FRANKY,
  "OP09-073": OP09_073_BROOK,
  "OP09-074": OP09_074_BEPO,
  "OP09-075": OP09_075_EUSTASS_CAPTAIN_KID,
  "OP09-076": OP09_076_RORONOA_ZORO,
  "OP09-077": OP09_077_GUM_GUM_LIGHTNING,
  "OP09-078": OP09_078_GUM_GUM_GIANT,
  "OP09-079": OP09_079_GUM_GUM_JUMP_ROPE,
  "OP09-080": OP09_080_THOUSAND_SUNNY,
  // Black
  "OP09-081": OP09_081_MARSHALL_D_TEACH,
  "OP09-083": OP09_083_VAN_AUGUR,
  "OP09-084": OP09_084_CATARINA_DEVON,
  "OP09-085": OP09_085_GECKO_MORIA,
  "OP09-086": OP09_086_JESUS_BURGESS,
  "OP09-087": OP09_087_CHARLOTTE_PUDDING,
  "OP09-088": OP09_088_SHIRYU,
  "OP09-089": OP09_089_STRONGER,
  "OP09-090": OP09_090_DOC_Q,
  "OP09-091": OP09_091_VASCO_SHOT,
  "OP09-092": OP09_092_MARSHALL_D_TEACH,
  "OP09-093": OP09_093_MARSHALL_D_TEACH,
  "OP09-095": OP09_095_LAFFITTE,
  "OP09-096": OP09_096_MY_ERA_BEGINS,
  "OP09-097": OP09_097_BLACK_VORTEX,
  "OP09-098": OP09_098_BLACK_HOLE,
  "OP09-099": OP09_099_FULLALEAD,
  // Yellow
  "OP09-100": OP09_100_KARASU,
  "OP09-101": OP09_101_KUZAN,
  "OP09-102": OP09_102_PROFESSOR_CLOVER,
  "OP09-103": OP09_103_KOALA,
  "OP09-104": OP09_104_SABO,
  "OP09-106": OP09_106_NICO_OLVIA,
  "OP09-107": OP09_107_NICO_ROBIN,
  "OP09-109": OP09_109_JAGUAR_D_SAUL,
  "OP09-110": OP09_110_PIERRE,
  "OP09-112": OP09_112_BELO_BETTY,
  "OP09-114": OP09_114_LINDBERGH,
  "OP09-115": OP09_115_ICE_BLOCK_PARTISAN,
  "OP09-116": OP09_116_NEVER_UNDERESTIMATE,
  "OP09-117": OP09_117_DERESHI,
  "OP09-118": OP09_118_GOL_D_ROGER,
  "OP09-119": OP09_119_MONKEY_D_LUFFY,
};
