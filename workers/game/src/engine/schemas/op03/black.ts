/**
 * OP03 Black — CP / Navy (OP03-076 to OP03-098)
 */

import type { EffectSchema } from "../../effect-types.js";

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
          type: "DON_FIELD_COUNT",
          controller: "SELF",
          operator: ">=",
          value: 1,
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

export const OP03_BLACK_SCHEMAS: EffectSchema[] = [
  OP03_076_ROB_LUCCI,
  OP03_077_CHARLOTTE_LINLIN,
  OP03_078_ISSHO,
  OP03_079_VERGO,
  OP03_080_KAKU,
  OP03_081_KALIFA,
  OP03_083_CORGY,
  OP03_086_SPANDAM,
  OP03_088_FUKUROU,
  OP03_089_BRANNEW,
  OP03_090_BLUENO,
  OP03_091_HELMEPPO,
  OP03_092_ROB_LUCCI,
  OP03_093_WANZE,
  OP03_094_AIR_DOOR,
  OP03_095_SOAP_SHEEP,
  OP03_096_TEMPEST_KICK,
  OP03_097_SIX_KING_PISTOL,
  OP03_098_ENIES_LOBBY,
];
