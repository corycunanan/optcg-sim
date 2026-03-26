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

// ─── 19. Roronoa Zoro (OP01-001) — Leader, DON!! x1 Your Turn aura ──────────
// [DON!! x1] [Your Turn] All of your Characters gain +1000 power.

export const OP01_001_RORONOA_ZORO: EffectSchema = {
  card_id: "OP01-001",
  card_name: "Roronoa Zoro",
  card_type: "Leader",
  effects: [
    {
      id: "don_aura_buff",
      category: "permanent",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_YOUR_CHARACTERS", controller: "SELF" },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── 20. Trafalgar Law (OP01-002) — Leader, Activate:Main ───────────────────
// [Activate: Main] [Once Per Turn] ②: If you have 5 Characters, return 1 of your Characters
// to the owner's hand. Then, play up to 1 Character with cost 5 or less from hand (different color).

export const OP01_002_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP01-002",
  card_name: "Trafalgar Law",
  card_type: "Leader",
  effects: [
    {
      id: "activate_swap",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_REST", amount: 2 }],
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {},
        count: { operator: ">=", value: 5 },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
          result_ref: "returned_char",
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_max: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 21. Monkey.D.Luffy (OP01-003) — Leader, Activate:Main ─────────────────
// [Activate: Main] [Once Per Turn] ④: Set up to 1 Supernovas/Straw Hat Crew char cost≤5 active, +1000.

export const OP01_003_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP01-003",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_set_active_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_REST", amount: 4 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { cost_max: 5, traits_any_of: ["Supernovas", "Straw Hat Crew"] },
          },
          result_ref: "activated_char",
        },
        {
          type: "MODIFY_POWER",
          target_ref: "activated_char",
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 22. Usopp (OP01-004) — DON!! x1 custom trigger ────────────────────────
// [DON!! x1] [Your Turn] [Once Per Turn] Draw 1 card when your opponent activates an Event.

export const OP01_004_USOPP: EffectSchema = {
  card_id: "OP01-004",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "draw_on_event",
      category: "auto",
      trigger: {
        event: "EVENT_ACTIVATED",
        filter: { controller: "OPPONENT" },
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 23. Uta (OP01-005) — ON_PLAY + trash search ───────────────────────────
// [On Play] Add up to 1 red Character card other than [Uta] with cost 3 or less from trash to hand.

export const OP01_005_UTA: EffectSchema = {
  card_id: "OP01-005",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_recover",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", color: "RED", cost_max: 3, exclude_name: "Uta" },
          },
        },
      ],
    },
  ],
};

// ─── 24. Carrot (OP01-009) — Trigger: play this card ────────────────────────

export const OP01_009_CARROT: EffectSchema = {
  card_id: "OP01-009",
  card_name: "Carrot",
  card_type: "Character",
  effects: [
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── 25. Sanji (OP01-013) — Activate:Main + life cost + buff + give DON ────
// [Activate: Main] [Once Per Turn] You may add 1 card from your Life area to your hand:
// This Character gains +2000 power during this turn. Then, give this Character up to 2 rested DON!!.

export const OP01_013_SANJI: EffectSchema = {
  card_id: "OP01-013",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "activate_life_buff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "GIVE_DON",
          target: { type: "SELF" },
          params: { amount: 2 },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── 26. Tony Tony.Chopper (OP01-015) — DON!!x1 When Attacking + cost ──────
// [DON!! x1] [When Attacking] You may trash 1 card from hand: Add Straw Hat Crew char cost≤4 from trash.

export const OP01_015_CHOPPER: EffectSchema = {
  card_id: "OP01-015",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_trash_recover",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Straw Hat Crew"], cost_max: 4, exclude_name: "Tony Tony.Chopper" },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 27. Bartolomeo (OP01-019) — DON!!x2 permanent power boost ─────────────
// [DON!! x2] [Opponent's Turn] This Character gains +3000 power.

export const OP01_019_BARTOLOMEO: EffectSchema = {
  card_id: "OP01-019",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "opp_turn_buff",
      category: "permanent",
      trigger: {
        keyword: "ON_OPPONENT_ATTACK",
        don_requirement: 2,
        turn_restriction: "OPPONENT_TURN",
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

// ─── 28. Franky (OP01-021) — DON!!x1 can attack active ─────────────────────
// [DON!! x1] This Character can also attack your opponent's active Characters.

export const OP01_021_FRANKY: EffectSchema = {
  card_id: "OP01-021",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "can_attack_active",
      category: "permanent",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
        },
      ],
    },
  ],
};

// ─── 29. Brook (OP01-022) — DON!!x1 When Attacking -2000 to 2 ──────────────
// [DON!! x1] [When Attacking] Give up to 2 of your opponent's Characters −2000 power this turn.

