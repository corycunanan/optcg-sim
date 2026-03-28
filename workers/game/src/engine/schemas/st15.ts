/**
 * ST15 Effect Schemas
 *
 * Red (Whitebeard Pirates): ST15-001 to ST15-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Whitebeard Pirates (ST15-001 to ST15-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST15-001 Atmos (Character) — When Attacking prohibition on self life add
// [When Attacking] If your Leader is [Edward.Newgate], you cannot add Life cards to your hand using your own effects during this turn.

export const ST15_001_ATMOS: EffectSchema = {
  card_id: "ST15-001",
  card_name: "Atmos",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_life_prohibition",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Edward.Newgate" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ADD_LIFE_TO_HAND",
            scope: { controller: "SELF" },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST15-002 Edward.Newgate (Character) — On Play give DON + activate KO
// [On Play] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
// [Activate: Main] You may rest this Character: K.O. up to 1 of your opponent's Characters with 5000 power or less.

export const ST15_002_EDWARD_NEWGATE: EffectSchema = {
  card_id: "ST15-002",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 5000 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST15-003 Kingdew (Character) — Blocker + KO by effect power boost
// [Blocker]
// [Opponent's Turn] When this Character is K.O.'d by an effect, up to 1 of your Leader gains +2000 power during this turn.

export const ST15_003_KINGDEW: EffectSchema = {
  card_id: "ST15-003",
  card_name: "Kingdew",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_by_effect_leader_buff",
      category: "auto",
      trigger: {
        keyword: "ON_KO",
        cause: "EFFECT",
        turn_restriction: "OPPONENT_TURN",
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST15-004 Thatch (Character) — On Play conditional -2000 then add life to hand
// [On Play] If your Leader's type includes "Whitebeard Pirates", give up to 1 of your opponent's Characters −2000 power during this turn. Then, add 1 card from the top of your Life cards to your hand.

export const ST15_004_THATCH: EffectSchema = {
  card_id: "ST15-004",
  card_name: "Thatch",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff_and_life_to_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── ST15-005 Portgas.D.Ace (Character) — conditional Rush + replacement removal protection
// If your Leader's type includes "Whitebeard Pirates", this Character gains [Rush].
// [Once Per Turn] If this Character would be removed from the field by your opponent's effect, you may give this Character −2000 power during this turn instead.

export const ST15_005_PORTGAS_D_ACE: EffectSchema = {
  card_id: "ST15-005",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "replacement_removal_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -2000 },
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

export const ST15_SCHEMAS: Record<string, EffectSchema> = {
  "ST15-001": ST15_001_ATMOS,
  "ST15-002": ST15_002_EDWARD_NEWGATE,
  "ST15-003": ST15_003_KINGDEW,
  "ST15-004": ST15_004_THATCH,
  "ST15-005": ST15_005_PORTGAS_D_ACE,
};
