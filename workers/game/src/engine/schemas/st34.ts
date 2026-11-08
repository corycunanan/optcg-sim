/**
 * ST34 Effect Schemas — STARTER DECK -PURPLE Charlotte Katakuri- [ST-34]
 *
 * New IDs ST34-001..005. Reprints are authored in their origin sets.
 * Rulings: docs/FAQs/qa_st-34.md.
 */
import type { Condition, EffectSchema } from "../effect-types.js";

const LEADER_BIG_MOM: Condition = {
  type: "LEADER_PROPERTY",
  controller: "SELF",
  property: { trait: "Big Mom Pirates" },
};

// ─── ST34-001 Charlotte Katakuri (Character) ───────────────────────────────

export const ST34_001_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "ST34-001",
  card_name: "Charlotte Katakuri",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      conditions: LEADER_BIG_MOM,
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 2, target_state: "RESTED", up_to: true },
        },
      ],
    },
    {
      id: "on_ko_play_8000",
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
            filter: { power_max: 8000 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

// ─── ST34-002 Charlotte Cracker (Character) ─────────────────────────────────

export const ST34_002_CHARLOTTE_CRACKER: EffectSchema = {
  card_id: "ST34-002",
  card_name: "Charlotte Cracker",
  card_type: "Character",
  effects: [
    {
      // FAQ: the K.O. resolves even when no DON!! can be added.
      id: "on_play_add_don_then_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          conditions: LEADER_BIG_MOM,
          params: { amount: 1, target_state: "RESTED", up_to: true },
        },
        {
          type: "KO",
          chain: "THEN",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── ST34-003 Charlotte Brulee (Character) ─────────────────────────────────

export const ST34_003_CHARLOTTE_BRULEE: EffectSchema = {
  card_id: "ST34-003",
  card_name: "Charlotte Brulee",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_big_mom",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Big Mom Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── ST34-004 Charlotte Linlin (Character) ─────────────────────────────────

export const ST34_004_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "ST34-004",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      // FAQ: both costs are required (no hand card means no DON!! −4), and a
      // competing base-power setter with a higher value wins.
      id: "on_play_life_and_zero_base_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        { type: "DON_MINUS", amount: 4 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN", up_to: true },
        },
        {
          type: "SET_BASE_POWER",
          chain: "THEN",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { value: 0 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST34-005 Baron Tamago & Pekoms (Character) ────────────────────────────

export const ST34_005_BARON_TAMAGO_PEKOMS: EffectSchema = {
  card_id: "ST34-005",
  card_name: "Baron Tamago & Pekoms",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_don_minus_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

export const ST34_SCHEMAS: Record<string, EffectSchema> = {
  "ST34-001": ST34_001_CHARLOTTE_KATAKURI,
  "ST34-002": ST34_002_CHARLOTTE_CRACKER,
  "ST34-003": ST34_003_CHARLOTTE_BRULEE,
  "ST34-004": ST34_004_CHARLOTTE_LINLIN,
  "ST34-005": ST34_005_BARON_TAMAGO_PEKOMS,
};
