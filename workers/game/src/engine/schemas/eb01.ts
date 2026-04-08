/**
 * EB01 Effect Schemas — Memorial Collection
 *
 * Red (Land of Wano / Whitebeard): EB01-001 to EB01-011
 * Green (Supernovas / Donquixote): EB01-012 to EB01-020
 * Blue (Impel Down / Baroque Works): EB01-021 to EB01-030
 * Purple (Water Seven / Baroque Works / Impel Down): EB01-031 to EB01-039
 * Black (Dressrosa / CP): EB01-040 to EB01-051
 * Yellow (Big Mom / Skypiea): EB01-052 to EB01-061
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Land of Wano / Whitebeard (EB01-001 to EB01-011)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB01-001 Kouzuki Oden (Leader) — counter grant rule + DONx1 when attacking conditional power
// All of your {Land of Wano} type Character cards without a Counter have a +1000 Counter, according to the rules.
// [DON!! x1] [When Attacking] If you have a {Land of Wano} type Character with a cost of 5 or more,
// this Leader gains +1000 power until the start of your next turn.

export const EB01_001_KOUZUKI_ODEN: EffectSchema = {
  card_id: "EB01-001",
  card_name: "Kouzuki Oden",
  card_type: "Leader",
  effects: [
    {
      id: "counter_grant_rule",
      category: "rule_modification",
      rule: {
        rule_type: "COUNTER_GRANT",
        value: 1000,
        filter: {
          traits: ["Land of Wano"],
          card_type: "CHARACTER",
          has_counter: false,
        },
      },
    },
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          card_type: "CHARACTER",
          traits: ["Land of Wano"],
          cost_min: 5,
        },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── EB01-002 Izo (Character) — on play give DON + on opponent attack trash from hand debuff
// [On Play] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand:
// If your Leader has the {Land of Wano} or {Whitebeard Pirates} type,
// give up to 1 of your opponent's Leader or Character cards −2000 power during this turn.

export const EB01_002_IZO: EffectSchema = {
  card_id: "EB01-002",
  card_name: "Izo",
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
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
    {
      id: "on_opponent_attack_debuff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Land of Wano" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Whitebeard Pirates" },
          },
        ],
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-003 Kid & Killer (Character) — Rush + when attacking conditional power
// [Rush] (This card can attack on the turn in which it is played.)
// [When Attacking] If your opponent has 2 or less Life cards,
// this Character gains +2000 power during this turn.

export const EB01_003_KID_AND_KILLER: EffectSchema = {
  card_id: "EB01-003",
  card_name: "Kid & Killer",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 2,
      },
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

// ─── EB01-004 Koza (Character) — when attacking leader power cost for opponent debuff
// [When Attacking] You may give your 1 active Leader −5000 power during this turn:
// Give up to 1 of your opponent's Characters −3000 power during this turn.

export const EB01_004_KOZA: EffectSchema = {
  card_id: "EB01-004",
  card_name: "Koza",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "LEADER_POWER_REDUCTION", amount: 5000 }],
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
      flags: { optional: true },
    },
  ],
};

// ─── EB01-006 Tony Tony.Chopper (Character) — Blocker + DONx2 when attacking debuff
// [Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)
// [DON!! x2] [When Attacking] Give up to 1 of your opponent's Characters −3000 power during this turn.

export const EB01_006_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "EB01-006",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
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
  ],
};

// ─── EB01-007 Yamato (Character) — Activate Main once per turn give DON
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const EB01_007_YAMATO: EffectSchema = {
  card_id: "EB01-007",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── EB01-008 LittleOars Jr. (Character) — replacement: would be KO'd by effect, trash Event/Stage instead
// [Once Per Turn] If this Character would be K.O.'d by an effect,
// you may trash 1 Event or Stage card from your hand instead.

export const EB01_008_LITTLEOARS_JR: EffectSchema = {
  card_id: "EB01-008",
  card_name: "LittleOars Jr.",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        cause_filter: { by: "ANY_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
            filter: { card_type: ["EVENT", "STAGE"] },
          },
          params: { amount: 1 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── EB01-009 Just Shut Up and Come with Us!!!! (Event) — counter search and play Animal ≤3
// [Counter] Look at 5 cards from the top of your deck and play up to 1 {Animal} type
// Character card with a cost of 3 or less. Then, place the rest at the bottom of your deck in any order.

export const EB01_009_JUST_SHUT_UP_AND_COME_WITH_US: EffectSchema = {
  card_id: "EB01-009",
  card_name: "Just Shut Up and Come with Us!!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_search_and_play",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: {
              card_type: "CHARACTER",
              traits: ["Animal"],
              cost_max: 3,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── EB01-010 There's No Way You Could Defeat Me!! (Event) — counter KO base power ≤6000 + trigger KO ≤5000
// [Counter] K.O. up to 1 of your opponent's Characters with 6000 base power or less.
// [Trigger] K.O. up to 1 of your opponent's Characters with 5000 base power or less.

export const EB01_010_THERES_NO_WAY_YOU_COULD_DEFEAT_ME: EffectSchema = {
  card_id: "EB01-010",
  card_name: "There's No Way You Could Defeat Me!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_ko",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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
    {
      id: "trigger_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 5000 },
          },
        },
      ],
    },
  ],
};

// ─── EB01-011 Mini-Merry (Stage) — Activate Main rest self + place 1000 base power char to deck: draw
// [Activate: Main] You may rest this card and place 1 of your Characters with 1000 base power
// at the bottom of your deck: Draw 1 card.

export const EB01_011_MINI_MERRY: EffectSchema = {
  card_id: "EB01-011",
  card_name: "Mini-Merry",
  card_type: "Stage",
  effects: [
    {
      id: "activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          amount: 1,
          position: "BOTTOM",
          filter: { base_power_exact: 1000 },
        },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Supernovas / Donquixote (EB01-012 to EB01-020)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB01-012 Cavendish (Character) — on play/when attacking set DON active if Supernovas leader
// [On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other
// [Cavendish] Characters, set up to 2 of your DON!! cards as active.

export const EB01_012_CAVENDISH: EffectSchema = {
  card_id: "EB01-012",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_set_don",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Supernovas" },
          },
          {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { name: "Cavendish", exclude_self: true },
            },
          },
        ],
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── EB01-013 Kouzuki Hiyori (Character) — Activate Main trash self: play Land of Wano ≤5 then draw
// [Activate: Main] You may trash this Character: Play up to 1 {Land of Wano} type Character card
// with a cost of 5 or less other than [Kouzuki Hiyori] from your hand. Then, draw 1 card.

export const EB01_013_KOUZUKI_HIYORI: EffectSchema = {
  card_id: "EB01-013",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_and_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Land of Wano"],
              cost_max: 5,
              exclude_name: "Kouzuki Hiyori",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-014 Sanji (Character) — DONx1 your turn permanent power per 3 rested DON
// [DON!! x1] [Your Turn] This Character gains +1000 power for every 3 of your rested DON!! cards.

export const EB01_014_SANJI: EffectSchema = {
  card_id: "EB01-014",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "permanent_power_per_rested_don",
      category: "permanent",
      conditions: {
        type: "ACTIVE_DON_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "RESTED_CARD_COUNT",
              multiplier: 1000,
              divisor: 3,
            },
          },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
  ],
};

// ─── EB01-015 Scratchmen Apoo (Character) — on play rest opponent character ≤2
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 2 or less.

export const EB01_015_SCRATCHMEN_APOO: EffectSchema = {
  card_id: "EB01-015",
  card_name: "Scratchmen Apoo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
      ],
    },
  ],
};

// ─── EB01-016 Bingoh (Character) — Activate Main rest self: KO opponent rested ≤1
// [Activate: Main] You may rest this Character: K.O. up to 1 of your opponent's rested Characters
// with a cost of 1 or less.

export const EB01_016_BINGOH: EffectSchema = {
  card_id: "EB01-016",
  card_name: "Bingoh",
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
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1, is_rested: true },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-017 Blueno (Character) — Blocker only
// [Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)

export const EB01_017_BLUENO: EffectSchema = {
  card_id: "EB01-017",
  card_name: "Blueno",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── EB01-019 Off-White (Event) — counter +4000 power then search Donquixote Pirates
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle.
// Then, look at 3 cards from the top of your deck; reveal up to 1 {Donquixote Pirates} type
// Character card and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const EB01_019_OFF_WHITE: EffectSchema = {
  card_id: "EB01-019",
  card_name: "Off-White",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_search",
      category: "auto",
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
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits: ["Donquixote Pirates"],
            },
            rest_destination: "BOTTOM",
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB01-020 Chambres (Event) — Main: return own char, play ≤2 different color + trigger reuse
// [Main] If your Leader has the {Supernovas} type, return 1 of your Characters to the owner's hand,
// and play up to 1 Character card with a cost of 2 or less from your hand that is a different color
// than the returned Character.
// [Trigger] Activate this card's [Main] effect.

export const EB01_020_CHAMBRES: EffectSchema = {
  card_id: "EB01-020",
  card_name: "Chambres",
  card_type: "Event",
  effects: [
    {
      id: "main_bounce_play",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          result_ref: "returned_char",
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              cost_max: 2,
              color_not_matching_ref: "returned_char",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "AND",
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Impel Down / Baroque Works (EB01-021 to EB01-030)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB01-021 Hannyabal (Leader) — end of turn bounce Impel Down ≥2 for DON add active
// [End of Your Turn] You may return 1 of your {Impel Down} type Characters with a cost of 2 or more
// to the owner's hand: Add up to 1 DON!! card from your DON!! deck and set it as active.

export const EB01_021_HANNYABAL: EffectSchema = {
  card_id: "EB01-021",
  card_name: "Hannyabal",
  card_type: "Leader",
  effects: [
    {
      id: "end_of_turn_add_don",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          amount: 1,
          filter: { traits: ["Impel Down"], cost_min: 2 },
        },
      ],
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-022 Inazuma (Character) — end of turn draw if hand ≤2
// [End of Your Turn] If you have 2 or less cards in your hand, draw 2 cards.

export const EB01_022_INAZUMA: EffectSchema = {
  card_id: "EB01-022",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "end_of_turn_draw",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── EB01-023 Edward Weevil (Character) — on play draw
// [On Play] Draw 1 card.

export const EB01_023_EDWARD_WEEVIL: EffectSchema = {
  card_id: "EB01-023",
  card_name: "Edward Weevil",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB01-024 Hamlet (Character) — permanent conditional power boost for SMILE characters
// If you have 4 or less cards in your hand, all of your {SMILE} type Characters gain +1000 power.

export const EB01_024_HAMLET: EffectSchema = {
  card_id: "EB01-024",
  card_name: "Hamlet",
  card_type: "Character",
  effects: [
    {
      id: "permanent_smile_boost",
      category: "permanent",
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits: ["SMILE"] },
          },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── EB01-026 Prince Bellett (Character) — DONx1 when attacking bounce ≤3 if hand ≤1
// [DON!! x1] [When Attacking] If you have 1 or less cards in your hand,
// return up to 1 Character with a cost of 3 or less to the owner's hand.

export const EB01_026_PRINCE_BELLETT: EffectSchema = {
  card_id: "EB01-026",
  card_name: "Prince Bellett",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── EB01-027 Mr.1(Daz.Bonez) (Character) — permanent power per 2 events in trash + on play draw 2 trash 1
// If your Leader's type includes "Baroque Works", this Character gains +1000 power for every 2 Events in your trash.
// [On Play] Draw 2 cards and trash 1 card from your hand.

export const EB01_027_MR1_DAZ_BONEZ: EffectSchema = {
  card_id: "EB01-027",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "permanent_power_per_events",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: { type: "PER_COUNT", source: "EVENTS_IN_TRASH", multiplier: 1000, divisor: 2 } },
        },
      ],
    },
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
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB01-028 Gum-Gum Champion Rifle (Event) — counter Impel Down condition +2000 + opponent bounce active
// [Counter] If your Leader has the {Impel Down} type, up to 1 of your Leader or Character cards
// gains +2000 power during this battle. Then, your opponent returns 1 of their active Characters
// to the owner's hand.
// [Trigger] Return up to 1 Character with a cost of 3 or less to the bottom of the owner's deck.

export const EB01_028_GUM_GUM_CHAMPION_RIFLE: EffectSchema = {
  card_id: "EB01-028",
  card_name: "Gum-Gum Champion Rifle",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_bounce",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Impel Down" },
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
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "RETURN_TO_HAND",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { exact: 1 },
                filter: { is_active: true },
              },
            },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_return_to_deck",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── EB01-029 Sorry. I'm a Goner. (Event) — counter reveal conditional bounce + trigger bounce ≤8
// [Counter] Reveal 1 card from the top of your deck. If the revealed card has a cost of 4 or more,
// return up to 1 of your Characters to the owner's hand. Then, place the revealed card at the bottom of your deck.
// [Trigger] Return up to 1 Character with a cost of 8 or less to the owner's hand.

export const EB01_029_SORRY_IM_A_GONER: EffectSchema = {
  card_id: "EB01-029",
  card_name: "Sorry. I'm a Goner.",
  card_type: "Event",
  effects: [
    {
      id: "counter_reveal_bounce",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed_card",
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed_card",
            filter: { cost_min: 4 },
          },
          chain: "THEN",
        },
        {
          type: "RETURN_TO_DECK",
          target_ref: "revealed_card",
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_bounce",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
        },
      ],
    },
  ],
};

// ─── EB01-030 Loguetown (Stage) — Activate Main place self+hand to deck: draw 2 + trigger play self
// [Activate: Main] You may place this card and 1 card from your hand at the bottom of your deck
// in any order: Draw 2 cards.
// [Trigger] Play this card.

export const EB01_030_LOGUETOWN: EffectSchema = {
  card_id: "EB01-030",
  card_name: "Loguetown",
  card_type: "Stage",
  effects: [
    {
      id: "activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "PLACE_SELF_AND_HAND_TO_DECK" }],
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Water Seven / Baroque Works / Impel Down (EB01-031 to EB01-039)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB01-031 Kalifa (Character) — on play DON−1 Water Seven condition: add 2 chars ≤4 from trash
// [On Play] DON!! −1: If your Leader has the {Water Seven} type,
// add up to 2 Character cards with a cost of 4 or less from your trash to your hand.

export const EB01_031_KALIFA: EffectSchema = {
  card_id: "EB01-031",
  card_name: "Kalifa",
  card_type: "Character",
  effects: [
    {
      id: "on_play_recover",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Water Seven" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 2 },
            filter: { card_type: "CHARACTER", cost_max: 4 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-033 Blueno (Character) — on play DON−1 Water Seven: play Water Seven cost 5 from hand/trash
// [On Play] DON!! −1: If your Leader has the {Water Seven} type,
// play up to 1 {Water Seven} type Character card with a cost of 5 other than [Blueno] from your hand or trash.

export const EB01_033_BLUENO: EffectSchema = {
  card_id: "EB01-033",
  card_name: "Blueno",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Water Seven" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: {
              traits: ["Water Seven"],
              cost_exact: 5,
              exclude_name: "Blueno",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-034 Ms. Wednesday (Character) — Blocker + on opponent attack DON−1 Baroque Works: add DON active
// [Blocker]
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1:
// If your Leader's type includes "Baroque Works", add up to 1 DON!! card from your DON!! deck and set it as active.

export const EB01_034_MS_WEDNESDAY: EffectSchema = {
  card_id: "EB01-034",
  card_name: "Ms. Wednesday",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_opponent_attack_add_don",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-035 Ms. Monday (Character) — on play Baroque Works condition +1000 + trigger DON−1 play self
// [On Play] If your Leader's type includes "Baroque Works",
// up to 1 of your Leader or Character cards gains +1000 power during this turn.
// [Trigger] DON!! −1: Play this card.

export const EB01_035_MS_MONDAY: EffectSchema = {
  card_id: "EB01-035",
  card_name: "Ms. Monday",
  card_type: "Character",
  effects: [
    {
      id: "on_play_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-036 Minochihuahua (Character) — Rush + on KO Impel Down: add DON rested
// [Rush]
// [On K.O.] If your Leader has the {Impel Down} type,
// add up to 1 DON!! card from your DON!! deck and rest it.

export const EB01_036_MINOCHIHUAHUA: EffectSchema = {
  card_id: "EB01-036",
  card_name: "Minochihuahua",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "on_ko_add_don",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Impel Down" },
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

// ─── EB01-037 Mr. 9 (Character) — on opponent attack DON−1 once per turn: KO ≤2
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1:
// K.O. up to 1 of your opponent's Characters with a cost of 2 or less.

export const EB01_037_MR_9: EffectSchema = {
  card_id: "EB01-037",
  card_name: "Mr. 9",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_ko",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-038 Oh Come My Way (Event) — counter DON−1 Baroque Works: redirect attack + trigger DON−1 draw 2
// [Counter] DON!! −1: If your Leader's type includes "Baroque Works",
// select 1 of your Characters. Change the attack target to the selected Character.
// [Trigger] DON!! −1: Draw 2 cards.

export const EB01_038_OH_COME_MY_WAY: EffectSchema = {
  card_id: "EB01-038",
  card_name: "Oh Come My Way",
  card_type: "Event",
  effects: [
    {
      id: "counter_redirect",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "REDIRECT_ATTACK",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-039 Conquerer of Three Worlds Ragnaraku (Event) — Main DON−1: KO ≤8 + trigger add DON active
// [Main] DON!! −1: K.O. up to 1 of your opponent's Characters with a cost of 8 or less.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const EB01_039_CONQUERER_OF_THREE_WORLDS_RAGNARAKU: EffectSchema = {
  card_id: "EB01-039",
  card_name: "Conquerer of Three Worlds Ragnaraku",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_add_don",
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

// ─── EB01-061 Mr.2.Bon.Kurei(Bentham) (Character) — on play add DON active + when attacking copy power
// [On Play] Add up to 1 DON!! card from your DON!! deck and set it as active.
// [When Attacking] Select up to 1 of your opponent's Characters. This Character's base power
// becomes the same as the selected Character's power during this turn.

export const EB01_061_MR2_BON_KUREI: EffectSchema = {
  card_id: "EB01-061",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
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
      id: "when_attacking_copy_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "COPY_POWER",
          target: { type: "SELF" },
          params: {
            source: "SELECTED_CHARACTER",
            source_target: {
              type: "CHARACTER",
              controller: "OPPONENT",
              count: { up_to: 1 },
            },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Dressrosa / CP (EB01-040 to EB01-051)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB01-040 Kyros (Leader) — Activate Main once per turn: turn life face-up then KO cost 0
// [Activate: Main] [Once Per Turn] You may turn 1 card from the top of your Life cards face-up:
// K.O. up to 1 of your opponent's Characters with a cost of 0.

export const EB01_040_KYROS: EffectSchema = {
  card_id: "EB01-040",
  card_name: "Kyros",
  card_type: "Leader",
  effects: [
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TURN_LIFE_FACE_UP", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── EB01-042 Scarlet (Character) — Activate Main trash self: play Dressrosa ≤3 rested then −2 cost
// [Activate: Main] You may trash this Character: Play up to 1 {Dressrosa} type Character card
// with a cost of 3 or less other than [Scarlet] from your hand rested.
// Then, give up to 1 of your opponent's Characters −2 cost during this turn.

export const EB01_042_SCARLET: EffectSchema = {
  card_id: "EB01-042",
  card_name: "Scarlet",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_and_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Dressrosa"],
              cost_max: 3,
              exclude_name: "Scarlet",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-043 Spandine (Character) — on play place 3 CP from trash to deck: play CP ≤4 from trash rested
// [On Play] You may place 3 cards with a type including "CP" from your trash at the bottom of your deck
// in any order: Play up to 1 Character card with a type including "CP" and a cost of 4 or less
// other than [Spandine] from your trash rested.

export const EB01_043_SPANDINE: EffectSchema = {
  card_id: "EB01-043",
  card_name: "Spandine",
  card_type: "Character",
  effects: [
    {
      id: "on_play_recycle_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 3,
          position: "BOTTOM",
          filter: { traits_contains: ["CP"] },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits_contains: ["CP"],
              cost_max: 4,
              exclude_name: "Spandine",
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-044 Funkfreed (Character) — Activate Main rest self: Spandam +3000 power
// [Activate: Main] You may rest this Character:
// Up to 1 of your [Spandam] Characters gains +3000 power during this turn.

export const EB01_044_FUNKFREED: EffectSchema = {
  card_id: "EB01-044",
  card_name: "Funkfreed",
  card_type: "Character",
  effects: [
    {
      id: "activate_boost_spandam",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Spandam" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-045 Brook (Character) — on play conditional Rush if opponent has cost 0
// [On Play] If your opponent has a Character with a cost of 0,
// this Character gains [Rush] during this turn.

export const EB01_045_BROOK: EffectSchema = {
  card_id: "EB01-045",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER", cost_exact: 0 },
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

// ─── EB01-046 Brook (Character) — on play/when attacking: −1 cost then KO cost 0
// [On Play]/[When Attacking] Give up to 1 of your opponent's Characters −1 cost during this turn.
// Then, K.O. up to 1 of your opponent's Characters with a cost of 0.

export const EB01_046_BROOK_2: EffectSchema = {
  card_id: "EB01-046",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_cost_reduce_ko",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
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
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB01-047 Laboon (Character) — once per turn when any character KO'd: draw 1 trash 1
// [Once Per Turn] When a Character is K.O.'d, draw 1 card and trash 1 card from your hand.

export const EB01_047_LABOON: EffectSchema = {
  card_id: "EB01-047",
  card_name: "Laboon",
  card_type: "Character",
  effects: [
    {
      id: "any_ko_draw_trash",
      category: "auto",
      trigger: { event: "ANY_CHARACTER_KO", once_per_turn: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB01-048 Laboon (Character) — Activate Main rest self: opponent −4 cost
// [Activate: Main] You may rest this Character:
// Give up to 1 of your opponent's Characters −4 cost during this turn.

export const EB01_048_LABOON_2: EffectSchema = {
  card_id: "EB01-048",
  card_name: "Laboon",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduce",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-049 T-Bone (Character) — on play KO ≤2
// [On Play] K.O. up to 1 of your opponent's Characters with a cost of 2 or less.

export const EB01_049_T_BONE: EffectSchema = {
  card_id: "EB01-049",
  card_name: "T-Bone",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── EB01-050 ...I Want to Live!! (Event) — counter: trash ≥30 condition add top deck to life
// [Counter] If you have 30 or more cards in your trash,
// add up to 1 card from the top of your deck to the top of your Life cards.

export const EB01_050_I_WANT_TO_LIVE: EffectSchema = {
  card_id: "EB01-050",
  card_name: "...I Want to Live!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_add_life",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 30,
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

// ─── EB01-051 Finger Pistol (Event) — Main: mill 2 as cost: KO ≤5 + trigger reuse
// [Main] You may trash 2 cards from the top of your deck:
// K.O. up to 1 of your opponent's Characters with a cost of 5 or less.
// [Trigger] Activate this card's [Main] effect.

export const EB01_051_FINGER_PISTOL: EffectSchema = {
  card_id: "EB01-051",
  card_name: "Finger Pistol",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
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
            filter: { cost_max: 5 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
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

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Big Mom / Skypiea (EB01-052 to EB01-060)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB01-052 Viola (Character) — Blocker + on play choose: reorder opponent life OR turn own life face-down
// [Blocker]
// [On Play] Choose one:
// • Look at all of your opponent's Life cards and place them back in their Life area in any order.
// • Turn all of your Life cards face-down.

export const EB01_052_VIOLA: EffectSchema = {
  card_id: "EB01-052",
  card_name: "Viola",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_choice",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "REORDER_ALL_LIFE",
                  target: { type: "OPPONENT_LIFE" },
                },
              ],
              [
                {
                  type: "TURN_ALL_LIFE_FACE_DOWN",
                },
              ],
            ],
            labels: [
              "Look at opponent's Life and reorder",
              "Turn all your Life face-down",
            ],
          },
        },
      ],
    },
  ],
};

// ─── EB01-053 Gastino (Character) — on play: place opponent char ≤3 to life face-up + trigger debuff
// [On Play] Place up to 1 of your opponent's Characters with a cost of 3 or less
// at the top or bottom of your opponent's Life cards face-up.
// [Trigger] Give up to a total of 2 of your opponent's Leader or Character cards −3000 power during this turn.

export const EB01_053_GASTINO: EffectSchema = {
  card_id: "EB01-053",
  card_name: "Gastino",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP" },
        },
      ],
    },
    {
      id: "trigger_debuff",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB01-054 Gan.Fall (Character) — Blocker + on play: if opponent ≤1 life, KO ≤3
// [Blocker]
// [On Play] If your opponent has 1 or less Life cards,
// K.O. up to 1 of your opponent's Characters with a cost of 3 or less.

export const EB01_054_GAN_FALL: EffectSchema = {
  card_id: "EB01-054",
  card_name: "Gan.Fall",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 1,
      },
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
  ],
};

// ─── EB01-056 Charlotte Flampe (Character) — on play: take life to hand then draw
// [On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Draw 1 card.

export const EB01_056_CHARLOTTE_FLAMPE: EffectSchema = {
  card_id: "EB01-056",
  card_name: "Charlotte Flampe",
  card_type: "Character",
  effects: [
    {
      id: "on_play_life_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB01-057 Shirahoshi (Character) — on KO by opponent effect: add deck top to life + Blocker
// When this Character is K.O.'d by your opponent's effect,
// add up to 1 card from the top of your deck to the top of your Life cards.
// [Blocker]

export const EB01_057_SHIRAHOSHI: EffectSchema = {
  card_id: "EB01-057",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_add_life",
      category: "auto",
      trigger: { keyword: "ON_KO", cause: "OPPONENT_EFFECT" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── EB01-058 Mont Blanc Cricket (Character) — DONx1 your turn permanent power if life ≤2
// [DON!! x1] [Your Turn] If you have 2 or less Life cards, this Character gains +2000 power.

export const EB01_058_MONT_BLANC_CRICKET: EffectSchema = {
  card_id: "EB01-058",
  card_name: "Mont Blanc Cricket",
  card_type: "Character",
  effects: [
    {
      id: "permanent_power_boost",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "ACTIVE_DON_COUNT",
            controller: "SELF",
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
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
  ],
};

// ─── EB01-059 Kingdom Come (Event) — Main: KO any then drain life to 1 + trigger KO by combined life count
// [Main] K.O. up to 1 of your opponent's Characters. Then, trash cards from the top of your
// Life cards until you have 1 Life card.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost equal to or less than
// the total of your and your opponent's Life cards.

export const EB01_059_KINGDOM_COME: EffectSchema = {
  card_id: "EB01-059",
  card_name: "Kingdom Come",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_drain",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
        {
          type: "DRAIN_LIFE_TO_THRESHOLD",
          params: { threshold: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: { type: "GAME_STATE", source: "COMBINED_LIFE_COUNT" },
            },
          },
        },
      ],
    },
  ],
};

// ─── EB01-060 Did Someone Say...Kami? (Event) — Main: play Enel ≤7 from hand/trash then drain life to 1
// [Main] Play up to 1 [Enel] with a cost of 7 or less from your hand or trash.
// Then, trash cards from the top of your Life cards until you have 1 Life card.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const EB01_060_DID_SOMEONE_SAY_KAMI: EffectSchema = {
  card_id: "EB01-060",
  card_name: "Did Someone Say...Kami?",
  card_type: "Event",
  effects: [
    {
      id: "main_play_enel_drain",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: {
              name: "Enel",
              cost_max: 7,
            },
          },
          params: { cost_override: "FREE" },
        },
        {
          type: "DRAIN_LIFE_TO_THRESHOLD",
          params: { threshold: 1 },
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
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const EB01_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "EB01-001": EB01_001_KOUZUKI_ODEN,
  "EB01-002": EB01_002_IZO,
  "EB01-003": EB01_003_KID_AND_KILLER,
  "EB01-004": EB01_004_KOZA,
  "EB01-006": EB01_006_TONY_TONY_CHOPPER,
  "EB01-007": EB01_007_YAMATO,
  "EB01-008": EB01_008_LITTLEOARS_JR,
  "EB01-009": EB01_009_JUST_SHUT_UP_AND_COME_WITH_US,
  "EB01-010": EB01_010_THERES_NO_WAY_YOU_COULD_DEFEAT_ME,
  "EB01-011": EB01_011_MINI_MERRY,
  // Green
  "EB01-012": EB01_012_CAVENDISH,
  "EB01-013": EB01_013_KOUZUKI_HIYORI,
  "EB01-014": EB01_014_SANJI,
  "EB01-015": EB01_015_SCRATCHMEN_APOO,
  "EB01-016": EB01_016_BINGOH,
  "EB01-017": EB01_017_BLUENO,
  "EB01-019": EB01_019_OFF_WHITE,
  "EB01-020": EB01_020_CHAMBRES,
  // Blue
  "EB01-021": EB01_021_HANNYABAL,
  "EB01-022": EB01_022_INAZUMA,
  "EB01-023": EB01_023_EDWARD_WEEVIL,
  "EB01-024": EB01_024_HAMLET,
  "EB01-026": EB01_026_PRINCE_BELLETT,
  "EB01-027": EB01_027_MR1_DAZ_BONEZ,
  "EB01-028": EB01_028_GUM_GUM_CHAMPION_RIFLE,
  "EB01-029": EB01_029_SORRY_IM_A_GONER,
  "EB01-030": EB01_030_LOGUETOWN,
  // Purple
  "EB01-031": EB01_031_KALIFA,
  "EB01-033": EB01_033_BLUENO,
  "EB01-034": EB01_034_MS_WEDNESDAY,
  "EB01-035": EB01_035_MS_MONDAY,
  "EB01-036": EB01_036_MINOCHIHUAHUA,
  "EB01-037": EB01_037_MR_9,
  "EB01-038": EB01_038_OH_COME_MY_WAY,
  "EB01-039": EB01_039_CONQUERER_OF_THREE_WORLDS_RAGNARAKU,
  "EB01-061": EB01_061_MR2_BON_KUREI,
  // Black
  "EB01-040": EB01_040_KYROS,
  "EB01-042": EB01_042_SCARLET,
  "EB01-043": EB01_043_SPANDINE,
  "EB01-044": EB01_044_FUNKFREED,
  "EB01-045": EB01_045_BROOK,
  "EB01-046": EB01_046_BROOK_2,
  "EB01-047": EB01_047_LABOON,
  "EB01-048": EB01_048_LABOON_2,
  "EB01-049": EB01_049_T_BONE,
  "EB01-050": EB01_050_I_WANT_TO_LIVE,
  "EB01-051": EB01_051_FINGER_PISTOL,
  // Yellow
  "EB01-052": EB01_052_VIOLA,
  "EB01-053": EB01_053_GASTINO,
  "EB01-054": EB01_054_GAN_FALL,
  "EB01-056": EB01_056_CHARLOTTE_FLAMPE,
  "EB01-057": EB01_057_SHIRAHOSHI,
  "EB01-058": EB01_058_MONT_BLANC_CRICKET,
  "EB01-059": EB01_059_KINGDOM_COME,
  "EB01-060": EB01_060_DID_SOMEONE_SAY_KAMI,
};
