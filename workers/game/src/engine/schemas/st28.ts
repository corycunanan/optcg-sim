/**
 * ST28 Effect Schemas
 *
 * Yellow (Land of Wano): ST28-001 to ST28-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Land of Wano (ST28-001 to ST28-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST28-001 Ashura Doji (Character) — on play conditional KO
// [On Play] If your Leader has the {Land of Wano} type and your opponent has 3 or more Life cards, K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.

export const ST28_001_ASHURA_DOJI: EffectSchema = {
  card_id: "ST28-001",
  card_name: "Ashura Doji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Land of Wano" },
          },
          {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 3,
          },
        ],
      },
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
    },
  ],
};

// ─── ST28-002 Izo (Character) — DON!! x2 Blocker + on play grant Banish to leader
// [DON!! x2] This Character gains [Blocker].
// [On Play] Your {Land of Wano} type Leader gains [Banish] during this turn.

export const ST28_002_IZO: EffectSchema = {
  card_id: "ST28-002",
  card_name: "Izo",
  card_type: "Character",
  effects: [
    {
      id: "don_blocker",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
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
    {
      id: "on_play_grant_banish",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "YOUR_LEADER" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST28-004 Kouzuki Momonosuke (Character) — your turn leader power aura + activate rush/power
// [Your Turn] If you have 2 or less Life cards, your Leader gains +1000 power.
// [Activate: Main] [Once Per Turn] You may return 2 total of your currently given DON!! cards to your cost area rested: This Character gains [Rush] and +1000 power during this turn.

export const ST28_004_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "ST28-004",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_leader_power",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
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
      id: "activate_rush_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "RETURN_ATTACHED_DON_TO_COST", amount: 2 },
      ],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST28-005 Yamato (Character) — DON!! x2 your turn power + on play search
// [DON!! x2] [Your Turn] This Character gains +3000 power.
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Land of Wano} type card with a cost of 2 or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const ST28_005_YAMATO: EffectSchema = {
  card_id: "ST28-005",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "don_your_turn_power",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
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
            filter: { traits: ["Land of Wano"], cost_min: 2 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST28_SCHEMAS: Record<string, EffectSchema> = {
  "ST28-001": ST28_001_ASHURA_DOJI,
  "ST28-002": ST28_002_IZO,
  "ST28-004": ST28_004_KOUZUKI_MOMONOSUKE,
  "ST28-005": ST28_005_YAMATO,
};
