/**
 * EB02 Effect Schemas
 *
 * Red (Straw Hat Crew / Revolutionary Army / Wano): EB02-002 to EB02-009
 * Green (Straw Hat Crew / Zou / Fish-Man): EB02-010 to EB02-021
 * Blue (Baroque Works / Whitebeard Pirates): EB02-022 to EB02-031
 * Purple (Straw Hat Crew / Galley-La / Impel Down): EB02-032 to EB02-041
 * Black (Navy / CP / Thriller Bark): EB02-044 to EB02-051
 * Yellow (Sky Island / Straw Hat Crew): EB02-052 to EB02-061
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Straw Hat Crew / Revolutionary Army / Wano (EB02-002 to EB02-009)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB02-002 Sabo (Character) — ACTIVATE_MAIN rest self + power buff
// [Activate: Main] You may rest this Character: Up to 1 of your {Revolutionary Army}
// type Characters other than [Sabo] gains +2000 power during this turn.

export const EB02_002_SABO: EffectSchema = {
  card_id: "EB02-002",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"], exclude_name: "Sabo" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB02-003 Tony Tony.Chopper (Character) — DON!!x2 opponent turn power + on play give DON
// [DON!! x2] [Opponent's Turn] This Character gains +2000 power.
// [On Play] If your Leader has the {Straw Hat Crew} type, give up to 1 rested DON!!
// card to your Leader or 1 of your Characters.

export const EB02_003_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "EB02-003",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "don_x2_opponent_turn_power",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
    {
      id: "on_play_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
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

// ─── EB02-005 Fake Straw Hat Crew (Character) — your turn +2000, opponent turn -2000
// [Your Turn] This Character gains +2000 power.
// [Opponent's Turn] Give this Character −2000 power.

export const EB02_005_FAKE_STRAW_HAT_CREW: EffectSchema = {
  card_id: "EB02-005",
  card_name: "Fake Straw Hat Crew",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_power_up",
      category: "auto",
      trigger: { keyword: "START_OF_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "opponent_turn_power_down",
      category: "auto",
      trigger: { keyword: "START_OF_TURN", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB02-006 Yamato (Character) — ACTIVATE_MAIN once per turn give DON + Rush
// [Activate: Main] [Once Per Turn] If your Leader has the {Land of Wano} type or
// is [Portgas.D.Ace], give up to 1 rested DON!! card to 1 of your Leader. Then,
// this Character gains [Rush] during this turn.

export const EB02_006_YAMATO: EffectSchema = {
  card_id: "EB02-006",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don_rush",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
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
            property: { name: "Portgas.D.Ace" },
          },
        ],
      },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "YOUR_LEADER",
          },
          params: { amount: 1 },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-007 Cloven Rose Blizzard (Event) — MAIN power buff + KO
// [Main] Up to a total of 3 of your Leader and Character cards gain +1000 power
// during this turn. Then, K.O. up to 1 of your opponent's Characters with 3000
// power or less.
// [Trigger] K.O. up to 1 of your opponent's Characters with 4000 power or less.

export const EB02_007_CLOVEN_ROSE_BLIZZARD: EffectSchema = {
  card_id: "EB02-007",
  card_name: "Cloven Rose Blizzard",
  card_type: "Event",
  effects: [
    {
      id: "main_buff_and_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 3 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
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
            filter: { power_max: 4000 },
          },
        },
      ],
    },
  ],
};

// ─── EB02-008 The Peak (Event) — MAIN search deck + trigger reuse
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
// cost of 4 or more and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB02_008_THE_PEAK: EffectSchema = {
  card_id: "EB02-008",
  card_name: "The Peak",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 4 },
            rest_destination: "BOTTOM",
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

// ─── EB02-009 Thousand Sunny (Stage) — ACTIVATE_MAIN rest self + redistribute DON
// [Activate: Main] You may rest this Stage: Give up to 1 of your currently given
// DON!! cards to 1 of your {Straw Hat Crew} type Characters.

export const EB02_009_THOUSAND_SUNNY: EffectSchema = {
  card_id: "EB02-009",
  card_name: "Thousand Sunny",
  card_type: "Stage",
  effects: [
    {
      id: "activate_redistribute_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "REDISTRIBUTE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Straw Hat Crew / Zou / Fish-Man (EB02-010 to EB02-021)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB02-010 Monkey.D.Luffy (Leader) — Green/Purple — ACTIVATE_MAIN DON-2 set DON active + power
// [Activate: Main] [Once Per Turn] DON!! −2: If the only Characters on your field
// are {Straw Hat Crew} type Characters, set up to 2 of your DON!! cards as active.
// Then, this Leader gains +1000 power until the end of your opponent's next turn.

export const EB02_010_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "EB02-010",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_set_don_active_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      flags: { once_per_turn: true },
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { traits: ["Straw Hat Crew"], card_type: "CHARACTER" },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-011 Arlong (Character) — on play give DON + cannot be rested
// [On Play] If your Leader has the {Fish-Man} or {East Blue} type, give up to 1
// rested DON!! card to 1 of your Leader. Then, up to 1 of your opponent's Characters
// with a cost of 5 or less cannot be rested until the end of your opponent's next turn.

export const EB02_011_ARLONG: EffectSchema = {
  card_id: "EB02-011",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don_prohibit",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Fish-Man" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "East Blue" },
          },
        ],
      },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "YOUR_LEADER",
          },
          params: { amount: 1 },
        },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-012 Gaimon (Character) — conditional Blocker if Sarfunkel on field
// If you have a [Sarfunkel], this Character gains [Blocker].

export const EB02_012_GAIMON: EffectSchema = {
  card_id: "EB02-012",
  card_name: "Gaimon",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Sarfunkel" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── EB02-013 Carrot (Character) — on play search deck + play from hand
// [On Play] If you have 3 or more DON!! cards on your field, look at 7 cards from
// the top of your deck; reveal up to 1 [Zou] and add it to your hand. Then, place
// the rest at the bottom of your deck in any order and play up to 1 [Zou] from your hand.

export const EB02_013_CARROT: EffectSchema = {
  card_id: "EB02-013",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 3,
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 7,
            pick: { up_to: 1 },
            filter: { name: "Zou" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Zou" },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-014 Sarfunkel (Character) — on play play Gaimon from hand
// [On Play] Play up to 1 [Gaimon] from your hand.

export const EB02_014_SARFUNKEL: EffectSchema = {
  card_id: "EB02-014",
  card_name: "Sarfunkel",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_gaimon",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Gaimon" },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-015 Jewelry Bonney (Character) — on play cannot refresh + schedule DON active
// [On Play] Up to 1 of your opponent's rested Characters will not become active in
// your opponent's next Refresh Phase. Then, set up to 1 of your DON!! cards as active
// at the end of this turn.

export const EB02_015_JEWELRY_BONNEY: EffectSchema = {
  card_id: "EB02-015",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "on_play_prohibit_refresh_schedule_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_DON_ACTIVE",
              params: { amount: 1 },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-016 Chopperman (Character) — name alias Tony Tony.Chopper + on play play Animal
// Also treat this card's name as [Tony Tony.Chopper] according to the rules.
// [On Play] Play up to 1 {Animal} type Character card with a cost of 3 or less from your hand.

export const EB02_016_CHOPPERMAN: EffectSchema = {
  card_id: "EB02-016",
  card_name: "Chopperman",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "NAME_ALIAS", aliases: ["Tony Tony.Chopper"] },
  ],
  effects: [
    {
      id: "on_play_play_animal",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Animal"], cost_max: 3 },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-017 Nami (Character) — on play search deck for Straw Hat Crew
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew}
// type card other than [Nami] and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const EB02_017_NAMI: EffectSchema = {
  card_id: "EB02-017",
  card_name: "Nami",
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
            filter: { traits: ["Straw Hat Crew"], exclude_name: "Nami" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── EB02-018 Buggy (Character) — on play grant Double Attack + trigger rest
// [On Play] If you have no other [Buggy] Characters, up to 1 of your Leader gains
// [Double Attack] during this turn.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const EB02_018_BUGGY: EffectSchema = {
  card_id: "EB02-018",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_double_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Buggy", card_type: "CHARACTER" },
        count: { operator: "==", value: 0 },
        exclude_self: true,
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "YOUR_LEADER",
            count: { up_to: 1 },
          },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_rest",
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

// ─── EB02-019 Roronoa Zoro (Character) — can attack characters on play turn + on play rest opponent
// If your opponent has 2 or more Characters, this Character can attack Characters on
// the turn in which it is played.
// [On Play] If your Leader has the {Straw Hat Crew} type, rest up to 1 of your
// opponent's Characters with a cost of 4 or less.

export const EB02_019_RORONOA_ZORO: EffectSchema = {
  card_id: "EB02-019",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush_character",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER" },
        count: { operator: ">=", value: 2 },
      },
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "on_play_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
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

// ─── EB02-020 We Are! (Event) — MAIN search deck + trigger reuse
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
// cost of 4 or more and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB02_020_WE_ARE: EffectSchema = {
  card_id: "EB02-020",
  card_name: "We Are!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 4 },
            rest_destination: "BOTTOM",
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

// ─── EB02-021 Gum-Gum Giant Pistol (Event) — MAIN power buff + cannot refresh self
// [Main] Up to 1 of your {Straw Hat Crew} type Characters gains +6000 power during
// this turn. Then, the selected Character will not become active in your next Refresh Phase.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const EB02_021_GUM_GUM_GIANT_PISTOL: EffectSchema = {
  card_id: "EB02-021",
  card_name: "Gum-Gum Giant Pistol",
  card_type: "Event",
  effects: [
    {
      id: "main_buff_and_prohibit",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 6000 },
          duration: { type: "THIS_TURN" },
          result_ref: "buffed_character",
        },
        {
          type: "APPLY_PROHIBITION",
          target_ref: "buffed_character",
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_rest",
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
// BLUE — Baroque Works / Whitebeard Pirates (EB02-022 to EB02-031)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB02-022 Usopp (Character) — on play play from hand conditionally
// [On Play] If you have 2 or less Characters with 5000 power or more, play up to 1
// Character card with 6000 power or less and no base effect from your hand.

export const EB02_022_USOPP: EffectSchema = {
  card_id: "EB02-022",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", power_min: 5000 },
        count: { operator: "<=", value: 2 },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { power_max: 6000, no_base_effect: true },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-023 Crocodile (Character) — your turn once per turn reaction to bounce
// [Your Turn] [Once Per Turn] When your opponent's Character is returned to the
// owner's hand by your effect, look at 3 cards from the top of your deck and place
// them at the top or bottom of the deck in any order.

export const EB02_023_CROCODILE: EffectSchema = {
  card_id: "EB02-023",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "reaction_bounce_scry",
      category: "auto",
      trigger: {
        event: "CHARACTER_RETURNED_TO_HAND",
        filter: { controller: "OPPONENT", cause: "BY_YOUR_EFFECT" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 3 },
        },
      ],
    },
  ],
};

// ─── EB02-024 Sogeking (Character) — name alias Usopp + on play draw/place + bounce
// Also treat this card's name as [Usopp] according to the rules.
// [On Play] Draw 2 cards and place 2 cards from your hand at the bottom of your deck
// in any order. Then, return up to 1 Character with a cost of 1 or less to the owner's hand.

export const EB02_024_SOGEKING: EffectSchema = {
  card_id: "EB02-024",
  card_name: "Sogeking",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "NAME_ALIAS", aliases: ["Usopp"] },
  ],
  effects: [
    {
      id: "on_play_draw_place_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "BOTTOM" },
          chain: "AND",
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "ANY",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-025 Donquixote Rosinante (Character) — ACTIVATE_MAIN search and play
// [Activate: Main] You may rest 1 of your DON!! cards and this Character: If your
// Leader is [Donquixote Rosinante], look at 5 cards from the top of your deck; play
// up to 1 Character card with a cost of 2 or less rested. Then, place the rest at
// the bottom of your deck in any order.

export const EB02_025_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "EB02-025",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "activate_search_and_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Donquixote Rosinante" },
      },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: { card_type: "CHARACTER", cost_max: 2 },
            rest_destination: "BOTTOM",
            entry_state: "RESTED",
          },
        },
      ],
    },
  ],
};

// ─── EB02-026 Nefeltari Vivi (Character) — on play conditional draw
// [On Play] If your Leader is multicolored and you have 5 or less cards in your
// hand, draw 2 cards.

export const EB02_026_NEFELTARI_VIVI: EffectSchema = {
  card_id: "EB02-026",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { multicolored: true },
          },
          {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 5,
          },
        ],
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

// ─── EB02-027 Vista (Character) — on play bottom deck opponent character
// [On Play] Place up to 1 of your opponent's Characters with 1000 power or less at
// the bottom of the owner's deck.

export const EB02_027_VISTA: EffectSchema = {
  card_id: "EB02-027",
  card_name: "Vista",
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
            filter: { power_max: 1000 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── EB02-028 Portgas.D.Ace (Character) — on play search deck + play from hand
// [On Play] If your Leader's type includes "Whitebeard Pirates", look at 5 cards from
// the top of your deck; reveal up to 1 Character card with a cost of 2 and add it to
// your hand. Then, place the rest at the bottom of your deck in any order and play up
// to 1 Character card with a cost of 2 from your hand rested.

export const EB02_028_PORTGAS_D_ACE: EffectSchema = {
  card_id: "EB02-028",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_exact: 2 },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_exact: 2 },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-030 And That's When Somebody Makes Fun of Their Friend's Dream!!!! (Event)
// [Counter] If any of your Characters would be K.O.'d in battle during this turn,
// you may trash 1 card from your hand instead.
// [Trigger] Draw 1 card.

export const EB02_030_AND_THATS_WHEN_SOMEBODY: EffectSchema = {
  card_id: "EB02-030",
  card_name: "And That's When Somebody Makes Fun of Their Friend's Dream!!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_ko_protection",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "APPLY_ONE_TIME_MODIFIER",
          params: {
            modification: {
              type: "REPLACEMENT_EFFECT",
              params: {
                replaces: "WOULD_BE_KO",
                cause: "IN_BATTLE",
                replacement_action: {
                  type: "TRASH_FROM_HAND",
                  params: { amount: 1 },
                },
              },
            },
            applies_to: {
              controller: "SELF",
              card_type: "CHARACTER",
            },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB02-031 Hope (Event) — MAIN search deck + trigger reuse
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
// cost of 4 or more and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB02_031_HOPE: EffectSchema = {
  card_id: "EB02-031",
  card_name: "Hope",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 4 },
            rest_destination: "BOTTOM",
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

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Straw Hat Crew / Galley-La / Impel Down (EB02-032 to EB02-041)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB02-032 Iceburg (Character) — on play search deck + play from hand
// [On Play] If you have 3 or more DON!! cards on your field, look at 7 cards from
// the top of your deck; reveal up to 1 [Galley-La Company] and add it to your hand.
// Then, place the rest at the bottom of your deck in any order and play up to 1
// [Galley-La Company] from your hand.

export const EB02_032_ICEBURG: EffectSchema = {
  card_id: "EB02-032",
  card_name: "Iceburg",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 3,
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 7,
            pick: { up_to: 1 },
            filter: { name: "Galley-La Company" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Galley-La Company" },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-033 Klabautermann (Character) — conditional Blocker if Merry Go on field
// If you have [Merry Go] on your field, this Character gains [Blocker].

export const EB02_033_KLABAUTERMANN: EffectSchema = {
  card_id: "EB02-033",
  card_name: "Klabautermann",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Merry Go" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── EB02-035 Sanji & Pudding (Character) — DON returned trigger + on play DON comparison draw
// [Your Turn] [Once Per Turn] When 2 or more DON!! cards on your field are returned
// to your DON!! deck, add up to 1 DON!! card from your DON!! deck and set it as active.
// [On Play] If the number of DON!! cards on your field is equal to or less than the
// number on your opponent's field, draw 1 card.

export const EB02_035_SANJI_AND_PUDDING: EffectSchema = {
  card_id: "EB02-035",
  card_name: "Sanji & Pudding",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
        quantity_threshold: 2,
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
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

// ─── EB02-036 Nico Robin (Character) — Blocker + on KO DON-1 search deck
// [Blocker]
// [On K.O.] DON!! −1: Look at 3 cards from the top of your deck; reveal up to 1
// {Straw Hat Crew} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const EB02_036_NICO_ROBIN: EffectSchema = {
  card_id: "EB02-036",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_search",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── EB02-037 Franky (Character) — on play/when attacking add DON rested
// [On Play]/[When Attacking] If your Leader has the {Straw Hat Crew} type and the
// number of DON!! cards on your field is equal to or less than the number on your
// opponent's field, add up to 1 DON!! card from your DON!! deck and rest it.

export const EB02_037_FRANKY: EffectSchema = {
  card_id: "EB02-037",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "on_play_when_attacking_add_don",
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
            property: { trait: "Straw Hat Crew" },
          },
          {
            type: "COMPARATIVE",
            metric: "DON_FIELD_COUNT",
            operator: "<=",
          },
        ],
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

// ─── EB02-038 Magellan (Character) — on play play Impel Down from hand
// [On Play] Play up to 1 {Impel Down} type Character card with a cost of 2 or less
// from your hand.

export const EB02_038_MAGELLAN: EffectSchema = {
  card_id: "EB02-038",
  card_name: "Magellan",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_impel_down",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Impel Down"], cost_max: 2 },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-039 GERMA 66 (Event) — MAIN trash from hand + play from trash
// [Main] You may trash 1 {GERMA 66} type Character card with 4000 power or less from
// your hand: If the number of DON!! cards on your field is equal to or less than the
// number on your opponent's field, play up to 1 Character card with 5000 to 7000 power
// and the same card name as the trashed card from your trash.

export const EB02_039_GERMA_66: EffectSchema = {
  card_id: "EB02-039",
  card_name: "GERMA 66",
  card_type: "Event",
  effects: [
    {
      id: "main_trash_and_play",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits: ["GERMA 66"], card_type: "CHARACTER", power_max: 4000 },
        },
      ],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "PLAY_CARD",
          // TODO: Card text requires "same card name as the trashed card" filter.
          // Cost result_ref not yet supported — name filter omitted until cost-to-action
          // ref passing is implemented. Review during M4.5 Phase 2.
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              power_range: { min: 5000, max: 7000 },
            },
            source_zone: "TRASH",
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-040 BRAND NEW WORLD (Event) — MAIN search deck + trigger reuse
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
// cost of 4 or more and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB02_040_BRAND_NEW_WORLD: EffectSchema = {
  card_id: "EB02-040",
  card_name: "BRAND NEW WORLD",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 4 },
            rest_destination: "BOTTOM",
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

// ─── EB02-041 Merry Go (Stage) — on play draw + activate cost buff
// [On Play] If your Leader has the {Straw Hat Crew} type, draw 1 card.
// [Activate: Main] You may rest this Stage: If the number of DON!! cards on your
// field is equal to or less than the number on your opponent's field, up to 1 of
// your {Straw Hat Crew} type Characters gains +2 cost until the end of your
// opponent's next turn.

export const EB02_041_MERRY_GO: EffectSchema = {
  card_id: "EB02-041",
  card_name: "Merry Go",
  card_type: "Stage",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "activate_cost_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Navy / CP / Thriller Bark (EB02-044 to EB02-051)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB02-044 Sengoku (Character) — Blocker + on play play from trash
// [Blocker]
// [On Play] Play up to 1 black {Navy} type Character card with a cost of 4 or less
// from your trash rested.

export const EB02_044_SENGOKU: EffectSchema = {
  card_id: "EB02-044",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK", traits: ["Navy"], cost_max: 4 },
            source_zone: "TRASH",
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── EB02-045 Trafalgar Law (Character) — Blocker + on play choose one
// [Blocker]
// [On Play] You may place 2 cards from your trash at the bottom of your deck in any
// order: Choose one:
// - Draw 1 card.
// - If your opponent has 5 or more cards in their hand, your opponent trashes 1 card
//   from their hand.

export const EB02_045_TRAFALGAR_LAW: EffectSchema = {
  card_id: "EB02-045",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_choose_one",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 2, position: "BOTTOM" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "DRAW",
                  params: { amount: 1 },
                },
              ],
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    action: {
                      type: "TRASH_FROM_HAND",
                      params: { amount: 1 },
                    },
                  },
                  conditions: {
                    type: "HAND_COUNT",
                    controller: "OPPONENT",
                    operator: ">=",
                    value: 5,
                  },
                },
              ],
            ],
            labels: ["Draw 1 card", "Opponent trashes 1 from hand"],
          },
        },
      ],
    },
  ],
};

// ─── EB02-046 Hildon (Character) — on play mill + cost reduction
// [On Play] Trash 2 cards from the top of your deck and give up to 1 of your
// opponent's Characters −1 cost during this turn.

export const EB02_046_HILDON: EffectSchema = {
  card_id: "EB02-046",
  card_name: "Hildon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_mill_and_cost_down",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
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
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── EB02-047 Blueno (Character) — ACTIVATE_MAIN trash hand + trash self + play from trash
// [Activate: Main] You may trash 1 card from your hand and trash this Character:
// Play up to 1 Character card with a type including "CP" and a cost of 5 or less
// other than [Blueno] from your trash.

export const EB02_047_BLUENO: EffectSchema = {
  card_id: "EB02-047",
  card_name: "Blueno",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_from_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["CP"], cost_max: 5, exclude_name: "Blueno" },
            source_zone: "TRASH",
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-048 Brook (Character) — on play add Laboon from trash + on KO play Laboon
// [On Play] Add up to 1 [Laboon] from your trash to your hand.
// [On K.O.] Play up to 1 [Laboon] with a cost of 4 or less from your hand.

export const EB02_048_BROOK: EffectSchema = {
  card_id: "EB02-048",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_laboon",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Laboon" },
          },
        },
      ],
    },
    {
      id: "on_ko_play_laboon",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Laboon", cost_max: 4 },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB02-049 Monkey.D.Garp (Character) — on play give DON + activate KO
// [On Play] Give up to 2 rested DON!! cards to 1 of your Leader.
// [Activate: Main] You may rest this Character: If your Leader is [Monkey.D.Garp],
// K.O. up to 1 of your opponent's Characters with a cost of 1 or less.

export const EB02_049_MONKEY_D_GARP: EffectSchema = {
  card_id: "EB02-049",
  card_name: "Monkey.D.Garp",
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
            type: "YOUR_LEADER",
          },
          params: { amount: 2 },
        },
      ],
    },
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Monkey.D.Garp" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
        },
      ],
    },
  ],
};

// ─── EB02-050 Kokoro no Chizu (Event) — MAIN search deck + trigger reuse
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
// cost of 4 or more and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB02_050_KOKORO_NO_CHIZU: EffectSchema = {
  card_id: "EB02-050",
  card_name: "Kokoro no Chizu",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 4 },
            rest_destination: "BOTTOM",
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

// ─── EB02-051 Three-Pace Hum Soul Notch Slash (Event) — MAIN choose one KO or cost down
// [Main] Choose one:
// - K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
// - Give up to 1 of your opponent's Characters −4 cost during this turn.

export const EB02_051_THREE_PACE_HUM_SOUL_NOTCH_SLASH: EffectSchema = {
  card_id: "EB02-051",
  card_name: "Three-Pace Hum Soul Notch Slash",
  card_type: "Event",
  effects: [
    {
      id: "main_choose_one",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
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
              [
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
            ],
            labels: ["K.O. cost 2 or less", "Give -4 cost"],
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Sky Island / Straw Hat Crew (EB02-052 to EB02-061)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB02-052 Enel (Character) — conditional Rush + when attacking trash cost + life + power
// If your Leader has the {Sky Island} type, this Character gains [Rush].
// [When Attacking] You may trash 1 card from your hand: If you have 1 or less Life
// cards, add up to 1 card from the top of your deck to the top of your Life cards.
// Then, this Character gains +1000 power during this turn.

export const EB02_052_ENEL: EffectSchema = {
  card_id: "EB02-052",
  card_name: "Enel",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Sky Island" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "when_attacking_life_and_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-053 Myskina Olga (Character) — on play / on KO life scry
// [On Play]/[On K.O.] Look at up to 1 card from the top of your or your opponent's
// Life cards and place it at the top or bottom of the Life cards.

export const EB02_053_MYSKINA_OLGA: EffectSchema = {
  card_id: "EB02-053",
  card_name: "Myskina Olga",
  card_type: "Character",
  effects: [
    {
      id: "on_play_on_ko_life_scry",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "ON_KO" },
        ],
      },
      actions: [
        {
          type: "LIFE_SCRY",
          target: {
            type: "LIFE_CARD",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { look_at: 1 },
        },
      ],
    },
  ],
};

// ─── EB02-054 Sanji (Character) — Blocker + on play draw and trash
// [Blocker]
// [On Play] If you have 2 or less Life cards, draw 2 cards and trash 1 card from
// your hand.

export const EB02_054_SANJI: EffectSchema = {
  card_id: "EB02-054",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_draw_and_trash",
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

// ─── EB02-056 Vegapunk (Character) — Blocker + on play search and play + conditional trash
// [Blocker]
// [On Play] Look at 5 cards from the top of your deck; play up to 1 {Scientist} type
// Character card with a cost of 5 or less other than [Vegapunk]. Then, place the rest
// at the bottom of your deck in any order and if your opponent has 2 or less Characters,
// trash 1 card from your hand.
// [Trigger] Draw 1 card.

export const EB02_056_VEGAPUNK: EffectSchema = {
  card_id: "EB02-056",
  card_name: "Vegapunk",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_search_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: {
              card_type: "CHARACTER",
              traits: ["Scientist"],
              cost_max: 5,
              exclude_name: "Vegapunk",
            },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { card_type: "CHARACTER" },
            count: { operator: "<=", value: 2 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── EB02-057 Mad Treasure (Character) — when attacking life cost + add to opponent life
// [When Attacking] You may add 1 card from the top or bottom of your Life cards to
// your hand: Add up to 1 of your opponent's Characters with a cost of 3 or less to
// the top or bottom of your opponent's Life cards face-up.

export const EB02_057_MAD_TREASURE: EffectSchema = {
  card_id: "EB02-057",
  card_name: "Mad Treasure",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_life_to_hand_add_to_life",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP", position: "TOP_OR_BOTTOM" },
        },
      ],
    },
  ],
};

// ─── EB02-058 UUUUUS! (Event) — MAIN search deck + trigger reuse
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
// cost of 4 or more and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB02_058_UUUUUS: EffectSchema = {
  card_id: "EB02-058",
  card_name: "UUUUUS!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 4 },
            rest_destination: "BOTTOM",
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

// ─── EB02-059 Without Your Help I Can't Become the King of the Pirates!!!! (Event)
// [Counter] Up to 1 of your Leader or Character cards gains +1000 power during this
// battle. Then, if you have 1 or less Life cards, play up to 1 of your yellow
// {Straw Hat Crew} type Character cards or [Sanji] with a cost of 5 or less from your hand.

export const EB02_059_WITHOUT_YOUR_HELP: EffectSchema = {
  card_id: "EB02-059",
  card_name: "Without Your Help I Can't Become the King of the Pirates!!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_buff_and_play",
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
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { color: "YELLOW", traits: ["Straw Hat Crew"] },
                { name: "Sanji" },
              ],
              cost_max: 5,
            },
            source_zone: "HAND",
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 1,
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB02-060 Merry Go (Stage) — ACTIVATE_MAIN rest + turn life face up + power buff
// [Activate: Main] You may rest this Stage and turn 1 card from the top of your Life
// cards face-up: Up to 1 of your {Straw Hat Crew} type Characters gains +1000 power
// until the end of your opponent's next turn.

export const EB02_060_MERRY_GO: EffectSchema = {
  card_id: "EB02-060",
  card_name: "Merry Go",
  card_type: "Stage",
  effects: [
    {
      id: "activate_power_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "TURN_LIFE_FACE_UP", amount: 1 },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── EB02-061 Monkey.D.Luffy (Character) — Purple — conditional Rush + when attacking
// If your Leader is multicolored and your opponent has 5 or more DON!! cards on their
// field, this Character gains [Rush].
// [When Attacking] [Once Per Turn] You may return 2 of your active DON!! cards to your
// DON!! deck: Set this Character as active. Then, add 1 card from the top of your Life
// cards to your hand.

export const EB02_061_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "EB02-061",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
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
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "when_attacking_untap_life",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      flags: { optional: true, once_per_turn: true },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const EB02_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "EB02-002": EB02_002_SABO,
  "EB02-003": EB02_003_TONY_TONY_CHOPPER,
  "EB02-005": EB02_005_FAKE_STRAW_HAT_CREW,
  "EB02-006": EB02_006_YAMATO,
  "EB02-007": EB02_007_CLOVEN_ROSE_BLIZZARD,
  "EB02-008": EB02_008_THE_PEAK,
  "EB02-009": EB02_009_THOUSAND_SUNNY,
  // Green (EB02-010 is Green/Purple, listed under Green)
  "EB02-010": EB02_010_MONKEY_D_LUFFY,
  "EB02-011": EB02_011_ARLONG,
  "EB02-012": EB02_012_GAIMON,
  "EB02-013": EB02_013_CARROT,
  "EB02-014": EB02_014_SARFUNKEL,
  "EB02-015": EB02_015_JEWELRY_BONNEY,
  "EB02-016": EB02_016_CHOPPERMAN,
  "EB02-017": EB02_017_NAMI,
  "EB02-018": EB02_018_BUGGY,
  "EB02-019": EB02_019_RORONOA_ZORO,
  "EB02-020": EB02_020_WE_ARE,
  "EB02-021": EB02_021_GUM_GUM_GIANT_PISTOL,
  // Blue
  "EB02-022": EB02_022_USOPP,
  "EB02-023": EB02_023_CROCODILE,
  "EB02-024": EB02_024_SOGEKING,
  "EB02-025": EB02_025_DONQUIXOTE_ROSINANTE,
  "EB02-026": EB02_026_NEFELTARI_VIVI,
  "EB02-027": EB02_027_VISTA,
  "EB02-028": EB02_028_PORTGAS_D_ACE,
  "EB02-030": EB02_030_AND_THATS_WHEN_SOMEBODY,
  "EB02-031": EB02_031_HOPE,
  // Purple
  "EB02-032": EB02_032_ICEBURG,
  "EB02-033": EB02_033_KLABAUTERMANN,
  "EB02-035": EB02_035_SANJI_AND_PUDDING,
  "EB02-036": EB02_036_NICO_ROBIN,
  "EB02-037": EB02_037_FRANKY,
  "EB02-038": EB02_038_MAGELLAN,
  "EB02-039": EB02_039_GERMA_66,
  "EB02-040": EB02_040_BRAND_NEW_WORLD,
  "EB02-041": EB02_041_MERRY_GO,
  // Black
  "EB02-044": EB02_044_SENGOKU,
  "EB02-045": EB02_045_TRAFALGAR_LAW,
  "EB02-046": EB02_046_HILDON,
  "EB02-047": EB02_047_BLUENO,
  "EB02-048": EB02_048_BROOK,
  "EB02-049": EB02_049_MONKEY_D_GARP,
  "EB02-050": EB02_050_KOKORO_NO_CHIZU,
  "EB02-051": EB02_051_THREE_PACE_HUM_SOUL_NOTCH_SLASH,
  // Yellow
  "EB02-052": EB02_052_ENEL,
  "EB02-053": EB02_053_MYSKINA_OLGA,
  "EB02-054": EB02_054_SANJI,
  "EB02-056": EB02_056_VEGAPUNK,
  "EB02-057": EB02_057_MAD_TREASURE,
  "EB02-058": EB02_058_UUUUUS,
  "EB02-059": EB02_059_WITHOUT_YOUR_HELP,
  "EB02-060": EB02_060_MERRY_GO,
  "EB02-061": EB02_061_MONKEY_D_LUFFY,
};
