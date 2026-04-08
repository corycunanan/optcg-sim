/**
 * M4 Effect Schema — OP03 Card Encodings
 *
 * Red (Ace / Whitebeard Pirates): OP03-001 through OP03-020
 * Green (Kuro / East Blue): OP03-021 through OP03-039
 * Blue (Nami / East Blue): OP03-040 through OP03-057
 * Purple (Galley-La Company / Water Seven / Impel Down): OP03-058 through OP03-075
 * Black (CP / Navy): OP03-076 through OP03-098
 * Yellow (Big Mom Pirates): OP03-099 through OP03-123
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Ace / Whitebeard Pirates (OP03-001 to OP03-020)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP03-001 Portgas.D.Ace (Leader) — Compound trigger + variable trash cost
// When this Leader attacks or is attacked, you may trash any number of Event or
// Stage cards from your hand. This Leader gains +1000 power during this battle
// for every card trashed.

export const OP03_001_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP03-001",
  card_name: "Portgas.D.Ace",
  card_type: "Leader",
  effects: [
    {
      id: "attack_or_attacked_trash_buff",
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
          amount: "ANY_NUMBER",
          filter: { card_type: ["EVENT", "STAGE"] },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_TRASHED_THIS_WAY",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-002 Adio — DON!!x1 WHEN_ATTACKING blocker prohibition ────────────
// [DON!! x1] [When Attacking] Your opponent cannot activate a [Blocker]
// Character that has 2000 or less power during this battle.

export const OP03_002_ADIO: EffectSchema = {
  card_id: "OP03-002",
  card_name: "Adio",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_blocker_lock",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
            scope: {
              controller: "OPPONENT",
              filter: { power_max: 2000 },
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP03-003 Izo — ON_PLAY search for Whitebeard Pirates (not self) ───────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 card
// with a type including "Whitebeard Pirates" other than [Izo] and add it to
// your hand. Then, place the rest at the bottom of your deck in any order.

export const OP03_003_IZO: EffectSchema = {
  card_id: "OP03-003",
  card_name: "Izo",
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
              traits_contains: ["Whitebeard Pirates"],
              exclude_name: "Izo",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP03-004 Curiel — Cannot attack Leader on play turn + DON!!x1 Rush ────
// This Character cannot attack a Leader on the turn in which it is played.
// [DON!! x1] This Character gains [Rush].

export const OP03_004_CURIEL: EffectSchema = {
  card_id: "OP03-004",
  card_name: "Curiel",
  card_type: "Character",
  effects: [
    {
      id: "rush_no_leader_attack",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
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
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          scope: {
            when_attacking: { type: "OPPONENT_LEADER" },
          },
          conditions: { type: "WAS_PLAYED_THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP03-005 Thatch — ACTIVATE_MAIN once per turn +2000 then trash at EOT ─
// [Activate: Main] [Once Per Turn] This Character gains +2000 power during
// this turn. Then, trash this Character at the end of this turn.

export const OP03_005_THATCH: EffectSchema = {
  card_id: "OP03-005",
  card_name: "Thatch",
  card_type: "Character",
  effects: [
    {
      id: "activate_boost_then_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "TRASH_CARD",
              target: { type: "SELF" },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP03-008 Buggy — CANNOT_BE_KO by Slash in battle + ON_PLAY search ────
// This Character cannot be K.O.'d in battle by Slash attribute cards.
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 red
// Event and add it to your hand. Then, place the rest at the bottom of your
// deck in any order.

export const OP03_008_BUGGY: EffectSchema = {
  card_id: "OP03-008",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection_slash",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE", source_filter: { attribute: "SLASH" } },
        },
      ],
    },
    {
      id: "on_play_search_event",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              card_type: "EVENT",
              color: "RED",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP03-009 Haruta — ACTIVATE_MAIN once per turn give DON!! ──────────────
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your
// Leader or 1 of your Characters.

export const OP03_009_HARUTA: EffectSchema = {
  card_id: "OP03-009",
  card_name: "Haruta",
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
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP03-010 Fossa — Blocker ──────────────────────────────────────────────
// [Blocker]

export const OP03_010_FOSSA: EffectSchema = {
  card_id: "OP03-010",
  card_name: "Fossa",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP03-011 Blamenco — DON!!x1 WHEN_ATTACKING -2000 power ───────────────
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters
// −2000 power during this turn.

export const OP03_011_BLAMENCO: EffectSchema = {
  card_id: "OP03-011",
  card_name: "Blamenco",
  card_type: "Character",
  effects: [
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
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP03-012 Marshall.D.Teach — WHEN_ATTACKING trash own Character cost ───
// [When Attacking] You may trash 1 of your red Characters with 4000 power or
// more: Draw 1 card. Then, this Character gains +1000 power during this battle.

export const OP03_012_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP03-012",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_trash_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        {
          type: "TRASH_OWN_CHARACTER",
          filter: { color: "RED", power_min: 4000 },
          amount: 1,
        },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-013 Marco — YOUR_TURN ON_PLAY KO + ON_KO play from trash ────────
// [Your Turn] [On Play] K.O. up to 1 of your opponent's Characters with 3000
// power or less.
// [On K.O.] You may trash 1 Event from your hand: You may play this Character
// card from your trash rested.

export const OP03_013_MARCO: EffectSchema = {
  card_id: "OP03-013",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
        },
      ],
    },
    {
      id: "on_ko_replay",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "SELF",
            source_zone: "TRASH",
          },
          params: { source_zone: "TRASH", entry_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-014 Monkey.D.Garp — WHEN_ATTACKING play cost-1 red from hand ────
// [When Attacking] Play up to 1 red Character card with a cost of 1 from your
// hand.

export const OP03_014_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP03-014",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_play",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              color: "RED",
              cost_exact: 1,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP03-015 Lim — Blocker + Opponent's Turn ON_KO debuff ────────────────
// [Blocker]
// [Opponent's Turn] When this Character is K.O.'d, give up to 1 of your
// opponent's Leader or Character cards −2000 power during this turn.

export const OP03_015_LIM: EffectSchema = {
  card_id: "OP03-015",
  card_name: "Lim",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_debuff",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
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

// ─── OP03-016 Flame Emperor — MAIN_EVENT leader condition KO + Double Attack
// [Main] If your Leader is [Portgas.D.Ace], K.O. up to 1 of your opponent's
// Characters with 8000 power or less, and your Leader gains [Double Attack]
// and +3000 power during this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with 6000 power or less.

export const OP03_016_FLAME_EMPEROR: EffectSchema = {
  card_id: "OP03-016",
  card_name: "Flame Emperor",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_and_buff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Portgas.D.Ace" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 8000 },
          },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "YOUR_LEADER" },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
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

// ─── OP03-017 Cross Fire — MAIN/COUNTER conditional debuff + Trigger reuse ─
// [Main]/[Counter] If your Leader's type includes "Whitebeard Pirates", give
// up to 1 of your opponent's Characters −4000 power during this turn.
// [Trigger] Activate this card's [Main] effect.

export const OP03_017_CROSS_FIRE: EffectSchema = {
  card_id: "OP03-017",
  card_name: "Cross Fire",
  card_type: "Event",
  effects: [
    {
      id: "main_counter_debuff",
      category: "activate",
      trigger: {
        any_of: [
          { keyword: "MAIN_EVENT" },
          { keyword: "COUNTER_EVENT" },
        ],
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
    },
  ],
};

// ─── OP03-018 Fire Fist — MAIN_EVENT trash Event cost + dual KO ────────────
// [Main] You may trash 1 Event from your hand: K.O. up to 1 of your
// opponent's Characters with 5000 power or less and up to 1 of your
// opponent's Characters with 4000 power or less.
// [Trigger] K.O. up to 1 of your opponent's Characters with 5000 power or less.

export const OP03_018_FIRE_FIST: EffectSchema = {
  card_id: "OP03-018",
  card_name: "Fire Fist",
  card_type: "Event",
  effects: [
    {
      id: "main_dual_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            dual_targets: [
              { filter: { power_max: 5000 }, count: { up_to: 1 } },
              { filter: { power_max: 4000 }, count: { up_to: 1 } },
            ],
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
            filter: { power_max: 5000 },
          },
        },
      ],
    },
  ],
};

// ─── OP03-019 Fiery Doll — MAIN_EVENT leader power boost ──────────────────
// [Main] Your Leader gains +4000 power during this turn.
// [Trigger] Give up to 1 of your opponent's Leader or Character cards −10000
// power during this turn.

export const OP03_019_FIERY_DOLL: EffectSchema = {
  card_id: "OP03-019",
  card_name: "Fiery Doll",
  card_type: "Event",
  effects: [
    {
      id: "main_leader_buff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_debuff",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -10000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP03-020 Striker (Stage) — ACTIVATE_MAIN ② + rest Stage, Ace condition
// [Activate: Main] ② You may rest this Stage: If your Leader is
// [Portgas.D.Ace], look at 5 cards from the top of your deck; reveal up to 1
// Event and add it to your hand. Then, place the rest at the bottom of your
// deck in any order.

export const OP03_020_STRIKER: EffectSchema = {
  card_id: "OP03-020",
  card_name: "Striker",
  card_type: "Stage",
  effects: [
    {
      id: "activate_search_event",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 2 },
        { type: "REST_SELF" },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Portgas.D.Ace" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { card_type: "EVENT" },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Kuro / East Blue (OP03-021 to OP03-039)
// ═══════════════════════════════════════════════════════════════════════════════

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
            traits: ["East Blue"],
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
                      traits: ["East Blue"],
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
              traits: ["East Blue"],
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
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: {
            card_type: "CHARACTER",
            traits: ["East Blue"],
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
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: {
            card_type: "CHARACTER",
            traits: ["East Blue"],
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
      category: "auto",
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
      category: "auto",
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Nami / East Blue (OP03-040 to OP03-057)
// ═══════════════════════════════════════════════════════════════════════════════

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
                { type: "IS_MY_TURN", controller: "OPPONENT" },
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
            { type: "IS_MY_TURN", controller: "OPPONENT" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Galley-La Company / Water Seven / Impel Down (OP03-058 to OP03-075)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP03-058 Iceburg (Leader) — Cannot attack + Activate: Main play from hand
// This Leader cannot attack.
// [Activate: Main] DON!! −1 You may rest this Leader: Play up to 1 {Galley-La
// Company} type Character card with a cost of 5 or less from your hand.

export const OP03_058_ICEBURG: EffectSchema = {
  card_id: "OP03-058",
  card_name: "Iceburg",
  card_type: "Leader",
  effects: [
    {
      id: "cannot_attack",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          target: { type: "SELF" },
        },
      ],
    },
    {
      id: "activate_play_galley_la",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_contains: ["Galley-La Company"],
              cost_max: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP03-059 Kaku — When Attacking DON!! −1: gain Banish this battle ───────
// [When Attacking] DON!! −1: This Character gains [Banish] during this battle.

export const OP03_059_KAKU: EffectSchema = {
  card_id: "OP03-059",
  card_name: "Kaku",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_banish",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP03-060 Kalifa — When Attacking DON!! −1: Draw 2 and trash 1 ──────────
// [When Attacking] DON!! −1: Draw 2 cards and trash 1 card from your hand.

export const OP03_060_KALIFA: EffectSchema = {
  card_id: "OP03-060",
  card_name: "Kalifa",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP03-062 Kokoro — On Play search deck for Water Seven ──────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Water
// Seven} type card other than [Kokoro] and add it to your hand. Then, place
// the rest at the bottom of your deck in any order.

export const OP03_062_KOKORO: EffectSchema = {
  card_id: "OP03-062",
  card_name: "Kokoro",
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
              traits_contains: ["Water Seven"],
              exclude_name: "Kokoro",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP03-063 Zambai — Blocker + On Play DON!! −1: conditional draw ─────────
// [Blocker]
// [On Play] DON!! −1: If your Leader has the {Water Seven} type, draw 1 card.

export const OP03_063_ZAMBAI: EffectSchema = {
  card_id: "OP03-063",
  card_name: "Zambai",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_conditional_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Water Seven" },
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

// ─── OP03-064 Tilestone — On K.O. conditional add DON!! rested ──────────────
// [On K.O.] If your Leader has the {Galley-La Company} type, add up to 1 DON!!
// card from your DON!! deck and rest it.

export const OP03_064_TILESTONE: EffectSchema = {
  card_id: "OP03-064",
  card_name: "Tilestone",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_add_don",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Galley-La Company" },
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

// ─── OP03-065 Chimney & Gonbe — Blocker only ────────────────────────────────
// [Blocker]

export const OP03_065_CHIMNEY_AND_GONBE: EffectSchema = {
  card_id: "OP03-065",
  card_name: "Chimney & Gonbe",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP03-066 Paulie — On Play ➁: add DON!! active, then conditional KO ────
// [On Play] ➁: Add up to 1 DON!! card from your DON!! deck and set it as
// active. Then, if you have 8 or more DON!! cards on your field, K.O. up to 1
// of your opponent's Characters with a cost of 4 or less.

export const OP03_066_PAULIE: EffectSchema = {
  card_id: "OP03-066",
  card_name: "Paulie",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_and_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 2 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          chain: "THEN",
          conditions: {
            type: "DON_FIELD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 8,
          },
        },
      ],
    },
  ],
};

// ─── OP03-067 Peepley Lulu — DON!! x1 When Attacking conditional add DON!! ─
// [DON!! x1] [When Attacking] If your Leader has the {Galley-La Company} type,
// add up to 1 DON!! card from your DON!! deck and rest it.

export const OP03_067_PEEPLEY_LULU: EffectSchema = {
  card_id: "OP03-067",
  card_name: "Peepley Lulu",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_add_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Galley-La Company" },
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

// ─── OP03-068 Minozebra — Banish + On K.O. conditional add DON!! ────────────
// [Banish]
// [On K.O.] If your Leader has the {Impel Down} type, add up to 1 DON!! card
// from your DON!! deck and rest it.

export const OP03_068_MINOZEBRA: EffectSchema = {
  card_id: "OP03-068",
  card_name: "Minozebra",
  card_type: "Character",
  effects: [
    {
      id: "banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
    {
      id: "on_ko_add_don",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Impel Down" },
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

// ─── OP03-069 Minorhinoceros — On K.O. conditional draw 2 and trash 1 ───────
// [On K.O.] If your Leader has the {Impel Down} type, draw 2 cards and trash 1
// card from your hand.

export const OP03_069_MINORHINOCEROS: EffectSchema = {
  card_id: "OP03-069",
  card_name: "Minorhinoceros",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Impel Down" },
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

// ─── OP03-070 Monkey.D.Luffy — On Play DON!! −1 + trash cost: gain Rush ─────
// [On Play] DON!! −1 You may trash 1 Character card with a cost of 5 from your
// hand: This Character gains [Rush] during this turn.

export const OP03_070_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP03-070",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "CHARACTER", cost_exact: 5 },
        },
      ],
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
  ],
};

// ─── OP03-071 Rob Lucci — When Attacking DON!! −1: rest opponent Character ──
// [When Attacking] DON!! −1: Rest up to 1 of your opponent's Characters with a
// cost of 5 or less.

export const OP03_071_ROB_LUCCI_PURPLE: EffectSchema = {
  card_id: "OP03-071",
  card_name: "Rob Lucci",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP03-072 Gum-Gum Jet Gatling — Counter trash cost: +3000 power ────────
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP03_072_GUM_GUM_JET_GATLING: EffectSchema = {
  card_id: "OP03-072",
  card_name: "Gum-Gum Jet Gatling",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_buff",
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

// ─── OP03-073 Hull Dismantler Slash — Main DON!! −1: conditional KO ─────────
// [Main] DON!! −1: If your Leader has the {Water Seven} type, K.O. up to 1 of
// your opponent's Characters with a cost of 2 or less.
// [Trigger] Activate this card's [Main] effect.

export const OP03_073_HULL_DISMANTLER_SLASH: EffectSchema = {
  card_id: "OP03-073",
  card_name: "Hull Dismantler Slash",
  card_type: "Event",
  effects: [
    {
      id: "main_conditional_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Water Seven" },
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
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
    },
  ],
};

// ─── OP03-074 Top Knot — Main DON!! −2: return to deck bottom ───────────────
// [Main] DON!! −2: Place up to 1 of your opponent's Characters with a cost of
// 4 or less at the bottom of the owner's deck.
// [Trigger] Activate this card's [Main] effect.

export const OP03_074_TOP_KNOT: EffectSchema = {
  card_id: "OP03-074",
  card_name: "Top Knot",
  card_type: "Event",
  effects: [
    {
      id: "main_return_to_deck",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
    },
  ],
};

// ─── OP03-075 Galley-La Company (Stage) — Activate: Main rest: conditional DON
// [Activate: Main] You may rest this Stage: If your Leader is [Iceburg], add up
// to 1 DON!! card from your DON!! deck and rest it.

export const OP03_075_GALLEY_LA_COMPANY: EffectSchema = {
  card_id: "OP03-075",
  card_name: "Galley-La Company",
  card_type: "Stage",
  effects: [
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Iceburg" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — CP / Navy (OP03-076 to OP03-098)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP03-076 Rob Lucci (Leader) ─────────────────────────────────────────────
// [Your Turn] [Once Per Turn] You may trash 2 cards from your hand: When your
// opponent's Character is K.O.'d, set this Leader as active.

export const OP03_076_ROB_LUCCI: EffectSchema = {
  card_id: "OP03-076",
  card_name: "Rob Lucci",
  card_type: "Leader",
  effects: [
    {
      id: "opponent_ko_set_active",
      category: "auto",
      trigger: {
        event: "OPPONENT_CHARACTER_KO",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP03-077 Charlotte Linlin ───────────────────────────────────────────────
// [DON!! x2] [When Attacking] ② You may trash 1 card from your hand: If you
// have 1 or less Life cards, add up to 1 card from the top of your deck to
// the top of your Life cards.

export const OP03_077_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "OP03-077",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_add_life",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [
        { type: "DON_REST", amount: 2 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
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

// ─── OP03-078 Issho ──────────────────────────────────────────────────────────
// [DON!! x1] [Your Turn] Give all of your opponent's Characters −3 cost.
// [On Play] If your opponent has 6 or more cards in their hand, trash 2 cards
// from your opponent's hand.

export const OP03_078_ISSHO: EffectSchema = {
  card_id: "OP03-078",
  card_name: "Issho",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_cost_reduce_all",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -3 },
          duration: {
            type: "WHILE_CONDITION",
            condition: {
              all_of: [
                { type: "IS_MY_TURN", controller: "SELF" },
                {
                  type: "DON_FIELD_COUNT",
                  controller: "SELF",
                  operator: ">=",
                  value: 1,
                },
              ],
            },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          all_of: [
            { type: "IS_MY_TURN", controller: "SELF" },
            {
              type: "DON_FIELD_COUNT",
              controller: "SELF",
              operator: ">=",
              value: 1,
            },
          ],
        },
      },
    },
    {
      id: "on_play_opponent_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 2 },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP03-079 Vergo ──────────────────────────────────────────────────────────
// [DON!! x1] This Character cannot be K.O.'d in battle.

export const OP03_079_VERGO: EffectSchema = {
  card_id: "OP03-079",
  card_name: "Vergo",
  card_type: "Character",
  effects: [
    {
      id: "cannot_be_ko_in_battle",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: { type: "SELF" },
          scope: { cause: "BATTLE" },
        },
      ],
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
};

// ─── OP03-080 Kaku ───────────────────────────────────────────────────────────
// [On Play] You may place 2 cards with a type including "CP" from your trash
// at the bottom of your deck in any order: K.O. up to 1 of your opponent's
// Characters with a cost of 3 or less.

export const OP03_080_KAKU: EffectSchema = {
  card_id: "OP03-080",
  card_name: "Kaku",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_to_deck_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          filter: { traits_contains: ["CP"] },
          position: "BOTTOM",
        },
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
  ],
};

// ─── OP03-081 Kalifa ─────────────────────────────────────────────────────────
// [On Play] Draw 2 cards and trash 2 cards from your hand. Then, give up to 1
// of your opponent's Characters −2 cost during this turn.

export const OP03_081_KALIFA: EffectSchema = {
  card_id: "OP03-081",
  card_name: "Kalifa",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash_cost_reduce",
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

// ─── OP03-083 Corgy ──────────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck and trash up to 2 cards.
// Then, place the rest at the bottom of your deck in any order.

export const OP03_083_CORGY: EffectSchema = {
  card_id: "OP03-083",
  card_name: "Corgy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_look_trash_rest_bottom",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            pick_destination: "TRASH",
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP03-086 Spandam ────────────────────────────────────────────────────────
// [On Play] If your Leader's type includes "CP", look at 3 cards from the top
// of your deck; reveal up to 1 card with a type including "CP" other than
// [Spandam] and add it to your hand. Then, trash the rest.

export const OP03_086_SPANDAM: EffectSchema = {
  card_id: "OP03-086",
  card_name: "Spandam",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_cp",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "CP" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits_contains: ["CP"],
              exclude_name: "Spandam",
            },
            rest_destination: "TRASH",
          },
        },
      ],
    },
  ],
};

// ─── OP03-088 Fukurou ────────────────────────────────────────────────────────
// This Character cannot be K.O.'d by effects.
// [Blocker] (After your opponent declares an attack, you may rest this card to
// make it the new target of the attack.)

export const OP03_088_FUKUROU: EffectSchema = {
  card_id: "OP03-088",
  card_name: "Fukurou",
  card_type: "Character",
  effects: [
    {
      id: "cannot_be_ko_by_effects",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: { type: "SELF" },
          scope: { cause: "EFFECT" },
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

// ─── OP03-089 Brannew ────────────────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Navy}
// type card other than [Brannew] and add it to your hand. Then, trash the rest.

export const OP03_089_BRANNEW: EffectSchema = {
  card_id: "OP03-089",
  card_name: "Brannew",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_navy",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Navy"],
              exclude_name: "Brannew",
            },
            rest_destination: "TRASH",
          },
        },
      ],
    },
  ],
};

// ─── OP03-090 Blueno ─────────────────────────────────────────────────────────
// [DON!! x1] This Character gains [Blocker].
// (After your opponent declares an attack, you may rest this card to make it
// the new target of the attack.)
// [On K.O.] Play up to 1 Character card with a type including "CP" and a cost
// of 4 or less from your trash rested.

export const OP03_090_BLUENO: EffectSchema = {
  card_id: "OP03-090",
  card_name: "Blueno",
  card_type: "Character",
  effects: [
    {
      id: "don_blocker",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
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
    {
      id: "on_ko_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_contains: ["CP"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP03-091 Helmeppo ───────────────────────────────────────────────────────
// [On Play] Set the cost of up to 1 of your opponent's Characters with no base
// effect to 0 during this turn.

export const OP03_091_HELMEPPO: EffectSchema = {
  card_id: "OP03-091",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_cost_zero",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { no_base_effect: true },
          },
          params: { value: 0 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP03-092 Rob Lucci (Character) ──────────────────────────────────────────
// [On Play] You may place 2 cards with a type including "CP" from your trash
// at the bottom of your deck in any order: This Character gains [Rush] during
// this turn.

export const OP03_092_ROB_LUCCI: EffectSchema = {
  card_id: "OP03-092",
  card_name: "Rob Lucci",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_to_deck_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          filter: { traits_contains: ["CP"] },
          position: "BOTTOM",
        },
      ],
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
  ],
};

// ─── OP03-093 Wanze ──────────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: If your Leader's type
// includes "CP", K.O. up to 1 of your opponent's Characters with a cost of 1
// or less.

export const OP03_093_WANZE: EffectSchema = {
  card_id: "OP03-093",
  card_name: "Wanze",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_cost_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "CP" },
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
      flags: { optional: true },
    },
  ],
};

// ─── OP03-094 Air Door (Event) ───────────────────────────────────────────────
// [Main] If your Leader's type includes "CP", look at 5 cards from the top of
// your deck; play up to 1 Character card with a type including "CP" and a cost
// of 5 or less. Then, trash the rest.
// [Trigger] Play up to 1 black Character card with a cost of 3 or less from
// your trash.

export const OP03_094_AIR_DOOR: EffectSchema = {
  card_id: "OP03-094",
  card_name: "Air Door",
  card_type: "Event",
  effects: [
    {
      id: "main_search_and_play_cp",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "CP" },
      },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: {
              card_type: "CHARACTER",
              traits_contains: ["CP"],
              cost_max: 5,
            },
            rest_destination: "TRASH",
          },
        },
      ],
    },
    {
      id: "trigger_play_from_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              color: "BLACK",
              cost_max: 3,
            },
          },
          params: { source_zone: "TRASH" },
        },
      ],
    },
  ],
};

// ─── OP03-095 Soap Sheep (Event) ─────────────────────────────────────────────
// [Main] Give up to 2 of your opponent's Characters −2 cost during this turn.
// [Trigger] Your opponent trashes 1 card from their hand.

export const OP03_095_SOAP_SHEEP: EffectSchema = {
  card_id: "OP03-095",
  card_name: "Soap Sheep",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_reduce",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
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

// ─── OP03-096 Tempest Kick Sky Slicer (Event) ────────────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 0 or your
// opponent's Stages with a cost of 3 or less.
// [Trigger] Draw 2 cards.

export const OP03_096_TEMPEST_KICK: EffectSchema = {
  card_id: "OP03-096",
  card_name: "Tempest Kick Sky Slicer",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_choice",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
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
              [
                {
                  type: "KO",
                  target: {
                    type: "STAGE",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 3 },
                  },
                },
              ],
            ],
            labels: [
              "K.O. opponent's Character with cost 0",
              "K.O. opponent's Stage with cost 3 or less",
            ],
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP03-097 Six King Pistol (Event) ────────────────────────────────────────
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.
// [Trigger] Draw 1 card. Then, K.O. up to 1 of your opponent's Characters
// with a cost of 1 or less.

export const OP03_097_SIX_KING_PISTOL: EffectSchema = {
  card_id: "OP03-097",
  card_name: "Six King Pistol",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_buff",
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
    {
      id: "trigger_draw_then_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
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

// ─── OP03-098 Enies Lobby (Stage) ────────────────────────────────────────────
// [Activate: Main] You may rest this Stage: If your Leader's type includes
// "CP", give up to 1 of your opponent's Characters −2 cost during this turn.
// [Trigger] Play this card.

export const OP03_098_ENIES_LOBBY: EffectSchema = {
  card_id: "OP03-098",
  card_name: "Enies Lobby",
  card_type: "Stage",
  effects: [
    {
      id: "activate_cost_reduce",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "CP" },
      },
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
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Big Mom Pirates (OP03-099 to OP03-123)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP03_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP03-001": OP03_001_PORTGAS_D_ACE,
  "OP03-002": OP03_002_ADIO,
  "OP03-003": OP03_003_IZO,
  "OP03-004": OP03_004_CURIEL,
  "OP03-005": OP03_005_THATCH,
  "OP03-008": OP03_008_BUGGY,
  "OP03-009": OP03_009_HARUTA,
  "OP03-010": OP03_010_FOSSA,
  "OP03-011": OP03_011_BLAMENCO,
  "OP03-012": OP03_012_MARSHALL_D_TEACH,
  "OP03-013": OP03_013_MARCO,
  "OP03-014": OP03_014_MONKEY_D_GARP,
  "OP03-015": OP03_015_LIM,
  "OP03-016": OP03_016_FLAME_EMPEROR,
  "OP03-017": OP03_017_CROSS_FIRE,
  "OP03-018": OP03_018_FIRE_FIST,
  "OP03-019": OP03_019_FIERY_DOLL,
  "OP03-020": OP03_020_STRIKER,
  // Green
  "OP03-021": OP03_021_KURO,
  "OP03-022": OP03_022_ARLONG,
  "OP03-024": OP03_024_GIN,
  "OP03-025": OP03_025_KRIEG,
  "OP03-026": OP03_026_KUROOBI,
  "OP03-027": OP03_027_SHAM,
  "OP03-028": OP03_028_JANGO,
  "OP03-029": OP03_029_CHEW,
  "OP03-030": OP03_030_NAMI,
  "OP03-031": OP03_031_PEARL,
  "OP03-032": OP03_032_BUGGY,
  "OP03-034": OP03_034_BUCHI,
  "OP03-036": OP03_036_OUT_OF_THE_BAG,
  "OP03-037": OP03_037_TOOTH_ATTACK,
  "OP03-038": OP03_038_DEATHLY_POISON_GAS_BOMB_MH5,
  "OP03-039": OP03_039_ONE_TWO_JANGO,
  // Blue
  "OP03-040": OP03_040_NAMI,
  "OP03-041": OP03_041_USOPP,
  "OP03-042": OP03_042_USOPPS_PIRATE_CREW,
  "OP03-043": OP03_043_GAIMON,
  "OP03-044": OP03_044_KAYA,
  "OP03-045": OP03_045_CARNE,
  "OP03-047": OP03_047_ZEFF,
  "OP03-048": OP03_048_NOJIKO,
  "OP03-049": OP03_049_PATTY,
  "OP03-050": OP03_050_BOODLE,
  "OP03-051": OP03_051_BELLMERE,
  "OP03-053": OP03_053_YOSAKU_AND_JOHNNY,
  "OP03-054": OP03_054_USOPPS_RUBBER_BAND,
  "OP03-055": OP03_055_GUM_GUM_GIANT_GAVEL,
  "OP03-056": OP03_056_SANJIS_PILAF,
  "OP03-057": OP03_057_THREE_THOUSAND_WORLDS,
  // Purple
  "OP03-058": OP03_058_ICEBURG,
  "OP03-059": OP03_059_KAKU,
  "OP03-060": OP03_060_KALIFA,
  "OP03-062": OP03_062_KOKORO,
  "OP03-063": OP03_063_ZAMBAI,
  "OP03-064": OP03_064_TILESTONE,
  "OP03-065": OP03_065_CHIMNEY_AND_GONBE,
  "OP03-066": OP03_066_PAULIE,
  "OP03-067": OP03_067_PEEPLEY_LULU,
  "OP03-068": OP03_068_MINOZEBRA,
  "OP03-069": OP03_069_MINORHINOCEROS,
  "OP03-070": OP03_070_MONKEY_D_LUFFY,
  "OP03-071": OP03_071_ROB_LUCCI_PURPLE,
  "OP03-072": OP03_072_GUM_GUM_JET_GATLING,
  "OP03-073": OP03_073_HULL_DISMANTLER_SLASH,
  "OP03-074": OP03_074_TOP_KNOT,
  "OP03-075": OP03_075_GALLEY_LA_COMPANY,
  // Black
  "OP03-076": OP03_076_ROB_LUCCI,
  "OP03-077": OP03_077_CHARLOTTE_LINLIN,
  "OP03-078": OP03_078_ISSHO,
  "OP03-079": OP03_079_VERGO,
  "OP03-080": OP03_080_KAKU,
  "OP03-081": OP03_081_KALIFA,
  "OP03-083": OP03_083_CORGY,
  "OP03-086": OP03_086_SPANDAM,
  "OP03-088": OP03_088_FUKUROU,
  "OP03-089": OP03_089_BRANNEW,
  "OP03-090": OP03_090_BLUENO,
  "OP03-091": OP03_091_HELMEPPO,
  "OP03-092": OP03_092_ROB_LUCCI,
  "OP03-093": OP03_093_WANZE,
  "OP03-094": OP03_094_AIR_DOOR,
  "OP03-095": OP03_095_SOAP_SHEEP,
  "OP03-096": OP03_096_TEMPEST_KICK,
  "OP03-097": OP03_097_SIX_KING_PISTOL,
  "OP03-098": OP03_098_ENIES_LOBBY,
  // Yellow
  "OP03-099": OP03_099_CHARLOTTE_KATAKURI,
  "OP03-102": OP03_102_SANJI,
  "OP03-104": OP03_104_SHIRLEY,
  "OP03-105": OP03_105_CHARLOTTE_OVEN,
  "OP03-107": OP03_107_CHARLOTTE_GALETTE,
  "OP03-108": OP03_108_CHARLOTTE_CRACKER,
  "OP03-109": OP03_109_CHARLOTTE_CHIFFON,
  "OP03-110": OP03_110_CHARLOTTE_SMOOTHIE,
  "OP03-112": OP03_112_CHARLOTTE_PUDDING,
  "OP03-113": OP03_113_CHARLOTTE_PEROSPERO,
  "OP03-114": OP03_114_CHARLOTTE_LINLIN,
  "OP03-115": OP03_115_STREUSEN,
  "OP03-116": OP03_116_SHIRAHOSHI,
  "OP03-117": OP03_117_NAPOLEON,
  "OP03-118": OP03_118_IKOKU_SOVEREIGNTY,
  "OP03-119": OP03_119_BUZZ_CUT_MOCHI,
  "OP03-120": OP03_120_TROPICAL_TORMENT,
  "OP03-121": OP03_121_THUNDER_BOLT,
  "OP03-122": OP03_122_SOGEKING,
  "OP03-123": OP03_123_CHARLOTTE_KATAKURI_CHARACTER,
};