export const OP01_022_BROOK: EffectSchema = {
  card_id: "OP01-022",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_debuff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 } },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── 30. Monkey.D.Luffy (OP01-024) — DON!!x2 prohibition + Activate ────────
// [DON!! x2] This Character cannot be K.O.'d in battle by Strike attribute Characters.
// [Activate: Main] [Once Per Turn] Give this Character up to 2 rested DON!! cards.

export const OP01_024_LUFFY: EffectSchema = {
  card_id: "OP01-024",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection",
      category: "permanent",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE", source_filter: { attribute: "SLASH" } },
        },
      ],
    },
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "SELF" },
          params: { amount: 2 },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 31. Gum-Gum Fire-Fist Pistol Red Hawk (OP01-026) ──────────────────────
// [Counter] +4000 then KO cost≤4
// [Trigger] -10000 to opponent leader or char

export const OP01_026_RED_HAWK: EffectSchema = {
  card_id: "OP01-026",
  card_name: "Gum-Gum Fire-Fist Pistol Red Hawk",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_ko",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { power_max: 4000 } },
          chain: "THEN",
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
          target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -10000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── 32. Round Table (OP01-027) ─────────────────────────────────────────────
// [Main] Give up to 1 of your opponent's Characters −10000 power during this turn.

export const OP01_027_ROUND_TABLE: EffectSchema = {
  card_id: "OP01-027",
  card_name: "Round Table",
  card_type: "Event",
  effects: [
    {
      id: "main_debuff",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -10000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── 33. Green Star Rafflesia (OP01-028) ────────────────────────────────────
// [Counter] -2000 opponent leader or char
// [Trigger] Activate counter

export const OP01_028_GREEN_STAR: EffectSchema = {
  card_id: "OP01-028",
  card_name: "Green Star Rafflesia",
  card_type: "Event",
  effects: [
    {
      id: "counter_debuff",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "COUNTER" } }],
    },
  ],
};

// ─── 34. In Two Years (OP01-030) ────────────────────────────────────────────
// [Main] Search deck for Straw Hat Crew Character
// [Trigger] Activate main

export const OP01_030_IN_TWO_YEARS: EffectSchema = {
  card_id: "OP01-030",
  card_name: "In Two Years!! At the Sabaody Archipelago!!",
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
            filter: { traits: ["Straw Hat Crew"], card_type: "CHARACTER" },
            rest_destination: "BOTTOM",
          },
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

// ─── 35. Ashura Doji (OP01-032) — conditional power ────────────────────────
// [DON!! x1] If opponent has 2+ rested Characters, +2000 power.

export const OP01_032_ASHURA_DOJI: EffectSchema = {
  card_id: "OP01-032",
  card_name: "Ashura Doji",
  card_type: "Character",
  effects: [
    {
      id: "conditional_buff",
      category: "permanent",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "OPPONENT",
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
  ],
};

// ─── 36. Inuarashi (OP01-034) — DON!!x2 When Attacking set DON active ──────
// [DON!! x2] [When Attacking] Set up to 1 of your DON!! cards as active.

export const OP01_034_INUARASHI: EffectSchema = {
  card_id: "OP01-034",
  card_name: "Inuarashi",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_set_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 1 } }],
    },
  ],
};

// ─── 37. Kanjuro (OP01-038) — dual trigger ─────────────────────────────────
// [DON!! x1] [When Attacking] K.O. rested opponent char cost≤2
// [On K.O.] Opponent chooses 1 card from your hand; trash that card.

export const OP01_038_KANJURO: EffectSchema = {
  card_id: "OP01-038",
  card_name: "Kanjuro",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_ko_rested",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2, is_rested: true },
          },
        },
      ],
    },
    {
      id: "on_ko_opponent_discards",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
              params: { amount: 1 },
            },
          },
        },
      ],
    },
  ],
};

// ─── 38. Killer (OP01-039) — Blocker + DON!!x1 On Block draw ───────────────
// [DON!! x1] [On Block] If you have 3 or more Characters, draw 1 card.

export const OP01_039_KILLER: EffectSchema = {
  card_id: "OP01-039",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "on_block_draw",
      category: "auto",
      trigger: { keyword: "ON_BLOCK", don_requirement: 1 },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {},
        count: { operator: ">=", value: 3 },
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── 39. Kin'emon (OP01-040) — On Play + When Attacking ────────────────────
// [On Play] If leader is Oden, play Akazaya Nine cost≤3
// [DON!! x1] [When Attacking] [Once Per Turn] Set active Akazaya Nine cost≤3

export const OP01_040_KINEMON: EffectSchema = {
  card_id: "OP01-040",
  card_name: "Kin'emon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_akazaya",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Kouzuki Oden" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["The Akazaya Nine"], cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "when_attacking_set_active_akazaya",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["The Akazaya Nine"], cost_max: 3 },
          },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 40. Nekomamushi (OP01-048) — On Play rest ─────────────────────────────
// [On Play] Rest up to 1 of your opponent's Characters with cost 3 or less.

export const OP01_048_NEKOMAMUSHI: EffectSchema = {
  card_id: "OP01-048",
  card_name: "Nekomamushi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 3 } },
        },
      ],
    },
  ],
};

