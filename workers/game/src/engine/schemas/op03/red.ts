/**
 * OP03 Red — Ace / Whitebeard Pirates (OP03-001 to OP03-020)
 */

import type { EffectSchema } from "../../effect-types.js";

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
          params: { amount: 1 },
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
            count: { up_to: 1 },
            filter: { power_max: 5000 },
          },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 4000 },
          },
          chain: "AND",
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

export const OP03_RED_SCHEMAS: EffectSchema[] = [
  OP03_001_PORTGAS_D_ACE,
  OP03_002_ADIO,
  OP03_003_IZO,
  OP03_004_CURIEL,
  OP03_005_THATCH,
  OP03_008_BUGGY,
  OP03_009_HARUTA,
  OP03_010_FOSSA,
  OP03_011_BLAMENCO,
  OP03_012_MARSHALL_D_TEACH,
  OP03_013_MARCO,
  OP03_014_MONKEY_D_GARP,
  OP03_015_LIM,
  OP03_016_FLAME_EMPEROR,
  OP03_017_CROSS_FIRE,
  OP03_018_FIRE_FIST,
  OP03_019_FIERY_DOLL,
  OP03_020_STRIKER,
];
