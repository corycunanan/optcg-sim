/**
 * M4 Effect Schema — OP13 Card Encodings
 *
 * Red (Luffy / Ace / Roger / Sabo): OP13-001 through OP13-022
 * Green (Uta / FILM / Straw Hat Crew): OP13-023 through OP13-040
 * Blue (Whitebeard Pirates / Boa Hancock): OP13-041 through OP13-059
 * Purple (Roger Pirates / DON given): OP13-060 through OP13-078
 * Black (Imu / Five Elders / Celestial Dragons): OP13-079 through OP13-099
 * Yellow (Jewelry Bonney / Egghead): OP13-100 through OP13-120
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Luffy / Ace / Roger / Sabo (OP13-001 to OP13-022)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP13-001 Monkey.D.Luffy (Leader) ──────────────────────────────────────
// [DON!! x1] [On Your Opponent's Attack] If you have 5 or less active DON!!
// cards, you may rest any number of your DON!! cards. For every DON!! card
// rested this way, this Leader or up to 1 of your {Straw Hat Crew} type
// Characters gains +2000 power during this battle.

export const OP13_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP13-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-001_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", don_requirement: 1 },
      conditions: {
        type: "ACTIVE_DON_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
      },
      costs: [{ type: "REST_DON", amount: "ANY_NUMBER" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { card_type: "LEADER" },
                { traits: ["Straw Hat Crew"] },
              ],
            },
          },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "DON_RESTED_THIS_WAY",
              multiplier: 2000,
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-002 Portgas.D.Ace (Leader) ───────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
// hand: Give up to 1 of your opponent's Leader or Character cards −2000 power
// during this battle.
// [DON!! x1] [Once Per Turn] When you take damage or your Character with 6000
// base power or more is K.O.'d, draw 1 card.

export const OP13_002_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP13-002",
  card_name: "Portgas.D.Ace",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-002_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "OP13-002_on_damage_or_ko",
      category: "auto",
      trigger: {
        any_of: [
          { event: "DAMAGE_TAKEN", filter: { controller: "SELF" } },
          {
            event: "ANY_CHARACTER_KO",
            filter: {
              controller: "SELF",
              target_filter: { base_power_min: 6000 },
            },
          },
        ],
      },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP13-003 Gol.D.Roger (Leader) ─────────────────────────────────────────
// If you have any DON!! cards on your field, 1 DON!! card placed during your
// DON!! Phase is given to your Leader.
// If you have 9 or less DON!! cards on your field, give this Leader −2000 power.

export const OP13_003_GOL_D_ROGER: EffectSchema = {
  card_id: "OP13-003",
  card_name: "Gol.D.Roger",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-003_don_phase",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "_DON_PHASE_GIVE_TO_LEADER" },
        },
      ],
    },
    {
      id: "OP13-003_power_penalty",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 9,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -2000 },
        },
      ],
    },
  ],
  rule_modifications: [
    {
      rule_type: "DON_PHASE_BEHAVIOR",
      condition: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
      count: 1,
      destination: "GIVEN_TO_LEADER",
    },
  ],
};

// ─── OP13-004 Sabo (Leader) ────────────────────────────────────────────────
// If you have 4 or more Life cards, give this Leader −1000 power.
// [DON!! x1] If you have a Character with a cost of 8 or more, your Leader and
// all of your Characters gain +1000 power.

export const OP13_004_SABO: EffectSchema = {
  card_id: "OP13-004",
  card_name: "Sabo",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-004_power_penalty",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 4,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -1000 },
        },
      ],
    },
    {
      id: "OP13-004_don_x1_aura",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "DON_FIELD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 1,
          },
          {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
          },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── OP13-005 Inazuma ──────────────────────────────────────────────────────
// [On Play] Give up to 1 rested DON!! card to your Leader.

export const OP13_005_INAZUMA: EffectSchema = {
  card_id: "OP13-005",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "OP13-005_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-006 Woop Slap ───────────────────────────────────────────────────
// [On Play] Give up to 2 rested DON!! cards to 1 of your [Monkey.D.Luffy] cards.

export const OP13_006_WOOP_SLAP: EffectSchema = {
  card_id: "OP13-006",
  card_name: "Woop Slap",
  card_type: "Character",
  effects: [
    {
      id: "OP13-006_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-007 Ace & Sabo & Luffy ───────────────────────────────────────────
// [Activate: Main] You may give 1 of your active DON!! cards to 1 of your
// Leader or Character cards and trash this Character: Give up to 1 of your
// opponent's Characters −3000 power during this turn.

export const OP13_007_ACE_SABO_LUFFY: EffectSchema = {
  card_id: "OP13-007",
  card_name: "Ace & Sabo & Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP13-007_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "RETURN_ATTACHED_DON_TO_COST",
          amount: 1,
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
        },
        { type: "TRASH_SELF" },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP13-008 Emporio.Ivankov ──────────────────────────────────────────────
// If your {Revolutionary Army} type Character would be K.O.'d by your
// opponent's effect, you may trash this Character instead.

export const OP13_008_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP13-008",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "OP13-008_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Revolutionary Army"],
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
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

// ─── OP13-009 Curly.Dadan ──────────────────────────────────────────────────
// If you have a {Mountain Bandits} type Character other than this card, this
// Character gains [Double Attack].

export const OP13_009_CURLY_DADAN: EffectSchema = {
  card_id: "OP13-009",
  card_name: "Curly.Dadan",
  card_type: "Character",
  effects: [
    {
      id: "OP13-009_conditional_double_attack",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["Mountain Bandits"], exclude_self: true },
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

// ─── OP13-012 Nefeltari Vivi ───────────────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1
// {Alabasta} or {Straw Hat Crew} type card with a cost of 2 or more and add
// it to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP13_012_NEFELTARI_VIVI: EffectSchema = {
  card_id: "OP13-012",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "OP13-012_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Alabasta", "Straw Hat Crew"],
              cost_min: 2,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP13-013 Higuma ───────────────────────────────────────────────────────
// [On Play] K.O. up to 1 of your opponent's Characters with 0 power or less.

export const OP13_013_HIGUMA: EffectSchema = {
  card_id: "OP13-013",
  card_name: "Higuma",
  card_type: "Character",
  effects: [
    {
      id: "OP13-013_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 0 },
          },
        },
      ],
    },
  ],
};

// ─── OP13-015 Makino ───────────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: Up to 1 of your
// [Monkey.D.Luffy] cards gains +2000 power during this turn.

export const OP13_015_MAKINO: EffectSchema = {
  card_id: "OP13-015",
  card_name: "Makino",
  card_type: "Character",
  effects: [
    {
      id: "OP13-015_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-016 Monkey.D.Garp ───────────────────────────────────────────────
// [On Play] If your Leader is [Sabo], [Portgas.D.Ace] or [Monkey.D.Luffy],
// look at 4 cards from the top of your deck; reveal up to 1 card with a cost
// of 3 or more and add it to your hand. Then, place the rest at the bottom of
// your deck in any order.

export const OP13_016_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP13-016",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "OP13-016_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sabo" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 3 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP13-017 Monkey.D.Dragon ──────────────────────────────────────────────
// [Once Per Turn] If your {Revolutionary Army} type Character would be removed
// from the field by your opponent's effect, you may give this Character −2000
// power during this turn instead.

export const OP13_017_MONKEY_D_DRAGON: EffectSchema = {
  card_id: "OP13-017",
  card_name: "Monkey.D.Dragon",
  card_type: "Character",
  effects: [
    {
      id: "OP13-017_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Revolutionary Army"],
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP13-019 But Ace Here Said You Deserved It!! ──────────────────────────
// [Main] You may rest 4 of your DON!! cards: Give up to 1 of your opponent's
// Characters −3000 power during this turn. Then, K.O. up to 1 of your
// opponent's Characters with 3000 power or less.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_019_BUT_ACE_HERE_SAID_YOU_DESERVED_IT: EffectSchema = {
  card_id: "OP13-019",
  card_name: "But Ace Here Said You Deserved It!!",
  card_type: "Event",
  effects: [
    {
      id: "OP13-019_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 4 }],
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
      flags: { optional: true },
    },
    {
      id: "OP13-019_counter",
      category: "auto",
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

// ─── OP13-020 Meteor Fist ──────────────────────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters −5000 power during this turn.
// [Trigger] Activate this card's [Main] effect.

export const OP13_020_METEOR_FIST: EffectSchema = {
  card_id: "OP13-020",
  card_name: "Meteor Fist",
  card_type: "Event",
  effects: [
    {
      id: "OP13-020_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -5000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP13-020_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP13-021 Gum-Gum Gatling Gun ─────────────────────────────────────────
// [Main] Give up to 1 rested DON!! card to 1 of your [Monkey.D.Luffy] cards.
// Then, give up to 1 of your opponent's Characters −2000 power during this turn.
// [Trigger] Give up to 1 of your opponent's Characters −2000 power during this turn.

export const OP13_021_GUM_GUM_GATLING_GUN: EffectSchema = {
  card_id: "OP13-021",
  card_name: "Gum-Gum Gatling Gun",
  card_type: "Event",
  effects: [
    {
      id: "OP13-021_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP13-021_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

// ─── OP13-022 Windmill Village ─────────────────────────────────────────────
// [Activate: Main] You may rest this Stage: Up to 1 of your Characters with
// 2000 base power or less gains +1000 power during this turn.

export const OP13_022_WINDMILL_VILLAGE: EffectSchema = {
  card_id: "OP13-022",
  card_name: "Windmill Village",
  card_type: "Stage",
  effects: [
    {
      id: "OP13-022_activate_main",
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
            filter: { base_power_max: 2000 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Uta / FILM / Straw Hat Crew (OP13-023 to OP13-040)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP13-023 Uta (Leader) ─────────────────────────────────────────────────
// [On Play] Set up to 2 of your DON!! cards as active. Then, you cannot play
// Character cards with a base cost of 5 or more during this turn.
// [On K.O.] Play up to 1 Character card with a cost of 5 or less from your
// hand rested.

export const OP13_023_UTA: EffectSchema = {
  card_id: "OP13-023",
  card_name: "Uta",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-023_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_PLAY_CHARACTER",
            scope: { cost_filter: { operator: ">=", value: 5 } },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP13-023_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-024 Gordon ───────────────────────────────────────────────────────
// [On Play] You may reveal 1 {Music} or {FILM} type card from your hand: Set
// up to 2 of your DON!! cards as active at the end of this turn.

export const OP13_024_GORDON: EffectSchema = {
  card_id: "OP13-024",
  card_name: "Gordon",
  card_type: "Character",
  effects: [
    {
      id: "OP13-024_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 1,
          filter: { traits_any_of: ["Music", "FILM"] },
        },
      ],
      actions: [
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_DON_ACTIVE",
              params: { amount: 2 },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-025 Koby ─────────────────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader has the {FILM} type or the  attribute, set up to
// 1 of your DON!! cards as active.

export const OP13_025_KOBY: EffectSchema = {
  card_id: "OP13-025",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "OP13-025_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-025_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "FILM" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { attribute: "STRIKE" },
          },
        ],
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-026 Sunny-Kun ────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may rest 1 of your DON!! cards: This
// Character gains +2000 power until the end of your opponent's next turn.

export const OP13_026_SUNNY_KUN: EffectSchema = {
  card_id: "OP13-026",
  card_name: "Sunny-Kun",
  card_type: "Character",
  effects: [
    {
      id: "OP13-026_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP13-027 Sanji ────────────────────────────────────────────────────────
// [On Play] Set up to 2 of your DON!! cards as active.
// [End of Your Turn] If your Leader has the {FILM} or {Straw Hat Crew} type,
// set up to 1 of your DON!! cards as active.

export const OP13_027_SANJI: EffectSchema = {
  card_id: "OP13-027",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP13-027_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
    },
    {
      id: "OP13-027_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "FILM" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Straw Hat Crew" },
          },
        ],
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-028 Shanks ───────────────────────────────────────────────────────
// [On Play] Set all of your DON!! cards as active. Then, you cannot play cards
// from your hand during this turn.

export const OP13_028_SHANKS: EffectSchema = {
  card_id: "OP13-028",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP13-028_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 10 },
        },
        {
          type: "APPLY_PROHIBITION",
          params: { prohibition_type: "CANNOT_PLAY_CARDS" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-030 Tony Tony.Chopper ────────────────────────────────────────────
// [On Play] Set up to 2 of your DON!! cards as active.

export const OP13_030_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP13-030",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "OP13-030_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP13-031 Trafalgar Law ────────────────────────────────────────────────
// If you have 1 or less Life cards, this Character gains [Blocker].
// [On Play] You may return 1 of your Characters to the owner's hand: Play up
// to 1 Character card with a cost of 5 or less from your hand rested.

export const OP13_031_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP13-031",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "OP13-031_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
    {
      id: "OP13-031_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          amount: 1,
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-032 Nico Robin ───────────────────────────────────────────────────
// [On Play] Up to 1 of your opponent's Characters with a cost of 8 or less
// cannot be rested until the end of your opponent's next End Phase.

export const OP13_032_NICO_ROBIN: EffectSchema = {
  card_id: "OP13-032",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "OP13-032_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP13-033 Franky ───────────────────────────────────────────────────────
// [On K.O.] Rest up to 2 of your opponent's cards.

export const OP13_033_FRANKY: EffectSchema = {
  card_id: "OP13-033",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "OP13-033_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP13-034 Brook ────────────────────────────────────────────────────────
// [On Play] If your Leader has the {FILM} or {Straw Hat Crew} type, set up to
// 1 of your DON!! cards as active.

export const OP13_034_BROOK: EffectSchema = {
  card_id: "OP13-034",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "OP13-034_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "FILM" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Straw Hat Crew" },
          },
        ],
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-035 Bepo ─────────────────────────────────────────────────────────
// [End of Your Turn] Set this Character or up to 1 of your DON!! cards as active.

export const OP13_035_BEPO: EffectSchema = {
  card_id: "OP13-035",
  card_name: "Bepo",
  card_type: "Character",
  effects: [
    {
      id: "OP13-035_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [{ type: "SET_ACTIVE", target: { type: "SELF" } }],
              [{ type: "SET_DON_ACTIVE", params: { amount: 1 } }],
            ],
            labels: ["Set this Character as active", "Set 1 DON!! as active"],
          },
        },
      ],
    },
  ],
};

// ─── OP13-037 Roronoa Zoro ─────────────────────────────────────────────────
// [On Play] If your Leader has the {FILM} or {Straw Hat Crew} type, set up to
// 2 of your DON!! cards as active.
// [End of Your Turn] Set this Character as active.

export const OP13_037_RORONOA_ZORO: EffectSchema = {
  card_id: "OP13-037",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP13-037_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "FILM" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Straw Hat Crew" },
          },
        ],
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
    },
    {
      id: "OP13-037_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP13-038 Gum-Gum Elephant Gun ────────────────────────────────────────
// [Main] Rest up to 1 of your opponent's Characters with a cost of 5 or less.
// Then, set up to 2 of your DON!! cards as active at the end of this turn.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 5 or less.

export const OP13_038_GUM_GUM_ELEPHANT_GUN: EffectSchema = {
  card_id: "OP13-038",
  card_name: "Gum-Gum Elephant Gun",
  card_type: "Event",
  effects: [
    {
      id: "OP13-038_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_DON_ACTIVE",
              params: { amount: 2 },
            },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP13-038_trigger",
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

// ─── OP13-039 Gum-Gum Snake Shot ──────────────────────────────────────────
// [Counter] K.O. up to 1 of your opponent's rested Characters with a cost of
// 4 or less.
// [Trigger] Activate this card's [Counter] effect.

export const OP13_039_GUM_GUM_SNAKE_SHOT: EffectSchema = {
  card_id: "OP13-039",
  card_name: "Gum-Gum Snake Shot",
  card_type: "Event",
  effects: [
    {
      id: "OP13-039_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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
    {
      id: "OP13-039_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "COUNTER" } },
      ],
    },
  ],
};

// ─── OP13-040 I Know You're Strong... So I'll Go All Out from the Very Start!!!
// [Main] You may rest 2 of your DON!! cards: Up to 2 of your opponent's rested
// Characters with a cost of 7 or less will not become active in your opponent's
// next Refresh Phase.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_040_I_KNOW_YOURE_STRONG: EffectSchema = {
  card_id: "OP13-040",
  card_name: "I Know You're Strong... So I'll Go All Out from the Very Start!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP13-040_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { is_rested: true, cost_max: 7 },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-040_counter",
      category: "auto",
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Whitebeard Pirates / Boa Hancock (OP13-041 to OP13-059)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP13-041 Izo ──────────────────────────────────────────────────────────
// [On Play] Draw 2 cards.

export const OP13_041_IZO: EffectSchema = {
  card_id: "OP13-041",
  card_name: "Izo",
  card_type: "Character",
  effects: [
    {
      id: "OP13-041_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP13-042 Edward.Newgate ───────────────────────────────────────────────
// [Blocker]
// [On Play] Draw 2 cards and trash 1 card from your hand. Then, give your
// Leader and 1 Character up to 2 rested DON!! cards each.

export const OP13_042_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP13-042",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "OP13-042_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-042_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { card_type: "LEADER" },
          },
          params: { amount: 2, don_state: "RESTED" },
          chain: "THEN",
        },
        {
          type: "GIVE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP13-043 Otama ────────────────────────────────────────────────────────
// [On Play] If you have 3 or less Life cards, draw 2 cards and trash 1 card
// from your hand.

export const OP13_043_OTAMA: EffectSchema = {
  card_id: "OP13-043",
  card_name: "Otama",
  card_type: "Character",
  effects: [
    {
      id: "OP13-043_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP13-044 Curiel ───────────────────────────────────────────────────────
// [When Attacking] Give up to 1 rested DON!! card to your Leader with a type
// including "Whitebeard Pirates" or 1 Character with a type including
// "Whitebeard Pirates".
// [On K.O.] Draw 1 card.

export const OP13_044_CURIEL: EffectSchema = {
  card_id: "OP13-044",
  card_name: "Curiel",
  card_type: "Character",
  effects: [
    {
      id: "OP13-044_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
    {
      id: "OP13-044_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-045 Haruta ───────────────────────────────────────────────────────
// [When Attacking] If you have 4 or less cards in your hand, draw 1 card.

export const OP13_045_HARUTA: EffectSchema = {
  card_id: "OP13-045",
  card_name: "Haruta",
  card_type: "Character",
  effects: [
    {
      id: "OP13-045_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-046 Vista ────────────────────────────────────────────────────────
// [Double Attack]
// [Once Per Turn] If this Character would be K.O.'d or would be removed from
// the field by your opponent's effect, you may trash 1 card with a type
// including "Whitebeard Pirates" from your hand instead.

export const OP13_046_VISTA: EffectSchema = {
  card_id: "OP13-046",
  card_name: "Vista",
  card_type: "Character",
  effects: [
    {
      id: "OP13-046_keywords",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
    {
      id: "OP13-046_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_LEAVE_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP13-047 Fossa ────────────────────────────────────────────────────────
// If your Character with a type including "Whitebeard Pirates" would be K.O.'d
// by your opponent's effect, you may trash this Character instead.

export const OP13_047_FOSSA: EffectSchema = {
  card_id: "OP13-047",
  card_name: "Fossa",
  card_type: "Character",
  effects: [
    {
      id: "OP13-047_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          traits_contains: ["Whitebeard Pirates"],
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
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

// ─── OP13-050 Boa Sandersonia ──────────────────────────────────────────────
// [On Play] If your Leader is [Boa Hancock], play up to 1 [Boa Hancock] with
// a cost of 3 or less from your hand.

export const OP13_050_BOA_SANDERSONIA: EffectSchema = {
  card_id: "OP13-050",
  card_name: "Boa Sandersonia",
  card_type: "Character",
  effects: [
    {
      id: "OP13-050_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Boa Hancock" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Boa Hancock", cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP13-051 Boa Hancock ──────────────────────────────────────────────────
// [On K.O.] If your Leader is [Boa Hancock] or multicolored, draw 2 cards.

export const OP13_051_BOA_HANCOCK: EffectSchema = {
  card_id: "OP13-051",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "OP13-051_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Boa Hancock" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { multicolored: true },
          },
        ],
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP13-052 Boa Marigold ─────────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader is [Boa Hancock], play up to 1 [Boa Hancock] with
// a cost of 6 or less from your hand.

export const OP13_052_BOA_MARIGOLD: EffectSchema = {
  card_id: "OP13-052",
  card_name: "Boa Marigold",
  card_type: "Character",
  effects: [
    {
      id: "OP13-052_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-052_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Boa Hancock" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Boa Hancock", cost_max: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP13-053 Marshall.D.Teach ─────────────────────────────────────────────
// [When Attacking] You may trash 1 of your Characters with a type including
// "Whitebeard Pirates": Draw 1 card and this Character gains [Banish] during
// this turn.

export const OP13_053_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP13-053",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "OP13-053_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        {
          type: "TRASH_OWN_CHARACTER",
          amount: 1,
          filter: { traits_contains: ["Whitebeard Pirates"] },
        },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-054 Yamato ───────────────────────────────────────────────────────
// [On Play] If you have 3 or less Life cards, draw 2 cards. Then, give up to
// 1 rested DON!! card to your Leader.

export const OP13_054_YAMATO: EffectSchema = {
  card_id: "OP13-054",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "OP13-054_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-055 Rakuyo ───────────────────────────────────────────────────────
// [When Attacking] If you have 4 or less cards in your hand, all of your
// Characters with a type including "Whitebeard Pirates" gain +1000 power
// during this turn.

export const OP13_055_RAKUYO: EffectSchema = {
  card_id: "OP13-055",
  card_name: "Rakuyo",
  card_type: "Character",
  effects: [
    {
      id: "OP13-055_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP13-056 LittleOars Jr. ──────────────────────────────────────────────
// [When Attacking] If your Leader's type includes "Whitebeard Pirates", draw
// 1 card.

export const OP13_056_LITTLEOARS_JR: EffectSchema = {
  card_id: "OP13-056",
  card_name: "LittleOars Jr.",
  card_type: "Character",
  effects: [
    {
      id: "OP13-056_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-057 If I Bowed Down to Power, What's the Point in Living? ───────
// [Main] You may rest 1 of your DON!! cards: If you have 1 or less Life cards,
// your opponent cannot activate [Blocker] whenever your Leader attacks during
// this turn.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_057_IF_I_BOWED_DOWN: EffectSchema = {
  card_id: "OP13-057",
  card_name: "If I Bowed Down to Power, What's the Point in Living?",
  card_type: "Event",
  effects: [
    {
      id: "OP13-057_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
            scope: { when_attacking: { type: "YOUR_LEADER" } },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-057_counter",
      category: "auto",
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

// ─── OP13-058 Phoenix Pyreapple ────────────────────────────────────────────
// [Main] You may rest 1 of your DON!! cards: Place up to 1 of your opponent's
// Characters with 3000 power or less at the bottom of the owner's deck.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_058_PHOENIX_PYREAPPLE: EffectSchema = {
  card_id: "OP13-058",
  card_name: "Phoenix Pyreapple",
  card_type: "Event",
  effects: [
    {
      id: "OP13-058_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
          params: { position: "BOTTOM" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-058_counter",
      category: "auto",
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

// ─── OP13-059 Brilliant Punk ───────────────────────────────────────────────
// [Main] You may return 1 of your Characters to the owner's hand: Return up
// to 1 Character with a cost of 6 or less to the owner's hand.
// [Trigger] Draw 1 card.

export const OP13_059_BRILLIANT_PUNK: EffectSchema = {
  card_id: "OP13-059",
  card_name: "Brilliant Punk",
  card_type: "Event",
  effects: [
    {
      id: "OP13-059_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1 }],
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
      id: "OP13-059_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Roger Pirates / DON given (OP13-060 to OP13-078)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP13-060 Amatsuki Toki ────────────────────────────────────────────────
// If your Character with a type including "Roger Pirates" would be K.O.'d by
// your opponent's effect, you may trash this Character instead.

export const OP13_060_AMATSUKI_TOKI: EffectSchema = {
  card_id: "OP13-060",
  card_name: "Amatsuki Toki",
  card_type: "Character",
  effects: [
    {
      id: "OP13-060_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          traits_contains: ["Roger Pirates"],
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
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

// ─── OP13-061 Inuarashi ───────────────────────────────────────────────────
// [On Play] If you have any DON!! cards given, add up to 1 DON!! card from
// your DON!! deck and rest it. Then, K.O. up to 1 of your opponent's
// Characters with a cost of 1 or less.

export const OP13_061_INUARASHI: EffectSchema = {
  card_id: "OP13-061",
  card_name: "Inuarashi",
  card_type: "Character",
  effects: [
    {
      id: "OP13-061_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-062 Crocus ───────────────────────────────────────────────────────
// [On Play] If you have any DON!! cards given, add up to 1 DON!! card from
// your DON!! deck and set it as active.
// [When Attacking] Return up to 1 of your opponent's Characters with a base
// power of 3000 or less to the owner's hand.

export const OP13_062_CROCUS: EffectSchema = {
  card_id: "OP13-062",
  card_name: "Crocus",
  card_type: "Character",
  effects: [
    {
      id: "OP13-062_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
    {
      id: "OP13-062_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 3000 },
          },
        },
      ],
    },
  ],
};

// ─── OP13-063 Kouzuki Oden ─────────────────────────────────────────────────
// [Blocker]
// [On Play] If you have any DON!! cards given, add up to 1 DON!! card from
// your DON!! deck and rest it.

export const OP13_063_KOUZUKI_ODEN: EffectSchema = {
  card_id: "OP13-063",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "OP13-063_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-063_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-064 Gol.D.Roger ─────────────────────────────────────────────────
// Your Leader and all of your Characters that do not have a type including
// "Roger Pirates" have their effects negated.
// [On Play] DON!! −3: Your Leader gains +2000 power until the end of your
// opponent's next End Phase. Then, give all of your opponent's Characters
// −2000 power until the end of your opponent's next End Phase.

export const OP13_064_GOL_D_ROGER: EffectSchema = {
  card_id: "OP13-064",
  card_name: "Gol.D.Roger",
  card_type: "Character",
  effects: [
    {
      id: "OP13-064_negate_effects",
      category: "permanent",
      modifiers: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits_exclude: ["Roger Pirates"] },
          },
        },
      ],
    },
    {
      id: "OP13-064_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 3 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_OPPONENT_CHARACTERS",
          },
          params: { amount: -2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-065 Shanks ───────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 card
// with a type including "Roger Pirates" other than [Shanks] and add it to your
// hand. Then, place the rest at the bottom of your deck in any order.

export const OP13_065_SHANKS: EffectSchema = {
  card_id: "OP13-065",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP13-065_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits_contains: ["Roger Pirates"],
              exclude_name: "Shanks",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP13-066 Silvers Rayleigh ─────────────────────────────────────────────
// [Rush]
// [On Play] If you have any DON!! cards given, rest up to 1 of your opponent's
// Characters with a cost of 5 or less. Then, add up to 1 DON!! card from your
// DON!! deck and set it as active at the end of this turn.

export const OP13_066_SILVERS_RAYLEIGH: EffectSchema = {
  card_id: "OP13-066",
  card_name: "Silvers Rayleigh",
  card_type: "Character",
  effects: [
    {
      id: "OP13-066_keywords",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "OP13-066_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
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
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "ADD_DON_FROM_DECK",
              params: { amount: 1, target_state: "ACTIVE" },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-067 Scopper Gaban ────────────────────────────────────────────────
// [On Play] If your Leader's type includes "Roger Pirates", draw 2 cards and
// trash 1 card from your hand. Then, add up to 1 DON!! card from your DON!!
// deck and rest it.

export const OP13_067_SCOPPER_GABAN: EffectSchema = {
  card_id: "OP13-067",
  card_name: "Scopper Gaban",
  card_type: "Character",
  effects: [
    {
      id: "OP13-067_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Roger Pirates" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-068 Douglas Bullet ───────────────────────────────────────────────
// If you have 8 or more DON!! cards on your field, this Character gains +2000
// power.
// [On Play] If your Leader's type includes "Roger Pirates", add up to 1 DON!!
// card from your DON!! deck and rest it.

export const OP13_068_DOUGLAS_BULLET: EffectSchema = {
  card_id: "OP13-068",
  card_name: "Douglas Bullet",
  card_type: "Character",
  effects: [
    {
      id: "OP13-068_conditional_power",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
    {
      id: "OP13-068_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Roger Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-069 Tom ──────────────────────────────────────────────────────────
// [On Play] DON!! −1: Add up to 1 Stage card with a cost of 3 or less from
// your trash to your hand.

export const OP13_069_TOM: EffectSchema = {
  card_id: "OP13-069",
  card_name: "Tom",
  card_type: "Character",
  effects: [
    {
      id: "OP13-069_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "STAGE", cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP13-071 Nekomamushi ──────────────────────────────────────────────────
// [On Play] If you have 8 or more DON!! cards on your field, K.O. up to 1 of
// your opponent's Characters with 3000 base power or less.

export const OP13_071_NEKOMAMUSHI: EffectSchema = {
  card_id: "OP13-071",
  card_name: "Nekomamushi",
  card_type: "Character",
  effects: [
    {
      id: "OP13-071_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 3000 },
          },
        },
      ],
    },
  ],
};

// ─── OP13-072 Buggy ────────────────────────────────────────────────────────
// [On Play] If your Leader's type includes "Roger Pirates" and you have any
// DON!! cards given, add up to 1 DON!! card from your DON!! deck and rest it.

export const OP13_072_BUGGY: EffectSchema = {
  card_id: "OP13-072",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "OP13-072_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait_contains: "Roger Pirates" },
          },
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "ANY_CARD_HAS_DON",
          },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-074 Hera ─────────────────────────────────────────────────────────
// [On Play] Play up to 1 {Homies} type Character card with 3000 power or less
// from your hand.

export const OP13_074_HERA: EffectSchema = {
  card_id: "OP13-074",
  card_name: "Hera",
  card_type: "Character",
  effects: [
    {
      id: "OP13-074_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Homies"], power_max: 3000 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP13-075 Guess We'll Have Another Scrap ───────────────────────────────
// [Main] You may rest 1 of your DON!! cards: If your Leader is [Gol.D.Roger]
// and you have any DON!! cards given, add up to 1 DON!! card from your DON!!
// deck and rest it.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_075_GUESS_WELL_HAVE_ANOTHER_SCRAP: EffectSchema = {
  card_id: "OP13-075",
  card_name: "Guess We'll Have Another Scrap. You Can Only Risk Death While You're Still Alive!!",
  card_type: "Event",
  effects: [
    {
      id: "OP13-075_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Gol.D.Roger" },
          },
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "ANY_CARD_HAS_DON",
          },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-075_counter",
      category: "auto",
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

// ─── OP13-076 Divine Departure ─────────────────────────────────────────────
// [Main] You may rest 5 of your DON!! cards: If you have any DON!! cards
// given, give up to 1 of your opponent's Characters −8000 power during this
// turn.
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.

export const OP13_076_DIVINE_DEPARTURE: EffectSchema = {
  card_id: "OP13-076",
  card_name: "Divine Departure",
  card_type: "Event",
  effects: [
    {
      id: "OP13-076_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 5 }],
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -8000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-076_counter",
      category: "auto",
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

// ─── OP13-077 Go All the Way to the Top!! ──────────────────────────────────
// [Main] You may rest 3 of your DON!! cards: If you have any DON!! cards
// given, K.O. up to 1 of your opponent's Characters with 4000 base power or
// less and up to 1 of your opponent's Characters with 3000 base power or less.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_077_GO_ALL_THE_WAY_TO_THE_TOP: EffectSchema = {
  card_id: "OP13-077",
  card_name: "Go All the Way to the Top!!",
  card_type: "Event",
  effects: [
    {
      id: "OP13-077_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 3 }],
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            dual_targets: [
              { filter: { base_power_max: 4000 }, count: { up_to: 1 } },
              { filter: { base_power_max: 3000 }, count: { up_to: 1 } },
            ],
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-077_counter",
      category: "auto",
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

// ─── OP13-078 Oro Jackson ──────────────────────────────────────────────────
// [Once Per Turn] When your Character with a type including "Roger Pirates" is
// removed from the field by your opponent's effect, add up to 1 DON!! card
// from your DON!! deck and rest it.

export const OP13_078_ORO_JACKSON: EffectSchema = {
  card_id: "OP13-078",
  card_name: "Oro Jackson",
  card_type: "Stage",
  effects: [
    {
      id: "OP13-078_on_removal",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        filter: {
          controller: "SELF",
          cause: "BY_OPPONENT_EFFECT",
          target_filter: { traits_contains: ["Roger Pirates"] },
        },
        once_per_turn: true,
      },
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
// BLACK — Imu / Five Elders / Celestial Dragons (OP13-079 to OP13-099)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP13-079 Imu (Leader) ─────────────────────────────────────────────────
// Under the rules of this game, you cannot include Events with a cost of 2 or
// more in your deck and at the start of the game, play up to 1 {Mary Geoise}
// type Stage card from your deck.
// [Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons}
// type Characters or 1 card from your hand: Draw 1 card.
//
// NOTE: START_OF_GAME_EFFECT schema is encoded but engine setup does not yet
// process start-of-game rule modifications. The schema is ready for when that
// support is added.

export const OP13_079_IMU: EffectSchema = {
  card_id: "OP13-079",
  card_name: "Imu",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-079_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "CHOICE",
          labels: ["Trash Celestial Dragons Character", "Trash card from hand"],
          options: [
            [
              {
                type: "TRASH_OWN_CHARACTER",
                amount: 1,
                filter: { traits: ["Celestial Dragons"] },
              },
            ],
            [
              {
                type: "TRASH_FROM_HAND",
                amount: 1,
              },
            ],
          ],
        },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
  rule_modifications: [
    {
      rule_type: "DECK_RESTRICTION",
      restriction: "CANNOT_INCLUDE",
      filter: { card_type: "EVENT", cost_min: 2 },
    },
    {
      rule_type: "START_OF_GAME_EFFECT",
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            search_full_deck: true,
            filter: { traits: ["Mary Geoise"], card_type: "STAGE" },
            shuffle_after: true,
          },
        },
      ],
    },
  ],
};

// ─── OP13-080 St. Ethanbaron V. Nusjuro ────────────────────────────────────
// If you have 7 or more cards in your trash, this Character cannot be removed
// from the field by your opponent's effects and gains [Rush].
// [When Attacking] If you have 10 or more cards in your trash, give up to 1
// of your opponent's Characters −2000 power during this turn.

export const OP13_080_ST_ETHANBARON_V_NUSJURO: EffectSchema = {
  card_id: "OP13-080",
  card_name: "St. Ethanbaron V. Nusjuro",
  card_type: "Character",
  effects: [
    {
      id: "OP13-080_conditional_protection",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "OP13-080_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
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

// ─── OP13-081 Koala ────────────────────────────────────────────────────────
// If your Leader has the {Revolutionary Army} type, this Character gains +3 cost.
// [Activate: Main] [Once Per Turn] You may place 1 card from your trash at the
// bottom of your deck: Give up to 1 rested DON!! card to your Leader or 1 of
// your Characters.

export const OP13_081_KOALA: EffectSchema = {
  card_id: "OP13-081",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "OP13-081_conditional_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "OP13-081_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 1,
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP13-082 Five Elders ──────────────────────────────────────────────────
// [Activate: Main] If your Leader is [Imu], you may rest 1 of your DON!! cards
// and trash 1 card from your hand: Trash all of your Characters and play up to
// 5 {Five Elders} type Character cards with 5000 power and different card names
// from your trash.

export const OP13_082_FIVE_ELDERS: EffectSchema = {
  card_id: "OP13-082",
  card_name: "Five Elders",
  card_type: "Character",
  effects: [
    {
      id: "OP13-082_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Imu" },
      },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "KO",
          target: {
            type: "ALL_YOUR_CHARACTERS",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 5 },
            filter: {
              traits: ["Five Elders"],
              power_exact: 5000,
            },
            uniqueness_constraint: { field: "name" },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-083 St. Jaygarcia Saturn ─────────────────────────────────────────
// If you have 7 or more cards in your trash, this Character cannot be removed
// from the field by your opponent's effects.
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five
// Elders} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const OP13_083_ST_JAYGARCIA_SATURN: EffectSchema = {
  card_id: "OP13-083",
  card_name: "St. Jaygarcia Saturn",
  card_type: "Character",
  effects: [
    {
      id: "OP13-083_conditional_protection",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
    {
      id: "OP13-083_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Five Elders"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP13-084 St. Shepherd Ju Peter ────────────────────────────────────────
// If you have 7 or more cards in your trash, this Character cannot be removed
// from the field by your opponent's effects.
// [Your Turn] If you have 10 or more cards in your trash, set the base power
// of all of your {Five Elders} type Characters to 7000.

export const OP13_084_ST_SHEPHERD_JU_PETER: EffectSchema = {
  card_id: "OP13-084",
  card_name: "St. Shepherd Ju Peter",
  card_type: "Character",
  effects: [
    {
      id: "OP13-084_conditional_protection",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
    {
      id: "OP13-084_your_turn_set_power",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
      modifiers: [
        {
          type: "SET_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["Five Elders"] },
          },
          params: { value: 7000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
  ],
};

// ─── OP13-086 Saint Shalria ────────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1
// {Celestial Dragons} type card other than [Saint Shalria] and add it to your
// hand. Then, trash the rest and trash 1 card from your hand.

export const OP13_086_SAINT_SHALRIA: EffectSchema = {
  card_id: "OP13-086",
  card_name: "Saint Shalria",
  card_type: "Character",
  effects: [
    {
      id: "OP13-086_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Celestial Dragons"],
              exclude_name: "Saint Shalria",
            },
          },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP13-087 Saint Charlos ────────────────────────────────────────────────
// [Blocker]
// [On Play] Trash 1 card from the top of your deck.

export const OP13_087_SAINT_CHARLOS: EffectSchema = {
  card_id: "OP13-087",
  card_name: "Saint Charlos",
  card_type: "Character",
  effects: [
    {
      id: "OP13-087_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-087_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-089 St. Topman Warcury ───────────────────────────────────────────
// If you have 7 or more cards in your trash, this Character cannot be removed
// from the field by your opponent's effects and gains [Blocker].
// [On K.O.] Draw 1 card.

export const OP13_089_ST_TOPMAN_WARCURY: EffectSchema = {
  card_id: "OP13-089",
  card_name: "St. Topman Warcury",
  card_type: "Character",
  effects: [
    {
      id: "OP13-089_conditional_protection",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
    {
      id: "OP13-089_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-091 St. Marcus Mars ──────────────────────────────────────────────
// If you have 7 or more cards in your trash, this Character cannot be removed
// from the field by your opponent's effects and gains [Blocker].
// [On Play] You may trash 1 card from your hand: K.O. up to 1 of your
// opponent's Characters with a base cost of 5 or less.

export const OP13_091_ST_MARCUS_MARS: EffectSchema = {
  card_id: "OP13-091",
  card_name: "St. Marcus Mars",
  card_type: "Character",
  effects: [
    {
      id: "OP13-091_conditional_protection",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
    {
      id: "OP13-091_on_play",
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
            filter: { base_cost_max: 5 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-092 Saint Mjosgard ───────────────────────────────────────────────
// [On Play] If you have 3 or less Life cards, play up to 1 {Mary Geoise} type
// Stage card with a cost of 1 from your trash.

export const OP13_092_SAINT_MJOSGARD: EffectSchema = {
  card_id: "OP13-092",
  card_name: "Saint Mjosgard",
  card_type: "Character",
  effects: [
    {
      id: "OP13-092_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "STAGE_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Mary Geoise"], cost_exact: 1 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP13-093 Morgans ──────────────────────────────────────────────────────
// [Blocker]
// [On Play] Draw 2 cards and trash 2 cards from your hand.

export const OP13_093_MORGANS: EffectSchema = {
  card_id: "OP13-093",
  card_name: "Morgans",
  card_type: "Character",
  effects: [
    {
      id: "OP13-093_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-093_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 2 },
          },
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP13-094 York ─────────────────────────────────────────────────────────
// [On Play] Up to 1 of your {Celestial Dragons} type Characters gains +2000
// power during this turn.

export const OP13_094_YORK: EffectSchema = {
  card_id: "OP13-094",
  card_name: "York",
  card_type: "Character",
  effects: [
    {
      id: "OP13-094_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Celestial Dragons"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP13-095 Saint Rosward ────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: If you only have {Celestial
// Dragons} type Characters, K.O. up to 2 of your opponent's Characters with a
// base cost of 3 or less.

export const OP13_095_SAINT_ROSWARD: EffectSchema = {
  card_id: "OP13-095",
  card_name: "Saint Rosward",
  card_type: "Character",
  effects: [
    {
      id: "OP13-095_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { card_type: "CHARACTER", traits: ["Celestial Dragons"] },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { base_cost_max: 3 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-096 The Five Elders Are at Your Service!!! ───────────────────────
// [Main] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial
// Dragons} type card other than [The Five Elders Are at Your Service!!!] and
// add it to your hand. Then, trash the rest.
// [Trigger] Activate this card's [Main] effect.

export const OP13_096_THE_FIVE_ELDERS_ARE_AT_YOUR_SERVICE: EffectSchema = {
  card_id: "OP13-096",
  card_name: "The Five Elders Are at Your Service!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP13-096_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Celestial Dragons"],
              exclude_name: "The Five Elders Are at Your Service!!!",
            },
          },
        },
      ],
    },
    {
      id: "OP13-096_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP13-097 The World's Equilibrium Cannot Be Maintained Forever ─────────
// [Main] You may rest 5 of your DON!! cards: If the only Characters on your
// field are {Celestial Dragons} type Characters, K.O. up to 1 of your
// opponent's Characters with a base cost of 6 or less.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP13_097_THE_WORLDS_EQUILIBRIUM: EffectSchema = {
  card_id: "OP13-097",
  card_name: "The World's Equilibrium Cannot Be Maintained Forever",
  card_type: "Event",
  effects: [
    {
      id: "OP13-097_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 5 }],
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { card_type: "CHARACTER", traits: ["Celestial Dragons"] },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 6 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-097_counter",
      category: "auto",
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

// ─── OP13-098 Never Existed... in the First Place... ───────────────────────
// [Main] You may rest 1 of your DON!! cards: If your Leader is [Imu], K.O. up
// to 1 of your opponent's Stages with a cost of 7.
// [Counter] If your Leader is [Imu], up to 1 of your Leader or Character cards
// gains +4000 power during this battle.

export const OP13_098_NEVER_EXISTED: EffectSchema = {
  card_id: "OP13-098",
  card_name: "Never Existed... in the First Place...",
  card_type: "Event",
  effects: [
    {
      id: "OP13-098_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Imu" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "STAGE",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 7 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-098_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Imu" },
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
  ],
};

// ─── OP13-099 The Empty Throne ─────────────────────────────────────────────
// [Your Turn] If you have 19 or more cards in your trash, your Leader gains
// +1000 power.
// [Activate: Main] You may rest this card and 3 of your DON!! cards: Play up
// to 1 black {Five Elders} type Character card with a cost equal to or less
// than the number of DON!! cards on your field from your hand.

export const OP13_099_THE_EMPTY_THRONE: EffectSchema = {
  card_id: "OP13-099",
  card_name: "The Empty Throne",
  card_type: "Stage",
  effects: [
    {
      id: "OP13-099_your_turn_power",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 19,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
    {
      id: "OP13-099_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "REST_DON", amount: 3 },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "BLACK",
              traits: ["Five Elders"],
              cost_max: {
                type: "GAME_STATE",
                source: "DON_FIELD_COUNT",
                controller: "SELF",
              },
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Jewelry Bonney / Egghead (OP13-100 to OP13-120)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP13-100 Jewelry Bonney (Leader) ──────────────────────────────────────
// [Your Turn] [Once Per Turn] This effect can be activated when you play a
// Character with a [Trigger]. Give up to 2 rested DON!! cards to 1 of your
// Leader or Character cards.

export const OP13_100_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP13-100",
  card_name: "Jewelry Bonney",
  card_type: "Leader",
  effects: [
    {
      id: "OP13-100_on_trigger_play",
      category: "auto",
      trigger: {
        event: "CHARACTER_PLAYED",
        filter: {
          controller: "SELF",
          target_filter: { has_trigger: true },
        },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP13-102 Edison ───────────────────────────────────────────────────────
// [Activate: Main] You may trash this Character: If the number of your Life
// cards is equal to or less than the number of your opponent's Life cards, draw
// 1 card. Then, rest up to 1 of your opponent's Characters with a cost of 3 or
// less.
// [Trigger] Draw 1 card and rest up to 1 of your opponent's Characters with a
// cost of 3 or less.

export const OP13_102_EDISON: EffectSchema = {
  card_id: "OP13-102",
  card_name: "Edison",
  card_type: "Character",
  effects: [
    {
      id: "OP13-102_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-102_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP13-104 Kouzuki Hiyori ──────────────────────────────────────────────
// [Blocker]
// [On K.O.] You may trash 1 card from your hand: If your Leader is multicolored,
// add up to 1 card from the top of your deck to the top of your Life cards.

export const OP13_104_KOUZUKI_HIYORI: EffectSchema = {
  card_id: "OP13-104",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "OP13-104_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-104_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
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

// ─── OP13-105 Kouzuki Momonosuke ──────────────────────────────────────────
// [On Play] Look at all of your Life cards and place them back in your Life
// area in any order.

export const OP13_105_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "OP13-105",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "OP13-105_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "REORDER_ALL_LIFE",
        },
      ],
    },
  ],
};

// ─── OP13-106 Conney ───────────────────────────────────────────────────────
// [Opponent's Turn] When a [Trigger] activates, this Character gains [Blocker]
// during this turn.
// [Trigger] Play this card.

export const OP13_106_CONNEY: EffectSchema = {
  card_id: "OP13-106",
  card_name: "Conney",
  card_type: "Character",
  effects: [
    {
      id: "OP13-106_trigger_activated_blocker",
      category: "auto",
      trigger: {
        event: "TRIGGER_ACTIVATED",
        turn_restriction: "OPPONENT_TURN",
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP13-106_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP13-108 Jewelry Bonney ───────────────────────────────────────────────
// [On Play] If your Leader has the {Egghead} type, this Character gains [Rush]
// during this turn. Then, your opponent adds 1 card from the top of their Life
// cards to their hand.
// [Trigger] If you have 1 or less Life cards, rest up to 1 of your opponent's
// Characters with a cost of 7 or less.

export const OP13_108_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP13-108",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "OP13-108_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Egghead" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "LIFE_TO_HAND",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP13-108_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── OP13-109 Jewelry Bonney ───────────────────────────────────────────────
// If this Character would be removed from the field by your opponent's effect,
// you may turn 1 card from the top of your Life cards face-up instead.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP13_109_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP13-109",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "OP13-109_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-109_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP13-110 Stussy ───────────────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader has the {Egghead} type, play up to 1 Character card
// with a cost of 5 or less and a [Trigger] from your hand.

export const OP13_110_STUSSY: EffectSchema = {
  card_id: "OP13-110",
  card_name: "Stussy",
  card_type: "Character",
  effects: [
    {
      id: "OP13-110_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-110_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Egghead" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 5, has_trigger: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP13-112 Vegapunk ─────────────────────────────────────────────────────
// If you have a total of 2 or more given DON!! cards, this Character gains
// [Blocker].

export const OP13_112_VEGAPUNK: EffectSchema = {
  card_id: "OP13-112",
  card_name: "Vegapunk",
  card_type: "Character",
  effects: [
    {
      id: "OP13-112_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP13-113 Lilith ───────────────────────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 card
// with a [Trigger] other than [Lilith] and add it to your hand. Then, place
// the rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [On Play] effect.

export const OP13_113_LILITH: EffectSchema = {
  card_id: "OP13-113",
  card_name: "Lilith",
  card_type: "Character",
  effects: [
    {
      id: "OP13-113_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              has_trigger: true,
              exclude_name: "Lilith",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP13-113_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "ON_PLAY" } },
      ],
    },
  ],
};

// ─── OP13-114 S-Snake ──────────────────────────────────────────────────────
// [On Play]/[When Attacking] You may turn 1 card from the top of your Life
// cards face-up: Give up to 1 of your opponent's Characters −2000 power during
// this turn.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP13_114_S_SNAKE: EffectSchema = {
  card_id: "OP13-114",
  card_name: "S-Snake",
  card_type: "Character",
  effects: [
    {
      id: "OP13-114_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-114_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-114_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-115 Paper Art Afterimage ─────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +3000 power during
// this battle. Then, if your opponent has 2 or less Life cards, up to 1 of your
// Leader or Character cards gains +1000 power during this turn.
// [Trigger] Draw 1 card.

export const OP13_115_PAPER_ART_AFTERIMAGE: EffectSchema = {
  card_id: "OP13-115",
  card_name: "Paper Art Afterimage",
  card_type: "Event",
  effects: [
    {
      id: "OP13-115_counter",
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
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "OP13-115_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-116 The One Who Is the Most Free Is the Pirate King!!! ───────────
// [Main] Look at 5 cards from the top of your deck; reveal up to 1
// {Supernovas} type Character card and add it to your hand. Then, place the
// rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const OP13_116_THE_ONE_WHO_IS_THE_MOST_FREE: EffectSchema = {
  card_id: "OP13-116",
  card_name: "The One Who Is the Most Free Is the Pirate King!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP13-116_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Supernovas"],
              card_type: "CHARACTER",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP13-116_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP13-117 Gum-Gum Dawn Stamp ──────────────────────────────────────────
// [Main] You may turn 1 card from the top of your Life cards face-up: K.O. up
// to 1 of your opponent's Characters with a base cost of 6 or less.
// [Trigger] Draw 1 card.

export const OP13_117_GUM_GUM_DAWN_STAMP: EffectSchema = {
  card_id: "OP13-117",
  card_name: "Gum-Gum Dawn Stamp",
  card_type: "Event",
  effects: [
    {
      id: "OP13-117_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 6 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP13-117_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP13-118 Monkey.D.Luffy ───────────────────────────────────────────────
// [Double Attack]
// [On Play] If your Leader is multicolored, set up to 4 of your DON!! cards as
// active. Then, you cannot play Character cards with a base cost of 5 or more
// during this turn.

export const OP13_118_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP13-118",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP13-118_keywords",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
    {
      id: "OP13-118_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 4 },
        },
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_PLAY_CHARACTER",
            scope: { cost_filter: { operator: ">=", value: 5 } },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP13-119 Portgas.D.Ace ────────────────────────────────────────────────
// If you have 3 or less Life cards, this Character gains [Rush].
// [On Play] Give up to 1 rested DON!! card to your Leader. Then, you may
// return up to 1 of your opponent's Characters with a cost of 5 or less to the
// owner's hand. If you do, your opponent plays up to 1 Character card with a
// cost of 4 or less from their hand.

export const OP13_119_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP13-119",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "OP13-119_conditional_rush",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "OP13-119_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          chain: "THEN",
        },
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "PLAY_CARD",
              target: {
                type: "CHARACTER_CARD",
                source_zone: "HAND",
                count: { up_to: 1 },
                filter: { cost_max: 4 },
              },
              params: { source_zone: "HAND", cost_override: "FREE" },
            },
          },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP13-120 Sabo ─────────────────────────────────────────────────────────
// [Blocker]
// [Activate: Main] [Once Per Turn] Up to 1 of your Characters gains +2 cost
// until the end of your opponent's next turn. Then, give up to 1 rested DON!!
// card to your Leader.

export const OP13_120_SABO: EffectSchema = {
  card_id: "OP13-120",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "OP13-120_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP13-120_activate_main",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP13_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP13-001": OP13_001_MONKEY_D_LUFFY,
  "OP13-002": OP13_002_PORTGAS_D_ACE,
  "OP13-003": OP13_003_GOL_D_ROGER,
  "OP13-004": OP13_004_SABO,
  "OP13-005": OP13_005_INAZUMA,
  "OP13-006": OP13_006_WOOP_SLAP,
  "OP13-007": OP13_007_ACE_SABO_LUFFY,
  "OP13-008": OP13_008_EMPORIO_IVANKOV,
  "OP13-009": OP13_009_CURLY_DADAN,
  "OP13-012": OP13_012_NEFELTARI_VIVI,
  "OP13-013": OP13_013_HIGUMA,
  "OP13-015": OP13_015_MAKINO,
  "OP13-016": OP13_016_MONKEY_D_GARP,
  "OP13-017": OP13_017_MONKEY_D_DRAGON,
  "OP13-019": OP13_019_BUT_ACE_HERE_SAID_YOU_DESERVED_IT,
  "OP13-020": OP13_020_METEOR_FIST,
  "OP13-021": OP13_021_GUM_GUM_GATLING_GUN,
  "OP13-022": OP13_022_WINDMILL_VILLAGE,
  // Green
  "OP13-023": OP13_023_UTA,
  "OP13-024": OP13_024_GORDON,
  "OP13-025": OP13_025_KOBY,
  "OP13-026": OP13_026_SUNNY_KUN,
  "OP13-027": OP13_027_SANJI,
  "OP13-028": OP13_028_SHANKS,
  "OP13-030": OP13_030_TONY_TONY_CHOPPER,
  "OP13-031": OP13_031_TRAFALGAR_LAW,
  "OP13-032": OP13_032_NICO_ROBIN,
  "OP13-033": OP13_033_FRANKY,
  "OP13-034": OP13_034_BROOK,
  "OP13-035": OP13_035_BEPO,
  "OP13-037": OP13_037_RORONOA_ZORO,
  "OP13-038": OP13_038_GUM_GUM_ELEPHANT_GUN,
  "OP13-039": OP13_039_GUM_GUM_SNAKE_SHOT,
  "OP13-040": OP13_040_I_KNOW_YOURE_STRONG,
  // Blue
  "OP13-041": OP13_041_IZO,
  "OP13-042": OP13_042_EDWARD_NEWGATE,
  "OP13-043": OP13_043_OTAMA,
  "OP13-044": OP13_044_CURIEL,
  "OP13-045": OP13_045_HARUTA,
  "OP13-046": OP13_046_VISTA,
  "OP13-047": OP13_047_FOSSA,
  "OP13-050": OP13_050_BOA_SANDERSONIA,
  "OP13-051": OP13_051_BOA_HANCOCK,
  "OP13-052": OP13_052_BOA_MARIGOLD,
  "OP13-053": OP13_053_MARSHALL_D_TEACH,
  "OP13-054": OP13_054_YAMATO,
  "OP13-055": OP13_055_RAKUYO,
  "OP13-056": OP13_056_LITTLEOARS_JR,
  "OP13-057": OP13_057_IF_I_BOWED_DOWN,
  "OP13-058": OP13_058_PHOENIX_PYREAPPLE,
  "OP13-059": OP13_059_BRILLIANT_PUNK,
  // Purple
  "OP13-060": OP13_060_AMATSUKI_TOKI,
  "OP13-061": OP13_061_INUARASHI,
  "OP13-062": OP13_062_CROCUS,
  "OP13-063": OP13_063_KOUZUKI_ODEN,
  "OP13-064": OP13_064_GOL_D_ROGER,
  "OP13-065": OP13_065_SHANKS,
  "OP13-066": OP13_066_SILVERS_RAYLEIGH,
  "OP13-067": OP13_067_SCOPPER_GABAN,
  "OP13-068": OP13_068_DOUGLAS_BULLET,
  "OP13-069": OP13_069_TOM,
  "OP13-071": OP13_071_NEKOMAMUSHI,
  "OP13-072": OP13_072_BUGGY,
  "OP13-074": OP13_074_HERA,
  "OP13-075": OP13_075_GUESS_WELL_HAVE_ANOTHER_SCRAP,
  "OP13-076": OP13_076_DIVINE_DEPARTURE,
  "OP13-077": OP13_077_GO_ALL_THE_WAY_TO_THE_TOP,
  "OP13-078": OP13_078_ORO_JACKSON,
  // Black
  "OP13-079": OP13_079_IMU,
  "OP13-080": OP13_080_ST_ETHANBARON_V_NUSJURO,
  "OP13-081": OP13_081_KOALA,
  "OP13-082": OP13_082_FIVE_ELDERS,
  "OP13-083": OP13_083_ST_JAYGARCIA_SATURN,
  "OP13-084": OP13_084_ST_SHEPHERD_JU_PETER,
  "OP13-086": OP13_086_SAINT_SHALRIA,
  "OP13-087": OP13_087_SAINT_CHARLOS,
  "OP13-089": OP13_089_ST_TOPMAN_WARCURY,
  "OP13-091": OP13_091_ST_MARCUS_MARS,
  "OP13-092": OP13_092_SAINT_MJOSGARD,
  "OP13-093": OP13_093_MORGANS,
  "OP13-094": OP13_094_YORK,
  "OP13-095": OP13_095_SAINT_ROSWARD,
  "OP13-096": OP13_096_THE_FIVE_ELDERS_ARE_AT_YOUR_SERVICE,
  "OP13-097": OP13_097_THE_WORLDS_EQUILIBRIUM,
  "OP13-098": OP13_098_NEVER_EXISTED,
  "OP13-099": OP13_099_THE_EMPTY_THRONE,
  // Yellow
  "OP13-100": OP13_100_JEWELRY_BONNEY,
  "OP13-102": OP13_102_EDISON,
  "OP13-104": OP13_104_KOUZUKI_HIYORI,
  "OP13-105": OP13_105_KOUZUKI_MOMONOSUKE,
  "OP13-106": OP13_106_CONNEY,
  "OP13-108": OP13_108_JEWELRY_BONNEY,
  "OP13-109": OP13_109_JEWELRY_BONNEY,
  "OP13-110": OP13_110_STUSSY,
  "OP13-112": OP13_112_VEGAPUNK,
  "OP13-113": OP13_113_LILITH,
  "OP13-114": OP13_114_S_SNAKE,
  "OP13-115": OP13_115_PAPER_ART_AFTERIMAGE,
  "OP13-116": OP13_116_THE_ONE_WHO_IS_THE_MOST_FREE,
  "OP13-117": OP13_117_GUM_GUM_DAWN_STAMP,
  "OP13-118": OP13_118_MONKEY_D_LUFFY,
  "OP13-119": OP13_119_PORTGAS_D_ACE,
  "OP13-120": OP13_120_SABO,
};