// ─── 41. Bepo (OP01-049) — DON!!x1 When Attacking play from hand ───────────
// [DON!! x1] [When Attacking] Play up to 1 Heart Pirates char cost≤4 from hand.

export const OP01_049_BEPO: EffectSchema = {
  card_id: "OP01-049",
  card_name: "Bepo",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_play",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Heart Pirates"], cost_max: 4, exclude_name: "Bepo" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── 42. X.Drake (OP01-054) — On Play KO rested ────────────────────────────
// [On Play] K.O. up to 1 of your opponent's rested Characters with cost 4 or less.

export const OP01_054_XDRAKE: EffectSchema = {
  card_id: "OP01-054",
  card_name: "X.Drake",
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
            filter: { cost_max: 4, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── 43. You Can Be My Samurai (OP01-055) — Main rest chars + draw ──────────
// [Main] You may rest 2 of your Characters: Draw 2 cards.

export const OP01_055_SAMURAI: EffectSchema = {
  card_id: "OP01-055",
  card_name: "You Can Be My Samurai!!",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_draw",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_CARDS", amount: 2 }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
      flags: { optional: true },
    },
  ],
};

// ─── 44. Demon Face (OP01-056) — Main KO rested ────────────────────────────
// [Main] K.O. up to 2 of your opponent's rested Characters with cost 5 or less.

export const OP01_056_DEMON_FACE: EffectSchema = {
  card_id: "OP01-056",
  card_name: "Demon Face",
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
            count: { up_to: 2 },
            filter: { cost_max: 5, is_rested: true },
          },
        },
      ],
    },
  ],
};

// ─── 45. Paradise Waterfall (OP01-057) ──────────────────────────────────────
// [Counter] +2000 then set active char
// [Trigger] KO rested cost≤4

export const OP01_057_PARADISE_WATERFALL: EffectSchema = {
  card_id: "OP01-057",
  card_name: "Paradise Waterfall",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_active",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_ACTIVE",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
          chain: "THEN",
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

// ─── 46. Punk Gibson (OP01-058) ─────────────────────────────────────────────
// [Counter] +4000 then rest opponent char cost≤4
// [Trigger] Rest opponent char

export const OP01_058_PUNK_GIBSON: EffectSchema = {
  card_id: "OP01-058",
  card_name: "Punk Gibson",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_rest",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 4 } },
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
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        },
      ],
    },
  ],
};

// ─── 47. Kaido Leader (OP01-061) — custom trigger ───────────────────────────
// [DON!! x1] [Your Turn] [Once Per Turn] When opponent's Character is KO'd, add DON + set active.

export const OP01_061_KAIDO_LEADER: EffectSchema = {
  card_id: "OP01-061",
  card_name: "Kaido",
  card_type: "Leader",
  effects: [
    {
      id: "on_opp_ko_add_don",
      category: "auto",
      trigger: {
        event: "OPPONENT_CHARACTER_KO",
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } }],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── 48. Miss Doublefinger (OP01-080) — On KO draw ─────────────────────────
// [On K.O.] Draw 1 card.

export const OP01_080_MISS_DOUBLEFINGER: EffectSchema = {
  card_id: "OP01-080",
  card_name: "Miss Doublefinger(Zala)",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── 49. Jinbe (OP01-071) — On Play + Trigger ──────────────────────────────
// [On Play] Place up to 1 Character cost≤3 at bottom of deck
// [Trigger] Play this card

export const OP01_071_JINBE: EffectSchema = {
  card_id: "OP01-071",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "on_play_bounce_to_deck",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 }, filter: { cost_max: 3 } },
          params: { position: "BOTTOM" },
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

// ─── 50. Donquixote Doflamingo (OP01-073) — Blocker + On Play scry ─────────
// [On Play] Look at 5 cards from the top of your deck and place them at the top or bottom in any order.

export const OP01_073_DOFLAMINGO: EffectSchema = {
  card_id: "OP01-073",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DECK_SCRY", params: { look_at: 5 } }],
    },
  ],
};

// ─── 51. Bartholomew Kuma (OP01-074) — Blocker + On KO play Pacifista ──────
// [On K.O.] Play up to 1 [Pacifista] with cost 4 or less from your hand.

