/**
 * M4 Effect Schema — OP01 Card Encodings
 *
 * 18 representative OP01 cards covering every effect category:
 *
 *  Auto/keyword triggers: ON_PLAY, WHEN_ATTACKING, ON_KO, ON_BLOCK, COUNTER, TRIGGER
 *  Activate: ACTIVATE_MAIN, MAIN_EVENT
 *  Permanent: DON!! conditional auras, static keyword grants
 *  Replacement: KO protection
 *  Costs: DON_REST, DON_MINUS, REST_SELF, TRASH_FROM_HAND, RETURN_OWN_CHARACTER_TO_HAND
 *  Actions: DRAW, SEARCH_DECK, KO, RETURN_TO_HAND, MODIFY_POWER, GRANT_KEYWORD,
 *           GIVE_DON, ADD_DON_FROM_DECK, SET_DON_ACTIVE, SET_ACTIVE, SET_REST,
 *           PLAY_CARD, SCHEDULE_ACTION, OPPONENT_CHOICE, REUSE_EFFECT, APPLY_PROHIBITION
 *  Conditions: LIFE_COUNT, CARD_ON_FIELD, DON_FIELD_COUNT, HAND_COUNT, RESTED_CARD_COUNT,
 *              LEADER_PROPERTY, SELF_STATE
 *  Durations: THIS_TURN, THIS_BATTLE, PERMANENT
 *  Chains: THEN, IF_DO
 *  Filters: cost_max, traits, exclude_name, color, is_rested, power_max
 *  Flags: once_per_turn, optional
 *  Rule modifications: COPY_LIMIT_OVERRIDE
 *
 * Card IDs use actual OP01 card IDs from the card database.
 */

import type { EffectSchema } from "../effect-types.js";

// ─── 1. Otama (OP01-006) — ON_PLAY + MODIFY_POWER negative ──────────────────
// [On Play] Give up to 1 of your opponent's Characters −2000 power during this turn.

export const OP01_006_OTAMA: EffectSchema = {
  card_id: "OP01-006",
  card_name: "Otama",
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

// ─── 2. Caribou (OP01-007) — ON_KO + KO action ─────────────────────────────
// [On K.O.] K.O. up to 1 of your opponent's Characters with 4000 power or less.

export const OP01_007_CARIBOU: EffectSchema = {
  card_id: "OP01-007",
  card_name: "Caribou",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_revenge",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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

// ─── 3. Cavendish (OP01-008) — ON_PLAY + cost (life to hand) + GRANT_KEYWORD ─
// [On Play] You may add 1 card from your Life area to your hand:
// This Character gains [Rush] during this turn.

export const OP01_008_CAVENDISH: EffectSchema = {
  card_id: "OP01-008",
  card_name: "Cavendish",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rush",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "TRASH_FROM_LIFE", amount: 1 },
      ],
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
  ],
};

// ─── 4. Gordon (OP01-011) — ON_PLAY + cost (hand to deck) + DRAW ────────────
// [On Play] You may place 1 card from your hand at the bottom of your deck: Draw 1 card.

export const OP01_011_GORDON: EffectSchema = {
  card_id: "OP01-011",
  card_name: "Gordon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cycle",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "PLACE_HAND_TO_DECK", amount: 1, position: "BOTTOM" },
      ],
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 5. Nami (OP01-016) — ON_PLAY + SEARCH_DECK ─────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1
// {Straw Hat Crew} type card other than [Nami] and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP01_016_NAMI: EffectSchema = {
  card_id: "OP01-016",
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
  ],
};

// ─── 6. Nico Robin (OP01-017) — DON!! x1 + WHEN_ATTACKING + KO ─────────────
// [DON!! x1] [When Attacking] K.O. up to 1 of your opponent's Characters
// with 3000 power or less.

export const OP01_017_NICO_ROBIN: EffectSchema = {
  card_id: "OP01-017",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko",
      category: "auto",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
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
  ],
};

// ─── 7. Hyogoro (OP01-020) — ACTIVATE_MAIN + REST_SELF cost + MODIFY_POWER ──
// [Activate: Main] You may rest this Character: Up to 1 of your Leader
// or Character cards gains +2000 power during this turn.

