/**
 * ST16 Effect Schemas
 *
 * Green (Uta / FILM): ST16-001 to ST16-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Uta / FILM (ST16-001 to ST16-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST16-001 Uta (Character) — Blocker + activate trash FILM give DON
// [Blocker]
// [Activate: Main] [Once Per Turn] You may trash 1 {FILM} type card from your hand: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST16_001_UTA: EffectSchema = {
  card_id: "ST16-001",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["FILM"] } }],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST16-002 Gordon (Character) — Blocker + opponent attack power boost
// [Blocker]
// [On Your Opponent's Attack] You may trash any number of {Music} type cards from your hand. Your Leader or 1 of your Characters gains +1000 power during this battle for every card trashed.

export const ST16_002_GORDON: EffectSchema = {
  card_id: "ST16-002",
  card_name: "Gordon",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "opponent_attack_power_boost",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: "ANY_NUMBER", filter: { traits: ["Music"] } }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_TRASHED_THIS_WAY",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST16-003 Charlotte Katakuri (Character) — conditional power
// If your Leader has the {FILM} type and you have 6 or more rested cards, this Character gains +2000 power.

export const ST16_003_CHARLOTTE_KATAKURI: EffectSchema = {
  card_id: "ST16-003",
  card_name: "Charlotte Katakuri",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "FILM" },
          },
          {
            type: "RESTED_CARD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 6,
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
  ],
};

// ─── ST16-004 Shanks (Character) — On Play KO rested
// [On Play] K.O. up to 1 of your opponent's rested Characters.

export const ST16_004_SHANKS: EffectSchema = {
  card_id: "ST16-004",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── ST16-005 Monkey.D.Luffy (Character) — conditional power with rested Uta
// If you have a rested [Uta], this Character gains +1000 power.

export const ST16_005_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST16-005",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power_rested_uta",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Uta", is_rested: true },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST16_SCHEMAS: Record<string, EffectSchema> = {
  "ST16-001": ST16_001_UTA,
  "ST16-002": ST16_002_GORDON,
  "ST16-003": ST16_003_CHARLOTTE_KATAKURI,
  "ST16-004": ST16_004_SHANKS,
  "ST16-005": ST16_005_MONKEY_D_LUFFY,
};
