/**
 * ST05 Effect Schemas
 *
 * Purple (FILM): ST05-001 to ST05-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — FILM (ST05-001 to ST05-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST05-001 Shanks (Leader) — activate buff FILM characters
// [Activate: Main] [Once Per Turn] DON!! −3: All of your {FILM} type Characters gain +2000 power during this turn.

export const ST05_001_SHANKS: EffectSchema = {
  card_id: "ST05-001",
  card_name: "Shanks",
  card_type: "Leader",
  effects: [
    {
      id: "activate_film_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 3 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits: ["FILM"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST05-002 Ain (Character) — On Play add DON rested
// [On Play] Add up to 1 DON!! card from your DON!! deck and rest it.

export const ST05_002_AIN: EffectSchema = {
  card_id: "ST05-002",
  card_name: "Ain",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } },
      ],
    },
  ],
};

// ─── ST05-003 Ann (Character) — Blocker
// [Blocker]

export const ST05_003_ANN: EffectSchema = {
  card_id: "ST05-003",
  card_name: "Ann",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST05-004 Uta (Character) — Blocker + On Block rest opponent
// [Blocker]
// [On Block] DON!! −1: Rest up to 1 of your opponent's Characters with a cost of 5 or less.

export const ST05_004_UTA: EffectSchema = {
  card_id: "ST05-004",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── ST05-005 Carina (Character) — activate add DON if opponent has more
// [Activate: Main] [Once Per Turn] You may rest this Character and trash 1 {FILM} type card from your hand: If your opponent has more DON!! cards on their field than you, add 2 DON!! cards from your DON!! deck and rest them.

export const ST05_005_CARINA: EffectSchema = {
  card_id: "ST05-005",
  card_name: "Carina",
  card_type: "Character",
  effects: [
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["FILM"] } },
      ],
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<",
      },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 2, target_state: "RESTED" } },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── ST05-006 Gild Tesoro (Character) — When Attacking draw 2
// [When Attacking] DON!! −2: Draw 2 cards.

export const ST05_006_GILD_TESORO: EffectSchema = {
  card_id: "ST05-006",
  card_name: "Gild Tesoro",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── ST05-008 Shiki (Character) — cannot be KO'd in battle with 8+ DON
// If you have 8 or more DON!! cards on your field, this Character cannot be K.O.'d in battle.

export const ST05_008_SHIKI: EffectSchema = {
  card_id: "ST05-008",
  card_name: "Shiki",
  card_type: "Character",
  effects: [
    {
      id: "conditional_ko_protection",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      prohibitions: [
        { type: "CANNOT_BE_KO", target: { type: "SELF" }, scope: { cause: "BATTLE" } },
      ],
    },
  ],
};

// ─── ST05-010 Zephyr (Character) — battle Strike buff + activate +2000
// When this Character battles ＜Strike＞ attribute Characters, this Character gains +3000 power during this turn.
// [Activate: Main] [Once Per Turn] DON!! −1: This Character gains +2000 power during this turn.

export const ST05_010_ZEPHYR: EffectSchema = {
  card_id: "ST05-010",
  card_name: "Zephyr",
  card_type: "Character",
  effects: [
    {
      id: "battle_strike_power",
      category: "auto",
      trigger: {
        event: "CHARACTER_BATTLES",
        filter: { attribute: "STRIKE" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "activate_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST05-011 Douglas Bullet (Character) — activate rest opponents + Double Attack
// [Activate: Main] [Once Per Turn] DON!! −4: Rest up to 2 of your opponent's Characters with a cost of 6 or less. Then, this Character gains [Double Attack] during this turn.

export const ST05_011_DOUGLAS_BULLET: EffectSchema = {
  card_id: "ST05-011",
  card_name: "Douglas Bullet",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_and_double_attack",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 4 }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 6 },
          },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST05-014 Buena Festa (Character) — On Play search deck FILM
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {FILM} type card other than [Buena Festa] and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const ST05_014_BUENA_FESTA: EffectSchema = {
  card_id: "ST05-014",
  card_name: "Buena Festa",
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
            filter: { traits: ["FILM"], exclude_name: "Buena Festa" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── ST05-016 Lion's Threat Imperial Earth Bind (Event) — KO + trigger add DON
// [Main] DON!! −2: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST05_016_LIONS_THREAT_IMPERIAL_EARTH_BIND: EffectSchema = {
  card_id: "ST05-016",
  card_name: "Lion's Threat Imperial Earth Bind",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } },
      ],
    },
  ],
};

// ─── ST05-017 Union Armada (Event) — Counter +4000 + conditional KO protection
// [Counter] Up to 1 of your {FILM} type Leader or Character cards gains +4000 power during this battle. If that card is a Character, that Character cannot be K.O.'d during this turn.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST05_017_UNION_ARMADA: EffectSchema = {
  card_id: "ST05-017",
  card_name: "Union Armada",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_protection",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["FILM"] },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
          result_ref: "boosted_card",
        },
        {
          type: "APPLY_PROHIBITION",
          target_ref: "boosted_card",
          params: { prohibition_type: "CANNOT_BE_KO" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "SOURCE_PROPERTY",
            context: "KO_BY_EFFECT",
            source_filter: { card_type: "CHARACTER" },
          },
        },
      ],
    },
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST05_SCHEMAS: Record<string, EffectSchema> = {
  "ST05-001": ST05_001_SHANKS,
  "ST05-002": ST05_002_AIN,
  "ST05-003": ST05_003_ANN,
  "ST05-004": ST05_004_UTA,
  "ST05-005": ST05_005_CARINA,
  "ST05-006": ST05_006_GILD_TESORO,
  "ST05-008": ST05_008_SHIKI,
  "ST05-010": ST05_010_ZEPHYR,
  "ST05-011": ST05_011_DOUGLAS_BULLET,
  "ST05-014": ST05_014_BUENA_FESTA,
  "ST05-016": ST05_016_LIONS_THREAT_IMPERIAL_EARTH_BIND,
  "ST05-017": ST05_017_UNION_ARMADA,
};
