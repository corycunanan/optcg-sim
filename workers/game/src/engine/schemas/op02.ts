/**
 * M4 Effect Schema — OP02 Card Encodings
 *
 * Red (Whitebeard Pirates): OP02-001 through OP02-024
 * Green (Wano/Minks): OP02-025 through OP02-048
 * Blue (Impel Down): OP02-049 through OP02-070
 * Purple (Magellan/DON!! return): OP02-071 through OP02-092
 * Black (Navy/cost reduction): OP02-093 through OP02-121
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Whitebeard Pirates (OP02-001 to OP02-024)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP02-001 Edward.Newgate (Leader) — End of Turn life-to-hand ────────────
// [End of Your Turn] Add 1 card from the top of your Life cards to your hand.

export const OP02_001_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP02-001",
  card_name: "Edward.Newgate",
  card_type: "Leader",
  effects: [
    {
      id: "end_turn_life_to_hand",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP02-002 Monkey.D.Garp (Leader) — DON_GIVEN trigger + cost reduction ──
// [Your Turn] When this Leader or any of your Characters is given a DON!! card,
// give up to 1 of your opponent's Characters with a cost of 7 or less −1 cost
// during this turn.

export const OP02_002_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP02-002",
  card_name: "Monkey.D.Garp",
  card_type: "Leader",
  effects: [
    {
      id: "don_given_cost_reduce",
      category: "auto",
      trigger: {
        event: "DON_GIVEN_TO_CARD",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP02-004 Edward.Newgate — ON_PLAY leader buff + prohibition, DON!!x2 KO
// [On Play] Up to 1 of your Leader gains +2000 power until the start of your
// next turn. Then, you cannot add Life cards to your hand using your own effects
// during this turn.
// [DON!! x2] [When Attacking] K.O. up to 1 of your opponent's Characters with
// 3000 power or less.

export const OP02_004_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP02-004",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "on_play_buff_and_prohibition",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ADD_LIFE_TO_HAND",
            scope: { controller: "SELF" },
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-005 Curly.Dadan — ON_PLAY search deck for red cost-1 Character ────
// [On Play] Look at up to 5 cards from the top of your deck; reveal up to 1 red
// Character with a cost of 1 and add it to your hand. Then, place the rest at
// the bottom of your deck in any order.

export const OP02_005_CURLY_DADAN: EffectSchema = {
  card_id: "OP02-005",
  card_name: "Curly.Dadan",
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
              card_type: "CHARACTER",
              color: "RED",
              cost_exact: 1,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP02-008 Jozu — WHILE_CONDITION compound: life + trait → Rush ──────────
// [DON!! x1] If you have 2 or less Life cards and your Leader's type includes
// "Whitebeard Pirates", this Character gains [Rush].

export const OP02_008_JOZU: EffectSchema = {
  card_id: "OP02-008",
  card_name: "Jozu",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: {
            type: "WHILE_CONDITION",
            condition: {
              all_of: [
                { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
                { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
                { type: "LEADER_PROPERTY", controller: "SELF", property: { trait_contains: "Whitebeard Pirates" } },
              ],
            },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: {
          all_of: [
            { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 1 },
            { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
            { type: "LEADER_PROPERTY", controller: "SELF", property: { trait_contains: "Whitebeard Pirates" } },
          ],
        },
      },
    },
  ],
};

// ─── OP02-009 Squard — ON_PLAY conditional debuff + life-to-hand ────────────
// [On Play] If your Leader's type includes "Whitebeard Pirates", give up to 1 of
// your opponent's Characters −4000 power during this turn and add 1 card from
// the top of your Life cards to your hand.

export const OP02_009_SQUARD: EffectSchema = {
  card_id: "OP02-009",
  card_name: "Squard",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff_and_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
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
        {
          type: "LIFE_TO_HAND",
          params: { amount: 1, position: "TOP" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP02-010 Dogura — ACTIVATE_MAIN + REST_SELF cost + PLAY_CARD ───────────
// [Activate: Main] You may rest this Character: Play up to 1 red Character other
// than [Dogura] with a cost of 1 from your hand.

export const OP02_010_DOGURA: EffectSchema = {
  card_id: "OP02-010",
  card_name: "Dogura",
  card_type: "Character",
  effects: [
    {
      id: "activate_play_cheap",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
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
              color: "RED",
              cost_exact: 1,
              exclude_name: "Dogura",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-011 Vista — ON_PLAY + KO ─────────────────────────────────────────
// [On Play] K.O. up to 1 of your opponent's Characters with 3000 power or less.

export const OP02_011_VISTA: EffectSchema = {
  card_id: "OP02-011",
  card_name: "Vista",
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
            filter: { power_max: 3000 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-012 Blenheim — Blocker ────────────────────────────────────────────
// [Blocker]

export const OP02_012_BLENHEIM: EffectSchema = {
  card_id: "OP02-012",
  card_name: "Blenheim",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP02-013 Portgas.D.Ace — ON_PLAY debuff x2 + conditional Rush ─────────
// [On Play] Give up to 2 of your opponent's Characters −3000 power during this
// turn. Then, if your Leader's type includes "Whitebeard Pirates", this Character
// gains [Rush] during this turn.

export const OP02_013_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP02-013",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_debuff_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait_contains: "Whitebeard Pirates" },
          },
        },
      ],
    },
  ],
};

// ─── OP02-014 Whitey Bay — DON!!x1 can attack active Characters ────────────
// [DON!! x1] This Character can also attack your opponent's active Characters.

export const OP02_014_WHITEY_BAY: EffectSchema = {
  card_id: "OP02-014",
  card_name: "Whitey Bay",
  card_type: "Character",
  effects: [
    {
      id: "can_attack_active",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
        },
      ],
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
    },
  ],
};

// ─── OP02-015 Makino — ACTIVATE_MAIN + REST_SELF cost + power buff ──────────
// [Activate: Main] You may rest this Character: Up to 1 of your red Characters
// with a cost of 1 gains +3000 power during this turn.

export const OP02_015_MAKINO: EffectSchema = {
  card_id: "OP02-015",
  card_name: "Makino",
  card_type: "Character",
  effects: [
    {
      id: "activate_buff_cheap",
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
            filter: { color: "RED", cost_exact: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-016 Magura — ON_PLAY + power buff to cost-1 red ──────────────────
// [On Play] Up to 1 of your red Characters with a cost of 1 gains +3000 power
// during this turn.

export const OP02_016_MAGURA: EffectSchema = {
  card_id: "OP02-016",
  card_name: "Magura",
  card_type: "Character",
  effects: [
    {
      id: "on_play_buff_cheap",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "RED", cost_exact: 1 },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP02-017 Masked Deuce — DON!!x2 WHEN_ATTACKING + KO ───────────────────
// [DON!! x2] [When Attacking] K.O. up to 1 of your opponent's Characters with
// 2000 power or less.

export const OP02_017_MASKED_DEUCE: EffectSchema = {
  card_id: "OP02-017",
  card_name: "Masked Deuce",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
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

// ─── OP02-018 Marco — Blocker + ON_KO revive from trash ────────────────────
// [Blocker]
// [On K.O.] You may trash 1 card with a type including "Whitebeard Pirates" from
// your hand: If you have 2 or less Life cards, play this Character card from
// your trash rested.

export const OP02_018_MARCO: EffectSchema = {
  card_id: "OP02-018",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_revive",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits_contains: ["Whitebeard Pirates"] },
        },
      ],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "SELF" },
          params: {
            source_zone: "TRASH",
            play_state: "RESTED",
            cost_override: "FREE",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-019 Rakuyo — DON!!x1 permanent aura + turn restriction ───────────
// [DON!! x1] [Your Turn] All of your Characters with a type including
// "Whitebeard Pirates" gain +1000 power.

export const OP02_019_RAKUYO: EffectSchema = {
  card_id: "OP02-019",
  card_name: "Rakuyo",
  card_type: "Character",
  effects: [
    {
      id: "aura_wb_buff",
      category: "permanent",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── OP02-021 Seaquake (Event) — Main conditional KO + Trigger debuff ───────
// [Main] If your Leader's type includes "Whitebeard Pirates", K.O. up to 1 of
// your opponent's Characters with 3000 power or less.
// [Trigger] Give up to 1 of your opponent's Leader or Character cards −3000
// power during this turn.

export const OP02_021_SEAQUAKE: EffectSchema = {
  card_id: "OP02-021",
  card_name: "Seaquake",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait_contains: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 3000 },
          },
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
            count: { up_to: 1 },
          },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP02-022 Whitebeard Pirates (Event) — Main search + Trigger reuse ─────
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 Character
// card with a type including "Whitebeard Pirates" and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const OP02_022_WHITEBEARD_PIRATES: EffectSchema = {
  card_id: "OP02-022",
  card_name: "Whitebeard Pirates",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_contains: ["Whitebeard Pirates"],
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
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── OP02-023 You May Be a Fool...but I Still Love You (Event) ──────────────
// [Main] If you have 3 or less Life cards, you cannot add Life cards to your
// hand using your own effects during this turn.
// [Trigger] Up to 1 of your Leader gains +1000 power during this turn.

export const OP02_023_YOU_MAY_BE_A_FOOL: EffectSchema = {
  card_id: "OP02-023",
  card_name: "You May Be a Fool...but I Still Love You",
  card_type: "Event",
  effects: [
    {
      id: "main_prohibition",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ADD_LIFE_TO_HAND",
            scope: { controller: "SELF" },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_buff",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP02-024 Moby Dick (Stage) — WHILE_CONDITION aura + Trigger play self ──
// [Your Turn] If you have 1 or less Life cards, your [Edward.Newgate] and all
// your Characters with a type including "Whitebeard Pirates" gain +2000 power.
// [Trigger] Play this card.

export const OP02_024_MOBY_DICK: EffectSchema = {
  card_id: "OP02-024",
  card_name: "Moby Dick",
  card_type: "Stage",
  effects: [
    {
      id: "conditional_wb_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: {
              any_of: [
                { name: "Edward.Newgate" },
                { traits_contains: ["Whitebeard Pirates"] },
              ],
            },
          },
          params: { amount: 2000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 1 },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 1 },
      },
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
// GREEN — Wano / Minks (OP02-025 to OP02-048)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP02-026 Sanji — Custom trigger: CHARACTER_PLAYED + condition + SET_DON_ACTIVE
// [Once Per Turn] When you play a Character with no base effect from your hand,
// if you have 3 or less Characters, set up to 2 of your DON!! cards as active.

export const OP02_026_SANJI: EffectSchema = {
  card_id: "OP02-026",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_char_played_set_don",
      category: "auto",
      trigger: {
        event: "CHARACTER_PLAYED",
        filter: {
          controller: "SELF",
          source_zone: "HAND",
          no_base_effect: true,
        },
        once_per_turn: true,
      },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER" },
        count: { operator: "<=", value: 3 },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP02-029 Carrot — END_OF_YOUR_TURN + SET_DON_ACTIVE ────────────────────
// [End of Your Turn] Set up to 1 of your DON!! cards as active.

export const OP02_029_CARROT: EffectSchema = {
  card_id: "OP02-029",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "end_turn_set_don",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP02-030 Kouzuki Oden — ACTIVATE_MAIN + DON_REST cost + SET_ACTIVE ─────
//     + ON_KO + SEARCH_AND_PLAY from deck (deferred)
// [Activate: Main] [Once Per Turn] 3: Set this Character as active.
// [On K.O.] Play up to 1 green {Land of Wano} type Character card with a cost
//   of 3 from your deck. Then, shuffle your deck.
// NOTE: The On K.O. effect is a full deck search + play, deferred as FULL_DECK_SEARCH_AND_PLAY.

export const OP02_030_ODEN: EffectSchema = {
  card_id: "OP02-030",
  card_name: "Kouzuki Oden",
  card_type: "Character",
  effects: [
    {
      id: "activate_set_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_REST", amount: 3 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
      flags: { once_per_turn: true },
    },
    // On K.O. effect deferred — see DEFERRED section at bottom of file.
    // Full deck search + play is not yet supported.
  ],
};

// ─── OP02-032 Shishilian — ON_PLAY + DON_REST cost + SET_ACTIVE ─────────────
// [On Play] 2: Set up to 1 of your {Minks} type Characters with a cost of
//   5 or less as active.

export const OP02_032_SHISHILIAN: EffectSchema = {
  card_id: "OP02-032",
  card_name: "Shishilian",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 2 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Minks"], cost_max: 5 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-034 Tony Tony.Chopper — DON!! x1 + WHEN_ATTACKING + SET_REST ──────
// [DON!! x1] [When Attacking] Rest up to 1 of your opponent's Characters with
//   a cost of 2 or less.

export const OP02_034_CHOPPER: EffectSchema = {
  card_id: "OP02-034",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_rest",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
      },
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

// ─── OP02-035 Trafalgar Law — ACTIVATE_MAIN + DON_REST cost +
//     RETURN_OWN_CHARACTER_TO_HAND cost (self) + PLAY_CARD ────────────────────
// [Activate: Main] 1 You may return this Character to the owner's hand:
//   Play up to 1 Character with a cost of 3 from your hand.

export const OP02_035_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP02-035",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "activate_bounce_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "RETURN_OWN_CHARACTER_TO_HAND" },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_exact: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-036 Nami — ON_PLAY/WHEN_ATTACKING + DON_REST cost + SEARCH_DECK ───
// [On Play]/[When Attacking] 1: Look at 3 cards from the top of your deck;
//   reveal up to 1 {FILM} type card other than [Nami] and add it to your hand.
//   Then, place the rest at the bottom of your deck in any order.

export const OP02_036_NAMI: EffectSchema = {
  card_id: "OP02-036",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "search_film",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits: ["FILM"],
              exclude_name: "Nami",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-037 Nico Robin — ON_PLAY + PLAY_CARD (FILM or Straw Hat Crew) ─────
// [On Play] Play up to 1 {FILM} or {Straw Hat Crew} type Character card with
//   a cost of 2 or less from your hand.

export const OP02_037_NICO_ROBIN: EffectSchema = {
  card_id: "OP02-037",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_char",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_any_of: ["FILM", "Straw Hat Crew"],
              cost_max: 2,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-038 Nekomamushi — BLOCKER (vanilla keyword) ────────────────────────
// [Blocker]

export const OP02_038_NEKOMAMUSHI: EffectSchema = {
  card_id: "OP02-038",
  card_name: "Nekomamushi",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP02-040 Brook — ON_PLAY + PLAY_CARD (FILM or Straw Hat Crew, cost 3) ──
// [On Play] Play up to 1 {FILM} or {Straw Hat Crew} type Character card with
//   a cost of 3 or less from your hand.

export const OP02_040_BROOK: EffectSchema = {
  card_id: "OP02-040",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_char",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_any_of: ["FILM", "Straw Hat Crew"],
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-041 Monkey.D.Luffy — BLOCKER + ON_PLAY + PLAY_CARD ────────────────
// [Blocker]
// [On Play] Play up to 1 {FILM} or {Straw Hat Crew} type Character card with
//   a cost of 4 or less from your hand.

export const OP02_041_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP02-041",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_play_char",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits_any_of: ["FILM", "Straw Hat Crew"],
              cost_max: 4,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-042 Yamato — NAME_ALIAS + ON_PLAY + SET_REST ──────────────────────
// Also treat this card's name as [Kouzuki Oden] according to the rules.
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 6 or less.

export const OP02_042_YAMATO: EffectSchema = {
  card_id: "OP02-042",
  card_name: "Yamato",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "NAME_ALIAS", aliases: ["Kouzuki Oden"] },
  ],
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
            filter: { cost_max: 6 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-044 Wanda — ON_PLAY + PLAY_CARD (Minks, not Wanda, cost 3) ────────
// [On Play] Play up to 1 {Minks} type Character card other than [Wanda] with
//   a cost of 3 or less from your hand.

export const OP02_044_WANDA: EffectSchema = {
  card_id: "OP02-044",
  card_name: "Wanda",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_mink",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits: ["Minks"],
              exclude_name: "Wanda",
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-045 Three Sword Style Oni Giri — COUNTER + MODIFY_POWER + PLAY_CARD
//     + TRIGGER + SET_REST ────────────────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +6000 power during
//   this battle. Then, play up to 1 Character card with a cost of 3 or less and
//   no base effect from your hand.
// [Trigger] Rest up to 1 of your opponent's Leader or Character cards with a
//   cost of 5 or less.

export const OP02_045_THREE_SWORD_STYLE: EffectSchema = {
  card_id: "OP02-045",
  card_name: "Three Sword Style Oni Giri",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_play",
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
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              cost_max: 3,
              no_base_effect: true,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
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
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-046 Diable Jambe Venaison Shoot — MAIN + KO rested + TRIGGER + PLAY_CARD
// [Main] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.
// [Trigger] Play up to 1 Character card with a cost of 4 or less and no base
//   effect from your hand.

export const OP02_046_DIABLE_JAMBE: EffectSchema = {
  card_id: "OP02-046",
  card_name: "Diable Jambe Venaison Shoot",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_rested",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
    {
      id: "trigger_play",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              cost_max: 4,
              no_base_effect: true,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-047 Paradise Totsuka — MAIN + SET_REST + TRIGGER + KO rested ──────
// [Main] Rest up to 1 of your opponent's Characters with a cost of 4 or less.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of
//   3 or less.

export const OP02_047_PARADISE_TOTSUKA: EffectSchema = {
  card_id: "OP02-047",
  card_name: "Paradise Totsuka",
  card_type: "Event",
  effects: [
    {
      id: "main_rest",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
            filter: { cost_max: 3, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── OP02-048 Land of Wano — ACTIVATE_MAIN + trash from hand cost +
//     REST_SELF cost + SET_DON_ACTIVE ─────────────────────────────────────────
// [Activate: Main] You may trash 1 {Land of Wano} type card from your hand and
//   rest this Stage: Set up to 1 of your DON!! cards as active.

export const OP02_048_LAND_OF_WANO: EffectSchema = {
  card_id: "OP02-048",
  card_name: "Land of Wano",
  card_type: "Stage",
  effects: [
    {
      id: "activate_set_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits: ["Land of Wano"] },
        },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-049 Emporio.Ivankov (Leader) — END_OF_YOUR_TURN + condition + DRAW ─
// [End of Your Turn] If you have 0 cards in your hand, draw 2 cards.

export const OP02_049_IVANKOV_LEADER: EffectSchema = {
  card_id: "OP02-049",
  card_name: "Emporio.Ivankov",
  card_type: "Leader",
  effects: [
    {
      id: "end_turn_draw",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "==",
        value: 0,
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP02-052 Cabaji — ON_PLAY + condition (has Mohji) + DRAW + TRASH_FROM_HAND
// [On Play] If you have [Mohji], draw 2 cards and trash 1 card from your hand.

export const OP02_052_CABAJI: EffectSchema = {
  card_id: "OP02-052",
  card_name: "Cabaji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Mohji" },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
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

// ─── OP02-056 Donquixote Doflamingo — ON_PLAY + DECK_SCRY + DON!! x1
//     WHEN_ATTACKING + optional trash cost + RETURN_TO_DECK ──────────────────
// [On Play] Look at 3 cards from the top of your deck and place them at the
//   top or bottom of the deck in any order.
// [DON!! x1] [When Attacking] You may trash 1 card from your hand: Place up
//   to 1 of your opponent's Characters with a cost of 1 or less at the bottom
//   of the owner's deck.

export const OP02_056_DOFLAMINGO: EffectSchema = {
  card_id: "OP02-056",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DECK_SCRY",
          params: { count: 3 },
        },
      ],
    },
    {
      id: "when_attacking_bounce",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
      },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP02-057 Bartholomew Kuma — ON_PLAY + SEARCH_DECK (top 2) ──────────────
// [On Play] Look at 2 cards from the top of your deck; reveal up to 1
//   {The Seven Warlords of the Sea} type card and add it to your hand. Then,
//   place the rest at the top or bottom of the deck in any order.

export const OP02_057_KUMA: EffectSchema = {
  card_id: "OP02-057",
  card_name: "Bartholomew Kuma",
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
            look_at: 2,
            pick: { up_to: 1 },
            filter: {
              traits: ["The Seven Warlords of the Sea"],
            },
            rest_destination: "TOP_OR_BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP02-058 Buggy — ON_PLAY + SEARCH_DECK (top 5) ─────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 blue
//   {Impel Down} type card other than [Buggy] and add it to your hand. Then,
//   place the rest at the bottom of your deck in any order.

export const OP02_058_BUGGY: EffectSchema = {
  card_id: "OP02-058",
  card_name: "Buggy",
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
              color: "BLUE",
              traits: ["Impel Down"],
              exclude_name: "Buggy",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP02-059 Boa Hancock — WHEN_ATTACKING + DRAW + TRASH_FROM_HAND ─────────
// [When Attacking] Draw 1 card and trash 1 card from your hand. Then, trash
//   up to 3 cards from your hand.

export const OP02_059_BOA_HANCOCK: EffectSchema = {
  card_id: "OP02-059",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_cycle",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          chain: "AND",
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 3 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP02-062 Monkey.D.Luffy — ON_PLAY/WHEN_ATTACKING + trash cost +
//     RETURN_TO_HAND + GRANT_KEYWORD (Double Attack) ─────────────────────────
// [On Play]/[When Attacking] You may trash 2 cards from your hand: Return up
//   to 1 Character with a cost of 4 or less to the owner's hand. Then, this
//   Character gains [Double Attack] during this turn.

export const OP02_062_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP02-062",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "bounce_double_attack",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-063 Mr.1(Daz.Bonez) — ON_PLAY + RETURN_TO_HAND from trash ────────
// [On Play] Add up to 1 blue Event card with a cost of 1 from your trash to
//   your hand.

export const OP02_063_MR1: EffectSchema = {
  card_id: "OP02-063",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_recover_event",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "EVENT", color: "BLUE", cost_exact: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-064 Mr.2.Bon.Kurei(Bentham) — DON!! x1 + WHEN_ATTACKING +
//     trash cost + RETURN_TO_DECK + SCHEDULE_ACTION ──────────────────────────
// [DON!! x1] [When Attacking] You may trash 1 card from your hand: Place up
//   to 1 Character with a cost of 2 or less at the bottom of the owner's deck.
//   Then, at the end of this battle, place this Character at the bottom of the
//   owner's deck.

export const OP02_064_MR2: EffectSchema = {
  card_id: "OP02-064",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce_self_sacrifice",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
      },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
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
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_BATTLE",
            action: {
              type: "RETURN_TO_DECK",
              target: { type: "SELF" },
              params: { position: "BOTTOM" },
            },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-065 Mr.3(Galdino) — BLOCKER + END_OF_YOUR_TURN + trash cost +
//     SET_ACTIVE ──────────────────────────────────────────────────────────────
// [Blocker]
// [End of Your Turn] You may trash 1 card from your hand: Set this Character
//   as active.

export const OP02_065_MR3: EffectSchema = {
  card_id: "OP02-065",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "end_turn_ready",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-066 Impel Down All Stars — MAIN + trash cost + condition + DRAW
//     + TRIGGER + DRAW ────────────────────────────────────────────────────────
// [Main] You may trash 2 cards from your hand: If your Leader has the
//   {Impel Down} type, draw up to 2 cards.
// [Trigger] Draw 2 cards.

export const OP02_066_IMPEL_DOWN_ALL_STARS: EffectSchema = {
  card_id: "OP02-066",
  card_name: "Impel Down All Stars",
  card_type: "Event",
  effects: [
    {
      id: "main_draw",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Impel Down" },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP02-067 Arabesque Brick Fist — MAIN + RETURN_TO_HAND +
//     TRIGGER + REUSE_EFFECT ──────────────────────────────────────────────────
// [Main] Return up to 1 Character with a cost of 4 or less to the owner's hand.
// [Trigger] Activate this card's [Main] effect.

export const OP02_067_ARABESQUE_BRICK_FIST: EffectSchema = {
  card_id: "OP02-067",
  card_name: "Arabesque Brick Fist",
  card_type: "Event",
  effects: [
    {
      id: "main_bounce",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
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

// ─── OP02-068 Gum-Gum Rain — COUNTER + optional trash cost + MODIFY_POWER
//     + TRIGGER + RETURN_TO_HAND ──────────────────────────────────────────────
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
//   Character cards gains +3000 power during this battle.
// [Trigger] Return up to 1 Character with a cost of 2 or less to the owner's hand.

export const OP02_068_GUM_GUM_RAIN: EffectSchema = {
  card_id: "OP02-068",
  card_name: "Gum-Gum Rain",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
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
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-069 DEATH WINK — COUNTER + MODIFY_POWER + DRAW (draw to hand size)
//     + TRIGGER + RETURN_TO_HAND ──────────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +6000 power during
//   this battle. Then, draw cards so that you have 2 cards in your hand.
// [Trigger] Return up to 1 Character with a cost of 7 or less to the owner's hand.
// NOTE: "draw cards so that you have 2 in hand" = DRAW with draw_to target.

export const OP02_069_DEATH_WINK: EffectSchema = {
  card_id: "OP02-069",
  card_name: "DEATH WINK",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_draw",
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
          type: "DRAW",
          params: {
            amount: { type: "DRAW_TO", target_count: 2 },
          },
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
            filter: { cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-070 New Kama Land — ACTIVATE_MAIN + REST_SELF cost + condition +
//     DRAW + TRASH_FROM_HAND ──────────────────────────────────────────────────
// [Activate: Main] You may rest this Stage: If your Leader is
//   [Emporio.Ivankov], draw 1 card and trash 1 card from your hand. Then,
//   trash up to 3 cards from your hand.

export const OP02_070_NEW_KAMA_LAND: EffectSchema = {
  card_id: "OP02-070",
  card_name: "New Kama Land",
  card_type: "Stage",
  effects: [
    {
      id: "activate_cycle",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Emporio.Ivankov" },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { exact: 1 },
          },
          chain: "AND",
        },
        {
          type: "TRASH_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 3 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED CARDS
// Cards that cannot be fully encoded because the engine does not yet support
// the required pattern. See docs/game-engine/DEFERRED-CARD-EFFECTS.md.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP02-025 Kin'emon ──────────────────────────────────────────────────────
// Tags: NEXT_EVENT_COST_REDUCTION
//
// [Activate: Main] [Once Per Turn] If you have 1 or less Characters, the next
// time you play a {Land of Wano} type Character card with a cost of 3 or more
// from your hand during this turn, the cost will be reduced by 1.
//
// Blocker: "The next time you play..." is a one-time cost reduction modifier
// scoped to the next qualifying play event. Requires APPLY_ONE_TIME_MODIFIER
// with a cost reduction that triggers on the next CHARACTER_PLAYED event
// matching a filter. The one-time modifier system exists in the types but
// the "next play event" trigger scoping is not wired up in the resolver.

// ─── OP02-027 Inuarashi — WHILE_CONDITION prohibition ───────────────────────
// If all of your DON!! cards are rested, this Character cannot be removed from
// the field by your opponent's effects.

export const OP02_027_INUARASHI: EffectSchema = {
  card_id: "OP02-027",
  card_name: "Inuarashi",
  card_type: "Character",
  effects: [
    {
      id: "conditional_removal_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_REMOVED_FROM_FIELD",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "ALL_DON_STATE", controller: "SELF", required_state: "RESTED" },
      },
    },
  ],
};

// ─── OP02-030 Kouzuki Oden (On K.O. effect only) ────────────────────────────
// DEFERRED: FULL_DECK_SEARCH_AND_PLAY
//
// [On K.O.] Play up to 1 green {Land of Wano} type Character card with a cost
// of 3 from your deck. Then, shuffle your deck.
//
// Blocker: Full deck search that plays to field. Needs SEARCH_AND_PLAY with
// search_full_deck: true or FULL_DECK_SEARCH with destination: "FIELD".

// ─── OP02-031 Kouzuki Toki — WHILE_CONDITION keyword grant ─────────────────
// If you have a [Kouzuki Oden] Character, this Character gains [Blocker].

export const OP02_031_KOUZUKI_TOKI: EffectSchema = {
  card_id: "OP02-031",
  card_name: "Kouzuki Toki",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Kouzuki Oden", card_type: "CHARACTER" } },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Kouzuki Oden", card_type: "CHARACTER" } },
      },
    },
  ],
};

// ─── OP02-050 Inazuma — WHILE_CONDITION power + Blocker ─────────────────────
// If you have 1 or less cards in your hand, this Character gains +2000 power.
// [Blocker]

export const OP02_050_INAZUMA: EffectSchema = {
  card_id: "OP02-050",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "conditional_power_buff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 1 },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 1 },
      },
    },
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP02-051 Emporio.Ivankov (Character) ───────────────────────────────────
// Tags: DRAW_TO, COMPLEX_COMPOSITE
//
// [On Play] Draw card(s) so that you have 3 cards in your hand and then play
// up to 1 blue {Impel Down} type Character card with a cost of 6 or less from
// your hand.
//
// NOTE: The DRAW_TO pattern (draw up to a target hand size) is used here. The
// DRAW action's amount field expects a number or DynamicValue, but DRAW_TO is
// a different semantic (draw until hand size reaches N). This card also chains
// a PLAY_CARD after the draw. Encoding below as best approximation:

export const OP02_051_IVANKOV: EffectSchema = {
  card_id: "OP02-051",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          // DRAW_TO: draw cards until hand size = 3. The resolver must
          // interpret this as "draw max(0, 3 - current_hand_size) cards."
          params: {
            amount: { type: "DRAW_TO", target_count: 3 },
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              color: "BLUE",
              traits: ["Impel Down"],
              cost_max: 6,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP02-061 Morley ─────────────────────────────────────────────────────────
// Tags: APPLY_PROHIBITION, CANNOT_ACTIVATE_BLOCKER (conditional on hand count)
//
// [When Attacking] If you have 1 or less cards in your hand, your opponent
// cannot activate the [Blocker] of any Character with a cost of 5 or less
// during this battle.

export const OP02_061_MORLEY: EffectSchema = {
  card_id: "OP02-061",
  card_name: "Morley",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_no_blocker",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { all: true },
            filter: { cost_max: 5 },
          },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP02 Purple (Impel Down) + Navy/Marine cards: OP02-071 through OP02-121
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP02-071 Magellan (Leader) ─────────────────────────────────────────────
// [Your Turn] [Once Per Turn] When a DON!! card on the field is returned to
// your DON!! deck, this Leader gains +1000 power during this turn.

export const OP02_071_MAGELLAN: EffectSchema = {
  card_id: "OP02-071",
  card_name: "Magellan",
  card_type: "Leader",
  effects: [
    {
      id: "don_return_buff",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP02-072 Zephyr (Leader) ───────────────────────────────────────────────
// [When Attacking] DON!! -4: K.O. up to 1 of your opponent's Characters with
// a cost of 3 or less. Then, this Leader gains +1000 power during this turn.

export const OP02_072_ZEPHYR: EffectSchema = {
  card_id: "OP02-072",
  card_name: "Zephyr",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_ko_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 4 }],
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

// ─── OP02-073 Little Sadi ──────────────────────────────────────────────────
// [On Play] Play up to 1 {Jailer Beast} type Character card from your hand.

export const OP02_073_LITTLE_SADI: EffectSchema = {
  card_id: "OP02-073",
  card_name: "Little Sadi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_jailer_beast",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Jailer Beast"] },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-074 Saldeath ─────────────────────────────────────────────────────
// Your [Blugori] gains [Blocker].

export const OP02_074_SALDEATH: EffectSchema = {
  card_id: "OP02-074",
  card_name: "Saldeath",
  card_type: "Character",
  effects: [
    {
      id: "blugori_blocker_aura",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: { name: "Blugori" },
          },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP02-076 Shiryu ───────────────────────────────────────────────────────
// [On Play] DON!! -1: K.O. up to 1 of your opponent's Characters with a
// cost of 1 or less.

export const OP02_076_SHIRYU: EffectSchema = {
  card_id: "OP02-076",
  card_name: "Shiryu",
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
            filter: { cost_max: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-078 Daifugo ──────────────────────────────────────────────────────
// [On Play] DON!! -2: Play up to 1 {SMILE} type Character card other than
// [Daifugo] with a cost of 3 or less from your hand.

export const OP02_078_DAIFUGO: EffectSchema = {
  card_id: "OP02-078",
  card_name: "Daifugo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_smile",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits: ["SMILE"],
              exclude_name: "Daifugo",
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP02-079 Douglas Bullet ───────────────────────────────────────────────
// [On Play] DON!! -1: Rest up to 1 of your opponent's Characters with a
// cost of 4 or less.

export const OP02_079_DOUGLAS_BULLET: EffectSchema = {
  card_id: "OP02-079",
  card_name: "Douglas Bullet",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP02-081 Domino ───────────────────────────────────────────────────────
// [Blocker]

export const OP02_081_DOMINO: EffectSchema = {
  card_id: "OP02-081",
  card_name: "Domino",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP02-082 Byrnndi World ────────────────────────────────────────────────
// [Activate: Main] DON!! -8: This Character gains +792000 power during
// this turn.

export const OP02_082_BYRNNDI_WORLD: EffectSchema = {
  card_id: "OP02-082",
  card_name: "Byrnndi World",
  card_type: "Character",
  effects: [
    {
      id: "activate_mega_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 8 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 792000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP02-083 Hannyabal ────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// purple {Impel Down} type card other than [Hannyabal] and add it to your
// hand. Then, place the rest at the bottom of your deck in any order.

export const OP02_083_HANNYABAL: EffectSchema = {
  card_id: "OP02-083",
  card_name: "Hannyabal",
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
              color: "PURPLE",
              traits: ["Impel Down"],
              exclude_name: "Hannyabal",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP02-085 Magellan ─────────────────────────────────────────────────────
// [On Play] DON!! -1: Your opponent returns 1 DON!! card from their field
// to their DON!! deck.
// [Opponent's Turn] When this Character is K.O.'d, your opponent returns 2
// DON!! cards from their field to their DON!! deck.

export const OP02_085_MAGELLAN: EffectSchema = {
  card_id: "OP02-085",
  card_name: "Magellan",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_return",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "FORCE_OPPONENT_DON_RETURN",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "on_ko_don_return",
      category: "auto",
      trigger: {
        keyword: "ON_KO",
        turn_restriction: "OPPONENT_TURN",
      },
      actions: [
        {
          type: "FORCE_OPPONENT_DON_RETURN",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP02-086 Minokoala ────────────────────────────────────────────────────
// [Blocker]
// [On K.O.] If your Leader has the {Impel Down} type, add up to 1 DON!!
// card from your DON!! deck and rest it.

export const OP02_086_MINOKOALA: EffectSchema = {
  card_id: "OP02-086",
  card_name: "Minokoala",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
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

// ─── OP02-087 Minotaur ─────────────────────────────────────────────────────
// [Double Attack]
// [On K.O.] If your Leader has the {Impel Down} type, add up to 1 DON!!
// card from your DON!! deck and rest it.

export const OP02_087_MINOTAUR: EffectSchema = {
  card_id: "OP02-087",
  card_name: "Minotaur",
  card_type: "Character",
  effects: [
    {
      id: "double_attack",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
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

// ─── OP02-089 Judgment of Hell (Event) ─────────────────────────────────────
// [Counter] DON!! -1: Give up to a total of 2 of your opponent's Leader or
// Character cards -3000 power during this turn.
// [Trigger] If your opponent has 6 or more DON!! cards on their field, your
// opponent returns 1 DON!! card from their field to their DON!! deck.

export const OP02_089_JUDGMENT_OF_HELL: EffectSchema = {
  card_id: "OP02-089",
  card_name: "Judgment of Hell",
  card_type: "Event",
  effects: [
    {
      id: "counter_debuff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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
    {
      id: "trigger_don_return",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "FORCE_OPPONENT_DON_RETURN",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP02-090 Hydra (Event) ────────────────────────────────────────────────
// [Main] DON!! -1: Give up to 1 of your opponent's Characters -3000 power
// during this turn.
// [Trigger] If your opponent has 6 or more DON!! cards on their field, your
// opponent returns 1 DON!! card from their field to their DON!! deck.

export const OP02_090_HYDRA: EffectSchema = {
  card_id: "OP02-090",
  card_name: "Hydra",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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
      id: "trigger_don_return",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "FORCE_OPPONENT_DON_RETURN",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP02-091 Venom Road (Event) ───────────────────────────────────────────
// [Main] Add up to 1 DON!! card from your DON!! deck and set it as active.
// [Trigger] If your opponent has 6 or more DON!! cards on their field, your
// opponent returns 1 DON!! card from their field to their DON!! deck.

export const OP02_091_VENOM_ROAD: EffectSchema = {
  card_id: "OP02-091",
  card_name: "Venom Road",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
    {
      id: "trigger_don_return",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      actions: [
        {
          type: "FORCE_OPPONENT_DON_RETURN",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP02-092 Impel Down (Stage) ───────────────────────────────────────────
// [Activate: Main] You may trash 1 card from your hand and rest this Stage:
// Look at 3 cards from the top of your deck; reveal up to 1 {Impel Down}
// type card and add it to your hand. Then, place the rest at the bottom of
// your deck in any order.

export const OP02_092_IMPEL_DOWN: EffectSchema = {
  card_id: "OP02-092",
  card_name: "Impel Down",
  card_type: "Stage",
  effects: [
    {
      id: "activate_search",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Impel Down"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-093 Smoker (Leader) ──────────────────────────────────────────────
// [DON!! x1] [Activate: Main] [Once Per Turn] Give up to 1 of your
// opponent's Characters -1 cost during this turn. Then, if there is a
// Character with a cost of 0, this Leader gains +1000 power during this turn.

export const OP02_093_SMOKER: EffectSchema = {
  card_id: "OP02-093",
  card_name: "Smoker",
  card_type: "Leader",
  effects: [
    {
      id: "activate_cost_reduce_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
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
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", cost_exact: 0 },
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP02-094 Isuka ────────────────────────────────────────────────────────
// [DON!! x1] [Once Per Turn] When this Character battles and K.O.'s your
// opponent's Character, set this Character as active.

export const OP02_094_ISUKA: EffectSchema = {
  card_id: "OP02-094",
  card_name: "Isuka",
  card_type: "Character",
  effects: [
    {
      id: "combat_victory_untap",
      category: "auto",
      trigger: {
        event: "COMBAT_VICTORY",
        don_requirement: 1,
        once_per_turn: true,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP02-096 Kuzan ────────────────────────────────────────────────────────
// [On Play] Draw 1 card.
// [When Attacking] Give up to 1 of your opponent's Characters -4 cost
// during this turn.

export const OP02_096_KUZAN: EffectSchema = {
  card_id: "OP02-096",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
    {
      id: "when_attacking_cost_reduce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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
    },
  ],
};

// ─── OP02-098 Koby ─────────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: K.O. up to 1 of your
// opponent's Characters with a cost of 3 or less.

export const OP02_098_KOBY: EffectSchema = {
  card_id: "OP02-098",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP02-099 Sakazuki ─────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: K.O. up to 1 of your
// opponent's Characters with a cost of 5 or less.

export const OP02_099_SAKAZUKI: EffectSchema = {
  card_id: "OP02-099",
  card_name: "Sakazuki",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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

// ─── OP02-101 Strawberry ───────────────────────────────────────────────────
// [When Attacking] If there is a Character with a cost of 0, your opponent
// cannot activate the [Blocker] of any Character with a cost of 5 or less
// during this battle.

export const OP02_101_STRAWBERRY: EffectSchema = {
  card_id: "OP02-101",
  card_name: "Strawberry",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_block_prohibition",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_exact: 0 },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { all: true },
            filter: { cost_max: 5 },
          },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP02-102 Smoker ───────────────────────────────────────────────────────
// This Character cannot be K.O.'d by effects.
// [When Attacking] If there is a Character with a cost of 0, this Character
// gains +2000 power during this battle.

export const OP02_102_SMOKER: EffectSchema = {
  card_id: "OP02-102",
  card_name: "Smoker",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "EFFECT" },
        },
      ],
    },
    {
      id: "when_attacking_conditional_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_exact: 0 },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP02-103 Sengoku ──────────────────────────────────────────────────────
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters
// -2 cost during this turn.

export const OP02_103_SENGOKU: EffectSchema = {
  card_id: "OP02-103",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_cost_reduce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP02-105 Tashigi ──────────────────────────────────────────────────────
// [DON!! x1] [When Attacking] Give up to 1 of your opponent's Characters
// -3 cost during this turn.

export const OP02_105_TASHIGI: EffectSchema = {
  card_id: "OP02-105",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_cost_reduce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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
  ],
};

// ─── OP02-106 Tsuru ────────────────────────────────────────────────────────
// [On Play] Give up to 1 of your opponent's Characters -2 cost during
// this turn.

export const OP02_106_TSURU: EffectSchema = {
  card_id: "OP02-106",
  card_name: "Tsuru",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cost_reduce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── OP02-108 Donquixote Rosinante ─────────────────────────────────────────
// [Blocker]

export const OP02_108_DONQUIXOTE_ROSINANTE: EffectSchema = {
  card_id: "OP02-108",
  card_name: "Donquixote Rosinante",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP02-110 Hina ─────────────────────────────────────────────────────────
// [Blocker]
// [On Block] Select up to 1 of your opponent's Characters with a cost of 6
// or less. The selected Character cannot attack during this turn.

export const OP02_110_HINA: EffectSchema = {
  card_id: "OP02-110",
  card_name: "Hina",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_block_lock",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
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
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP02-111 Fullbody ─────────────────────────────────────────────────────
// [When Attacking] If you have [Jango], this card gains +3000 power during
// this battle.

export const OP02_111_FULLBODY: EffectSchema = {
  card_id: "OP02-111",
  card_name: "Fullbody",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_jango_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Jango" },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP02-112 Bell-mere ────────────────────────────────────────────────────
// [Activate: Main] You may rest this Character: Give up to 1 of your
// opponent's Characters -1 cost during this turn. Then, up to 1 of your
// Leader or Character cards gains +1000 power during this turn.

export const OP02_112_BELLMERE: EffectSchema = {
  card_id: "OP02-112",
  card_name: "Bell-mere",
  card_type: "Character",
  effects: [
    {
      id: "activate_cost_reduce_buff",
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
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP02-113 Helmeppo ─────────────────────────────────────────────────────
// [When Attacking] Give up to 1 of your opponent's Characters -2 cost
// during this turn. Then, if there is a Character with a cost of 0, this
// Character gains +2000 power during this battle.
// [Trigger] Play this card.

export const OP02_113_HELMEPPO: EffectSchema = {
  card_id: "OP02-113",
  card_name: "Helmeppo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_cost_reduce_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", cost_exact: 0 },
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

// ─── OP02-114 Borsalino ────────────────────────────────────────────────────
// [Opponent's Turn] This Character gains +1000 power and cannot be K.O.'d
// by effects.
// [Blocker]

export const OP02_114_BORSALINO: EffectSchema = {
  card_id: "OP02-114",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "opp_turn_buff_and_protection",
      category: "permanent",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
        turn_restriction: "OPPONENT_TURN",
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
        },
      ],
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "EFFECT" },
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

// ─── OP02-115 Monkey.D.Garp ────────────────────────────────────────────────
// [DON!! x2] [When Attacking] K.O. up to 1 of your opponent's Characters
// with a cost of 0.

export const OP02_115_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP02-115",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko_zero_cost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
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
    },
  ],
};

// ─── OP02-117 Ice Age (Event) ──────────────────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters -5 cost during this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 3
// or less.

export const OP02_117_ICE_AGE: EffectSchema = {
  card_id: "OP02-117",
  card_name: "Ice Age",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_reduce",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -5 },
          duration: { type: "THIS_TURN" },
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
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-118 Yasakani Sacred Jewel (Event) ────────────────────────────────
// [Counter] You may trash 1 card from your hand: Select up to 1 of your
// Characters. The selected Character cannot be K.O.'d during this battle.
// [Trigger] K.O. up to 1 of your opponent's Stages with a cost of 3 or less.

export const OP02_118_YASAKANI_SACRED_JEWEL: EffectSchema = {
  card_id: "OP02-118",
  card_name: "Yasakani Sacred Jewel",
  card_type: "Event",
  effects: [
    {
      id: "counter_protection",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: {
            prohibition_type: "CANNOT_BE_KO",
            scope: { cause: "IN_BATTLE" },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_ko_stage",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "STAGE",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP02-119 Meteor Volcano (Event) ───────────────────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 1 or less.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP02_119_METEOR_VOLCANO: EffectSchema = {
  card_id: "OP02-119",
  card_name: "Meteor Volcano",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
    {
      id: "trigger_draw_trash",
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
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP02-120 Uta ──────────────────────────────────────────────────────────
// [On Play] DON!! -2: Your Leader and all of your Characters gain +1000
// power until the start of your next turn.

export const OP02_120_UTA: EffectSchema = {
  card_id: "OP02-120",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "on_play_global_buff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_YOUR_CHARACTERS", controller: "SELF" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP02-121 Kuzan (Leader) ───────────────────────────────────────────────
// [Your Turn] Give all of your opponent's Characters -5 cost.
// [On Play] K.O. up to 1 of your opponent's Characters with a cost of 0.
//
// NOTE: The [Your Turn] aura is a permanent that applies during your turn.
// The [On Play] fires when Characters enter the field under this Leader's
// control (this is a Leader ability — the KO checks after the cost aura
// reduces enemy character costs).

export const OP02_121_KUZAN: EffectSchema = {
  card_id: "OP02-121",
  card_name: "Kuzan",
  card_type: "Leader",
  effects: [
    {
      id: "your_turn_cost_aura",
      category: "permanent",
      trigger: {
        keyword: "WHEN_ATTACKING",
        turn_restriction: "YOUR_TURN",
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -5 },
        },
      ],
    },
    {
      id: "on_play_ko_zero_cost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
    },
  ],
};

// ─── OP02-095 Onigumo — WHILE_CONDITION keyword grant (board-wide) ──────────
// If there is a Character with a cost of 0, this Character gains [Banish].

export const OP02_095_ONIGUMO: EffectSchema = {
  card_id: "OP02-095",
  card_name: "Onigumo",
  card_type: "Character",
  effects: [
    {
      id: "conditional_banish",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_exact: 0 } },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "BOARD_WIDE_EXISTENCE", filter: { card_type: "CHARACTER", cost_exact: 0 } },
      },
    },
  ],
};

// ─── OP02-100 Jango — WHILE_CONDITION battle KO protection ─────────────────
// If you have [Fullbody], this Character cannot be K.O.'d in battle.

export const OP02_100_JANGO: EffectSchema = {
  card_id: "OP02-100",
  card_name: "Jango",
  card_type: "Character",
  effects: [
    {
      id: "conditional_ko_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Fullbody" } },
      },
    },
  ],
};

// ─── Card Schema Registry ───────────────────────────────────────────────────

export const OP02_SCHEMAS: Record<string, EffectSchema> = {
  "OP02-001": OP02_001_EDWARD_NEWGATE,
  "OP02-002": OP02_002_MONKEY_D_GARP,
  "OP02-004": OP02_004_EDWARD_NEWGATE,
  "OP02-005": OP02_005_CURLY_DADAN,
  "OP02-008": OP02_008_JOZU,
  "OP02-009": OP02_009_SQUARD,
  "OP02-010": OP02_010_DOGURA,
  "OP02-011": OP02_011_VISTA,
  "OP02-012": OP02_012_BLENHEIM,
  "OP02-013": OP02_013_PORTGAS_D_ACE,
  "OP02-014": OP02_014_WHITEY_BAY,
  "OP02-015": OP02_015_MAKINO,
  "OP02-016": OP02_016_MAGURA,
  "OP02-017": OP02_017_MASKED_DEUCE,
  "OP02-018": OP02_018_MARCO,
  "OP02-019": OP02_019_RAKUYO,
  "OP02-021": OP02_021_SEAQUAKE,
  "OP02-022": OP02_022_WHITEBEARD_PIRATES,
  "OP02-023": OP02_023_YOU_MAY_BE_A_FOOL,
  "OP02-024": OP02_024_MOBY_DICK,
  "OP02-026": OP02_026_SANJI,
  "OP02-027": OP02_027_INUARASHI,
  "OP02-029": OP02_029_CARROT,
  "OP02-030": OP02_030_ODEN,
  "OP02-031": OP02_031_KOUZUKI_TOKI,
  "OP02-032": OP02_032_SHISHILIAN,
  "OP02-034": OP02_034_CHOPPER,
  "OP02-035": OP02_035_TRAFALGAR_LAW,
  "OP02-036": OP02_036_NAMI,
  "OP02-037": OP02_037_NICO_ROBIN,
  "OP02-038": OP02_038_NEKOMAMUSHI,
  "OP02-040": OP02_040_BROOK,
  "OP02-041": OP02_041_MONKEY_D_LUFFY,
  "OP02-042": OP02_042_YAMATO,
  "OP02-044": OP02_044_WANDA,
  "OP02-045": OP02_045_THREE_SWORD_STYLE,
  "OP02-046": OP02_046_DIABLE_JAMBE,
  "OP02-047": OP02_047_PARADISE_TOTSUKA,
  "OP02-048": OP02_048_LAND_OF_WANO,
  "OP02-049": OP02_049_IVANKOV_LEADER,
  "OP02-050": OP02_050_INAZUMA,
  "OP02-051": OP02_051_IVANKOV,
  "OP02-052": OP02_052_CABAJI,
  "OP02-056": OP02_056_DOFLAMINGO,
  "OP02-057": OP02_057_KUMA,
  "OP02-058": OP02_058_BUGGY,
  "OP02-059": OP02_059_BOA_HANCOCK,
  "OP02-061": OP02_061_MORLEY,
  "OP02-062": OP02_062_MONKEY_D_LUFFY,
  "OP02-063": OP02_063_MR1,
  "OP02-064": OP02_064_MR2,
  "OP02-065": OP02_065_MR3,
  "OP02-066": OP02_066_IMPEL_DOWN_ALL_STARS,
  "OP02-067": OP02_067_ARABESQUE_BRICK_FIST,
  "OP02-068": OP02_068_GUM_GUM_RAIN,
  "OP02-069": OP02_069_DEATH_WINK,
  "OP02-070": OP02_070_NEW_KAMA_LAND,
  "OP02-071": OP02_071_MAGELLAN,
  "OP02-072": OP02_072_ZEPHYR,
  "OP02-073": OP02_073_LITTLE_SADI,
  "OP02-074": OP02_074_SALDEATH,
  "OP02-076": OP02_076_SHIRYU,
  "OP02-078": OP02_078_DAIFUGO,
  "OP02-079": OP02_079_DOUGLAS_BULLET,
  "OP02-081": OP02_081_DOMINO,
  "OP02-082": OP02_082_BYRNNDI_WORLD,
  "OP02-083": OP02_083_HANNYABAL,
  "OP02-085": OP02_085_MAGELLAN,
  "OP02-086": OP02_086_MINOKOALA,
  "OP02-087": OP02_087_MINOTAUR,
  "OP02-089": OP02_089_JUDGMENT_OF_HELL,
  "OP02-090": OP02_090_HYDRA,
  "OP02-091": OP02_091_VENOM_ROAD,
  "OP02-092": OP02_092_IMPEL_DOWN,
  "OP02-093": OP02_093_SMOKER,
  "OP02-094": OP02_094_ISUKA,
  "OP02-095": OP02_095_ONIGUMO,
  "OP02-096": OP02_096_KUZAN,
  "OP02-098": OP02_098_KOBY,
  "OP02-099": OP02_099_SAKAZUKI,
  "OP02-100": OP02_100_JANGO,
  "OP02-101": OP02_101_STRAWBERRY,
  "OP02-102": OP02_102_SMOKER,
  "OP02-103": OP02_103_SENGOKU,
  "OP02-105": OP02_105_TASHIGI,
  "OP02-106": OP02_106_TSURU,
  "OP02-108": OP02_108_DONQUIXOTE_ROSINANTE,
  "OP02-110": OP02_110_HINA,
  "OP02-111": OP02_111_FULLBODY,
  "OP02-112": OP02_112_BELLMERE,
  "OP02-113": OP02_113_HELMEPPO,
  "OP02-114": OP02_114_BORSALINO,
  "OP02-115": OP02_115_MONKEY_D_GARP,
  "OP02-117": OP02_117_ICE_AGE,
  "OP02-118": OP02_118_YASAKANI_SACRED_JEWEL,
  "OP02-119": OP02_119_METEOR_VOLCANO,
  "OP02-120": OP02_120_UTA,
  "OP02-121": OP02_121_KUZAN,
};
