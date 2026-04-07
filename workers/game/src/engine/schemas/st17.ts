/**
 * ST17 Effect Schemas
 *
 * Blue (The Seven Warlords of the Sea): ST17-001 to ST17-005
 *
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — The Seven Warlords of the Sea (ST17-001 to ST17-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST17-001 Crocodile (Leader) — On Play reveal conditional draw + place
// [On Play] Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea}
// type card, draw 2 cards and place 1 card from your hand at the top of your deck.

export const ST17_001_CROCODILE: EffectSchema = {
  card_id: "ST17-001",
  card_name: "Crocodile",
  card_type: "Leader",
  effects: [
    {
      id: "on_play_reveal_draw_place",
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
            filter: { traits: ["The Seven Warlords of the Sea"] },
          },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { position: "TOP", amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST17-002 Trafalgar Law (Character) — On Play bounce cost + conditional bounce
// [On Play] You may return 1 of your Characters to the owner's hand: If your Leader has the {The Seven Warlords of the Sea} type, return up to 1 Character with a cost of 4 or less to the owner's hand.

export const ST17_002_TRAFALGAR_LAW: EffectSchema = {
  card_id: "ST17-002",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce_for_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Seven Warlords of the Sea" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST17-003 Buggy (Character) — On Play deck scry top only
// [On Play] Look at 3 cards from the top of your deck and place them at the top of your deck in any order.

export const ST17_003_BUGGY: EffectSchema = {
  card_id: "ST17-003",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry_top",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DECK_SCRY", params: { look_at: 3 } },
      ],
    },
  ],
};

// ─── ST17-004 Boa Hancock (Character) — Blocker + On Play scry + give DON
// [Blocker]
// [On Play] Look at 3 cards from the top of your deck and place them at the top or bottom of your deck in any order. Then, give up to 1 rested DON!! card to 1 of your {The Seven Warlords of the Sea} type Leader or Character cards.

export const ST17_004_BOA_HANCOCK: EffectSchema = {
  card_id: "ST17-004",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_scry_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DECK_SCRY", params: { look_at: 3 } },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["The Seven Warlords of the Sea"] },
          },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── ST17-005 Marshall.D.Teach (Character) — activate place hand to deck give DON
// [Activate: Main] [Once Per Turn] You may place 1 card from your hand at the top of your deck: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.

export const ST17_005_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "ST17-005",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "activate_hand_to_deck_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "PLACE_HAND_TO_DECK", amount: 1, position: "TOP" }],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST17_SCHEMAS: Record<string, EffectSchema> = {
  "ST17-001": ST17_001_CROCODILE,
  "ST17-002": ST17_002_TRAFALGAR_LAW,
  "ST17-003": ST17_003_BUGGY,
  "ST17-004": ST17_004_BOA_HANCOCK,
  "ST17-005": ST17_005_MARSHALL_D_TEACH,
};
