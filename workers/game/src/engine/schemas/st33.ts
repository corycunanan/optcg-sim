/**
 * ST33 Effect Schemas — STARTER DECK -BLUE Kuzan- [ST-33]
 *
 * New IDs ST33-001..005. Reprints are authored in their origin sets.
 * Rulings: docs/FAQs/qa_st-33.md.
 */
import type { EffectSchema } from "../effect-types.js";

// ─── ST33-001 Koby (Character) ─────────────────────────────────────────────

export const ST33_001_KOBY: EffectSchema = {
  card_id: "ST33-001",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── ST33-002 Sakazuki (Character) ─────────────────────────────────────────

export const ST33_002_SAKAZUKI: EffectSchema = {
  card_id: "ST33-002",
  card_name: "Sakazuki",
  card_type: "Character",
  effects: [
    {
      // FAQ: the cost may be paid when the opponent has 5 or fewer cards;
      // they then trash nothing.
      id: "when_attacking_opponent_discard",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      post_cost_conditions: {
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
              target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
              params: { amount: 1 },
            },
          },
        },
      ],
    },
    {
      id: "on_ko_play_navy",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Navy"], cost_max: 4 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

// ─── ST33-003 Smoker (Character) ───────────────────────────────────────────

export const ST33_003_SMOKER: EffectSchema = {
  card_id: "ST33-003",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_bottom_two",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 2 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── ST33-004 Borsalino (Character) ────────────────────────────────────────

export const ST33_004_BORSALINO: EffectSchema = {
  card_id: "ST33-004",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      // "During the turn in which a card in your hand is trashed by an effect,
      // give this card in your hand −3 cost." FAQ: an opponent's effect counts.
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "ACTION_PERFORMED_THIS_TURN",
        controller: "SELF",
        action: "CARD_TRASHED_FROM_HAND_BY_EFFECT",
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF", self_ref: true },
          params: { amount: -3 },
        },
      ],
    },
  ],
};

// ─── ST33-005 Monkey.D.Garp (Character) ────────────────────────────────────

export const ST33_005_MONKEY_D_GARP: EffectSchema = {
  card_id: "ST33-005",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_blue_navy",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "BLUE",
              traits: ["Navy"],
              power_max: 8000,
              exclude_name: "Monkey.D.Garp",
            },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const ST33_SCHEMAS: Record<string, EffectSchema> = {
  "ST33-001": ST33_001_KOBY,
  "ST33-002": ST33_002_SAKAZUKI,
  "ST33-003": ST33_003_SMOKER,
  "ST33-004": ST33_004_BORSALINO,
  "ST33-005": ST33_005_MONKEY_D_GARP,
};