export const OP01_074_KUMA: EffectSchema = {
  card_id: "OP01-074",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_play_pacifista",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Pacifista", cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── 52. Perona (OP01-077) — On Play scry ──────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck and place them at the top or bottom in any order.

export const OP01_077_PERONA: EffectSchema = {
  card_id: "OP01-077",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DECK_SCRY", params: { look_at: 5 } }],
    },
  ],
};

// ─── 53. Boa Hancock (OP01-078) — compound trigger draw ────────────────────
// [DON!! x1] [When Attacking]/[On Block] Draw 1 card if you have 5 or less cards in hand.

export const OP01_078_BOA_HANCOCK: EffectSchema = {
  card_id: "OP01-078",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "draw_on_attack_or_block",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING", don_requirement: 1 },
          { keyword: "ON_BLOCK", don_requirement: 1 },
        ],
      },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── 54. Kyoshirou (OP01-095) — On Play conditional draw ───────────────────
// [On Play] Draw 1 card if you have 8 or more DON!! cards on your field.

export const OP01_095_KYOSHIROU: EffectSchema = {
  card_id: "OP01-095",
  card_name: "Kyoshirou",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

// ─── 55. Queen (OP01-097) — On Play DON -1 + rush + debuff ─────────────────
// [On Play] DON!! −1: This Character gains [Rush] this turn. Then, -2000 opponent char.

export const OP01_097_QUEEN: EffectSchema = {
  card_id: "OP01-097",
  card_name: "Queen",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rush_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 56. Basil Hawkins (OP01-106) — On Play + Trigger ──────────────────────
// [On Play] Add up to 1 DON!! from DON!! deck and rest it.
// [Trigger] Play this card.

export const OP01_106_BASIL_HAWKINS: EffectSchema = {
  card_id: "OP01-106",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } }],
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── 57. Hitokiri Kamazo (OP01-108) — On KO DON-1 + KO ────────────────────
// [On K.O.] DON!! −1: K.O. up to 1 of your opponent's Characters with cost 5 or less.

export const OP01_108_HITOKIRI_KAMAZO: EffectSchema = {
  card_id: "OP01-108",
  card_name: "Hitokiri Kamazo",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 5 } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 58. Holedem (OP01-113) — On KO add DON ────────────────────────────────
// [On K.O.] Add up to 1 DON!! card from your DON!! deck and rest it.

export const OP01_113_HOLEDEM: EffectSchema = {
  card_id: "OP01-113",
  card_name: "Holedem",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_add_don",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } }],
    },
  ],
};

// ─── 59. Ulti (OP01-093) — On Play DON rest + add DON ──────────────────────
// [On Play] ① : Add up to 1 DON!! from DON!! deck and rest it.

export const OP01_093_ULTI: EffectSchema = {
  card_id: "OP01-093",
  card_name: "Ulti",
  card_type: "Character",
  effects: [
    {
      id: "on_play_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } }],
      flags: { optional: true },
    },
  ],
};

// ─── 60. Elephant's Marchoo (OP01-115) — Main KO + add DON + Trigger ───────
// [Main] KO cost≤2, then add DON active
// [Trigger] Activate main

export const OP01_115_ELEPHANTS_MARCHOO: EffectSchema = {
  card_id: "OP01-115",
  card_name: "Elephant's Marchoo",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_add_don",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 2 } },
        },
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
          chain: "THEN",
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

// ─── 61. Thunder Bagua (OP01-119) — Counter + conditional DON ───────────────
// [Counter] +4000 then if 2 or less life add DON rested
// [Trigger] Add DON active

export const OP01_119_THUNDER_BAGUA: EffectSchema = {
  card_id: "OP01-119",
  card_name: "Thunder Bagua",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_don",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
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
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } }],
    },
  ],
};

// ─── 62. Ulti-Mortar (OP01-118) — Counter DON-2 + draw, Trigger add DON ────
// [Counter] DON!! −2: +2000 then draw 1
// [Trigger] Add DON active

export const OP01_118_ULTI_MORTAR: EffectSchema = {
  card_id: "OP01-118",
  card_name: "Ulti-Mortar",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_draw",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_add_don",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE" } }],
    },
  ],
};

// ─── 63. Overheat (OP01-086) — Counter + return active char, Trigger return ─
// [Counter] +4000 then return active char cost≤3
// [Trigger] Return char cost≤4

export const OP01_086_OVERHEAT: EffectSchema = {
  card_id: "OP01-086",
  card_name: "Overheat",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_bounce",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "RETURN_TO_HAND",
          target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 }, filter: { cost_max: 3, is_active: true } },
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
          target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 }, filter: { cost_max: 4 } },
        },
      ],
    },
  ],
};

// ─── 64. Desert Spada (OP01-088) — Counter + scry, Trigger draw/trash ───────
// [Counter] +2000 then look at 3 arrange
// [Trigger] Draw 2 trash 1

