/**
 * M4 Effect Schema — OP12 Card Encodings
 *
 * Red (Silvers Rayleigh / Roger Pirates): OP12-001 through OP12-019
 * Green (Roronoa Zoro / SLASH attribute): OP12-020 through OP12-039
 * Blue (Kuzan / Sanji / Navy): OP12-040 through OP12-062
 * Purple (Sanji / Baroque Works Events): OP12-063 through OP12-080
 * Black (Koala / Revolutionary Army): OP12-081 through OP12-098
 * Yellow (Kalgara / Supernovas / Life manipulation): OP12-099 through OP12-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Silvers Rayleigh / Roger Pirates (OP12-001 to OP12-019)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP12-001 Silvers Rayleigh (Leader) ─────────────────────────────────────
// Under the rules of this game, you cannot include cards with a cost of 5 or more in your deck.
// [Activate: Main] [Once Per Turn] You may reveal 2 Events from your hand:
// Up to 1 of your Characters with 4000 base power or less gains +2000 power during this turn.

export const OP12_001_SILVERS_RAYLEIGH: EffectSchema = {
  card_id: "OP12-001",
  card_name: "Silvers Rayleigh",
  card_type: "Leader",
  effects: [
    {
      id: "OP12-001_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { base_power_max: 4000 },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
  rule_modifications: [
    {
      rule_type: "DECK_RESTRICTION",
      restriction: "CANNOT_INCLUDE",
      filter: { cost_min: 5 },
    },
  ],
};

// ─── OP12-003 Crocus ────────────────────────────────────────────────────────
// [On K.O.] You may reveal 2 Events from your hand: Play up to 1 red
// Character card with 3000 power or less from your hand.

export const OP12_003_CROCUS: EffectSchema = {
  card_id: "OP12-003",
  card_name: "Crocus",
  card_type: "Character",
  effects: [
    {
      id: "OP12-003_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      flags: { optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "RED",
              power_max: 3000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP12-004 Kouzuki Oden ──────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may reveal 2 Events from your hand:
// This Character gains +2000 power during this turn.

export const OP12_004_KOUZUKI_ODEN: EffectSchema = {
  card_id: "OP12-004",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "OP12-004_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "EVENT" },
        },
      ],
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

// ─── OP12-006 Shakuyaku ─────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// [Monkey.D.Luffy] or 1 red Event and add it to your hand. Then, place the
// rest at the bottom of your deck in any order.

export const OP12_006_SHAKUYAKU: EffectSchema = {
  card_id: "OP12-006",
  card_name: "Shakuyaku",
  card_type: "Character",
  effects: [
    {
      id: "OP12-006_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Monkey.D.Luffy" },
                { card_type: "EVENT", color: "RED" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-007 Shanks ────────────────────────────────────────────────────────
// [On Play] Up to 1 of your Characters with a type including "Roger Pirates"
// other than [Shanks] gains [Rush] during this turn.

export const OP12_007_SHANKS: EffectSchema = {
  card_id: "OP12-007",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP12-007_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits_contains: ["Roger Pirates"],
              exclude_name: "Shanks",
            },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP12-008 Shanks ────────────────────────────────────────────────────────
// [Blocker]
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
// hand: Give up to 1 of your opponent's Leader or Character cards −2000 power
// during this turn.

export const OP12_008_SHANKS: EffectSchema = {
  card_id: "OP12-008",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP12-008_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-008_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
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
    },
  ],
};

// ─── OP12-009 Jinbe ─────────────────────────────────────────────────────────
// [On Play] You may reveal 2 Events from your hand: This Character gains
// [Rush] during this turn. Then, this Character gains +1000 power until the
// end of your opponent's next End Phase.

export const OP12_009_JINBE: EffectSchema = {
  card_id: "OP12-009",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "OP12-009_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-012 Buggy ─────────────────────────────────────────────────────────
// [On Play] Up to 1 of your Characters with a type including "Roger Pirates"
// other than [Buggy] gains [Blocker] until the end of your opponent's next
// End Phase.

export const OP12_012_BUGGY: EffectSchema = {
  card_id: "OP12-012",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "OP12-012_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits_contains: ["Roger Pirates"],
              exclude_name: "Buggy",
            },
          },
          params: { keyword: "BLOCKER" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP12-013 Hatchan ───────────────────────────────────────────────────────
// [Activate: Main] You may rest this Character and reveal 2 Events from your
// hand: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.

export const OP12_013_HATCHAN: EffectSchema = {
  card_id: "OP12-013",
  card_name: "Hatchan",
  card_type: "Character",
  effects: [
    {
      id: "OP12-013_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "REST_SELF" },
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP12-014 Boa Hancock ───────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// [Monkey.D.Luffy] or red Event and add it to your hand. Then, place the rest
// at the bottom of your deck in any order.
// [Activate: Main] You may trash this Character: Give up to 2 rested DON!!
// cards to your Leader or 1 of your Characters.

export const OP12_014_BOA_HANCOCK: EffectSchema = {
  card_id: "OP12-014",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "OP12-014_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Monkey.D.Luffy" },
                { card_type: "EVENT", color: "RED" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP12-014_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP12-015 Monkey.D.Luffy ────────────────────────────────────────────────
// If you have a total of 2 or more given DON!! cards, this Character gains
// +2000 power.
// [On Play] You may reveal 2 Events from your hand: Play up to 1 red Character
// card with 3000 power or less from your hand. Then, give up to 1 rested DON!!
// card to your Leader or 1 of your Characters.

export const OP12_015_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP12-015",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP12-015_permanent_power",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
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
      id: "OP12-015_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { card_type: "EVENT" },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "RED",
              power_max: 3000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-016 To Never Doubt--That Is Power! (Event) ────────────────────────
// [Main] You may give 2 active DON!! cards to 1 of your [Silvers Rayleigh]:
// Your opponent cannot activate [Blocker] when the card given these DON!!
// cards attacks during this turn.
// [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000
// power during this battle.

export const OP12_016_TO_NEVER_DOUBT: EffectSchema = {
  card_id: "OP12-016",
  card_name: "To Never Doubt--That Is Power!",
  card_type: "Event",
  effects: [
    {
      id: "OP12-016_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        {
          type: "GIVE_OPPONENT_DON",
          amount: 2,
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Silvers Rayleigh" },
          },
        },
      ],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "OPPONENT_LEADER" },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
            scope: {
              when_attacking: {
                type: "LEADER_OR_CHARACTER",
                controller: "SELF",
                filter: { name: "Silvers Rayleigh" },
              },
            },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP12-016_counter",
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

// ─── OP12-017 Color of Observation Haki (Event) ─────────────────────────────
// [Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]:
// Look at 4 cards from the top of your deck; reveal up to 1 red Event or up to
// 1 Character card with a cost of 3 or more and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.

export const OP12_017_COLOR_OF_OBSERVATION_HAKI: EffectSchema = {
  card_id: "OP12-017",
  card_name: "Color of Observation Haki",
  card_type: "Event",
  effects: [
    {
      id: "OP12-017_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        {
          type: "GIVE_OPPONENT_DON",
          amount: 1,
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Silvers Rayleigh" },
          },
        },
      ],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { card_type: "EVENT", color: "RED" },
                { card_type: "CHARACTER", cost_min: 3 },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-018 Color of the Supreme King Haki (Event) ────────────────────────
// [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000
// power during this battle. Then, you may rest 1 of your DON!! cards. If you
// do, give your opponent's Leader and all of their Characters −1000 power
// during this turn.

export const OP12_018_COLOR_OF_THE_SUPREME_KING_HAKI: EffectSchema = {
  card_id: "OP12-018",
  card_name: "Color of the Supreme King Haki",
  card_type: "Event",
  effects: [
    {
      id: "OP12-018_counter",
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
        {
          type: "REST_DON",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: {},
          chain: "THEN",
          conditions: { type: "SELF_STATE", required_state: "ACTIVE" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { all: true },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP12-019 Color of Arms Haki (Event) ────────────────────────────────────
// [Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]:
// Up to 1 of your Leader or Character cards gains +1000 power during this turn.
// [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000
// power during this battle.

export const OP12_019_COLOR_OF_ARMS_HAKI: EffectSchema = {
  card_id: "OP12-019",
  card_name: "Color of Arms Haki",
  card_type: "Event",
  effects: [
    {
      id: "OP12-019_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        {
          type: "GIVE_OPPONENT_DON",
          amount: 1,
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Silvers Rayleigh" },
          },
        },
      ],
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
      id: "OP12-019_counter",
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

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Roronoa Zoro / SLASH attribute (OP12-020 to OP12-039)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP12-020 Roronoa Zoro (Leader) ─────────────────────────────────────────
// [DON!! x3] [Activate: Main] [Once Per Turn] If this Leader battles your
// opponent's Character during this turn, set this Leader as active. Then, this
// Leader cannot attack your opponent's Characters with a base cost of 7 or
// less during this turn.

export const OP12_020_RORONOA_ZORO: EffectSchema = {
  card_id: "OP12-020",
  card_name: "Roronoa Zoro",
  card_type: "Leader",
  effects: [
    {
      id: "OP12-020_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 3 },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
          conditions: {
            type: "ACTION_PERFORMED_THIS_TURN",
            controller: "SELF",
            action: "ATTACKED",
            filter: { card_type: "CHARACTER" },
          },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "SELF" },
          params: {
            prohibition_type: "CANNOT_ATTACK",
            scope: {
              filter: { card_type: "CHARACTER", base_cost_max: 7 },
            },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-021 Ipponmatsu ────────────────────────────────────────────────────
// If your Leader has the SLASH attribute and you have 6 or more rested DON!!
// cards, this Character cannot be rested by your opponent's effects.
// [Blocker]

export const OP12_021_IPPONMATSU: EffectSchema = {
  card_id: "OP12-021",
  card_name: "Ipponmatsu",
  card_type: "Character",
  effects: [
    {
      id: "OP12-021_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-021_cannot_be_rested",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { attribute: "SLASH" },
          },
          {
            type: "RESTED_CARD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 6,
          },
        ],
      },
      prohibitions: [
        {
          type: "CANNOT_BE_RESTED",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
  ],
};

// ─── OP12-022 Inuarashi ─────────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: Up to 1 of your opponent's
// rested Characters with a cost of 5 or less will not become active in your
// opponent's next Refresh Phase.

export const OP12_022_INUARASHI: EffectSchema = {
  card_id: "OP12-022",
  card_name: "Inuarashi",
  card_type: "Character",
  effects: [
    {
      id: "OP12-022_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5, is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

// ─── OP12-024 Gyukimaru ─────────────────────────────────────────────────────
// If this Character is active, this Character cannot be K.O.'d by your
// opponent's effects.
// [When Attacking] If you have a total of 3 or more given DON!! cards, rest
// up to 1 of your opponent's Characters with a base cost of 6 or less.

export const OP12_024_GYUKIMARU: EffectSchema = {
  card_id: "OP12-024",
  card_name: "Gyukimaru",
  card_type: "Character",
  effects: [
    {
      id: "OP12-024_ko_protection",
      category: "permanent",
      conditions: {
        type: "SELF_STATE",
        required_state: "ACTIVE",
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
    {
      id: "OP12-024_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "ANY_CARD_HAS_DON",
        operator: ">=",
        value: 3,
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 6 },
          },
        },
      ],
    },
  ],
};

// ─── OP12-026 Kuina ─────────────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: Rest up to 1 of your
// opponent's Characters with a base cost of 4 or less. Then, give up to 3
// rested DON!! cards to your [Roronoa Zoro] Leader.

export const OP12_026_KUINA: EffectSchema = {
  card_id: "OP12-026",
  card_name: "Kuina",
  card_type: "Character",
  effects: [
    {
      id: "OP12-026_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 4 },
          },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Roronoa Zoro" },
          },
          params: { amount: 3, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-027 Koushirou ─────────────────────────────────────────────────────
// If your SLASH attribute Character with a cost of 5 or less other than this
// Character would be K.O.'d by your opponent's effect, you may rest this
// Character instead.
// [Blocker]

export const OP12_027_KOUSHIROU: EffectSchema = {
  card_id: "OP12-027",
  card_name: "Koushirou",
  card_type: "Character",
  effects: [
    {
      id: "OP12-027_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-027_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          attribute: "SLASH",
          cost_max: 5,
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP12-028 Kouzuki Hiyori ────────────────────────────────────────────────
// [Activate: Main] You may rest 1 of your DON!! cards and this Character: If
// your Leader is [Roronoa Zoro], look at 5 cards from the top of your deck;
// reveal up to 1 SLASH attribute card or green Event and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP12_028_KOUZUKI_HIYORI: EffectSchema = {
  card_id: "OP12-028",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "OP12-028_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Roronoa Zoro" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { attribute: "SLASH" },
                { card_type: "EVENT", color: "GREEN" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-029 Shimotsuki Kouzaburou ─────────────────────────────────────────
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 2 or
// less. Then, K.O. up to 1 of your opponent's rested Characters with a base
// cost of 1 or less.

export const OP12_029_SHIMOTSUKI_KOUZABUROU: EffectSchema = {
  card_id: "OP12-029",
  card_name: "Shimotsuki Kouzaburou",
  card_type: "Character",
  effects: [
    {
      id: "OP12-029_on_play",
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
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 1, is_rested: true },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-030 Dracule Mihawk ────────────────────────────────────────────────
// [Blocker]
// [On Play] Set up to 4 of your DON!! cards as active. Then, you cannot play
// Character cards with a base cost of 7 or more during this turn.

export const OP12_030_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP12-030",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "OP12-030_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-030_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 4 },
          },
          params: { amount: 4 },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "SELF" },
          params: {
            prohibition_type: "CANNOT_PLAY_CHARACTER",
            scope: { cost_filter: { operator: ">=", value: 7 } },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-031 Tashigi ───────────────────────────────────────────────────────
// [On Play] Rest up to 1 of your opponent's Characters with a base cost of 6
// or less. Then, give up to 3 rested DON!! cards to your [Roronoa Zoro] Leader.

export const OP12_031_TASHIGI: EffectSchema = {
  card_id: "OP12-031",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "OP12-031_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 6 },
          },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Roronoa Zoro" },
          },
          params: { amount: 3, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-033 Helmeppo ──────────────────────────────────────────────────────
// [Blocker]
// [On Block] Rest up to 1 of your opponent's Characters with a cost of 5 or less.

export const OP12_033_HELMEPPO: EffectSchema = {
  card_id: "OP12-033",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "OP12-033_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-033_on_block",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
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

// ─── OP12-034 Perona ────────────────────────────────────────────────────────
// [On Play] If your Leader has the SLASH attribute, look at 5 cards from the
// top of your deck; reveal up to 1 SLASH attribute card or green Event and add
// it to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP12_034_PERONA: EffectSchema = {
  card_id: "OP12-034",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "OP12-034_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { attribute: "SLASH" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { attribute: "SLASH" },
                { card_type: "EVENT", color: "GREEN" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-036 Roronoa Zoro ──────────────────────────────────────────────────
// This card in your hand cannot be played by effects.
// If your Leader has the SLASH attribute, this Character cannot be K.O.'d in
// battle by SLASH attribute cards and gains +1000 power.

export const OP12_036_RORONOA_ZORO: EffectSchema = {
  card_id: "OP12-036",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP12-036_cannot_be_played",
      category: "permanent",
      zone: "HAND",
      prohibitions: [
        {
          type: "CANNOT_BE_PLAYED_BY_EFFECTS",
        },
      ],
    },
    {
      id: "OP12-036_battle_protection",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { attribute: "SLASH" },
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: {
            cause: "BATTLE",
            source_filter: { attribute: "SLASH" },
          },
        },
      ],
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

// ─── OP12-037 Demon Aura Nine Sword Style Asura Blades Drawn Dead Man's Game (Event)
// [Main] You may rest 3 of your DON!! cards: Rest up to a total of 2 of your
// opponent's Characters or DON!! cards.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP12_037_DEMON_AURA_NINE_SWORD_STYLE: EffectSchema = {
  card_id: "OP12-037",
  card_name: "Demon Aura Nine Sword Style Asura Blades Drawn Dead Man's Game",
  card_type: "Event",
  effects: [
    {
      id: "OP12-037_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "REST_DON", amount: 3 },
      ],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            mixed_pool: {
              types: ["CHARACTER", "DON_IN_COST_AREA"],
              total_count: { up_to: 2 },
            },
          },
        },
      ],
    },
    {
      id: "OP12-037_counter",
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

// ─── OP12-038 Two-Sword Style Rashomon (Event) ──────────────────────────────
// [Main] You may rest 2 of your DON!! cards: K.O. up to 2 of your opponent's
// rested Characters with a base cost of 4 or less.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP12_038_TWO_SWORD_STYLE_RASHOMON: EffectSchema = {
  card_id: "OP12-038",
  card_name: "Two-Sword Style Rashomon",
  card_type: "Event",
  effects: [
    {
      id: "OP12-038_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "REST_DON", amount: 2 },
      ],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { base_cost_max: 4, is_rested: true },
          },
        },
      ],
    },
    {
      id: "OP12-038_counter",
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

// ─── OP12-039 Luffy Is the Man Who Will Become the King of Pirates!!! (Event)
// [Main] Set your [Roronoa Zoro] Leader as active.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.

export const OP12_039_LUFFY_IS_THE_MAN: EffectSchema = {
  card_id: "OP12-039",
  card_name: "Luffy Is the Man Who Will Become the King of Pirates!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP12-039_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Roronoa Zoro" },
          },
        },
      ],
    },
    {
      id: "OP12-039_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Kuzan / Sanji / Navy (OP12-040 to OP12-062)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP12-040 Kuzan (Leader) ────────────────────────────────────────────────
// When a card is trashed from your hand by your {Navy} type card's effect,
// draw cards equal to the number of cards trashed.

export const OP12_040_KUZAN: EffectSchema = {
  card_id: "OP12-040",
  card_name: "Kuzan",
  card_type: "Leader",
  effects: [
    {
      id: "OP12-040_effect_1",
      category: "auto",
      trigger: {
        event: "CARD_ADDED_TO_HAND_FROM_LIFE",
      },
      actions: [
        {
          type: "DRAW",
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_TRASHED_THIS_WAY",
              multiplier: 1,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP12-041 Sanji (Leader) ────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] DON!! −1: Activate up to 1 {Straw Hat Crew}
// type Event with a base cost of 3 or less from your hand.
// [When Attacking] If the number of DON!! cards on your field is equal to or
// less than the number on your opponent's field, add up to 1 DON!! card from
// your DON!! deck and rest it.

export const OP12_041_SANJI: EffectSchema = {
  card_id: "OP12-041",
  card_name: "Sanji",
  card_type: "Leader",
  effects: [
    {
      id: "OP12-041_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "ACTIVATE_EVENT_FROM_HAND",
          target: {
            type: "EVENT_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Straw Hat Crew"],
              base_cost_max: 3,
            },
          },
        },
      ],
    },
    {
      id: "OP12-041_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
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

// ─── OP12-042 Alvida ────────────────────────────────────────────────────────
// If you have 2 or more Characters with a base cost of 5 or more, this
// Character gains +1 cost.
// [On Play] Place up to 1 of your opponent's Characters with a base cost of
// 1 or less at the bottom of the owner's deck.

export const OP12_042_ALVIDA: EffectSchema = {
  card_id: "OP12-042",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      id: "OP12-042_permanent_cost",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_cost_min: 5 },
        count: { operator: ">=", value: 2 },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP12-042_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP12-043 Kuzan ─────────────────────────────────────────────────────────
// If you have 5 or more cards in your hand, this Character gains +1 cost.
// [On Play] You may trash 1 card from your hand: Up to 1 of your opponent's
// Characters cannot attack until the end of your opponent's next End Phase.

export const OP12_043_KUZAN: EffectSchema = {
  card_id: "OP12-043",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "OP12-043_permanent_cost",
      category: "permanent",
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 5,
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP12-043_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP12-044 Sakazuki ──────────────────────────────────────────────────────
// [On Play] If your Leader has the {Navy} type, draw 2 cards.
// [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: Give
// up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const OP12_044_SAKAZUKI: EffectSchema = {
  card_id: "OP12-044",
  card_name: "Sakazuki",
  card_type: "Character",
  effects: [
    {
      id: "OP12-044_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
    {
      id: "OP12-044_activate",
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
            count: { exact: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP12-046 Zephyr(Navy) ──────────────────────────────────────────────────
// [On Play] Trash 2 cards from your hand.
// [Activate: Main] You may trash this Character: Return up to 1 Character with
// a cost of 5 or less to the owner's hand.

export const OP12_046_ZEPHYR: EffectSchema = {
  card_id: "OP12-046",
  card_name: "Zephyr",
  card_type: "Character",
  effects: [
    {
      id: "OP12-046_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 2 },
          },
          params: { amount: 2 },
        },
      ],
    },
    {
      id: "OP12-046_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP12-047 Sengoku ───────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Look at 5 cards from the top
// of your deck; reveal up to 2 {Navy} type cards other than [Sengoku] and add
// them to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP12_047_SENGOKU: EffectSchema = {
  card_id: "OP12-047",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "OP12-047_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: {
              traits: ["Navy"],
              exclude_name: "Sengoku",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-048 Donquixote Rosinante ──────────────────────────────────────────
// [Opponent's Turn] If your blue {Navy} type Character would be removed from
// the field by your opponent's effect, you may rest this Character and trash
// 1 card from your hand instead.

export const OP12_048_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP12-048",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "OP12-048_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          color: "BLUE",
          traits: ["Navy"],
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: { type: "SELF" },
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
      flags: { optional: true },
    },
  ],
};

// ─── OP12-050 Jaguar.D.Saul ─────────────────────────────────────────────────
// [Blocker]

export const OP12_050_JAGUAR_D_SAUL: EffectSchema = {
  card_id: "OP12-050",
  card_name: "Jaguar.D.Saul",
  card_type: "Character",
  effects: [
    {
      id: "OP12-050_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP12-051 Hina ──────────────────────────────────────────────────────────
// [Activate: Main] You may rest this Character and trash 1 card from your
// hand: Up to 1 of your opponent's Characters with a base cost of 4 or less
// cannot activate [Blocker] during this turn.

export const OP12_051_HINA: EffectSchema = {
  card_id: "OP12-051",
  card_name: "Hina",
  card_type: "Character",
  effects: [
    {
      id: "OP12-051_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 4 },
          },
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP12-053 Borsalino ─────────────────────────────────────────────────────
// [Once Per Turn] If this Character would be removed from the field by your
// opponent's effect, you may trash 1 card from your hand instead.
// [Opponent's Turn] If your Leader has the {Navy} type, this Character gains
// [Blocker] and +1000 power.

export const OP12_053_BORSALINO: EffectSchema = {
  card_id: "OP12-053",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "OP12-053_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP12-053_opponent_turn",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
  ],
};

// ─── OP12-054 Marshall.D.Teach ──────────────────────────────────────────────
// [On Play] If your Leader has the {The Seven Warlords of the Sea} type,
// return up to 1 Character with a cost of 1 or less other than this Character
// to the owner's hand.

export const OP12_054_MARSHALL_D_TEACH: EffectSchema = {
  card_id: "OP12-054",
  card_name: "Marshall.D.Teach",
  card_type: "Character",
  effects: [
    {
      id: "OP12-054_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Seven Warlords of the Sea" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP12-056 Monkey.D.Garp ─────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Play up to 1 blue {Navy} type
// Character card with 8000 power or less other than [Monkey.D.Garp] from your hand.

export const OP12_056_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP12-056",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "OP12-056_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "BLUE",
              traits: ["Navy"],
              power_max: 8000,
              exclude_name: "Monkey.D.Garp",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP12-057 Ice Block Pheasant Peck (Event) ───────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, trash 1 card from your hand.
// [Trigger] You may trash 1 card from your hand: Draw 1 card.

export const OP12_057_ICE_BLOCK_PHEASANT_PECK: EffectSchema = {
  card_id: "OP12-057",
  card_name: "Ice Block Pheasant Peck",
  card_type: "Event",
  effects: [
    {
      id: "OP12-057_counter",
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
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP12-057_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP12-058 I Will Make Whitebeard the King (Event) — Main reveal conditional play + Rush + Trigger draw
// [Main] If your Leader's type includes "Whitebeard Pirates", reveal 1 card from the top of your deck.
// If that card is a Character card with a type including "Whitebeard Pirates" and a cost of 9 or less,
// you may play that card. If you do, that Character gains [Rush] during this turn.
// [Trigger] Draw 1 card.

export const OP12_058_I_WILL_MAKE_WHITEBEARD_THE_KING: EffectSchema = {
  card_id: "OP12-058",
  card_name: "I Will Make Whitebeard the King",
  card_type: "Event",
  effects: [
    {
      id: "main_reveal_play",
      category: "activate",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "PLAY_CARD",
          target: { type: "SELECTED_CARDS", ref: "revealed" },
          params: { source_zone: "DECK", cost_override: "FREE" },
          chain: "THEN",
          result_ref: "played",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Whitebeard Pirates"], card_type: "CHARACTER", cost_max: 9 },
          },
        },
        {
          type: "GRANT_KEYWORD",
          target_ref: "played",
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "IF_DO",
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

// ─── OP12-059 Concasser (Event) ─────────────────────────────────────────────
// [Main] If your Leader is [Sanji], draw 1 card.
// [Counter] If you have 4 or more Events in your trash, up to 1 of your Leader
// gains +4000 power during this battle.

export const OP12_059_CONCASSER: EffectSchema = {
  card_id: "OP12-059",
  card_name: "Concasser",
  card_type: "Event",
  effects: [
    {
      id: "OP12-059_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP12-059_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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
            type: "YOUR_LEADER",
            count: { up_to: 1 },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP12-060 Boeuf Burst (Event) ───────────────────────────────────────────
// [Main] If your Leader is multicolored, choose one:
// • Return up to 1 of your opponent's Characters with a cost of 4 or less to
//   the owner's hand.
// • If you have 6 or less cards in your hand, draw 2 cards.

export const OP12_060_BOEUF_BURST: EffectSchema = {
  card_id: "OP12-060",
  card_name: "Boeuf Burst",
  card_type: "Event",
  effects: [
    {
      id: "OP12-060_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "RETURN_TO_HAND",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 4 },
                  },
                },
              ],
              [
                {
                  type: "DRAW",
                  params: { amount: 2 },
                  conditions: {
                    type: "HAND_COUNT",
                    controller: "SELF",
                    operator: "<=",
                    value: 6,
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

// ─── OP12-061 Donquixote Rosinante — replacement KO protection + next-play cost reduction
// [Once Per Turn] If your [Trafalgar Law] would be K.O.'d, you may add 1 card
// from the top of your Life cards to your hand instead.
// [Activate: Main] [Once Per Turn] DON!! −1: The next time you play [Trafalgar Law]
// with a cost of 4 or more from your hand during this turn, the cost will be reduced by 2.

export const OP12_061_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP12-061",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "OP12-061_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          name: "Trafalgar Law",
        },
      },
      replacement_actions: [
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "OP12-061_activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "APPLY_ONE_TIME_MODIFIER",
          params: {
            modification: {
              type: "MODIFY_COST",
              params: { amount: -2 },
            },
            applies_to: {
              action: "MODIFY_COST",
              filter: { name: "Trafalgar Law", costMin: 4 },
            },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP12-062 Vinsmoke Sora ─────────────────────────────────────────────────
// [On Play] If your Leader is [Sanji] and the number of DON!! cards on your
// field is equal to or less than the number on your opponent's field, add up
// to 1 DON!! card from your DON!! deck and rest it. Then, draw 1 card.

export const OP12_062_VINSMOKE_SORA: EffectSchema = {
  card_id: "OP12-062",
  card_name: "Vinsmoke Sora",
  card_type: "Character",
  effects: [
    {
      id: "OP12-062_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Sanji" },
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
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Sanji / Baroque Works Events (OP12-063 to OP12-080)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP12-063 Vinsmoke Reiju ────────────────────────────────────────────────
// If you have 4 or more Events in your trash, this Character gains +2000
// power and +5 cost.
// [Blocker]

export const OP12_063_VINSMOKE_REIJU: EffectSchema = {
  card_id: "OP12-063",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "OP12-063_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-063_permanent",
      category: "permanent",
      conditions: {
        type: "CARD_TYPE_IN_ZONE",
        controller: "SELF",
        card_type: "EVENT",
        zone: "TRASH",
        operator: ">=",
        value: 4,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 5 },
        },
      ],
    },
  ],
};

// ─── OP12-065 Emporio.Ivankov ───────────────────────────────────────────────
// If you have 4 or more Events in your trash, this Character gains [Blocker].
// [On K.O.] Add up to 1 Event from your trash to your hand.

export const OP12_065_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP12-065",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "OP12-065_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_TYPE_IN_ZONE",
        controller: "SELF",
        card_type: "EVENT",
        zone: "TRASH",
        operator: ">=",
        value: 4,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
    {
      id: "OP12-065_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "EVENT" },
          },
        },
      ],
    },
  ],
};

// ─── OP12-066 Carne ─────────────────────────────────────────────────────────
// If you have 4 or more Events in your trash, this Character gains [Blocker].

export const OP12_066_CARNE: EffectSchema = {
  card_id: "OP12-066",
  card_name: "Carne",
  card_type: "Character",
  effects: [
    {
      id: "OP12-066_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_TYPE_IN_ZONE",
        controller: "SELF",
        card_type: "EVENT",
        zone: "TRASH",
        operator: ">=",
        value: 4,
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

// ─── OP12-069 Crocodile ─────────────────────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1: If your Leader's type
// includes "Baroque Works", up to 1 of your Leader or Character cards gains
// +2000 power during this battle.

export const OP12_069_CROCODILE: EffectSchema = {
  card_id: "OP12-069",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "OP12-069_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP12-070 Sanji ─────────────────────────────────────────────────────────
// This Character gains +1000 power for every 5 Events in your trash.
// If this Character would be removed from the field by your opponent's effect,
// you may return 1 DON!! card from your field to your DON!! deck instead.

export const OP12_070_SANJI: EffectSchema = {
  card_id: "OP12-070",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP12-070_permanent_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "EVENTS_IN_TRASH",
              multiplier: 1000,
              divisor: 5,
            },
          },
        },
      ],
    },
    {
      id: "OP12-070_replacement",
      category: "replacement",
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "RETURN_DON_TO_DECK",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP12-071 Charlotte Pudding ─────────────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1 [Sanji]
// or Event card and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.

export const OP12_071_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "OP12-071",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "OP12-071_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Sanji" },
                { card_type: "EVENT" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-072 Zeff ──────────────────────────────────────────────────────────
// When a DON!! card on your field is returned to your DON!! deck, if your
// Leader is [Sanji], this Character gains [Rush] during this turn.

export const OP12_072_ZEFF: EffectSchema = {
  card_id: "OP12-072",
  card_name: "Zeff",
  card_type: "Character",
  effects: [
    {
      id: "OP12-072_effect_1",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
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

// ─── OP12-073 Trafalgar Law ─────────────────────────────────────────────────
// [On Play] If the number of DON!! cards on your field is equal to or less
// than the number on your opponent's field, add up to 1 DON!! card from your
// DON!! deck and set it as active. Then, all of your [Donquixote Rosinante]
// and {Heart Pirates} type Characters gain +1000 power until the end of your
// opponent's next End Phase.

export const OP12_073_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP12-073",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "OP12-073_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: {
              any_of: [
                { name: "Donquixote Rosinante" },
                { traits: ["Heart Pirates"] },
              ],
            },
          },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-074 Patty ─────────────────────────────────────────────────────────
// [On Play] You may trash 1 Event from your hand: If your Leader is [Sanji],
// add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP12_074_PATTY: EffectSchema = {
  card_id: "OP12-074",
  card_name: "Patty",
  card_type: "Character",
  effects: [
    {
      id: "OP12-074_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "EVENT" },
        },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP12-075 Ms. All Sunday ────────────────────────────────────────────────
// [On Play] K.O. up to 1 of your opponent's Characters with a cost of 3 or
// less. Then, your opponent may add 1 DON!! card from their DON!! deck and
// set it as active.
// [Trigger] DON!! −1: Play this card.

export const OP12_075_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP12-075",
  card_name: "Ms. All Sunday",
  card_type: "Character",
  effects: [
    {
      id: "OP12-075_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "ADD_DON_FROM_DECK",
              params: { amount: 1, target_state: "ACTIVE" },
            },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP12-075_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP12-077 The "Extinguishes All Sound Created by Your Influence" Technique (Event)
// [Main] Select up to 1 of your [Trafalgar Law] cards and that card gains
// +2000 power during this turn. Then, if the selected card attacks during this
// turn, your opponent cannot activate [Blocker].
// [Trigger] Draw 1 card.

export const OP12_077_EXTINGUISHES_ALL_SOUND: EffectSchema = {
  card_id: "OP12-077",
  card_name: 'The "Extinguishes All Sound Created by Your Influence" Technique',
  card_type: "Event",
  effects: [
    {
      id: "OP12-077_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Trafalgar Law" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "OPPONENT_LEADER" },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
            scope: {
              when_attacking: {
                type: "LEADER_OR_CHARACTER",
                controller: "SELF",
                filter: { name: "Trafalgar Law" },
              },
            },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP12-077_trigger",
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

// ─── OP12-078 Brochette Blow (Event) ────────────────────────────────────────
// [Main] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field, draw 1 card. Then, give up to 1 of
// your opponent's Characters −3000 power during this turn.

export const OP12_078_BROCHETTE_BLOW: EffectSchema = {
  card_id: "OP12-078",
  card_name: "Brochette Blow",
  card_type: "Event",
  effects: [
    {
      id: "OP12-078_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-079 Luffy Is the Man Who Will Be King of the Pirates!!! (Event) ──
// [Main] If your Leader is [Sanji], look at 3 cards from the top of your deck
// and add up to 1 card to your hand. Then, place the rest at the bottom of
// your deck in any order.

export const OP12_079_LUFFY_IS_THE_MAN_KING: EffectSchema = {
  card_id: "OP12-079",
  card_name: "Luffy Is the Man Who Will Be King of the Pirates!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP12-079_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-080 Baratie (Stage) ───────────────────────────────────────────────
// [Activate: Main] You may place this Stage at the bottom of the owner's deck:
// If your Leader is [Sanji], look at 3 cards from the top of your deck; reveal
// up to 1 Event and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.
// [Trigger] Play this card.

export const OP12_080_BARATIE: EffectSchema = {
  card_id: "OP12-080",
  card_name: "Baratie",
  card_type: "Stage",
  effects: [
    {
      id: "OP12-080_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "PLACE_STAGE_TO_DECK", position: "BOTTOM" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { card_type: "EVENT" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP12-080_trigger",
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
// BLACK — Koala / Revolutionary Army (OP12-081 to OP12-098)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP12-081 Koala (Leader) ────────────────────────────────────────────────
// When this Leader attacks your opponent's Leader, if you have 2 or more
// Characters with a cost of 8 or more, draw 1 card.
// [Once Per Turn] This effect can be activated when your opponent plays a
// Character with a base cost of 8 or more, or when your opponent plays a
// Character using a Character's effect. Your opponent adds 1 card from the
// top of their Life cards to their hand.

export const OP12_081_KOALA: EffectSchema = {
  card_id: "OP12-081",
  card_name: "Koala",
  card_type: "Leader",
  effects: [
    {
      id: "OP12-081_when_attacking",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
      },
      conditions: {
        all_of: [
          {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
            count: { operator: ">=", value: 2 },
          },
        ],
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP12-081_opponent_play",
      category: "auto",
      trigger: {
        any_of: [
          {
            event: "CHARACTER_PLAYED",
            filter: {
              controller: "OPPONENT",
              target_filter: { base_cost_min: 8 },
            },
          },
          {
            event: "CHARACTER_PLAYED",
            filter: {
              controller: "OPPONENT",
              cause: "BY_CHARACTER_EFFECT",
            },
          },
        ],
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "LIFE_TO_HAND",
              params: { amount: 1, position: "TOP" },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP12-084 Emporio.Ivankov ───────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader has the {Revolutionary Army} type, trash 3 cards
// from the top of your deck.

export const OP12_084_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP12-084",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "OP12-084_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-084_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
      ],
    },
  ],
};

// ─── OP12-085 Karasu ────────────────────────────────────────────────────────
// If your Leader has the {Revolutionary Army} type, this Character gains +3 cost.
// [When Attacking] If your Leader has the {Revolutionary Army} type and your
// opponent has 5 or more cards in their hand, your opponent trashes 1 card
// from their hand.

export const OP12_085_KARASU: EffectSchema = {
  card_id: "OP12-085",
  card_name: "Karasu",
  card_type: "Character",
  effects: [
    {
      id: "OP12-085_permanent_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "OP12-085_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Revolutionary Army" },
          },
          {
            type: "HAND_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 5,
          },
        ],
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              target: {
                type: "CARD_IN_HAND",
                controller: "OPPONENT",
                count: { exact: 1 },
              },
              params: { amount: 1 },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP12-086 Koala ─────────────────────────────────────────────────────────
// [On Play] If your Leader has the {Revolutionary Army} type, look at 3 cards
// from the top of your deck; reveal up to 1 {Revolutionary Army} type card
// other than [Koala] or up to 1 [Nico Robin] and add it to your hand. Then,
// trash the rest.

export const OP12_086_KOALA: EffectSchema = {
  card_id: "OP12-086",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "OP12-086_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { traits: ["Revolutionary Army"], exclude_name: "Koala" },
                { name: "Nico Robin" },
              ],
            },
          },
        },
      ],
    },
  ],
};

// ─── OP12-087 Nico Robin ────────────────────────────────────────────────────
// If your Leader is [Koala] or [Monkey.D.Luffy], this Character gains
// [Blocker] and +3 cost.
// [On Play] You may trash 1 card from your hand: If your opponent has 5 or
// more cards in their hand, your opponent trashes 2 cards from their hand.

export const OP12_087_NICO_ROBIN: EffectSchema = {
  card_id: "OP12-087",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "OP12-087_permanent",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Koala" },
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
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "OP12-087_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 5,
      },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              target: {
                type: "CARD_IN_HAND",
                controller: "OPPONENT",
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

// ─── OP12-089 Hack ──────────────────────────────────────────────────────────
// If your Leader has the {Revolutionary Army} type, this Character gains
// [Blocker] and +4 cost.
// [On K.O.] If your Leader has the {Revolutionary Army} type, K.O. up to 1 of
// your opponent's Characters with a base cost of 4 or less.

export const OP12_089_HACK: EffectSchema = {
  card_id: "OP12-089",
  card_name: "Hack",
  card_type: "Character",
  effects: [
    {
      id: "OP12-089_permanent",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
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
          params: { amount: 4 },
        },
      ],
    },
    {
      id: "OP12-089_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP12-090 Belo Betty ────────────────────────────────────────────────────
// [When Attacking] You may trash 2 cards from the top of your deck: Give up
// to 1 of your opponent's Characters −2 cost during this turn.

export const OP12_090_BELO_BETTY: EffectSchema = {
  card_id: "OP12-090",
  card_name: "Belo Betty",
  card_type: "Character",
  effects: [
    {
      id: "OP12-090_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 2,
        },
      ],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP12-091 Poker ─────────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may place 3 cards from your trash at
// the bottom of your deck in any order: Up to 2 of your {SMILE} type
// Characters gain +2000 power during this turn.

export const OP12_091_POKER: EffectSchema = {
  card_id: "OP12-091",
  card_name: "Poker",
  card_type: "Character",
  effects: [
    {
      id: "OP12-091_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 3, position: "BOTTOM" },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 2 },
            filter: { traits: ["SMILE"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP12-093 Morley ────────────────────────────────────────────────────────
// If your Leader has the {Revolutionary Army} type, this Character gains +4 cost.

export const OP12_093_MORLEY: EffectSchema = {
  card_id: "OP12-093",
  card_name: "Morley",
  card_type: "Character",
  effects: [
    {
      id: "OP12-093_permanent_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 4 },
        },
      ],
    },
  ],
};

// ─── OP12-094 Monkey.D.Dragon ───────────────────────────────────────────────
// [On Play] You may place 3 {Revolutionary Army} type cards from your trash
// at the bottom of your deck in any order: If your Leader has the
// {Revolutionary Army} type, play up to 1 Character card with a cost of 6 or
// less from your trash.

export const OP12_094_MONKEY_D_DRAGON: EffectSchema = {
  card_id: "OP12-094",
  card_name: "Monkey.D.Dragon",
  card_type: "Character",
  effects: [
    {
      id: "OP12-094_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 3,
          position: "BOTTOM",
          filter: { traits: ["Revolutionary Army"] },
        },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP12-095 Lindbergh ─────────────────────────────────────────────────────
// If your Leader has the {Revolutionary Army} type, this Character gains +4 cost.
// [On Play] Draw 1 card and trash 1 card from your hand.

export const OP12_095_LINDBERGH: EffectSchema = {
  card_id: "OP12-095",
  card_name: "Lindbergh",
  card_type: "Character",
  effects: [
    {
      id: "OP12-095_permanent_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Revolutionary Army" },
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 4 },
        },
      ],
    },
    {
      id: "OP12-095_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── OP12-096 Ursa Shock (Event) ────────────────────────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.
// If you have a Character with a cost of 8 or more, you may select your
// opponent's Character with a cost of 6 or less instead.
// [Trigger] Draw 1 card and trash 1 card from the top of your deck.

export const OP12_096_URSA_SHOCK: EffectSchema = {
  card_id: "OP12-096",
  card_name: "Ursa Shock",
  card_type: "Event",
  effects: [
    {
      id: "OP12-096_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          conditions: {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { card_type: "CHARACTER", cost_min: 8 },
              count: { operator: ">=", value: 1 },
            },
          },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", cost_min: 8 },
            count: { operator: ">=", value: 1 },
          },
        },
      ],
    },
    {
      id: "OP12-096_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "MILL",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP12-097 Captains Assembled (Event) ────────────────────────────────────
// [Main] Look at 3 cards from the top of your deck; reveal up to 1
// {Revolutionary Army} type card other than [Captains Assembled] and add it
// to your hand. Then, trash the rest.
// [Trigger] Activate this card's [Main] effect.

export const OP12_097_CAPTAINS_ASSEMBLED: EffectSchema = {
  card_id: "OP12-097",
  card_name: "Captains Assembled",
  card_type: "Event",
  effects: [
    {
      id: "OP12-097_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Revolutionary Army"],
              exclude_name: "Captains Assembled",
            },
          },
        },
      ],
    },
    {
      id: "OP12-097_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "OP12-097_main" },
        },
      ],
    },
  ],
};

// ─── OP12-098 Hair Removal Fist (Event) ─────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have a {Revolutionary Army} type Character with a
// cost of 8 or more, that card gains an additional +2000 power during this battle.
// [Trigger] Draw 1 card and trash 1 card from the top of your deck.

export const OP12_098_HAIR_REMOVAL_FIST: EffectSchema = {
  card_id: "OP12-098",
  card_name: "Hair Removal Fist",
  card_type: "Event",
  effects: [
    {
      id: "OP12-098_counter",
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
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          result_ref: "boosted_card",
        },
        {
          type: "MODIFY_POWER",
          target_ref: "boosted_card",
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: {
              card_type: "CHARACTER",
              traits: ["Revolutionary Army"],
              cost_min: 8,
            },
            count: { operator: ">=", value: 1 },
          },
        },
      ],
    },
    {
      id: "OP12-098_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "MILL",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Kalgara / Supernovas / Life manipulation (OP12-099 to OP12-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP12-099 Kalgara (Leader) ──────────────────────────────────────────────
// [Your Turn] When a card is removed from your or your opponent's Life cards,
// draw 1 card. Then, you cannot draw cards using your own effects during this turn.

export const OP12_099_KALGARA: EffectSchema = {
  card_id: "OP12-099",
  card_name: "Kalgara",
  card_type: "Leader",
  effects: [
    {
      id: "OP12-099_effect_1",
      category: "auto",
      trigger: {
        event: "CARD_REMOVED_FROM_LIFE",
        filter: { controller: "EITHER" },
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "SELF" },
          params: {
            prohibition_type: "CANNOT_DRAW",
            scope: { cause: "BY_YOUR_EFFECT" },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-100 Sabo ──────────────────────────────────────────────────────────
// If you have 3 or less Life cards, this Character gains [Blocker] and +3 cost.
// [On Play] You may add 1 card from the top of your Life cards to your hand:
// Draw 2 cards and trash 1 card from your hand.

export const OP12_100_SABO: EffectSchema = {
  card_id: "OP12-100",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "OP12-100_permanent",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
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
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "OP12-100_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1 }],
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

// ─── OP12-101 Jewelry Bonney ────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: Your {Supernovas} type Leader
// gains +1000 power until the end of your opponent's next turn.
// [Trigger] If your Leader has the {Supernovas} type, play this card.

export const OP12_101_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP12-101",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "OP12-101_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "YOUR_LEADER",
            filter: { traits: ["Supernovas"] },
          },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
    {
      id: "OP12-101_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP12-102 Shirahoshi ────────────────────────────────────────────────────
// If your Character with a base cost of 6 or less would be removed from the
// field by your opponent's effect, you may turn 1 card from the top of your
// Life cards face-up instead.
// [Opponent's Turn] If you have no other [Shirahoshi] with a base cost of 2,
// all of your {Neptunian} type Characters gain +2000 power.

export const OP12_102_SHIRAHOSHI: EffectSchema = {
  card_id: "OP12-102",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "OP12-102_replacement",
      category: "replacement",
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          base_cost_max: 6,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "OP12-102_opponent_turn",
      category: "permanent",
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { name: "Shirahoshi", base_cost_exact: 2, exclude_self: true },
          count: { operator: ">=", value: 1 },
        },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["Neptunian"] },
          },
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
  ],
};

// ─── OP12-105 Trafalgar Lammy ───────────────────────────────────────────────
// [Your Turn] [On Play] Up to 1 of your [Trafalgar Law] cards gains +2000
// power during this turn.

export const OP12_105_TRAFALGAR_LAMMY: EffectSchema = {
  card_id: "OP12-105",
  card_name: "Trafalgar Lammy",
  card_type: "Character",
  effects: [
    {
      id: "OP12-105_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Trafalgar Law" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP12-106 Trafalgar Law ─────────────────────────────────────────────────
// [Blocker]

export const OP12_106_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP12-106",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "OP12-106_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP12-107 Donquixote Doflamingo ─────────────────────────────────────────
// If you have 2 or less Life cards, this Character gains [Rush].
// [Opponent's Turn] [On K.O.] Add up to 1 card from the top of your deck to
// the top of your Life cards.

export const OP12_107_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP12-107",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "OP12-107_conditional_rush",
      category: "permanent",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
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
      id: "OP12-107_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, face: "DOWN", position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP12-108 Donquixote Rosinante ──────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// [Trafalgar Law] and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.

export const OP12_108_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP12-108",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "OP12-108_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { name: "Trafalgar Law" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP12-113 Roronoa Zoro ──────────────────────────────────────────────────
// [On K.O.] If your Leader has the {Supernovas} type, play up to 1
// {Supernovas} type Character card with a cost of 4 or less from your hand rested.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 1 or
// less and add this card to your hand.

// ─── OP12-112 Baby 5 (Character) ─────────────────────────────────────────────
// [Trigger] If your leader is multicolored, draw 2 cards.

export const OP12_112_BABY5: EffectSchema = {
  card_id: "OP12-112",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "trigger_multicolor_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

export const OP12_113_RORONOA_ZORO: EffectSchema = {
  card_id: "OP12-113",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP12-113_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Supernovas"],
              cost_max: 4,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
    {
      id: "OP12-113_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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
        {
          type: "RETURN_TO_HAND",
          target: { type: "SELF" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP12-115 I Love You!! (Event) ──────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 2 or less Life cards, add up to 1
// [Trafalgar Law] from your trash to your hand.

export const OP12_115_I_LOVE_YOU: EffectSchema = {
  card_id: "OP12-115",
  card_name: "I Love You!!",
  card_type: "Event",
  effects: [
    {
      id: "OP12-115_counter",
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
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Trafalgar Law" },
          },
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
  ],
};

// ─── OP12-116 We'll Ring the Bell Waiting for You!! (Event) ─────────────────
// [Main] Look at 5 cards from the top of your deck; reveal a total of up to 2
// {Shandian Warrior} type Character cards or [Mont Blanc Noland] and add them
// to your hand. Then, place the rest at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP12_116_WELL_RING_THE_BELL: EffectSchema = {
  card_id: "OP12-116",
  card_name: "We'll Ring the Bell Waiting for You!!",
  card_type: "Event",
  effects: [
    {
      id: "OP12-116_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: {
              any_of: [
                { card_type: "CHARACTER", traits: ["Shandian Warrior"] },
                { name: "Mont Blanc Noland" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP12-116_trigger",
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

// ─── OP12-117 Slam Gibson (Event) ───────────────────────────────────────────
// [Main] You may rest 5 of your DON!! cards: If your Leader has the
// {Supernovas} type, add up to 1 Character with a cost of 9 or less to the
// top or bottom of the owner's Life cards face-down.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP12_117_SLAM_GIBSON: EffectSchema = {
  card_id: "OP12-117",
  card_name: "Slam Gibson",
  card_type: "Event",
  effects: [
    {
      id: "OP12-117_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "REST_DON", amount: 5 },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 9 },
          },
          params: { face: "DOWN" },
        },
      ],
    },
    {
      id: "OP12-117_counter",
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

// ─── OP12-118 Jewelry Bonney ────────────────────────────────────────────────
// [Blocker]
// [On Play] If you have 8 or more rested cards, draw 2 cards and trash 1 card
// from your hand. Then, set up to 1 of your DON!! cards as active.

export const OP12_118_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP12-118",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "OP12-118_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP12-118_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
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
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP12-119 Bartholomew Kuma ──────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Add up to 1 card from the
// top of your deck to the top of your Life cards. Then, this Character gains
// +2 cost until the end of your opponent's next End Phase.
// [Opponent's Turn] [On K.O.] Add up to 1 card from the top of your deck to
// the top of your Life cards.

export const OP12_119_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "OP12-119",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "OP12-119_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, face: "DOWN", position: "TOP" },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP12-119_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, face: "DOWN", position: "TOP" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP12_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP12-001": OP12_001_SILVERS_RAYLEIGH,
  "OP12-003": OP12_003_CROCUS,
  "OP12-004": OP12_004_KOUZUKI_ODEN,
  "OP12-006": OP12_006_SHAKUYAKU,
  "OP12-007": OP12_007_SHANKS,
  "OP12-008": OP12_008_SHANKS,
  "OP12-009": OP12_009_JINBE,
  "OP12-012": OP12_012_BUGGY,
  "OP12-013": OP12_013_HATCHAN,
  "OP12-014": OP12_014_BOA_HANCOCK,
  "OP12-015": OP12_015_MONKEY_D_LUFFY,
  "OP12-016": OP12_016_TO_NEVER_DOUBT,
  "OP12-017": OP12_017_COLOR_OF_OBSERVATION_HAKI,
  "OP12-018": OP12_018_COLOR_OF_THE_SUPREME_KING_HAKI,
  "OP12-019": OP12_019_COLOR_OF_ARMS_HAKI,

  // Green
  "OP12-020": OP12_020_RORONOA_ZORO,
  "OP12-021": OP12_021_IPPONMATSU,
  "OP12-022": OP12_022_INUARASHI,
  "OP12-024": OP12_024_GYUKIMARU,
  "OP12-026": OP12_026_KUINA,
  "OP12-027": OP12_027_KOUSHIROU,
  "OP12-028": OP12_028_KOUZUKI_HIYORI,
  "OP12-029": OP12_029_SHIMOTSUKI_KOUZABUROU,
  "OP12-030": OP12_030_DRACULE_MIHAWK,
  "OP12-031": OP12_031_TASHIGI,
  "OP12-033": OP12_033_HELMEPPO,
  "OP12-034": OP12_034_PERONA,
  "OP12-036": OP12_036_RORONOA_ZORO,
  "OP12-037": OP12_037_DEMON_AURA_NINE_SWORD_STYLE,
  "OP12-038": OP12_038_TWO_SWORD_STYLE_RASHOMON,
  "OP12-039": OP12_039_LUFFY_IS_THE_MAN,

  // Blue
  "OP12-040": OP12_040_KUZAN,
  "OP12-041": OP12_041_SANJI,
  "OP12-042": OP12_042_ALVIDA,
  "OP12-043": OP12_043_KUZAN,
  "OP12-044": OP12_044_SAKAZUKI,
  "OP12-046": OP12_046_ZEPHYR,
  "OP12-047": OP12_047_SENGOKU,
  "OP12-048": OP12_048_DONQUIXOTE_ROSINANTE,
  "OP12-050": OP12_050_JAGUAR_D_SAUL,
  "OP12-051": OP12_051_HINA,
  "OP12-053": OP12_053_BORSALINO,
  "OP12-054": OP12_054_MARSHALL_D_TEACH,
  "OP12-056": OP12_056_MONKEY_D_GARP,
  "OP12-057": OP12_057_ICE_BLOCK_PHEASANT_PECK,
  "OP12-058": OP12_058_I_WILL_MAKE_WHITEBEARD_THE_KING,
  "OP12-059": OP12_059_CONCASSER,
  "OP12-060": OP12_060_BOEUF_BURST,
  "OP12-061": OP12_061_DONQUIXOTE_ROSINANTE,
  "OP12-062": OP12_062_VINSMOKE_SORA,

  // Purple
  "OP12-063": OP12_063_VINSMOKE_REIJU,
  "OP12-065": OP12_065_EMPORIO_IVANKOV,
  "OP12-066": OP12_066_CARNE,
  "OP12-069": OP12_069_CROCODILE,
  "OP12-070": OP12_070_SANJI,
  "OP12-071": OP12_071_CHARLOTTE_PUDDING,
  "OP12-072": OP12_072_ZEFF,
  "OP12-073": OP12_073_TRAFALGAR_LAW,
  "OP12-074": OP12_074_PATTY,
  "OP12-075": OP12_075_MS_ALL_SUNDAY,
  "OP12-077": OP12_077_EXTINGUISHES_ALL_SOUND,
  "OP12-078": OP12_078_BROCHETTE_BLOW,
  "OP12-079": OP12_079_LUFFY_IS_THE_MAN_KING,
  "OP12-080": OP12_080_BARATIE,

  // Black
  "OP12-081": OP12_081_KOALA,
  "OP12-084": OP12_084_EMPORIO_IVANKOV,
  "OP12-085": OP12_085_KARASU,
  "OP12-086": OP12_086_KOALA,
  "OP12-087": OP12_087_NICO_ROBIN,
  "OP12-089": OP12_089_HACK,
  "OP12-090": OP12_090_BELO_BETTY,
  "OP12-091": OP12_091_POKER,
  "OP12-093": OP12_093_MORLEY,
  "OP12-094": OP12_094_MONKEY_D_DRAGON,
  "OP12-095": OP12_095_LINDBERGH,
  "OP12-096": OP12_096_URSA_SHOCK,
  "OP12-097": OP12_097_CAPTAINS_ASSEMBLED,
  "OP12-098": OP12_098_HAIR_REMOVAL_FIST,

  // Yellow
  "OP12-099": OP12_099_KALGARA,
  "OP12-100": OP12_100_SABO,
  "OP12-101": OP12_101_JEWELRY_BONNEY,
  "OP12-102": OP12_102_SHIRAHOSHI,
  "OP12-105": OP12_105_TRAFALGAR_LAMMY,
  "OP12-106": OP12_106_TRAFALGAR_LAW,
  "OP12-107": OP12_107_DONQUIXOTE_DOFLAMINGO,
  "OP12-108": OP12_108_DONQUIXOTE_ROSINANTE,
  "OP12-112": OP12_112_BABY5,
  "OP12-113": OP12_113_RORONOA_ZORO,
  "OP12-115": OP12_115_I_LOVE_YOU,
  "OP12-116": OP12_116_WELL_RING_THE_BELL,
  "OP12-117": OP12_117_SLAM_GIBSON,
  "OP12-118": OP12_118_JEWELRY_BONNEY,
  "OP12-119": OP12_119_BARTHOLOMEW_KUMA,
};
