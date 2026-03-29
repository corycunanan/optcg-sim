/**
 * ST23 Effect Schemas
 *
 * Red (Film Red): ST23-001 to ST23-005
 *
 * All cards fully encoded.
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Film Red (ST23-001 to ST23-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST23-001 Uta (Character) — hand cost reduction + Blocker
// If you have a Character with 10000 power or more, give this card in your hand −4 cost.
// [Blocker]

export const ST23_001_UTA: EffectSchema = {
  card_id: "ST23-001",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "ST23-001_hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", power_min: 10000 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { self_ref: true },
          params: { amount: -4 },
        },
      ],
    },
    {
      id: "ST23-001_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST23-002 Shanks (Character) — hand cost reduction + on play leader power boost
// If your opponent has a Character with 8000 base power or more, give this card in your hand −3 cost.
// [On Play] If your Leader has the {Red-Haired Pirates} type or is [Uta], your Leader gains +2000 power until the end of your opponent's next End Phase.

export const ST23_002_SHANKS: EffectSchema = {
  card_id: "ST23-002",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "ST23-002_hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER", base_power_min: 8000 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { self_ref: true },
          params: { amount: -3 },
        },
      ],
    },
    {
      id: "ST23-002_on_play_leader_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Red-Haired Pirates" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Uta" },
          },
        ],
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── ST23-003 Benn.Beckman (Character) — on play trash cost to conditional KO
// [On Play] You may trash 1 card from your hand: If your Leader has the {Red-Haired Pirates} type, K.O. up to 1 of your opponent's Characters with 4000 base power or less.

export const ST23_003_BENN_BECKMAN: EffectSchema = {
  card_id: "ST23-003",
  card_name: "Benn.Beckman",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Red-Haired Pirates" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 4000 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST23-004 Monkey.D.Luffy (Character) — activate rest DON + self to debuff
// [Activate: Main] You may rest 1 of your DON!! cards and this Character: Give up to 1 of your opponent's Characters −1000 power during this turn.

export const ST23_004_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST23-004",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST23-005 Yasopp (Character) — activate give rested DON
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST23_005_YASOPP: EffectSchema = {
  card_id: "ST23-005",
  card_name: "Yasopp",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
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
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST23_SCHEMAS: Record<string, EffectSchema> = {
  "ST23-001": ST23_001_UTA,
  "ST23-002": ST23_002_SHANKS,
  "ST23-003": ST23_003_BENN_BECKMAN,
  "ST23-004": ST23_004_MONKEY_D_LUFFY,
  "ST23-005": ST23_005_YASOPP,
};
