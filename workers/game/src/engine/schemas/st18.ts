/**
 * ST18 Effect Schemas
 *
 * Purple (Straw Hat Crew / Wano): ST18-001 to ST18-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Straw Hat Crew / Wano (ST18-001 to ST18-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST18-001 Uso-Hachi (Character) — On Play conditional rest
// [On Play] If you have 8 or more DON!! cards on your field, rest up to 1 of your opponent's Characters with a cost of 5 or less.

export const ST18_001_USO_HACHI: EffectSchema = {
  card_id: "ST18-001",
  card_name: "Uso-Hachi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        {
          type: "SET_REST",
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

// ─── ST18-002 O-Nami (Character) — Blocker + On Play conditional trash/draw
// [Blocker]
// [On Play] If you have 8 or more DON!! cards on your field, trash 1 card from your hand and draw 2 cards.

export const ST18_002_O_NAMI: EffectSchema = {
  card_id: "ST18-002",
  card_name: "O-Nami",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_conditional_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        { type: "TRASH_FROM_HAND", params: { amount: 1 } },
        { type: "DRAW", params: { amount: 2 }, chain: "AND" },
      ],
    },
  ],
};

// ─── ST18-003 San-Gorou (Character) — When Attacking conditional draw
// [When Attacking] [Once Per Turn] If you have 8 or more DON!! cards on your field, draw 1 card.

export const ST18_003_SAN_GOROU: EffectSchema = {
  card_id: "ST18-003",
  card_name: "San-Gorou",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_conditional_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", once_per_turn: true },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST18-004 Zoro-Juurou (Character) — On Play search Straw Hat
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 purple {Straw Hat Crew} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const ST18_004_ZORO_JUUROU: EffectSchema = {
  card_id: "ST18-004",
  card_name: "Zoro-Juurou",
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
            filter: { color: "PURPLE", traits: ["Straw Hat Crew"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── ST18-005 Luffy-Tarou (Character) — On Play DON- play from hand
// [On Play] DON!! −1: Play up to 1 purple {Straw Hat Crew} type Character card with a cost of 5 or less from your hand.

export const ST18_005_LUFFY_TAROU: EffectSchema = {
  card_id: "ST18-005",
  card_name: "Luffy-Tarou",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "PURPLE",
              card_type: "CHARACTER",
              traits: ["Straw Hat Crew"],
              cost_max: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST18_SCHEMAS: Record<string, EffectSchema> = {
  "ST18-001": ST18_001_USO_HACHI,
  "ST18-002": ST18_002_O_NAMI,
  "ST18-003": ST18_003_SAN_GOROU,
  "ST18-004": ST18_004_ZORO_JUUROU,
  "ST18-005": ST18_005_LUFFY_TAROU,
};
