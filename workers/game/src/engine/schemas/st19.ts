/**
 * ST19 Effect Schemas
 *
 * Black (Navy / Smoker): ST19-001 to ST19-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Navy / Smoker (ST19-001 to ST19-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST19-001 Smoker (Character) — On Play cannot attack prohibition
// [On Play] You may trash 1 black {Navy} type card from your hand: Up to 2 of your opponent's Characters with a cost of 4 or less cannot attack until the end of your opponent's next turn.

export const ST19_001_SMOKER: EffectSchema = {
  card_id: "ST19-001",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "on_play_attack_prohibition",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { color: "BLACK", traits: ["Navy"] } }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 4 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST19-002 Sengoku (Character) — On Play trash 2 draw 3
// [On Play] You may trash 2 black {Navy} type cards from your hand: If your Leader has the {Navy} type, draw 3 cards.

export const ST19_002_SENGOKU: EffectSchema = {
  card_id: "ST19-002",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2, filter: { color: "BLACK", traits: ["Navy"] } }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        { type: "DRAW", params: { amount: 3 } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST19-003 Tashigi (Character) — On Play conditional -4 cost + activate trash cost 0
// [On Play] If your Leader is [Smoker], give up to 1 of your opponent's Characters −4 cost during this turn.
// [Activate: Main] [Once Per Turn] If this Character was played on this turn, trash up to 1 of your opponent's Characters with a cost of 0.

export const ST19_003_TASHIGI: EffectSchema = {
  card_id: "ST19-003",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cost_reduction",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Smoker" },
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "activate_trash_cost_zero",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        type: "WAS_PLAYED_THIS_TURN",
      },
      actions: [
        {
          type: "TRASH_CARD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST19-004 Hina (Character) — DON!!x1 opponent turn +4 cost + activate give DON
// [DON!! x1] [Opponent's Turn] This Character gains +4 cost.
// [Activate: Main] [Once Per Turn] You may place 1 card from your trash at the bottom of your deck: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST19_004_HINA: EffectSchema = {
  card_id: "ST19-004",
  card_name: "Hina",
  card_type: "Character",
  effects: [
    {
      id: "don_opponent_turn_cost_buff",
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
          target: { type: "SELF" },
          params: { amount: 4 },
        },
      ],
    },
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "PLACE_FROM_TRASH_TO_DECK", amount: 1, position: "BOTTOM" }],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST19-005 Monkey.D.Garp (Character) — Blocker + activate -1 cost
// [Blocker]
// [Activate: Main] [Once Per Turn] You may place 1 card from your trash at the bottom of your deck: Give up to 1 of your opponent's Characters −1 cost during this turn.

export const ST19_005_MONKEY_D_GARP: EffectSchema = {
  card_id: "ST19-005",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "PLACE_FROM_TRASH_TO_DECK", amount: 1, position: "BOTTOM" }],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST19_SCHEMAS: Record<string, EffectSchema> = {
  "ST19-001": ST19_001_SMOKER,
  "ST19-002": ST19_002_SENGOKU,
  "ST19-003": ST19_003_TASHIGI,
  "ST19-004": ST19_004_HINA,
  "ST19-005": ST19_005_MONKEY_D_GARP,
};