export const OP01_088_DESERT_SPADA: EffectSchema = {
  card_id: "OP01-088",
  card_name: "Desert Spada",
  card_type: "Event",
  effects: [
    {
      id: "counter_boost_scry",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        { type: "DECK_SCRY", params: { look_at: 3 }, chain: "THEN" },
      ],
    },
    {
      id: "trigger_draw_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
      ],
    },
  ],
};

// ─── 65. Baroque Works (OP01-090) — Main search ────────────────────────────
// [Main] Look at 5, search Baroque Works card

export const OP01_090_BAROQUE_WORKS: EffectSchema = {
  card_id: "OP01-090",
  card_name: "Baroque Works",
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
            filter: { traits: ["Baroque Works"], exclude_name: "Baroque Works" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── 66. Shanks (OP01-120) — Rush + When Attacking blocker restriction ──────
// [When Attacking] Opponent cannot activate Blocker with 2000 or less power this battle.

export const OP01_120_SHANKS: EffectSchema = {
  card_id: "OP01-120",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_no_blocker",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
            scope: { controller: "OPPONENT", filter: { power_max: 2000 } },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── 67. Yamato (OP01-121) — Name alias + Double Attack + Banish ────────────

export const OP01_121_YAMATO: EffectSchema = {
  card_id: "OP01-121",
  card_name: "Yamato",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "NAME_ALIAS", aliases: ["Kouzuki Oden"] },
  ],
  effects: [],
};

// ─── 68. X.Drake (OP01-114) — On Play DON -1 opponent trash ────────────────
// [On Play] DON!! −1: Your opponent trashes 1 card from their hand.

export const OP01_114_XDRAKE: EffectSchema = {
  card_id: "OP01-114",
  card_name: "X.Drake",
  card_type: "Character",
  effects: [
    {
      id: "on_play_opponent_discard",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
              params: { amount: 1 },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 69. Jack (OP01-102) — When Attacking DON -1 opponent discard ───────────
// [When Attacking] DON!! −1: Your opponent trashes 1 card from their hand.

export const OP01_102_JACK: EffectSchema = {
  card_id: "OP01-102",
  card_name: "Jack",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_discard",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
              params: { amount: 1 },
            },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 70. Sasaki (OP01-101) — DON!!x1 When Attacking trash + add DON ────────
// [DON!! x1] [When Attacking] You may trash 1 card from hand: Add DON rested.

export const OP01_101_SASAKI: EffectSchema = {
  card_id: "OP01-101",
  card_name: "Sasaki",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_trash_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED" } }],
      flags: { optional: true },
    },
  ],
};

// ─── 71. King OP01-096 — On Play DON -2 dual KO ────────────────────────────
// [On Play] DON!! −2: KO cost≤3 AND KO cost≤2

export const OP01_096_KING: EffectSchema = {
  card_id: "OP01-096",
  card_name: "King",
  card_type: "Character",
  effects: [
    {
      id: "on_play_dual_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 3 } },
        },
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 2 } },
          chain: "AND",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 72. Denjiro (OP01-046) — DON!!x1 When Attacking + leader cond ─────────
// [DON!! x1] [When Attacking] If leader is Oden, set 2 DON active.

export const OP01_046_DENJIRO: EffectSchema = {
  card_id: "OP01-046",
  card_name: "Denjiro",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_don_active",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Kouzuki Oden" },
      },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 2 } }],
    },
  ],
};

// ─── 73. Alvida (OP01-064) — DON!!x1 When Attacking trash + bounce ─────────
// [DON!! x1] [When Attacking] You may trash 1 card from hand: Return opponent char cost≤3.

export const OP01_064_ALVIDA: EffectSchema = {
  card_id: "OP01-064",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_bounce",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 3 } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 74. Sheep's Horn (OP01-117) — Main DON -1 rest ────────────────────────
// [Main] DON!! −1: Rest up to 1 of your opponent's Characters with cost 6 or less.

export const OP01_117_SHEEPS_HORN: EffectSchema = {
  card_id: "OP01-117",
  card_name: "Sheep's Horn",
  card_type: "Event",
  effects: [
    {
      id: "main_rest",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 6 } },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 75. Smiley (OP01-072) — PER_COUNT dynamic power ────────────────────────
// [DON!! x1] [Your Turn] This Character gains +1000 power for every card in your hand.

export const OP01_072_SMILEY: EffectSchema = {
  card_id: "OP01-072",
  card_name: "Smiley",
  card_type: "Character",
  effects: [
    {
      id: "dynamic_hand_power",
      category: "permanent",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: { type: "PER_COUNT", source: "HAND_COUNT", multiplier: 1000 } },
        },
      ],
    },
  ],
};

