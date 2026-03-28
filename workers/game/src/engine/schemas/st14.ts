/**
 * ST14 Effect Schemas
 *
 * Black (Straw Hat Crew / Timeskip): ST14-001 to ST14-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Straw Hat Crew / Timeskip (ST14-001 to ST14-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST14-001 Monkey.D.Luffy (Leader) — DON!!x1 aura +1 cost + conditional power
// [DON!! x1] All of your Characters gain +1 cost. If you have a Character with a cost of 8 or more, this Leader gains +1000 power.

export const ST14_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST14-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "don_aura_cost_and_power",
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
      id: "don_conditional_power",
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
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── ST14-002 Usopp (Character) — DON!!x1 conditional KO
// [DON!! x1] [When Attacking] If you have a Character with a cost of 8 or more, K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const ST14_002_USOPP: EffectSchema = {
  card_id: "ST14-002",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_conditional_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 8 },
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
  ],
};

// ─── ST14-003 Sanji (Character) — On Play conditional KO
// [On Play] If you have a Character with a cost of 6 or more, K.O. up to 1 of your opponent's Characters with a cost of 5 or less.

export const ST14_003_SANJI: EffectSchema = {
  card_id: "ST14-003",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 6 },
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

// ─── ST14-004 Jinbe (Character) — activate +2 cost to Straw Hat
// [Activate: Main] [Once Per Turn] Up to 1 of your black {Straw Hat Crew} type Characters gains +2 cost until the end of your opponent's next turn.

export const ST14_004_JINBE: EffectSchema = {
  card_id: "ST14-004",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK", traits: ["Straw Hat Crew"] },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST14-006 Nami (Character) — Blocker + conditional draw
// [Blocker]
// [On Play] If you have 6 or less cards in your hand and a Character with a cost of 8 or more, draw 1 card.

export const ST14_006_NAMI: EffectSchema = {
  card_id: "ST14-006",
  card_name: "Nami",
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
      conditions: {
        all_of: [
          {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 6,
          },
          {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
          },
        ],
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST14-007 Nico Robin (Character) — On Play/When Attacking conditional -5 cost
// [On Play]/[When Attacking] If you have a Character with a cost of 8 or more, give up to 1 of your opponent's Characters −5 cost during this turn.

export const ST14_007_NICO_ROBIN: EffectSchema = {
  card_id: "ST14-007",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "compound_trigger_cost_reduction",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 8 },
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -5 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST14-008 Haredas (Character) — activate +2 cost + conditional draw/trash
// [Activate: Main] You may rest this Character: Up to 1 of your black {Straw Hat Crew} type Characters gains +2 cost until the end of your opponent's next turn. Then, if you have a Character with a cost of 8 or more, draw 1 card and trash 1 card from your hand.

export const ST14_008_HAREDAS: EffectSchema = {
  card_id: "ST14-008",
  card_name: "Haredas",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_buff_and_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK", traits: ["Straw Hat Crew"] },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
          },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST14-009 Franky (Character) — DON!!x1 opponent turn conditional protection + power
// [DON!! x1] [Opponent's Turn] If you have a Character with a cost of 6 or more, this Character cannot be K.O.'d by your opponent's effects and gains +2000 power.

export const ST14_009_FRANKY: EffectSchema = {
  card_id: "ST14-009",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "don_opponent_turn_protection",
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
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 6 },
          },
        ],
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: { type: "SELF" },
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
  ],
};

// ─── ST14-011 Heracles (Character) — activate +2 cost
// [Activate: Main] You may rest this Character: Up to 1 of your black {Straw Hat Crew} type Characters gains +2 cost until the end of your opponent's next turn.

export const ST14_011_HERACLES: EffectSchema = {
  card_id: "ST14-011",
  card_name: "Heracles",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK", traits: ["Straw Hat Crew"] },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST14-012 Monkey.D.Luffy (Character) — conditional Rush
// If you have a Character with a cost of 10 or more, this Character gains [Rush].

export const ST14_012_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST14-012",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 10 },
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

// ─── ST14-014 Gum-Gum Giant Rifle (Event) — Counter conditional +3000 + trigger retrieve
// [Counter] If you have a Character with a cost of 8 or more, up to 1 of your Leader or Character cards gains +3000 power during this battle.
// [Trigger] Add up to 1 of your Character cards with a cost of 2 or less from your trash to your hand.

export const ST14_014_GUM_GUM_GIANT_RIFLE: EffectSchema = {
  card_id: "ST14-014",
  card_name: "Gum-Gum Giant Rifle",
  card_type: "Event",
  effects: [
    {
      id: "counter_conditional_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 8 },
      },
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
    },
    {
      id: "trigger_retrieve_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── ST14-015 Gum-Gum Diable... (Event) — Main +3000 + conditional KO + trigger KO
// [Main] Up to 1 of your Leader or Character cards gains +3000 power during this turn. Then, if you have a Character with a cost of 8 or more, K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
// [Trigger] If you have a Character with a cost of 8 or more, K.O. up to 1 of your opponent's Characters with a cost of 5 or less.

export const ST14_015_GUM_GUM_DIABLE: EffectSchema = {
  card_id: "ST14-015",
  card_name: "Gum-Gum Diable Three-Swords Style Mouten Jet Six Hundred Pound Phoenix Cannon",
  card_type: "Event",
  effects: [
    {
      id: "main_power_and_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
          },
        },
      ],
    },
    {
      id: "trigger_conditional_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", cost_min: 8 },
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

// ─── ST14-016 I Have My Crew!! (Event) — Main draw + cost buff + trigger KO
// [Main] Draw 1 card. Then, up to 1 of your Characters gains +3 cost until the end of your opponent's next turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.

export const ST14_016_I_HAVE_MY_CREW: EffectSchema = {
  card_id: "ST14-016",
  card_name: "I Have My Crew!!",
  card_type: "Event",
  effects: [
    {
      id: "main_draw_and_cost_buff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 3 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
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
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── ST14-017 Thousand Sunny (Stage) — aura +1 cost + On Play conditional draw
// All of your black {Straw Hat Crew} type Characters gain +1 cost.
// [On Play] If your Leader has the {Straw Hat Crew} type, draw 1 card.

export const ST14_017_THOUSAND_SUNNY: EffectSchema = {
  card_id: "ST14-017",
  card_name: "Thousand Sunny",
  card_type: "Stage",
  effects: [
    {
      id: "aura_cost_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { color: "BLACK", traits: ["Straw Hat Crew"] },
          },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "on_play_conditional_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST14_SCHEMAS: Record<string, EffectSchema> = {
  "ST14-001": ST14_001_MONKEY_D_LUFFY,
  "ST14-002": ST14_002_USOPP,
  "ST14-003": ST14_003_SANJI,
  "ST14-004": ST14_004_JINBE,
  "ST14-006": ST14_006_NAMI,
  "ST14-007": ST14_007_NICO_ROBIN,
  "ST14-008": ST14_008_HAREDAS,
  "ST14-009": ST14_009_FRANKY,
  "ST14-011": ST14_011_HERACLES,
  "ST14-012": ST14_012_MONKEY_D_LUFFY,
  "ST14-014": ST14_014_GUM_GUM_GIANT_RIFLE,
  "ST14-015": ST14_015_GUM_GUM_DIABLE,
  "ST14-016": ST14_016_I_HAVE_MY_CREW,
  "ST14-017": ST14_017_THOUSAND_SUNNY,
};
