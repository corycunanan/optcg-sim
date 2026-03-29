/**
 * M4 Effect Schema — OP01 Card Encodings
 *
 * Red (Straw Hat Crew / Supernovas): OP01-001 through OP01-030
 * Green (Land of Wano / Supernovas): OP01-031 through OP01-059
 * Blue (The Seven Warlords of the Sea): OP01-060 through OP01-090
 * Purple (Animal Kingdom Pirates): OP01-091 through OP01-121
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Straw Hat Crew / Supernovas (OP01-001 to OP01-030)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP01-001 Roronoa Zoro (Leader) — DON!! x1 Your Turn aura
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

// ─── OP01-002 Trafalgar Law (Leader) — Activate:Main
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
        filter: { card_type: "CHARACTER" },
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
            filter: { card_type: "CHARACTER", cost_max: 5, color_not_matching_ref: "returned_char" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── OP01-003 Monkey.D.Luffy (Leader) — Activate:Main
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

// ─── OP01-004 Usopp — DON!! x1 custom trigger
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

// ─── OP01-005 Uta — ON_PLAY + trash search
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

// ─── OP01-006 Otama — ON_PLAY + MODIFY_POWER negative
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

// ─── OP01-007 Caribou — ON_KO + KO action
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

// ─── OP01-008 Cavendish — ON_PLAY + cost (life to hand) + GRANT_KEYWORD
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
        { type: "LIFE_TO_HAND", amount: 1 },
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

// ─── OP01-009 Carrot — Trigger: play this card

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

// ─── OP01-011 Gordon — ON_PLAY + cost (hand to deck) + DRAW
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

// ─── OP01-013 Sanji — Activate:Main + life cost + buff + give DON
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

// ─── OP01-014 Jinbe — BLOCKER keyword + DON!! x1 ON_BLOCK + PLAY_CARD
// [Blocker]
// [DON!! x1] [On Block] Play up to 1 red Character card with a cost of
// 2 or less from your hand.

export const OP01_014_JINBE: EffectSchema = {
  card_id: "OP01-014",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "OP01_014_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-015 Tony Tony.Chopper — DON!!x1 When Attacking + cost
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

// ─── OP01-016 Nami — ON_PLAY + SEARCH_DECK
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

// ─── OP01-017 Nico Robin — DON!! x1 + WHEN_ATTACKING + KO
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

// ─── OP01-019 Bartolomeo — DON!!x2 permanent power boost
// [DON!! x2] [Opponent's Turn] This Character gains +3000 power.

export const OP01_019_BARTOLOMEO: EffectSchema = {
  card_id: "OP01-019",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "OP01_019_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-020 Hyogoro — ACTIVATE_MAIN + REST_SELF cost + MODIFY_POWER
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

// ─── OP01-021 Franky — DON!!x1 can attack active
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

// ─── OP01-022 Brook — DON!!x1 When Attacking -2000 to 2
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

// ─── OP01-024 Monkey.D.Luffy — DON!!x2 prohibition + Activate
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
          scope: { cause: "BATTLE", source_filter: { attribute: "STRIKE" } },
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

// ─── OP01-025 Roronoa Zoro — Rush keyword
// [Rush] (This card can attack on the turn in which it is played.)

export const OP01_025_RORONOA_ZORO: EffectSchema = {
  card_id: "OP01-025",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP01_025_keywords",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
  ],
};

// ─── OP01-026 Gum-Gum Fire-Fist Pistol Red Hawk
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-027 Round Table
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

// ─── OP01-028 Green Star Rafflesia
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
      trigger: { keyword: "COUNTER_EVENT" },
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
      actions: [{ type: "REUSE_EFFECT", params: { target_effect: "COUNTER_EVENT" } }],
    },
  ],
};

// ─── OP01-029 Radical Beam!! — COUNTER + MODIFY_POWER + conditional chain
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

// ─── OP01-030 In Two Years!! At the Sabaody Archipelago!!
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

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Land of Wano / Supernovas (OP01-031 to OP01-059)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP01-031 Kouzuki Oden (Leader) — ACTIVATE_MAIN + once_per_turn +
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

// ─── OP01-032 Ashura Doji — conditional power
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

// ─── OP01-033 Izo — ON_PLAY + SET_REST on opponent
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

// ─── OP01-034 Inuarashi — DON!!x2 When Attacking set DON active
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

// ─── OP01-035 Okiku — DON!! x1 + WHEN_ATTACKING + once_per_turn + SET_REST
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

// ─── OP01-038 Kanjuro — dual trigger
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

// ─── OP01-039 Killer — Blocker + DON!!x1 On Block draw
// [DON!! x1] [On Block] If you have 3 or more Characters, draw 1 card.

export const OP01_039_KILLER: EffectSchema = {
  card_id: "OP01-039",
  card_name: "Killer",
  card_type: "Character",
  effects: [
    {
      id: "OP01_039_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-040 Kin'emon — On Play + When Attacking
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

// ─── OP01-041 Kouzuki Momonosuke — Activate:Main + DON_REST + REST_SELF + search
// [Activate: Main] ➀ You may rest this Character: Look at 5 cards from the top of your deck;
// reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at
// the bottom of your deck in any order.

export const OP01_041_MOMONOSUKE: EffectSchema = {
  card_id: "OP01-041",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "activate_search_wano",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Land of Wano"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP01-042 Komurasaki — On Play + DON_REST cost + leader condition + SET_ACTIVE
// [On Play] ③: If your Leader is [Kouzuki Oden], set up to 1 of your {Land of Wano} type
// Character cards with a cost of 3 or less as active.

export const OP01_042_KOMURASAKI: EffectSchema = {
  card_id: "OP01-042",
  card_name: "Komurasaki",
  card_type: "Character",
  effects: [
    {
      id: "on_play_set_active_wano",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 3 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Kouzuki Oden" },
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"], cost_max: 3 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP01-044 Shachi — Negative existence + play
// [Blocker]
// [On Play] If you don't have [Penguin], play up to 1 [Penguin] from your hand.

export const OP01_044_SHACHI: EffectSchema = {
  card_id: "OP01-044",
  card_name: "Shachi",
  card_type: "Character",
  effects: [
    {
      id: "OP01_044_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-046 Denjiro — DON!!x1 When Attacking + leader cond
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

// ─── OP01-047 Trafalgar Law — ON_PLAY + cost (return own char) + PLAY_CARD
// [Blocker]
// [On Play] You may return 1 Character to your hand: Play up to 1
// Character card with a cost of 3 or less from your hand.

export const OP01_047_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP01-047",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "OP01_047_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-048 Nekomamushi — On Play rest
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

// ─── OP01-049 Bepo — DON!!x1 When Attacking play from hand
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

// ─── OP01-050 Penguin — Negative existence + play
// [Blocker]
// [On Play] If you don't have [Shachi], play up to 1 [Shachi] from your hand.

export const OP01_050_PENGUIN: EffectSchema = {
  card_id: "OP01-050",
  card_name: "Penguin",
  card_type: "Character",
  effects: [
    {
      id: "OP01_050_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-051 Eustass"Captain"Kid — Permanent prohibition +
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
      category: "auto",
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

// ─── OP01-052 Raizo — WHEN_ATTACKING + once_per_turn + condition + DRAW
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

// ─── OP01-054 X.Drake — On Play KO rested
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

// ─── OP01-055 You Can Be My Samurai!! — Main rest chars + draw
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

// ─── OP01-056 Demon Face — Main KO rested
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

// ─── OP01-057 Paradise Waterfall
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-058 Punk Gibson
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-059 BE-BENG!! — Main + trash cost + SET_ACTIVE
// [Main] You may trash 1 {Land of Wano} type card from your hand: Set up to 1 of your
// {Land of Wano} type Character cards with a cost of 3 or less as active.

export const OP01_059_BE_BENG: EffectSchema = {
  card_id: "OP01-059",
  card_name: "BE-BENG!!",
  card_type: "Event",
  effects: [
    {
      id: "main_set_active_wano",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Land of Wano"] } },
      ],
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"], cost_max: 3 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — The Seven Warlords of the Sea (OP01-060 to OP01-090)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP01-060 Donquixote Doflamingo (Leader) — When Attacking reveal conditional play
// [DON!! x2] [When Attacking] ➀: Reveal 1 card from the top of your deck. If that card is a
// {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested.

export const OP01_060_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP01-060",
  card_name: "Donquixote Doflamingo",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_reveal_play",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [{ type: "DON_REST", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "PLAY_CARD",
          target: { type: "SELECTED_CARDS", ref: "revealed" },
          params: { source_zone: "DECK", cost_override: "FREE", entry_state: "RESTED" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits: ["The Seven Warlords of the Sea"], card_type: "CHARACTER", cost_max: 4 },
          },
        },
      ],
    },
  ],
};

// ─── OP01-061 Kaido (Leader) — custom trigger
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

// ─── OP01-062 Crocodile (Leader) — DON!!×1 draw on event activation
// [DON!! x1] When you activate an Event, you may draw 1 card if you have 4 or
// less cards in your hand and haven't drawn a card using this Leader's effect
// during this turn.
// NOTE: "haven't drawn using this Leader's effect" approximated as once_per_turn.

export const OP01_062_CROCODILE: EffectSchema = {
  card_id: "OP01-062",
  card_name: "Crocodile",
  card_type: "Leader",
  effects: [
    {
      id: "OP01-062_event_draw",
      category: "auto",
      trigger: {
        event: "EVENT_ACTIVATED",
        filter: { controller: "SELF" },
        don_requirement: 1,
        once_per_turn: true,
      },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
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

// ─── OP01-063 Arlong (Character) — DON!!×1 Activate rest self to reveal opponent hand + conditional life removal
// [DON!! x1] [Activate: Main] You may rest this Character: Choose 1 card from your
// opponent's hand; your opponent reveals that card. If the revealed card is an Event,
// place up to 1 card from your opponent's Life area at the bottom of the owner's deck.

export const OP01_063_ARLONG: EffectSchema = {
  card_id: "OP01-063",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "OP01-063_activate_reveal_conditional",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "REVEAL_HAND",
          target: { controller: "OPPONENT" },
          params: { amount: 1 },
          result_ref: "revealed",
        },
        {
          type: "LIFE_CARD_TO_DECK",
          target: { type: "OPPONENT_LIFE", controller: "OPPONENT" },
          params: { amount: 1, position: "BOTTOM" },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { card_type: "EVENT" },
          },
        },
      ],
    },
  ],
};

// ─── OP01-064 Alvida — DON!!x1 When Attacking trash + bounce
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

// ─── OP01-067 Crocodile (Character) — Banish + DON!!×1 hand cost reduction for blue Events
// [Banish]
// [DON!! x1] Give blue Events in your hand −1 cost.

export const OP01_067_CROCODILE: EffectSchema = {
  card_id: "OP01-067",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "OP01-067_banish",
      category: "permanent",
      flags: { keywords: ["BANISH"] },
    },
    {
      id: "OP01-067_hand_cost_reduction_aura",
      category: "permanent",
      // zone defaults to FIELD — active while Crocodile is on field
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            filter: { color: "BLUE", card_type: "EVENT" },
          },
          params: { amount: -1 },
        },
      ],
    },
  ],
};

// ─── OP01-068 Gecko Moria — WHILE_CONDITION keyword grant
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

// ─── OP01-069 Caesar Clown — SEARCH_AND_PLAY from deck
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

// ─── OP01-070 Dracule Mihawk — ON_PLAY + RETURN_TO_DECK
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

// ─── OP01-071 Jinbe — On Play + Trigger
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

// ─── OP01-072 Smiley — PER_COUNT dynamic power
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
          params: { amount: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } },
        },
      ],
    },
  ],
};

// ─── OP01-073 Donquixote Doflamingo — Blocker + On Play scry
// [On Play] Look at 5 cards from the top of your deck and place them at the top or bottom in any order.

export const OP01_073_DOFLAMINGO: EffectSchema = {
  card_id: "OP01-073",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "OP01_073_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DECK_SCRY", params: { look_at: 5 } }],
    },
  ],
};

// ─── OP01-074 Bartholomew Kuma — Blocker + On KO play Pacifista
// [On K.O.] Play up to 1 [Pacifista] with cost 4 or less from your hand.

export const OP01_074_KUMA: EffectSchema = {
  card_id: "OP01-074",
  card_name: "Bartholomew Kuma",
  card_type: "Character",
  effects: [
    {
      id: "OP01_074_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-075 Pacifista — Rule mod: COPY_LIMIT_OVERRIDE + BLOCKER
// Under the rules of this game, you may have any number of this card in your deck.
// [Blocker]

export const OP01_075_PACIFISTA: EffectSchema = {
  card_id: "OP01-075",
  card_name: "Pacifista",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
  effects: [
    {
      id: "OP01_075_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP01-077 Perona — On Play scry
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

// ─── OP01-078 Boa Hancock — compound trigger draw
// [DON!! x1] [When Attacking]/[On Block] Draw 1 card if you have 5 or less cards in hand.

export const OP01_078_BOA_HANCOCK: EffectSchema = {
  card_id: "OP01-078",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "OP01_078_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-079 Ms. All Sunday — On KO + trash recovery
// [On K.O.] If leader has Baroque Works, add up to 1 Event from trash to hand.

export const OP01_079_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP01-079",
  card_name: "Ms. All Sunday",
  card_type: "Character",
  effects: [
    {
      id: "OP01_079_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-080 Miss Doublefinger — On KO draw
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

// ─── OP01-083 Mr.1(Daz.Bonez) — PER_COUNT with divisor
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

// ─── OP01-084 Mr.2.Bon.Kurei(Bentham) — DON!!x1 When Attacking search Event
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

// ─── OP01-085 Mr.3(Galdino) — On Play prohibition
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

// ─── OP01-086 Overheat — Counter + return active char, Trigger return
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-087 Officer Agents — Counter play + Trigger reuse
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
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            count: { up_to: 1 },
            source_zone: "HAND",
            filter: { traits: ["Baroque Works"], cost_max: 3 },
          },
          params: { cost_override: "FREE" },
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

// ─── OP01-088 Desert Spada — Counter + scry, Trigger draw/trash
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-089 Crescent Cutlass — Counter conditional bounce
// [Counter] If leader has Seven Warlords, return char cost≤5 to hand.

export const OP01_089_CRESCENT_CUTLASS: EffectSchema = {
  card_id: "OP01-089",
  card_name: "Crescent Cutlass",
  card_type: "Event",
  effects: [
    {
      id: "counter_bounce",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-090 Baroque Works — Main search
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

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Animal Kingdom Pirates (OP01-091 to OP01-121)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP01-091 King — Conditional opponent aura
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

// ─── OP01-093 Ulti — On Play DON rest + add DON
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

// ─── OP01-094 Kaido — ON_PLAY + DON_MINUS cost + leader condition +
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

// ─── OP01-095 Kyoshirou — On Play conditional draw
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

// ─── OP01-096 King — On Play DON -2 dual KO
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

// ─── OP01-097 Queen — On Play DON -1 + rush + debuff
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

// ─── OP01-098 Kurozumi Orochi — Full deck search + add to hand
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

// ─── OP01-099 Kurozumi Semimaru — Proxy protection
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
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: { traits: ["Kurozumi Clan"], exclude_name: "Kurozumi Semimaru" },
          },
          scope: { cause: "BATTLE" },
          duration: { type: "PERMANENT" },
        },
      ],
      duration: { type: "PERMANENT" },
    },
  ],
};

// ─── OP01-100 Kurozumi Higurashi — Blocker keyword
// [Blocker] (After your opponent declares an attack, you may rest this card to make it the
// new target of the attack.)

export const OP01_100_HIGURASHI: EffectSchema = {
  card_id: "OP01-100",
  card_name: "Kurozumi Higurashi",
  card_type: "Character",
  effects: [
    {
      id: "OP01_100_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP01-101 Sasaki — DON!!x1 When Attacking trash + add DON
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

// ─── OP01-102 Jack — When Attacking DON -1 opponent discard
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

// ─── OP01-105 Bao Huang — Blind hand reveal
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

// ─── OP01-106 Basil Hawkins — On Play + Trigger
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

// ─── OP01-108 Hitokiri Kamazo — On KO DON-1 + KO
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

// ─── OP01-109 Who's.Who — Conditional permanent +1000
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

// ─── OP01-111 Black Maria — Blocker + On Block DON-1 buff
// [On Block] DON!! −1: This Character gains +1000 power during this turn.

export const OP01_111_BLACK_MARIA: EffectSchema = {
  card_id: "OP01-111",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    {
      id: "OP01_111_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
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

// ─── OP01-112 Page One — Activate:Main DON-1 can attack active
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

// ─── OP01-113 Holedem — On KO add DON
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

// ─── OP01-114 X.Drake — On Play DON -1 opponent trash
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

// ─── OP01-115 Elephant's Marchoo — Main KO + add DON + Trigger
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

// ─── OP01-116 Artificial Devil Fruit SMILE — SEARCH_AND_PLAY
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

// ─── OP01-117 Sheep's Horn — Main DON -1 rest
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

// ─── OP01-118 Ulti-Mortar — Counter DON-2 + draw, Trigger add DON
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-119 Thunder Bagua — Counter + conditional DON
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
      trigger: { keyword: "COUNTER_EVENT" },
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

// ─── OP01-120 Shanks — Rush + When Attacking blocker restriction
// [When Attacking] Opponent cannot activate Blocker with 2000 or less power this battle.

export const OP01_120_SHANKS: EffectSchema = {
  card_id: "OP01-120",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP01_120_keywords",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
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

// ─── OP01-121 Yamato — Name alias + Double Attack + Banish

export const OP01_121_YAMATO: EffectSchema = {
  card_id: "OP01-121",
  card_name: "Yamato",
  card_type: "Character",
  rule_modifications: [
    { rule_type: "NAME_ALIAS", aliases: ["Kouzuki Oden"] },
  ],
  effects: [
    {
      id: "OP01_121_keywords",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK", "BANISH"] },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Export Map — keyed by card ID
// ═══════════════════════════════════════════════════════════════════════════════

export const OP01_SCHEMAS: Record<string, EffectSchema> = {
  // Red
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
  "OP01-025": OP01_025_RORONOA_ZORO,
  "OP01-026": OP01_026_RED_HAWK,
  "OP01-027": OP01_027_ROUND_TABLE,
  "OP01-028": OP01_028_GREEN_STAR,
  "OP01-029": OP01_029_RADICAL_BEAM,
  "OP01-030": OP01_030_IN_TWO_YEARS,
  // Green
  "OP01-031": OP01_031_ODEN,
  "OP01-032": OP01_032_ASHURA_DOJI,
  "OP01-033": OP01_033_IZO,
  "OP01-034": OP01_034_INUARASHI,
  "OP01-035": OP01_035_OKIKU,
  "OP01-038": OP01_038_KANJURO,
  "OP01-039": OP01_039_KILLER,
  "OP01-040": OP01_040_KINEMON,
  "OP01-041": OP01_041_MOMONOSUKE,
  "OP01-042": OP01_042_KOMURASAKI,
  "OP01-044": OP01_044_SHACHI,
  "OP01-046": OP01_046_DENJIRO,
  "OP01-047": OP01_047_TRAFALGAR_LAW,
  "OP01-048": OP01_048_NEKOMAMUSHI,
  "OP01-049": OP01_049_BEPO,
  "OP01-050": OP01_050_PENGUIN,
  "OP01-051": OP01_051_EUSTASS_KID,
  "OP01-052": OP01_052_RAIZO,
  "OP01-054": OP01_054_XDRAKE,
  "OP01-055": OP01_055_SAMURAI,
  "OP01-056": OP01_056_DEMON_FACE,
  "OP01-057": OP01_057_PARADISE_WATERFALL,
  "OP01-058": OP01_058_PUNK_GIBSON,
  "OP01-059": OP01_059_BE_BENG,
  // Blue
  "OP01-060": OP01_060_DONQUIXOTE_DOFLAMINGO,
  "OP01-061": OP01_061_KAIDO_LEADER,
  "OP01-062": OP01_062_CROCODILE,
  "OP01-063": OP01_063_ARLONG,
  "OP01-064": OP01_064_ALVIDA,
  "OP01-067": OP01_067_CROCODILE,
  "OP01-068": OP01_068_GECKO_MORIA,
  "OP01-069": OP01_069_CAESAR_CLOWN,
  "OP01-070": OP01_070_MIHAWK,
  "OP01-071": OP01_071_JINBE,
  "OP01-072": OP01_072_SMILEY,
  "OP01-073": OP01_073_DOFLAMINGO,
  "OP01-074": OP01_074_KUMA,
  "OP01-075": OP01_075_PACIFISTA,
  "OP01-077": OP01_077_PERONA,
  "OP01-078": OP01_078_BOA_HANCOCK,
  "OP01-079": OP01_079_MS_ALL_SUNDAY,
  "OP01-080": OP01_080_MISS_DOUBLEFINGER,
  "OP01-083": OP01_083_MR1,
  "OP01-084": OP01_084_MR2,
  "OP01-085": OP01_085_MR3,
  "OP01-086": OP01_086_OVERHEAT,
  "OP01-087": OP01_087_OFFICER_AGENTS,
  "OP01-088": OP01_088_DESERT_SPADA,
  "OP01-089": OP01_089_CRESCENT_CUTLASS,
  "OP01-090": OP01_090_BAROQUE_WORKS,
  // Purple
  "OP01-091": OP01_091_KING,
  "OP01-093": OP01_093_ULTI,
  "OP01-094": OP01_094_KAIDO,
  "OP01-095": OP01_095_KYOSHIROU,
  "OP01-096": OP01_096_KING,
  "OP01-097": OP01_097_QUEEN,
  "OP01-098": OP01_098_OROCHI,
  "OP01-099": OP01_099_SEMIMARU,
  "OP01-100": OP01_100_HIGURASHI,
  "OP01-101": OP01_101_SASAKI,
  "OP01-102": OP01_102_JACK,
  "OP01-105": OP01_105_BAO_HUANG,
  "OP01-106": OP01_106_BASIL_HAWKINS,
  "OP01-108": OP01_108_HITOKIRI_KAMAZO,
  "OP01-109": OP01_109_WHOS_WHO,
  "OP01-111": OP01_111_BLACK_MARIA,
  "OP01-112": OP01_112_PAGE_ONE,
  "OP01-113": OP01_113_HOLEDEM,
  "OP01-114": OP01_114_XDRAKE,
  "OP01-115": OP01_115_ELEPHANTS_MARCHOO,
  "OP01-116": OP01_116_SMILE,
  "OP01-117": OP01_117_SHEEPS_HORN,
  "OP01-118": OP01_118_ULTI_MORTAR,
  "OP01-119": OP01_119_THUNDER_BAGUA,
  "OP01-120": OP01_120_SHANKS,
  "OP01-121": OP01_121_YAMATO,
};