// ─── 76. Mr.1 (OP01-083) — PER_COUNT with divisor ──────────────────────────
// [DON!! x1] [Your Turn] If leader has Baroque Works, +1000 per 2 Events in trash.

export const OP01_083_MR1: EffectSchema = {
  card_id: "OP01-083",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "dynamic_event_trash_power",
      category: "permanent",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Baroque Works" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: { type: "PER_COUNT", source: "EVENTS_IN_TRASH", multiplier: 1000, divisor: 2 } },
        },
      ],
    },
  ],
};

// ─── 77. Caesar Clown (OP01-069) — SEARCH_AND_PLAY from deck ───────────────
// [On K.O.] Play up to 1 [Smiley] from your deck, then shuffle your deck.

export const OP01_069_CAESAR_CLOWN: EffectSchema = {
  card_id: "OP01-069",
  card_name: "Caesar Clown",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_search_play",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            search_full_deck: true,
            filter: { name: "Smiley" },
            shuffle_after: true,
          },
        },
      ],
    },
  ],
};

// ─── 78. Kurozumi Orochi (OP01-098) — Full deck search + add to hand ───────
// [On Play] Reveal up to 1 [Artificial Devil Fruit SMILE] from your deck and add it to your hand. Then, shuffle.

export const OP01_098_OROCHI: EffectSchema = {
  card_id: "OP01-098",
  card_name: "Kurozumi Orochi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_full_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "FULL_DECK_SEARCH",
          params: {
            pick: { up_to: 1 },
            filter: { name: "Artificial Devil Fruit SMILE" },
            shuffle_after: true,
          },
        },
      ],
    },
  ],
};

// ─── 79. Artificial Devil Fruit SMILE (OP01-116) — SEARCH_AND_PLAY ─────────
// [Main] Look at 5 cards from the top of your deck; play up to 1 {SMILE} type Character cost≤3.
// [Trigger] Activate this card's [Main] effect.

export const OP01_116_SMILE: EffectSchema = {
  card_id: "OP01-116",
  card_name: "Artificial Devil Fruit SMILE",
  card_type: "Event",
  effects: [
    {
      id: "main_search_play",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 5,
            filter: { traits: ["SMILE"], card_type: "CHARACTER", cost_max: 3 },
            rest_destination: "BOTTOM",
          },
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

// ─── 80. Ms. All Sunday (OP01-079) — On KO + trash recovery ────────────────
// [On K.O.] If leader has Baroque Works, add up to 1 Event from trash to hand.

export const OP01_079_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP01-079",
  card_name: "Ms. All Sunday",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_recover_event",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Baroque Works" },
      },
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

// ─── 81. Mr.2.Bon.Kurei (OP01-084) — DON!!x1 When Attacking search Event ──
// [DON!! x1] [When Attacking] Look at 5, search Baroque Works Event.

export const OP01_084_MR2: EffectSchema = {
  card_id: "OP01-084",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_search_event",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Baroque Works"], card_type: "EVENT" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── 82. Who's.Who (OP01-109) — Conditional permanent +1000 ────────────────
// [DON!! x1] [Your Turn] If 8+ DON on field, +1000 power.

