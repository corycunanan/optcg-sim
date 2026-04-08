/**
 * M4 Effect Schema — OP04 Card Encodings
 *
 * Red (Vivi / Alabasta): OP04-001 through OP04-018
 * Green (Doflamingo / Donquixote): OP04-019 through OP04-038
 * Blue (Rebecca / Animal Kingdom): OP04-039 through OP04-057
 * Purple (Crocodile / Baroque Works / Water Seven): OP04-058 through OP04-076
 * Black (Dressrosa): OP04-077 through OP04-096
 * Yellow (Big Mom / Land of Wano): OP04-097 through OP04-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Vivi / Alabasta (OP04-001 to OP04-018)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP04-001 Nefeltari Vivi (Leader) — Cannot attack + ACTIVATE_MAIN draw + Rush
// This Leader cannot attack.
// [Activate: Main] [Once Per Turn] ②: Draw 1 card and up to 1 of your Characters
// gains [Rush] during this turn.

export const OP04_001_NEFELTARI_VIVI: EffectSchema = {
  card_id: "OP04-001",
  card_name: "Nefeltari Vivi",
  card_type: "Leader",
  effects: [
    {
      id: "cannot_attack",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
        },
      ],
    },
    {
      id: "activate_draw_rush",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_REST", amount: 2 }],
      flags: { once_per_turn: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP04-002 Igaram — ACTIVATE_MAIN rest self + leader power cost + search deck
// [Activate: Main] You may rest this Character and give your 1 active Leader
// −5000 power during this turn: Look at 5 cards from the top of your deck;
// reveal up to 1 {Alabasta} type card and add it to your hand. Then, place
// the rest at the bottom of your deck in any order.

export const OP04_002_IGARAM: EffectSchema = {
  card_id: "OP04-002",
  card_name: "Igaram",
  card_type: "Character",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "LEADER_POWER_REDUCTION", amount: 5000 },
      ],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Alabasta"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-003 Usopp — ON_KO opponent character KO by base power ────────────
// [On K.O.] K.O. up to 1 of your opponent's Characters with 5000 base power
// or less.

export const OP04_003_USOPP: EffectSchema = {
  card_id: "OP04-003",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_ko_opponent",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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

// ─── OP04-004 Karoo — ACTIVATE_MAIN rest self + give DON to Alabasta chars ──
// [Activate: Main] You may rest this Character: Give up to 1 rested DON!! card
// to each of your {Alabasta} type Characters.

export const OP04_004_KAROO: EffectSchema = {
  card_id: "OP04-004",
  card_name: "Karoo",
  card_type: "Character",
  effects: [
    {
      id: "activate_distribute_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "DISTRIBUTE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["Alabasta"] },
          },
          params: { amount_per_target: 1, don_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-005 Kung Fu Jugon — Conditional Blocker if another copy on field ──
// If you have a [Kung Fu Jugon] other than this Character, this Character
// gains [Blocker].

export const OP04_005_KUNG_FU_JUGON: EffectSchema = {
  card_id: "OP04-005",
  card_name: "Kung Fu Jugon",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Kung Fu Jugon", exclude_self: true },
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

// ─── OP04-006 Koza — WHEN_ATTACKING leader power cost + self power boost ────
// [When Attacking] You may give your 1 active Leader −5000 power during this
// turn: This Character gains +2000 power until the start of your next turn.

export const OP04_006_KOZA: EffectSchema = {
  card_id: "OP04-006",
  card_name: "Koza",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "LEADER_POWER_REDUCTION", amount: 5000 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-007 — Skipped (not in card list) ─────────────────────────────────

// ─── OP04-008 Chaka — DON!!x1 WHEN_ATTACKING leader condition + debuff + KO 0
// [DON!! x1] [When Attacking] If your Leader is [Nefeltari Vivi], give up to 1
// of your opponent's Characters −3000 power during this turn. Then, K.O. up to
// 1 of your opponent's Characters with 0 power or less.

export const OP04_008_CHAKA: EffectSchema = {
  card_id: "OP04-008",
  card_name: "Chaka",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nefeltari Vivi" },
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
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 0 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-009 Super Spot-Billed Duck Troops — WHEN_ATTACKING leader cost + bounce self
// [When Attacking] You may give your 1 active Leader −5000 power during this
// turn: Return this Character to the owner's hand at the end of this turn.

export const OP04_009_SUPER_SPOT_BILLED_DUCK_TROOPS: EffectSchema = {
  card_id: "OP04-009",
  card_name: "Super Spot-Billed Duck Troops",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce_self_eot",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "LEADER_POWER_REDUCTION", amount: 5000 }],
      actions: [
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "RETURN_TO_HAND",
              target: { type: "SELF" },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-010 Tony Tony.Chopper — ON_PLAY play Animal with 3000 power or less
// [On Play] Play up to 1 {Animal} type Character card with 3000 power or less
// from your hand.

export const OP04_010_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP04-010",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
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
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Animal"],
              power_max: 3000,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP04-011 Nami — WHEN_ATTACKING reveal top card conditional power boost ─
// [When Attacking] Reveal 1 card from the top of your deck. If the revealed
// card is a Character card with 6000 power or more, this Character gains +3000
// power during this turn. Then, place the revealed card at the bottom of your
// deck.

export const OP04_011_NAMI: EffectSchema = {
  card_id: "OP04-011",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_reveal_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed_card",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          // Checks if revealed card is a Character with 6000+ power; needs engine support for reveal-check pattern
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", power_min: 6000 },
          },
        },
        {
          type: "RETURN_TO_DECK",
          target_ref: "revealed_card",
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-012 Nefeltari Cobra — YOUR_TURN aura +1000 to Alabasta Characters ─
// [Your Turn] All of your {Alabasta} type Characters other than this Character
// gain +1000 power.

export const OP04_012_NEFELTARI_COBRA: EffectSchema = {
  card_id: "OP04-012",
  card_name: "Nefeltari Cobra",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_alabasta_aura",
      category: "permanent",
      // YOUR_TURN-scoped permanent: only active during your turn
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: {
              traits: ["Alabasta"],
              exclude_self: true,
            },
          },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: { type: "IS_MY_TURN", controller: "SELF" } },
    },
  ],
};

// ─── OP04-013 Pell — DON!!x1 WHEN_ATTACKING KO cost 4 or less ──────────────
// [DON!! x1] [When Attacking] K.O. up to 1 of your opponent's Characters with
// 4000 power or less.

export const OP04_013_PELL: EffectSchema = {
  card_id: "OP04-013",
  card_name: "Pell",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP04-014 Monkey.D.Luffy — Banish keyword ──────────────────────────────
// [Banish]

export const OP04_014_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP04-014",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
  ],
};

// ─── OP04-015 Roronoa Zoro — ON_PLAY -2000 power to opponent Character ──────
// [On Play] Give up to 1 of your opponent's Characters −2000 power during this
// turn.

export const OP04_015_RORONOA_ZORO: EffectSchema = {
  card_id: "OP04-015",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── OP04-016 Bad Manners Kick Course — Counter with trash cost + Trigger ───
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.
// [Trigger] Give up to 1 of your opponent's Leader or Character cards −3000
// power during this turn.

export const OP04_016_BAD_MANNERS_KICK_COURSE: EffectSchema = {
  card_id: "OP04-016",
  card_name: "Bad Manners Kick Course",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      flags: { optional: true },
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
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP04-017 Happiness Punch — Counter debuff + conditional extra debuff ───
// [Counter] Give up to 1 of your opponent's Leader or Character cards −2000
// power during this turn. Then, if your Leader is active, give up to 1 of your
// opponent's Leader or Character cards −1000 power during this turn.

export const OP04_017_HAPPINESS_PUNCH: EffectSchema = {
  card_id: "OP04-017",
  card_name: "Happiness Punch",
  card_type: "Event",
  effects: [
    {
      id: "counter_debuff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "LEADER", is_active: true },
          },
        },
      ],
    },
  ],
};

// ─── OP04-018 Enchanting Vertigo Dance — Main Alabasta leader + 2x debuff ───
// [Main] If your Leader has the {Alabasta} type, give up to 2 of your
// opponent's Characters −2000 power during this turn.
// [Trigger] Activate this card's [Main] effect.

export const OP04_018_ENCHANTING_VERTIGO_DANCE: EffectSchema = {
  card_id: "OP04-018",
  card_name: "Enchanting Vertigo Dance",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Alabasta" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Doflamingo / Donquixote Pirates (OP04-019 to OP04-038)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP04-019 Donquixote Doflamingo (Leader) — END_OF_YOUR_TURN set DON active
// [End of Your Turn] Set up to 2 of your DON!! cards as active.

export const OP04_019_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP04-019",
  card_name: "Donquixote Doflamingo",
  card_type: "Leader",
  effects: [
    {
      id: "eot_set_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 2 } }],
    },
  ],
};

// ─── OP04-020 Issho (Leader) — DON!!x1 YOUR_TURN cost reduction + EOT set active
// [DON!! x1] [Your Turn] Give all of your opponent's Characters −1 cost.
// [End of Your Turn] ①: Set up to 1 of your Characters with a cost of 5 or
// less as active.

export const OP04_020_ISSHO: EffectSchema = {
  card_id: "OP04-020",
  card_name: "Issho",
  card_type: "Leader",
  effects: [
    {
      id: "your_turn_cost_reduction",
      category: "permanent",
      // YOUR_TURN-scoped permanent: only active during your turn
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_OPPONENT_CHARACTERS",
          },
          params: { amount: -1 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { all_of: [{ type: "IS_MY_TURN", controller: "SELF" }, { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 }] },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { all_of: [{ type: "IS_MY_TURN", controller: "SELF" }, { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 }] },
      },
    },
    {
      id: "eot_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP04-021 Viola — ON_OPPONENT_ATTACK DON_REST cost + rest opponent DON ──
// [On Your Opponent's Attack] ②: Rest up to 1 of your opponent's DON!! cards.

export const OP04_021_VIOLA: EffectSchema = {
  card_id: "OP04-021",
  card_name: "Viola",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_rest_don",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_REST", amount: 2 }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "DON_IN_COST_AREA",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP04-022 Eric — ACTIVATE_MAIN rest self + rest opponent cost 1 or less ─
// [Activate: Main] You may rest this Character: Rest up to 1 of your opponent's
// Characters with a cost of 1 or less.

export const OP04_022_ERIC: EffectSchema = {
  card_id: "OP04-022",
  card_name: "Eric",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_opponent",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-023 — Skipped (not in card list) ─────────────────────────────────

// ─── OP04-024 Sugar — Opponent's turn reactive + ON_PLAY rest opponent ──────
// [Opponent's Turn] [Once Per Turn] When your opponent plays a Character, if
// your Leader has the {Donquixote Pirates} type, rest up to 1 of your
// opponent's Characters. Then, rest this Character.
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP04_024_SUGAR: EffectSchema = {
  card_id: "OP04-024",
  card_name: "Sugar",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_reactive_rest",
      category: "auto",
      trigger: {
        event: "CHARACTER_PLAYED",
        filter: { controller: "OPPONENT" },
        turn_restriction: "OPPONENT_TURN",
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
        {
          type: "SET_REST",
          target: { type: "SELF" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "on_play_rest_opponent",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── OP04-025 Giolla — ON_OPPONENT_ATTACK DON cost + rest opponent cost 4 ──
// [On Your Opponent's Attack] ②: Rest up to 1 of your opponent's Characters
// with a cost of 4 or less.

export const OP04_025_GIOLLA: EffectSchema = {
  card_id: "OP04-025",
  card_name: "Giolla",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_rest",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_REST", amount: 2 }],
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

// ─── OP04-026 Senor Pink — WHEN_ATTACKING DON cost + leader condition + rest + DON active
// [When Attacking] ①: If your Leader has the {Donquixote Pirates} type, rest
// up to 1 of your opponent's Characters with a cost of 4 or less. Then, set
// up to 1 of your DON!! cards as active at the end of this turn.

export const OP04_026_SENOR_PINK: EffectSchema = {
  card_id: "OP04-026",
  card_name: "Senor Pink",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest_then_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_REST", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
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

// ─── OP04-027 Daddy Masterson — DON!!x1 END_OF_YOUR_TURN set self active ───
// [DON!! x1] [End of Your Turn] Set this Character as active.

export const OP04_027_DADDY_MASTERSON: EffectSchema = {
  card_id: "OP04-027",
  card_name: "Daddy Masterson",
  card_type: "Character",
  effects: [
    {
      id: "eot_set_self_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN", don_requirement: 1 },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP04-028 Diamante — Blocker + DON!!x1 EOT conditional set self active ─
// [Blocker]
// [DON!! x1] [End of Your Turn] If you have 2 or more active DON!! cards, set
// this Character as active.

export const OP04_028_DIAMANTE: EffectSchema = {
  card_id: "OP04-028",
  card_name: "Diamante",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "eot_conditional_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN", don_requirement: 1 },
      conditions: {
        type: "ACTIVE_DON_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP04-029 Dellinger — END_OF_YOUR_TURN set 1 DON active ────────────────
// [End of Your Turn] Set up to 1 of your DON!! cards as active.

export const OP04_029_DELLINGER: EffectSchema = {
  card_id: "OP04-029",
  card_name: "Dellinger",
  card_type: "Character",
  effects: [
    {
      id: "eot_set_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 1 } }],
    },
  ],
};

// ─── OP04-030 Trebol — ON_PLAY KO rested cost 5 + ON_OPPONENT_ATTACK rest ──
// [On Play] K.O. up to 1 of your opponent's rested Characters with a cost of
// 5 or less.
// [On Your Opponent's Attack] ②: Rest up to 1 of your opponent's Characters
// with a cost of 4 or less.

export const OP04_030_TREBOL: EffectSchema = {
  card_id: "OP04-030",
  card_name: "Trebol",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5, is_rested: true },
          },
        },
      ],
    },
    {
      id: "on_opponent_attack_rest",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_REST", amount: 2 }],
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

// ─── OP04-031 Donquixote Doflamingo (Character) — ON_PLAY skip refresh ─────
// [On Play] Up to a total of 3 of your opponent's rested Leader and Character
// cards will not become active in your opponent's next Refresh Phase.

export const OP04_031_DONQUIXOTE_DOFLAMINGO_CHARACTER: EffectSchema = {
  card_id: "OP04-031",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_skip_refresh",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 3 },
            filter: { is_rested: true },
          },
          params: {
            prohibition_type: "CANNOT_REFRESH",
          },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

// ─── OP04-032 Baby 5 — END_OF_YOUR_TURN trash self + set 2 DON active ──────
// [End of Your Turn] You may trash this Character: Set up to 2 of your DON!!
// cards as active.

export const OP04_032_BABY_5: EffectSchema = {
  card_id: "OP04-032",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "eot_trash_self_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-033 Machvise — ON_PLAY leader condition + rest + scheduled DON active
// [On Play] If your Leader has the {Donquixote Pirates} type, rest up to 1 of
// your opponent's Characters with a cost of 5 or less. Then, set up to 1 of
// your DON!! cards as active at the end of this turn.

export const OP04_033_MACHVISE: EffectSchema = {
  card_id: "OP04-033",
  card_name: "Machvise",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_then_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Donquixote Pirates" },
      },
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

// ─── OP04-034 Lao.G — END_OF_YOUR_TURN conditional KO rested cost 3 or less ─
// [End of Your Turn] If you have 3 or more active DON!! cards, K.O. up to 1 of
// your opponent's rested Characters with a cost of 3 or less.

export const OP04_034_LAO_G: EffectSchema = {
  card_id: "OP04-034",
  card_name: "Lao.G",
  card_type: "Character",
  effects: [
    {
      id: "eot_conditional_ko",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "ACTIVE_DON_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 3,
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
    },
  ],
};

// ─── OP04-035 Spiderweb — Counter +4000 + set active + Trigger +2000 Leader ─
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, set up to 1 of your Characters as active.
// [Trigger] Up to 1 of your Leader gains +2000 power during this turn.

export const OP04_035_SPIDERWEB: EffectSchema = {
  card_id: "OP04-035",
  card_name: "Spiderweb",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_set_active",
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
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_leader_boost",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "YOUR_LEADER",
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP04-036 Donquixote Family — Counter search Donquixote + Trigger reuse ─
// [Counter] Look at 5 cards from the top of your deck; reveal up to 1
// {Donquixote Pirates} type card and add it to your hand. Then, place the rest
// at the bottom of your deck in any order.
// [Trigger] Activate this card's [Counter] effect.

export const OP04_036_DONQUIXOTE_FAMILY: EffectSchema = {
  card_id: "OP04-036",
  card_name: "Donquixote Family",
  card_type: "Event",
  effects: [
    {
      id: "counter_search",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
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
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "COUNTER_EVENT" } }],
    },
  ],
};

// ─── OP04-037 Flapping Thread — Counter conditional +2000 + Trigger KO rested
// [Counter] If your Leader has the {Donquixote Pirates} type, up to 1 of your
// Leader or Character cards gains +2000 power during this turn.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of
// 4 or less.

export const OP04_037_FLAPPING_THREAD: EffectSchema = {
  card_id: "OP04-037",
  card_name: "Flapping Thread",
  card_type: "Event",
  effects: [
    {
      id: "counter_conditional_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_ko_rested",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── OP04-038 The Weak Do Not Have the Right to Choose How They Die!!! ──────
// [Main]/[Counter] Rest up to 1 of your opponent's Leader or Character cards.
// Then, K.O. up to 1 of your opponent's rested Characters with a cost of 6 or
// less.
// [Trigger] Set up to 5 of your DON!! cards as active.

export const OP04_038_THE_WEAK: EffectSchema = {
  card_id: "OP04-038",
  card_name: "The Weak Do Not Have the Right to Choose How They Die!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_counter_rest_then_ko",
      category: "auto",
      trigger: {
        any_of: [{ keyword: "MAIN_EVENT" }, { keyword: "COUNTER_EVENT" }],
      },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6, is_rested: true },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_set_don_active",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 5 } }],
    },
  ],
};
// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Rebecca / Animal Kingdom Pirates (OP04-039 to OP04-057)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP04-039 Rebecca (Leader) — Cannot attack + ACTIVATE_MAIN search ───────
// This Leader cannot attack.
// [Activate: Main] [Once Per Turn] ➀: If you have 6 or less cards in your hand,
// look at 2 cards from the top of your deck; reveal up to 1 {Dressrosa} type
// card and add it to your hand. Then, trash the rest.

export const OP04_039_REBECCA: EffectSchema = {
  card_id: "OP04-039",
  card_name: "Rebecca",
  card_type: "Leader",
  effects: [
    {
      id: "cannot_attack",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
        },
      ],
    },
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_REST", amount: 1 }],
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 6,
      },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 2,
            pick: { up_to: 1 },
            filter: {
              traits: ["Dressrosa"],
            },
          },
        },
      ],
    },
  ],
};

// ─── OP04-040 Queen (Leader) — DON!!x1 WHEN_ATTACKING conditional draw/life ─
// [DON!! x1] [When Attacking] If you have a total of 4 or less cards in your
// Life area and hand, draw 1 card. If you have a Character with a cost of 8 or
// more, you may add up to 1 card from the top of your deck to the top of your
// Life cards instead of drawing 1 card.

export const OP04_040_QUEEN: EffectSchema = {
  card_id: "OP04-040",
  card_name: "Queen",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_draw_or_life",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "COMBINED_ZONE_COUNT",
        controller: "SELF",
        zones: ["LIFE", "HAND"],
        operator: "<=",
        value: 4,
      },
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
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP", face: "DOWN" },
                  conditions: {
                    type: "CARD_ON_FIELD",
                    controller: "SELF",
                    filter: { card_type: "CHARACTER", cost_min: 8 },
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

// ─── OP04-041 Apis — ON_PLAY trash cost: search deck for East Blue ──────────
// [On Play] You may trash 2 cards from your hand: Look at 5 cards from the top
// of your deck; reveal up to 1 {East Blue} type card and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP04_041_APIS: EffectSchema = {
  card_id: "OP04-041",
  card_name: "Apis",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["East Blue"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-042 Ipponmatsu — TRUNCATED (incomplete card text) ─────────────────
// Card text is incomplete/truncated — skipping encoding.

// ─── OP04-043 Ulti — DON!!x1 WHEN_ATTACKING return cost 2 or less ──────────
// [DON!! x1] [When Attacking] Return up to 1 Character with a cost of 2 or
// less to the owner's hand or the bottom of their deck.

export const OP04_043_ULTI: EffectSchema = {
  card_id: "OP04-043",
  card_name: "Ulti",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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
                    controller: "EITHER",
                    count: { up_to: 1 },
                    filter: { cost_max: 2 },
                  },
                },
              ],
              [
                {
                  type: "RETURN_TO_DECK",
                  target: {
                    type: "CHARACTER",
                    controller: "EITHER",
                    count: { up_to: 1 },
                    filter: { cost_max: 2 },
                  },
                  params: { position: "BOTTOM" },
                },
              ],
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP04-044 Kaido — ON_PLAY return two Characters to hand ─────────────────
// [On Play] Return up to 1 Character with a cost of 8 or less and up to 1
// Character with a cost of 3 or less to the owner's hand.

export const OP04_044_KAIDO: EffectSchema = {
  card_id: "OP04-044",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "on_play_dual_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            dual_targets: [
              { filter: { cost_max: 8 }, count: { up_to: 1 } },
              { filter: { cost_max: 3 }, count: { up_to: 1 } },
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP04-045 King — ON_PLAY draw 1 ────────────────────────────────────────
// [On Play] Draw 1 card.

export const OP04_045_KING: EffectSchema = {
  card_id: "OP04-045",
  card_name: "King",
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

// ─── OP04-046 Queen (Character) — ON_PLAY search for Plague Rounds / Ice Oni
// [On Play] If your Leader has the {Animal Kingdom Pirates} type, look at 7
// cards from the top of your deck; reveal a total of up to 2 [Plague Rounds] or
// [Ice Oni] cards and add them to your hand. Then, place the rest at the bottom
// of your deck in any order.

export const OP04_046_QUEEN: EffectSchema = {
  card_id: "OP04-046",
  card_name: "Queen",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 7,
            pick: { up_to: 2 },
            filter: {
              name_any: ["Plague Rounds", "Ice Oni"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP04-047 Ice Oni — YOUR_TURN end of battle bottom-deck opponent ────────
// [Your Turn] At the end of a battle in which this Character battles your
// opponent's Character with a cost of 5 or less, place the opponent's Character
// you battled with at the bottom of the owner's deck.

export const OP04_047_ICE_ONI: EffectSchema = {
  card_id: "OP04-047",
  card_name: "Ice Oni",
  card_type: "Character",
  effects: [
    {
      id: "end_of_battle_bottom_deck",
      category: "auto",
      trigger: {
        event: "END_OF_BATTLE",
        filter: {
          controller: "OPPONENT",
          battle_target_type: "CHARACTER",
          target_filter: { cost_max: 5 },
        },
        turn_restriction: "YOUR_TURN",
      },
      // Target is the opponent's battled Character; needs engine back-reference to battle target
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP04-048 Sasaki — ON_PLAY hand wheel (return all + draw same) ──────────
// [On Play] Return all cards in your hand to your deck and shuffle your deck.
// Then, draw cards equal to the number you returned to your deck.

export const OP04_048_SASAKI: EffectSchema = {
  card_id: "OP04-048",
  card_name: "Sasaki",
  card_type: "Character",
  effects: [
    {
      id: "on_play_hand_wheel",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "HAND_WHEEL",
          result_ref: "returned_count",
        },
        {
          type: "DRAW",
          params: { amount: { type: "ACTION_RESULT", ref: "returned_count" } },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-049 Jack — ON_KO draw 1 ─────────────────────────────────────────
// [On K.O.] Draw 1 card.

export const OP04_049_JACK: EffectSchema = {
  card_id: "OP04-049",
  card_name: "Jack",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw",
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

// ─── OP04-050 Hanger — ACTIVATE_MAIN trash + rest self: draw 1 ─────────────
// [Activate: Main] You may trash 1 card from your hand and rest this Character:
// Draw 1 card.

export const OP04_050_HANGER: EffectSchema = {
  card_id: "OP04-050",
  card_name: "Hanger",
  card_type: "Character",
  effects: [
    {
      id: "activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
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

// ─── OP04-051 Who's.Who — ON_PLAY search for Animal Kingdom Pirates ────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Animal
// Kingdom Pirates} type card other than [Who's.Who] and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP04_051_WHOS_WHO: EffectSchema = {
  card_id: "OP04-051",
  card_name: "Who's.Who",
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
            filter: {
              traits: ["Animal Kingdom Pirates"],
              exclude_name: "Who's.Who",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP04-052 Black Maria — ACTIVATE_MAIN ➁ + rest self: draw + Trigger ────
// [Activate: Main] ➁ You may rest this Character: Draw 1 card.
// [Trigger] Play this card.

export const OP04_052_BLACK_MARIA: EffectSchema = {
  card_id: "OP04-052",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    {
      id: "activate_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 2 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-053 Page One — DON!!x1 Once Per Turn: Event activated draw/bottom ─
// [DON!! x1] [Once Per Turn] When you activate an Event, draw 1 card. Then,
// place 1 card from your hand at the bottom of your deck.

export const OP04_053_PAGE_ONE: EffectSchema = {
  card_id: "OP04-053",
  card_name: "Page One",
  card_type: "Character",
  effects: [
    {
      id: "event_activated_draw_cycle",
      category: "auto",
      trigger: {
        event: "EVENT_ACTIVATED",
        filter: { controller: "SELF" },
        don_requirement: 1,
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 1, position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-055 Plague Rounds — MAIN compound cost: trash Ice Oni + bottom deck
// [Main] You may trash 1 [Ice Oni] from your hand and place 1 Character with a
// cost of 4 or less at the bottom of the owner's deck: Play 1 [Ice Oni] from
// your trash.
// [Trigger] Activate this card's [Main] effect.

export const OP04_055_PLAGUE_ROUNDS: EffectSchema = {
  card_id: "OP04-055",
  card_name: "Plague Rounds",
  card_type: "Event",
  effects: [
    {
      id: "main_play_from_trash",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { name: "Ice Oni" },
        },
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          amount: 1,
          filter: { cost_max: 4 },
        },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { exact: 1 },
            filter: { name: "Ice Oni" },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
    },
  ],
};

// ─── OP04-056 Gum-Gum Red Roc — MAIN bottom-deck + Trigger cost-restricted ─
// [Main] Place up to 1 Character at the bottom of the owner's deck.
// [Trigger] Place up to 1 Character with a cost of 4 or less at the bottom of
// the owner's deck.

export const OP04_056_GUM_GUM_RED_ROC: EffectSchema = {
  card_id: "OP04-056",
  card_name: "Gum-Gum Red Roc",
  card_type: "Event",
  effects: [
    {
      id: "main_bottom_deck",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "trigger_bottom_deck",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP04-057 Dragon Twister Demolition Breath — Counter +4000 + bottom-deck
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, place up to 1 Character with a cost of 1 or less at the
// bottom of the owner's deck.
// [Trigger] Return up to 1 Character with a cost of 6 or less to the owner's
// hand.

export const OP04_057_DRAGON_TWISTER_DEMOLITION_BREATH: EffectSchema = {
  card_id: "OP04-057",
  card_name: "Dragon Twister Demolition Breath",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_bottom_deck",
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
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "trigger_return_to_hand",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Baroque Works / Water Seven (OP04-058 to OP04-076)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP04-058 Crocodile (Leader) — Opponent's Turn DON returned → add DON ──
// [Opponent's Turn] [Once Per Turn] When a DON!! card on your field is returned
// to your DON!! deck by your effect, add up to 1 DON!! card from your DON!!
// deck and set it as active.

export const OP04_058_CROCODILE: EffectSchema = {
  card_id: "OP04-058",
  card_name: "Crocodile",
  card_type: "Leader",
  effects: [
    {
      id: "don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF", cause: "BY_YOUR_EFFECT" },
        turn_restriction: "OPPONENT_TURN",
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP04-059 Iceburg — On Opponent's Attack DON−1: conditional Blocker ─────
// [On Your Opponent's Attack] DON!! −1: If your Leader has the {Water Seven}
// type, this Character gains [Blocker] during this turn.

export const OP04_059_ICEBURG: EffectSchema = {
  card_id: "OP04-059",
  card_name: "Iceburg",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_blocker",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Water Seven" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP04-060 Crocodile (Character) — ON_PLAY DON−2 add life + reactive draw
// [On Play] DON!! −2: If your Leader's type includes "Baroque Works", add up to
// 1 card from the top of your deck to the top of your Life cards.
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1: Draw 1 card and trash 1
// card from your hand.

export const OP04_060_CROCODILE: EffectSchema = {
  card_id: "OP04-060",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
    },
    {
      id: "on_opponent_attack_cycle",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP04-061 Tom — ACTIVATE_MAIN trash self: conditional add DON!! rested ──
// [Activate: Main] You may trash this Character: If your Leader has the {Water
// Seven} type, add up to 1 DON!! card from your DON!! deck and rest it.

export const OP04_061_TOM: EffectSchema = {
  card_id: "OP04-061",
  card_name: "Tom",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Water Seven" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-063 Franky — On Opponent's Attack DON−1: conditional power boost ──
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1: If your Leader has the
// {Water Seven} type, up to 1 of your Leader or Character cards gains +1000
// power during this battle.

export const OP04_063_FRANKY: EffectSchema = {
  card_id: "OP04-063",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Water Seven" },
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
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP04-064 Ms. All Sunday — ON_PLAY add DON!! + conditional draw + Trigger
// [On Play] Add up to 1 DON!! card from your DON!! deck and rest it. Then, if
// you have 6 or more DON!! cards on your field, draw 1 card.
// [Trigger] DON!! −2: Play this card.

export const OP04_064_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP04-064",
  card_name: "Ms. All Sunday",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_and_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "DON_FIELD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 6,
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-065 Miss.Goldenweek(Marianne) — ON_PLAY prohibition + Trigger ────
// [On Play] If your Leader's type includes "Baroque Works", up to 1 of your
// opponent's Characters with a cost of 5 or less cannot attack until the start
// of your next turn.
// [Trigger] DON!! −1: Play this card.

export const OP04_065_MISS_GOLDENWEEK: EffectSchema = {
  card_id: "OP04-065",
  card_name: "Miss.Goldenweek(Marianne)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Baroque Works" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: {
            prohibition_type: "CANNOT_ATTACK",
          },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-066 Miss.Valentine(Mikita) — ON_PLAY search Baroque Works + Trigger
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 card with
// a type including "Baroque Works" and add it to your hand. Then, place the rest
// at the bottom of your deck in any order.
// [Trigger] DON!! −1: Play this card.

export const OP04_066_MISS_VALENTINE: EffectSchema = {
  card_id: "OP04-066",
  card_name: "Miss.Valentine(Mikita)",
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
            filter: {
              traits_contains: ["Baroque Works"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-067 Miss.MerryChristmas(Drophy) — Blocker + Trigger DON−1 play ──
// [Blocker]
// [Trigger] DON!! −1: Play this card.

export const OP04_067_MISS_MERRYCHRISTMAS: EffectSchema = {
  card_id: "OP04-067",
  card_name: "Miss.MerryChristmas(Drophy)",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-068 Yokozuna — Blocker + On Opponent's Attack DON−1 bounce ────────
// [Blocker]
// [On Your Opponent's Attack] DON!! −1: Return up to 1 of your opponent's
// Characters with a cost of 2 or less to the owner's hand.

export const OP04_068_YOKOZUNA: EffectSchema = {
  card_id: "OP04-068",
  card_name: "Yokozuna",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_opponent_attack_bounce",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP04-069 Mr.2.Bon.Kurei(Bentham) — Copy attacker power + Trigger ──────
// [On Your Opponent's Attack] DON!! −1: This Character's base power becomes the
// same as the power of your opponent's attacking Leader or Character during this
// turn.
// [Trigger] DON!! −1: Play this card.

export const OP04_069_MR_2_BON_KUREI: EffectSchema = {
  card_id: "OP04-069",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_copy_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "COPY_POWER",
          target: { type: "SELF" },
          params: {
            source: "ATTACKING_CARD",
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-070 Mr.3(Galdino) — On Opponent's Attack DON−1: debuff ───────────
// [On Your Opponent's Attack] [Once Per Turn] DON!! −1: Give up to 1 of your
// opponent's Characters −1000 power during this turn.

export const OP04_070_MR_3: EffectSchema = {
  card_id: "OP04-070",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_debuff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP04-071 Mr.4(Babe) — On Opponent's Attack DON−1: gain Blocker + power
// [On Your Opponent's Attack] DON!! −1: This Character gains [Blocker] and
// +1000 power during this battle.

export const OP04_071_MR_4: EffectSchema = {
  card_id: "OP04-071",
  card_name: "Mr.4(Babe)",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_blocker_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP04-072 Mr.5(Gem) — On Opponent's Attack DON−2 + rest self: KO ───────
// [On Your Opponent's Attack] [Once Per Turn] DON!! −2 You may rest this
// Character: K.O. up to 1 of your opponent's Characters with a cost of 4 or
// less.

export const OP04_072_MR_5: EffectSchema = {
  card_id: "OP04-072",
  card_name: "Mr.5(Gem)",
  card_type: "Character",
  effects: [
    {
      id: "on_opponent_attack_ko",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "DON_MINUS", amount: 2 },
        { type: "REST_SELF" },
      ],
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

// ─── OP04-073 Mr.13 & Ms.Friday — ACTIVATE_MAIN trash self + BW char: DON!!
// [Activate: Main] You may trash this Character and 1 of your Characters with a
// type including "Baroque Works": Add up to 1 DON!! card from your DON!! deck
// and set it as active.
// [Trigger] Play this card.

export const OP04_073_MR_13_AND_MS_FRIDAY: EffectSchema = {
  card_id: "OP04-073",
  card_name: "Mr.13 & Ms.Friday",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_SELF" },
        {
          type: "TRASH_OWN_CHARACTER",
          amount: 1,
          filter: { traits_contains: ["Baroque Works"] },
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
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-074 Colors Trap — Counter DON−1: +1000 power + rest opponent ──────
// [Counter] DON!! −1: Up to 1 of your Leader or Character cards gains +1000
// power during this battle. Then, rest up to 1 of your opponent's Characters
// with a cost of 4 or less.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP04_074_COLORS_TRAP: EffectSchema = {
  card_id: "OP04-074",
  card_name: "Colors Trap",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_rest",
      category: "auto",
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
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          chain: "THEN",
        },
      ],
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

// ─── OP04-075 Nez-Palm Cannon — Counter +6000 power + conditional DON!! ─────
// [Counter] Up to 1 of your Leader or Character cards gains +6000 power during
// this battle. Then, if you have 2 or less Life cards, add up to 1 DON!! card
// from your DON!! deck and rest it.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP04_075_NEZ_PALM_CANNON: EffectSchema = {
  card_id: "OP04-075",
  card_name: "Nez-Palm Cannon",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_don",
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
          params: { amount: 6000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
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

// ─── OP04-076 Weakness...Is an Unforgivable Sin. — Counter DON−1: +1000 ────
// [Counter] DON!! −1: Up to 1 of your Leader or Character cards gains +1000
// power during this turn.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP04_076_WEAKNESS_IS_AN_UNFORGIVABLE_SIN: EffectSchema = {
  card_id: "OP04-076",
  card_name: "Weakness...Is an Unforgivable Sin.",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "auto",
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
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Dressrosa (OP04-077 to OP04-096)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP04-077 Ideo — Blocker ────────────────────────────────────────────────
// [Blocker]

export const OP04_077_IDEO: EffectSchema = {
  card_id: "OP04-077",
  card_name: "Ideo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP04-079 Orlumbus — Activate: Main cost reduce + mill + KO own ────────
// [Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters
// −4 cost during this turn and trash 2 cards from the top of your deck. Then,
// K.O. 1 of your {Dressrosa} type Characters.

export const OP04_079_ORLUMBUS: EffectSchema = {
  card_id: "OP04-079",
  card_name: "Orlumbus",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduce_mill_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
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
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "AND",
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { traits: ["Dressrosa"] },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-080 Gyats — On Play grant CAN_ATTACK_ACTIVE to Dressrosa ────────
// [On Play] Up to 1 of your {Dressrosa} type Characters can also attack active
// Characters during this turn.

export const OP04_080_GYATS: EffectSchema = {
  card_id: "OP04-080",
  card_name: "Gyats",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_attack_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"] },
          },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP04-081 Cavendish — DON!!x1 CAN_ATTACK_ACTIVE + WHEN_ATTACKING KO ───
// [DON!! x1] This Character can also attack active Characters.
// [When Attacking] You may rest your Leader: K.O. up to 1 of your opponent's
// Characters with a cost of 1 or less. Then, trash 2 cards from the top of
// your deck.

export const OP04_081_CAVENDISH: EffectSchema = {
  card_id: "OP04-081",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "don_attack_active",
      category: "permanent",
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
        },
      ],
    },
    {
      id: "when_attacking_ko_and_mill",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
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
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-082 Kyros — Replacement KO protection + On Play conditional KO ───
// If this Character would be K.O.'d, you may rest your Leader or 1 [Corrida
// Coliseum] instead.
// [On Play] If your Leader is [Rebecca], K.O. up to 1 of your opponent's
// Characters with a cost of 1 or less. Then, trash 1 card from the top of
// your deck.

export const OP04_082_KYROS: EffectSchema = {
  card_id: "OP04-082",
  card_name: "Kyros",
  card_type: "Character",
  effects: [
    {
      id: "ko_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: { exclude_self: false },
      },
      replacement_actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "SET_REST",
                  target: { type: "YOUR_LEADER" },
                },
              ],
              [
                {
                  type: "SET_REST",
                  target: {
                    type: "STAGE",
                    controller: "SELF",
                    count: { exact: 1 },
                    filter: { name: "Corrida Coliseum" },
                  },
                },
              ],
            ],
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_play_ko_and_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Rebecca" },
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
        {
          type: "MILL",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-083 Sabo — Blocker + On Play KO protection + draw/trash ──────────
// [Blocker]
// [On Play] None of your Characters can be K.O.'d by effects until the start
// of your next turn. Then, draw 2 cards and trash 2 cards from your hand.

export const OP04_083_SABO: EffectSchema = {
  card_id: "OP04-083",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_ko_protection_and_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
          },
          params: {
            prohibition_type: "CANNOT_BE_KO",
            scope: { cause: "EFFECT" },
          },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "THEN",
        },
        {
          type: "TRASH_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 2 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP04-084 Stussy — On Play search and play CP Character ────────────────
// [On Play] Look at 3 cards from the top of your deck and play up to 1
// Character card with a type including "CP" other than [Stussy] and a cost of
// 2 or less. Then, trash the rest.

export const OP04_084_STUSSY: EffectSchema = {
  card_id: "OP04-084",
  card_name: "Stussy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_contains: ["CP"],
              exclude_name: "Stussy",
              cost_max: 2,
            },
            cost_override: "FREE",
            rest_destination: "TRASH",
          },
        },
      ],
    },
  ],
};

// ─── OP04-085 Suleiman — ON_PLAY/WHEN_ATTACKING cost reduce + mill ─────────
// [On Play]/[When Attacking] If your Leader has the {Dressrosa} type, give up
// to 1 of your opponent's Characters −2 cost during this turn. Then, trash 1
// card from the top of your deck.

export const OP04_085_SULEIMAN: EffectSchema = {
  card_id: "OP04-085",
  card_name: "Suleiman",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_attack_cost_reduce_mill",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Dressrosa" },
      },
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
        {
          type: "MILL",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-086 Chinjao — DON!!x1 combat victory draw + trash ────────────────
// [DON!! x1] When this Character battles and K.O.'s your opponent's Character,
// draw 2 cards and trash 2 cards from your hand.

export const OP04_086_CHINJAO: EffectSchema = {
  card_id: "OP04-086",
  card_name: "Chinjao",
  card_type: "Character",
  effects: [
    {
      id: "combat_victory_draw_trash",
      category: "auto",
      trigger: { event: "COMBAT_VICTORY", don_requirement: 1 },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 2 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP04-088 Hajrudin — Activate: Main rest Leader for cost reduce ────────
// [Activate: Main] You may rest your 1 Leader: Give up to 1 of your opponent's
// Characters −4 cost during this turn.

export const OP04_088_HAJRUDIN: EffectSchema = {
  card_id: "OP04-088",
  card_name: "Hajrudin",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduce",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
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

// ─── OP04-089 Bartolomeo — Blocker ──────────────────────────────────────────
// [Blocker]

export const OP04_089_BARTOLOMEO: EffectSchema = {
  card_id: "OP04-089",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP04-090 Monkey.D.Luffy — CAN_ATTACK_ACTIVE + Activate untap from trash
// This Character can also attack active Characters.
// [Activate: Main] [Once Per Turn] You may return 7 cards from your trash to
// the bottom of your deck in any order: Set this Character as active. Then,
// this Character will not become active in your next Refresh Phase.

export const OP04_090_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP04-090",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "can_attack_active",
      category: "permanent",
      flags: { keywords: ["CAN_ATTACK_ACTIVE"] },
    },
    {
      id: "activate_untap_from_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 7 },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "SELF" },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-091 Leo — On Play rest Leader for KO + mill ──────────────────────
// [On Play] You may rest your 1 Leader: If your Leader has the {Dressrosa}
// type, K.O. up to 1 of your opponent's Characters with a cost of 1 or less.
// Then, trash 2 cards from the top of your deck.

export const OP04_091_LEO: EffectSchema = {
  card_id: "OP04-091",
  card_name: "Leo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_leader_ko_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Dressrosa" },
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
        {
          type: "MILL",
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-092 Rebecca — On Play search Dressrosa, trash rest ───────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1
// {Dressrosa} type card other than [Rebecca] and add it to your hand. Then,
// trash the rest.

export const OP04_092_REBECCA: EffectSchema = {
  card_id: "OP04-092",
  card_name: "Rebecca",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_dressrosa",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["Dressrosa"],
              exclude_name: "Rebecca",
            },
          },
        },
      ],
    },
  ],
};

// ─── OP04-093 Gum-Gum King Kong Gun — Main power buff + conditional DA ─────
// [Main] Up to 1 of your {Dressrosa} type Characters gains +6000 power during
// this turn. Then, if you have 15 or more cards in your trash, that card gains
// [Double Attack] during this turn.
// [Trigger] Draw 3 cards and trash 2 cards from your hand.

export const OP04_093_GUM_GUM_KING_KONG_GUN: EffectSchema = {
  card_id: "OP04-093",
  card_name: "Gum-Gum King Kong Gun",
  card_type: "Event",
  effects: [
    {
      id: "main_power_buff_and_double_attack",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Dressrosa"] },
          },
          params: { amount: 6000 },
          duration: { type: "THIS_TURN" },
          result_ref: "boosted_card",
        },
        {
          type: "GRANT_KEYWORD",
          target_ref: "boosted_card",
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "TRASH_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 15,
          },
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
          params: { amount: 3 },
        },
        {
          type: "TRASH_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 2 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP04-094 Trueno Bastardo — Main KO with conditional upgrade ────────────
// [Main] Choose up to 1 of your opponent's Characters with a cost of 4 or less
// and K.O. it. If you have 15 or more cards in your trash, choose up to 1 of
// your opponent's Characters with a cost of 6 or less instead.
// [Trigger] You may rest your Leader: K.O. up to 1 of your opponent's
// Characters with a cost of 5 or less.

export const OP04_094_TRUENO_BASTARDO: EffectSchema = {
  card_id: "OP04-094",
  card_name: "Trueno Bastardo",
  card_type: "Event",
  effects: [
    {
      id: "main_conditional_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      // KO cost 4 or less; if trash >= 15, KO cost 6 or less instead. Conditional upgrade needs engine support.
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
    {
      id: "trigger_rest_leader_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "REST_SELF", target: { type: "YOUR_LEADER" } }],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP04-095 Barrier!! — Counter power boost + conditional extra ───────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 15 or more cards in your trash, that card
// gains an additional +2000 power during this battle.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP04_095_BARRIER: EffectSchema = {
  card_id: "OP04-095",
  card_name: "Barrier!!",
  card_type: "Event",
  effects: [
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
            type: "TRASH_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 15,
          },
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
          type: "TRASH_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP04-096 Corrida Coliseum — Stage: grant RUSH_CHARACTER to Dressrosa ──
// If your Leader has the {Dressrosa} type, your {Dressrosa} type Characters
// can attack Characters on the turn in which they are played.

export const OP04_096_CORRIDA_COLISEUM: EffectSchema = {
  card_id: "OP04-096",
  card_name: "Corrida Coliseum",
  card_type: "Stage",
  effects: [
    {
      id: "grant_rush_character_to_dressrosa",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Dressrosa" },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["Dressrosa"] },
          },
          params: { keyword: "RUSH_CHARACTER" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Big Mom / Wano (OP04-097 to OP04-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP04-097 Otama — On Play add opponent Character to Life ────────────────
// [On Play] Add up to 1 of your opponent's {Animal} or {SMILE} type Characters
// with a cost of 3 or less to the top of your opponent's Life cards face-up.

export const OP04_097_OTAMA: EffectSchema = {
  card_id: "OP04-097",
  card_name: "Otama",
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
            filter: {
              traits_any_of: ["Animal", "SMILE"],
              cost_max: 3,
            },
          },
          params: { face: "UP", position: "TOP", life_controller: "OPPONENT" },
        },
      ],
    },
  ],
};

// ─── OP04-098 Toko — On Play trash Wano for life gain ──────────────────────
// [On Play] You may trash 2 {Land of Wano} type cards from your hand: If you
// have 1 or less Life cards, add 1 card from the top of your deck to the top
// of your Life cards.

export const OP04_098_TOKO: EffectSchema = {
  card_id: "OP04-098",
  card_name: "Toko",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_for_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 2,
          filter: { traits: ["Land of Wano"] },
        },
      ],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-099 Olin — Name alias Charlotte Linlin + Trigger play self ───────
// Also treat this card's name as [Charlotte Linlin] according to the rules.
// [Trigger] If you have 1 or less Life cards, play this card.

export const OP04_099_OLIN: EffectSchema = {
  card_id: "OP04-099",
  card_name: "Olin",
  card_type: "Character",
  effects: [
    {
      id: "name_alias",
      category: "rule_modification",
      rule: {
        rule_type: "NAME_ALIAS",
        aliases: ["Charlotte Linlin"],
      },
      zone: "ANY",
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-101 Carmel — Your Turn On Play draw + Trigger play self then KO ──
// [Your Turn] [On Play] Draw 1 card.
// [Trigger] Play this card. Then, K.O. up to 1 of your opponent's Characters
// with a cost of 2 or less.

export const OP04_101_CARMEL: EffectSchema = {
  card_id: "OP04-101",
  card_name: "Carmel",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "trigger_play_self_then_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "PLAY_SELF" },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP04-102 Kin'emon — Activate: Main DON rest + Life cost → untap ───────
// [Activate: Main] [Once Per Turn] ➀ You may add 1 card from the top or bottom
// of your Life cards to your hand: Set this Character as active.

export const OP04_102_KINEMON: EffectSchema = {
  card_id: "OP04-102",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    {
      id: "activate_don_life_untap",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP04-103 Kouzuki Hiyori — On Play power boost + Trigger play self ─────
// [On Play] Up to 1 of your {Land of Wano} type Leader or Character cards
// gains +1000 power during this turn.
// [Trigger] Play this card.

export const OP04_103_KOUZUKI_HIYORI: EffectSchema = {
  card_id: "OP04-103",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "on_play_power_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"] },
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
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-104 Sanji — Blocker + Trigger trash to play self ─────────────────
// [Blocker]
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP04_104_SANJI: EffectSchema = {
  card_id: "OP04-104",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "trigger_trash_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-105 Charlotte Amande — Activate: Main trash trigger card → rest ──
// [Activate: Main] [Once Per Turn] You may trash 1 card with a [Trigger] from
// your hand: Rest up to 1 of your opponent's Characters with a cost of 2 or
// less.

export const OP04_105_CHARLOTTE_AMANDE: EffectSchema = {
  card_id: "OP04-105",
  card_name: "Charlotte Amande",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_trigger_rest",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } },
      ],
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

// ─── OP04-106 Charlotte Bavarois — DON!!x1 conditional power + Trigger ─────
// [DON!! x1] If you have less Life cards than your opponent, this Character
// gains +1000 power.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP04_106_CHARLOTTE_BAVAROIS: EffectSchema = {
  card_id: "OP04-106",
  card_name: "Charlotte Bavarois",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power_boost",
      category: "permanent",
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          all_of: [
            { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
            { type: "COMPARATIVE", metric: "LIFE_COUNT", operator: "<" },
          ],
        },
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
      id: "trigger_trash_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-108 Charlotte Moscato — DON!!x1 Banish + Trigger trash play ──────
// [DON!! x1] This Character gains [Banish].
// [Trigger] You may trash 1 card from your hand: Play this card.

export const OP04_108_CHARLOTTE_MOSCATO: EffectSchema = {
  card_id: "OP04-108",
  card_name: "Charlotte Moscato",
  card_type: "Character",
  effects: [
    {
      id: "don_banish",
      category: "permanent",
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
        },
      ],
    },
    {
      id: "trigger_trash_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-109 Tonoyasu — Activate: Main trash self for power boost ─────────
// [Activate: Main] You may trash this Character: Up to 1 of your {Land of
// Wano} type Leader or Character cards gains +3000 power during this turn.

export const OP04_109_TONOYASU: EffectSchema = {
  card_id: "OP04-109",
  card_name: "Tonoyasu",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_self_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"] },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-110 Pound — Blocker + On K.O. add opponent Character to Life ─────
// [Blocker]
// [On K.O.] Add up to 1 of your opponent's Characters with a cost of 3 or less
// to the top or bottom of your opponent's Life cards face-up.

export const OP04_110_POUND: EffectSchema = {
  card_id: "OP04-110",
  card_name: "Pound",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_add_to_life",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP", position: "TOP_OR_BOTTOM", life_controller: "OPPONENT" },
        },
      ],
    },
  ],
};

// ─── OP04-111 Hera — Activate: Main trash Homies + rest self → untap Linlin
// [Activate: Main] You may trash 1 of your {Homies} type Characters other than
// this Character and rest this Character: Set up to 1 of your [Charlotte
// Linlin] Characters as active.
// [Trigger] Play this card.

export const OP04_111_HERA: EffectSchema = {
  card_id: "OP04-111",
  card_name: "Hera",
  card_type: "Character",
  effects: [
    {
      id: "activate_trash_homie_untap_linlin",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "TRASH_OWN_CHARACTER",
          amount: 1,
          filter: {
            traits: ["Homies"],
            exclude_self: true,
          },
        },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── OP04-112 Yamato — On Play KO by combined Life count + conditional life
// [On Play] K.O. up to 1 of your opponent's Characters with a cost equal to or
// less than the total of your and your opponent's Life cards. Then, if you have
// 1 or less Life cards, add up to 1 card from the top of your deck to the top
// of your Life cards.

export const OP04_112_YAMATO: EffectSchema = {
  card_id: "OP04-112",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_and_life",
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
              cost_max: {
                type: "GAME_STATE",
                source: "COMBINED_LIFE_COUNT",
              },
            },
          },
        },
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 1,
          },
        },
      ],
    },
  ],
};

// ─── OP04-115 Gun Modoki — Main Life cost → Double Attack + Trigger power ──
// [Main] You may add 1 card from the top or bottom of your Life cards to your
// hand: Up to 1 of your {Land of Wano} type Characters gains [Double Attack]
// during this turn.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP04_115_GUN_MODOKI: EffectSchema = {
  card_id: "OP04-115",
  card_name: "Gun Modoki",
  card_type: "Event",
  effects: [
    {
      id: "main_life_for_double_attack",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"] },
          },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_power_boost",
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

// ─── OP04-116 Diable Jambe Joue Shot — Counter +6000 + conditional KO ──────
// [Counter] Up to 1 of your Leader or Character cards gains +6000 power during
// this battle. Then, if you and your opponent have a total of 4 or less Life
// cards, K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
// [Trigger] Draw 1 card.

export const OP04_116_DIABLE_JAMBE_JOUE_SHOT: EffectSchema = {
  card_id: "OP04-116",
  card_name: "Diable Jambe Joue Shot",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_and_ko",
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
          params: { amount: 6000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          chain: "THEN",
          conditions: {
            type: "COMBINED_TOTAL",
            metric: "LIFE_COUNT",
            operator: "<=",
            value: 4,
          },
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

// ─── OP04-117 Heavenly Fire — Main add to life + Trigger life swap ─────────
// [Main] Add up to 1 of your opponent's Characters with a cost of 3 or less to
// the top or bottom of your opponent's Life cards face-up.
// [Trigger] You may add 1 card from the top or bottom of your Life cards to
// your hand: Add up to 1 card from your hand to the top of your Life cards.

export const OP04_117_HEAVENLY_FIRE: EffectSchema = {
  card_id: "OP04-117",
  card_name: "Heavenly Fire",
  card_type: "Event",
  effects: [
    {
      id: "main_add_to_life",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          params: { face: "UP", position: "TOP_OR_BOTTOM", life_controller: "OPPONENT" },
        },
      ],
    },
    {
      id: "trigger_life_swap",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP04-118 Nefeltari Vivi — Aura: grant Rush to red cost 3+ Characters ──
// All of your red Characters with a cost of 3 or more other than this Character
// gain [Rush].

export const OP04_118_NEFELTARI_VIVI: EffectSchema = {
  card_id: "OP04-118",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "aura_rush_red_characters",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: {
              color: "RED",
              cost_min: 3,
              exclude_self: true,
            },
          },
          params: { keyword: "RUSH" },
        },
      ],
    },
  ],
};

// ─── OP04-119 Donquixote Rosinante — Opponent's Turn KO protection + play ──
// [Opponent's Turn] If this Character is rested, your active Characters with a
// base cost of 5 cannot be K.O.'d by effects.
// [On Play] You may rest this Character: Play up to 1 green Character card with
// a cost of 5 from your hand.

export const OP04_119_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP04-119",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_ko_protection",
      category: "permanent",
      conditions: {
        type: "SELF_STATE",
        required_state: "RESTED",
      },
      // OPPONENT_TURN-scoped permanent: only active during opponent's turn
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: {
              is_active: true,
              base_cost_exact: 5,
            },
          },
          scope: { cause: "EFFECT" },
        },
      ],
    },
    {
      id: "on_play_rest_self_play_green",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              color: "GREEN",
              cost_exact: 5,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Export Map — keyed by card ID
// ═══════════════════════════════════════════════════════════════════════════════

export const OP04_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP04-001": OP04_001_NEFELTARI_VIVI,
  "OP04-002": OP04_002_IGARAM,
  "OP04-003": OP04_003_USOPP,
  "OP04-004": OP04_004_KAROO,
  "OP04-005": OP04_005_KUNG_FU_JUGON,
  "OP04-006": OP04_006_KOZA,
  "OP04-008": OP04_008_CHAKA,
  "OP04-009": OP04_009_SUPER_SPOT_BILLED_DUCK_TROOPS,
  "OP04-010": OP04_010_TONY_TONY_CHOPPER,
  "OP04-011": OP04_011_NAMI,
  "OP04-012": OP04_012_NEFELTARI_COBRA,
  "OP04-013": OP04_013_PELL,
  "OP04-014": OP04_014_MONKEY_D_LUFFY,
  "OP04-015": OP04_015_RORONOA_ZORO,
  "OP04-016": OP04_016_BAD_MANNERS_KICK_COURSE,
  "OP04-017": OP04_017_HAPPINESS_PUNCH,
  "OP04-018": OP04_018_ENCHANTING_VERTIGO_DANCE,
  // Green
  "OP04-019": OP04_019_DONQUIXOTE_DOFLAMINGO,
  "OP04-020": OP04_020_ISSHO,
  "OP04-021": OP04_021_VIOLA,
  "OP04-022": OP04_022_ERIC,
  "OP04-024": OP04_024_SUGAR,
  "OP04-025": OP04_025_GIOLLA,
  "OP04-026": OP04_026_SENOR_PINK,
  "OP04-027": OP04_027_DADDY_MASTERSON,
  "OP04-028": OP04_028_DIAMANTE,
  "OP04-029": OP04_029_DELLINGER,
  "OP04-030": OP04_030_TREBOL,
  "OP04-031": OP04_031_DONQUIXOTE_DOFLAMINGO_CHARACTER,
  "OP04-032": OP04_032_BABY_5,
  "OP04-033": OP04_033_MACHVISE,
  "OP04-034": OP04_034_LAO_G,
  "OP04-035": OP04_035_SPIDERWEB,
  "OP04-036": OP04_036_DONQUIXOTE_FAMILY,
  "OP04-037": OP04_037_FLAPPING_THREAD,
  "OP04-038": OP04_038_THE_WEAK,
  // Blue
  "OP04-039": OP04_039_REBECCA,
  "OP04-040": OP04_040_QUEEN,
  "OP04-041": OP04_041_APIS,
  "OP04-043": OP04_043_ULTI,
  "OP04-044": OP04_044_KAIDO,
  "OP04-045": OP04_045_KING,
  "OP04-046": OP04_046_QUEEN,
  "OP04-047": OP04_047_ICE_ONI,
  "OP04-048": OP04_048_SASAKI,
  "OP04-049": OP04_049_JACK,
  "OP04-050": OP04_050_HANGER,
  "OP04-051": OP04_051_WHOS_WHO,
  "OP04-052": OP04_052_BLACK_MARIA,
  "OP04-053": OP04_053_PAGE_ONE,
  "OP04-055": OP04_055_PLAGUE_ROUNDS,
  "OP04-056": OP04_056_GUM_GUM_RED_ROC,
  "OP04-057": OP04_057_DRAGON_TWISTER_DEMOLITION_BREATH,
  // Purple
  "OP04-058": OP04_058_CROCODILE,
  "OP04-059": OP04_059_ICEBURG,
  "OP04-060": OP04_060_CROCODILE,
  "OP04-061": OP04_061_TOM,
  "OP04-063": OP04_063_FRANKY,
  "OP04-064": OP04_064_MS_ALL_SUNDAY,
  "OP04-065": OP04_065_MISS_GOLDENWEEK,
  "OP04-066": OP04_066_MISS_VALENTINE,
  "OP04-067": OP04_067_MISS_MERRYCHRISTMAS,
  "OP04-068": OP04_068_YOKOZUNA,
  "OP04-069": OP04_069_MR_2_BON_KUREI,
  "OP04-070": OP04_070_MR_3,
  "OP04-071": OP04_071_MR_4,
  "OP04-072": OP04_072_MR_5,
  "OP04-073": OP04_073_MR_13_AND_MS_FRIDAY,
  "OP04-074": OP04_074_COLORS_TRAP,
  "OP04-075": OP04_075_NEZ_PALM_CANNON,
  "OP04-076": OP04_076_WEAKNESS_IS_AN_UNFORGIVABLE_SIN,
  // Black
  "OP04-077": OP04_077_IDEO,
  "OP04-079": OP04_079_ORLUMBUS,
  "OP04-080": OP04_080_GYATS,
  "OP04-081": OP04_081_CAVENDISH,
  "OP04-082": OP04_082_KYROS,
  "OP04-083": OP04_083_SABO,
  "OP04-084": OP04_084_STUSSY,
  "OP04-085": OP04_085_SULEIMAN,
  "OP04-086": OP04_086_CHINJAO,
  "OP04-088": OP04_088_HAJRUDIN,
  "OP04-089": OP04_089_BARTOLOMEO,
  "OP04-090": OP04_090_MONKEY_D_LUFFY,
  "OP04-091": OP04_091_LEO,
  "OP04-092": OP04_092_REBECCA,
  "OP04-093": OP04_093_GUM_GUM_KING_KONG_GUN,
  "OP04-094": OP04_094_TRUENO_BASTARDO,
  "OP04-095": OP04_095_BARRIER,
  "OP04-096": OP04_096_CORRIDA_COLISEUM,
  // Yellow
  "OP04-097": OP04_097_OTAMA,
  "OP04-098": OP04_098_TOKO,
  "OP04-099": OP04_099_OLIN,
  "OP04-101": OP04_101_CARMEL,
  "OP04-102": OP04_102_KINEMON,
  "OP04-103": OP04_103_KOUZUKI_HIYORI,
  "OP04-104": OP04_104_SANJI,
  "OP04-105": OP04_105_CHARLOTTE_AMANDE,
  "OP04-106": OP04_106_CHARLOTTE_BAVAROIS,
  "OP04-108": OP04_108_CHARLOTTE_MOSCATO,
  "OP04-109": OP04_109_TONOYASU,
  "OP04-110": OP04_110_POUND,
  "OP04-111": OP04_111_HERA,
  "OP04-112": OP04_112_YAMATO,
  "OP04-115": OP04_115_GUN_MODOKI,
  "OP04-116": OP04_116_DIABLE_JAMBE_JOUE_SHOT,
  "OP04-117": OP04_117_HEAVENLY_FIRE,
  "OP04-118": OP04_118_NEFELTARI_VIVI,
  "OP04-119": OP04_119_DONQUIXOTE_ROSINANTE,
};
