/**
 * M4 Effect Schema — Ace Test Deck Encodings
 *
 * All 19 unique cards in the Portgas.D.Ace test deck.
 * Leader: OP13-002 Portgas.D.Ace
 *
 * Cards span 9 sets: OP01, OP02, OP04, OP06, OP08, OP09, OP10, OP13, ST22, ST23, PRB02
 */

import type { EffectSchema } from "../effect-types.js";

// ─── Leader: OP13-002 Portgas.D.Ace ──────────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
//   hand: Give up to 1 of your opponent's Leader or Character cards −2000
//   power during this battle.
// [DON!! x1] [Once Per Turn] When you take damage or your Character with
//   6000 base power or more is K.O.'d, draw 1 card.

export const OP13_002_ACE: EffectSchema = {
  card_id: "OP13-002",
  card_name: "Portgas.D.Ace",
  card_type: "Leader",
  effects: [
    {
      id: "on_opp_attack_debuff",
      category: "auto",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
      },
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
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "on_damage_or_ko_draw",
      category: "auto",
      trigger: {
        any_of: [
          { event: "DAMAGE_TAKEN", filter: { controller: "SELF" } },
          {
            event: "ANY_CHARACTER_KO",
            filter: { controller: "SELF", target_filter: { base_power_min: 6000 } },
          },
        ],
        don_requirement: 1,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP13-043 Otama ──────────────────────────────────────────────────────────
// [On Play] If you have 3 or less Life cards, draw 2 cards and trash 1 card
//   from your hand.

export const OP13_043_OTAMA: EffectSchema = {
  card_id: "OP13-043",
  card_name: "Otama",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── ST22-002 Izo ────────────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 card
//   with a type including "Whitebeard Pirates" other than [Izo] and add it
//   to your hand. Then, place the rest at the bottom of your deck in any order.
// [On Your Opponent's Attack] You may trash this Character: Draw 1 card and
//   place 1 card from your hand at the bottom of your deck.

export const ST22_002_IZO: EffectSchema = {
  card_id: "ST22-002",
  card_name: "Izo",
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
              traits: ["Whitebeard Pirates"],
              exclude_name: "Izo",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "on_opp_attack_cycle",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [
        { type: "TRASH_SELF" },
      ],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 1, position: "BOTTOM" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP13-016 Monkey.D.Garp ─────────────────────────────────────────────────
// [On Play] If your Leader is [Sabo], [Portgas.D.Ace] or [Monkey.D.Luffy],
//   look at 4 cards from the top of your deck; reveal up to 1 card with a
//   cost of 3 or more and add it to your hand. Then, place the rest at the
//   bottom of your deck in any order.

export const OP13_016_GARP: EffectSchema = {
  card_id: "OP13-016",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { name: "Sabo" } },
          { type: "LEADER_PROPERTY", controller: "SELF", property: { name: "Portgas.D.Ace" } },
          { type: "LEADER_PROPERTY", controller: "SELF", property: { name: "Monkey.D.Luffy" } },
        ],
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { cost_min: 3 },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP08-040 Atmos ──────────────────────────────────────────────────────────
// [On Play] You may reveal 2 cards with a type including "Whitebeard Pirates"
//   from your hand: If your Leader's type includes "Whitebeard Pirates",
//   return up to 1 of your opponent's Characters with a cost of 4 or less
//   to the owner's hand.

export const OP08_040_ATMOS: EffectSchema = {
  card_id: "OP08-040",
  card_name: "Atmos",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 2,
          filter: { traits: ["Whitebeard Pirates"] },
        },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Whitebeard Pirates" },
      },
      actions: [
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
      flags: { optional: true },
    },
  ],
};

// ─── PRB02-008 Marco ─────────────────────────────────────────────────────────
// [Blocker]
// [On K.O.] Draw 2 cards.

export const PRB02_008_MARCO: EffectSchema = {
  card_id: "PRB02-008",
  card_name: "Marco",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP06-047 Charlotte Pudding ──────────────────────────────────────────────
// [On Play] Your opponent returns all cards in their hand to their deck and
//   shuffles their deck. Then, your opponent draws 5 cards.

export const OP06_047_PUDDING: EffectSchema = {
  card_id: "OP06-047",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "on_play_hand_reset",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "RETURN_HAND_TO_DECK",
              params: { shuffle: true },
            },
          },
        },
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "DRAW",
              params: { amount: 5 },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP10-045 Cavendish ──────────────────────────────────────────────────────
// [When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.

export const OP10_045_CAVENDISH: EffectSchema = {
  card_id: "OP10-045",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw_trash",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP02-008 Jozu ───────────────────────────────────────────────────────────
// [DON!! x1] If you have 2 or less Life cards and your Leader's type includes
//   "Whitebeard Pirates", this Character gains [Rush].

export const OP02_008_JOZU: EffectSchema = {
  card_id: "OP02-008",
  card_name: "Jozu",
  card_type: "Character",
  effects: [
    {
      id: "conditional_rush",
      category: "permanent",
      trigger: {
        keyword: "ON_PLAY",
        don_requirement: 1,
      },
      conditions: {
        all_of: [
          { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait: "Whitebeard Pirates" } },
        ],
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "PERMANENT" },
        },
      ],
    },
  ],
};

// ─── OP13-054 Yamato ─────────────────────────────────────────────────────────
// [On Play] If you have 3 or less Life cards, draw 2 cards. Then, give up
//   to 1 rested DON!! card to your Leader.