export const OP01_109_WHOS_WHO: EffectSchema = {
  card_id: "OP01-109",
  card_name: "Who's.Who",
  card_type: "Character",
  effects: [
    {
      id: "conditional_don_buff",
      category: "permanent",
      trigger: {
        keyword: "WHEN_ATTACKING",
        don_requirement: 1,
        turn_restriction: "YOUR_TURN",
      },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
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

// ─── 83. Black Maria (OP01-111) — Blocker + On Block DON-1 buff ────────────
// [On Block] DON!! −1: This Character gains +1000 power during this turn.

export const OP01_111_BLACK_MARIA: EffectSchema = {
  card_id: "OP01-111",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    {
      id: "on_block_buff",
      category: "auto",
      trigger: { keyword: "ON_BLOCK" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── 84. Page One (OP01-112) — Activate:Main DON-1 can attack active ───────
// [Activate: Main] [Once Per Turn] DON!! −1: This Character can attack active this turn.

export const OP01_112_PAGE_ONE: EffectSchema = {
  card_id: "OP01-112",
  card_name: "Page One",
  card_type: "Character",
  effects: [
    {
      id: "activate_can_attack_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "CAN_ATTACK_ACTIVE" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── 85. Officer Agents (OP01-087) — Counter play + Trigger reuse ───────────
// [Counter] Play up to 1 Baroque Works char cost≤3 from hand.
// [Trigger] Activate counter.

export const OP01_087_OFFICER_AGENTS: EffectSchema = {
  card_id: "OP01-087",
  card_name: "Officer Agents",
  card_type: "Event",
  effects: [
    {
      id: "counter_play",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", traits: ["Baroque Works"], cost_max: 3 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "trigger_reuse",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "COUNTER" } }],
    },
  ],
};

// ─── 86. Crescent Cutlass (OP01-089) — Counter conditional bounce ───────────
// [Counter] If leader has Seven Warlords, return char cost≤5 to hand.

export const OP01_089_CRESCENT_CUTLASS: EffectSchema = {
  card_id: "OP01-089",
  card_name: "Crescent Cutlass",
  card_type: "Event",
  effects: [
    {
      id: "counter_bounce",
      category: "auto",
      trigger: { keyword: "COUNTER" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Seven Warlords of the Sea" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 }, filter: { cost_max: 5 } },
        },
      ],
    },
  ],
};

// ─── 87. Mr.3 (OP01-085) — On Play prohibition ─────────────────────────────
// [On Play] If leader Baroque Works, select opponent char cost≤4. Cannot attack until end opponent next turn.

export const OP01_085_MR3: EffectSchema = {
  card_id: "OP01-085",
  card_name: "Mr.3(Galdino)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_prohibit_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Baroque Works" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 4 } },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── 88. Shachi (OP01-044) — Negative existence + play ─────────────────────
// [Blocker]
// [On Play] If you don't have [Penguin], play up to 1 [Penguin] from your hand.

export const OP01_044_SHACHI: EffectSchema = {
  card_id: "OP01-044",
  card_name: "Shachi",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_penguin",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { name: "Penguin" },
        },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Penguin" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── 89. Penguin (OP01-050) — Negative existence + play ────────────────────
// [Blocker]
// [On Play] If you don't have [Shachi], play up to 1 [Shachi] from your hand.

export const OP01_050_PENGUIN: EffectSchema = {
  card_id: "OP01-050",
  card_name: "Penguin",
  card_type: "Character",
  effects: [
    {
      id: "on_play_play_shachi",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { name: "Shachi" },
        },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Shachi" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── 90. Gecko Moria (OP01-068) — WHILE_CONDITION keyword grant ────────────
// [Your Turn] This Character gains [Double Attack] if you have 5 or more cards in your hand.

export const OP01_068_GECKO_MORIA: EffectSchema = {
  card_id: "OP01-068",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "conditional_double_attack",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 5 },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 5 },
      },
    },
  ],
};

// ─── 91. King (OP01-091) — Conditional opponent aura ────────────────────────
// [Your Turn] If you have 10 DON!! cards on your field, give all opponent Characters −1000 power.

export const OP01_091_KING: EffectSchema = {
  card_id: "OP01-091",
  card_name: "King",
  card_type: "Character",
  effects: [
    {
      id: "conditional_opponent_debuff",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS", controller: "SELF" },
          params: { amount: -1000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 10 },
          },
        },
      ],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 10 },
      },
    },
  ],
};

// ─── 92. Kurozumi Semimaru (OP01-099) — Proxy protection ───────────────────
// {Kurozumi Clan} type Characters other than your [Kurozumi Semimaru] cannot be K.O.'d in battle.

export const OP01_099_SEMIMARU: EffectSchema = {
  card_id: "OP01-099",
  card_name: "Kurozumi Semimaru",
  card_type: "Character",
  effects: [
    {
      id: "proxy_ko_protection",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: {
            cause: "BATTLE",
            filter: { traits: ["Kurozumi Clan"], exclude_name: "Kurozumi Semimaru" },
          },
          duration: { type: "PERMANENT" },
        },
      ],
      duration: { type: "PERMANENT" },
    },
  ],
};

// ─── 93. Bao Huang (OP01-105) — Blind hand reveal ─────────────────────────
// [On Play] Choose 2 cards from your opponent's hand; your opponent reveals those cards.

