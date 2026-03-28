/**
 * ST27 Effect Schemas
 *
 * Black (Blackbeard Pirates): ST27-001 to ST27-005
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Blackbeard Pirates (ST27-001 to ST27-005)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST27-001 Avalo Pizarro (Character) — activate rest Fullalead + power boost, on KO draw
// [Activate: Main] [Once Per Turn] You may rest 1 of your [Fullalead] cards: If your Leader has the {Blackbeard Pirates} type, this Character gains +4000 power during this turn.
// [On K.O.] Draw 1 card.

export const ST27_001_AVALO_PIZARRO: EffectSchema = {
  card_id: "ST27-001",
  card_name: "Avalo Pizarro",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_CARDS", amount: 1, filter: { name: "Fullalead" } },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST27-002 Catarina Devon (Character) — activate trash self for cost reduction, on KO draw
// [Activate: Main] You may trash this Character: If your Leader has the {Blackbeard Pirates} type, give up to 1 of your opponent's Characters −1 cost during this turn.
// [On K.O.] Draw 1 card.

export const ST27_002_CATARINA_DEVON: EffectSchema = {
  card_id: "ST27-002",
  card_name: "Catarina Devon",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST27-003 Kuzan (Character) — Blocker + on KO play from trash rested
// [Blocker]
// [On K.O.] Play up to 1 {Blackbeard Pirates} type Character card with a cost of 5 or less from your trash rested.

export const ST27_003_KUZAN: EffectSchema = {
  card_id: "ST27-003",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Blackbeard Pirates"], cost_max: 5 },
          },
          params: {
            source_zone: "TRASH",
            cost_override: "FREE",
            entry_state: "RESTED",
          },
        },
      ],
    },
  ],
};

// ─── ST27-004 Sanjuan.Wolf (Character) — conditional blocker + dynamic cost + on play trash from hand
// If your Leader has the {Blackbeard Pirates} type, this Character gains [Blocker] and +1 cost for every 4 cards in your trash.
// [On Play] Trash 1 card from your hand.

export const ST27_004_SANJUAN_WOLF: EffectSchema = {
  card_id: "ST27-004",
  card_name: "Sanjuan.Wolf",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: 1,
              divisor: 4,
            },
          },
        },
      ],
    },
    {
      id: "on_play_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST27-005 Marshall.D.Teach (Character) — activate rest self to KO + on KO add from trash
// [Activate: Main] You may rest this Character: K.O. up to 1 Character with a cost of 3 or less.
// [On K.O.] Add up to 1 black card from your trash to your hand.

export const ST27_005_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "ST27-005",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
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
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_ko_add_from_trash",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK" },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST27_SCHEMAS: Record<string, EffectSchema> = {
  "ST27-001": ST27_001_AVALO_PIZARRO,
  "ST27-002": ST27_002_CATARINA_DEVON,
  "ST27-003": ST27_003_KUZAN,
  "ST27-004": ST27_004_SANJUAN_WOLF,
  "ST27-005": ST27_005_MARSHALL_D_TEACH,
};
