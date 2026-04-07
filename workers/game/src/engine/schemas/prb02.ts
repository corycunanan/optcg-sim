/**
 * PRB02 Effect Schemas
 *
 * Red (Koby, Trafalgar Law, Lucky.Roux): PRB02-001 to PRB02-003
 * Green (Jewelry Bonney, Monkey.D.Luffy, Roronoa Zoro): PRB02-004 to PRB02-006
 * Blue (Jinbe, Marco, Mr.3): PRB02-007 to PRB02-009
 * Purple (Charlotte Pudding, Donquixote Doflamingo, Nami): PRB02-010 to PRB02-012
 * Black (Gecko Moria, Sabo, Shiryu): PRB02-013 to PRB02-015
 * Yellow (Otama, Boa Hancock, Portgas.D.Ace): PRB02-016 to PRB02-018
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Koby, Trafalgar Law, Lucky.Roux (PRB02-001 to PRB02-003)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB02-001 Koby (Character) — Opponent's Turn power buff + When Attacking KO/draw
// [Opponent's Turn] If your Leader has the {Navy} type, this Character gains +1000 power.
// [When Attacking] K.O. up to 1 of your opponent's Characters with 3000 base power or
// less. Then, if you have 6 or less cards in your hand, draw 1 card.

export const PRB02_001_KOBY: EffectSchema = {
  card_id: "PRB02-001",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_power_buff",
      category: "permanent",
      // OPPONENT_TURN-scoped permanent: only active during opponent's turn
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Navy" },
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
      id: "when_attacking_ko_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { base_power_max: 3000 },
          },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
          conditions: {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 6,
          },
        },
      ],
    },
  ],
};

// ─── PRB02-002 Trafalgar Law (Character) — removal replacement + When Attacking debuff
// [Once Per Turn] If this Character would be removed from the field by your opponent's
// effect, you may give this Character −2000 power during this turn instead.
// [When Attacking] Give up to 1 of your opponent's Characters −2000 power during this turn.

export const PRB02_002_TRAFALGAR_LAW: EffectSchema = {
  card_id: "PRB02-002",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "removal_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "when_attacking_debuff",
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
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── PRB02-003 Lucky.Roux (Character) — Blocker + On Play trash-to-draw
// [Blocker] (After your opponent declares an attack, you may rest this card to make it
// the new target of the attack.)
// [On Play] You may trash 1 Character card with 6000 power or more from your hand: Draw 2 cards.

export const PRB02_003_LUCKY_ROUX: EffectSchema = {
  card_id: "PRB02-003",
  card_name: "Lucky.Roux",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { card_type: "CHARACTER", power_min: 6000 },
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
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Jewelry Bonney, Monkey.D.Luffy, Roronoa Zoro (PRB02-004 to PRB02-006)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB02-004 Jewelry Bonney (Character) — Blocker + On Opponent's Attack set DON active
// [Blocker] (After your opponent declares an attack, you may rest this card to make it
// the new target of the attack.)
// [On Your Opponent's Attack] [Once Per Turn] Set up to 1 of your DON!! cards as active.

export const PRB02_004_JEWELRY_BONNEY: EffectSchema = {
  card_id: "PRB02-004",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_opponent_attack_set_don_active",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── PRB02-005 Monkey.D.Luffy (Character) — On Play schedule opponent DON rest
// [Your Turn] [On Play] If your Leader is multicolored and your opponent has 7 or less
// DON!! cards on their field, your opponent rests 1 of their active DON!! cards at the
// start of their next Main Phase.

export const PRB02_005_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "PRB02-005",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_schedule_don_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
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
            operator: "<=",
            value: 7,
          },
        ],
      },
      actions: [
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "START_OF_OPPONENT_NEXT_MAIN_PHASE",
            action: {
              type: "REST_OPPONENT_DON",
              params: { amount: 1 },
            },
          },
        },
      ],
    },
  ],
};

// ─── PRB02-006 Roronoa Zoro (Character) — Opponent's Turn rest replacement + Blocker
// [Opponent's Turn] If this Character would be rested by your opponent's Character's
// effect, you may rest 1 of your other Characters instead.
// [Blocker]

export const PRB02_006_RORONOA_ZORO: EffectSchema = {
  card_id: "PRB02-006",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "rest_replacement",
      category: "replacement",
      // OPPONENT_TURN-scoped replacement; cause is specifically opponent's Character effect
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_RESTED",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { exclude_self: true },
          },
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Jinbe, Marco, Mr.3(Galdino) (PRB02-007 to PRB02-009)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB02-007 Jinbe (Character) — On Play search + When Attacking bottom deck
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {The Seven
// Warlords of the Sea} type card other than [Jinbe] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// [When Attacking] Place up to 1 Character with a cost of 1 or less at the bottom of
// the owner's deck.

export const PRB02_007_JINBE: EffectSchema = {
  card_id: "PRB02-007",
  card_name: "Jinbe",
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
              traits: ["The Seven Warlords of the Sea"],
              exclude_name: "Jinbe",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "when_attacking_return_to_deck",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── PRB02-008 Marco (Character) — Blocker + On K.O. draw
// [Blocker] (After your opponent declares an attack, you may rest this card to make it
// the new target of the attack.)
// [On K.O.] Draw 2 cards.

export const PRB02_008_MARCO: EffectSchema = {
  card_id: "PRB02-008",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── PRB02-009 Mr.3(Galdino) (Character) — rested by opponent trigger + Blocker
// This effect can be activated when this Character is rested by your opponent's effect.
// You may trash this Character and draw 2 cards.
// [Blocker]

export const PRB02_009_MR_3_GALDINO: EffectSchema = {
  card_id: "PRB02-009",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "rested_by_opponent_trash_draw",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        filter: { cause: "BY_OPPONENT_EFFECT" },
      },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
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

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Charlotte Pudding, Donquixote Doflamingo, Nami (PRB02-010 to PRB02-012)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB02-010 Charlotte Pudding (Character) — On Play DON−2 draw + play Big Mom Pirates
// [On Play] DON!! −2: If your Leader has the {Big Mom Pirates} type and your opponent
// has 6 or more DON!! cards on their field, draw 2 cards. Then, play up to 1 {Big Mom
// Pirates} type Character card with 6000 to 8000 power from your hand.

export const PRB02_010_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "PRB02-010",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_minus_draw_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Big Mom Pirates" },
          },
          {
            type: "DON_FIELD_COUNT",
            controller: "OPPONENT",
            operator: ">=",
            value: 6,
          },
        ],
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              traits: ["Big Mom Pirates"],
              power_range: { min: 6000, max: 8000 },
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── PRB02-011 Donquixote Doflamingo (Character) — Blocker + On Play add DON rested
// [Blocker]
// [On Play] If your Leader is multicolored, add up to 1 DON!! card from your DON!! deck
// and rest it.

export const PRB02_011_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "PRB02-011",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_add_don_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { multicolored: true },
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

// ─── PRB02-012 Nami (Character) — On Play search Straw Hat Crew + Trigger play self
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew}
// type card other than [Nami] and add it to your hand. Then, place the rest at the
// bottom of your deck in any order.
// [Trigger] Play this card.

export const PRB02_012_NAMI: EffectSchema = {
  card_id: "PRB02-012",
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
            filter: {
              traits: ["Straw Hat Crew"],
              exclude_name: "Nami",
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
      actions: [
        {
          type: "PLAY_SELF",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Gecko Moria, Sabo, Shiryu (PRB02-013 to PRB02-015)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB02-013 Gecko Moria (Character) — On Play revive from trash + give DON
// [On Play] If your Leader has the {Thriller Bark Pirates} type, play up to 1 Character
// card with a cost of 4 or less from your trash rested. Then, give up to 1 rested DON!!
// card to your Leader or 1 of your Characters.

export const PRB02_013_GECKO_MORIA: EffectSchema = {
  card_id: "PRB02-013",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "on_play_revive_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Thriller Bark Pirates" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── PRB02-014 Sabo (Character) — hand cost reduction + Blocker
// If you have 15 or more cards in your trash, give this card in your hand −3 cost.
// [Blocker] (After your opponent declares an attack, you may rest this card to make it
// the new target of the attack.)

export const PRB02_014_SABO: EffectSchema = {
  card_id: "PRB02-014",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "hand_cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 15,
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { self_ref: true },
          params: { amount: -3 },
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

// ─── PRB02-015 Shiryu (Character) — conditional Blocker/+4 cost + On K.O. KO opponent
// If your Leader has the {Blackbeard Pirates} type, this Character gains [Blocker] and
// +4 cost.
// [On K.O.] If your Leader has the {Blackbeard Pirates} type, K.O. up to 1 of your
// opponent's Characters with a base cost of 4 or less.

export const PRB02_015_SHIRYU: EffectSchema = {
  card_id: "PRB02-015",
  card_name: "Shiryu",
  card_type: "Character",
  effects: [
    {
      id: "conditional_blocker_cost",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
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
      id: "on_ko_ko_opponent",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Blackbeard Pirates" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Otama, Boa Hancock, Portgas.D.Ace (PRB02-016 to PRB02-018)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PRB02-016 Otama (Character) — Activate:Main power boost + Trigger rest
// [Activate: Main] You may rest this Character and add 1 card from the top or bottom of
// your Life cards to your hand: Up to 1 of your Leader or Character cards gains +3000
// power during this turn.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const PRB02_016_OTAMA: EffectSchema = {
  card_id: "PRB02-016",
  card_name: "Otama",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
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
          duration: { type: "THIS_TURN" },
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

// ─── PRB02-017 Boa Hancock (Character) — On Play prohibition + Trigger KO
// [On Play] You may trash 1 card with a [Trigger] from your hand: Your opponent's rested
// Leader or up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot
// attack until the end of your opponent's next End Phase.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const PRB02_017_BOA_HANCOCK: EffectSchema = {
  card_id: "PRB02-017",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { card_type: "LEADER", is_rested: true },
                { card_type: "CHARACTER", exclude_name: "Monkey.D.Luffy" },
              ],
            },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
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
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── PRB02-018 Portgas.D.Ace (Character) — On Play play from hand or trash
// [On Play] If you have a face-up Life card, play up to 1 [Sabo], [Portgas.D.Ace], or
// [Monkey.D.Luffy] with a cost of 2 from your hand or trash.

export const PRB02_018_PORTGAS_D_ACE: EffectSchema = {
  card_id: "PRB02-018",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_named",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "FACE_UP_LIFE",
        controller: "SELF",
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: {
              name_any_of: ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"],
              cost_exact: 2,
            },
          },
          params: { cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const PRB02_SCHEMAS: Record<string, EffectSchema> = {
  "PRB02-001": PRB02_001_KOBY,
  "PRB02-002": PRB02_002_TRAFALGAR_LAW,
  "PRB02-003": PRB02_003_LUCKY_ROUX,
  "PRB02-004": PRB02_004_JEWELRY_BONNEY,
  "PRB02-005": PRB02_005_MONKEY_D_LUFFY,
  "PRB02-006": PRB02_006_RORONOA_ZORO,
  "PRB02-007": PRB02_007_JINBE,
  "PRB02-008": PRB02_008_MARCO,
  "PRB02-009": PRB02_009_MR_3_GALDINO,
  "PRB02-010": PRB02_010_CHARLOTTE_PUDDING,
  "PRB02-011": PRB02_011_DONQUIXOTE_DOFLAMINGO,
  "PRB02-012": PRB02_012_NAMI,
  "PRB02-013": PRB02_013_GECKO_MORIA,
  "PRB02-014": PRB02_014_SABO,
  "PRB02-015": PRB02_015_SHIRYU,
  "PRB02-016": PRB02_016_OTAMA,
  "PRB02-017": PRB02_017_BOA_HANCOCK,
  "PRB02-018": PRB02_018_PORTGAS_D_ACE,
};
