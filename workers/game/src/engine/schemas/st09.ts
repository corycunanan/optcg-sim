/**
 * ST09 Effect Schemas
 *
 * Yellow (Yamato / Land of Wano): ST09-001 to ST09-015
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Yamato / Land of Wano (ST09-001 to ST09-015)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST09-001 Yamato (Leader) — DON!!x1 opponent turn conditional +1000
// [DON!! x1] [Opponent's Turn] If you have 2 or less Life cards, this Leader gains +1000 power.

export const ST09_001_YAMATO: EffectSchema = {
  card_id: "ST09-001",
  card_name: "Yamato",
  card_type: "Leader",
  effects: [
    {
      id: "don_conditional_power",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "SPECIFIC_CARD",
            operator: ">=",
            value: 1,
          },
          {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
          },
        ],
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

// ─── ST09-004 Kaido (Character) — DON!!x1 conditional KO protection in battle
// [DON!! x1] If you have 2 or less Life cards, this Character cannot be K.O.'d in battle.

export const ST09_004_KAIDO: EffectSchema = {
  card_id: "ST09-004",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "don_conditional_ko_protection",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "DON_GIVEN",
            controller: "SELF",
            mode: "SPECIFIC_CARD",
            operator: ">=",
            value: 1,
          },
          {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
          },
        ],
      },
      prohibitions: [
        { type: "CANNOT_BE_KO", target: { type: "SELF" }, scope: { cause: "BATTLE" } },
      ],
    },
  ],
};

// ─── ST09-005 Kouzuki Oden (Character) — DON!!x1 Double Attack + On KO add to life
// [DON!! x1] This Character gains [Double Attack].
// [On K.O.] You may trash 2 cards from your hand: Add up to 1 card from the top of your deck to the top of your Life cards.

export const ST09_005_KOUZUKI_ODEN: EffectSchema = {
  card_id: "ST09-005",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "don_double_attack",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
        },
      ],
    },
    {
      id: "on_ko_add_life",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST09-007 Shinobu (Character) — Blocker + On Block life cost +4000
// [Blocker]
// [On Block] You may add 1 card from the top or bottom of your Life cards to your hand: This Character gains +4000 power during this battle.

export const ST09_007_SHINOBU: EffectSchema = {
  card_id: "ST09-007",
  card_name: "Shinobu",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_power_boost",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST09-008 Shimotsuki Ushimaru (Character) — When Attacking life cost play from hand
// [DON!! x1] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: Play up to 1 yellow {Land of Wano} type Character card with a cost of 4 or less from your hand.

export const ST09_008_SHIMOTSUKI_USHIMARU: EffectSchema = {
  card_id: "ST09-008",
  card_name: "Shimotsuki Ushimaru",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_play_from_hand",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "YELLOW",
              card_type: "CHARACTER",
              traits: ["Land of Wano"],
              cost_max: 4,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST09-010 Portgas.D.Ace (Character) — replacement KO protection
// [Once Per Turn] If this Character would be K.O.'d, you may trash 1 card from the top or bottom of your Life cards instead.

export const ST09_010_PORTGAS_D_ACE: EffectSchema = {
  card_id: "ST09-010",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST09-012 Yamato (Character) — When Attacking life cost +2000 until next turn
// [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: This Character gains +2000 power until the start of your next turn.

export const ST09_012_YAMATO: EffectSchema = {
  card_id: "ST09-012",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST09-014 Narikabura Arrow (Event) — Counter conditional -3000 + trigger add life
// [Counter] If you have 2 or less Life cards, give up to 1 of your opponent's Leader or Character cards −3000 power during this turn.
// [Trigger] You may trash 2 cards from your hand: Add up to 1 card from the top of your deck to the top of your Life cards.

export const ST09_014_NARIKABURA_ARROW: EffectSchema = {
  card_id: "ST09-014",
  card_name: "Narikabura Arrow",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_reduction",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_add_life",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST09-015 Thunder Bagua (Event) — Counter +4000 then conditional add to life + trigger draw
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, if you have 2 or less Life cards, add up to 1 of your opponent's Characters with a cost of 3 or less to the top or bottom of the owner's Life cards face-up.
// [Trigger] Draw 1 card.

export const ST09_015_THUNDER_BAGUA: EffectSchema = {
  card_id: "ST09-015",
  card_name: "Thunder Bagua",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_life_add",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP" },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST09_SCHEMAS: Record<string, EffectSchema> = {
  "ST09-001": ST09_001_YAMATO,
  "ST09-004": ST09_004_KAIDO,
  "ST09-005": ST09_005_KOUZUKI_ODEN,
  "ST09-007": ST09_007_SHINOBU,
  "ST09-008": ST09_008_SHIMOTSUKI_USHIMARU,
  "ST09-010": ST09_010_PORTGAS_D_ACE,
  "ST09-012": ST09_012_YAMATO,
  "ST09-014": ST09_014_NARIKABURA_ARROW,
  "ST09-015": ST09_015_THUNDER_BAGUA,
};