export const OP01_105_BAO_HUANG: EffectSchema = {
  card_id: "OP01-105",
  card_name: "Bao Huang",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_hand",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "REVEAL_HAND",
          target: { controller: "OPPONENT" },
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── Card Schema Registry ───────────────────────────────────────────────────

export const OP01_SCHEMAS: Record<string, EffectSchema> = {
  "OP01-001": OP01_001_RORONOA_ZORO,
  "OP01-002": OP01_002_TRAFALGAR_LAW,
  "OP01-003": OP01_003_MONKEY_D_LUFFY,
  "OP01-004": OP01_004_USOPP,
  "OP01-005": OP01_005_UTA,
  "OP01-006": OP01_006_OTAMA,
  "OP01-007": OP01_007_CARIBOU,
  "OP01-008": OP01_008_CAVENDISH,
  "OP01-009": OP01_009_CARROT,
  "OP01-011": OP01_011_GORDON,
  "OP01-013": OP01_013_SANJI,
  "OP01-014": OP01_014_JINBE,
  "OP01-015": OP01_015_CHOPPER,
  "OP01-016": OP01_016_NAMI,
  "OP01-017": OP01_017_NICO_ROBIN,
  "OP01-019": OP01_019_BARTOLOMEO,
  "OP01-020": OP01_020_HYOGORO,
  "OP01-021": OP01_021_FRANKY,
  "OP01-022": OP01_022_BROOK,
  "OP01-024": OP01_024_LUFFY,
  "OP01-026": OP01_026_RED_HAWK,
  "OP01-027": OP01_027_ROUND_TABLE,
  "OP01-028": OP01_028_GREEN_STAR,
  "OP01-029": OP01_029_RADICAL_BEAM,
  "OP01-030": OP01_030_IN_TWO_YEARS,
  "OP01-031": OP01_031_ODEN,
  "OP01-032": OP01_032_ASHURA_DOJI,
  "OP01-033": OP01_033_IZO,
  "OP01-034": OP01_034_INUARASHI,
  "OP01-035": OP01_035_OKIKU,
  "OP01-038": OP01_038_KANJURO,
  "OP01-039": OP01_039_KILLER,
  "OP01-040": OP01_040_KINEMON,
  "OP01-046": OP01_046_DENJIRO,
  "OP01-047": OP01_047_TRAFALGAR_LAW,
  "OP01-048": OP01_048_NEKOMAMUSHI,
  "OP01-049": OP01_049_BEPO,
  "OP01-051": OP01_051_EUSTASS_KID,
  "OP01-052": OP01_052_RAIZO,
  "OP01-054": OP01_054_XDRAKE,
  "OP01-055": OP01_055_SAMURAI,
  "OP01-056": OP01_056_DEMON_FACE,
  "OP01-057": OP01_057_PARADISE_WATERFALL,
  "OP01-058": OP01_058_PUNK_GIBSON,
  "OP01-061": OP01_061_KAIDO_LEADER,
  "OP01-064": OP01_064_ALVIDA,
  "OP01-070": OP01_070_MIHAWK,
  "OP01-071": OP01_071_JINBE,
  "OP01-073": OP01_073_DOFLAMINGO,
  "OP01-074": OP01_074_KUMA,
  "OP01-075": OP01_075_PACIFISTA,
  "OP01-077": OP01_077_PERONA,
  "OP01-078": OP01_078_BOA_HANCOCK,
  "OP01-080": OP01_080_MISS_DOUBLEFINGER,
  "OP01-086": OP01_086_OVERHEAT,
  "OP01-088": OP01_088_DESERT_SPADA,
  "OP01-090": OP01_090_BAROQUE_WORKS,
  "OP01-093": OP01_093_ULTI,
  "OP01-094": OP01_094_KAIDO,
  "OP01-095": OP01_095_KYOSHIROU,
  "OP01-096": OP01_096_KING,
  "OP01-097": OP01_097_QUEEN,
  "OP01-101": OP01_101_SASAKI,
  "OP01-102": OP01_102_JACK,
  "OP01-106": OP01_106_BASIL_HAWKINS,
  "OP01-108": OP01_108_HITOKIRI_KAMAZO,
  "OP01-113": OP01_113_HOLEDEM,
  "OP01-114": OP01_114_XDRAKE,
  "OP01-115": OP01_115_ELEPHANTS_MARCHOO,
  "OP01-117": OP01_117_SHEEPS_HORN,
  "OP01-118": OP01_118_ULTI_MORTAR,
  "OP01-119": OP01_119_THUNDER_BAGUA,
  "OP01-120": OP01_120_SHANKS,
  "OP01-121": OP01_121_YAMATO,
  "OP01-069": OP01_069_CAESAR_CLOWN,
  "OP01-072": OP01_072_SMILEY,
  "OP01-079": OP01_079_MS_ALL_SUNDAY,
  "OP01-083": OP01_083_MR1,
  "OP01-084": OP01_084_MR2,
  "OP01-085": OP01_085_MR3,
  "OP01-087": OP01_087_OFFICER_AGENTS,
  "OP01-089": OP01_089_CRESCENT_CUTLASS,
  "OP01-098": OP01_098_OROCHI,
  "OP01-109": OP01_109_WHOS_WHO,
  "OP01-111": OP01_111_BLACK_MARIA,
  "OP01-112": OP01_112_PAGE_ONE,
  "OP01-116": OP01_116_SMILE,
  "OP01-044": OP01_044_SHACHI,
  "OP01-050": OP01_050_PENGUIN,
  "OP01-068": OP01_068_GECKO_MORIA,
  "OP01-091": OP01_091_KING,
  "OP01-099": OP01_099_SEMIMARU,
  "OP01-105": OP01_105_BAO_HUANG,
};