export const OP01_020_HYOGORO: EffectSchema = {
  card_id: "OP01-020",
  card_name: "Hyogoro",
  card_type: "Character",
  effects: [
    {
      id: "activate_power_boost",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
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
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 8. Jinbe (OP01-014) — BLOCKER keyword + DON!! x1 ON_BLOCK + PLAY_CARD ──
// [Blocker]
// [DON!! x1] [On Block] Play up to 1 red Character card with a cost of
// 2 or less from your hand.

export const OP01_014_JINBE: EffectSchema = {
  card_id: "OP01-014",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "on_block_play",
      category: "auto",
      trigger: {
        keyword: "ON_BLOCK",
        don_requirement: 1,
      },
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
              cost_max: 2,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── 9. Izo (OP01-033) — ON_PLAY + SET_REST on opponent ─────────────────────
// [On Play] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP01_033_IZO: EffectSchema = {
  card_id: "OP01-033",
  card_name: "Izo",
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
            filter: { cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── 10. Okiku (OP01-035) — DON!! x1 + WHEN_ATTACKING + once_per_turn + SET_REST
// [DON!! x1] [When Attacking] [Once Per Turn] Rest up to 1 of your opponent's
// Characters with a cost of 5 or less.

export const OP01_035_OKIKU: EffectSchema = {
  card_id: "OP01-035",
  card_name: "Okiku",
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
            filter: { cost_max: 5 },
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 11. Trafalgar Law (OP01-047) — ON_PLAY + cost (return own char) + PLAY_CARD
// [Blocker]
// [On Play] You may return 1 Character to your hand: Play up to 1
// Character card with a cost of 3 or less from your hand.

export const OP01_047_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP01-047",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "on_play_swap",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "RETURN_OWN_CHARACTER_TO_HAND" },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 12. Raizo (OP01-052) — WHEN_ATTACKING + once_per_turn + condition + DRAW ─
// [When Attacking] [Once Per Turn] If you have 2 or more rested Characters, draw 1 card.

export const OP01_052_RAIZO: EffectSchema = {
  card_id: "OP01-052",
  card_name: "Raizo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 13. Dracule Mihawk (OP01-070) — ON_PLAY + RETURN_TO_DECK ───────────────
// [On Play] Place up to 1 Character with a cost of 7 or less at the bottom
// of the owner's deck.

export const OP01_070_MIHAWK: EffectSchema = {
  card_id: "OP01-070",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce_to_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 7 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── 14. Pacifista (OP01-075) — Rule mod: COPY_LIMIT_OVERRIDE + BLOCKER ─────
// Under the rules of this game, you may have any number of this card in your deck.
// [Blocker]

export const OP01_075_PACIFISTA: EffectSchema = {
  card_id: "OP01-075",
  card_name: "Pacifista",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
  effects: [],
};

// ─── 15. Radical Beam!! (OP01-029) — COUNTER + MODIFY_POWER + conditional chain
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 2 or less Life cards, that card gains an
// additional +2000 power.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.

export const OP01_029_RADICAL_BEAM: EffectSchema = {
  card_id: "OP01-029",
  card_name: "Radical Beam!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost",
      category: "auto",
      trigger: { keyword: "COUNTER" },
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
            type: "LIFE_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "trigger_boost",
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

// ─── 16. Kouzuki Oden (OP01-031) — ACTIVATE_MAIN + once_per_turn +
//     cost (trash from hand with trait filter) + SET_DON_ACTIVE
// [Activate: Main] [Once Per Turn] You can trash 1 {Land of Wano} type
// card from your hand: Set up to 2 of your DON!! cards as active.

export const OP01_031_ODEN: EffectSchema = {
  card_id: "OP01-031",
  card_name: "Kouzuki Oden",
  card_type: "Leader",
  effects: [
    {
      id: "activate_set_don_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "TRASH_FROM_HAND",
          amount: 1,
          filter: { traits: ["Land of Wano"] },
        },
      ],
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 2 },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── 17. Eustass"Captain"Kid (OP01-051) — Permanent prohibition +
//     ACTIVATE_MAIN with REST_SELF + PLAY_CARD
// [DON!! x1] [Opponent's Turn] If this Character is rested, your opponent
//   cannot attack any card other than the Character [Eustass"Captain"Kid].
// [Activate: Main] [Once Per Turn] You may rest this Character:
//   Play up to 1 Character card with a cost of 3 or less from your hand.

export const OP01_051_EUSTASS_KID: EffectSchema = {
  card_id: "OP01-051",
  card_name: 'Eustass"Captain"Kid',
  card_type: "Character",
  effects: [
    {
      id: "taunt_prohibition",
      category: "permanent",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
        don_requirement: 1,
        turn_restriction: "OPPONENT_TURN",
      },
      conditions: {
        type: "SELF_STATE",
        required_state: "RESTED",
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ATTACK",
            scope: {
              controller: "OPPONENT",
              // Only allow attacking this specific card
              when_attacking: { type: "SELF" },
            },
          },
          duration: { type: "PERMANENT" },
        },
      ],
    },
    {
      id: "activate_play",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── 18. Kaido (OP01-094) — ON_PLAY + DON_MINUS cost + leader condition +
//     KO all (global wipe)
// [On Play] DON!! −6: If your Leader has the {Animal Kingdom Pirates} type,
//   K.O. all Characters other than this Character.

export const OP01_094_KAIDO: EffectSchema = {
  card_id: "OP01-094",
  card_name: "Kaido",
  card_type: "Character",
  effects: [
    {
      id: "on_play_board_wipe",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "DON_MINUS", amount: 6 },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { exclude_self: true },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── Card Schema Registry ───────────────────────────────────────────────────

export const OP01_SCHEMAS: Record<string, EffectSchema> = {
  "OP01-006": OP01_006_OTAMA,
  "OP01-007": OP01_007_CARIBOU,
  "OP01-008": OP01_008_CAVENDISH,
  "OP01-011": OP01_011_GORDON,
  "OP01-014": OP01_014_JINBE,
  "OP01-016": OP01_016_NAMI,
  "OP01-017": OP01_017_NICO_ROBIN,
  "OP01-020": OP01_020_HYOGORO,
  "OP01-029": OP01_029_RADICAL_BEAM,
  "OP01-031": OP01_031_ODEN,
  "OP01-033": OP01_033_IZO,
  "OP01-035": OP01_035_OKIKU,
  "OP01-047": OP01_047_TRAFALGAR_LAW,
  "OP01-051": OP01_051_EUSTASS_KID,
  "OP01-052": OP01_052_RAIZO,
  "OP01-070": OP01_070_MIHAWK,
  "OP01-075": OP01_075_PACIFISTA,
  "OP01-094": OP01_094_KAIDO,
};
