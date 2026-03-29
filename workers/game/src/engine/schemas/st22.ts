/**
 * ST22 Effect Schemas
 *
 * Blue (Whitebeard Pirates): ST22-001 to ST22-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Whitebeard Pirates (ST22-001 to ST22-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST22-001 Ace & Newgate (Leader) — reveal from hand to draw + deck top
// [Activate: Main] [Once Per Turn] You may reveal 1 card with a type including "Whitebeard Pirates" from your hand: Draw 1 card and place the revealed card at the top of your deck.

export const ST22_001_ACE_AND_NEWGATE: EffectSchema = {
  card_id: "ST22-001",
  card_name: "Ace & Newgate",
  card_type: "Leader",
  effects: [
    {
      id: "activate_reveal_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 1,
          filter: { traits_contains: ["Whitebeard Pirates"] },
        },
      ],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 1, position: "TOP" },
          chain: "AND",
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST22-002 Izo (Character) — search deck + on opponent attack trash self to cycle
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 card with a type including "Whitebeard Pirates" other than [Izo] and add it to your hand. Then, place the rest at the bottom of your deck in any order.
// [On Your Opponent's Attack] You may trash this Character: Draw 1 card and place 1 card from your hand at the bottom of your deck.

export const ST22_002_IZO: EffectSchema = {
  card_id: "ST22-002",
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
    {
      id: "on_opponent_attack_cycle",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 1, position: "BOTTOM" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST22-003 Edward.Newgate (Character) — Double Attack + On Play reveal conditional draw
// [Double Attack] (This card deals 2 damage.)
// [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards.

export const ST22_003_EDWARD_NEWGATE: EffectSchema = {
  card_id: "ST22-003",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "double_attack",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
    {
      id: "on_play_reveal_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
        },
      ],
    },
  ],
};

// ─── ST22-005 Kouzuki Oden (Character) — replacement removal protection + activate set active
// If this Character would be removed from the field by your opponent's effect, you may trash 2 cards from your hand instead.
// [Activate: Main] [Once Per Turn] You may rest 3 of your DON!! cards and return 1 of your Characters other than this Character to the owner's hand: Set this Character as active.

export const ST22_005_KOUZUKI_ODEN: EffectSchema = {
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
        { type: "TRASH_FROM_HAND", params: { amount: 2 } },
      ],
      flags: { optional: true },
    },
    {
      id: "activate_set_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 3 },
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          filter: { exclude_self: true },
        },
      ],
      actions: [
        { type: "SET_ACTIVE", target: { type: "SELF" } },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST22-006 Jozu (Character) — On Play reveal conditional draw + trash
// [On Play] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.

export const ST22_006_JOZU: EffectSchema = {
  card_id: "ST22-006",
  card_name: "Jozu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
            filter: { traits_contains: ["Whitebeard Pirates"] },
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

// ─── ST22-007 Squard (Character) — Activate reveal conditional give DON
// [Activate: Main] [Once Per Turn] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST22_007_SQUARD: EffectSchema = {
  card_id: "ST22-007",
  card_name: "Squard",
  card_type: "Character",
  effects: [
    {
      id: "activate_reveal_give_don",
      category: "activate",
      flags: { once_per_turn: true },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
        },
      ],
    },
  ],
};

// ─── ST22-009 Vista (Character) — Blocker
// [Blocker]

export const ST22_009_VISTA: EffectSchema = {
  card_id: "ST22-009",
  card_name: "Vista",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST22-011 Whitey Bay (Character) — your turn on play reveal cost to power boost leader
// [Your Turn] [On Play] You may reveal 2 cards with a type including "Whitebeard Pirates" from your hand: Up to 1 of your Leader with a type including "Whitebeard Pirates" gains +2000 power during this turn.

export const ST22_011_WHITEY_BAY: EffectSchema = {
  card_id: "ST22-011",
  card_name: "Whitey Bay",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_power_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { traits_contains: ["Whitebeard Pirates"] },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST22-012 Marco (Character) — KO protection replacement + When Attacking reveal conditional power
// [Once Per Turn] If this Character would be K.O.'d by your opponent's effect, you may trash 1 card from your hand instead.
// [When Attacking] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", this Character gains +1000 power until the end of your opponent's next turn.

export const ST22_012_MARCO: EffectSchema = {
  card_id: "ST22-012",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "when_attacking_reveal_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
        },
      ],
    },
  ],
};

// ─── ST22-015 I Am Whitebeard!! (Event) — play Edward.Newgate + life to hand + power boost
// [Main] If your Leader's type includes "Whitebeard Pirates", play up to 1 [Edward.Newgate] from your hand. Then, you may add 1 card from the top or bottom of your Life cards to your hand. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.

export const ST22_015_I_AM_WHITEBEARD: EffectSchema = {
  card_id: "ST22-015",
  card_name: "I Am Whitebeard!!",
  card_type: "Event",
  effects: [
    {
      id: "main_effect",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Edward.Newgate" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP_OR_BOTTOM" },
          chain: "THEN",
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "YOUR_LEADER",
          },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── ST22-016 Take That Back!! (Event) — Counter reveal conditional power + Trigger draw
// [Counter] Reveal 1 card from the top of your deck. If that card's type includes "Whitebeard Pirates", up to 1 of your Leader or Character cards gains +4000 power during this battle.
// [Trigger] Draw 1 card.

export const ST22_016_TAKE_THAT_BACK: EffectSchema = {
  card_id: "ST22-016",
  card_name: "Take That Back!! Take Back What You Said!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_reveal_power",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Whitebeard Pirates"] },
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

// ─── ST22-017 Fire Fist (Event) — reveal cost to draw + return to deck + trigger return to hand
// [Main] You may reveal 2 cards with a type including "Whitebeard Pirates" from your hand: Draw 1 card. Then, place up to 1 Character with a cost of 5 or less at the bottom of the owner's deck.
// [Trigger] Return up to 1 Character with a cost of 3 or less to the owner's hand.

export const ST22_017_FIRE_FIST: EffectSchema = {
  card_id: "ST22-017",
  card_name: "Fire Fist",
  card_type: "Event",
  effects: [
    {
      id: "main_effect",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { traits_contains: ["Whitebeard Pirates"] },
        },
      ],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_return",
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

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST22_SCHEMAS: Record<string, EffectSchema> = {
  "ST22-001": ST22_001_ACE_AND_NEWGATE,
  "ST22-002": ST22_002_IZO,
  "ST22-003": ST22_003_EDWARD_NEWGATE,
  "ST22-005": ST22_005_KOUZUKI_ODEN,
  "ST22-006": ST22_006_JOZU,
  "ST22-007": ST22_007_SQUARD,
  "ST22-009": ST22_009_VISTA,
  "ST22-011": ST22_011_WHITEY_BAY,
  "ST22-012": ST22_012_MARCO,
  "ST22-015": ST22_015_I_AM_WHITEBEARD,
  "ST22-016": ST22_016_TAKE_THAT_BACK,
  "ST22-017": ST22_017_FIRE_FIST,
};
