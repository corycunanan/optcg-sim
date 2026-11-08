/**
 * ST35 Effect Schemas — STARTER DECK -RED/BLACK Sabo- [ST-35]
 *
 * New IDs ST35-001..005. Reprints are authored in their origin sets.
 * Rulings: docs/FAQs/qa_st-35.md.
 */
import type { EffectSchema } from "../effect-types.js";

// ─── ST35-001 Hack (Character) ──────────────────────────────

export const ST35_001_HACK: EffectSchema = {
  card_id: "ST35-001",
  card_name: "Hack",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_ko_2000",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 2000 },
          },
        },
      ],
    },
  ],
};

// ─── ST35-002 Lindbergh (Character) ──────────────────────────────

export const ST35_002_LINDBERGH: EffectSchema = {
  card_id: "ST35-002",
  card_name: "Lindbergh",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST35-003 Karasu (Character) ──────────────────────────────

export const ST35_003_KARASU: EffectSchema = {
  card_id: "ST35-003",
  card_name: "Karasu",
  card_type: "Character",
  effects: [
    {
      // FAQ: the opponent chooses the card; the cost may be paid when they
      // hold 6 or fewer cards, and then they trash nothing.
      id: "when_attacking_mill_opponent_discard",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [{ type: "MILL", amount: 2 }],
      post_cost_conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 7,
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
  ],
};

// ─── ST35-004 Koala (Character) ──────────────────────────────

export const ST35_004_KOALA: EffectSchema = {
  card_id: "ST35-004",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "self_static",
      category: "permanent",
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
      id: "on_play_don_leader_play_revolutionary",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
        },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { power_max: 4000, traits: ["Revolutionary Army"] },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

// ─── ST35-005 Bartholomew Kuma (Character) ──────────────────────────────

export const ST35_005_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "ST35-005",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "self_static",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "on_play_don_leader_play_revolutionary",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
        },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { power_max: 4000, traits: ["Revolutionary Army"] },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const ST35_SCHEMAS: Record<string, EffectSchema> = {
  "ST35-001": ST35_001_HACK,
  "ST35-002": ST35_002_LINDBERGH,
  "ST35-003": ST35_003_KARASU,
  "ST35-004": ST35_004_KOALA,
  "ST35-005": ST35_005_BARTHOLOMEW_KUMA,
};
