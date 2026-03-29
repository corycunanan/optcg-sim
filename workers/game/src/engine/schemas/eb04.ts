/**
 * EB04 Effect Schemas
 *
 * Red (Jewelry Bonney): EB04-001 to EB04-010
 * Green (Neptunians / Minks / Wano): EB04-011 to EB04-020
 * Blue (Alabasta / Navy): EB04-021 to EB04-029
 * Purple (Animal Kingdom Pirates / Foxy Pirates / Kid Pirates): EB04-030 to EB04-041
 * Black (Navy / SWORD / CP): EB04-042 to EB04-050
 * Yellow (Egghead / Revolutionary Army): EB04-051 to EB04-061
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Jewelry Bonney (EB04-001 to EB04-010)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB04-001 Jewelry Bonney (Leader) — Opponent's Turn power boost + Activate Main debuff + life to hand
// [Opponent's Turn] If you have 1 or less Life cards, this Leader gains +2000 power.
// [Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters −1000 power during this turn.
// Then, if you have 2 or more Life cards, you may add 1 card from the top of your Life cards to your hand.

export const EB04_001_JEWELRY_BONNEY: EffectSchema = {
  card_id: "EB04-001",
  card_name: "Jewelry Bonney",
  card_type: "Leader",
  effects: [
    {
      id: "opponent_turn_power_boost",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      zone: "FIELD",
      duration: { type: "WHILE_CONDITION", condition: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 1 } },
      flags: { once_per_turn: false },
    },
    {
      id: "activate_debuff_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
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
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 2,
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB04-002 Jewelry Bonney (Character) — On Play search for Egghead or Straw Hat Crew
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 {Egghead} or {Straw Hat Crew} type card
// other than [Jewelry Bonney] and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const EB04_002_JEWELRY_BONNEY: EffectSchema = {
  card_id: "EB04-002",
  card_name: "Jewelry Bonney",
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
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Egghead", "Straw Hat Crew"],
              exclude_name: "Jewelry Bonney",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── EB04-003 Smoker & Tashigi (Character) — Rush + Opponent's Turn leader base power
// [Rush]
// [Opponent's Turn] Your {Navy} type Leader's base power becomes 7000.

export const EB04_003_SMOKER_AND_TASHIGI: EffectSchema = {
  card_id: "EB04-003",
  card_name: "Smoker & Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "opponent_turn_leader_base_power",
      category: "permanent",
      modifiers: [
        {
          type: "SET_POWER",
          target: {
            type: "YOUR_LEADER",
            filter: { traits: ["Navy"] },
          },
          params: { value: 7000 },
        },
      ],
      zone: "FIELD",
      duration: { type: "WHILE_CONDITION", condition: { type: "SELF_STATE", required_state: "ACTIVE" } },
    },
  ],
};

// ─── EB04-004 Zeff (Character) — When Attacking leader base power becomes 7000
// [When Attacking] Your Leader's base power becomes 7000 until the end of your opponent's next End Phase.

export const EB04_004_ZEFF: EffectSchema = {
  card_id: "EB04-004",
  card_name: "Zeff",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_leader_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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

// ─── EB04-005 Trafalgar Law (Character) — Cannot attack unless opponent has 2+ characters with base power 5000+
// This Character cannot attack unless your opponent has 2 or more Characters with a base power of 5000 or more.

export const EB04_005_TRAFALGAR_LAW: EffectSchema = {
  card_id: "EB04-005",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "cannot_attack_restriction",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          conditional_override: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { base_power_min: 5000 },
            count: { operator: ">=", value: 2 },
          },
        },
      ],
    },
  ],
};

// ─── EB04-006 Moda (Character) — On Play search for Lulucia Kingdom
// [On Play] Look at 7 cards from the top of your deck; reveal up to 1 [Lulucia Kingdom] and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const EB04_006_MODA: EffectSchema = {
  card_id: "EB04-006",
  card_name: "Moda",
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
            look_at: 7,
            pick: { up_to: 1 },
            filter: {
              name: "Lulucia Kingdom",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── EB04-007 Roronoa Zoro (Character) — On Play leader power + Activate Main conditional Rush Character
// [On Play] Your Leader gains +2000 power until the end of your opponent's next End Phase.
// [Activate: Main] [Once Per Turn] If your opponent has a Character with 8000 power or more,
// this Character gains [Rush: Character] during this turn.

export const EB04_007_RORONOA_ZORO: EffectSchema = {
  card_id: "EB04-007",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_leader_power",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "activate_rush_character",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { power_min: 8000 },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH_CHARACTER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB04-008 Distorted Future (Event) — Main conditional power debuff + Counter leader power
// [Main] If you have 2 or less Life cards, give up to 1 of your opponent's Characters −3000 power during this turn.
// [Counter] Your Leader gains +3000 power during this battle.

export const EB04_008_DISTORTED_FUTURE: EffectSchema = {
  card_id: "EB04-008",
  card_name: "Distorted Future",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_leader_power",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── EB04-009 It's My Student's Farewell. I Want It to Be Proper. (Event) — Main give DON + debuff; Counter power boost
// [Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]: Give up to 1 of your opponent's
// Characters −2000 power during this turn.
// [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle.

export const EB04_009_ITS_MY_STUDENTS_FAREWELL: EffectSchema = {
  card_id: "EB04-009",
  card_name: "It's My Student's Farewell. I Want It to Be Proper.",
  card_type: "Event",
  effects: [
    {
      id: "main_don_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
          filter: { name: "Silvers Rayleigh" },
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { exact: 1 },
            filter: { is_active: true },
          },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Silvers Rayleigh" },
          },
          params: { amount: 1 },
        },
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
    {
      id: "counter_power_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { card_type: "CHARACTER" },
                { name: "Silvers Rayleigh" },
              ],
            },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── EB04-010 Lulucia Kingdom (Stage) — Opponent's Turn base cost 1 chars +5000 + On Play set power to 0
// [Opponent's Turn] All of your Characters with a base cost of 1 gain +5000 power.
// [On Play] Set the power of up to 1 of your opponent's Characters to 0 during this turn.

export const EB04_010_LULUCIA_KINGDOM: EffectSchema = {
  card_id: "EB04-010",
  card_name: "Lulucia Kingdom",
  card_type: "Stage",
  effects: [
    {
      id: "opponent_turn_power_boost",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { base_cost_exact: 1 },
          },
          params: { amount: 5000 },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "on_play_set_power_zero",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_POWER_TO_ZERO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Neptunians / Minks / Wano (EB04-011 to EB04-020)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB04-011 Scaled Neptunian (Character) — Rush Character + On Play draw per Neptunian then trash
// [Rush: Character]
// [On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.

export const EB04_011_SCALED_NEPTUNIAN: EffectSchema = {
  card_id: "EB04-011",
  card_name: "Scaled Neptunian",
  card_type: "Character",
  effects: [
    {
      id: "rush_character",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: {
            amount: {
              type: "PER_COUNT",
              source: "MATCHING_CHARACTERS_ON_FIELD",
              multiplier: 1,
            },
          },
          target: {
            filter: { traits: ["Neptunian"] },
          },
        },
        {
          type: "TRASH_FROM_HAND",
          params: {
            amount: {
              type: "PER_COUNT",
              source: "MATCHING_CHARACTERS_ON_FIELD",
              multiplier: 1,
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB04-012 Kikunojo (Character) — Activate Main set Wano leader active if played this turn
// [Activate: Main] [Once Per Turn] If this Character was played on this turn, set your {Land of Wano} type Leader as active.

export const EB04_012_KIKUNOJO: EffectSchema = {
  card_id: "EB04-012",
  card_name: "Kikunojo",
  card_type: "Character",
  effects: [
    {
      id: "activate_set_leader_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "WAS_PLAYED_THIS_TURN",
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "YOUR_LEADER",
            filter: { traits: ["Land of Wano"] },
          },
        },
      ],
    },
  ],
};

// ─── EB04-013 Carrot (Character) — On Play set Minks characters and leader active
// [On Play] If your Leader has the {Minks} type, set up to 2 of your {Minks} type Characters and your Leader as active.

export const EB04_013_CARROT: EffectSchema = {
  card_id: "EB04-013",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Minks" },
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 2 },
            filter: { traits: ["Minks"] },
          },
        },
        {
          type: "SET_ACTIVE",
          target: { type: "YOUR_LEADER" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB04-014 Kozuki Sukiyaki (Character) — Blocker + Activate Main give DON to Wano leader
// [Blocker]
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your {Land of Wano} type Leader.

export const EB04_014_KOZUKI_SUKIYAKI: EffectSchema = {
  card_id: "EB04-014",
  card_name: "Kozuki Sukiyaki",
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
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "YOUR_LEADER",
            filter: { traits: ["Land of Wano"] },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB04-015 Jinbe (Character) — Blocker + On KO play green character
// [Blocker]
// [On K.O.] You may rest 1 of your cards: If your Leader has the {Fish-Man} or {Merfolk} type,
// play up to 1 green Character card with a cost of 6 or less from your hand.

export const EB04_015_JINBE: EffectSchema = {
  card_id: "EB04-015",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_play",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [
        {
          type: "REST_CARDS",
          amount: 1,
        },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "GREEN",
              cost_max: 6,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB04-016 Bird Neptunian (Character) — Activate Main set DON active + restriction; When Attacking rest opponent
// [Activate: Main] Set up to 1 of your DON!! cards as active. Then, you cannot set DON!! cards as active
// using Character effects during this turn.
// [When Attacking] If you have 3 or more {Neptunian} type Characters, rest up to 1 of your opponent's
// Characters with a cost of 8 or less.

export const EB04_016_BIRD_NEPTUNIAN: EffectSchema = {
  card_id: "EB04-016",
  card_name: "Bird Neptunian",
  card_type: "Character",
  effects: [
    {
      id: "activate_set_don_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_SET_DON_ACTIVE",
            scope: {
              cause: "BY_CHARACTER_EFFECT",
            },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "when_attacking_rest_opponent",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["Neptunian"] },
        count: { operator: ">=", value: 3 },
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
        },
      ],
    },
  ],
};

// ─── EB04-017 Mystoms (Character) — Your Turn permanent cost reduction + On Play play Minks character
// [Your Turn] If you have 3 or more {Minks} type Characters, give all of your opponent's Characters −1 cost.
// [On Play] If your Leader has the {Minks} type, play up to 1 {Minks} type Character card with a cost of 5 or less from your hand.

export const EB04_017_MYSTOMS: EffectSchema = {
  card_id: "EB04-017",
  card_name: "Mystoms",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_cost_reduction",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["Minks"] },
        count: { operator: ">=", value: 3 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -1 },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "on_play_play_minks",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Minks" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Minks"],
              cost_max: 5,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB04-018 Megalo (Character) — On Play rest self to KO rested opponent
// [On Play] You may rest this Character: K.O. up to 1 of your opponent's rested Characters with 8000 power or less.

export const EB04_018_MEGALO: EffectSchema = {
  card_id: "EB04-018",
  card_name: "Megalo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              is_rested: true,
              power_max: 8000,
            },
          },
        },
      ],
    },
  ],
};

// ─── EB04-019 Eleclaw (Event) — Main rest cost + Minks leader cost reduction; Counter power boost
// [Main] You may rest 1 of your cards: If your Leader has the {Minks} type, give up to 1 of your opponent's
// Characters −3 cost during this turn.
// [Counter] Up to 1 of your {Minks} type Leader or Character cards gains +3000 power during this battle.

export const EB04_019_ELECLAW: EffectSchema = {
  card_id: "EB04-019",
  card_name: "Eleclaw",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_reduction",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_CARDS", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Minks" },
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_power_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Minks"] },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── EB04-020 Shark Brick Fist (Event) — Counter Fish-Man power boost + set active; Trigger rest opponent
// [Counter] Up to 1 of your {Fish-Man} type Leader or Character cards gains +3000 power during this battle.
// Then, set up to 1 of your {Fish-Man} type Characters as active.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const EB04_020_SHARK_BRICK_FIST: EffectSchema = {
  card_id: "EB04-020",
  card_name: "Shark Brick Fist",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_active",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Fish-Man"] },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Fish-Man"] },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_rest_opponent",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_REST",
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Alabasta / Navy (EB04-021 to EB04-029)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB04-021 Igaram (Character) — On Play conditional draw + Activate Main trash to give DON
// [On Play] If your Leader is [Nefeltari Vivi], draw 2 cards and trash 1 card from your hand.
// [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: Give up to 1 rested DON!! card
// to your Leader or 1 of your Characters.

export const EB04_021_IGARAM: EffectSchema = {
  card_id: "EB04-021",
  card_name: "Igaram",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nefeltari Vivi" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
  ],
};

// ─── EB04-022 Issho (Character) — On Play trash 2 to force opponent place 2; DON x1 When Attacking trash to debuff
// [On Play] You may trash 2 cards from your hand: If your opponent has 6 or more cards in their hand,
// your opponent places 2 cards from their hand at the bottom of their deck in any order.
// [DON!! x1] [When Attacking] You may trash 1 card from your hand: Give up to 1 of your opponent's Characters
// −2000 power during this turn.

export const EB04_022_ISSHO: EffectSchema = {
  card_id: "EB04-022",
  card_name: "Issho",
  card_type: "Character",
  effects: [
    {
      id: "on_play_force_place",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      flags: { optional: true },
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "PLACE_HAND_TO_DECK",
              params: { amount: 2, position: "BOTTOM" },
            },
          },
        },
      ],
    },
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
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

// ─── EB04-023 Chaka & Pell (Character) — Double Attack + On Play leader power cost for draw
// [Double Attack]
// [On Play] You may give your active Leader −5000 power during this turn: Draw 2 cards.

export const EB04_023_CHAKA_AND_PELL: EffectSchema = {
  card_id: "EB04-023",
  card_name: "Chaka & Pell",
  card_type: "Character",
  effects: [
    {
      id: "double_attack",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LEADER_POWER_REDUCTION", amount: 5000 }],
      flags: { optional: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── EB04-024 Terracotta (Character) — Activate Main rest self + trash to grant Unblockable
// [Activate: Main] You may rest this Character and trash 1 card from your hand: Up to 1 of your
// {Alabasta} type Characters gains [Unblockable] during this turn.

export const EB04_024_TERRACOTTA: EffectSchema = {
  card_id: "EB04-024",
  card_name: "Terracotta",
  card_type: "Character",
  effects: [
    {
      id: "activate_grant_unblockable",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Alabasta"] },
          },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB04-025 Nefeltari Vivi (Character) — On Play play Alabasta character + opponent places card
// [On Play] Play up to 1 {Alabasta} type Character card with a cost of 8 or less other than [Nefeltari Vivi]
// from your hand. Then, your opponent places 1 card from their hand at the bottom of their deck.

export const EB04_025_NEFELTARI_VIVI: EffectSchema = {
  card_id: "EB04-025",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_and_opponent_place",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Alabasta"],
              cost_max: 8,
              exclude_name: "Nefeltari Vivi",
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "PLACE_HAND_TO_DECK",
              params: { amount: 1, position: "BOTTOM" },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB04-026 Bluegrass (Character) — On Play bottom deck opponent's low-cost character; When Attacking draw+trash
// [On Play] Place up to 1 of your opponent's Characters with a cost of 1 or less at the bottom of the owner's deck.
// [When Attacking] Draw 1 card and trash 1 card from your hand.

export const EB04_026_BLUEGRASS: EffectSchema = {
  card_id: "EB04-026",
  card_name: "Bluegrass",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bottom_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB04-027 Boa Hancock (Character) — On Play draw 2 trash 1; Trigger play character with trigger
// [On Play] Draw 2 cards and trash 1 card from your hand.
// [Trigger] Play up to 1 Character card with 5000 power or less and a [Trigger] from your hand.

export const EB04_027_BOA_HANCOCK: EffectSchema = {
  card_id: "EB04-027",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
    {
      id: "trigger_play_character",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              power_max: 5000,
              has_trigger: true,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB04-028 Ice Time (Event) — Main trash to prohibit attack; Trigger return character
// [Main] You may trash 1 card from your hand: If your Leader has the {Navy} type, up to 2 of your opponent's
// Characters with 10000 power or less cannot attack until the end of your opponent's next End Phase.
// [Trigger] Return up to 1 Character with a cost of 5 or less to the owner's hand.

export const EB04_028_ICE_TIME: EffectSchema = {
  card_id: "EB04-028",
  card_name: "Ice Time",
  card_type: "Event",
  effects: [
    {
      id: "main_prohibit_attack",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { power_max: 10000 },
          },
          params: {
            prohibition_type: "CANNOT_ATTACK",
          },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "trigger_return_character",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "ANY",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── EB04-029 I Heard the Sound...of a Lady's Teardrops Falling (Event) — Main search + Counter power
// [Main] If your Leader is [Sanji], look at 3 cards from the top of your deck; reveal up to 1 [Sanji] or Event card
// and add it to your hand. Then, trash the rest.
// [Counter] You may trash 1 card from your hand: Up to 1 of your [Sanji] cards gains +4000 power during this battle.

export const EB04_029_I_HEARD_THE_SOUND: EffectSchema = {
  card_id: "EB04-029",
  card_name: "I Heard the Sound...of a Lady's Teardrops Falling",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
      },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Sanji" },
                { card_type: "EVENT" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "counter_power_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Sanji" },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Animal Kingdom Pirates / Foxy Pirates / Kid Pirates (EB04-030 to EB04-041)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB04-030 Kaido (Character) — Replacement KO + On Play DON−2 Rush + rest opponent
// If this Character would be K.O.'d, you may return 1 DON!! card from your field to your DON!! deck instead.
// [On Play] DON!! −2: If your Leader has the {Animal Kingdom Pirates} type, this Character gains [Rush] during this turn.
// Then, rest up to 1 of your opponent's Characters with a cost of 7 or less.

export const EB04_030_KAIDO: EffectSchema = {
  card_id: "EB04-030",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "replacement_ko",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [
        {
          type: "RETURN_DON_TO_DECK",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_play_rush_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB04-031 King (Character) — Replacement KO + Activate Main add DON active + DON rested
// If this Character would be K.O.'d, you may return 1 DON!! card from your field to your DON!! deck instead.
// [Activate: Main] [Once Per Turn] If your Leader has the {Animal Kingdom Pirates} type and you have no other
// [King] Characters, add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 1 additional
// DON!! card and rest it.

export const EB04_031_KING: EffectSchema = {
  card_id: "EB04-031",
  card_name: "King",
  card_type: "Character",
  effects: [
    {
      id: "replacement_ko",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [
        {
          type: "RETURN_DON_TO_DECK",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Animal Kingdom Pirates" },
          },
          {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { name: "King" },
              count: { operator: ">=", value: 2 },
              exclude_self: true,
            },
          },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB04-032 Queen (Character) — On Play trash Animal Kingdom card to draw 2; Activate Main rest DON to add DON
// [On Play] You may trash 1 {Animal Kingdom Pirates} type card from your hand: Draw 2 cards.
// [Activate: Main] [Once Per Turn] You may rest 2 of your DON!! cards: If your Leader has the {Animal Kingdom Pirates}
// type, add up to 1 DON!! card from your DON!! deck and rest it.

export const EB04_032_QUEEN: EffectSchema = {
  card_id: "EB04-032",
  card_name: "Queen",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits: ["Animal Kingdom Pirates"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 2 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
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

// ─── EB04-033 Groggy Monsters (Character) — On Play DON−1 KO opponent by base power
// [On Play] DON!! −1: If you have 3 or more {Foxy Pirates} type Characters, K.O. up to 1 of your opponent's
// Characters with 6000 base power or less.

export const EB04_033_GROGGY_MONSTERS: EffectSchema = {
  card_id: "EB04-033",
  card_name: "Groggy Monsters",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { traits: ["Foxy Pirates"] },
        count: { operator: ">=", value: 3 },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 6000 },
          },
        },
      ],
    },
  ],
};

// ─── EB04-034 Charlotte Pudding (Character) — Blocker + On Opponent Attack trash to boost power
// [Blocker]
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: If you have 4 or more Events
// in your trash, up to 1 of your Leader or Character cards gains +2000 power during this battle.

export const EB04_034_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "EB04-034",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_opponent_attack_boost",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "CARD_TYPE_IN_ZONE",
        controller: "SELF",
        card_type: "EVENT",
        zone: "TRASH",
        operator: ">=",
        value: 4,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── EB04-035 Hitokiri Kamazo (Character) — Blocker + Your Turn DON returned trigger add DON rested
// [Blocker]
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck,
// if your Leader has the {Kid Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.

export const EB04_035_HITOKIRI_KAMAZO: EffectSchema = {
  card_id: "EB04-035",
  card_name: "Hitokiri Kamazo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kid Pirates" },
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

// ─── EB04-036 Foxy (Character) — On Play DON−1 draw+trash+rest opponent; Activate Main add DON rested
// [On Play] DON!! −1: If your Leader has the {Foxy Pirates} type, draw 2 cards and trash 1 card from your hand.
// Then, rest up to 1 of your opponent's Characters with a cost of 9 or less.
// [Activate: Main] [Once Per Turn] Add up to 1 DON!! card from your DON!! deck and rest it.

export const EB04_036_FOXY: EffectSchema = {
  card_id: "EB04-036",
  card_name: "Foxy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Foxy Pirates" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 9 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "activate_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── EB04-037 Porche (Character) — On Play search for Foxy Pirates card
// [On Play] If your Leader has the {Foxy Pirates} type, look at 5 cards from the top of your deck;
// reveal up to 1 {Foxy Pirates} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const EB04_037_PORCHE: EffectSchema = {
  card_id: "EB04-037",
  card_name: "Porche",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Foxy Pirates" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Foxy Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── EB04-038 Rosinante & Law (Character) — Name alias + Blocker + On Play DON comparative draw + add DON active
// Under the rules of this game, also treat this card's name as [Trafalgar Law] and [Donquixote Rosinante].
// [Blocker]
// [On Play] If the number of DON!! cards on your field is equal to or less than the number on your opponent's field,
// draw 1 card. Then, add up to 1 DON!! card from your DON!! deck and set it as active.

export const EB04_038_ROSINANTE_AND_LAW: EffectSchema = {
  card_id: "EB04-038",
  card_name: "Rosinante & Law",
  card_type: "Character",
  rule_modifications: [
    {
      rule_type: "NAME_ALIAS",
      aliases: ["Trafalgar Law", "Donquixote Rosinante"],
    },
  ],
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
          conditions: {
            type: "COMPARATIVE",
            metric: "DON_FIELD_COUNT",
            operator: "<=",
          },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB04-039 Eustass"Captain"Kid (Character) — On Play add DON active + Activate Main trash self to play Kid Pirates
// [On Play] Add up to 1 DON!! card from your DON!! deck and set it as active.
// [Activate: Main] You may trash this Character: Play up to 1 {Kid Pirates} type Character card with a cost of 5
// or less from your hand.

export const EB04_039_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "EB04-039",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
    {
      id: "activate_trash_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Kid Pirates"],
              cost_max: 5,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB04-040 Flame Dragon Torch (Event) — Main rest 6 DON to boost Kaido + rest opponent; Counter DON−1 leader power
// [Main] You may rest 6 of your DON!! cards: Up to 1 of your [Kaido] cards gains +3000 power during this turn.
// Then, rest up to 1 of your opponent's Characters.
// [Counter] DON!! −1: Your Leader gains +4000 power during this battle.

export const EB04_040_FLAME_DRAGON_TORCH: EffectSchema = {
  card_id: "EB04-040",
  card_name: "Flame Dragon Torch",
  card_type: "Event",
  effects: [
    {
      id: "main_boost_rest",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Kaido" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "counter_leader_power",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── EB04-041 Stealth Black (Event) — Main play Sanji from hand/trash + Trigger draw/trash
// [Main] If your Leader is [Sanji] and you have 4 or more DON!! cards on your field, play up to 1 [Sanji]
// with 6000 power or less from your hand or trash.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const EB04_041_STEALTH_BLACK: EffectSchema = {
  card_id: "EB04-041",
  card_name: "Stealth Black",
  card_type: "Event",
  effects: [
    {
      id: "main_play_sanji",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Sanji" },
          },
          {
            type: "DON_FIELD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 4,
          },
        ],
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              name: "Sanji",
              power_max: 6000,
            },
            source_zone: ["HAND", "TRASH"],
          },
          params: { source_zone: "HAND_OR_TRASH", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Navy / SWORD / CP (EB04-042 to EB04-050)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB04-042 Alpha (Character) — On Play mill 3 to reduce opponent cost
// [On Play] You may trash 3 cards from the top of your deck: Give up to 1 of your opponent's Characters −1 cost
// during this turn.

export const EB04_042_ALPHA: EffectSchema = {
  card_id: "EB04-042",
  card_name: "Alpha",
  card_type: "Character",
  effects: [
    {
      id: "on_play_mill_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
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
    },
  ],
};

// ─── EB04-043 Kaku (Character) — Once Per Turn replacement for black character KO + On Play mill 2
// [Once Per Turn] If your black Character with a base cost of 5 or less would be K.O.'d by your opponent's effect,
// you may place 3 cards from your trash at the bottom of your deck in any order instead.
// [On Play] Trash 2 cards from the top of your deck.

export const EB04_043_KAKU: EffectSchema = {
  card_id: "EB04-043",
  card_name: "Kaku",
  card_type: "Character",
  effects: [
    {
      id: "replacement_protect_character",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          color: "BLACK",
          base_cost_max: 5,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "PLACE_HAND_TO_DECK",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { exact: 3 },
          },
          params: { position: "BOTTOM" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "on_play_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── EB04-044 Koby (Character) — Replacement removal + Your Turn draw on opponent KO
// [Once Per Turn] If your Leader's type includes "Navy" and this Character would be removed from the field,
// you may trash 1 card from your hand instead.
// [Your Turn] [Once Per Turn] When your opponent's Character is K.O.'d, draw 1 card.

export const EB04_044_KOBY: EffectSchema = {
  card_id: "EB04-044",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "replacement_removal",
      category: "replacement",
      replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Navy" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "your_turn_draw_on_opponent_ko",
      category: "auto",
      trigger: {
        event: "OPPONENT_CHARACTER_KO",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB04-045 Ginny (Character) — Activate Main rest self for conditional power boost
// [Activate: Main] You may rest this Character: If there are 2 or more Characters with a cost of 8 or more,
// up to 1 of your {Revolutionary Army} type Leader or Character cards gains +1000 power during this turn.

export const EB04_045_GINNY: EffectSchema = {
  card_id: "EB04-045",
  card_name: "Ginny",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { cost_min: 8 },
        count: { operator: ">=", value: 2 },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB04-046 Doll (Character) — Blocker + Opponent's Turn Navy characters gain +2 cost
// [Blocker]
// [Opponent's Turn] All of your {Navy} type Characters gain +2 cost.

export const EB04_046_DOLL: EffectSchema = {
  card_id: "EB04-046",
  card_name: "Doll",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "opponent_turn_cost_boost",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits: ["Navy"] },
          },
          params: { amount: 2 },
        },
      ],
      zone: "FIELD",
    },
  ],
};

// ─── EB04-047 Helmeppo (Character) — Activate Main trash self to play SWORD character
// [Activate: Main] You may trash this Character: Play up to 1 {SWORD} type Character card with a cost of 3
// or less other than [Helmeppo] from your hand or trash.

export const EB04_047_HELMEPPO: EffectSchema = {
  card_id: "EB04-047",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["SWORD"],
              cost_max: 3,
              exclude_name: "Helmeppo",
            },
            source_zone: ["HAND", "TRASH"],
          },
          params: { source_zone: "HAND_OR_TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB04-048 Rob Lucci (Character) — Permanent power+cost per 5 trash cards + On Play trash character to draw
// If your Leader's type includes "CP", this Character gains +1000 power and +2 cost for every 5 cards in your trash.
// [On Play] You may trash 1 of your Characters: Draw 1 card.

export const EB04_048_ROB_LUCCI: EffectSchema = {
  card_id: "EB04-048",
  card_name: "Rob Lucci",
  card_type: "Character",
  effects: [
    {
      id: "permanent_power_cost_scaling",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "CP" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: 1000,
              divisor: 5,
            },
          },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: 2,
              divisor: 5,
            },
          },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_OWN_CHARACTER", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB04-049 Finger Pistol Yellow Lotus (Event) — Main mill to KO; Trigger reuse main
// [Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with
// a base cost of 5 or less.
// [Trigger] Activate this card's [Main] effect.

export const EB04_049_FINGER_PISTOL_YELLOW_LOTUS: EffectSchema = {
  card_id: "EB04-049",
  card_name: "Finger Pistol Yellow Lotus",
  card_type: "Event",
  effects: [
    {
      id: "main_mill_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 5 },
          },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "MAIN_EVENT" },
        },
      ],
    },
  ],
};

// ─── EB04-050 I'll Whip You Into Shape. ♡ (Event) — Main grant CAN_ATTACK_ACTIVE; Counter leader power
// [Main] Up to 1 of your {SWORD} type Leader or Character cards can also attack active Characters during this turn.
// [Counter] Your Leader gains +3000 power during this battle.

export const EB04_050_ILL_WHIP_YOU_INTO_SHAPE: EffectSchema = {
  card_id: "EB04-050",
  card_name: "I'll Whip You Into Shape. \u2661",
  card_type: "Event",
  effects: [
    {
      id: "main_grant_attack_active",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["SWORD"] },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_leader_power",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Egghead / Revolutionary Army (EB04-051 to EB04-061)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB04-051 Emet (Character) — Cannot attack unless 12000+ base power exists; Trigger debuff + play self
// This Character cannot attack unless there is a Character with 12000 base power or more.
// [Trigger] Give all of your opponent's Characters −3000 power during this turn. Then, if you have 0 Life cards, play this card.

export const EB04_051_EMET: EffectSchema = {
  card_id: "EB04-051",
  card_name: "Emet",
  card_type: "Character",
  effects: [
    {
      id: "cannot_attack_restriction",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          conditional_override: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { base_power_min: 12000 },
            count: { operator: ">=", value: 1 },
          },
        },
      ],
    },
    {
      id: "trigger_debuff_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "PLAY_SELF",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "==",
            value: 0,
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB04-052 Sanji (Character) — When Attacking copy opponent leader power; On KO play yellow character
// [When Attacking] This Character's base power becomes the same as your opponent's Leader during this turn.
// [On K.O.] If you have 2 or less Life cards, play up to 1 yellow Character card with 6000 power or less from your hand.

export const EB04_052_SANJI: EffectSchema = {
  card_id: "EB04-052",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_copy_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "COPY_POWER",
          target: { type: "SELF" },
          params: { source: "OPPONENT_LEADER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "on_ko_play_character",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              color: "YELLOW",
              power_max: 6000,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB04-053 Sentomaru (Character) — Blocker + On Block conditional draw
// [Blocker]
// [On Block] If you have 2 or less Life cards, draw 1 card.

export const EB04_053_SENTOMARU: EffectSchema = {
  card_id: "EB04-053",
  card_name: "Sentomaru",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_draw",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB04-054 Bartholomew Kuma (Character) — On Play add to life; On KO opponent life to hand
// [On Play] If you have 2 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards.
// [On K.O.] Add up to 1 card from the top of your opponent's Life cards to the owner's hand.

export const EB04_054_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "EB04-054",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "on_ko_opponent_life_to_hand",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "LIFE_TO_HAND",
          target: {
            type: "OPPONENT_LIFE",
            count: { up_to: 1 },
          },
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── EB04-055 Bartholomew Kuma (Character) — On KO play Revolutionary Army character; Trigger conditional play self
// [On K.O.] Play up to 1 {Revolutionary Army} type Character card with a cost of 4 or less from your hand.
// [Trigger] If your Leader has the {Revolutionary Army} type and you and your opponent have a total of 5 or less
// Life cards, play this card.

export const EB04_055_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "EB04-055",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_character",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Revolutionary Army"],
              cost_max: 4,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Revolutionary Army" },
          },
          {
            type: "COMBINED_TOTAL",
            metric: "LIFE_COUNT",
            operator: "<=",
            value: 5,
          },
        ],
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── EB04-056 Pacifista (Character) — Conditional Blocker if Jewelry Bonney on field and 0 life
// If you have [Jewelry Bonney] and you have 0 Life cards, this Character gains [Blocker].

export const EB04_056_PACIFISTA: EffectSchema = {
  card_id: "EB04-056",
  card_name: "Pacifista",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { name: "Jewelry Bonney" },
            count: { operator: ">=", value: 1 },
          },
          {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "==",
            value: 0,
          },
        ],
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
      zone: "FIELD",
    },
  ],
};

// ─── EB04-057 Vegapunk (Character) — Permanent cannot be removed + DON x1 Blocker
// If you have 2 or less Life cards, all of your yellow {Scientist} type Characters cannot be removed
// from the field by your opponent's effects.
// [DON!! x1] This Character gains [Blocker].

export const EB04_057_VEGAPUNK: EffectSchema = {
  card_id: "EB04-057",
  card_name: "Vegapunk",
  card_type: "Character",
  effects: [
    {
      id: "permanent_cannot_be_removed",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: {
              color: "YELLOW",
              traits: ["Scientist"],
            },
          },
          scope: {
            cause: "BY_OPPONENT_EFFECT",
          },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "don_blocker",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
      },
      zone: "FIELD",
    },
  ],
};

// ─── EB04-058 Borsalino (Character) — Blocker + On Play add to life
// [Blocker]
// [On Play] If you have 2 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards.

export const EB04_058_BORSALINO: EffectSchema = {
  card_id: "EB04-058",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_add_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── EB04-059 Black Rope Dragon Twister (Event) — Main life face-up cost to KO two characters
// [Main] You may turn 1 card from the top of your Life cards face-up: If you have less Characters than your opponent,
// K.O. up to 1 of your opponent's Characters with a cost of 6 or less and up to 1 of your opponent's Characters
// with a cost of 5 or less.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const EB04_059_BLACK_ROPE_DRAGON_TWISTER: EffectSchema = {
  card_id: "EB04-059",
  card_name: "Black Rope Dragon Twister",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_two",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "TURN_LIFE_FACE_UP", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "CHARACTER_COUNT",
        operator: "<",
      },
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
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          chain: "AND",
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB04-060 Gum-Gum Hawk Gatling (Event) — Main life to hand cost + add Egghead to life + debuff; Trigger draw+trash
// [Main] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 {Egghead} type
// Character card from your hand to the top of your Life cards face-up. Then, give up to 1 of your opponent's
// Characters −1000 power during this turn.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const EB04_060_GUM_GUM_HAWK_GATLING: EffectSchema = {
  card_id: "EB04-060",
  card_name: "Gum-Gum Hawk Gatling",
  card_type: "Event",
  effects: [
    {
      id: "main_life_swap_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "LIFE_TO_HAND",
          amount: 1,
          position: "TOP_OR_BOTTOM",
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Egghead"],
              card_type: "CHARACTER",
            },
          },
          params: { face: "UP", position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB04-061 Monkey.D.Luffy (Character) — Hand cost reduction + On Play trash to leader power + Blocker
// If you have 1 or less Life cards, give this card in your hand −1 cost.
// [On Play] You may trash 1 card from your hand: Your Leader gains +2000 power until the end of your opponent's
// next End Phase. Then, this Character gains [Blocker] until the end of your opponent's next End Phase.

export const EB04_061_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "EB04-061",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: -1 },
        },
      ],
      zone: "HAND",
    },
    {
      id: "on_play_power_blocker",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const EB04_SCHEMAS: Record<string, EffectSchema> = {
  "EB04-001": EB04_001_JEWELRY_BONNEY,
  "EB04-002": EB04_002_JEWELRY_BONNEY,
  "EB04-003": EB04_003_SMOKER_AND_TASHIGI,
  "EB04-004": EB04_004_ZEFF,
  "EB04-005": EB04_005_TRAFALGAR_LAW,
  "EB04-006": EB04_006_MODA,
  "EB04-007": EB04_007_RORONOA_ZORO,
  "EB04-008": EB04_008_DISTORTED_FUTURE,
  "EB04-009": EB04_009_ITS_MY_STUDENTS_FAREWELL,
  "EB04-010": EB04_010_LULUCIA_KINGDOM,
  "EB04-011": EB04_011_SCALED_NEPTUNIAN,
  "EB04-012": EB04_012_KIKUNOJO,
  "EB04-013": EB04_013_CARROT,
  "EB04-014": EB04_014_KOZUKI_SUKIYAKI,
  "EB04-015": EB04_015_JINBE,
  "EB04-016": EB04_016_BIRD_NEPTUNIAN,
  "EB04-017": EB04_017_MYSTOMS,
  "EB04-018": EB04_018_MEGALO,
  "EB04-019": EB04_019_ELECLAW,
  "EB04-020": EB04_020_SHARK_BRICK_FIST,
  "EB04-021": EB04_021_IGARAM,
  "EB04-022": EB04_022_ISSHO,
  "EB04-023": EB04_023_CHAKA_AND_PELL,
  "EB04-024": EB04_024_TERRACOTTA,
  "EB04-025": EB04_025_NEFELTARI_VIVI,
  "EB04-026": EB04_026_BLUEGRASS,
  "EB04-027": EB04_027_BOA_HANCOCK,
  "EB04-028": EB04_028_ICE_TIME,
  "EB04-029": EB04_029_I_HEARD_THE_SOUND,
  "EB04-030": EB04_030_KAIDO,
  "EB04-031": EB04_031_KING,
  "EB04-032": EB04_032_QUEEN,
  "EB04-033": EB04_033_GROGGY_MONSTERS,
  "EB04-034": EB04_034_CHARLOTTE_PUDDING,
  "EB04-035": EB04_035_HITOKIRI_KAMAZO,
  "EB04-036": EB04_036_FOXY,
  "EB04-037": EB04_037_PORCHE,
  "EB04-038": EB04_038_ROSINANTE_AND_LAW,
  "EB04-039": EB04_039_EUSTASS_CAPTAIN_KID,
  "EB04-040": EB04_040_FLAME_DRAGON_TORCH,
  "EB04-041": EB04_041_STEALTH_BLACK,
  "EB04-042": EB04_042_ALPHA,
  "EB04-043": EB04_043_KAKU,
  "EB04-044": EB04_044_KOBY,
  "EB04-045": EB04_045_GINNY,
  "EB04-046": EB04_046_DOLL,
  "EB04-047": EB04_047_HELMEPPO,
  "EB04-048": EB04_048_ROB_LUCCI,
  "EB04-049": EB04_049_FINGER_PISTOL_YELLOW_LOTUS,
  "EB04-050": EB04_050_ILL_WHIP_YOU_INTO_SHAPE,
  "EB04-051": EB04_051_EMET,
  "EB04-052": EB04_052_SANJI,
  "EB04-053": EB04_053_SENTOMARU,
  "EB04-054": EB04_054_BARTHOLOMEW_KUMA,
  "EB04-055": EB04_055_BARTHOLOMEW_KUMA,
  "EB04-056": EB04_056_PACIFISTA,
  "EB04-057": EB04_057_VEGAPUNK,
  "EB04-058": EB04_058_BORSALINO,
  "EB04-059": EB04_059_BLACK_ROPE_DRAGON_TWISTER,
  "EB04-060": EB04_060_GUM_GUM_HAWK_GATLING,
  "EB04-061": EB04_061_MONKEY_D_LUFFY,
};
