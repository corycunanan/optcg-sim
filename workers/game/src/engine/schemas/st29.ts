/**
 * ST29 Effect Schemas
 *
 * Yellow (Straw Hat Crew — Egghead): ST29-001 to ST29-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Straw Hat Crew Egghead (ST29-001 to ST29-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST29-001 Monkey.D.Luffy (Leader) — when attacking conditional draw/trash
// [When Attacking] If you have 2 or less Life cards, draw 1 card and trash 1 card from your hand.

export const ST29_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST29-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST29-002 Usopp (Character) — on play/attack rest opponent character by life count
// [On Play]/[When Attacking] Rest up to 1 of your opponent's Characters with a cost equal to or less than the number of your opponent's Life cards.

export const ST29_002_USOPP: EffectSchema = {
  card_id: "ST29-002",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_rest",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: {
                type: "GAME_STATE",
                source: "OPPONENT_LIFE_COUNT",
              },
            },
          },
        },
      ],
    },
  ],
};

// ─── ST29-003 Kaku (Character) — comparative life permanent power + trigger KO
// If the number of your Life cards is equal to or less than the number of your opponent's Life cards, this Character gains +1000 power.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.

export const ST29_003_KAKU: EffectSchema = {
  card_id: "ST29-003",
  card_name: "Kaku",
  card_type: "Character",
  effects: [
    {
      id: "comparative_life_power",
      category: "permanent",
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<=",
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
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

// ─── ST29-004 Sanji (Character) — on play search + trigger trash to play self
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const ST29_004_SANJI: EffectSchema = {
  card_id: "ST29-004",
  card_name: "Sanji",
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
            filter: { traits: ["Straw Hat Crew"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        { type: "PLAY_SELF" },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST29-007 Tony Tony.Chopper (Character) — on KO life to hand then hand to life + trigger power boost
// [On K.O.] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 card from your hand to the top of your Life cards.
// [Trigger] Up to 1 of your [Monkey.D.Luffy] cards gains +2000 power during this turn.

export const ST29_007_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "ST29-007",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_life_swap",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_power_boost",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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
    },
  ],
};

// ─── ST29-008 Nami (Character) — replacement KO protection for Egghead + trigger conditional play self
// If your {Egghead} type Character would be K.O.'d by your opponent's effect, you may turn 1 card from the top of your Life cards face-up instead.
// [Trigger] If your Leader is [Monkey.D.Luffy], play this card.

export const ST29_008_NAMI: EffectSchema = {
  card_id: "ST29-008",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Egghead"],
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        { type: "TURN_LIFE_FACE_UP", params: { amount: 1, position: "TOP" } },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Monkey.D.Luffy" },
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── ST29-009 Nico Robin (Character) — Blocker + trigger conditional play self
// [Blocker]
// [Trigger] If your Leader is [Monkey.D.Luffy], play this card.

export const ST29_009_NICO_ROBIN: EffectSchema = {
  card_id: "ST29-009",
  card_name: "Nico Robin",
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
        property: { name: "Monkey.D.Luffy" },
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── ST29-011 Brook (Character) — Blocker
// [Blocker]

export const ST29_011_BROOK: EffectSchema = {
  card_id: "ST29-011",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST29-012 Monkey.D.Luffy (Character) — activate give DON to Luffy + trigger play self
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your [Monkey.D.Luffy] cards.
// [Trigger] Play this card.

export const ST29_012_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST29-012",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
      flags: { once_per_turn: true },
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

// ─── ST29-014 Roronoa Zoro (Character) — Rush:Character + activate trash trigger card to draw/give DON
// [Rush: Character]
// [Activate: Main] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Draw 1 card and give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST29_014_RORONOA_ZORO: EffectSchema = {
  card_id: "ST29-014",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "rush_character",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "activate_draw_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } },
      ],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
          chain: "AND",
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST29-015 Raw Heat Strike (Event) — counter power boost + conditional debuff + trigger draw
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 1 or less Life cards, give up to 1 of your opponent's Leader or Character cards −2000 power during this turn.
// [Trigger] Draw 1 card.

export const ST29_015_RAW_HEAT_STRIKE: EffectSchema = {
  card_id: "ST29-015",
  card_name: "Raw Heat Strike",
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
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 1,
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

// ─── ST29-016 Kizaru!! (Event) — main grant unblockable + counter power boost
// [Main] Your [Monkey.D.Luffy] Leader gains [Unblockable] during this turn.
// [Counter] Your Leader gains +3000 power during this battle.

export const ST29_016_KIZARU: EffectSchema = {
  card_id: "ST29-016",
  card_name: "Kizaru!! Compared to Two Years Ago We're a Hundred Times Stronger Now!!",
  card_type: "Event",
  effects: [
    {
      id: "main_unblockable",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Monkey.D.Luffy" },
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
      id: "counter_power",
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

// ─── ST29-017 Iai Death Lion Song (Event) — counter power boost + conditional KO + trigger draw/trash
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, if you have 2 or less Life cards, K.O. up to 1 of your opponent's Characters with a cost of 3 or less.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const ST29_017_IAI_DEATH_LION_SONG: EffectSchema = {
  card_id: "ST29-017",
  card_name: "Iai Death Lion Song",
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST29_SCHEMAS: Record<string, EffectSchema> = {
  "ST29-001": ST29_001_MONKEY_D_LUFFY,
  "ST29-002": ST29_002_USOPP,
  "ST29-003": ST29_003_KAKU,
  "ST29-004": ST29_004_SANJI,
  "ST29-007": ST29_007_TONY_TONY_CHOPPER,
  "ST29-008": ST29_008_NAMI,
  "ST29-009": ST29_009_NICO_ROBIN,
  "ST29-011": ST29_011_BROOK,
  "ST29-012": ST29_012_MONKEY_D_LUFFY,
  "ST29-014": ST29_014_RORONOA_ZORO,
  "ST29-015": ST29_015_RAW_HEAT_STRIKE,
  "ST29-016": ST29_016_KIZARU,
  "ST29-017": ST29_017_IAI_DEATH_LION_SONG,
};
