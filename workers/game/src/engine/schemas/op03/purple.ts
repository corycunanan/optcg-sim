/**
 * OP03 Purple — Galley-La Company / Water Seven / Impel Down (OP03-058 to OP03-075)
 */

import type { EffectSchema } from "../../effect-types.js";

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
      trigger: { keyword: "COUNTER" },
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
      category: "activate",
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
      category: "activate",
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

export const OP03_PURPLE_SCHEMAS: EffectSchema[] = [
  OP03_058_ICEBURG,
  OP03_059_KAKU,
  OP03_060_KALIFA,
  OP03_062_KOKORO,
  OP03_063_ZAMBAI,
  OP03_064_TILESTONE,
  OP03_065_CHIMNEY_AND_GONBE,
  OP03_066_PAULIE,
  OP03_067_PEEPLEY_LULU,
  OP03_068_MINOZEBRA,
  OP03_069_MINORHINOCEROS,
  OP03_070_MONKEY_D_LUFFY,
  OP03_071_ROB_LUCCI_PURPLE,
  OP03_072_GUM_GUM_JET_GATLING,
  OP03_073_HULL_DISMANTLER_SLASH,
  OP03_074_TOP_KNOT,
  OP03_075_GALLEY_LA_COMPANY,
];
