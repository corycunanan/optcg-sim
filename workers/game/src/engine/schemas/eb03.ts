/**
 * EB03 Effect Schemas
 *
 * Red (Nefeltari Vivi / Uta / Mixed): EB03-001 to EB03-011
 * Green (Mink / Wano / Film): EB03-012 to EB03-020, EB03-061
 * Blue (Boa Hancock / Alabasta / Mixed): EB03-021 to EB03-029
 * Purple (Big Mom Pirates / Germa / Odyssey): EB03-031 to EB03-038
 * Black (Animal Kingdom / Dressrosa / Mixed): EB03-039 to EB03-049
 * Yellow (Sky Island / Egghead / Mixed): EB03-050 to EB03-060, EB03-062
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Nefeltari Vivi / Uta / Mixed (EB03-001 to EB03-011)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB03-001 Nefeltari Vivi (Leader) — replacement KO protection + activate debuff + rush grant
// [Once Per Turn] If your Character with a base cost of 4 or more would be K.O.'d, you may trash 1 card from your hand instead.
// [Activate: Main] You may rest this Leader: Give up to 1 of your opponent's Characters −2000 power during this turn. Then, up to 1 of your Characters without a [When Attacking] effect gains [Rush] during this turn.

export const EB03_001_NEFELTARI_VIVI: EffectSchema = {
  card_id: "EB03-001",
  card_name: "Nefeltari Vivi",
  card_type: "Leader",
  effects: [
    {
      id: "ko_replacement",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: { base_cost_min: 4 },
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
      id: "activate_debuff_rush",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
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
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { lacks_effect_type: "WHEN_ATTACKING" },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-003 Uta (Character) — ON_PLAY draw + play from hand
// [On Play] If your Leader is [Uta], draw 2 cards. Then, play up to 1 Character card with 6000 power or less and no base effect from your hand.

export const EB03_003_UTA: EffectSchema = {
  card_id: "EB03-003",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Uta" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { power_max: 6000, no_base_effect: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-004 Carina (Character) — Blocker + conditional power boost
// [Blocker]
// [Opponent's Turn] If your Leader is multicolored and you have no Characters with 6000 base power or more, this Character gains +4000 power.

export const EB03_004_CARINA: EffectSchema = {
  card_id: "EB03-004",
  card_name: "Carina",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "conditional_power_boost",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { multicolored: true },
          },
          {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { base_power_min: 6000, card_type: "CHARACTER" },
            },
          },
        ],
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 4000 },
        },
      ],
      flags: { once_per_turn: false },
      zone: "FIELD",
    },
  ],
};

// ─── EB03-005 Sugar (Character) — ON_PLAY play character from hand rested
// [On Play] If your Leader is [Sugar], play up to 1 {Donquixote Pirates} type Character card with 6000 power or less from your hand rested.

export const EB03_005_SUGAR: EffectSchema = {
  card_id: "EB03-005",
  card_name: "Sugar",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sugar" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { traits: ["Donquixote Pirates"], power_max: 6000 },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── EB03-006 Nami (Character) — ON_PLAY leader power cost draw + ACTIVATE_MAIN debuff
// [On Play] You may give your active Leader −5000 power during this turn: Draw 1 card.
// [Activate: Main] [Once Per Turn] If your Leader has the {Alabasta} type, give up to 1 of your opponent's Characters −1000 power during this turn.

export const EB03_006_NAMI: EffectSchema = {
  card_id: "EB03-006",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LEADER_POWER_REDUCTION", amount: 5000 }],
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
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
            count: { up_to: 1 },
          },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── EB03-007 Baccarat (Character) — Blocker + ON_KO play from hand
// [Blocker]
// [On K.O.] Play up to 1 Character card with 6000 power or less and no base effect from your hand.

export const EB03_007_BACCARAT: EffectSchema = {
  card_id: "EB03-007",
  card_name: "Baccarat",
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
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { power_max: 6000, no_base_effect: true },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB03-008 Hibari (Character) — ON_PLAY/WHEN_ATTACKING can attack active + ACTIVATE_MAIN debuff
// [On Play]/[When Attacking] Up to 1 of your {SWORD} type Leader or Character cards can also attack active Characters during this turn.
// [Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters −1000 power during this turn.

export const EB03_008_HIBARI: EffectSchema = {
  card_id: "EB03-008",
  card_name: "Hibari",
  card_type: "Character",
  effects: [
    {
      id: "on_play_when_attacking_can_attack_active",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "WHEN_ATTACKING" },
        ],
      },
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
      id: "activate_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
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
      flags: { once_per_turn: true },
    },
  ],
};

// ─── EB03-009 Makino (Character) — ACTIVATE_MAIN rest self + power boost
// [Activate: Main] You may rest this Character: Up to 1 of your Characters with no base effect gains +2000 power during this turn.

export const EB03_009_MAKINO: EffectSchema = {
  card_id: "EB03-009",
  card_name: "Makino",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_boost",
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
            filter: { no_base_effect: true },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-010 Monet (Character) — Blocker + ON_PLAY search deck
// [Blocker]
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 Character card with 1000 power or less or up to 1 Event card and add it to your hand. Then, place the rest at the bottom of your deck in any order.

export const EB03_010_MONET: EffectSchema = {
  card_id: "EB03-010",
  card_name: "Monet",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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
              any_of: [
                { card_type: "CHARACTER", power_max: 1000 },
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

// ─── EB03-011 But If We Ever See Each Other Again... (Event) — COUNTER power boost + TRIGGER debuff
// [Counter] If your Leader is [Nefeltari Vivi], up to 1 of your Leader or Character cards gains +4000 power during this battle.
// [Trigger] Give up to 1 of your opponent's Characters −2000 power during this turn.

export const EB03_011_BUT_IF_WE_EVER_SEE_EACH_OTHER_AGAIN: EffectSchema = {
  card_id: "EB03-011",
  card_name: "But If We Ever See Each Other Again... Will You Call Me Your Shipmate?!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nefeltari Vivi" },
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
      id: "trigger_debuff",
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
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Mink / Wano / Film (EB03-012 to EB03-020, EB03-061)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB03-012 Otama (Character) — ACTIVATE_MAIN rest self + rest opponent DON/character
// [Activate: Main] You may rest this Character: Rest up to 1 of your opponent's DON!! cards or {Animal} or {SMILE} type Characters with a cost of 3 or less.

export const EB03_012_OTAMA: EffectSchema = {
  card_id: "EB03-012",
  card_name: "Otama",
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
            filter: {
              any_of: [
                { card_type: "DON" as any },
                { traits_any_of: ["Animal", "SMILE"], cost_max: 3 },
              ],
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-013 Carrot (Character) — ACTIVATE_MAIN once per turn KO rested + play Zou
// [Activate: Main] [Once Per Turn] If this Character was played on this turn, K.O. up to 1 of your opponent's rested Characters with a cost of 5 or less. Then, play up to 1 [Zou] from your hand.

export const EB03_013_CARROT: EffectSchema = {
  card_id: "EB03-013",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: {
        type: "WAS_PLAYED_THIS_TURN",
      },
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
        {
          type: "PLAY_CARD",
          target: {
            type: "STAGE_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { name: "Zou" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── EB03-014 Kuina (Character) — ACTIVATE_MAIN rest self + give DON to leader
// [Activate: Main] You may rest this Character: Give up to 2 rested DON!! cards to your Leader.

export const EB03_014_KUINA: EffectSchema = {
  card_id: "EB03-014",
  card_name: "Kuina",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-015 Camie (Character) — ACTIVATE_MAIN rest self + give DON + rest opponent
// [Activate: Main] You may rest this Character: Give up to 1 rested DON!! card to 1 of your {Fish-Man} or {Merfolk} type Leader or Character cards. Then, rest up to 1 of your opponent's Characters with a cost of 2 or less.

export const EB03_015_CAMIE: EffectSchema = {
  card_id: "EB03-015",
  card_name: "Camie",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don_rest",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { traits_any_of: ["Fish-Man", "Merfolk"] },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-016 Kouzuki Hiyori (Character) — ON_PLAY conditional draw + ACTIVATE_MAIN trash self give DON
// [On Play] If your Leader is [Kouzuki Oden], draw 1 card.
// [Activate: Main] You may trash this Character: Give up to 1 rested DON!! card to your {Land of Wano} type Leader.

export const EB03_016_KOUZUKI_HIYORI: EffectSchema = {
  card_id: "EB03-016",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Kouzuki Oden" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "activate_trash_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "YOUR_LEADER",
            filter: { traits: ["Land of Wano"] },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-017 Jewelry Bonney (Character) — ON_PLAY set DON active + cannot be rested
// [On Play] If your Leader has the {Supernovas} type, set up to 1 of your DON!! cards as active. Then, up to 1 of your opponent's Characters with a cost of 8 or less cannot be rested until the end of your opponent's next End Phase.

export const EB03_017_JEWELRY_BONNEY: EffectSchema = {
  card_id: "EB03-017",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_active_prohibit",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 8 },
          },
          params: { prohibition_type: "CANNOT_BE_RESTED" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-018 Tashigi (Character) — Opponent's turn: cannot be KO'd by effects + Blocker; End of turn rest DON + trash to activate
// [Opponent's Turn] This Character cannot be K.O.'d by your opponent's effects and gains [Blocker].
// [End of Your Turn] You may rest 1 of your DON!! cards and trash 1 card from your hand: Set this Character as active.

export const EB03_018_TASHIGI: EffectSchema = {
  card_id: "EB03-018",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BY_OPPONENT_EFFECT" },
          conditions: {
            type: "SELF_STATE",
            required_state: "ACTIVE",
          },
        },
      ],
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BLOCKER" },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "end_of_turn_activate",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [
        { type: "REST_DON", amount: 1 },
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

// ─── EB03-019 Wanda (Character) — Blocker only
// [Blocker]

export const EB03_019_WANDA: EffectSchema = {
  card_id: "EB03-019",
  card_name: "Wanda",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── EB03-020 There You Are, Sore Loser! (Event) — COUNTER power boost + conditional extra boost; TRIGGER set active
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 2 or more {FILM} type Characters, that card gains an additional +2000 power during this battle.
// [Trigger] Set up to 1 of your Characters as active.

export const EB03_020_THERE_YOU_ARE_SORE_LOSER: EffectSchema = {
  card_id: "EB03-020",
  card_name: "There You Are, Sore Loser!",
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
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          target_ref: "boosted_card",
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", traits: ["FILM"] },
            count: { operator: ">=", value: 2 },
          },
        },
      ],
    },
    {
      id: "trigger_set_active",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
        },
      ],
    },
  ],
};

// ─── EB03-061 Uta (Character) — ACTIVATE_MAIN set DON active + rest opponent; End of turn rest DON + set FILM active
// [Activate: Main] [Once Per Turn] Set up to 1 of your DON!! cards as active. Then, rest up to 1 of your opponent's DON!! cards or Characters with a cost of 4 or less.
// [End of Your Turn] You may rest 1 of your DON!! cards: Set up to 1 of your {FILM} type Characters as active.

export const EB03_061_UTA: EffectSchema = {
  card_id: "EB03-061",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "activate_don_active_rest",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { card_type: "DON" as any },
                { cost_max: 4 },
              ],
            },
          },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
    {
      id: "end_of_turn_set_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["FILM"] },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Boa Hancock / Alabasta / Mixed (EB03-021 to EB03-029)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB03-021 Alvida (Character) — ON_PLAY trash from hand cost + return to deck
// [On Play] You may trash 1 card from your hand: Place up to 1 of your opponent's Characters with 4000 base power or less and up to 1 Character with a base cost of 3 or less at the bottom of the owner's deck.

export const EB03_021_ALVIDA: EffectSchema = {
  card_id: "EB03-021",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      id: "on_play_return_to_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 4000 },
          },
          params: { position: "BOTTOM" },
        },
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { base_cost_max: 3 },
          },
          params: { position: "BOTTOM" },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-022 Isuka (Character) — Blocker + ON_PLAY return to deck
// [Blocker]
// [On Play] Place up to 1 Character with a cost of 4 or less at the bottom of the owner's deck.

export const EB03_022_ISUKA: EffectSchema = {
  card_id: "EB03-022",
  card_name: "Isuka",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_return_to_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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

// ─── EB03-023 Kaya (Character) — ON_PLAY deck scry
// [On Play] Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.

export const EB03_023_KAYA: EffectSchema = {
  card_id: "EB03-023",
  card_name: "Kaya",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 5 },
        },
      ],
    },
  ],
};

// ─── EB03-024 Nefeltari Vivi (Character) — Blocker + ON_PLAY play character then prohibition
// [Blocker]
// [On Play] Play up to 1 {Alabasta} or {Straw Hat Crew} type Character card with a cost of 5 or less from your hand. Then, you cannot play any Character cards on your field during this turn.

export const EB03_024_NEFELTARI_VIVI: EffectSchema = {
  card_id: "EB03-024",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_play_then_prohibit",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { traits_any_of: ["Alabasta", "Straw Hat Crew"], cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: { type: "SELF", controller: "SELF" },
          params: { prohibition_type: "CANNOT_PLAY_CHARACTER" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-025 Hina (Character) — ON_PLAY trash from hand cost + return to hand
// [On Play] You may trash 1 card from your hand: Return up to 1 Character with 6000 base power to the owner's hand.

export const EB03_025_HINA: EffectSchema = {
  card_id: "EB03-025",
  card_name: "Hina",
  card_type: "Character",
  effects: [
    {
      id: "on_play_return_to_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { base_power_exact: 6000 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-026 Boa Hancock (Character) — ON_PLAY opponent discard + ACTIVATE_MAIN return own + give DON
// [On Play] If your opponent has 5 or more cards in their hand, your opponent places 1 card from their hand at the bottom of their deck.
// [Activate: Main] [Once Per Turn] You may place 1 of your Characters at the bottom of the owner's deck: Give your Leader and 1 Character up to 1 rested DON!! card each.

export const EB03_026_BOA_HANCOCK: EffectSchema = {
  card_id: "EB03-026",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_discard",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
              type: "PLACE_HAND_TO_DECK",
              params: { amount: 1, position: "BOTTOM" },
            },
          },
        },
      ],
    },
    {
      id: "activate_return_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          amount: 1,
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "DISTRIBUTE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            dual_targets: [
              { filter: { card_type: "LEADER" }, count: { exact: 1 } },
              { filter: { card_type: "CHARACTER" }, count: { exact: 1 } },
            ],
          },
          params: { amount_per_target: 1, don_state: "RESTED" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── EB03-027 Marguerite (Character) — ON_PLAY return to hand
// [On Play] Return up to 1 Character with 7000 base power to the owner's hand.

export const EB03_027_MARGUERITE: EffectSchema = {
  card_id: "EB03-027",
  card_name: "Marguerite",
  card_type: "Character",
  effects: [
    {
      id: "on_play_return",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { base_power_exact: 7000 },
          },
        },
      ],
    },
  ],
};

// ─── EB03-028 Yu (Character) — ON_PLAY trash from hand + ACTIVATE_MAIN trash self draw
// [On Play] Trash 1 card from your hand.
// [Activate: Main] You may trash this Character: If you have 4 or less cards in your hand, draw 2 cards.

export const EB03_028_YU: EffectSchema = {
  card_id: "EB03-028",
  card_name: "Yu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "activate_trash_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
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

// ─── EB03-029 Insolent Fool!! Stand Down!! (Event) — MAIN play character + COUNTER power boost
// [Main] You may rest 4 of your DON!! cards: If your Leader is [Boa Hancock], play up to 1 {Amazon Lily} or {Kuja Pirates} type Character card with a cost of 6 or less from your hand.
// [Counter] Up to 1 of your [Boa Hancock] cards gains +3000 power during this battle.

export const EB03_029_INSOLENT_FOOL_STAND_DOWN: EffectSchema = {
  card_id: "EB03-029",
  card_name: "Insolent Fool!! Stand Down!!",
  card_type: "Event",
  effects: [
    {
      id: "main_play_character",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 4 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Boa Hancock" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { traits_any_of: ["Amazon Lily", "Kuja Pirates"], cost_max: 6 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
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
            filter: { name: "Boa Hancock" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Big Mom Pirates / Germa / Odyssey (EB03-031 to EB03-038)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB03-031 Vinsmoke Reiju (Character) — ON_PLAY DON−1 activate event from trash
// [Your Turn] [On Play] DON!! −1: If your Leader is [Sanji], activate the [Main] effect of up to 1 Event card with a cost of 7 or less in your trash.

export const EB03_031_VINSMOKE_REIJU: EffectSchema = {
  card_id: "EB03-031",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "on_play_activate_event",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Sanji" },
      },
      actions: [
        {
          type: "ACTIVATE_EVENT_FROM_TRASH",
          target: {
            type: "EVENT_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "TRASH",
            filter: { cost_max: 7 },
          },
        },
      ],
    },
  ],
};

// ─── EB03-032 Charlotte Flampe (Character) — ON_PLAY power boost to Katakuri
// [Your Turn] [On Play] Up to 1 of your [Charlotte Katakuri] cards gains +2000 power during this turn.

export const EB03_032_CHARLOTTE_FLAMPE: EffectSchema = {
  card_id: "EB03-032",
  card_name: "Charlotte Flampe",
  card_type: "Character",
  effects: [
    {
      id: "on_play_power_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Katakuri" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB03-033 Charlotte Brulee (Character) — Opponent's turn DON returned trigger + add DON
// [Opponent's Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck by your effect, if your Leader has the {Big Mom Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.

export const EB03_033_CHARLOTTE_BRULEE: EffectSchema = {
  card_id: "EB03-033",
  card_name: "Charlotte Brulee",
  card_type: "Character",
  effects: [
    {
      id: "don_returned_add_don",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "OPPONENT_TURN",
        once_per_turn: true,
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Big Mom Pirates" },
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

// ─── EB03-034 Charlotte Linlin (Character) — ON_PLAY draw + place to deck + add DON; ON_KO DON−1 add to life
// [On Play] Draw 1 card and place 1 card from your hand at the top of your deck. Then, add up to 1 DON!! card from your DON!! deck and set it as active.
// [On K.O.] DON!! −1: Add up to 1 card from the top of your deck to the top of your Life cards.

export const EB03_034_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "EB03-034",
  card_name: "Charlotte Linlin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_place_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 1, position: "TOP" },
          chain: "AND",
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "on_ko_add_life",
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

// ─── EB03-035 Charlotte Pudding (Character) — Blocker + ON_PLAY conditional add DON
// [Blocker]
// [On Play] If the number of DON!! cards on your field is equal to or less than the number on your opponent's field, add up to 1 DON!! card from your DON!! deck and rest it.

export const EB03_035_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "EB03-035",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_add_don",
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
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── EB03-036 Baby 5 (Character) — ON_PLAY DON−1 KO up to 2 opponents
// [On Play] DON!! −1: K.O. up to 2 of your opponent's Characters with a base cost of 3 or less.

export const EB03_036_BABY_5: EffectSchema = {
  card_id: "EB03-036",
  card_name: "Baby 5",
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
            count: { up_to: 2 },
            filter: { base_cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── EB03-037 Lim (Character) — ON_PLAY all ODYSSEY gain power
// [On Play] If you have 7 or more DON!! cards on your field, all of your {ODYSSEY} type Leader and Character cards gain +1000 power until the end of your opponent's next End Phase.

export const EB03_037_LIM: EffectSchema = {
  card_id: "EB03-037",
  card_name: "Lim",
  card_type: "Character",
  effects: [
    {
      id: "on_play_power_boost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["ODYSSEY"] },
          },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

// ─── EB03-038 Thanks for the Treat. ♡ (Event) — MAIN rest DON cost + add DON; COUNTER leader power
// [Main] You may rest 1 of your DON!! cards: If the number of DON!! cards on your field is equal to or less than the number on your opponent's field and you only have Characters with a type including "GERMA", add up to 2 DON!! cards from your DON!! deck and rest them.
// [Counter] Your Leader gains +3000 power during this battle.

export const EB03_038_THANKS_FOR_THE_TREAT: EffectSchema = {
  card_id: "EB03-038",
  card_name: "Thanks for the Treat. \u2665",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      conditions: {
        all_of: [
          {
            type: "COMPARATIVE",
            metric: "DON_FIELD_COUNT",
            operator: "<=",
          },
          {
            type: "FIELD_PURITY",
            controller: "SELF",
            filter: { card_type: "CHARACTER", traits_contains: ["GERMA"] },
          },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 2, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
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
// BLACK — Animal Kingdom / Dressrosa / Mixed (EB03-039 to EB03-049)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB03-039 Ulti (Character) — ON_PLAY draw + trash + play from trash
// [On Play] If your Leader has the {Animal Kingdom Pirates} type, draw 1 card and trash 1 card from your hand. Then, play up to 1 Character card with 6000 power or less and no base effect from your trash.

export const EB03_039_ULTI: EffectSchema = {
  card_id: "EB03-039",
  card_name: "Ulti",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
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
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "TRASH",
            filter: { power_max: 6000, no_base_effect: true },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-041 Kujyaku (Character) — permanent SWORD power boost + ON_PLAY trash Navy draw
// [Opponent's Turn] All of your {SWORD} type Characters with a cost of 6 or less gain +2000 power.
// [On Play] You may trash 1 {Navy} type card from your hand: Draw 2 cards.

export const EB03_041_KUJYAKU: EffectSchema = {
  card_id: "EB03-041",
  card_name: "Kujyaku",
  card_type: "Character",
  effects: [
    {
      id: "permanent_sword_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["SWORD"], cost_max: 6 },
          },
          params: { amount: 2000 },
        },
      ],
      zone: "FIELD",
    },
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Navy"] } }],
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

// ─── EB03-042 Koala (Character) — cost boost permanent + ON_KO play from hand/trash
// If your Leader has the {Revolutionary Army} type, this Character gains +4 cost.
// [Opponent's Turn] [On K.O.] Play up to 1 {Revolutionary Army} type Character card with a cost of 6 or less other than [Koala] or up to 1 [Nico Robin] with a cost of 6 or less from your hand or trash.

export const EB03_042_KOALA: EffectSchema = {
  card_id: "EB03-042",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "cost_boost",
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
      id: "on_ko_play",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: ["HAND", "TRASH"],
            filter: {
              any_of: [
                { traits: ["Revolutionary Army"], cost_max: 6, exclude_name: "Koala" },
                { name: "Nico Robin", cost_max: 6 },
              ],
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── EB03-043 Stussy (Character) — Blocker + ON_PLAY place from trash cost + KO
// [Blocker]
// [On Play] You may place 2 cards with a type including "CP" from your trash at the bottom of your deck in any order: K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const EB03_043_STUSSY: EffectSchema = {
  card_id: "EB03-043",
  card_name: "Stussy",
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
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          filter: { traits_contains: ["CP"] },
          position: "BOTTOM",
        },
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
      flags: { optional: true },
    },
  ],
};

// ─── EB03-044 Black Maria (Character) — conditional Blocker + ON_PLAY search + play Onigashima
// If your Leader is multicolored, this Character gains [Blocker].
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 [Onigashima Island] and add it to your hand. Then, place the rest at the bottom of your deck in any order and play up to 1 [Onigashima Island] from your hand.

export const EB03_044_BLACK_MARIA: EffectSchema = {
  card_id: "EB03-044",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
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
      id: "on_play_search_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { name: "Onigashima Island" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "STAGE_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { name: "Onigashima Island" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-045 Perona (Character) — Blocker + ON_PLAY give DON + conditional play from trash
// [Blocker]
// [On Play] Give up to 1 rested DON!! card to your Leader or 1 of your Characters. Then, if you have 10 or more cards in your trash, play up to 1 {Thriller Bark Pirates} type Character card with a cost of 2 or less from your trash rested.

export const EB03_045_PERONA: EffectSchema = {
  card_id: "EB03-045",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_give_don_play",
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
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "TRASH",
            filter: { traits: ["Thriller Bark Pirates"], cost_max: 2 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
          chain: "THEN",
          conditions: {
            type: "TRASH_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 10,
          },
        },
      ],
    },
  ],
};

// ─── EB03-046 Miss Doublefinger(Zala) (Character) — ON_PLAY conditional draw + ON_KO mill
// [On Play] If there is a Character with a cost of 0 or with a cost of 8 or more, draw 1 card.
// [On K.O.] Trash 2 cards from the top of your deck.

export const EB03_046_MISS_DOUBLEFINGER: EffectSchema = {
  card_id: "EB03-046",
  card_name: "Miss Doublefinger(Zala)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: {
          card_type: "CHARACTER",
          any_of: [
            { cost_exact: 0 },
            { cost_min: 8 },
          ],
        },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "on_ko_mill",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── EB03-047 Miss.Valentine(Mikita) (Character) — ON_PLAY mill + ON_KO draw
// [On Play] Trash 3 cards from the top of your deck.
// [On K.O.] Draw 1 card.

export const EB03_047_MISS_VALENTINE: EffectSchema = {
  card_id: "EB03-047",
  card_name: "Miss.Valentine(Mikita)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_mill",
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

// ─── EB03-048 Rebecca (Character) — Blocker + ON_PLAY search + play stage
// [Blocker]
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Dressrosa} type Stage card and add it to your hand. Then, place the rest at the bottom of your deck in any order and play up to 1 {Dressrosa} type Stage card with a cost of 1 from your hand.

export const EB03_048_REBECCA: EffectSchema = {
  card_id: "EB03-048",
  card_name: "Rebecca",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_search_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Dressrosa"], card_type: "STAGE" },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "STAGE_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { traits: ["Dressrosa"], cost_exact: 1 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-049 I Knew You People Were Behind This. (Event) — MAIN rest DON play characters; COUNTER leader power
// [Main] You may rest 7 of your DON!! cards: If your Leader is [Perona], play up to 1 {Thriller Bark Pirates} type Character card with a cost of 6 or less and up to 1 {Thriller Bark Pirates} type Character card with a cost of 4 or less from your hand or trash.
// [Counter] Your Leader gains +3000 power during this battle.

export const EB03_049_I_KNEW_YOU_PEOPLE_WERE_BEHIND_THIS: EffectSchema = {
  card_id: "EB03-049",
  card_name: "I Knew You People Were Behind This.",
  card_type: "Event",
  effects: [
    {
      id: "main_play_characters",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 7 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Perona" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            dual_targets: [
              { filter: { traits: ["Thriller Bark Pirates"], cost_max: 6 }, count: { up_to: 1 } },
              { filter: { traits: ["Thriller Bark Pirates"], cost_max: 4 }, count: { up_to: 1 } },
            ],
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
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
// YELLOW — Sky Island / Egghead / Mixed (EB03-050 to EB03-060, EB03-062)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EB03-050 Conis (Character) — ON_PLAY grant Double Attack
// [On Play] Up to 1 of your {Sky Island} type Characters gains [Double Attack] during this turn.

export const EB03_050_CONIS: EffectSchema = {
  card_id: "EB03-050",
  card_name: "Conis",
  card_type: "Character",
  effects: [
    {
      id: "on_play_double_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Sky Island"] },
          },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB03-051 Charlotte Smoothie (Character) — ON_PLAY KO + turn life face-down
// [On Play] If you have a face-up Life card, K.O. up to 1 of your opponent's Characters with a cost of 2 or less. Then, turn all of your Life cards face-down.

export const EB03_051_CHARLOTTE_SMOOTHIE: EffectSchema = {
  card_id: "EB03-051",
  card_name: "Charlotte Smoothie",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_facedown",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "FACE_UP_LIFE",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
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
        {
          type: "TURN_ALL_LIFE_FACE_DOWN",
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── EB03-052 Shirahoshi (Character) — ACTIVATE_MAIN trash self + add life + power boost
// [Activate: Main] You may trash this Character: If your Leader is [Shirahoshi], add 1 card from the top of your deck to the top of your Life cards. Then, all of your {Neptunian} type Characters gain +1000 power during this turn.

export const EB03_052_SHIRAHOSHI: EffectSchema = {
  card_id: "EB03-052",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "activate_add_life_power",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Shirahoshi" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["Neptunian"] },
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

// ─── EB03-053 Nami (Character) — ON_PLAY give DON + steal life; ON_KO face-up life + play
// [On Play] Give up to 1 rested DON!! card to your Leader. Then, if your opponent has 3 or more Life cards, add up to 1 card from the top of your opponent's Life cards to the owner's hand.
// [On K.O.] You may turn 1 card from the top of your Life cards face-up: Play up to 1 Character card with 6000 power or less from your hand.

export const EB03_053_NAMI: EffectSchema = {
  card_id: "EB03-053",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "on_play_give_don_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, don_state: "RESTED" },
        },
        {
          type: "LIFE_TO_HAND",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
          conditions: {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 3,
          },
        },
      ],
    },
    {
      id: "on_ko_play",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "TURN_LIFE_FACE_UP", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { power_max: 6000 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-054 Nico Robin (Character) — ON_PLAY trash life + add to life; TRIGGER play self
// [On Play] You may trash 1 card from the top of your Life cards: Add up to 1 card from the top of your deck to the top of your Life cards.
// [Trigger] You may trash 1 card from your hand: Play this card.

export const EB03_054_NICO_ROBIN: EffectSchema = {
  card_id: "EB03-054",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_life_add",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_LIFE", amount: 1 }],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-055 Nico Robin (Character) — ON_PLAY trash life + add to life; ON_KO deal damage
// [On Play] You may trash 1 card from the top of your Life cards: If your Leader has the {Straw Hat Crew} type, add up to 2 cards from the top of your deck to the top of your Life cards.
// [Opponent's Turn] [On K.O.] You may deal 1 damage to your opponent.

export const EB03_055_NICO_ROBIN: EffectSchema = {
  card_id: "EB03-055",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_life_add",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_LIFE", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Straw Hat Crew" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 2, position: "TOP" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "on_ko_deal_damage",
      category: "auto",
      trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
      actions: [
        {
          type: "DEAL_DAMAGE",
          target: { type: "PLAYER", controller: "OPPONENT" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-056 Belo Betty (Character) — ON_PLAY face-up life cost + KO
// [On Play] You may turn 1 card from the top of your Life cards face-up: K.O. up to 1 of your opponent's Characters with a base cost of 3 or less.

export const EB03_056_BELO_BETTY: EffectSchema = {
  card_id: "EB03-056",
  card_name: "Belo Betty",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TURN_LIFE_FACE_UP", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_cost_max: 3 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── EB03-057 Yamato (Character) — ON_PLAY give DON + ON_KO trash from opponent life
// [On Play] Give up to 3 rested DON!! cards to your {Land of Wano} type Leader.
// [On K.O.] Trash up to 1 card from the top of your opponent's Life cards.

export const EB03_057_YAMATO: EffectSchema = {
  card_id: "EB03-057",
  card_name: "Yamato",
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
            filter: { traits: ["Land of Wano"] },
          },
          params: { amount: 3, don_state: "RESTED" },
        },
      ],
    },
    {
      id: "on_ko_trash_life",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "TRASH_FROM_LIFE",
          target: { type: "OPPONENT_LIFE" },
          params: { amount: 1, position: "TOP", controller: "OPPONENT" },
        },
      ],
    },
  ],
};

// ─── EB03-058 Lilith (Character) — ON_PLAY conditional draw; TRIGGER play self
// [Your Turn] [On Play] If you have 2 or less Life cards, draw 1 card.
// [Trigger] If your Leader is [Vegapunk], play this card.

export const EB03_058_LILITH: EffectSchema = {
  card_id: "EB03-058",
  card_name: "Lilith",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
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
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Vegapunk" },
      },
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ─── EB03-059 S-Snake (Character) — ON_PLAY add to life face-up; TRIGGER prohibition
// [On Play] If your Leader has the {Egghead} type and you have 2 or more Life cards, add up to 1 Character card with a [Trigger] from your hand to the top of your Life cards face-up.
// [Trigger] Up to 1 of your opponent's Characters with a cost of 6 or less other than [Monkey.D.Luffy] cannot attack during this turn.

export const EB03_059_S_SNAKE: EffectSchema = {
  card_id: "EB03-059",
  card_name: "S-Snake",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Egghead" },
          },
          {
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 2,
          },
        ],
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", has_trigger: true },
          },
          params: { amount: 1, face: "UP", position: "TOP" },
        },
      ],
    },
    {
      id: "trigger_cannot_attack",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6, exclude_name: "Monkey.D.Luffy" },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── EB03-060 Will You Be My Servant? (Event) — MAIN search + TRIGGER reuse effect
// [Main] If your Leader is [Nami], look at 4 cards from the top of your deck; reveal up to 1 card with a cost of 2 to 8 and add it to your hand. Then, place the rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const EB03_060_WILL_YOU_BE_MY_SERVANT: EffectSchema = {
  card_id: "EB03-060",
  card_name: "Will You Be My Servant?",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Nami" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_range: { min: 2, max: 8 } },
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

// ─── EB03-062 Trafalgar Law (Character) — Rush + ACTIVATE_MAIN trash hand + self + add life + play Law
// [Rush]
// [Activate: Main] You may trash 1 card from your hand and trash this Character: Add up to 1 card from the top of your deck to the top of your Life cards. Then, play up to 1 [Trafalgar Law] with a cost of 7 or less from your hand.

export const EB03_062_TRAFALGAR_LAW: EffectSchema = {
  card_id: "EB03-062",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "activate_trash_add_life_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { name: "Trafalgar Law", cost_max: 7 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const EB03_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "EB03-001": EB03_001_NEFELTARI_VIVI,
  "EB03-003": EB03_003_UTA,
  "EB03-004": EB03_004_CARINA,
  "EB03-005": EB03_005_SUGAR,
  "EB03-006": EB03_006_NAMI,
  "EB03-007": EB03_007_BACCARAT,
  "EB03-008": EB03_008_HIBARI,
  "EB03-009": EB03_009_MAKINO,
  "EB03-010": EB03_010_MONET,
  "EB03-011": EB03_011_BUT_IF_WE_EVER_SEE_EACH_OTHER_AGAIN,
  // Green
  "EB03-012": EB03_012_OTAMA,
  "EB03-013": EB03_013_CARROT,
  "EB03-014": EB03_014_KUINA,
  "EB03-015": EB03_015_CAMIE,
  "EB03-016": EB03_016_KOUZUKI_HIYORI,
  "EB03-017": EB03_017_JEWELRY_BONNEY,
  "EB03-018": EB03_018_TASHIGI,
  "EB03-019": EB03_019_WANDA,
  "EB03-020": EB03_020_THERE_YOU_ARE_SORE_LOSER,
  "EB03-061": EB03_061_UTA,
  // Blue
  "EB03-021": EB03_021_ALVIDA,
  "EB03-022": EB03_022_ISUKA,
  "EB03-023": EB03_023_KAYA,
  "EB03-024": EB03_024_NEFELTARI_VIVI,
  "EB03-025": EB03_025_HINA,
  "EB03-026": EB03_026_BOA_HANCOCK,
  "EB03-027": EB03_027_MARGUERITE,
  "EB03-028": EB03_028_YU,
  "EB03-029": EB03_029_INSOLENT_FOOL_STAND_DOWN,
  // Purple
  "EB03-031": EB03_031_VINSMOKE_REIJU,
  "EB03-032": EB03_032_CHARLOTTE_FLAMPE,
  "EB03-033": EB03_033_CHARLOTTE_BRULEE,
  "EB03-034": EB03_034_CHARLOTTE_LINLIN,
  "EB03-035": EB03_035_CHARLOTTE_PUDDING,
  "EB03-036": EB03_036_BABY_5,
  "EB03-037": EB03_037_LIM,
  "EB03-038": EB03_038_THANKS_FOR_THE_TREAT,
  // Black
  "EB03-039": EB03_039_ULTI,
  "EB03-041": EB03_041_KUJYAKU,
  "EB03-042": EB03_042_KOALA,
  "EB03-043": EB03_043_STUSSY,
  "EB03-044": EB03_044_BLACK_MARIA,
  "EB03-045": EB03_045_PERONA,
  "EB03-046": EB03_046_MISS_DOUBLEFINGER,
  "EB03-047": EB03_047_MISS_VALENTINE,
  "EB03-048": EB03_048_REBECCA,
  "EB03-049": EB03_049_I_KNEW_YOU_PEOPLE_WERE_BEHIND_THIS,
  // Yellow
  "EB03-050": EB03_050_CONIS,
  "EB03-051": EB03_051_CHARLOTTE_SMOOTHIE,
  "EB03-052": EB03_052_SHIRAHOSHI,
  "EB03-053": EB03_053_NAMI,
  "EB03-054": EB03_054_NICO_ROBIN,
  "EB03-055": EB03_055_NICO_ROBIN,
  "EB03-056": EB03_056_BELO_BETTY,
  "EB03-057": EB03_057_YAMATO,
  "EB03-058": EB03_058_LILITH,
  "EB03-059": EB03_059_S_SNAKE,
  "EB03-060": EB03_060_WILL_YOU_BE_MY_SERVANT,
  "EB03-062": EB03_062_TRAFALGAR_LAW,
};
