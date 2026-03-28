/**
 * ST25 Effect Schemas
 *
 * Blue (Cross Guild): ST25-001 to ST25-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Cross Guild (ST25-001 to ST25-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST25-001 Alvida (Character) — conditional cost modifier + on play draw/trash
// If you have 2 or more Characters with a base cost of 5 or more, this Character gains +1 cost.
// [On Play] If your Leader is [Buggy], draw 3 cards and trash 2 cards from your hand.

export const ST25_001_ALVIDA: EffectSchema = {
  card_id: "ST25-001",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      id: "conditional_cost_up",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_cost_min: 5 },
        count: { operator: ">=", value: 2 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Buggy" },
      },
      actions: [
        { type: "DRAW", params: { amount: 3 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST25-002 Cabaji (Character) — conditional blocker + cost + opponent turn power
// If you have 2 or more Characters with a base cost of 5 or more, this Character gains [Blocker] and +1 cost.
// [Opponent's Turn] This Character gains +5000 power.

export const ST25_002_CABAJI: EffectSchema = {
  card_id: "ST25-002",
  card_name: "Cabaji",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker_cost",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_cost_min: 5 },
        count: { operator: ">=", value: 2 },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "opponent_turn_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 5000 },
        },
      ],
    },
  ],
};

// ─── ST25-003 Crocodile & Mihawk (Character) — on play draw/trash/play + replacement protection
// [On Play] Draw 2 cards and trash 1 card from your hand. Then, play up to 1 {Cross Guild} type Character card with a cost of 4 or less from your hand.
// [Once Per Turn] If your {Cross Guild} type Character would be removed from the field by your opponent's effect, you may trash 1 card from your hand instead.

export const ST25_003_CROCODILE_AND_MIHAWK: EffectSchema = {
  card_id: "ST25-003",
  card_name: "Crocodile & Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Cross Guild"], cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "removal_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Cross Guild"],
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST25-004 Buggy (Character) — activate trash hand + self to play Cross Guild
// [Activate: Main] You may trash 1 card from your hand and trash this Character: If your Leader is [Buggy], play up to 1 {Cross Guild} type Character card with a cost of 6 or less from your hand.

export const ST25_004_BUGGY: EffectSchema = {
  card_id: "ST25-004",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_cross_guild",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Buggy" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Cross Guild"], cost_max: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST25-005 Mohji (Character) — conditional blocker + cost + on KO conditional draw
// If you have 2 or more Characters with a base cost of 5 or more, this Character gains [Blocker] and +1 cost.
// [On K.O.] If your Leader is [Buggy] and you have 3 or less cards in your hand, draw 1 card.

export const ST25_005_MOHJI: EffectSchema = {
  card_id: "ST25-005",
  card_name: "Mohji",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker_cost",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_cost_min: 5 },
        count: { operator: ">=", value: 2 },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Buggy" },
          },
          {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 3,
          },
        ],
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

export const ST25_SCHEMAS: Record<string, EffectSchema> = {
  "ST25-001": ST25_001_ALVIDA,
  "ST25-002": ST25_002_CABAJI,
  "ST25-003": ST25_003_CROCODILE_AND_MIHAWK,
  "ST25-004": ST25_004_BUGGY,
  "ST25-005": ST25_005_MOHJI,
};
