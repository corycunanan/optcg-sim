/**
 * M4 Effect Schema — Nami Test Deck Encodings
 *
 * All 19 unique cards in the OP11-041 Nami test deck.
 * Leader: OP11-041 Nami
 *
 * Cards span 11 sets: OP03, OP04, OP06, OP07, OP08, OP10, OP11, OP12, EB01, ST03, ST17, ST22
 *
 * Cards already authored elsewhere:
 *   OP06-047 Charlotte Pudding → ace-deck.ts
 *   PRB02-008 Marco → ace-deck.ts
 *   OP08-047 Jozu → ace-deck.ts
 *   OP04-056 Gum-Gum Red Roc → ace-deck.ts
 *
 * 15 new schemas below.
 */

import type { EffectSchema } from "../effect-types.js";

// ─── Leader: OP11-041 Nami ───────────────────────────────────────────────────
// [Your Turn] [Once Per Turn] This effect can be activated when a card is
//   removed from your or your opponent's Life cards. If you have 7 or less
//   cards in your hand, draw 1 card.
// [DON!! x1] [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card
//   from your hand: This Leader gains +2000 power during this turn.

export const OP11_041_NAMI: EffectSchema = {
  card_id: "OP11-041",
  card_name: "Nami",
  card_type: "Leader",
  effects: [
    {
      id: "on_life_removed_draw",
      category: "auto",
      trigger: {
        event: "LIFE_CARD_REMOVED",
        filter: { controller: "EITHER" },
        turn_restriction: "YOUR_TURN",
      },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 7,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
      flags: { once_per_turn: true },
    },
    {
      id: "on_opp_attack_power_boost",
      category: "auto",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
        don_requirement: 1,
      },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP07-046 Sengoku ────────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
//   {The Seven Warlords of the Sea} type card and add it to your hand.
//   Then, place the rest at the bottom of your deck in any order.

export const OP07_046_SENGOKU: EffectSchema = {
  card_id: "OP07-046",
  card_name: "Sengoku",
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
            filter: { traits: ["The Seven Warlords of the Sea"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP06-106 Kouzuki Hiyori ────────────────────────────────────────────────
// [On Play] You may add 1 card from the top or bottom of your Life cards
//   to your hand: Add up to 1 card from your hand to the top of your
//   Life cards.

export const OP06_106_HIYORI: EffectSchema = {
  card_id: "OP06-106",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_swap",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: { type: "CARD_IN_HAND", controller: "SELF", count: { up_to: 1 } },
          params: { position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP11-106 Zeus ───────────────────────────────────────────────────────────
// [On Play] You may add 1 card from the top or bottom of your Life cards
//   to your hand: K.O. up to 1 of your opponent's Characters with a cost
//   of 5 or less.

export const OP11_106_ZEUS: EffectSchema = {
  card_id: "OP11-106",
  card_name: "Zeus",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
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
  ],
};

// ─── ST17-005 Marshall.D.Teach ───────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may place 1 card from your hand at
//   the top of your deck: Give up to 2 rested DON!! cards to your Leader
//   or 1 of your Characters.

export const ST17_005_TEACH: EffectSchema = {
  card_id: "ST17-005",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "activate_don_give",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "PLACE_HAND_TO_DECK", amount: 1, position: "TOP" },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2, source: "RESTED" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP03-048 Nojiko ─────────────────────────────────────────────────────────
// [On Play] If your Leader is [Nami], return up to 1 of your opponent's
//   Characters with a cost of 5 or less to the owner's hand.

export const OP03_048_NOJIKO: EffectSchema = {
  card_id: "OP03-048",
  card_name: "Nojiko",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce",
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

// ─── EB01-023 Edward Weevil ──────────────────────────────────────────────────
// [On Play] Draw 1 card.

export const EB01_023_WEEVIL: EffectSchema = {
  card_id: "EB01-023",
  card_name: "Edward Weevil",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP06-104 Kikunojo ───────────────────────────────────────────────────────
// [On K.O.] If your opponent has 3 or less Life cards, add up to 1 card from
//   the top of your deck to the top of your Life cards.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_104_KIKUNOJO: EffectSchema = {
  card_id: "OP06-104",
  card_name: "Kikunojo",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_add_life",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "SELF" },
          params: { source_zone: "TRIGGER", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP12-112 Baby 5 ─────────────────────────────────────────────────────────
// Counter +2000 (vanilla body)
// [Trigger] If your leader is multicolored, draw 2 cards.

export const OP12_112_BABY5: EffectSchema = {
  card_id: "OP12-112",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "trigger_multicolor_draw",
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

// ─── OP12-119 Bartholomew Kuma ───────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Add up to 1 card from the
//   top of your deck to the top of your Life cards. Then, this Character
//   gains +2 cost until the end of your opponent's next End Phase.
// [Opponent's Turn] [On K.O.] Add up to 1 card from the top of your deck
//   to the top of your Life cards.

export const OP12_119_KUMA: EffectSchema = {
  card_id: "OP12-119",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_and_cost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_ko_add_life",
      category: "auto",
      trigger: {
        keyword: "ON_KO",
        turn_restriction: "OPPONENT_TURN",
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP07-051 Boa Hancock ────────────────────────────────────────────────────
// [On Play] Up to 1 of your opponent's Characters other than [Monkey.D.Luffy]
//   cannot attack until the end of your opponent's next turn. Then, place
//   up to 1 Character with a cost of 1 or less at the bottom of the owner's deck.

export const OP07_051_HANCOCK: EffectSchema = {
  card_id: "OP07-051",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "on_play_prohibit_and_remove",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { exclude_name: "Monkey.D.Luffy" },
          },
          params: { prohibition: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── ST03-009 Donquixote Doflamingo ──────────────────────────────────────────
// [On Play] Return up to 1 Character with a cost of 7 or less to the owner's hand.

export const ST03_009_DOFLAMINGO: EffectSchema = {
  card_id: "ST03-009",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── ST22-005 Kouzuki Oden ───────────────────────────────────────────────────
// If this Character would be removed from the field by your opponent's effect,
//   you may trash 2 cards from your hand instead.
// [Activate: Main] [Once Per Turn] You may rest 3 of your DON!! cards and
//   return 1 of your Characters other than this Character to the owner's hand:
//   Set this Character as active.

export const ST22_005_ODEN: EffectSchema = {
  card_id: "ST22-005",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "removal_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "activate_active_self",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 3 },
        { type: "RETURN_OWN_CHARACTER_TO_HAND" },
      ],
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

// ─── OP10-112 Eustass"Captain"Kid ────────────────────────────────────────────
// [On Play] You may rest this Character: Trash up to 1 card from the top of
//   your opponent's Life cards.
// [End of Your Turn] If your opponent has 2 or less Life cards, draw 1 card
//   and trash 1 card from your hand.

export const OP10_112_KID: EffectSchema = {
  card_id: "OP10-112",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "end_of_turn_draw_trash",
      category: "auto",
      trigger: {
        event: "END_OF_YOUR_TURN",
      },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 2,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP07-056 Slave Arrow ────────────────────────────────────────────────────
// [Counter] You may return 1 of your Characters with a cost of 2 or more
//   to the owner's hand: Up to 1 of your Leader or Character cards gains
//   +4000 power during this battle.
// [Trigger] Draw 2 cards and place 2 cards from your hand at the bottom
//   of your deck in any order.

export const OP07_056_SLAVE_ARROW: EffectSchema = {
  card_id: "OP07-056",
  card_name: "Slave Arrow",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          filter: { cost_min: 2 },
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_draw_replace",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const NAMI_DECK_SCHEMAS: Record<string, EffectSchema> = {
  "OP11-041": OP11_041_NAMI,
  "OP07-046": OP07_046_SENGOKU,
  "OP06-106": OP06_106_HIYORI,
  "OP11-106": OP11_106_ZEUS,
  "ST17-005": ST17_005_TEACH,
  "OP03-048": OP03_048_NOJIKO,
  "EB01-023": EB01_023_WEEVIL,
  "OP06-104": OP06_104_KIKUNOJO,
  "OP12-112": OP12_112_BABY5,
  "OP12-119": OP12_119_KUMA,
  "OP07-051": OP07_051_HANCOCK,
  "ST03-009": ST03_009_DOFLAMINGO,
  "ST22-005": ST22_005_ODEN,
  "OP10-112": OP10_112_KID,
  "OP07-056": OP07_056_SLAVE_ARROW,
  // OP06-047 Charlotte Pudding → ace-deck.ts
  // PRB02-008 Marco → ace-deck.ts
  // OP08-047 Jozu → ace-deck.ts
  // OP04-056 Gum-Gum Red Roc → ace-deck.ts
};
