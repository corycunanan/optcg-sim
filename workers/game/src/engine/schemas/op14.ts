/**
 * M4 Effect Schema — OP14 Card Encodings
 *
 * Red (Trafalgar Law / Supernovas): OP14-001 through OP14-019
 * Green (Dracule Mihawk / Straw Hat Crew): OP14-020 through OP14-039
 * Blue (Jinbe / Boa Hancock / Fish-Man): OP14-040 through OP14-059
 * Purple (Donquixote Doflamingo / Donquixote Pirates): OP14-060 through OP14-078
 * Black (Crocodile / Gecko Moria / Baroque Works / Thriller Bark): OP14-079 through OP14-099
 * Yellow (Multicolor / Amazon Lily / Kuja Pirates / Thriller Bark): OP14-100 through OP14-120
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Trafalgar Law / Supernovas (OP14-001 to OP14-019)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP14-001 Trafalgar Law (Leader) ─────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Select 2 of your {Supernovas} or {Heart Pirates}
// type Characters. Swap the base power of the selected Characters with each other
// during this turn.

export const OP14_001_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP14-001",
  card_name: "Trafalgar Law",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-001_activate_swap",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SWAP_BASE_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 2 },
            filter: {
              traits_any_of: ["Supernovas", "Heart Pirates"],
            },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP14-002 Urouge ─────────────────────────────────────────────────────────
// [When Attacking] If this Character has 5000 power or more, draw 1 card and
// K.O. up to 1 of your opponent's Characters with 3000 base power or less.

export const OP14_002_UROUGE: EffectSchema = {
  card_id: "OP14-002",
  card_name: "Urouge",
  card_type: "Character",
  effects: [
    {
      id: "OP14-002_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 5000,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 3000 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-003 Capone"Gang"Bege ───────────────────────────────────────────────
// This Character cannot be K.O.'d by effects of your opponent's Characters with
// 5000 base power or less.

export const OP14_003_CAPONE_GANG_BEGE: EffectSchema = {
  card_id: "OP14-003",
  card_name: "Capone\"Gang\"Bege",
  card_type: "Character",
  effects: [
    {
      id: "OP14-003_cannot_be_ko",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: { type: "SELF" },
          scope: {
            cause: "BY_OPPONENT_EFFECT",
            source_filter: { card_type: "CHARACTER", base_power_max: 5000 },
          },
        },
      ],
    },
  ],
};

// ─── OP14-004 Cavendish ──────────────────────────────────────────────────────
// If this Character has 5000 power or more, this Character gains [Rush].

export const OP14_004_CAVENDISH: EffectSchema = {
  card_id: "OP14-004",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "OP14-004_conditional_rush",
      category: "permanent",
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 5000,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
  ],
};

// ─── OP14-005 Killer ─────────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader
// or 1 of your Characters.

export const OP14_005_KILLER: EffectSchema = {
  card_id: "OP14-005",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "OP14-005_activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
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

// ─── OP14-006 Shachi & Penguin ───────────────────────────────────────────────
// [When Attacking] If this Character has 5000 power or more, give up to 1 of your
// opponent's Characters −2000 power during this turn.

export const OP14_006_SHACHI_AND_PENGUIN: EffectSchema = {
  card_id: "OP14-006",
  card_name: "Shachi & Penguin",
  card_type: "Character",
  effects: [
    {
      id: "OP14-006_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 5000,
      },
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

// ─── OP14-009 Trafalgar Law ──────────────────────────────────────────────────
// [Rush]
// [On Your Opponent's Attack] [Once Per Turn] You may trash 2 cards from your hand:
// Select your Leader and 1 Character. Swap the base power of the selected cards with
// each other during this battle.

export const OP14_009_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP14-009",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "OP14-009_rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "OP14-009_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "SWAP_BASE_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 2 },
            filter: {
              any_of: [
                { card_type: "LEADER" },
                { card_type: "CHARACTER" },
              ],
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP14-010 Basil Hawkins ──────────────────────────────────────────────────
// [On K.O.] Look at 5 cards from the top of your deck; play up to 1 {Supernovas}
// type Character card with 2000 power or less other than [Basil Hawkins]. Then,
// place the rest at the bottom of your deck in any order.

export const OP14_010_BASIL_HAWKINS: EffectSchema = {
  card_id: "OP14-010",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "OP14-010_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: {
              card_type: "CHARACTER",
              traits: ["Supernovas"],
              power_max: 2000,
              exclude_name: "Basil Hawkins",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP14-011 Bartolomeo ─────────────────────────────────────────────────────
// [DON!! x2] This Character gains [Blocker].

export const OP14_011_BARTOLOMEO: EffectSchema = {
  card_id: "OP14-011",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-011_conditional_blocker",
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
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP14-012 Bepo ───────────────────────────────────────────────────────────
// [When Attacking] If this Character has 5000 power or more, give up to 2 rested
// DON!! cards to your Leader or 1 of your Characters.

export const OP14_012_BEPO: EffectSchema = {
  card_id: "OP14-012",
  card_name: "Bepo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-012_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 5000,
      },
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

// ─── OP14-013 Monkey.D.Luffy ─────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas}
// type card other than [Monkey.D.Luffy] and add it to your hand. Then, place the
// rest at the bottom of your deck in any order.
// [When Attacking] Give up to 1 of your opponent's Characters −1000 power during
// this turn.

export const OP14_013_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP14-013",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP14-013_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Supernovas"],
              exclude_name: "Monkey.D.Luffy",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP14-013_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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
      ],
    },
  ],
};

// ─── OP14-014 Eustass"Captain"Kid ────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader has the {Supernovas} type, play up to 1 red Character
// card with 2000 power or less from your hand.

export const OP14_014_EUSTASS_CAPTAIN_KID: EffectSchema = {
  card_id: "OP14-014",
  card_name: "Eustass\"Captain\"Kid",
  card_type: "Character",
  effects: [
    {
      id: "OP14-014_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-014_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
              color: "RED",
              power_max: 2000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-015 Roronoa Zoro ───────────────────────────────────────────────────
// [Rush]
// [When Attacking] Give up to 1 of your opponent's Characters −1000 power during
// this turn.

export const OP14_015_RORONOA_ZORO: EffectSchema = {
  card_id: "OP14-015",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP14-015_rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "OP14-015_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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
      ],
    },
  ],
};

// ─── OP14-016 X.Drake ────────────────────────────────────────────────────────
// [Opponent's Turn] [Once Per Turn] If your {Supernovas} type Character would be
// removed from the field by your opponent's effect, you may give your Leader −2000
// power during this turn instead.
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters −2000
// power during this turn.

export const OP14_016_X_DRAKE: EffectSchema = {
  card_id: "OP14-016",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "OP14-016_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Supernovas"],
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "OP14-016_when_attacking",
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

// ─── OP14-017 Chambres (Event) ───────────────────────────────────────────────
// [Main] Select 2 of your opponent's Characters with 9000 base power or less.
// Swap the base power of the selected Characters with each other during this turn.

export const OP14_017_CHAMBRES: EffectSchema = {
  card_id: "OP14-017",
  card_name: "Chambres",
  card_type: "Event",
  effects: [
    {
      id: "OP14-017_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SWAP_BASE_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 2 },
            filter: { base_power_max: 9000 },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP14-018 Time for the Counterattack (Event) ────────────────────────────
// [Counter] If there is a Character with 8000 power or more, up to 1 of your
// Leader or Character cards gains +4000 power during this battle.
// [Trigger] Play up to 1 red Character card with 2000 power or less from your hand.

export const OP14_018_TIME_FOR_THE_COUNTERATTACK: EffectSchema = {
  card_id: "OP14-018",
  card_name: "Time for the Counterattack",
  card_type: "Event",
  effects: [
    {
      id: "OP14-018_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", power_min: 8000 },
      },
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
    {
      id: "OP14-018_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "RED",
              power_max: 2000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-019 I Have a Plan to Take Down One of the Four Emperors!! (Event) ──
// [Main] Look at 4 cards from the top of your deck; reveal up to 1 {Supernovas}
// or {Straw Hat Crew} type Character card and add it to your hand. Then, place the
// rest at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP14_019_I_HAVE_A_PLAN: EffectSchema = {
  card_id: "OP14-019",
  card_name: "I Have a Plan to Take Down One of the Four Emperors!!",
  card_type: "Event",
  effects: [
    {
      id: "OP14-019_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_any_of: ["Supernovas", "Straw Hat Crew"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP14-019_trigger",
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

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Dracule Mihawk / Straw Hat Crew (OP14-020 to OP14-039)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP14-020 Dracule Mihawk (Leader) ────────────────────────────────────────
// If your opponent's Leader has the Slash attribute, this Leader gains +1000 power.
// [Activate: Main] [Once Per Turn] You may rest 1 of your cards: If there is a
// Character with a cost of 5 or more, set up to 3 of your DON!! cards as active.
// Then, you cannot play Character cards during this turn.

export const OP14_020_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP14-020",
  card_name: "Dracule Mihawk",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-020_slash_power",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "OPPONENT",
        property: { attribute: "SLASH" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
    },
    {
      id: "OP14-020_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_CARDS", amount: 1 }],
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 5 },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 3 },
          },
          params: { amount: 3 },
        },
        {
          type: "APPLY_PROHIBITION",
          params: { prohibition_type: "CANNOT_PLAY_CHARACTER" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-021 Issho ──────────────────────────────────────────────────────────
// [Your Turn] When this Character becomes rested, you may add 1 card from the top
// of your Life cards to your hand. If you do, up to 1 of your opponent's rested
// Characters or Stages will not become active in your opponent's next Refresh Phase.

export const OP14_021_ISSHO: EffectSchema = {
  card_id: "OP14-021",
  card_name: "Issho",
  card_type: "Character",
  effects: [
    {
      id: "OP14-021_on_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        turn_restriction: "YOUR_TURN",
      },
      flags: { optional: true },
      actions: [
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP14-022 Usopp ─────────────────────────────────────────────────────────
// [End of Your Turn] If your Leader has the {FILM} or {Straw Hat Crew} type,
// set up to 2 of your DON!! cards as active.

export const OP14_022_USOPP: EffectSchema = {
  card_id: "OP14-022",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "OP14-022_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 2 },
          },
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP14-023 Kikunojo ───────────────────────────────────────────────────────
// [End of Your Turn] Set this Character as active.

export const OP14_023_KIKUNOJO: EffectSchema = {
  card_id: "OP14-023",
  card_name: "Kikunojo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-023_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP14-024 Kin'emon ───────────────────────────────────────────────────────
// [On Play] Set up to 3 of your DON!! cards as active. Then, you cannot play
// Character cards during this turn.
// [On K.O.] Rest up to 1 of your opponent's cards.

export const OP14_024_KINEMON: EffectSchema = {
  card_id: "OP14-024",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    {
      id: "OP14-024_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 3 },
          },
          params: { amount: 3 },
        },
        {
          type: "APPLY_PROHIBITION",
          params: { prohibition_type: "CANNOT_PLAY_CHARACTER" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP14-024_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP14-025 Kuro ───────────────────────────────────────────────────────────
// [On Play] If your Leader is [Kuro], play up to 1 {East Blue} type Character card
// with a cost of 6 or less from your hand.

export const OP14_025_KURO: EffectSchema = {
  card_id: "OP14-025",
  card_name: "Kuro",
  card_type: "Character",
  effects: [
    {
      id: "OP14-025_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Kuro" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["East Blue"],
              cost_max: 6,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-026 Kouzuki Oden ───────────────────────────────────────────────────
// [Opponent's Turn] If this Character is rested, this Character gains +2000 power.

export const OP14_026_KOUZUKI_ODEN: EffectSchema = {
  card_id: "OP14-026",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "OP14-026_opponent_turn_power",
      category: "permanent",
      conditions: {
        all_of: [
          { type: "SELF_STATE", required_state: "RESTED" },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
  ],
};

// ─── OP14-027 Shanks ─────────────────────────────────────────────────────────
// [Your Turn] When this Character becomes rested, rest up to 1 of your opponent's
// Characters with 7000 base power or less.
// [Opponent's Turn] If this Character is rested, give all of your opponent's
// Characters −1000 power.

export const OP14_027_SHANKS: EffectSchema = {
  card_id: "OP14-027",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP14-027_on_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 7000 },
          },
        },
      ],
    },
    {
      id: "OP14-027_opponent_turn_debuff",
      category: "permanent",
      conditions: {
        type: "SELF_STATE",
        required_state: "RESTED",
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_OPPONENT_CHARACTERS",
          },
          params: { amount: -1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
  ],
};

// ─── OP14-028 Johnny ─────────────────────────────────────────────────────────
// [Your Turn] When this Character becomes rested, K.O. up to 1 of your opponent's
// rested Characters with a cost of 2 or less.

export const OP14_028_JOHNNY: EffectSchema = {
  card_id: "OP14-028",
  card_name: "Johnny",
  card_type: "Character",
  effects: [
    {
      id: "OP14-028_on_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP14-029 Tashigi ────────────────────────────────────────────────────────
// [Opponent's Turn] If this Character would be removed from the field by your
// opponent's effect, you may rest 1 of your cards instead.
// [Activate: Main] [Once Per Turn] You may rest 2 of your cards: This Character
// gains +2000 power until the end of your opponent's next End Phase.

export const OP14_029_TASHIGI: EffectSchema = {
  card_id: "OP14-029",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "OP14-029_replacement",
      category: "replacement",
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER" },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "OP14-029_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_CARDS", amount: 2 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP14-031 Nami ───────────────────────────────────────────────────────────
// [Blocker]
// [On Play] Rest up to 2 of your opponent's Characters with a cost of 8 or less.
// Then, set up to 5 of your DON!! cards as active at the end of this turn.

export const OP14_031_NAMI: EffectSchema = {
  card_id: "OP14-031",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "OP14-031_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-031_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 8 },
          },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "SET_DON_ACTIVE",
              target: {
                type: "DON_IN_COST_AREA",
                controller: "SELF",
                count: { up_to: 5 },
              },
              params: { amount: 5 },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-032 Humandrill ─────────────────────────────────────────────────────
// [Your Turn] When this Character becomes rested, rest up to 1 of your opponent's
// Characters with a cost of 4 or less.

export const OP14_032_HUMANDRILL: EffectSchema = {
  card_id: "OP14-032",
  card_name: "Humandrill",
  card_type: "Character",
  effects: [
    {
      id: "OP14-032_on_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        turn_restriction: "YOUR_TURN",
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

// ─── OP14-033 Perona ─────────────────────────────────────────────────────────
// [On Play] Up to 2 of your opponent's Characters with a cost of 5 or less cannot
// be rested until the end of your opponent's next End Phase.
// [On K.O.] You may rest 1 of your cards: Play up to 1 green Character card with
// a cost of 5 or less from your hand.

export const OP14_033_PERONA: EffectSchema = {
  card_id: "OP14-033",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "OP14-033_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 5 },
          },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP14-033_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "REST_CARDS", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "GREEN",
              cost_max: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-034 Monkey.D.Luffy ─────────────────────────────────────────────────
// [Your Turn] All of your green {Straw Hat Crew} type Characters with a base cost
// of 4 or more gain +1000 power.
// [Once Per Turn] If your {Straw Hat Crew} type Character would be K.O.'d by your
// opponent's effect, you may rest 1 of your Characters instead.

export const OP14_034_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP14-034",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP14-034_your_turn_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: {
              color: "GREEN",
              traits: ["Straw Hat Crew"],
              base_cost_min: 4,
            },
          },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
    {
      id: "OP14-034_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Straw Hat Crew"],
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
        },
      ],
      zone: "FIELD",
    },
  ],
};

// ─── OP14-035 Yosaku ─────────────────────────────────────────────────────────
// [Your Turn] When this Character becomes rested, up to 1 of your opponent's rested
// Characters with a cost of 4 or less will not become active in your opponent's
// next Refresh Phase.

export const OP14_035_YOSAKU: EffectSchema = {
  card_id: "OP14-035",
  card_name: "Yosaku",
  card_type: "Character",
  effects: [
    {
      id: "OP14-035_on_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 4 },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

// ─── OP14-036 Strive to Surpass me, Roronoa Zoro!!! (Event) ─────────────────
// [Counter] You may rest 1 of your cards: Up to 1 of your Leader or Character
// cards gains +4000 power during this battle.
// [Trigger] You may rest 1 of your cards: Rest up to 1 of your opponent's
// Characters with 7000 base power or less.

export const OP14_036_STRIVE_TO_SURPASS_ME: EffectSchema = {
  card_id: "OP14-036",
  card_name: "Strive to Surpass me, Roronoa Zoro!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP14-036_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "REST_CARDS", amount: 1 }],
      flags: { optional: true },
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
    {
      id: "OP14-036_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "REST_CARDS", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 7000 },
          },
        },
      ],
    },
  ],
};

// ─── OP14-037 For Fun (Event) ────────────────────────────────────────────────
// [Main] You may rest 3 of your cards: K.O. up to 1 of your opponent's rested
// Characters with 7000 base power or less.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP14_037_FOR_FUN: EffectSchema = {
  card_id: "OP14-037",
  card_name: "For Fun",
  card_type: "Event",
  effects: [
    {
      id: "OP14-037_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_CARDS", amount: 3 }],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, base_power_max: 7000 },
          },
        },
      ],
    },
    {
      id: "OP14-037_counter",
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

// ─── OP14-038 I Never Bother to Remember the Faces of Trash (Event) ─────────
// [Main] You may rest 2 of your cards: Draw 1 card and rest up to 1 of your
// opponent's Characters with 7000 base power or less.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP14_038_I_NEVER_BOTHER: EffectSchema = {
  card_id: "OP14-038",
  card_name: "I Never Bother to Remember the Faces of Trash",
  card_type: "Event",
  effects: [
    {
      id: "OP14-038_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_CARDS", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 7000 },
          },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP14-038_counter",
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

// ─── OP14-039 Coffin Boat (Stage) ───────────────────────────────────────────
// [On Play] If your Leader is [Dracule Mihawk], draw 1 card.
// [End of Your Turn] If your Leader is [Dracule Mihawk], set up to 1 of your
// DON!! cards as active.

export const OP14_039_COFFIN_BOAT: EffectSchema = {
  card_id: "OP14-039",
  card_name: "Coffin Boat",
  card_type: "Stage",
  effects: [
    {
      id: "OP14-039_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Dracule Mihawk" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP14-039_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Dracule Mihawk" },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Jinbe / Boa Hancock / Fish-Man (OP14-040 to OP14-059)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP14-040 Jinbe (Leader) ─────────────────────────────────────────────────
// [Activate: Main] You may trash 1 card from your hand: Give up to 2 rested DON!!
// cards to 1 of your {Fish-Man} or {Merfolk} type Leader or Character cards.

export const OP14_040_JINBE: EffectSchema = {
  card_id: "OP14-040",
  card_name: "Jinbe",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-040_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
            },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-041 Boa Hancock (Leader) ───────────────────────────────────────────
// [Opponent's Turn] When you play a Character, draw 1 card.
// [DON!! x1] [Once Per Turn] When one of your {Amazon Lily} or {Kuja Pirates}
// type Characters with 5000 base power or more is K.O.'d, add up to 1 card from
// the top of your opponent's Life cards to the owner's hand.

export const OP14_041_BOA_HANCOCK: EffectSchema = {
  card_id: "OP14-041",
  card_name: "Boa Hancock",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-041_on_character_played",
      category: "auto",
      trigger: {
        event: "CHARACTER_PLAYED",
        turn_restriction: "OPPONENT_TURN",
        filter: {},
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP14-041_on_ally_ko",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        don_requirement: 1,
        once_per_turn: true,
        filter: {
          controller: "SELF",
          target_filter: {
            traits_any_of: ["Amazon Lily", "Kuja Pirates"],
            base_power_min: 5000,
          },
        },
      },
      actions: [
        {
          type: "LIFE_TO_HAND",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP14-042 Arlong ─────────────────────────────────────────────────────────
// [On Play] If your Leader has the {Fish-Man} type, look at 4 cards from the top
// of your deck; reveal up to 1 card with a cost of 2 or more and add it to your
// hand. Then, place the rest at the bottom of your deck in any order.

export const OP14_042_ARLONG: EffectSchema = {
  card_id: "OP14-042",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "OP14-042_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              cost_min: 2,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP14-043 Aladine ────────────────────────────────────────────────────────
// [On Play] Play up to 1 {Fish-Man} or {Merfolk} type Character card with a cost
// of 3 or less from your hand.
// [On K.O.] Draw 1 card.

export const OP14_043_ALADINE: EffectSchema = {
  card_id: "OP14-043",
  card_name: "Aladine",
  card_type: "Character",
  effects: [
    {
      id: "OP14-043_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "OP14-043_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP14-044 Edward.Newgate ─────────────────────────────────────────────────
// [Blocker]
// [On Play] Reveal 1 card from the top of your deck. If that card's type includes
// "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.

export const OP14_044_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP14-044",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "OP14-044_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-044_on_play_reveal",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
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

// ─── OP14-045 Kuroobi ────────────────────────────────────────────────────────
// When a card is trashed from your hand by an effect, this Character gains [Rush]
// during this turn.
// [On K.O.] Draw 1 card.

export const OP14_045_KUROOBI: EffectSchema = {
  card_id: "OP14-045",
  card_name: "Kuroobi",
  card_type: "Character",
  effects: [
    {
      id: "OP14-045_hand_trash_rush",
      category: "auto",
      trigger: {
        event: "CARD_ADDED_TO_HAND_FROM_LIFE",
        // _comment: "Actually triggers on hand-trash by effect — custom event needed"
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
    {
      id: "OP14-045_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP14-046 Koala ──────────────────────────────────────────────────────────
// [Activate: Main] You may trash this Character: Up to 1 of your {Fish-Man} or
// {Merfolk} type Leader or Character cards gains +2000 power during this turn.

export const OP14_046_KOALA: EffectSchema = {
  card_id: "OP14-046",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "OP14-046_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
            },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP14-047 Shirahoshi ─────────────────────────────────────────────────────
// [Blocker]
// [On Play] Draw 1 card and play up to 1 {Fish-Man} or {Merfolk} type Character
// card with a cost of 3 or less from your hand.

export const OP14_047_SHIRAHOSHI: EffectSchema = {
  card_id: "OP14-047",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "OP14-047_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-047_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-048 Shiryu ─────────────────────────────────────────────────────────
// [On Play] Return up to 1 of your opponent's Characters to the owner's hand.
// Then, trash all cards from your hand.

export const OP14_048_SHIRYU: EffectSchema = {
  card_id: "OP14-048",
  card_name: "Shiryu",
  card_type: "Character",
  effects: [
    {
      id: "OP14-048_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { all: true },
          },
          params: { amount: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-049 Jinbe ──────────────────────────────────────────────────────────
// When a card is trashed from your hand by an effect, this Character gains [Rush]
// during this turn.
// [On Play] You may rest 2 of your DON!! cards: Draw 2 cards and return up to 1
// Character with a cost of 7 or less to the owner's hand.

export const OP14_049_JINBE: EffectSchema = {
  card_id: "OP14-049",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "OP14-049_hand_trash_rush",
      category: "auto",
      trigger: {
        event: "CARD_ADDED_TO_HAND_FROM_LIFE",
        // _comment: "Actually triggers on hand-trash by effect — custom event needed"
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
    {
      id: "OP14-049_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_DON", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "ANY",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-050 Chew ───────────────────────────────────────────────────────────
// [On Play] If your Leader has the {Fish-Man} type, draw 1 card.

export const OP14_050_CHEW: EffectSchema = {
  card_id: "OP14-050",
  card_name: "Chew",
  card_type: "Character",
  effects: [
    {
      id: "OP14-050_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
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

// ─── OP14-051 Hatchan ────────────────────────────────────────────────────────
// [DON!! x2] [On K.O.] Draw 1 card.

export const OP14_051_HATCHAN: EffectSchema = {
  card_id: "OP14-051",
  card_name: "Hatchan",
  card_type: "Character",
  effects: [
    {
      id: "OP14-051_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO", don_requirement: 2 },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP14-052 Hannyabal ──────────────────────────────────────────────────────
// [Blocker]
// [On Play] You may trash 3 cards from your hand: Play up to 1 {Impel Down} type
// Character card with a cost of 6 or less from your hand.

export const OP14_052_HANNYABAL: EffectSchema = {
  card_id: "OP14-052",
  card_name: "Hannyabal",
  card_type: "Character",
  effects: [
    {
      id: "OP14-052_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-052_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 3 }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Impel Down"],
              cost_max: 6,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-053 Vista — Blocker + Opponent's Turn dynamic base power copy
// [Blocker]
// [Opponent's Turn] If you have 7 or less cards in your hand, this Character's base
// power becomes the same as your Leader's base power.

export const OP14_053_VISTA: EffectSchema = {
  card_id: "OP14-053",
  card_name: "Vista",
  card_type: "Character",
  effects: [
    {
      id: "OP14-053_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-053_opponent_turn_copy_power",
      category: "permanent",
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 7,
      },
      modifiers: [
        {
          type: "SET_POWER",
          target: { type: "SELF" },
          params: { value: { type: "GAME_STATE", source: "LEADER_BASE_POWER" } },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "OPPONENT" } },
    },
  ],
};

// ─── OP14-054 Fisher Tiger ───────────────────────────────────────────────────
// [On Play] If your Leader has the {Fish-Man} type, draw 3 cards.
// [End of Your Turn] Trash cards from your hand until you have 5 cards in your hand.

export const OP14_054_FISHER_TIGER: EffectSchema = {
  card_id: "OP14-054",
  card_name: "Fisher Tiger",
  card_type: "Character",
  effects: [
    {
      id: "OP14-054_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "OP14-054_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
          },
          params: { until_count: 5, _comment: "Trash from hand until 5 cards remain — needs custom engine handling" },
        },
      ],
    },
  ],
};

// ─── OP14-056 Wadatsumi ──────────────────────────────────────────────────────
// This Character cannot attack.
// When a card is trashed from your hand by an effect, this Character's effect is
// negated during this turn.

export const OP14_056_WADATSUMI: EffectSchema = {
  card_id: "OP14-056",
  card_name: "Wadatsumi",
  card_type: "Character",
  effects: [
    {
      id: "OP14-056_cannot_attack",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
          target: { type: "SELF" },
        },
      ],
    },
    {
      id: "OP14-056_hand_trash_negate",
      category: "auto",
      trigger: {
        event: "CARD_ADDED_TO_HAND_FROM_LIFE",
        // _comment: "Actually triggers on hand-trash by effect — custom event needed"
      },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: { type: "SELF" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP14-057 Don't Worry!! I'm Here!! (Event) ──────────────────────────────
// [Main] All of your {Fish-Man} or {Merfolk} type Leader and Character cards gain
// +1000 power during this turn.
// [Trigger] Draw 2 cards.

export const OP14_057_DONT_WORRY: EffectSchema = {
  card_id: "OP14-057",
  card_name: "Don't Worry!! I'm Here!!",
  card_type: "Event",
  effects: [
    {
      id: "OP14-057_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
            },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP14-057_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP14-058 Ocean Current Shoulder Throw (Event) ───────────────────────────
// [Main] You may rest 3 of your DON!! cards: Play up to 1 {Fish-Man} type Character
// card with a cost of 3 or less from your hand. Then, return up to 1 Character with
// 6000 base power to the owner's hand.
// [Counter] Draw 1 card and your Leader gains +3000 power during this battle.

export const OP14_058_OCEAN_CURRENT_SHOULDER_THROW: EffectSchema = {
  card_id: "OP14-058",
  card_name: "Ocean Current Shoulder Throw",
  card_type: "Event",
  effects: [
    {
      id: "OP14-058_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 3 }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Fish-Man"],
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "ANY",
            count: { up_to: 1 },
            filter: { base_power_exact: 6000 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP14-058_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-059 Please Take Me with You!! (Event) ─────────────────────────────
// [Main] If your Leader is [Jinbe] and you have 2 or less cards in your hand,
// draw 2 cards.
// [Trigger] Return up to 1 Character with a cost of 4 or less to the owner's hand.

export const OP14_059_PLEASE_TAKE_ME_WITH_YOU: EffectSchema = {
  card_id: "OP14-059",
  card_name: "Please Take Me with You!! I Can Be of Great Help to You!!",
  card_type: "Event",
  effects: [
    {
      id: "OP14-059_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { name: "Jinbe" },
          },
          {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
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
    {
      id: "OP14-059_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "ANY",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Donquixote Doflamingo / Donquixote Pirates (OP14-060 to OP14-078)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP14-060 Donquixote Doflamingo (Leader) ─────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1: Select your Leader or 1 of
// your {Donquixote Pirates} type Characters. Change the attack target to the
// selected card.

export const OP14_060_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP14-060",
  card_name: "Donquixote Doflamingo",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-060_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "REDIRECT_ATTACK",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: {
              any_of: [
                { card_type: "LEADER" },
                { card_type: "CHARACTER", traits: ["Donquixote Pirates"] },
              ],
            },
          },
        },
      ],
    },
  ],
};

// ─── OP14-061 Vergo ──────────────────────────────────────────────────────────
// [Once Per Turn] If your {Donquixote Pirates} type Character would be removed from
// the field by your opponent's effect, you may return 1 DON!! card from your field
// to your DON!! deck instead.
// [When Attacking] DON!! −1: Give up to 1 of your opponent's Characters −2000 power
// during this turn.

export const OP14_061_VERGO: EffectSchema = {
  card_id: "OP14-061",
  card_name: "Vergo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-061_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Donquixote Pirates"],
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "RETURN_DON_TO_DECK",
          params: { amount: 1 },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "OP14-061_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP14-062 Gladius ────────────────────────────────────────────────────────
// [On K.O.] DON!! −1: K.O. or rest up to 1 of your opponent's Characters with a
// base power of 6000 or less.

export const OP14_062_GLADIUS: EffectSchema = {
  card_id: "OP14-062",
  card_name: "Gladius",
  card_type: "Character",
  effects: [
    {
      id: "OP14-062_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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
                    filter: { base_power_max: 6000 },
                  },
                },
              ],
              [
                {
                  type: "SET_REST",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { base_power_max: 6000 },
                  },
                },
              ],
            ],
            labels: ["K.O.", "Rest"],
          },
        },
      ],
    },
  ],
};

// ─── OP14-063 Sugar ──────────────────────────────────────────────────────────
// [On Play] Add up to 1 DON!! card from your DON!! deck and set it as active.
// [On K.O.] If your opponent has 6 or more DON!! cards on their field, play up to 1
// {Donquixote Pirates} type Character card with a cost of 5 or less from your hand.

export const OP14_063_SUGAR: EffectSchema = {
  card_id: "OP14-063",
  card_name: "Sugar",
  card_type: "Character",
  effects: [
    {
      id: "OP14-063_on_play",
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
      id: "OP14-063_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Donquixote Pirates"],
              cost_max: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-064 Giolla ─────────────────────────────────────────────────────────
// [On K.O.] Add up to 1 DON!! card from your DON!! deck and rest it. Then, K.O. up
// to 1 of your opponent's Characters with a base power of 0.

export const OP14_064_GIOLLA: EffectSchema = {
  card_id: "OP14-064",
  card_name: "Giolla",
  card_type: "Character",
  effects: [
    {
      id: "OP14-064_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_exact: 0 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-065 Senor Pink ─────────────────────────────────────────────────────
// [On K.O.] Your opponent returns 1 DON!! card from their field to their DON!! deck.

export const OP14_065_SENOR_PINK: EffectSchema = {
  card_id: "OP14-065",
  card_name: "Senor Pink",
  card_type: "Character",
  effects: [
    {
      id: "OP14-065_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "FORCE_OPPONENT_DON_RETURN",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP14-067 Dellinger ──────────────────────────────────────────────────────
// [On K.O.] Add up to 1 DON!! card from your DON!! deck and rest it, look at 5
// cards from the top of your deck; reveal up to 1 {Donquixote Pirates} type card
// and add it to your hand. Then, place the rest at the bottom of your deck in any
// order.

export const OP14_067_DELLINGER: EffectSchema = {
  card_id: "OP14-067",
  card_name: "Dellinger",
  card_type: "Character",
  effects: [
    {
      id: "OP14-067_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Donquixote Pirates"],
            },
            rest_destination: "BOTTOM",
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-068 Trebol ─────────────────────────────────────────────────────────
// [Opponent's Turn] [Once Per Turn] When a DON!! card on your field is returned to
// your DON!! deck, if your Leader has the {Donquixote Pirates} type, add up to 1
// DON!! card from your DON!! deck and rest it.

export const OP14_068_TREBOL: EffectSchema = {
  card_id: "OP14-068",
  card_name: "Trebol",
  card_type: "Character",
  effects: [
    {
      id: "OP14-068_don_returned",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        turn_restriction: "OPPONENT_TURN",
        once_per_turn: true,
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
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

// ─── OP14-069 Donquixote Doflamingo ──────────────────────────────────────────
// [On Play] DON!! −3: Choose one:
// • If your Leader has the {Donquixote Pirates} type, K.O. up to 1 of your
//   opponent's Characters with a cost of 8 or less.
// • Up to 3 of your opponent's Characters with a cost of 7 or less cannot be
//   rested until the end of your opponent's next End Phase.

export const OP14_069_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP14-069",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-069_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 3 }],
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
                    filter: { cost_max: 8 },
                  },
                  conditions: {
                    type: "LEADER_PROPERTY",
                    controller: "SELF",
                    property: { trait: "Donquixote Pirates" },
                  },
                },
              ],
              [
                {
                  type: "APPLY_PROHIBITION",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 3 },
                    filter: { cost_max: 7 },
                  },
                  params: { prohibition_type: "CANNOT_BE_RESTED" },
                  duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
                },
              ],
            ],
            labels: ["K.O. up to 1 character cost 8 or less", "Cannot be rested up to 3 characters cost 7 or less"],
          },
        },
      ],
    },
  ],
};

// ─── OP14-070 Buffalo ────────────────────────────────────────────────────────
// When this Character becomes rested by your opponent's Character's effect, you may
// return 1 DON!! card from your field to your DON!! deck. If you do, set this
// Character as active.
// [Blocker]

export const OP14_070_BUFFALO: EffectSchema = {
  card_id: "OP14-070",
  card_name: "Buffalo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-070_on_rest_by_opponent",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        filter: { cause: "BY_OPPONENT_EFFECT" },
      },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
    {
      id: "OP14-070_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP14-071 Pica ───────────────────────────────────────────────────────────
// [End of Your Turn] If your Leader has the {Donquixote Pirates} type, add up to 1
// DON!! card from your DON!! deck and set it as active.

export const OP14_071_PICA: EffectSchema = {
  card_id: "OP14-071",
  card_name: "Pica",
  card_type: "Character",
  effects: [
    {
      id: "OP14-071_end_of_turn",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
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

// ─── OP14-072 Baby 5 ─────────────────────────────────────────────────────────
// [On Play] Add up to 1 DON!! card from your DON!! deck and set it as active.
// [On K.O.] DON!! −1: Add up to 1 card from the top of your deck to the top of
// your Life cards.

export const OP14_072_BABY_5: EffectSchema = {
  card_id: "OP14-072",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "OP14-072_on_play",
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
      id: "OP14-072_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP14-074 Monet ──────────────────────────────────────────────────────────
// [On Play] If your Leader has the {Donquixote Pirates} type, add up to 1 DON!!
// card from your DON!! deck and set it as active.
// [On K.O.] Draw 2 cards and trash 1 card from your hand. Then, add up to 2 DON!!
// cards from your DON!! deck and rest them.

export const OP14_074_MONET: EffectSchema = {
  card_id: "OP14-074",
  card_name: "Monet",
  card_type: "Character",
  effects: [
    {
      id: "OP14-074_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
    {
      id: "OP14-074_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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
          type: "ADD_DON_FROM_DECK",
          params: { amount: 2, target_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-075 Lao.G ──────────────────────────────────────────────────────────
// [On K.O.] Add up to 1 DON!! card from your DON!! deck and rest it. Then, give up
// to 1 of your opponent's Characters −2000 power during this turn.

export const OP14_075_LAO_G: EffectSchema = {
  card_id: "OP14-075",
  card_name: "Lao.G",
  card_type: "Character",
  effects: [
    {
      id: "OP14-075_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
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
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-076 Ever White (Event) ─────────────────────────────────────────────
// [Main] You may rest 2 of your DON!! cards: If your Leader has the {Donquixote
// Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP14_076_EVER_WHITE: EffectSchema = {
  card_id: "OP14-076",
  card_name: "Ever White",
  card_type: "Event",
  effects: [
    {
      id: "OP14-076_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 2 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
    {
      id: "OP14-076_counter",
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

// ─── OP14-077 Penta-Chromatic String (Event) ─────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this
// battle. Then, if your opponent has a Character with 6000 power or more, add up to
// 1 DON!! card from your DON!! deck and rest it.

export const OP14_077_PENTA_CHROMATIC_STRING: EffectSchema = {
  card_id: "OP14-077",
  card_name: "Penta-Chromatic String",
  card_type: "Event",
  effects: [
    {
      id: "OP14-077_counter",
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
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "THEN",
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: {
              card_type: "CHARACTER",
              power_min: 6000,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP14-078 Bullet String (Event) ──────────────────────────────────────────
// [Counter] DON!! −1: If your Leader has the {Donquixote Pirates} type, up to 1 of
// your Leader or Character cards gains +2000 power during this battle. Then, that
// card gains an additional +2000 power during this turn.

export const OP14_078_BULLET_STRING: EffectSchema = {
  card_id: "OP14-078",
  card_name: "Bullet String",
  card_type: "Event",
  effects: [
    {
      id: "OP14-078_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
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
          type: "MODIFY_POWER",
          target: {
            type: "SELECTED_CARDS",
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Crocodile / Gecko Moria / Baroque Works / Thriller Bark (OP14-079 to OP14-099)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP14-079 Crocodile (Leader) ─────────────────────────────────────────────
// All of your opponent's Characters cannot be removed from the field by your effects.
// [Activate: Main] [Once Per Turn] You may K.O. 1 of your Characters with a type
// including "Baroque Works": Give up to 1 of your opponent's Characters −10 cost
// during this turn. Then, you may trash 2 cards from the top of your deck.

export const OP14_079_CROCODILE: EffectSchema = {
  card_id: "OP14-079",
  card_name: "Crocodile",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-079_prohibition",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          scope: { cause: "EFFECT", controller: "SELF" },
        },
      ],
    },
    {
      id: "OP14-079_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "KO_OWN_CHARACTER",
          amount: 1,
          filter: { traits_contains: ["Baroque Works"] },
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
          params: { amount: -10 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP14-080 Gecko Moria (Leader) ───────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may K.O. 1 of your {Thriller Bark Pirates}
// type Characters: Your Leader and all of your Characters gain +1000 power during
// this turn.
// [When Attacking] You may trash 3 cards from your hand: Add up to 1 card from the
// top of your deck to the top of your Life cards.

export const OP14_080_GECKO_MORIA: EffectSchema = {
  card_id: "OP14-080",
  card_name: "Gecko Moria",
  card_type: "Leader",
  effects: [
    {
      id: "OP14-080_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "KO_OWN_CHARACTER",
          amount: 1,
          filter: { traits: ["Thriller Bark Pirates"] },
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP14-080_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 3 }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP14-081 Spider Mice ────────────────────────────────────────────────────
// [On Play] Trash 3 cards from the top of your deck.
// [On K.O.] K.O. up to 1 of your opponent's Characters with a base cost of 1.

export const OP14_081_SPIDER_MICE: EffectSchema = {
  card_id: "OP14-081",
  card_name: "Spider Mice",
  card_type: "Character",
  effects: [
    {
      id: "OP14-081_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 3 },
        },
      ],
    },
    {
      id: "OP14-081_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_exact: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP14-082 Oinkchuck ──────────────────────────────────────────────────────
// [On K.O.] All of your {Thriller Bark Pirates} type Characters gain +4 cost until
// the end of your opponent's next End Phase.
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 2 or less from your trash rested.

export const OP14_082_OINKCHUCK: EffectSchema = {
  card_id: "OP14-082",
  card_name: "Oinkchuck",
  card_type: "Character",
  effects: [
    {
      id: "OP14-082_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits: ["Thriller Bark Pirates"] },
          },
          params: { amount: 4 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP14-082_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 2,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-083 Ms. Wednesday ──────────────────────────────────────────────────
// [Activate: Main] You may trash this Character: Give up to 1 of your opponent's 0
// cost Characters −3000 power during this turn.

export const OP14_083_MS_WEDNESDAY: EffectSchema = {
  card_id: "OP14-083",
  card_name: "Ms. Wednesday",
  card_type: "Character",
  effects: [
    {
      id: "OP14-083_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP14-084 Ms. All Sunday ─────────────────────────────────────────────────
// [On Play] If your Leader's type includes "Baroque Works", play up to 1 Character
// card with a type including "Baroque Works" and a cost of 4 or less and up to 1
// Character card with a type including "Baroque Works" and a cost of 1 from your
// trash.

export const OP14_084_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP14-084",
  card_name: "Ms. All Sunday",
  card_type: "Character",
  effects: [
    {
      id: "OP14-084_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            dual_targets: [
              { filter: { traits_contains: ["Baroque Works"], cost_max: 4 }, count: { up_to: 1 } },
              { filter: { traits_contains: ["Baroque Works"], cost_exact: 1 }, count: { up_to: 1 } },
            ],
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-085 Miss.Goldenweek(Marianne) ──────────────────────────────────────
// [On K.O.] Draw 2 cards and trash 2 cards from your hand.

export const OP14_085_MISS_GOLDENWEEK: EffectSchema = {
  card_id: "OP14-085",
  card_name: "Miss.Goldenweek(Marianne)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-085_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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
            count: { exact: 2 },
          },
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-086 Miss Doublefinger(Zala) ────────────────────────────────────────
// If you have 7 or more cards in your trash, this Character gains +1000 power, and
// all of your Characters with a type including "Baroque Works" gain +2 cost.

export const OP14_086_MISS_DOUBLEFINGER: EffectSchema = {
  card_id: "OP14-086",
  card_name: "Miss Doublefinger(Zala)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-086_permanent",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits_contains: ["Baroque Works"] },
          },
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP14-087 Miss.Valentine(Mikita) ─────────────────────────────────────────
// [On Play] If your Leader's type includes "Baroque Works", look at 4 cards from
// the top of your deck; reveal up to 1 card with a type including "Baroque Works"
// other than [Miss.Valentine(Mikita)] and add it to your hand. Then, trash the rest.

export const OP14_087_MISS_VALENTINE: EffectSchema = {
  card_id: "OP14-087",
  card_name: "Miss.Valentine(Mikita)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-087_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              traits_contains: ["Baroque Works"],
              exclude_name: "Miss.Valentine(Mikita)",
            },
          },
        },
      ],
    },
  ],
};

// ─── OP14-088 Miss.MerryChristmas(Drophy) ────────────────────────────────────
// [On K.O.] If your Leader's type includes "Baroque Works", draw 1 card and K.O. up
// to 1 of your opponent's Stages with a cost of 1.

export const OP14_088_MISS_MERRYCHRISTMAS: EffectSchema = {
  card_id: "OP14-088",
  card_name: "Miss.MerryChristmas(Drophy)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-088_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "KO",
          target: {
            type: "STAGE",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 1 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP14-089 Ryuma ──────────────────────────────────────────────────────────
// [On K.O.] Draw 2 cards and trash 2 cards from your hand.
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 4 or less from your trash rested.

export const OP14_089_RYUMA: EffectSchema = {
  card_id: "OP14-089",
  card_name: "Ryuma",
  card_type: "Character",
  effects: [
    {
      id: "OP14-089_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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
            count: { exact: 2 },
          },
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP14-089_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-090 Mr.1(Daz.Bonez) ────────────────────────────────────────────────
// If there is a Character with a cost of 0 or with a cost of 8 or more, this
// Character can attack Characters on the turn in which it is played.
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 0.

export const OP14_090_MR_1: EffectSchema = {
  card_id: "OP14-090",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-090_conditional_rush_character",
      category: "permanent",
      conditions: {
        any_of: [
          { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_exact: 0 } },
          { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_min: 8 } },
        ],
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH_CHARACTER" },
        },
      ],
    },
    {
      id: "OP14-090_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_exact: 0 },
          },
        },
      ],
    },
  ],
};

// ─── OP14-091 Mr.2.Bon.Kurei(Bentham) ────────────────────────────────────────
// [On K.O.] Play up to 1 Character card with a type including "Baroque Works" and a
// cost of 5 or less other than [Mr.2.Bon.Kurei(Bentham)] from your hand or trash.

export const OP14_091_MR_2_BON_KUREI: EffectSchema = {
  card_id: "OP14-091",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-091_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: {
              traits_contains: ["Baroque Works"],
              cost_max: 5,
              exclude_name: "Mr.2.Bon.Kurei(Bentham)",
            },
          },
          params: { cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-092 Mr.3(Galdino) ──────────────────────────────────────────────────
// [Opponent's Turn] [Once Per Turn] If this Character would be K.O.'d, you may
// place 3 cards from your trash at the bottom of your deck in any order instead.

export const OP14_092_MR_3: EffectSchema = {
  card_id: "OP14-092",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-092_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_KO",
      },
      replacement_actions: [
        {
          type: "PLACE_HAND_TO_DECK",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { exact: 3 },
          },
          params: { amount: 3, position: "BOTTOM" },
        },
      ],
      zone: "FIELD",
    },
  ],
};

// ─── OP14-093 Mr.4(Babe) ─────────────────────────────────────────────────────
// [Blocker]
// [On K.O.] Add up to 1 Character card with a type including "Baroque Works" and a
// cost of 8 or less from your trash to your hand.

export const OP14_093_MR_4: EffectSchema = {
  card_id: "OP14-093",
  card_name: "Mr.4(Babe)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-093_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-093_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_contains: ["Baroque Works"],
              cost_max: 8,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP14-094 Mr.5(Gem) ──────────────────────────────────────────────────────
// [Blocker]
// [On Play] If there is a Character with a cost of 0 or with a cost of 8 or more,
// draw 2 cards and trash 1 card from your hand.

export const OP14_094_MR_5: EffectSchema = {
  card_id: "OP14-094",
  card_name: "Mr.5(Gem)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-094_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-094_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_exact: 0 } },
          { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_min: 8 } },
        ],
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
      ],
    },
  ],
};

// ─── OP14-096 Ground Death (Event) ───────────────────────────────────────────
// [Main] You may rest 2 of your DON!! cards: Negate the effect of up to 1 of your
// opponent's Characters with a cost of 5 or less during this turn.
// [Counter] If you have 10 or more cards in your trash, up to 1 of your Leader or
// Character cards gains +4000 power during this battle.

export const OP14_096_GROUND_DEATH: EffectSchema = {
  card_id: "OP14-096",
  card_name: "Ground Death",
  card_type: "Event",
  effects: [
    {
      id: "OP14-096_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP14-096_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
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

// ─── OP14-097 Hurry Up and Make Me the Pirate King! (Event) ──────────────────
// [Main] Look at 3 cards from the top of your deck; reveal up to 1 {Thriller Bark
// Pirates} type card other than [Hurry Up and Make Me the Pirate King!] and add it
// to your hand. Then, trash the rest.
// [Trigger] Activate this card's [Main] effect.

export const OP14_097_HURRY_UP: EffectSchema = {
  card_id: "OP14-097",
  card_name: "Hurry Up and Make Me the Pirate King!",
  card_type: "Event",
  effects: [
    {
      id: "OP14-097_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              exclude_name: "Hurry Up and Make Me the Pirate King!",
            },
          },
        },
      ],
    },
    {
      id: "OP14-097_trigger",
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

// ─── OP14-098 Crescent Cutlass (Event) ───────────────────────────────────────
// [Main] If there is a Character with a cost of 0 or with a cost of 8 or more, all
// of your Characters with a type including "Baroque Works" gain +3 cost until the
// end of your opponent's next End Phase.
// [Counter] Your Leader gains +3000 power during this battle.

export const OP14_098_CRESCENT_CUTLASS: EffectSchema = {
  card_id: "OP14-098",
  card_name: "Crescent Cutlass",
  card_type: "Event",
  effects: [
    {
      id: "OP14-098_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        any_of: [
          { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_exact: 0 } },
          { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_min: 8 } },
        ],
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { traits_contains: ["Baroque Works"] },
          },
          params: { amount: 3 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP14-098_counter",
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

// ─── OP14-099 Disappointed? (Event) ──────────────────────────────────────────
// [Main] Look at 3 cards from the top of your deck; reveal up to 1 card with a type
// including "Baroque Works" other than [Disappointed?] and add it to your hand.
// Then, trash the rest.
// [Trigger] Activate this card's [Main] effect.

export const OP14_099_DISAPPOINTED: EffectSchema = {
  card_id: "OP14-099",
  card_name: "Disappointed?",
  card_type: "Event",
  effects: [
    {
      id: "OP14-099_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits_contains: ["Baroque Works"],
              exclude_name: "Disappointed?",
            },
          },
        },
      ],
    },
    {
      id: "OP14-099_trigger",
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
// YELLOW — Multicolor / Amazon Lily / Kuja Pirates / Thriller Bark (OP14-100 to OP14-120)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP14-100 Absalom ────────────────────────────────────────────────────────
// [On K.O.] Look at 3 cards from the top of your deck; reveal up to 1 {Thriller
// Bark Pirates} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 4 or less from your trash rested.

export const OP14_100_ABSALOM: EffectSchema = {
  card_id: "OP14-100",
  card_name: "Absalom",
  card_type: "Character",
  effects: [
    {
      id: "OP14-100_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP14-100_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-103 Gloriosa (Grandma Nyon) ────────────────────────────────────────
// [On Play] You may add 1 card from the top or bottom of your Life cards to your
// hand: Add up to 1 card from your hand to the top of your Life cards.
// [Trigger] Play this card.

export const OP14_103_GLORIOSA: EffectSchema = {
  card_id: "OP14-103",
  card_name: "Gloriosa (Grandma Nyon)",
  card_type: "Character",
  effects: [
    {
      id: "OP14-103_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "OP14-103_trigger",
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

// ─── OP14-104 Gecko Moria ────────────────────────────────────────────────────
// [On Play] Select up to 1 {Thriller Bark Pirates} type Character with a cost of 4
// or less from your trash and play it or add it to the top of your Life cards
// face-up.
// [Trigger] Play up to 1 Character card with a cost of 4 or less from your trash.

export const OP14_104_GECKO_MORIA: EffectSchema = {
  card_id: "OP14-104",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "OP14-104_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "PLAY_CARD",
                  target: {
                    type: "CHARACTER_CARD",
                    source_zone: "TRASH",
                    count: { up_to: 1 },
                    filter: {
                      traits: ["Thriller Bark Pirates"],
                      cost_max: 4,
                    },
                  },
                  params: { source_zone: "TRASH", cost_override: "FREE" },
                },
              ],
              [
                {
                  type: "ADD_TO_LIFE",
                  target: {
                    type: "CARD_IN_TRASH",
                    controller: "SELF",
                    count: { up_to: 1 },
                    filter: {
                      card_type: "CHARACTER",
                      traits: ["Thriller Bark Pirates"],
                      cost_max: 4,
                    },
                  },
                  params: { face: "UP", position: "TOP" },
                },
              ],
            ],
            labels: ["Play from trash", "Add to top of Life face-up"],
          },
        },
      ],
    },
    {
      id: "OP14-104_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-105 Gorgon Sisters ─────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may reveal 3 {Amazon Lily} or {Kuja Pirates}
// type cards from your hand: Give your Leader and all of your Characters up to 1
// rested DON!! card each.
// [Trigger] If your Leader has the {Kuja Pirates} type, play this card.

export const OP14_105_GORGON_SISTERS: EffectSchema = {
  card_id: "OP14-105",
  card_name: "Gorgon Sisters",
  card_type: "Character",
  effects: [
    {
      id: "OP14-105_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 3,
          filter: { traits_any_of: ["Amazon Lily", "Kuja Pirates"] },
        },
      ],
      actions: [
        {
          type: "DISTRIBUTE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
          },
          params: { amount_per_target: 1, don_state: "RESTED" },
        },
      ],
    },
    {
      id: "OP14-105_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kuja Pirates" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP14-106 Salome ─────────────────────────────────────────────────────────
// [Blocker]
// [Trigger] Play this card.

export const OP14_106_SALOME: EffectSchema = {
  card_id: "OP14-106",
  card_name: "Salome",
  card_type: "Character",
  effects: [
    {
      id: "OP14-106_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-106_trigger",
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

// ─── OP14-107 Shakuyaku ──────────────────────────────────────────────────────
// [On Play] If your opponent has 3 or less Life cards, draw 2 cards and trash 2
// cards from your hand.
// [Trigger] If your Leader has the {Kuja Pirates} type, play this card.

export const OP14_107_SHAKUYAKU: EffectSchema = {
  card_id: "OP14-107",
  card_name: "Shakuyaku",
  card_type: "Character",
  effects: [
    {
      id: "OP14-107_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
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
            count: { exact: 2 },
          },
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP14-107_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kuja Pirates" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP14-108 Silvers Rayleigh ───────────────────────────────────────────────
// [On Play] If your Leader is multicolored and your opponent has 3 or less Life
// cards, K.O. up to 1 of your opponent's Characters with 7000 base power or less.
// [Trigger] Activate this card's [On Play] effect.

export const OP14_108_SILVERS_RAYLEIGH: EffectSchema = {
  card_id: "OP14-108",
  card_name: "Silvers Rayleigh",
  card_type: "Character",
  effects: [
    {
      id: "OP14-108_on_play",
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
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: "<=",
            value: 3,
          },
        ],
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 7000 },
          },
        },
      ],
    },
    {
      id: "OP14-108_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "ON_PLAY" },
        },
      ],
    },
  ],
};

// ─── OP14-109 Victoria Cindry ────────────────────────────────────────────────
// [Blocker]
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 4 or less from your trash rested.

export const OP14_109_VICTORIA_CINDRY: EffectSchema = {
  card_id: "OP14-109",
  card_name: "Victoria Cindry",
  card_type: "Character",
  effects: [
    {
      id: "OP14-109_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP14-109_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-110 Dr. Hogback ────────────────────────────────────────────────────
// [On K.O.] Play up to 1 Character card with a cost of 4 or less and a [Trigger]
// other than [Dr. Hogback] from your trash.
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 4 or less from your trash rested.

export const OP14_110_DR_HOGBACK: EffectSchema = {
  card_id: "OP14-110",
  card_name: "Dr. Hogback",
  card_type: "Character",
  effects: [
    {
      id: "OP14-110_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              cost_max: 4,
              has_trigger: true,
              exclude_name: "Dr. Hogback",
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "OP14-110_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-111 Perona ─────────────────────────────────────────────────────────
// [On Play]/[On K.O.] Up to 1 of your opponent's Characters with a cost of 6 or
// less cannot attack until the end of your opponent's next End Phase.
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 4 or less from your trash rested.

export const OP14_111_PERONA: EffectSchema = {
  card_id: "OP14-111",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "OP14-111_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP14-111_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP14-111_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-112 Boa Hancock ────────────────────────────────────────────────────
// [On Play] If your Leader has the {The Seven Warlords of the Sea} type, add up to
// 1 card from the top of your deck to the top of your Life cards. Then, add up to 1
// card from the top of your opponent's Life cards to the owner's hand.
// [Trigger] Play up to 1 Character card with 6000 power or less and a [Trigger]
// from your hand.

export const OP14_112_BOA_HANCOCK: EffectSchema = {
  card_id: "OP14-112",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "OP14-112_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Seven Warlords of the Sea" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "LIFE_TO_HAND",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP14-112_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              power_max: 6000,
              has_trigger: true,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-113 Marguerite ─────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Amazon Lily}
// or {Kuja Pirates} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order and trash 1 card from your hand.
// [Trigger] If your Leader has the {Kuja Pirates} type, play this card.

export const OP14_113_MARGUERITE: EffectSchema = {
  card_id: "OP14-113",
  card_name: "Marguerite",
  card_type: "Character",
  effects: [
    {
      id: "OP14-113_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Amazon Lily", "Kuja Pirates"],
            },
            rest_destination: "BOTTOM",
          },
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
    {
      id: "OP14-113_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kuja Pirates" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP14-114 Ran ────────────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your
// {Kuja Pirates} type Leader or Character cards.
// [Trigger] If your Leader has the {Kuja Pirates} type, play this card.

export const OP14_114_RAN: EffectSchema = {
  card_id: "OP14-114",
  card_name: "Ran",
  card_type: "Character",
  effects: [
    {
      id: "OP14-114_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { traits: ["Kuja Pirates"] },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
    {
      id: "OP14-114_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kuja Pirates" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP14-115 Rindo ──────────────────────────────────────────────────────────
// [Opponent's Turn] [On K.O.] Add up to 1 card from the top of your deck to the
// top of your Life cards. Then, you take 1 damage.
// [Trigger] If your Leader has the {Kuja Pirates} type, play this card.

export const OP14_115_RINDO: EffectSchema = {
  card_id: "OP14-115",
  card_name: "Rindo",
  card_type: "Character",
  effects: [
    {
      id: "OP14-115_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "SELF_TAKE_DAMAGE",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP14-115_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kuja Pirates" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── OP14-116 Salamander (Event) ─────────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this
// battle. Then, play up to 1 {Amazon Lily} or {Kuja Pirates} type Character card
// with a cost of 4 or less from your hand.
// [Trigger] Draw 1 card.

export const OP14_116_SALAMANDER: EffectSchema = {
  card_id: "OP14-116",
  card_name: "Salamander",
  card_type: "Event",
  effects: [
    {
      id: "OP14-116_counter",
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
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Amazon Lily", "Kuja Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP14-116_trigger",
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

// ─── OP14-117 Brick Bat (Event) ──────────────────────────────────────────────
// [Counter] Up to 1 of your {Thriller Bark Pirates} type Leader or Character cards
// gains +3000 power during this battle.
// [Trigger] Play up to 1 {Thriller Bark Pirates} type Character card with a cost of
// 4 or less from your trash rested.

export const OP14_117_BRICK_BAT: EffectSchema = {
  card_id: "OP14-117",
  card_name: "Brick Bat",
  card_type: "Event",
  effects: [
    {
      id: "OP14-117_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Thriller Bark Pirates"] },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "OP14-117_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP14-118 You'll Frighten Me... ♡ (Event) ────────────────────────────────
// [Counter] If you have 2 or less Life cards, up to 1 of your opponent's active
// Characters cannot attack during this turn.
// [Trigger] Play up to 1 Character card with 6000 power or less and a [Trigger]
// from your hand.

export const OP14_118_YOULL_FRIGHTEN_ME: EffectSchema = {
  card_id: "OP14-118",
  card_name: "You'll Frighten Me... ♡",
  card_type: "Event",
  effects: [
    {
      id: "OP14-118_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_active: true },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP14-118_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              power_max: 6000,
              has_trigger: true,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP14-119 Dracule Mihawk ─────────────────────────────────────────────────
// [Your Turn] When this Character becomes rested, up to 1 of your opponent's
// Characters with a cost of 9 or less cannot be rested until the end of your
// opponent's next End Phase.
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand:
// Up to 1 of your Leader or Character cards gains +2000 power during this battle.

export const OP14_119_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP14-119",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "OP14-119_on_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 9 },
          },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP14-119_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
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

// ─── OP14-120 Crocodile ──────────────────────────────────────────────────────
// [On Play] Up to 1 of your opponent's Characters with a cost of 9 or less cannot
// attack until the end of your opponent's next End Phase. Then, if your opponent has
// a Character with a cost of 0 or with a cost of 8 or more, draw 1 card.
// [On K.O.] You may trash 1 card from your hand: Play this Character card from
// your trash.

export const OP14_120_CROCODILE: EffectSchema = {
  card_id: "OP14-120",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "OP14-120_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 9 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            any_of: [
              { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_exact: 0 } },
              { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_min: 8 } },
            ],
          },
        },
      ],
    },
    {
      id: "OP14-120_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { exact: 1 },
            filter: { name: "Crocodile" },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP14_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP14-001": OP14_001_TRAFALGAR_LAW,
  "OP14-002": OP14_002_UROUGE,
  "OP14-003": OP14_003_CAPONE_GANG_BEGE,
  "OP14-004": OP14_004_CAVENDISH,
  "OP14-005": OP14_005_KILLER,
  "OP14-006": OP14_006_SHACHI_AND_PENGUIN,
  "OP14-009": OP14_009_TRAFALGAR_LAW,
  "OP14-010": OP14_010_BASIL_HAWKINS,
  "OP14-011": OP14_011_BARTOLOMEO,
  "OP14-012": OP14_012_BEPO,
  "OP14-013": OP14_013_MONKEY_D_LUFFY,
  "OP14-014": OP14_014_EUSTASS_CAPTAIN_KID,
  "OP14-015": OP14_015_RORONOA_ZORO,
  "OP14-016": OP14_016_X_DRAKE,
  "OP14-017": OP14_017_CHAMBRES,
  "OP14-018": OP14_018_TIME_FOR_THE_COUNTERATTACK,
  "OP14-019": OP14_019_I_HAVE_A_PLAN,
  // Green
  "OP14-020": OP14_020_DRACULE_MIHAWK,
  "OP14-021": OP14_021_ISSHO,
  "OP14-022": OP14_022_USOPP,
  "OP14-023": OP14_023_KIKUNOJO,
  "OP14-024": OP14_024_KINEMON,
  "OP14-025": OP14_025_KURO,
  "OP14-026": OP14_026_KOUZUKI_ODEN,
  "OP14-027": OP14_027_SHANKS,
  "OP14-028": OP14_028_JOHNNY,
  "OP14-029": OP14_029_TASHIGI,
  "OP14-031": OP14_031_NAMI,
  "OP14-032": OP14_032_HUMANDRILL,
  "OP14-033": OP14_033_PERONA,
  "OP14-034": OP14_034_MONKEY_D_LUFFY,
  "OP14-035": OP14_035_YOSAKU,
  "OP14-036": OP14_036_STRIVE_TO_SURPASS_ME,
  "OP14-037": OP14_037_FOR_FUN,
  "OP14-038": OP14_038_I_NEVER_BOTHER,
  "OP14-039": OP14_039_COFFIN_BOAT,
  // Blue
  "OP14-040": OP14_040_JINBE,
  "OP14-041": OP14_041_BOA_HANCOCK,
  "OP14-042": OP14_042_ARLONG,
  "OP14-043": OP14_043_ALADINE,
  "OP14-044": OP14_044_EDWARD_NEWGATE,
  "OP14-045": OP14_045_KUROOBI,
  "OP14-046": OP14_046_KOALA,
  "OP14-047": OP14_047_SHIRAHOSHI,
  "OP14-048": OP14_048_SHIRYU,
  "OP14-049": OP14_049_JINBE,
  "OP14-050": OP14_050_CHEW,
  "OP14-051": OP14_051_HATCHAN,
  "OP14-052": OP14_052_HANNYABAL,
  "OP14-053": OP14_053_VISTA,
  "OP14-054": OP14_054_FISHER_TIGER,
  "OP14-056": OP14_056_WADATSUMI,
  "OP14-057": OP14_057_DONT_WORRY,
  "OP14-058": OP14_058_OCEAN_CURRENT_SHOULDER_THROW,
  "OP14-059": OP14_059_PLEASE_TAKE_ME_WITH_YOU,
  // Purple
  "OP14-060": OP14_060_DONQUIXOTE_DOFLAMINGO,
  "OP14-061": OP14_061_VERGO,
  "OP14-062": OP14_062_GLADIUS,
  "OP14-063": OP14_063_SUGAR,
  "OP14-064": OP14_064_GIOLLA,
  "OP14-065": OP14_065_SENOR_PINK,
  "OP14-067": OP14_067_DELLINGER,
  "OP14-068": OP14_068_TREBOL,
  "OP14-069": OP14_069_DONQUIXOTE_DOFLAMINGO,
  "OP14-070": OP14_070_BUFFALO,
  "OP14-071": OP14_071_PICA,
  "OP14-072": OP14_072_BABY_5,
  "OP14-074": OP14_074_MONET,
  "OP14-075": OP14_075_LAO_G,
  "OP14-076": OP14_076_EVER_WHITE,
  "OP14-077": OP14_077_PENTA_CHROMATIC_STRING,
  "OP14-078": OP14_078_BULLET_STRING,
  // Black
  "OP14-079": OP14_079_CROCODILE,
  "OP14-080": OP14_080_GECKO_MORIA,
  "OP14-081": OP14_081_SPIDER_MICE,
  "OP14-082": OP14_082_OINKCHUCK,
  "OP14-083": OP14_083_MS_WEDNESDAY,
  "OP14-084": OP14_084_MS_ALL_SUNDAY,
  "OP14-085": OP14_085_MISS_GOLDENWEEK,
  "OP14-086": OP14_086_MISS_DOUBLEFINGER,
  "OP14-087": OP14_087_MISS_VALENTINE,
  "OP14-088": OP14_088_MISS_MERRYCHRISTMAS,
  "OP14-089": OP14_089_RYUMA,
  "OP14-090": OP14_090_MR_1,
  "OP14-091": OP14_091_MR_2_BON_KUREI,
  "OP14-092": OP14_092_MR_3,
  "OP14-093": OP14_093_MR_4,
  "OP14-094": OP14_094_MR_5,
  "OP14-096": OP14_096_GROUND_DEATH,
  "OP14-097": OP14_097_HURRY_UP,
  "OP14-098": OP14_098_CRESCENT_CUTLASS,
  "OP14-099": OP14_099_DISAPPOINTED,
  // Yellow
  "OP14-100": OP14_100_ABSALOM,
  "OP14-103": OP14_103_GLORIOSA,
  "OP14-104": OP14_104_GECKO_MORIA,
  "OP14-105": OP14_105_GORGON_SISTERS,
  "OP14-106": OP14_106_SALOME,
  "OP14-107": OP14_107_SHAKUYAKU,
  "OP14-108": OP14_108_SILVERS_RAYLEIGH,
  "OP14-109": OP14_109_VICTORIA_CINDRY,
  "OP14-110": OP14_110_DR_HOGBACK,
  "OP14-111": OP14_111_PERONA,
  "OP14-112": OP14_112_BOA_HANCOCK,
  "OP14-113": OP14_113_MARGUERITE,
  "OP14-114": OP14_114_RAN,
  "OP14-115": OP14_115_RINDO,
  "OP14-116": OP14_116_SALAMANDER,
  "OP14-117": OP14_117_BRICK_BAT,
  "OP14-118": OP14_118_YOULL_FRIGHTEN_ME,
  "OP14-119": OP14_119_DRACULE_MIHAWK,
  "OP14-120": OP14_120_CROCODILE,
};