export const OP13_054_YAMATO: EffectSchema = {
  card_id: "OP13-054",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1, source: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP08-047 Jozu ───────────────────────────────────────────────────────────
// [On Play] You may return 1 of your Characters other than this Character
//   to the owner's hand: Return up to 1 Character with a cost of 6 or less
//   to the owner's hand.

export const OP08_047_JOZU: EffectSchema = {
  card_id: "OP08-047",
  card_name: "Jozu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "RETURN_OWN_CHARACTER_TO_HAND" },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── ST23-001 Uta ────────────────────────────────────────────────────────────
// If you have a Character with 10000 power or more, give this card in your
//   hand −4 cost.
// [Blocker]

export const ST23_001_UTA: EffectSchema = {
  card_id: "ST23-001",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "cost_reduction",
      category: "permanent",
      zone: "HAND",
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", power_min: 10000 },
        count: { operator: ">=", value: 1 },
      },
      actions: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: -4 },
          duration: { type: "PERMANENT" },
        },
      ],
    },
  ],
};

// ─── OP13-046 Vista ──────────────────────────────────────────────────────────
// [Double Attack]
// [Once Per Turn] If this Character would be K.O.'d or would be removed from
//   the field by your opponent's effect, you may trash 1 card with a type
//   including "Whitebeard Pirates" from your hand instead.

export const OP13_046_VISTA: EffectSchema = {
  card_id: "OP13-046",
  card_name: "Vista",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_KO",
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1, filter: { traits: ["Whitebeard Pirates"] } },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "removal_protection",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1, filter: { traits: ["Whitebeard Pirates"] } },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP13-042 Edward.Newgate ─────────────────────────────────────────────────
// [Blocker]
// [On Play] Draw 2 cards and trash 1 card from your hand. Then, give your
//   Leader and 1 Character up to 2 rested DON!! cards each.

export const OP13_042_NEWGATE: EffectSchema = {
  card_id: "OP13-042",
  card_name: "Edward.Newgate",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_and_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
        {
          type: "GIVE_DON",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2, source: "RESTED" },
          chain: "THEN",
        },
        {
          type: "GIVE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2, source: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP09-118 Gol.D.Roger ───────────────────────────────────────────────────
// [Rush]
// When your opponent activates [Blocker], if either you or your opponent
//   has 0 Life cards, you win the game.

export const OP09_118_ROGER: EffectSchema = {
  card_id: "OP09-118",
  card_name: "Gol.D.Roger",
  card_type: "Character",
  effects: [
    {
      id: "blocker_win_condition",
      category: "auto",
      trigger: {
        event: "BLOCKER_ACTIVATED",
        filter: { controller: "OPPONENT" },
      },
      conditions: {
        any_of: [
          { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 0 },
          { type: "LIFE_COUNT", controller: "OPPONENT", operator: "==", value: 0 },
        ],
      },
      actions: [
        { type: "WIN_GAME" },
      ],
    },
  ],
};

// ─── OP01-027 Round Table ────────────────────────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters −10000 power during this turn.

export const OP01_027_ROUND_TABLE: EffectSchema = {
  card_id: "OP01-027",
  card_name: "Round Table",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -10000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP04-056 Gum-Gum Red Roc ───────────────────────────────────────────────
// [Main] Place up to 1 Character at the bottom of the owner's deck.
// [Trigger] Place up to 1 Character with a cost of 4 or less at the bottom
//   of the owner's deck.

export const OP04_056_RED_ROC: EffectSchema = {
  card_id: "OP04-056",
  card_name: "Gum-Gum Red Roc",
  card_type: "Event",
  effects: [
    {
      id: "main_remove",
      category: "activate",
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
      id: "trigger_remove",
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

// ─── ST22-015 I Am Whitebeard!! ──────────────────────────────────────────────
// [Main] If your Leader's type includes "Whitebeard Pirates", play up to 1
//   [Edward.Newgate] from your hand. Then, you may add 1 card from the top
//   or bottom of your Life cards to your hand. If you do, up to 1 of your
//   Leader gains +2000 power until the end of your opponent's next turn.

export const ST22_015_WHITEBEARD: EffectSchema = {
  card_id: "ST22-015",
  card_name: "I Am Whitebeard!!",
  card_type: "Event",
  effects: [
    {
      id: "main_play_and_boost",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Whitebeard Pirates" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Edward.Newgate" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
        {
          type: "TRASH_FROM_LIFE",
          params: { amount: 1, position: "TOP" },
          chain: "THEN",
          result_ref: "life_added",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const ACE_DECK_SCHEMAS: Record<string, EffectSchema> = {
  "OP13-002": OP13_002_ACE,
  "OP13-043": OP13_043_OTAMA,
  "ST22-002": ST22_002_IZO,
  "OP13-016": OP13_016_GARP,
  "OP08-040": OP08_040_ATMOS,
  "PRB02-008": PRB02_008_MARCO,
  "OP06-047": OP06_047_PUDDING,
  "OP10-045": OP10_045_CAVENDISH,
  "OP02-008": OP02_008_JOZU,
  "OP13-054": OP13_054_YAMATO,
  "OP08-047": OP08_047_JOZU,
  "ST23-001": ST23_001_UTA,
  "OP13-046": OP13_046_VISTA,
  "OP13-042": OP13_042_NEWGATE,
  "OP09-118": OP09_118_ROGER,
  "OP01-027": OP01_027_ROUND_TABLE,
  "OP04-056": OP04_056_RED_ROC,
  "ST22-015": ST22_015_WHITEBEARD,
  // OP01-029 Radical Beam!! is already in op01.ts
};
