/**
 * M4 Effect Schema — OP15 Card Encodings
 *
 * Red (Krieg / Lucy / East Blue / Dressrosa): OP15-001 through OP15-021
 * Green (Brook / Rebecca / Dressrosa / East Blue): OP15-022 through OP15-057
 * Blue (Enel / Sky Island): OP15-058 through OP15-078
 * Purple (Gecko Moria / Thriller Bark / Straw Hat Crew): OP15-079 through OP15-097
 * Yellow (Monkey.D.Luffy / Sky Island / Shandian Warrior): OP15-098 through OP15-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Krieg / Lucy / East Blue / Dressrosa (OP15-001 to OP15-021)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP15-001 Krieg (Leader) ─────────────────────────────────────────────────
// [DON!! x1] [Opponent's Turn] If the only Characters on your field are
// {East Blue} type Characters, give all of your opponent's Characters −2000 power.
// [Activate: Main] [Once Per Turn] Rest up to 1 of your opponent's Characters
// that has 2 or more DON!! cards given.

export const OP15_001_KRIEG: EffectSchema = {
  card_id: "OP15-001",
  card_name: "Krieg",
  card_type: "Leader",
  effects: [
    {
      id: "OP15-001_opponent_turn_debuff",
      category: "permanent",
      conditions: {
        type: "FIELD_PURITY",
        controller: "SELF",
        filter: { traits: ["East Blue"] },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -2000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
          },
        },
      ],
      // Scoped to opponent's turn via DON!!x1 + Opponent's Turn
      flags: { keywords: [] },
    },
    {
      id: "OP15-001_activate_rest",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { don_given_count: { operator: ">=", value: 2 } },
          },
        },
      ],
    },
  ],
};

// ─── OP15-002 Lucy (Leader) ──────────────────────────────────────────────────
// [When Attacking]/[On Your Opponent's Attack] You may trash any number of
// Event or Stage cards from your hand. This Leader gains +1000 power during
// this battle for every card trashed.
// [Activate: Main] [Once Per Turn] If you have activated an Event with a base
// cost of 3 or more during this turn, draw 1 card.

export const OP15_002_LUCY: EffectSchema = {
  card_id: "OP15-002",
  card_name: "Lucy",
  card_type: "Leader",
  effects: [
    {
      id: "OP15-002_trash_for_power",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING" },
          { keyword: "ON_OPPONENT_ATTACK" },
        ],
      },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { any_number: true },
            filter: { card_type: ["EVENT", "STAGE"] },
          },
          params: { amount: { type: "CHOSEN_VALUE" } },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_TRASHED_THIS_WAY",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP15-002_activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "ACTION_PERFORMED_THIS_TURN",
        controller: "SELF",
        action: "ACTIVATED_EVENT",
        filter: { base_cost_min: 3 },
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP15-003 Alvida ─────────────────────────────────────────────────────────
// If this Character would be K.O.'d, you may trash 1 Character card with a
// power of 6000 or less from your hand instead.
// [Activate: Main] [Once Per Turn] You may give 1 of your opponent's rested
// DON!! cards to 1 of your opponent's Characters: Give up to 1 rested DON!!
// card to its owner's Leader or 1 of their Characters.

export const OP15_003_ALVIDA: EffectSchema = {
  card_id: "OP15-003",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      id: "OP15-003_replacement_ko",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
            filter: { card_type: "CHARACTER", power_max: 6000 },
          },
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP15-003_activate_don_move",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "GIVE_OPPONENT_DON",
          amount: 1,
          filter: { is_rested: true },
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP15-004 Sea Cat ────────────────────────────────────────────────────────
// [On Play] If your Leader has 0 power or less, give up to 1 of your
// opponent's Characters −3000 power during this turn.

export const OP15_004_SEA_CAT: EffectSchema = {
  card_id: "OP15-004",
  card_name: "Sea Cat",
  card_type: "Character",
  effects: [
    {
      id: "OP15-004_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { power: { operator: "<=", value: 0 } },
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
  ],
};

// ─── OP15-005 Cabaji ─────────────────────────────────────────────────────────
// [When Attacking] If your opponent has any DON!! cards given, this Character
// gains +2000 power during this turn.

export const OP15_005_CABAJI: EffectSchema = {
  card_id: "OP15-005",
  card_name: "Cabaji",
  card_type: "Character",
  effects: [
    {
      id: "OP15-005_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "DON_GIVEN",
        controller: "OPPONENT",
        mode: "ANY_CARD_HAS_DON",
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

// ─── OP15-006 Cavendish ──────────────────────────────────────────────────────
// If you have 4 or more Events in your trash, this Character gains +2000 power.

export const OP15_006_CAVENDISH: EffectSchema = {
  card_id: "OP15-006",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "OP15-006_permanent_power",
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
      ],
    },
  ],
};

// ─── OP15-007 Gin ────────────────────────────────────────────────────────────
// [On Play] If your Leader has the {East Blue} type, play up to 1 Character
// card with a cost of 5 or less from your hand.

export const OP15_007_GIN: EffectSchema = {
  card_id: "OP15-007",
  card_name: "Gin",
  card_type: "Character",
  effects: [
    {
      id: "OP15-007_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "East Blue" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP15-008 Krieg (Character) ──────────────────────────────────────────────
// [On Play] Give up to 3 of your opponent's rested DON!! cards to 1 of your
// opponent's Characters. Then, this Character gains [Rush] during this turn.
// [Activate: Main] [Once Per Turn] If this Character was played on this turn,
// give all of your opponent's Characters −1000 power during this turn for every
// DON!! card given to that Character.

export const OP15_008_KRIEG: EffectSchema = {
  card_id: "OP15-008",
  card_name: "Krieg",
  card_type: "Character",
  effects: [
    {
      id: "OP15-008_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_OPPONENT_DON_TO_OPPONENT",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
          params: { amount: 3, source_filter: { is_rested: true } },
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
    {
      id: "OP15-008_activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: { type: "WAS_PLAYED_THIS_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "DON_GIVEN_TO_TARGET",
              multiplier: -1000,
            },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP15-009 Koby ───────────────────────────────────────────────────────────
// If your Character with 7000 base power or less would be removed from the
// field by your opponent's effect, you may give your Leader −2000 power during
// this turn instead.

export const OP15_009_KOBY: EffectSchema = {
  card_id: "OP15-009",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "OP15-009_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
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
      flags: { optional: true },
    },
  ],
};

// ─── OP15-010 Nezumi ─────────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to its
// owner's Leader or 1 of their Characters.

export const OP15_010_NEZUMI: EffectSchema = {
  card_id: "OP15-010",
  card_name: "Nezumi",
  card_type: "Character",
  effects: [
    {
      id: "OP15-010_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP15-011 Pearl ──────────────────────────────────────────────────────────
// [Opponent's Turn] If your Leader has the {East Blue} type, this Character
// gains [Blocker] and +2000 power.
// [On K.O.] If your Leader has the {East Blue} type, K.O. up to 1 of your
// opponent's Characters with 6000 base power or less.

export const OP15_011_PEARL: EffectSchema = {
  card_id: "OP15-011",
  card_name: "Pearl",
  card_type: "Character",
  effects: [
    {
      id: "OP15-011_opponent_turn_blocker",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "East Blue" },
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
          params: { amount: 2000 },
        },
      ],
    },
    {
      id: "OP15-011_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "East Blue" },
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

// ─── OP15-012 Buggy ──────────────────────────────────────────────────────────
// [When Attacking] Give up to 1 rested DON!! card to its owner's Leader or 1
// of their Characters.
// [On K.O.] Draw 1 card.

export const OP15_012_BUGGY: EffectSchema = {
  card_id: "OP15-012",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "OP15-012_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP15-012_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP15-013 Pincers ────────────────────────────────────────────────────────
// If your Leader has 0 power or less, give this card in your hand −2 cost.
// [Blocker]
// DEFERRED: HAND_ZONE_MODIFIER (hand cost reduction) — only encoding [Blocker]

export const OP15_013_PINCERS: EffectSchema = {
  card_id: "OP15-013",
  card_name: "Pincers",
  card_type: "Character",
  effects: [
    {
      id: "OP15-013_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP15-014 Bartolomeo ─────────────────────────────────────────────────────
// If this Character would be K.O.'d, you may trash 1 Event from your hand instead.
// [On Play] Activate up to 1 {Dressrosa} type Event with a base cost of 3 or
// less from your hand.

export const OP15_014_BARTOLOMEO: EffectSchema = {
  card_id: "OP15-014",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "OP15-014_replacement_ko",
      category: "replacement",
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
            filter: { card_type: "EVENT" },
          },
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP15-014_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ACTIVATE_EVENT_FROM_HAND",
          target: {
            type: "EVENT_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"], base_cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-015 Higuma ─────────────────────────────────────────────────────────
// [On Play] Give up to 1 of your opponent's rested DON!! cards to 1 of your
// opponent's Characters. Then, give −1000 power during this turn to up to 1 of
// your opponent's Characters with a DON!! card given.

export const OP15_015_HIGUMA: EffectSchema = {
  card_id: "OP15-015",
  card_name: "Higuma",
  card_type: "Character",
  effects: [
    {
      id: "OP15-015_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_OPPONENT_DON_TO_OPPONENT",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
          params: { amount: 1, source_filter: { is_rested: true } },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { don_given_count: { operator: ">=", value: 1 } },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP15-017 Morgan ─────────────────────────────────────────────────────────
// [Blocker]
// [Activate: Main] [Once Per Turn] You may give 1 of your opponent's rested
// DON!! cards to 1 of your opponent's Characters: Give up to 1 rested DON!!
// card to its owner's Leader or 1 of their Characters.

export const OP15_017_MORGAN: EffectSchema = {
  card_id: "OP15-017",
  card_name: "Morgan",
  card_type: "Character",
  effects: [
    {
      id: "OP15-017_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-017_activate_don_move",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "GIVE_OPPONENT_DON",
          amount: 1,
          filter: { is_rested: true },
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP15-018 Mohji ──────────────────────────────────────────────────────────
// [When Attacking] K.O. up to 1 of your opponent's Characters with 3000 power
// or less with a DON!! card given.

export const OP15_018_MOHJI: EffectSchema = {
  card_id: "OP15-018",
  card_name: "Mohji",
  card_type: "Character",
  effects: [
    {
      id: "OP15-018_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              power_max: 3000,
              don_given_count: { operator: ">=", value: 1 },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP15-019 Barrier Bulls (Event) ──────────────────────────────────────────
// [Main] Draw 1 card and your Leader gains +1000 power until the end of your
// opponent's next End Phase.
// [Trigger] Give up to 1 of your opponent's Characters −4000 power during this turn.

export const OP15_019_BARRIER_BULLS: EffectSchema = {
  card_id: "OP15-019",
  card_name: "Barrier Bulls",
  card_type: "Event",
  effects: [
    {
      id: "OP15-019_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP15-019_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP15-020 Fire Fist (Event) ──────────────────────────────────────────────
// [Main] Your Leader gains +3000 power during this turn and give up to 1 of
// your opponent's Characters −8000 power until the end of your opponent's next
// End Phase. Then, you may trash 2 cards from your hand. If you do, K.O. up to
// 1 of your opponent's Characters with 0 power or less.

export const OP15_020_FIRE_FIST: EffectSchema = {
  card_id: "OP15-020",
  card_name: "Fire Fist",
  card_type: "Event",
  effects: [
    {
      id: "OP15-020_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -8000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "AND",
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 2 },
          },
          params: { amount: 2 },
          chain: "THEN",
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 0 },
          },
          chain: "IF_DO",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-021 Just Watch Me, Ace!!! (Event) ──────────────────────────────────
// If you have 4 or more Events in your trash, give this card in your hand −3 cost.
// [Main]/[Counter] Give up to 1 of your opponent's Characters −3000 power
// during this turn.
// NOTE: Hand cost reduction is a HAND_ZONE_MODIFIER pattern but simple enough
// to encode as a _comment. The main effect is the [Main]/[Counter].

export const OP15_021_JUST_WATCH_ME_ACE: EffectSchema = {
  card_id: "OP15-021",
  card_name: "Just Watch Me, Ace!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP15-021_main_counter",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "MAIN_EVENT" },
          { keyword: "COUNTER_EVENT" },
        ],
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
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Brook / Rebecca / Dressrosa / East Blue (OP15-022 to OP15-057)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP15-022 Brook (Leader) ─────────────────────────────────────────────────
// Under the rules of this game, you do not lose when your deck has 0 cards.
// You lose at the end of the turn in which your deck becomes 0 cards.
// [Activate: Main] [Once Per Turn] Trash 4 cards from the top of your deck.
// Then, if your deck has 0 cards, set up to 1 of your Characters as active.

export const OP15_022_BROOK: EffectSchema = {
  card_id: "OP15-022",
  card_name: "Brook",
  card_type: "Leader",
  rule_modifications: [
    {
      rule_type: "LOSS_CONDITION_MOD",
      trigger_event: "DECK_OUT",
      modification: "DELAYED_LOSS",
      delay: { timing: "END_OF_TURN" },
    },
  ],
  effects: [
    {
      id: "OP15-022_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        { type: "MILL", params: { amount: 4 } },
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          chain: "THEN",
          conditions: {
            type: "DECK_COUNT",
            controller: "SELF",
            operator: "==",
            value: 0,
          },
        },
      ],
    },
  ],
};

// ─── OP15-023 Arlong ─────────────────────────────────────────────────────────
// [On K.O.] Up to 2 of your opponent's rested cards will not become active in
// your opponent's next Refresh Phase.
// [Activate: Main] [Once Per Turn] You may give 1 of your opponent's rested
// DON!! cards to 1 of your opponent's Characters: Give up to 1 DON!! card from
// its owner's cost area to its owner's Leader or 1 of their Characters.

export const OP15_023_ARLONG: EffectSchema = {
  card_id: "OP15-023",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "OP15-023_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
    {
      id: "OP15-023_activate_don_move",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "GIVE_OPPONENT_DON",
          amount: 1,
          filter: { is_rested: true },
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
      ],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP15-024 Usopp ──────────────────────────────────────────────────────────
// [Opponent's Turn] This Character cannot be rested by your opponent's Leader
// and Character effects and gains [Blocker].
// [On K.O.] Rest up to 1 of your opponent's Leader or Character cards with a
// cost of 7 or less.

export const OP15_024_USOPP: EffectSchema = {
  card_id: "OP15-024",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "OP15-024_opponent_turn_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_RESTED",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
    {
      id: "OP15-024_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-025 Kuro ───────────────────────────────────────────────────────────
// [Blocker]
// [On Play] Give up to 2 DON!! cards from your opponent's cost area to 1 of
// your opponent's Characters. Then, at the end of this turn, up to 1 rested
// Character with 3 or more DON!! cards given will not become active in your
// opponent's next Refresh Phase.

export const OP15_025_KURO: EffectSchema = {
  card_id: "OP15-025",
  card_name: "Kuro",
  card_type: "Character",
  effects: [
    {
      id: "OP15-025_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-025_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_OPPONENT_DON_TO_OPPONENT",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
          params: { amount: 2, source: "COST_AREA" },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "APPLY_PROHIBITION",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { up_to: 1 },
                filter: {
                  is_rested: true,
                  don_given_count: { operator: ">=", value: 3 },
                },
              },
              params: { prohibition_type: "CANNOT_REFRESH" },
              duration: { type: "SKIP_NEXT_REFRESH" },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP15-026 Jango ──────────────────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1
// {East Blue} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// [Activate: Main] You may trash this Character: Give up to 1 of your
// opponent's rested DON!! cards to 1 of your opponent's Characters.

export const OP15_026_JANGO: EffectSchema = {
  card_id: "OP15-026",
  card_name: "Jango",
  card_type: "Character",
  effects: [
    {
      id: "OP15-026_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["East Blue"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP15-026_activate_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "GIVE_OPPONENT_DON_TO_OPPONENT",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
          params: { amount: 1, source_filter: { is_rested: true } },
        },
      ],
    },
  ],
};

// ─── OP15-027 Dracule Mihawk ─────────────────────────────────────────────────
// [On Play] Rest up to 1 of your opponent's Characters with a DON!! card given.

export const OP15_027_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP15-027",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "OP15-027_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { don_given_count: { operator: ">=", value: 1 } },
          },
        },
      ],
    },
  ],
};

// ─── OP15-028 Meowban Brothers ───────────────────────────────────────────────
// [On Play] If your Leader has the {East Blue} type, give up to 1 DON!! card
// from your opponent's cost area to 1 of your opponent's Characters.

export const OP15_028_MEOWBAN_BROTHERS: EffectSchema = {
  card_id: "OP15-028",
  card_name: "Meowban Brothers",
  card_type: "Character",
  effects: [
    {
      id: "OP15-028_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "East Blue" },
      },
      actions: [
        {
          type: "GIVE_OPPONENT_DON_TO_OPPONENT",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
          params: { amount: 1, source: "COST_AREA" },
        },
      ],
    },
  ],
};

// ─── OP15-029 Bartholomew Kuma ───────────────────────────────────────────────
// [On Play] Up to 1 of your opponent's Characters with a cost of 5 or less
// cannot be rested until the end of your opponent's next End Phase.
// NOTE: "cannot be rested" seems odd — the text likely means "cannot attack"
// or similar. Encoding literally as CANNOT_BE_RESTED prohibition.

export const OP15_029_BARTHOLOMEW_KUMA: EffectSchema = {
  card_id: "OP15-029",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "OP15-029_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── OP15-031 Purinpurin ─────────────────────────────────────────────────────
// [On Play] Select up to 1 of your opponent's rested Characters. If the chosen
// Character has a cost equal to the number of DON!! cards given to it, K.O. it.

export const OP15_031_PURINPURIN: EffectSchema = {
  card_id: "OP15-031",
  card_name: "Purinpurin",
  card_type: "Character",
  effects: [
    {
      id: "OP15-031_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              is_rested: true,
              cost_exact: { type: "PER_COUNT", source: "DON_GIVEN_TO_TARGET", multiplier: 1 },
            },
          },
          // _comment: "Cost must equal DON!! given count on that character"
        },
      ],
    },
  ],
};

// ─── OP15-032 Brook (Character) ──────────────────────────────────────────────
// [On Play] Rest up to 1 of your opponent's cards.
// [Activate: Main] You may trash this Character: If your Leader has the
// {Straw Hat Crew} type, set up to 1 of your Characters with a base cost of 8
// or less as active.

export const OP15_032_BROOK: EffectSchema = {
  card_id: "OP15-032",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "OP15-032_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
    {
      id: "OP15-032_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { base_cost_max: 8 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-033 Hody Jones ─────────────────────────────────────────────────────
// [On Play] Set your {Fish-Man} type Leader as active. Then, add 1 card from
// the top of your Life cards to your hand.

export const OP15_033_HODY_JONES: EffectSchema = {
  card_id: "OP15-033",
  card_name: "Hody Jones",
  card_type: "Character",
  effects: [
    {
      id: "OP15-033_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "YOUR_LEADER",
            filter: { traits: ["Fish-Man"] },
          },
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

// ─── OP15-034 Yorki ──────────────────────────────────────────────────────────
// [Your Turn] [On Play] Up to 1 of your [Brook] cards gains +2000 power
// during this turn.

export const OP15_034_YORKI: EffectSchema = {
  card_id: "OP15-034",
  card_name: "Yorki",
  card_type: "Character",
  effects: [
    {
      id: "OP15-034_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Brook" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP15-035 Laboon ─────────────────────────────────────────────────────────
// If your Character with 7000 base power or less would be removed from the
// field by your opponent's effect, you may rest 2 of your cards instead.

export const OP15_035_LABOON: EffectSchema = {
  card_id: "OP15-035",
  card_name: "Laboon",
  card_type: "Character",
  effects: [
    {
      id: "OP15-035_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 2 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-036 Ryuma ──────────────────────────────────────────────────────────
// [On Play]/[When Attacking] K.O. up to 1 of your opponent's rested Characters
// with a cost of 4 or less.

export const OP15_036_RYUMA: EffectSchema = {
  card_id: "OP15-036",
  card_name: "Ryuma",
  card_type: "Character",
  effects: [
    {
      id: "OP15-036_on_play_or_attack",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-037 The Outcome Will Tell Us Who's Strong and Who's Weak (Event) ──
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 {East Blue}
// type card other than [The Outcome Will Tell Us Who's Strong and Who's Weak]
// and add it to your hand. Then, place the rest at the bottom of your deck in
// any order.
// [Trigger] Draw 1 card.

export const OP15_037_THE_OUTCOME_WILL_TELL_US: EffectSchema = {
  card_id: "OP15-037",
  card_name: "The Outcome Will Tell Us Who's Strong and Who's Weak",
  card_type: "Event",
  effects: [
    {
      id: "OP15-037_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["East Blue"],
              exclude_name: "The Outcome Will Tell Us Who's Strong and Who's Weak",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP15-037_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP15-038 It's an Order! Do Not Defy Me!!! (Event) ──────────────────────
// [Main] Up to 1 of your opponent's rested Characters with a cost of 8 or less
// that has 2 or more DON!! cards given will not become active in your opponent's
// next Refresh Phase.
// [Counter] Up to 1 of your [Krieg] cards gains +4000 power during this battle.

export const OP15_038_ITS_AN_ORDER: EffectSchema = {
  card_id: "OP15-038",
  card_name: "It's an Order! Do Not Defy Me!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP15-038_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              is_rested: true,
              cost_max: 8,
              don_given_count: { operator: ">=", value: 2 },
            },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
    {
      id: "OP15-038_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Krieg" },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP15-039 Rebecca (Leader) ───────────────────────────────────────────────
// This Leader cannot attack.
// [Activate: Main] You may rest this Leader and return 1 of your {Dressrosa}
// type Characters to the owner's hand: Play up to 1 {Dressrosa} type Character
// card with a cost of 3 from your hand.

export const OP15_039_REBECCA: EffectSchema = {
  card_id: "OP15-039",
  card_name: "Rebecca",
  card_type: "Leader",
  effects: [
    {
      id: "OP15-039_cannot_attack",
      category: "permanent",
      prohibitions: [{ type: "CANNOT_ATTACK" }],
    },
    {
      id: "OP15-039_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          amount: 1,
          filter: { traits: ["Dressrosa"] },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"], cost_exact: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-040 Viola ──────────────────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1
// {Dressrosa} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const OP15_040_VIOLA: EffectSchema = {
  card_id: "OP15-040",
  card_name: "Viola",
  card_type: "Character",
  effects: [
    {
      id: "OP15-040_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Dressrosa"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP15-041 Orlumbus ───────────────────────────────────────────────────────
// [On K.O.] Draw 1 card.
// [Activate: Main] [Once Per Turn] You may place 1 of your Characters at the
// bottom of the owner's deck: This Character gains [Rush] during this turn.

export const OP15_041_ORLUMBUS: EffectSchema = {
  card_id: "OP15-041",
  card_name: "Orlumbus",
  card_type: "Character",
  effects: [
    {
      id: "OP15-041_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "OP15-041_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          amount: 1,
          position: "BOTTOM",
        },
      ],
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

// ─── OP15-042 Kyros ──────────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: If your Leader is [Rebecca],
// this Character gains [Rush] during this turn.
// [On K.O.] Add this Character card from your trash to your hand.

export const OP15_042_KYROS: EffectSchema = {
  card_id: "OP15-042",
  card_name: "Kyros",
  card_type: "Character",
  effects: [
    {
      id: "OP15-042_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Rebecca" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP15-042_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP15-043 Kelly Funk ─────────────────────────────────────────────────────
// [On Play] Play up to 1 [Bobby Funk] from your hand.

export const OP15_043_KELLY_FUNK: EffectSchema = {
  card_id: "OP15-043",
  card_name: "Kelly Funk",
  card_type: "Character",
  effects: [
    {
      id: "OP15-043_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Bobby Funk" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP15-044 Koala ──────────────────────────────────────────────────────────
// [Blocker]
// [On K.O.] Look at 3 cards from the top of your deck; reveal up to 1
// {Dressrosa} type Event and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const OP15_044_KOALA: EffectSchema = {
  card_id: "OP15-044",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "OP15-044_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-044_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Dressrosa"], card_type: "EVENT" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP15-045 Sai ────────────────────────────────────────────────────────────
// [Blocker]
// [On Play] You may trash 1 Event from your hand: Draw 2 cards.

export const OP15_045_SAI: EffectSchema = {
  card_id: "OP15-045",
  card_name: "Sai",
  card_type: "Character",
  effects: [
    {
      id: "OP15-045_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-045_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "EVENT" } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-046 Sabo ───────────────────────────────────────────────────────────
// [Blocker]
// [On Play] If your Leader has the {Dressrosa} type, activate up to 1
// {Dressrosa} type Event from your hand.

export const OP15_046_SABO: EffectSchema = {
  card_id: "OP15-046",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "OP15-046_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-046_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Dressrosa" },
      },
      actions: [
        {
          type: "ACTIVATE_EVENT_FROM_HAND",
          target: {
            type: "EVENT_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"] },
          },
        },
      ],
    },
  ],
};

// ─── OP15-047 Sanji ──────────────────────────────────────────────────────────
// [Blocker]
// [On Play] Up to 1 of your Characters gains [Unblockable] during this turn.

export const OP15_047_SANJI: EffectSchema = {
  card_id: "OP15-047",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP15-047_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-047_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP15-048 Chinjao ────────────────────────────────────────────────────────
// [On Play] You may trash 1 Event from your hand: Draw 2 cards.
// [Opponent's Turn] [On K.O.] Your opponent places 1 card from their hand at
// the bottom of their deck.

export const OP15_048_CHINJAO: EffectSchema = {
  card_id: "OP15-048",
  card_name: "Chinjao",
  card_type: "Character",
  effects: [
    {
      id: "OP15-048_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "EVENT" } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
    {
      id: "OP15-048_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "PLACE_HAND_TO_DECK",
              target: {
                type: "CARD_IN_HAND",
                controller: "OPPONENT",
                count: { exact: 1 },
              },
              params: { amount: 1, position: "BOTTOM" },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP15-050 Bobby Funk ─────────────────────────────────────────────────────
// If you have [Kelly Funk], this Character gains +3000 power.

export const OP15_050_BOBBY_FUNK: EffectSchema = {
  card_id: "OP15-050",
  card_name: "Bobby Funk",
  card_type: "Character",
  effects: [
    {
      id: "OP15-050_permanent",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Kelly Funk" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
    },
  ],
};

// ─── OP15-051 Monkey.D.Luffy ─────────────────────────────────────────────────
// [Opponent's Turn] If your Leader has the {Dressrosa} type, this Character
// gains +3000 power.

export const OP15_051_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP15-051",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP15-051_permanent",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Dressrosa" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
        },
      ],
    },
  ],
};

// ─── OP15-052 Leo ────────────────────────────────────────────────────────────
// If your Character with 7000 base power or less would be removed from the
// field by your opponent's effect, you may place 1 of your Characters at the
// bottom of the owner's deck instead.

export const OP15_052_LEO: EffectSchema = {
  card_id: "OP15-052",
  card_name: "Leo",
  card_type: "Character",
  effects: [
    {
      id: "OP15-052_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-053 Rebecca (Character) ────────────────────────────────────────────
// [DON!! x1] This Character gains [Blocker].
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1
// {Dressrosa} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const OP15_053_REBECCA: EffectSchema = {
  card_id: "OP15-053",
  card_name: "Rebecca",
  card_type: "Character",
  effects: [
    {
      id: "OP15-053_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
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
      id: "OP15-053_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Dressrosa"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP15-054 And No One Else Can Have It! It's Our Memento of Him (Event) ──
// [Main] If your Leader is [Lucy], choose one:
// • Draw 2 cards and trash 1 card from your hand. Then, play up to 1
//   {Dressrosa} type Character card with a cost of 4 or less from your hand.
// • Return up to 1 Stage to the owner's hand.

export const OP15_054_AND_NO_ONE_ELSE: EffectSchema = {
  card_id: "OP15-054",
  card_name: "And No One Else Can Have It! It's Our Memento of Him",
  card_type: "Event",
  effects: [
    {
      id: "OP15-054_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Lucy" },
      },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                { type: "DRAW", params: { amount: 2 } },
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
                  type: "PLAY_CARD",
                  target: {
                    type: "CHARACTER_CARD",
                    source_zone: "HAND",
                    count: { up_to: 1 },
                    filter: { traits: ["Dressrosa"], cost_max: 4 },
                  },
                  params: { source_zone: "HAND", cost_override: "FREE" },
                  chain: "THEN",
                },
              ],
              [
                {
                  type: "RETURN_TO_HAND",
                  target: {
                    type: "STAGE",
                    controller: "EITHER",
                    count: { up_to: 1 },
                  },
                },
              ],
            ],
            labels: [
              "Draw 2, trash 1, play Dressrosa cost 4 or less",
              "Return up to 1 Stage to hand",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP15-055 Go Ahead and Use 'Em, Mr. Luffy!!! (Event) ────────────────────
// [Main] Choose one:
// • Draw 2 cards.
// • Up to 1 of your {Dressrosa} type Characters gains [Blocker] until the end
//   of your opponent's next End Phase.

export const OP15_055_GO_AHEAD_AND_USE_EM: EffectSchema = {
  card_id: "OP15-055",
  card_name: "Go Ahead and Use 'Em, Mr. Luffy!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP15-055_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [{ type: "DRAW", params: { amount: 2 } }],
              [
                {
                  type: "GRANT_KEYWORD",
                  target: {
                    type: "CHARACTER",
                    controller: "SELF",
                    count: { up_to: 1 },
                    filter: { traits: ["Dressrosa"] },
                  },
                  params: { keyword: "BLOCKER" },
                  duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
                },
              ],
            ],
            labels: ["Draw 2 cards", "Grant Blocker to Dressrosa Character"],
          },
        },
      ],
    },
  ],
};

// ─── OP15-056 Would You Let Me Eat the Flame-Flame Fruit? (Event) ───────────
// [Main] Draw 2 cards. Then, your [Lucy] Leader gains [Double Attack] and
// +3000 power during this turn.
// [Trigger] Draw 2 cards.

export const OP15_056_WOULD_YOU_LET_ME_EAT: EffectSchema = {
  card_id: "OP15-056",
  card_name: "Would You Let Me Eat the Flame-Flame Fruit?",
  card_type: "Event",
  effects: [
    {
      id: "OP15-056_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Lucy" },
          },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Lucy" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP15-056_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

// ─── OP15-057 Dressrosa Kingdom (Stage) ──────────────────────────────────────
// [On Play] If your Leader has the {Dressrosa} type, draw 1 card.
// [On Your Opponent's Attack] You may rest this Stage and trash 1 Event or
// Stage card from your hand: Up to 1 of your Leader or Character cards gains
// +2000 power during this battle.

export const OP15_057_DRESSROSA_KINGDOM: EffectSchema = {
  card_id: "OP15-057",
  card_name: "Dressrosa Kingdom",
  card_type: "Stage",
  effects: [
    {
      id: "OP15-057_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Dressrosa" },
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "OP15-057_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: ["EVENT", "STAGE"] } },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Enel / Sky Island (OP15-058 to OP15-078)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP15-058 Enel (Leader) ──────────────────────────────────────────────────
// Under the rules of this game, your DON!! deck consists of 6 cards.
// [Activate: Main] [Once Per Turn] If it is your second turn or later, add up
// to 1 DON!! card from your DON!! deck and set it as active, and add up to 4
// additional DON!! cards and rest them. Then, give up to 4 rested DON!! cards
// to 1 of your Characters.

export const OP15_058_ENEL: EffectSchema = {
  card_id: "OP15-058",
  card_name: "Enel",
  card_type: "Leader",
  rule_modifications: [
    { rule_type: "DON_DECK_SIZE_OVERRIDE", size: 6 },
  ],
  effects: [
    {
      id: "OP15-058_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "TURN_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 4, target_state: "RESTED" },
          chain: "AND",
        },
        {
          type: "GIVE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 4 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP15-059 Amazon ─────────────────────────────────────────────────────────
// [On Your Opponent's Attack] You may rest this Character: Your opponent may
// return 1 of their active DON!! cards to their DON!! deck. If they do not,
// give up to 1 of your opponent's Leader or Character cards −2000 power during
// this turn.

export const OP15_059_AMAZON: EffectSchema = {
  card_id: "OP15-059",
  card_name: "Amazon",
  card_type: "Character",
  effects: [
    {
      id: "OP15-059_on_opponent_attack",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            options: [
              [
                {
                  type: "RETURN_DON_TO_DECK",
                  target: {
                    type: "DON_IN_COST_AREA",
                    controller: "OPPONENT",
                    count: { exact: 1 },
                    filter: { is_active: true },
                  },
                  params: { amount: 1 },
                },
              ],
              [
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
            ],
            labels: ["Return 1 active DON to DON deck", "Opponent gets -2000 power"],
          },
        },
      ],
    },
  ],
};

// ─── OP15-060 Enel (Character) ───────────────────────────────────────────────
// If you have 6 or less DON!! cards on your field, this Character cannot be
// removed from the field by your opponent's effects and gains +2000 power.
// [Activate: Main] DON!! −1: This Character gains [Blocker] until the end of
// your opponent's next End Phase. Then, trash 1 card from your hand.

export const OP15_060_ENEL: EffectSchema = {
  card_id: "OP15-060",
  card_name: "Enel",
  card_type: "Character",
  effects: [
    {
      id: "OP15-060_permanent_protection",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
    {
      id: "OP15-060_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
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
  ],
};

// ─── OP15-061 Ohm ────────────────────────────────────────────────────────────
// [On Play] DON!! −1: Draw 1 card.
// [When Attacking] If you have 6 or less DON!! cards on your field, give up to
// 1 of your opponent's Characters −1000 power during this turn.

export const OP15_061_OHM: EffectSchema = {
  card_id: "OP15-061",
  card_name: "Ohm",
  card_type: "Character",
  effects: [
    {
      id: "OP15-061_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "OP15-061_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
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

// ─── OP15-063 Gedatsu ────────────────────────────────────────────────────────
// [On Play] DON!! −1: Draw 1 card.
// [On K.O.] If you have 6 or less DON!! cards on your field, K.O. up to 1 of
// your opponent's Characters with 2000 power or less.

export const OP15_063_GEDATSU: EffectSchema = {
  card_id: "OP15-063",
  card_name: "Gedatsu",
  card_type: "Character",
  effects: [
    {
      id: "OP15-063_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "OP15-063_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 2000 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-064 Kotori ─────────────────────────────────────────────────────────
// [Activate: Main] DON!! −2, You may rest this Character: If you have [Satori]
// and [Hotori], rest up to 1 of your opponent's Characters with 5000 power or less.

export const OP15_064_KOTORI: EffectSchema = {
  card_id: "OP15-064",
  card_name: "Kotori",
  card_type: "Character",
  effects: [
    {
      id: "OP15-064_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 2 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "MULTIPLE_NAMED_CARDS",
        controller: "SELF",
        names: ["Satori", "Hotori"],
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 5000 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-065 Goro (Character) — On Play reveal conditional add DON
// [On Play] Reveal 1 card from the top of your deck. If the revealed card has
// a cost of 2 or less, add up to 1 DON!! card from your DON!! deck and rest it.

export const OP15_065_GORO: EffectSchema = {
  card_id: "OP15-065",
  card_name: "Goro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-066 Satori ─────────────────────────────────────────────────────────
// [On Play] DON!! −1: Draw 1 card.
// [When Attacking] If you have 6 or less DON!! cards on your field, look at 2
// cards from the top of your deck and place them at the top or bottom of your
// deck in any order.

export const OP15_066_SATORI: EffectSchema = {
  card_id: "OP15-066",
  card_name: "Satori",
  card_type: "Character",
  effects: [
    {
      id: "OP15-066_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "OP15-066_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 2 },
        },
      ],
    },
  ],
};

// ─── OP15-067 Shura ──────────────────────────────────────────────────────────
// If you have 6 or less DON!! cards on your field, this Character gains [Rush].
// [On Play] DON!! −1: Draw 1 card.

export const OP15_067_SHURA: EffectSchema = {
  card_id: "OP15-067",
  card_name: "Shura",
  card_type: "Character",
  effects: [
    {
      id: "OP15-067_conditional_rush",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
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
      id: "OP15-067_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP15-068 Heavenly Warriors ──────────────────────────────────────────────
// If you have 6 or less DON!! cards on your field, this Character gains [Blocker].

export const OP15_068_HEAVENLY_WARRIORS: EffectSchema = {
  card_id: "OP15-068",
  card_name: "Heavenly Warriors",
  card_type: "Character",
  effects: [
    {
      id: "OP15-068_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
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

// ─── OP15-069 Nola ───────────────────────────────────────────────────────────
// If your Character with 7000 base power or less would be removed from the
// field by your opponent's effect, you may return 1 DON!! card from your field
// to your DON!! deck instead.

export const OP15_069_NOLA: EffectSchema = {
  card_id: "OP15-069",
  card_name: "Nola",
  card_type: "Character",
  effects: [
    {
      id: "OP15-069_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
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
      flags: { optional: true },
    },
  ],
};

// ─── OP15-070 Fuza ───────────────────────────────────────────────────────────
// All of your [Shura] cards and this Character gain [Unblockable].
// [Opponent's Turn] All of your [Shura] cards' base power and this Character's
// base power become 6000.

export const OP15_070_FUZA: EffectSchema = {
  card_id: "OP15-070",
  card_name: "Fuza",
  card_type: "Character",
  effects: [
    {
      id: "OP15-070_unblockable",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { name: "Shura" },
          },
          params: { keyword: "UNBLOCKABLE" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "UNBLOCKABLE" },
        },
      ],
    },
    {
      id: "OP15-070_opponent_turn_base_power",
      category: "permanent",
      modifiers: [
        {
          type: "SET_BASE_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { name: "Shura" },
          },
          params: { amount: 6000 },
        },
        {
          type: "SET_BASE_POWER",
          target: { type: "SELF" },
          params: { amount: 6000 },
        },
      ],
    },
  ],
};

// ─── OP15-071 Holly ──────────────────────────────────────────────────────────
// All of your [Ohm] cards and this Character gain [Double Attack].
// [Opponent's Turn] All of your [Ohm] cards' base power and this Character's
// base power become 6000.

export const OP15_071_HOLLY: EffectSchema = {
  card_id: "OP15-071",
  card_name: "Holly",
  card_type: "Character",
  effects: [
    {
      id: "OP15-071_double_attack",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { name: "Ohm" },
          },
          params: { keyword: "DOUBLE_ATTACK" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
        },
      ],
    },
    {
      id: "OP15-071_opponent_turn_base_power",
      category: "permanent",
      modifiers: [
        {
          type: "SET_BASE_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { name: "Ohm" },
          },
          params: { amount: 6000 },
        },
        {
          type: "SET_BASE_POWER",
          target: { type: "SELF" },
          params: { amount: 6000 },
        },
      ],
    },
  ],
};

// ─── OP15-072 Hotori ─────────────────────────────────────────────────────────
// [Activate: Main] DON!! −2, You may rest this Character: If you have [Kotori]
// and [Satori], give up to 1 of your opponent's Characters −3000 power during
// this turn.

export const OP15_072_HOTORI: EffectSchema = {
  card_id: "OP15-072",
  card_name: "Hotori",
  card_type: "Character",
  effects: [
    {
      id: "OP15-072_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 2 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "MULTIPLE_NAMED_CARDS",
        controller: "SELF",
        names: ["Kotori", "Satori"],
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
  ],
};

// ─── OP15-073 Yama ───────────────────────────────────────────────────────────
// [Blocker]
// [On Play] Play up to 1 [Heavenly Warriors] with a cost of 1 or up to 1
// {Vassals} type Character card with a cost of 1 from your hand.

export const OP15_073_YAMA: EffectSchema = {
  card_id: "OP15-073",
  card_name: "Yama",
  card_type: "Character",
  effects: [
    {
      id: "OP15-073_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-073_on_play",
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
              any_of: [
                { name: "Heavenly Warriors", cost_max: 1 },
                { traits: ["Vassals"], cost_max: 1 },
              ],
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP15-074 Varie (Event) ──────────────────────────────────────────────────
// [Main] DON!! −1: If your Leader is [Enel], draw 1 card. Then, up to 1 of
// your Characters gains +2 cost until the end of your opponent's next End Phase.
// [Counter] Up to 1 of your [Enel] cards gains +2000 power during this battle.

export const OP15_074_VARIE: EffectSchema = {
  card_id: "OP15-074",
  card_name: "Varie",
  card_type: "Event",
  effects: [
    {
      id: "OP15-074_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Enel" },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP15-074_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Enel" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP15-075 El Thor (Event) ────────────────────────────────────────────────
// [Main] DON!! −1: If your Leader is [Enel], up to 1 of your Leader or
// Character cards gains +1000 power during this turn. Then, K.O. up to 1 of
// your opponent's Characters with 3000 power or less.
// [Counter] Up to 1 of your [Enel] cards gains +2000 power during this battle.

export const OP15_075_EL_THOR: EffectSchema = {
  card_id: "OP15-075",
  card_name: "El Thor",
  card_type: "Event",
  effects: [
    {
      id: "OP15-075_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Enel" },
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
      id: "OP15-075_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Enel" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP15-076 Lightning Beast Kiten (Event) ──────────────────────────────────
// [Main] DON!! −1: If your Leader is [Enel], draw 1 card. Then, give up to 1
// of your opponent's Characters −1000 power during this turn.
// [Counter] Up to 1 of your [Enel] cards gains +2000 power during this battle.

export const OP15_076_LIGHTNING_BEAST_KITEN: EffectSchema = {
  card_id: "OP15-076",
  card_name: "Lightning Beast Kiten",
  card_type: "Event",
  effects: [
    {
      id: "OP15-076_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Enel" },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
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
      id: "OP15-076_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Enel" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP15-077 Lightning Dragon (Event) ───────────────────────────────────────
// [Main] DON!! −1: Draw 1 card. Then, up to 1 of your opponent's rested
// Characters with 6000 power or less will not become active in your opponent's
// next Refresh Phase.

export const OP15_077_LIGHTNING_DRAGON: EffectSchema = {
  card_id: "OP15-077",
  card_name: "Lightning Dragon",
  card_type: "Event",
  effects: [
    {
      id: "OP15-077_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, power_max: 6000 },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP15-078 Mamaragan (Event) ──────────────────────────────────────────────
// [Main] DON!! −2: Draw 1 card. Then, rest up to 1 of your opponent's
// Characters with 5000 power or less.
// [Counter] Up to 1 of your Leader or Character cards gains +1000 power during
// this battle. Then, if you have 6 or less DON!! cards on your field, draw 1 card.

export const OP15_078_MAMARAGAN: EffectSchema = {
  card_id: "OP15-078",
  card_name: "Mamaragan",
  card_type: "Event",
  effects: [
    {
      id: "OP15-078_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 5000 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP15-078_counter",
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
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "DON_FIELD_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 6,
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Gecko Moria / Thriller Bark / Straw Hat Crew (OP15-079 to OP15-097)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP15-079 Absalom ────────────────────────────────────────────────────────
// [On K.O.] Add up to 1 {Thriller Bark Pirates} type card from your trash to
// your hand.
// [Trigger] Activate this card's [On K.O.] effect.

export const OP15_079_ABSALOM: EffectSchema = {
  card_id: "OP15-079",
  card_name: "Absalom",
  card_type: "Character",
  effects: [
    {
      id: "OP15-079_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Thriller Bark Pirates"] },
          },
        },
      ],
    },
    {
      id: "OP15-079_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }],
    },
  ],
};

// ─── OP15-080 Oars ───────────────────────────────────────────────────────────
// If you have [Gecko Moria] with 10000 power or more on your field and there
// are no other [Oars] cards, this Character gains +7000 power.
// [On K.O.] You may place 3 cards from your trash at the bottom of your deck
// in any order: Play this Character card from your trash.

export const OP15_080_OARS: EffectSchema = {
  card_id: "OP15-080",
  card_name: "Oars",
  card_type: "Character",
  effects: [
    {
      id: "OP15-080_permanent_power",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "NAMED_CARD_WITH_PROPERTY",
            controller: "SELF",
            name: "Gecko Moria",
            property: { power: { operator: ">=", value: 10000 } },
          },
          {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { name: "Oars", exclude_self: true },
            },
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 7000 },
        },
      ],
    },
    {
      id: "OP15-080_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 3,
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Oars" },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-081 Sanji ──────────────────────────────────────────────────────────
// [On Play] If your Leader has the {Straw Hat Crew} type, trash 5 cards from
// the top of your deck.

export const OP15_081_SANJI: EffectSchema = {
  card_id: "OP15-081",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP15-081_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [{ type: "MILL", params: { amount: 5 } }],
    },
  ],
};

// ─── OP15-082 Charlotte Lola ─────────────────────────────────────────────────
// [On Play] Trash 3 cards from the top of your deck.
// [On K.O.] Add up to 1 of your Character cards with a cost of 8 or less from
// your trash to your hand.

export const OP15_082_CHARLOTTE_LOLA: EffectSchema = {
  card_id: "OP15-082",
  card_name: "Charlotte Lola",
  card_type: "Character",
  effects: [
    {
      id: "OP15-082_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "MILL", params: { amount: 3 } }],
    },
    {
      id: "OP15-082_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 8 },
          },
        },
      ],
    },
  ],
};

// ─── OP15-083 Spoil ──────────────────────────────────────────────────────────
// [On Play] Trash 3 cards from the top of your deck.
// [Activate: Main] You may trash this Character: If you have 15 or more cards
// in your trash, give up to 1 rested DON!! card to 1 of your Leader or
// Character cards.

export const OP15_083_SPOIL: EffectSchema = {
  card_id: "OP15-083",
  card_name: "Spoil",
  card_type: "Character",
  effects: [
    {
      id: "OP15-083_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "MILL", params: { amount: 3 } }],
    },
    {
      id: "OP15-083_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 15,
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

// ─── OP15-084 Dr. Hogback ────────────────────────────────────────────────────
// [On Play] If your Leader has the {Thriller Bark Pirates} type, trash 5 cards
// from the top of your deck.
// [On K.O.] If you have 6 or less cards in your hand, draw 1 card.

export const OP15_084_DR_HOGBACK: EffectSchema = {
  card_id: "OP15-084",
  card_name: "Dr. Hogback",
  card_type: "Character",
  effects: [
    {
      id: "OP15-084_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Thriller Bark Pirates" },
      },
      actions: [{ type: "MILL", params: { amount: 5 } }],
    },
    {
      id: "OP15-084_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── OP15-085 Tony Tony.Chopper ──────────────────────────────────────────────
// [On Play] Trash 3 cards from the top of your deck.
// [Activate: Main] You may trash this Character: If your Leader has the
// {Straw Hat Crew} type, add up to 1 {Straw Hat Crew} type Character card
// other than [Tony Tony.Chopper] from your trash to your hand.

export const OP15_085_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP15-085",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "OP15-085_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "MILL", params: { amount: 3 } }],
    },
    {
      id: "OP15-085_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits: ["Straw Hat Crew"],
              exclude_name: "Tony Tony.Chopper",
            },
          },
        },
      ],
    },
  ],
};

// ─── OP15-086 Nami ───────────────────────────────────────────────────────────
// [On Play] If your Leader has the {Straw Hat Crew} type, play up to 1
// {Straw Hat Crew} type Character with a cost of 7 or less from your trash.
// The Character played with this effect gains [Rush] during this turn.

export const OP15_086_NAMI: EffectSchema = {
  card_id: "OP15-086",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "OP15-086_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"], cost_max: 7 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELECTED_CARDS" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP15-087 Nico Robin ─────────────────────────────────────────────────────
// If you have 10 or more cards in your trash, this Character gains [Blocker].
// [On Play] Draw 2 cards and trash 2 cards from your hand.

export const OP15_087_NICO_ROBIN: EffectSchema = {
  card_id: "OP15-087",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "OP15-087_conditional_blocker",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
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
      id: "OP15-087_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
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

// ─── OP15-088 Pirates Docking Six ────────────────────────────────────────────
// This Character gains +6 cost.
// [On Play] You may trash 3 cards from the top of your deck: Play up to 1
// {Straw Hat Crew} type Character card with a cost of 2 or less from your trash.

export const OP15_088_PIRATES_DOCKING_SIX: EffectSchema = {
  card_id: "OP15-088",
  card_name: "Pirates Docking Six",
  card_type: "Character",
  effects: [
    {
      id: "OP15-088_cost_boost",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 6 },
        },
      ],
    },
    {
      id: "OP15-088_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 3 }],
      actions: [
        { type: "MILL", params: { amount: 3 } },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"], cost_max: 2 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-090 Perona ─────────────────────────────────────────────────────────
// If your Character with 7000 base power or less would be removed from the
// field by your opponent's effect, you may trash 1 card from your hand instead.

export const OP15_090_PERONA: EffectSchema = {
  card_id: "OP15-090",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "OP15-090_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
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
      flags: { optional: true },
    },
  ],
};

// ─── OP15-091 Margarita ──────────────────────────────────────────────────────
// [On Play] Place up to 1 card from your opponent's trash at the bottom of the
// owner's deck.

export const OP15_091_MARGARITA: EffectSchema = {
  card_id: "OP15-091",
  card_name: "Margarita",
  card_type: "Character",
  effects: [
    {
      id: "OP15-091_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CARD_IN_TRASH",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP15-092 Monkey.D.Luffy ─────────────────────────────────────────────────
// Apply each of the following effects based on the number of cards in your trash:
// • If there are 10 or more cards, this Character's base power becomes 9000 and
//   it gains +10 cost.
// • If you have 20 or more cards, during your opponent's turn, your Leader's
//   base power becomes 7000.
// • If you have 30 or more cards, this Character gains +1000 power.

export const OP15_092_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP15-092",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP15-092_trash_10",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
      modifiers: [
        {
          type: "SET_BASE_POWER",
          target: { type: "SELF" },
          params: { amount: 9000 },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 10 },
        },
      ],
    },
    {
      id: "OP15-092_trash_20",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 20,
      },
      modifiers: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 7000 },
        },
      ],
    },
    {
      id: "OP15-092_trash_30",
      category: "permanent",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 30,
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

// ─── OP15-093 The Risky Brothers ─────────────────────────────────────────────
// [Activate: Main] You may trash this Character: If you have 15 or more cards
// in your trash, up to 1 of your [Monkey.D.Luffy] Characters gains
// [Rush: Character] and the  attribute during this turn.

export const OP15_093_THE_RISKY_BROTHERS: EffectSchema = {
  card_id: "OP15-093",
  card_name: "The Risky Brothers",
  card_type: "Character",
  effects: [
    {
      id: "OP15-093_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 15,
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { keyword: "RUSH_CHARACTER" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "GRANT_ATTRIBUTE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Monkey.D.Luffy" },
          },
          params: { attribute: "STRIKE" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP15-094 Roronoa Zoro ───────────────────────────────────────────────────
// If your {Straw Hat Crew} type Character other than this Character would be
// removed from the field by your opponent's effect, you may trash this Character
// instead.
// [Blocker]

export const OP15_094_RORONOA_ZORO: EffectSchema = {
  card_id: "OP15-094",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP15-094_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Straw Hat Crew"],
          exclude_self: true,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_CARD",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP15-094_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP15-095 Gum-Gum Storm (Event) ─────────────────────────────────────────
// [Main] You may rest 1 of your DON!! cards: If you have 15 or more cards in
// your trash, up to 1 of your {Straw Hat Crew} type Leader or Character cards
// gains +3000 power during this turn.
// [Counter] If you have 15 or more cards in your trash, up to 1 of your Leader
// or Character cards gains +4000 power during this battle.

export const OP15_095_GUM_GUM_STORM: EffectSchema = {
  card_id: "OP15-095",
  card_name: "Gum-Gum Storm",
  card_type: "Event",
  effects: [
    {
      id: "OP15-095_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 15,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP15-095_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 15,
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

// ─── OP15-096 Swallow Bond en Avant (Event) ──────────────────────────────────
// [Main] You may rest 1 of your DON!! cards: If your Leader has the
// {Straw Hat Crew} type, trash 5 cards from the top of your deck.
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.

export const OP15_096_SWALLOW_BOND_EN_AVANT: EffectSchema = {
  card_id: "OP15-096",
  card_name: "Swallow Bond en Avant",
  card_type: "Event",
  effects: [
    {
      id: "OP15-096_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [{ type: "MILL", params: { amount: 5 } }],
    },
    {
      id: "OP15-096_counter",
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
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP15-097 I Find It Embarrassing as a Human Being (Event) ────────────────
// [Main] If you have 10 or more cards in your trash, up to 1 of your opponent's
// Characters with a base cost of 5 or less cannot attack until the end of your
// opponent's next End Phase.
// [Trigger] Activate this card's [Main] effect.

export const OP15_097_I_FIND_IT_EMBARRASSING: EffectSchema = {
  card_id: "OP15-097",
  card_name: "I Find It Embarrassing as a Human Being",
  card_type: "Event",
  effects: [
    {
      id: "OP15-097_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 5 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "OP15-097_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Monkey.D.Luffy / Sky Island / Shandian Warrior (OP15-098 to OP15-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP15-098 Monkey.D.Luffy (Leader) ────────────────────────────────────────
// If your {Sky Island} type Character with 6000 base power or more would be
// removed from the field by your opponent, you may add 1 card from the top of
// your Life cards to your hand instead.

export const OP15_098_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP15-098",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "OP15-098_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: {
          card_type: "CHARACTER",
          traits: ["Sky Island"],
          base_power_min: 6000,
        },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-099 Urouge ─────────────────────────────────────────────────────────
// [On Play] You may trash 1 {Supernovas} type card from your hand: This
// Character gains [Rush] during this turn.
// [Activate: Main] You may turn 1 card from the top of your Life cards
// face-down: Give up to 1 rested DON!! card to your Leader or 1 of your
// Characters.

export const OP15_099_UROUGE: EffectSchema = {
  card_id: "OP15-099",
  card_name: "Urouge",
  card_type: "Character",
  effects: [
    {
      id: "OP15-099_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Supernovas"] } }],
      flags: { optional: true },
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
      id: "OP15-099_activate",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_FROM_LIFE", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "TURN_LIFE_FACE_DOWN",
          params: { amount: 1 },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
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

// ─── OP15-100 Kamakiri ───────────────────────────────────────────────────────
// [On Play] You may trash this Character and add 1 card from the top of your
// Life cards to your hand: K.O. up to 1 of your opponent's Characters with a
// cost of 6 or less.

export const OP15_100_KAMAKIRI: EffectSchema = {
  card_id: "OP15-100",
  card_name: "Kamakiri",
  card_type: "Character",
  effects: [
    {
      id: "OP15-100_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_SELF" },
        { type: "LIFE_TO_HAND", amount: 1 },
      ],
      flags: { optional: true },
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
      ],
    },
  ],
};

// ─── OP15-101 Kalgara ────────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Look at 5 cards from the top
// of your deck; reveal up to a total of 2 [Mont Blanc Noland] or
// {Shandian Warrior} type cards and add them to your hand. Then, place the rest
// at the bottom of your deck in any order.

export const OP15_101_KALGARA: EffectSchema = {
  card_id: "OP15-101",
  card_name: "Kalgara",
  card_type: "Character",
  effects: [
    {
      id: "OP15-101_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: {
              any_of: [
                { name: "Mont Blanc Noland" },
                { traits: ["Shandian Warrior"] },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP15-102 Gan.Fall ───────────────────────────────────────────────────────
// If you have a {Sky Island} type Character with 7000 power or more, give this
// card in your hand −3 cost.
// [On Play] Rest up to 1 of your opponent's Characters with a cost equal to or
// less than the number of your opponent's Life cards.
// DEFERRED: HAND_ZONE_MODIFIER — only encoding [On Play]

export const OP15_102_GAN_FALL: EffectSchema = {
  card_id: "OP15-102",
  card_name: "Gan.Fall",
  card_type: "Character",
  effects: [
    {
      id: "OP15-102_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              cost_max: {
                type: "GAME_STATE",
                source: "OPPONENT_LIFE_COUNT",
              },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP15-104 Conis ──────────────────────────────────────────────────────────
// [On Play] If you have less Life cards than your opponent, draw 2 cards and
// trash 2 cards from your hand.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP15_104_CONIS: EffectSchema = {
  card_id: "OP15-104",
  card_name: "Conis",
  card_type: "Character",
  effects: [
    {
      id: "OP15-104_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<",
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
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
      id: "OP15-104_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
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

// ─── OP15-105 Jewelry Bonney ─────────────────────────────────────────────────
// If your Character with 7000 base power or less would be removed from the
// field by your opponent's effect, you may add 1 card from the top of your Life
// cards to your hand instead.

export const OP15_105_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP15-105",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "OP15-105_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP15-108 Nami ───────────────────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1
// {Sky Island} type card and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.

export const OP15_108_NAMI: EffectSchema = {
  card_id: "OP15-108",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "OP15-108_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Sky Island"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP15-109 Nico Robin ─────────────────────────────────────────────────────
// [On Play] You may add 1 card from the top of your Life cards to your hand:
// If your Leader has the {Straw Hat Crew} type, add up to 1 card from the top
// of your deck to the top of your Life cards. Then, play up to 1 {Sky Island}
// type Character card with a cost of 5 or less from your hand.

export const OP15_109_NICO_ROBIN: EffectSchema = {
  card_id: "OP15-109",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "OP15-109_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Sky Island"], cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP15-110 Braham ─────────────────────────────────────────────────────────
// [On K.O.] If your Leader has the {Shandian Warrior} type, add up to 1 card
// from the top of your deck to the top of your Life cards.

export const OP15_110_BRAHAM: EffectSchema = {
  card_id: "OP15-110",
  card_name: "Braham",
  card_type: "Character",
  effects: [
    {
      id: "OP15-110_on_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Shandian Warrior" },
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

// ─── OP15-111 Mont Blanc Noland ──────────────────────────────────────────────
// [DON!! x1] [When Attacking] Up to 1 of your [Kalgara] cards gains [Rush]
// during this turn.

export const OP15_111_MONT_BLANC_NOLAND: EffectSchema = {
  card_id: "OP15-111",
  card_name: "Mont Blanc Noland",
  card_type: "Character",
  effects: [
    {
      id: "OP15-111_when_attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Kalgara" },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP15-112 Raki ───────────────────────────────────────────────────────────
// [Blocker]
// [On Play] Play up to 1 {Shandian Warrior} type Character card with a cost of
// 3 or less from your hand.

export const OP15_112_RAKI: EffectSchema = {
  card_id: "OP15-112",
  card_name: "Raki",
  card_type: "Character",
  effects: [
    {
      id: "OP15-112_blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP15-112_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Shandian Warrior"], cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP15-113 Roronoa Zoro ───────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Add up to 1 card from the top
// of your deck to the top of your Life cards.

export const OP15_113_RORONOA_ZORO: EffectSchema = {
  card_id: "OP15-113",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP15-113_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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

// ─── OP15-114 Wyper ──────────────────────────────────────────────────────────
// [On Play] You may turn 1 card from the top of your Life cards face-up: Give
// all of your opponent's Characters −2000 power during this turn. Then, K.O.
// all of your opponent's Characters with 0 power or less.
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your
// {Sky Island} type Leader or Character cards.

export const OP15_114_WYPER: EffectSchema = {
  card_id: "OP15-114",
  card_name: "Wyper",
  card_type: "Character",
  effects: [
    {
      id: "OP15-114_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_LIFE", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { all: true },
            filter: { power_max: 0 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP15-114_activate",
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
            filter: { traits: ["Sky Island"] },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP15-115 Impact Dial (Event) ────────────────────────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.
// Then, add 1 card from the top of your Life cards to your hand.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP15_115_IMPACT_DIAL: EffectSchema = {
  card_id: "OP15-115",
  card_name: "Impact Dial",
  card_type: "Event",
  effects: [
    {
      id: "OP15-115_main",
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
        },
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP15-115_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

// ─── OP15-116 Gum-Gum Golden Rifle (Event) ──────────────────────────────────
// [Main] If your Leader has the {Straw Hat Crew} type, trash 1 card from the
// top of your Life cards. Then, add up to 1 card from the top of your deck to
// the top of your Life cards and trash 1 card from your hand.
// [Counter] Your Leader gains +4000 power during this battle.

export const OP15_116_GUM_GUM_GOLDEN_RIFLE: EffectSchema = {
  card_id: "OP15-116",
  card_name: "Gum-Gum Golden Rifle",
  card_type: "Event",
  effects: [
    {
      id: "OP15-116_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
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
      id: "OP15-116_counter",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP15-117 Heso!! (Event) ─────────────────────────────────────────────────
// [Main] Draw 1 card. Then, give up to 1 rested DON!! card to 1 of your
// {Sky Island} type Leader or Character cards.
// [Trigger] If your Leader has the {Sky Island} type, draw 2 cards.

export const OP15_117_HESO: EffectSchema = {
  card_id: "OP15-117",
  card_name: "Heso!!",
  card_type: "Event",
  effects: [
    {
      id: "OP15-117_main",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Sky Island"] },
          },
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP15-117_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Sky Island" },
      },
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

// ─── OP15-118 Enel (Yellow Character) ────────────────────────────────────────
// If you have 6 or less DON!! cards on your field, this Character cannot be
// removed from the field by your opponent's effects and gains +2000 power.
// [On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to
// 1 card to your hand. Then, place the rest at the bottom of your deck in any
// order, and trash 1 card from your hand.

export const OP15_118_ENEL: EffectSchema = {
  card_id: "OP15-118",
  card_name: "Enel",
  card_type: "Character",
  effects: [
    {
      id: "OP15-118_permanent_protection",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
        },
      ],
    },
    {
      id: "OP15-118_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
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
  ],
};

// ─── OP15-119 Monkey.D.Luffy (Yellow Character) ─────────────────────────────
// If you have 6 or more DON!! cards on your field, this Character gains [Rush].
// When your opponent activates an Event or [Blocker], reveal up to 1 card from
// the top of your Life cards. This Character gains +1000 power during this turn
// per 1 cost on the revealed card.

export const OP15_119_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP15-119",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP15-119_conditional_rush",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 6,
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
      id: "OP15-119_on_opponent_event_blocker",
      category: "auto",
      trigger: {
        any_of: [
          { event: "EVENT_ACTIVATED", filter: { controller: "OPPONENT" } },
          { event: "BLOCKER_ACTIVATED", filter: { controller: "OPPONENT" } },
        ],
      },
      actions: [
        {
          type: "TURN_LIFE_FACE_UP",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "REVEALED_CARD_COST",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP15 Schema Registry
// ═══════════════════════════════════════════════════════════════════════════════

export const OP15_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP15-001": OP15_001_KRIEG,
  "OP15-002": OP15_002_LUCY,
  "OP15-003": OP15_003_ALVIDA,
  "OP15-004": OP15_004_SEA_CAT,
  "OP15-005": OP15_005_CABAJI,
  "OP15-006": OP15_006_CAVENDISH,
  "OP15-007": OP15_007_GIN,
  "OP15-008": OP15_008_KRIEG,
  "OP15-009": OP15_009_KOBY,
  "OP15-010": OP15_010_NEZUMI,
  "OP15-011": OP15_011_PEARL,
  "OP15-012": OP15_012_BUGGY,
  "OP15-013": OP15_013_PINCERS,
  "OP15-014": OP15_014_BARTOLOMEO,
  "OP15-015": OP15_015_HIGUMA,
  "OP15-017": OP15_017_MORGAN,
  "OP15-018": OP15_018_MOHJI,
  "OP15-019": OP15_019_BARRIER_BULLS,
  "OP15-020": OP15_020_FIRE_FIST,
  "OP15-021": OP15_021_JUST_WATCH_ME_ACE,

  // Green
  "OP15-022": OP15_022_BROOK,
  "OP15-023": OP15_023_ARLONG,
  "OP15-024": OP15_024_USOPP,
  "OP15-025": OP15_025_KURO,
  "OP15-026": OP15_026_JANGO,
  "OP15-027": OP15_027_DRACULE_MIHAWK,
  "OP15-028": OP15_028_MEOWBAN_BROTHERS,
  "OP15-029": OP15_029_BARTHOLOMEW_KUMA,
  "OP15-031": OP15_031_PURINPURIN,
  "OP15-032": OP15_032_BROOK,
  "OP15-033": OP15_033_HODY_JONES,
  "OP15-034": OP15_034_YORKI,
  "OP15-035": OP15_035_LABOON,
  "OP15-036": OP15_036_RYUMA,
  "OP15-037": OP15_037_THE_OUTCOME_WILL_TELL_US,
  "OP15-038": OP15_038_ITS_AN_ORDER,
  "OP15-039": OP15_039_REBECCA,
  "OP15-040": OP15_040_VIOLA,
  "OP15-041": OP15_041_ORLUMBUS,
  "OP15-042": OP15_042_KYROS,
  "OP15-043": OP15_043_KELLY_FUNK,
  "OP15-044": OP15_044_KOALA,
  "OP15-045": OP15_045_SAI,
  "OP15-046": OP15_046_SABO,
  "OP15-047": OP15_047_SANJI,
  "OP15-048": OP15_048_CHINJAO,
  "OP15-050": OP15_050_BOBBY_FUNK,
  "OP15-051": OP15_051_MONKEY_D_LUFFY,
  "OP15-052": OP15_052_LEO,
  "OP15-053": OP15_053_REBECCA,
  "OP15-054": OP15_054_AND_NO_ONE_ELSE,
  "OP15-055": OP15_055_GO_AHEAD_AND_USE_EM,
  "OP15-056": OP15_056_WOULD_YOU_LET_ME_EAT,
  "OP15-057": OP15_057_DRESSROSA_KINGDOM,

  // Blue
  "OP15-058": OP15_058_ENEL,
  "OP15-059": OP15_059_AMAZON,
  "OP15-060": OP15_060_ENEL,
  "OP15-061": OP15_061_OHM,
  "OP15-063": OP15_063_GEDATSU,
  "OP15-064": OP15_064_KOTORI,
  "OP15-065": OP15_065_GORO,
  "OP15-066": OP15_066_SATORI,
  "OP15-067": OP15_067_SHURA,
  "OP15-068": OP15_068_HEAVENLY_WARRIORS,
  "OP15-069": OP15_069_NOLA,
  "OP15-070": OP15_070_FUZA,
  "OP15-071": OP15_071_HOLLY,
  "OP15-072": OP15_072_HOTORI,
  "OP15-073": OP15_073_YAMA,
  "OP15-074": OP15_074_VARIE,
  "OP15-075": OP15_075_EL_THOR,
  "OP15-076": OP15_076_LIGHTNING_BEAST_KITEN,
  "OP15-077": OP15_077_LIGHTNING_DRAGON,
  "OP15-078": OP15_078_MAMARAGAN,

  // Purple
  "OP15-079": OP15_079_ABSALOM,
  "OP15-080": OP15_080_OARS,
  "OP15-081": OP15_081_SANJI,
  "OP15-082": OP15_082_CHARLOTTE_LOLA,
  "OP15-083": OP15_083_SPOIL,
  "OP15-084": OP15_084_DR_HOGBACK,
  "OP15-085": OP15_085_TONY_TONY_CHOPPER,
  "OP15-086": OP15_086_NAMI,
  "OP15-087": OP15_087_NICO_ROBIN,
  "OP15-088": OP15_088_PIRATES_DOCKING_SIX,
  "OP15-090": OP15_090_PERONA,
  "OP15-091": OP15_091_MARGARITA,
  "OP15-092": OP15_092_MONKEY_D_LUFFY,
  "OP15-093": OP15_093_THE_RISKY_BROTHERS,
  "OP15-094": OP15_094_RORONOA_ZORO,
  "OP15-095": OP15_095_GUM_GUM_STORM,
  "OP15-096": OP15_096_SWALLOW_BOND_EN_AVANT,
  "OP15-097": OP15_097_I_FIND_IT_EMBARRASSING,

  // Yellow
  "OP15-098": OP15_098_MONKEY_D_LUFFY,
  "OP15-099": OP15_099_UROUGE,
  "OP15-100": OP15_100_KAMAKIRI,
  "OP15-101": OP15_101_KALGARA,
  "OP15-102": OP15_102_GAN_FALL,
  "OP15-104": OP15_104_CONIS,
  "OP15-105": OP15_105_JEWELRY_BONNEY,
  "OP15-108": OP15_108_NAMI,
  "OP15-109": OP15_109_NICO_ROBIN,
  "OP15-110": OP15_110_BRAHAM,
  "OP15-111": OP15_111_MONT_BLANC_NOLAND,
  "OP15-112": OP15_112_RAKI,
  "OP15-113": OP15_113_RORONOA_ZORO,
  "OP15-114": OP15_114_WYPER,
  "OP15-115": OP15_115_IMPACT_DIAL,
  "OP15-116": OP15_116_GUM_GUM_GOLDEN_RIFLE,
  "OP15-117": OP15_117_HESO,
  "OP15-118": OP15_118_ENEL,
  "OP15-119": OP15_119_MONKEY_D_LUFFY,
};
