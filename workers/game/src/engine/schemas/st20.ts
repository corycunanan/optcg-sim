/**
 * ST20 Effect Schemas
 *
 * Yellow (Big Mom Pirates): ST20-001 to ST20-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Big Mom Pirates (ST20-001 to ST20-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ST20-001 Charlotte Katakuri — deferred: TURN_LIFE_FACE_UP not a valid CostType
// [Blocker]
// [Activate: Main] [Once Per Turn] You may turn 1 card from the top of your Life cards face-up: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

// ─── ST20-002 Charlotte Cracker (Character) — replacement KO by effect + trigger play self
// [Once Per Turn] If this Character would be K.O.'d by an effect, you may trash 1 card from the top of your Life cards instead.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const ST20_002_CHARLOTTE_CRACKER: EffectSchema = {
  card_id: "ST20-002",
  card_name: "Charlotte Cracker",
  card_type: "Character",
  effects: [
    {
      id: "replacement_ko_by_effect",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        cause_filter: { by: "ANY_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── ST20-004 Charlotte Pudding (Character) — On Play life cost set active + trigger rest
// [On Play] You may add 1 card from the top of your Life cards to your hand: Set up to 1 of your {Big Mom Pirates} type Characters with a cost of 3 or less as active.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 3 or less.

export const ST20_004_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "ST20-004",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_cost_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP" }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Big Mom Pirates"], cost_max: 3 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_rest_opponent",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_REST",
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

// ─── ST20-005 Charlotte Linlin (Character) — On Play trash cost opponent choice
// [On Play] You may trash 1 card from your hand: Your opponent chooses one:
// • Your opponent trashes 2 cards from their hand.
// • Trash 1 card from the top of your opponent's Life cards.

export const ST20_005_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "ST20-005",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_choice",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            options: [
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: {
                      type: "TRASH_CARD",
                      target: {
                        type: "CARD_IN_HAND",
                        controller: "OPPONENT",
                        count: { exact: 2 },
                      },
                    },
                  },
                },
              ],
              [
                {
                  type: "TRASH_FROM_LIFE",
                  params: { amount: 1, position: "TOP", controller: "OPPONENT" },
                },
              ],
            ],
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST20_SCHEMAS: Record<string, EffectSchema> = {
  // ST20-001 Charlotte Katakuri — deferred: TURN_LIFE_FACE_UP cost type unsupported
  "ST20-002": ST20_002_CHARLOTTE_CRACKER,
  "ST20-004": ST20_004_CHARLOTTE_PUDDING,
  "ST20-005": ST20_005_CHARLOTTE_LINLIN,
};
