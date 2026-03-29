/**
 * ST26 Effect Schemas
 *
 * Purple (Straw Hat Crew — Vinsmoke Sanji): ST26-001 to ST26-005
 *
 * All cards fully encoded.
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Straw Hat Crew (ST26-001 to ST26-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST26-001 Soba Mask (Character) — hand cost reduction + on play return San-Gorou/Sanji
// If you have a [San-Gorou] or [Sanji] Character with 7000 base power or more, give this card in your hand −5 cost.
// [On Play] Return all of your [San-Gorou] and [Sanji] Characters to the owner's hand.

export const ST26_001_SOBA_MASK: EffectSchema = {
  card_id: "ST26-001",
  card_name: "Soba Mask",
  card_type: "Character",
  effects: [
    {
      id: "ST26-001_hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          name_any_of: ["San-Gorou", "Sanji"],
          card_type: "CHARACTER",
          base_power_min: 7000,
        },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { self_ref: true },
          params: { amount: -5 },
        },
      ],
    },
    {
      id: "ST26-001_on_play_return_characters",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { name_any_of: ["San-Gorou", "Sanji"] },
          },
        },
      ],
    },
  ],
};

// ─── ST26-002 Tony Tony.Chopper (Character) — Blocker + DON−2 rest opponent DON or character
// [Blocker]
// [On Play] DON!! −2: Rest up to 1 of your opponent's DON!! cards or Characters with a cost of 1 or less.

export const ST26_002_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "ST26-002",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                { type: "REST_OPPONENT_DON", params: { amount: 1 } },
              ],
              [
                {
                  type: "SET_REST",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 1 },
                  },
                },
              ],
            ],
          },
        },
      ],
    },
  ],
};

// ─── ST26-003 Nico Robin (Character) — DON−2 add DON active
// [On Play] DON!! −2: Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST26_003_NICO_ROBIN: EffectSchema = {
  card_id: "ST26-003",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── ST26-004 General Franky (Character) — DON−2 power debuff
// [On Play] DON!! −2: Give up to 2 of your opponent's Characters −2000 power during this turn.

export const ST26_004_GENERAL_FRANKY: EffectSchema = {
  card_id: "ST26-004",
  card_name: "General Franky",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST26-005 Monkey.D.Luffy (Character) — DON−2 set leader base power
// [On Play]/[When Attacking] DON!! −2: If your Leader is multicolored and your opponent has 5 or more DON!! cards on their field, your {Straw Hat Crew} type Leader's base power becomes 7000 until the end of your opponent's next End Phase.

export const ST26_005_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST26-005",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_set_base_power",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { multicolored: true },
          },
          {
            type: "DON_FIELD_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 5,
          },
        ],
      },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { value: 7000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST26_SCHEMAS: Record<string, EffectSchema> = {
  "ST26-001": ST26_001_SOBA_MASK,
  "ST26-002": ST26_002_TONY_TONY_CHOPPER,
  "ST26-003": ST26_003_NICO_ROBIN,
  "ST26-004": ST26_004_GENERAL_FRANKY,
  "ST26-005": ST26_005_MONKEY_D_LUFFY,
};
