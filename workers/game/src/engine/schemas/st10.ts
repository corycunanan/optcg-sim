/**
 * M4 Effect Schema — ST10 Card Encodings
 *
 * Red/Purple (Heart Pirates / Kid Pirates / Straw Hat Crew): ST10-001 through ST10-017
 *
 * Red Leaders + Characters: ST10-001 through ST10-006
 * Purple Characters: ST10-007 through ST10-014
 * Red Events: ST10-015, ST10-016
 * Purple Events: ST10-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Leaders + Characters (ST10-001 to ST10-006)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST10-001 Trafalgar Law (Leader) — Activate:Main + DON!! −3
// [Activate: Main] [Once Per Turn] DON!! −3: Place up to 1 of your opponent's Characters
// with 3000 power or less at the bottom of the owner's deck, and play up to 1 Character
// card with a cost of 4 or less from your hand.

export const ST10_001_TRAFALGAR_LAW: EffectSchema = {
  card_id: "ST10-001",
  card_name: "Trafalgar Law",
  card_type: "Leader",
  effects: [
    {
      id: "activate_bottom_deck_and_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 3 }],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
          params: { position: "BOTTOM" },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "AND",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST10-002 Monkey.D.Luffy (Leader) — Activate:Main + DON condition
// [Activate: Main] [Once Per Turn] If you have 0 DON!! cards on your field or 8 or more
// DON!! cards on your field, add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST10_002_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST10-002",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        any_of: [
          { type: "DON_FIELD_COUNT", controller: "SELF", operator: "==", value: 0 },
          { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 8 },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST10-003 Eustass"Captain"Kid (Leader) — Permanent debuff + When Attacking buff
// [Your Turn] If you have 4 or more Life cards, give this Leader −1000 power.
// [When Attacking] DON!! −1: This Leader gains +2000 power during this turn.

export const ST10_003_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "ST10-003",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Leader",
  effects: [
    {
      id: "your_turn_power_penalty",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 4,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST10-004 Sanji (Character) — On Play conditional Rush
// [On Play] If your opponent has a Character with 5000 or more power, this Character
// gains [Rush] during this turn.

export const ST10_004_SANJI: EffectSchema = {
  card_id: "ST10-004",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER", power_min: 5000 },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST10-005 Jinbe (Character) — DON!! x1 When Attacking debuff
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters −2000 power
// during this turn.

export const ST10_005_JINBE: EffectSchema = {
  card_id: "ST10-005",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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
      ],
    },
  ],
};

// ─── ST10-006 Monkey.D.Luffy (Character) — Rush + Blocker-triggered KO
// [Rush]
// [Once Per Turn] When your opponent activates a [Blocker], K.O. up to 1 of your
// opponent's Characters with 8000 power or less.

export const ST10_006_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST10-006",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "rush_keyword",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "blocker_triggered_ko",
      category: "auto",
      trigger: {
        event: "BLOCKER_ACTIVATED",
        filter: { controller: "OPPONENT" },
        once_per_turn: true,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 8000 },
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Characters (ST10-007 to ST10-014)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST10-007 Killer (Character) — DON returned trigger KO
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!!
// deck, K.O. up to 1 of your opponent's rested Characters with a cost of 3 or less.

export const ST10_007_KILLER: EffectSchema = {
  card_id: "ST10-007",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_ko",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3, is_rested: true },
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST10-008 Shachi & Penguin (Character) — On Play add DON
// [On Play] If you have 3 or less DON!! cards on your field, add up to 2 DON!! cards
// from your DON!! deck and rest them.

export const ST10_008_SHACHI_AND_PENGUIN: EffectSchema = {
  card_id: "ST10-008",
  card_name: "Shachi & Penguin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 2, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── ST10-009 Jean Bart (Character) — On Play DON_REST cost add DON
// [On Play] ➀: Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST10_009_JEAN_BART: EffectSchema = {
  card_id: "ST10-009",
  card_name: "Jean Bart",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_don_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── ST10-010 Trafalgar Law (Character) — Blocker + On Play DON −1 hand trash
// [Blocker]
// [On Play] DON!! −1: If your opponent has 7 or more cards in their hand, trash 2 cards
// from your opponent's hand.

export const ST10_010_TRAFALGAR_LAW: EffectSchema = {
  card_id: "ST10-010",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "blocker_keyword",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_opponent_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 7,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              target: {
                type: "CARD_IN_HAND",
                controller: "SELF",
                count: { exact: 2 },
              },
              params: { amount: 2 },
            },
          },
        },
      ],
    },
  ],
};

// ─── ST10-011 Heat (Character) — DON returned power buff
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!!
// deck, this Character gains +2000 power until the start of your next turn.

export const ST10_011_HEAT: EffectSchema = {
  card_id: "ST10-011",
  card_name: "Heat",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_power_buff",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST10-012 Bepo (Character) — On Play / When Attacking comparative DON add
// [On Play]/[When Attacking] If your opponent has more DON!! cards on their field than
// you, add up to 1 DON!! card from your DON!! deck and rest it.

export const ST10_012_BEPO: EffectSchema = {
  card_id: "ST10-012",
  card_name: "Bepo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_add_don",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<",
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── ST10-013 Eustass"Captain"Kid (Character) — On Play / When Attacking leader buff
// [On Play]/[When Attacking] DON!! −1: Up to 1 of your Leader gains +1000 power until
// the start of your next turn.

export const ST10_013_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "ST10-013",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_leader_buff",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── ST10-014 Wire (Character) — Blocker + DON returned draw/trash
// [Blocker]
// [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, draw
// 1 card and trash 1 card from your hand.

export const ST10_014_WIRE: EffectSchema = {
  card_id: "ST10-014",
  card_name: "Wire",
  card_type: "Character",
  effects: [
    {
      id: "blocker_keyword",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "don_returned_draw_trash",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        once_per_turn: true,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Events (ST10-015, ST10-016)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST10-015 Gum-Gum Giant Sumo Slap (Event) — Counter boost + KO
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this
// battle, and K.O. up to 1 of your opponent's Characters with 2000 power or less.

export const ST10_015_GUM_GUM_GIANT_SUMO_SLAP: EffectSchema = {
  card_id: "ST10-015",
  card_name: "Gum-Gum Giant Sumo Slap",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_ko",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 2000 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── ST10-016 Gum-Gum Kong Gatling (Event) — Main KO + Trigger leader buff
// [Main] K.O. up to 1 of your opponent's Characters with 7000 power or less.
// [Trigger] Up to 1 of your Leader gains +1000 power until the end of your next turn.

export const ST10_016_GUM_GUM_KONG_GATLING: EffectSchema = {
  card_id: "ST10-016",
  card_name: "Gum-Gum Kong Gatling",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 7000 },
          },
        },
      ],
    },
    {
      id: "trigger_leader_buff",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Events (ST10-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST10-017 Punk Vise (Event) — Main rest + add DON + Trigger add DON
// [Main] Rest up to 1 of your opponent's Characters with a cost of 2 or less, and add
// up to 1 DON!! card from your DON!! deck and rest it.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const ST10_017_PUNK_VISE: EffectSchema = {
  card_id: "ST10-017",
  card_name: "Punk Vise",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_and_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "AND",
        },
      ],
    },
    {
      id: "trigger_add_don_active",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST10_SCHEMAS: Record<string, EffectSchema> = {
  "ST10-001": ST10_001_TRAFALGAR_LAW,
  "ST10-002": ST10_002_MONKEY_D_LUFFY,
  "ST10-003": ST10_003_EUSTASS_CAPTAIN_KID,
  "ST10-004": ST10_004_SANJI,
  "ST10-005": ST10_005_JINBE,
  "ST10-006": ST10_006_MONKEY_D_LUFFY,
  "ST10-007": ST10_007_KILLER,
  "ST10-008": ST10_008_SHACHI_AND_PENGUIN,
  "ST10-009": ST10_009_JEAN_BART,
  "ST10-010": ST10_010_TRAFALGAR_LAW,
  "ST10-011": ST10_011_HEAT,
  "ST10-012": ST10_012_BEPO,
  "ST10-013": ST10_013_EUSTASS_CAPTAIN_KID,
  "ST10-014": ST10_014_WIRE,
  "ST10-015": ST10_015_GUM_GUM_GIANT_SUMO_SLAP,
  "ST10-016": ST10_016_GUM_GUM_KONG_GATLING,
  "ST10-017": ST10_017_PUNK_VISE,
};
