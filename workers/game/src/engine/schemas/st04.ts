/**
 * ST04 Effect Schemas
 *
 * Purple (Animal Kingdom Pirates): ST04-001 to ST04-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Animal Kingdom Pirates (ST04-001 to ST04-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST04-001 Kaido (Leader) — trash opponent life
// [Activate: Main] [Once Per Turn] DON!! −7: Trash up to 1 of your opponent's Life cards.

export const ST04_001_KAIDO: EffectSchema = {
  card_id: "ST04-001",
  card_name: "Kaido",
  card_type: "Leader",
  effects: [
    {
      id: "activate_trash_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 7 }],
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP", controller: "OPPONENT" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST04-002 Ulti (Character) — On Play play Page One from hand
// [On Play] DON!! −1: Play up to 1 [Page One] card with a cost of 4 or less from your hand.

export const ST04_002_ULTI: EffectSchema = {
  card_id: "ST04-002",
  card_name: "Ulti",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_page_one",
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
            filter: { name: "Page One", cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── ST04-003 Kaido (Character) — On Play KO + Rush
// [On Play] DON!! −5: K.O. up to 1 of your opponent's Characters with a cost of 6 or less. This Character gains [Rush] during this turn.

export const ST04_003_KAIDO: EffectSchema = {
  card_id: "ST04-003",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_and_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 5 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST04-004 King (Character) — On Play KO cost 4
// [On Play] DON!! −1: K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const ST04_004_KING: EffectSchema = {
  card_id: "ST04-004",
  card_name: "King",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── ST04-005 Queen (Character) — Blocker + On Play draw/trash
// [Blocker]
// [On Play] DON!! −1: Draw 2 cards and trash 1 card from your hand.

export const ST04_005_QUEEN: EffectSchema = {
  card_id: "ST04-005",
  card_name: "Queen",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "AND" },
      ],
    },
  ],
};

// ─── ST04-006 Sasaki (Character) — On Play draw 1
// [On Play] DON!! −1: Draw 1 card.

export const ST04_006_SASAKI: EffectSchema = {
  card_id: "ST04-006",
  card_name: "Sasaki",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST04-008 Jack (Character) — On Play add DON active
// [On Play] You may trash 1 card from your hand: Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST04_008_JACK: EffectSchema = {
  card_id: "ST04-008",
  card_name: "Jack",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST04-010 Who's.Who (Character) — On Play KO cost 3 + trigger play self
// [On Play] DON!! −1: K.O. up to 1 of your opponent's Characters with a cost of 3 or less.
// [Trigger] Play this card.

export const ST04_010_WHOS_WHO: EffectSchema = {
  card_id: "ST04-010",
  card_name: "Who's.Who",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── ST04-011 Black Maria (Character) — Blocker
// [Blocker]

export const ST04_011_BLACK_MARIA: EffectSchema = {
  card_id: "ST04-011",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST04-014 Lead Performer "Disaster" (Event) — draw + add DON + trigger reuse
// [Main] Draw 1 card, then add up to 1 DON!! card from your DON!! deck and set it as active.
// [Trigger] Activate this card's [Main] effect.

export const ST04_014_LEAD_PERFORMER_DISASTER: EffectSchema = {
  card_id: "ST04-014",
  card_name: "Lead Performer \"Disaster\"",
  card_type: "Event",
  effects: [
    {
      id: "main_draw_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── ST04-015 Brachio Bomber (Event) — KO + add DON + trigger add DON
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 6 or less, then add up to 1 DON!! card from your DON!! deck and set it as active.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST04_015_BRACHIO_BOMBER: EffectSchema = {
  card_id: "ST04-015",
  card_name: "Brachio Bomber",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
          chain: "THEN",
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

// ─── ST04-016 Blast Breath (Event) — Counter +4000 with DON cost
// [Counter] DON!! −1: Up to 1 of your Leader or Character cards gains +4000 power during this battle.

export const ST04_016_BLAST_BREATH: EffectSchema = {
  card_id: "ST04-016",
  card_name: "Blast Breath",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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
      ],
    },
  ],
};

// ─── ST04-017 Onigashima Island (Stage) — activate add DON rested
// [Activate: Main] You may rest this Stage: If your Leader has the {Animal Kingdom Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.

export const ST04_017_ONIGASHIMA_ISLAND: EffectSchema = {
  card_id: "ST04-017",
  card_name: "Onigashima Island",
  card_type: "Stage",
  effects: [
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST04_SCHEMAS: Record<string, EffectSchema> = {
  "ST04-001": ST04_001_KAIDO,
  "ST04-002": ST04_002_ULTI,
  "ST04-003": ST04_003_KAIDO,
  "ST04-004": ST04_004_KING,
  "ST04-005": ST04_005_QUEEN,
  "ST04-006": ST04_006_SASAKI,
  "ST04-008": ST04_008_JACK,
  "ST04-010": ST04_010_WHOS_WHO,
  "ST04-011": ST04_011_BLACK_MARIA,
  "ST04-014": ST04_014_LEAD_PERFORMER_DISASTER,
  "ST04-015": ST04_015_BRACHIO_BOMBER,
  "ST04-016": ST04_016_BLAST_BREATH,
  "ST04-017": ST04_017_ONIGASHIMA_ISLAND,
};
