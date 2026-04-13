/**
 * OP06 Effect Schemas
 *
 * Red (FILM): OP06-001 to OP06-019
 * Green (Fish-Man / New Fish-Man Pirates): OP06-020 to OP06-041
 * Blue (Navy / East Blue): OP06-042 to OP06-059
 * Purple (GERMA 66): OP06-060 to OP06-079
 * Black (Thriller Bark Pirates): OP06-080 to OP06-098
 * Yellow (Land of Wano / Shandian): OP06-099 to OP06-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — FILM (OP06-001 to OP06-019)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP06-001 Uta (Leader) ──────────────────────────────────────────────────
// [When Attacking] You may trash 1 {FILM} type card from your hand: Give up to
// 1 of your opponent's Characters −2000 power during this turn. Then, add up to
// 1 DON!! card from your DON!! deck and rest it.

export const OP06_001_UTA: EffectSchema = {
  card_id: "OP06-001",
  card_name: "Uta",
  card_type: "Leader",
  effects: [
    {
      id: "OP06-001_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["FILM"] } },
      ],
      flags: { optional: true },
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
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP06-002 Inazuma ───────────────────────────────────────────────────────
// If this Character has 7000 power or more, this Character gains [Banish].

export const OP06_002_INAZUMA: EffectSchema = {
  card_id: "OP06-002",
  card_name: "Inazuma",
  card_type: "Character",
  effects: [
    {
      id: "OP06-002_effect_1",
      category: "permanent",
      conditions: {
        type: "SELF_POWER",
        operator: ">=",
        value: 7000,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
        },
      ],
    },
  ],
};

// ─── OP06-003 Emporio.Ivankov ───────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck and play up to 1
// {Revolutionary Army} type Character card with 5000 power or less. Then, place
// the rest at the bottom of your deck in any order.

export const OP06_003_EMPORIO_IVANKOV: EffectSchema = {
  card_id: "OP06-003",
  card_name: "Emporio.Ivankov",
  card_type: "Character",
  effects: [
    {
      id: "OP06-003_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 3,
            filter: {
              traits: ["Revolutionary Army"],
              card_type: "CHARACTER",
              power_max: 5000,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP06-004 Baron Omatsuri ────────────────────────────────────────────────
// [On Play] Play up to 1 [Lily Carnation] from your hand.

export const OP06_004_BARON_OMATSURI: EffectSchema = {
  card_id: "OP06-004",
  card_name: "Baron Omatsuri",
  card_type: "Character",
  effects: [
    {
      id: "OP06-004_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Lily Carnation" },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP06-006 Saga ──────────────────────────────────────────────────────────
// [DON!! x1] [When Attacking] This Character gains +1000 power until the start
// of your next turn. Then, trash 1 of your {FILM} type Characters at the end
// of this turn.

export const OP06_006_SAGA: EffectSchema = {
  card_id: "OP06-006",
  card_name: "Saga",
  card_type: "Character",
  effects: [
    {
      id: "OP06-006_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: {
              type: "TRASH_CARD",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { exact: 1 },
                filter: { traits: ["FILM"] },
              },
            },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP06-007 Shanks ────────────────────────────────────────────────────────
// [On Play] K.O. up to 1 of your opponent's Characters with 10000 power or less.

export const OP06_007_SHANKS: EffectSchema = {
  card_id: "OP06-007",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "OP06-007_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 10000 },
          },
        },
      ],
    },
  ],
};

// ─── OP06-009 Shuraiya ──────────────────────────────────────────────────────
// [Blocker]
// [When Attacking]/[On Block] [Once Per Turn] This Character's base power
// becomes the same as your opponent's Leader until the start of your next turn.

export const OP06_009_SHURAIYA: EffectSchema = {
  card_id: "OP06-009",
  card_name: "Shuraiya",
  card_type: "Character",
  effects: [
    {
      id: "OP06-009_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP06-009_effect_1",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING" },
          { keyword: "ON_BLOCK" },
        ],
      },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "COPY_POWER",
          target: { type: "SELF" },
          params: { source: { type: "OPPONENT_LEADER" } },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP06-010 Douglas Bullet ────────────────────────────────────────────────
// If your Leader has the {FILM} type, this Character gains [Blocker].

export const OP06_010_DOUGLAS_BULLET: EffectSchema = {
  card_id: "OP06-010",
  card_name: "Douglas Bullet",
  card_type: "Character",
  effects: [
    {
      id: "OP06-010_effect_1",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "FILM" },
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

// ─── OP06-011 Tot Musica ────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may rest 1 of your [Uta] cards: This
// Character gains +5000 power during this turn.

export const OP06_011_TOT_MUSICA: EffectSchema = {
  card_id: "OP06-011",
  card_name: "Tot Musica",
  card_type: "Character",
  effects: [
    {
      id: "OP06-011_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "REST_NAMED_CARD", filter: { name: "Uta" }, amount: 1 },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 5000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP06-012 Bear.King ─────────────────────────────────────────────────────
// If your opponent has a Leader or Character with a base power of 6000 or more,
// this Character cannot be K.O.'d in battle.

export const OP06_012_BEAR_KING: EffectSchema = {
  card_id: "OP06-012",
  card_name: "Bear.King",
  card_type: "Character",
  effects: [
    {
      id: "OP06-012_effect_1",
      category: "permanent",
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: {
          card_type: ["CHARACTER", "LEADER"],
          base_power_min: 6000,
        },
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP06-013 Monkey.D.Luffy ────────────────────────────────────────────────
// [On Play] Look at 3 cards from the top of your deck; reveal up to 1 {FILM}
// type card and add it to your hand. Then, place the rest at the bottom of your
// deck in any order.
// [Trigger] Activate this card's [On Play] effect.

export const OP06_013_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP06-013",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP06-013_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["FILM"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP06-013_trigger",
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

// ─── OP06-014 Ratchet ───────────────────────────────────────────────────────
// [On Your Opponent's Attack] You may trash any number of {FILM} type cards
// from your hand. Your Leader or 1 of your Characters gains +1000 power during
// this battle for every card trashed.

export const OP06_014_RATCHET: EffectSchema = {
  card_id: "OP06-014",
  card_name: "Ratchet",
  card_type: "Character",
  effects: [
    {
      id: "OP06-014_effect_1",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: "ANY_NUMBER", filter: { traits: ["FILM"] } },
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
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_TRASHED_THIS_WAY",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP06-015 Lily Carnation ────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may trash 1 of your Characters with 6000
// power or more: Play up to 1 {FILM} type Character card with 2000 to 5000
// power from your trash rested.

export const OP06_015_LILY_CARNATION: EffectSchema = {
  card_id: "OP06-015",
  card_name: "Lily Carnation",
  card_type: "Character",
  effects: [
    {
      id: "OP06-015_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "KO_OWN_CHARACTER", amount: 1, filter: { power_min: 6000 } },
      ],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["FILM"],
              card_type: "CHARACTER",
              power_range: { min: 2000, max: 5000 },
            },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP06-016 Raise Max ─────────────────────────────────────────────────────
// [Activate: Main] You may place this Character at the bottom of the owner's
// deck: Give up to 1 of your opponent's Characters −3000 power during this turn.

export const OP06_016_RAISE_MAX: EffectSchema = {
  card_id: "OP06-016",
  card_name: "Raise Max",
  card_type: "Character",
  effects: [
    {
      id: "OP06-016_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "PLACE_OWN_CHARACTER_TO_DECK", position: "BOTTOM" },
      ],
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

// ─── OP06-017 Meteor-Strike of Love (Event) ────────────────────────────────
// [Main]/[Counter] You may add 1 card from the top of your Life cards to your
// hand: Up to 1 of your Leader or Character cards gains +3000 power during
// this turn.

export const OP06_017_METEOR_STRIKE_OF_LOVE: EffectSchema = {
  card_id: "OP06-017",
  card_name: "Meteor-Strike of Love",
  card_type: "Event",
  effects: [
    {
      id: "OP06-017_effect_1",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "MAIN_EVENT" },
          { keyword: "COUNTER_EVENT" },
        ],
      },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP" },
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
  ],
};

// ─── OP06-018 Gum-Gum King Kong Gatling (Event) ────────────────────────────
// [Main] Up to 1 of your Leader or Character cards gains +3000 power during
// this turn. Then, if your opponent has a Character with 7000 power or more, up
// to 1 of your Leader or Character cards gains +1000 power during this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with 5000 power or less.

export const OP06_018_GUM_GUM_KING_KONG_GATLING: EffectSchema = {
  card_id: "OP06-018",
  card_name: "Gum-Gum King Kong Gatling",
  card_type: "Event",
  effects: [
    {
      id: "OP06-018_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { card_type: "CHARACTER", power_min: 7000 },
          },
        },
      ],
    },
    {
      id: "OP06-018_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
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

// ─── OP06-019 Blue Dragon Seal Water Stream (Event) ─────────────────────────
// [Main] K.O. up to 1 of your opponent's Characters with 5000 power or less.
// [Trigger] K.O. up to 1 of your opponent's Characters with 4000 power or less.

export const OP06_019_BLUE_DRAGON_SEAL_WATER_STREAM: EffectSchema = {
  card_id: "OP06-019",
  card_name: "Blue Dragon Seal Water Stream",
  card_type: "Event",
  effects: [
    {
      id: "OP06-019_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 5000 },
          },
        },
      ],
    },
    {
      id: "OP06-019_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Fish-Man / New Fish-Man Pirates (OP06-020 to OP06-041)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP06-020 Hody Jones (Leader) ───────────────────────────────────────────
// [Activate: Main] You may rest this Leader: Rest up to 1 of your opponent's
// DON!! cards or Characters with a cost of 3 or less. Then, you cannot add Life
// cards to your hand using your own effects during this turn.

export const OP06_020_HODY_JONES: EffectSchema = {
  card_id: "OP06-020",
  card_name: "Hody Jones",
  card_type: "Leader",
  effects: [
    {
      id: "OP06-020_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: {
              any_of: [
                { card_type: "CHARACTER", cost_max: 3 },
              ],
            },
            mixed_pool: {
              types: ["CHARACTER", "DON_IN_COST_AREA"],
              total_count: { up_to: 1 },
            },
          },
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
  ],
};

// ─── OP06-021 Perona ────────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Choose one:
// • Rest up to 1 of your opponent's Characters with a cost of 4 or less.
// • Give up to 1 of your opponent's Characters −1 cost during this turn.

export const OP06_021_PERONA: EffectSchema = {
  card_id: "OP06-021",
  card_name: "Perona",
  card_type: "Leader",
  effects: [
    {
      id: "OP06-021_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
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
              [
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
              ],
            ],
            labels: [
              "Rest up to 1 opponent Character with cost 4 or less",
              "Give up to 1 opponent Character −1 cost this turn",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP06-022 Yamato (Leader) ───────────────────────────────────────────────
// [Double Attack]
// [Activate: Main] [Once Per Turn] If your opponent has 3 or less Life cards,
// give up to 2 rested DON!! cards to 1 of your Characters.

export const OP06_022_YAMATO: EffectSchema = {
  card_id: "OP06-022",
  card_name: "Yamato",
  card_type: "Leader",
  effects: [
    {
      id: "OP06-022_keywords",
      category: "permanent",
      flags: { keywords: ["DOUBLE_ATTACK"] },
    },
    {
      id: "OP06-022_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP06-023 Arlong ────────────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: Up to 1 of your opponent's
// rested Leader cannot attack until the end of your opponent's next turn.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP06_023_ARLONG: EffectSchema = {
  card_id: "OP06-023",
  card_name: "Arlong",
  card_type: "Character",
  effects: [
    {
      id: "OP06-023_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "OPPONENT_LEADER",
          },
          params: {
            prohibition_type: "CANNOT_ATTACK",
          },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
    {
      id: "OP06-023_trigger",
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

// ─── OP06-024 Ikaros Much ──────────────────────────────────────────────────
// [On Play] If your Leader has the {New Fish-Man Pirates} type, play up to 1
// {Fish-Man} type Character card with a cost of 4 or less from your hand. Then,
// add 1 card from the top of your Life cards to your hand.

export const OP06_024_IKAROS_MUCH: EffectSchema = {
  card_id: "OP06-024",
  card_name: "Ikaros Much",
  card_type: "Character",
  effects: [
    {
      id: "OP06-024_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "New Fish-Man Pirates" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              traits: ["Fish-Man"],
              card_type: "CHARACTER",
              cost_max: 4,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
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

// ─── OP06-025 Camie ─────────────────────────────────────────────────────────
// [On Play] Look at 4 cards from the top of your deck; reveal up to 1
// {Fish-Man} or {Merfolk} type card other than [Camie] and add it to your hand.
// Then, place the rest at the bottom of your deck in any order.

export const OP06_025_CAMIE: EffectSchema = {
  card_id: "OP06-025",
  card_name: "Camie",
  card_type: "Character",
  effects: [
    {
      id: "OP06-025_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
              exclude_name: "Camie",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP06-026 Koushirou ─────────────────────────────────────────────────────
// [On Play] Set up to 1 of your
// _comment: Text is truncated in source. Best guess: "Set up to 1 of your
// DON!! cards as active."

export const OP06_026_KOUSHIROU: EffectSchema = {
  card_id: "OP06-026",
  card_name: "Koushirou",
  card_type: "Character",
  effects: [
    {
      id: "OP06-026_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      // _comment: "Card text truncated. Best guess: Set up to 1 of your DON!! cards as active."
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP06-027 Gyro ──────────────────────────────────────────────────────────
// [On K.O.] Rest up to 1 of your opponent's Characters with a cost of 3 or less.

export const OP06_027_GYRO: EffectSchema = {
  card_id: "OP06-027",
  card_name: "Gyro",
  card_type: "Character",
  effects: [
    {
      id: "OP06-027_effect_1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SET_REST",
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

// ─── OP06-028 Zeo ───────────────────────────────────────────────────────────
// [DON!! x1] [When Attacking] If your Leader has the {New Fish-Man Pirates}
// type, set up to 1 of your DON!! cards as active and this Character gains
// +1000 power during this turn. Then, add 1 card from the top of your Life
// cards to your hand.

export const OP06_028_ZEO: EffectSchema = {
  card_id: "OP06-028",
  card_name: "Zeo",
  card_type: "Character",
  effects: [
    {
      id: "OP06-028_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "New Fish-Man Pirates" },
      },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          params: { amount: 1 },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
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

// ─── OP06-029 Daruma ────────────────────────────────────────────────────────
// [DON!! x1] [When Attacking] [Once Per Turn] If your Leader has the {New
// Fish-Man Pirates} type, set this Character as active and this Character gains
// +1000 power during this turn. Then, add 1 card from the top of your Life
// cards to your hand.

export const OP06_029_DARUMA: EffectSchema = {
  card_id: "OP06-029",
  card_name: "Daruma",
  card_type: "Character",
  effects: [
    {
      id: "OP06-029_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1, once_per_turn: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "New Fish-Man Pirates" },
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
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

// ─── OP06-030 Dosun ─────────────────────────────────────────────────────────
// [When Attacking] If your Leader has the {New Fish-Man Pirates} type, this
// Character cannot be K.O.'d in battle and gains +2000 power until the start of
// your next turn. Then, add 1 card from the top of your Life cards to your hand.

export const OP06_030_DOSUN: EffectSchema = {
  card_id: "OP06-030",
  card_name: "Dosun",
  card_type: "Character",
  effects: [
    {
      id: "OP06-030_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "New Fish-Man Pirates" },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "SELF" },
          params: {
            prohibition_type: "CANNOT_BE_KO",
            scope: { cause: "BATTLE" },
          },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
          chain: "AND",
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

// ─── OP06-032 Hammond ───────────────────────────────────────────────────────
// [Blocker]

export const OP06_032_HAMMOND: EffectSchema = {
  card_id: "OP06-032",
  card_name: "Hammond",
  card_type: "Character",
  effects: [
    {
      id: "OP06-032_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP06-033 Vander Decken IX ──────────────────────────────────────────────
// [On Play] You may trash 1 {Fish-Man} type card from your hand or 1 [The Ark
// Noah] from your hand or field: K.O. up to 1 of your opponent's rested
// Characters.

export const OP06_033_VANDER_DECKEN_IX: EffectSchema = {
  card_id: "OP06-033",
  card_name: "Vander Decken IX",
  card_type: "Character",
  effects: [
    {
      id: "OP06-033_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "TRASH_FROM_HAND",
                  params: { amount: 1 },
                  target: {
                    type: "CARD_IN_HAND",
                    controller: "SELF",
                    count: { exact: 1 },
                    filter: { traits: ["Fish-Man"] },
                  },
                },
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { is_rested: true },
                  },
                  chain: "THEN",
                },
              ],
              [
                {
                  type: "TRASH_CARD",
                  target: {
                    type: "LEADER_OR_CHARACTER",
                    controller: "SELF",
                    count: { exact: 1 },
                    filter: { name: "The Ark Noah" },
                    source_zone: ["HAND", "FIELD"],
                  },
                },
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { is_rested: true },
                  },
                  chain: "THEN",
                },
              ],
            ],
            labels: [
              "Trash 1 {Fish-Man} type card from hand",
              "Trash 1 [The Ark Noah] from hand or field",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP06-034 Hyouzou ──────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] Rest up to 1 of your opponent's Characters
// with a cost of 4 or less and this Character gains +1000 power during this
// turn. Then, add 1 card from the top of your Life cards to your hand.

export const OP06_034_HYOUZOU: EffectSchema = {
  card_id: "OP06-034",
  card_name: "Hyouzou",
  card_type: "Character",
  effects: [
    {
      id: "OP06-034_effect_1",
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
            filter: { cost_max: 4 },
          },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
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

// ─── OP06-035 Hody Jones (Character) ────────────────────────────────────────
// [Rush]
// [On Play] Rest up to a total of 2 of your opponent's Characters or DON!!
// cards. Then, add 1 card from the top of your Life cards to your hand.

export const OP06_035_HODY_JONES_CHARACTER: EffectSchema = {
  card_id: "OP06-035",
  card_name: "Hody Jones",
  card_type: "Character",
  effects: [
    {
      id: "OP06-035_keywords",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "OP06-035_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            mixed_pool: {
              types: ["CHARACTER", "DON_IN_COST_AREA"],
              total_count: { up_to: 2 },
            },
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

// ─── OP06-036 Ryuma ─────────────────────────────────────────────────────────
// [On Play]/[On K.O.] K.O. up to 1 of your opponent's rested Characters with a
// cost of 4 or less.

export const OP06_036_RYUMA: EffectSchema = {
  card_id: "OP06-036",
  card_name: "Ryuma",
  card_type: "Character",
  effects: [
    {
      id: "OP06-036_effect_1",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "ON_KO" },
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

// ─── OP06-038 The Billion-fold World Trichiliocosm (Event) ──────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 8 or more rested cards, that card gains an
// additional +2000 power during this battle.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of 3
// or less.

export const OP06_038_THE_BILLION_FOLD_WORLD: EffectSchema = {
  card_id: "OP06-038",
  card_name: "The Billion-fold World Trichiliocosm",
  card_type: "Event",
  effects: [
    {
      id: "OP06-038_effect_1",
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
            type: "RESTED_CARD_COUNT",
            controller: "SELF",
            operator: ">=",
            value: 8,
          },
        },
      ],
    },
    {
      id: "OP06-038_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── OP06-039 You Ain't Even Worth Killing Time!! (Event) ───────────────────
// [Main] Choose one:
// • Rest up to 1 of your opponent's Characters with a cost of 6 or less.
// • K.O. up to 1 of your opponent's rested Characters with a cost of 6 or less.
// [Trigger] Activate this card's [Main] effect.

export const OP06_039_YOU_AINT_EVEN_WORTH: EffectSchema = {
  card_id: "OP06-039",
  card_name: "You Ain't Even Worth Killing Time!!",
  card_type: "Event",
  effects: [
    {
      id: "OP06-039_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
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
              [
                {
                  type: "KO",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { is_rested: true, cost_max: 6 },
                  },
                },
              ],
            ],
            labels: [
              "Rest up to 1 opponent Character with cost 6 or less",
              "K.O. up to 1 opponent rested Character with cost 6 or less",
            ],
          },
        },
      ],
    },
    {
      id: "OP06-039_trigger",
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

// ─── OP06-040 Shark Arrows (Event) ──────────────────────────────────────────
// [Main] K.O. up to 2 of your opponent's rested Characters with a cost of 3 or
// less.
// [Trigger] Activate this card's [Main] effect.

export const OP06_040_SHARK_ARROWS: EffectSchema = {
  card_id: "OP06-040",
  card_name: "Shark Arrows",
  card_type: "Event",
  effects: [
    {
      id: "OP06-040_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { is_rested: true, cost_max: 3 },
          },
        },
      ],
    },
    {
      id: "OP06-040_trigger",
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

// ─── OP06-041 The Ark Noah (Stage) ──────────────────────────────────────────
// [On Play] Rest all of your opponent's Characters.
// [Trigger] Play this card.

export const OP06_041_THE_ARK_NOAH: EffectSchema = {
  card_id: "OP06-041",
  card_name: "The Ark Noah",
  card_type: "Stage",
  effects: [
    {
      id: "OP06-041_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
        },
      ],
    },
    {
      id: "OP06-041_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Navy / East Blue (OP06-042 to OP06-059)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP06-042 Vinsmoke Reiju (Leader) ───────────────────────────────────────
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to
// your DON!! deck, draw 1 card.

export const OP06_042_VINSMOKE_REIJU: EffectSchema = {
  card_id: "OP06-042",
  card_name: "Vinsmoke Reiju",
  card_type: "Leader",
  effects: [
    {
      id: "OP06-042_effect_1",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP06-043 Aramaki ───────────────────────────────────────────────────────
// [Blocker]
// [Activate: Main] [Once Per Turn] You may trash 1 card from your hand and
// place 1 Character with a cost of 2 or less at the bottom of the owner's deck:
// This Character gains +3000 power during this turn.

export const OP06_043_ARAMAKI: EffectSchema = {
  card_id: "OP06-043",
  card_name: "Aramaki",
  card_type: "Character",
  effects: [
    {
      id: "OP06-043_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP06-043_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        {
          type: "PLACE_OWN_CHARACTER_TO_DECK",
          amount: 1,
          filter: { cost_max: 2 },
          position: "BOTTOM",
        },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP06-044 Gion ──────────────────────────────────────────────────────────
// [Your Turn] [Once Per Turn] When your opponent activates an Event, your
// opponent must place 1 card from their hand at the bottom of their deck.

export const OP06_044_GION: EffectSchema = {
  card_id: "OP06-044",
  card_name: "Gion",
  card_type: "Character",
  effects: [
    {
      id: "OP06-044_effect_1",
      category: "auto",
      trigger: {
        event: "EVENT_ACTIVATED",
        filter: { controller: "OPPONENT" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
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
  ],
};

// ─── OP06-045 Kuzan ─────────────────────────────────────────────────────────
// [On Play] Draw 2 cards and place 2 cards from your hand at the bottom of your
// deck in any order.

export const OP06_045_KUZAN: EffectSchema = {
  card_id: "OP06-045",
  card_name: "Kuzan",
  card_type: "Character",
  effects: [
    {
      id: "OP06-045_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "BOTTOM" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP06-046 Sakazuki ──────────────────────────────────────────────────────
// [On Play] Place up to 1 Character with a cost of 2 or less at the bottom of
// the owner's deck.

export const OP06_046_SAKAZUKI: EffectSchema = {
  card_id: "OP06-046",
  card_name: "Sakazuki",
  card_type: "Character",
  effects: [
    {
      id: "OP06-046_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
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
      ],
    },
  ],
};

// ─── OP06-047 Charlotte Pudding ─────────────────────────────────────────────
// [On Play] Your opponent returns all cards in their hand to their deck and
// shuffles their deck. Then, your opponent draws 5 cards.

export const OP06_047_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "OP06-047",
  card_name: "Charlotte Pudding",
  card_type: "Character",
  effects: [
    {
      id: "OP06-047_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "RETURN_HAND_TO_DECK",
              params: { position: "TOP" },
            },
          },
        },
        {
          type: "SHUFFLE_DECK",
          target: { type: "PLAYER", controller: "OPPONENT" },
          chain: "AND",
        },
        {
          type: "OPPONENT_ACTION",
          params: {
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

// ─── OP06-048 Zeff ──────────────────────────────────────────────────────────
// [Your Turn] When your opponent activates [Blocker] or an Event, if your
// Leader has the {East Blue} type, you may trash 4 cards from the top of your
// deck.

export const OP06_048_ZEFF: EffectSchema = {
  card_id: "OP06-048",
  card_name: "Zeff",
  card_type: "Character",
  effects: [
    {
      id: "OP06-048_effect_1",
      category: "auto",
      trigger: {
        any_of: [
          {
            event: "BLOCKER_ACTIVATED",
            filter: { controller: "OPPONENT" },
            turn_restriction: "YOUR_TURN",
          },
          {
            event: "EVENT_ACTIVATED",
            filter: { controller: "OPPONENT" },
            turn_restriction: "YOUR_TURN",
          },
        ],
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "East Blue" },
      },
      flags: { optional: true },
      actions: [
        { type: "MILL", params: { amount: 4 } },
      ],
    },
  ],
};

// ─── OP06-050 Tashigi ───────────────────────────────────────────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Navy}
// type card other than [Tashigi] and add it to your hand. Then, place the rest
// at the bottom of your deck in any order.

export const OP06_050_TASHIGI: EffectSchema = {
  card_id: "OP06-050",
  card_name: "Tashigi",
  card_type: "Character",
  effects: [
    {
      id: "OP06-050_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Navy"],
              exclude_name: "Tashigi",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP06-051 Tsuru ─────────────────────────────────────────────────────────
// [On Play] You may trash 2 cards from your hand: Your opponent returns 1 of
// their Characters to the owner's hand.

export const OP06_051_TSURU: EffectSchema = {
  card_id: "OP06-051",
  card_name: "Tsuru",
  card_type: "Character",
  effects: [
    {
      id: "OP06-051_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "RETURN_TO_HAND",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { exact: 1 },
              },
            },
          },
        },
      ],
    },
  ],
};

// ─── OP06-052 Tokikake ──────────────────────────────────────────────────────
// [DON!! x1] If you have 4 or less cards in your hand, this Character cannot be
// K.O.'d in battle.

export const OP06_052_TOKIKAKE: EffectSchema = {
  card_id: "OP06-052",
  card_name: "Tokikake",
  card_type: "Character",
  effects: [
    {
      id: "OP06-052_effect_1",
      category: "permanent",
      conditions: {
        all_of: [
          { type: "DON_GIVEN", controller: "SELF", mode: "SPECIFIC_CARD", operator: ">=", value: 1 },
          { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 4 },
        ],
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP06-053 Jaguar.D.Saul ────────────────────────────────────────────────
// [On K.O.] Place up to 1 Character with a cost of 2 or less at the bottom of
// the owner's deck.

export const OP06_053_JAGUAR_D_SAUL: EffectSchema = {
  card_id: "OP06-053",
  card_name: "Jaguar.D.Saul",
  card_type: "Character",
  effects: [
    {
      id: "OP06-053_effect_1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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
      ],
    },
  ],
};

// ─── OP06-054 Borsalino ────────────────────────────────────────────────────
// If you have 5 or less cards in your hand, this Character gains [Blocker].

export const OP06_054_BORSALINO: EffectSchema = {
  card_id: "OP06-054",
  card_name: "Borsalino",
  card_type: "Character",
  effects: [
    {
      id: "OP06-054_effect_1",
      category: "permanent",
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
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

// ─── OP06-055 Monkey.D.Garp ────────────────────────────────────────────────
// [DON!! x2] [When Attacking] If you have 4 or less cards in your hand, your
// opponent cannot activate [Blocker] during this battle.

export const OP06_055_MONKEY_D_GARP: EffectSchema = {
  card_id: "OP06-055",
  card_name: "Monkey.D.Garp",
  card_type: "Character",
  effects: [
    {
      id: "OP06-055_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 4,
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "PLAYER", controller: "OPPONENT" },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
          },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP06-056 Ama no Murakumo Sword (Event) ────────────────────────────────
// [Main] Place up to 1 of your opponent's Characters with a cost of 2 or less
// and up to 1 of your opponent's Characters with a cost of 1 or less at the
// bottom of the owner's deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const OP06_056_AMA_NO_MURAKUMO_SWORD: EffectSchema = {
  card_id: "OP06-056",
  card_name: "Ama no Murakumo Sword",
  card_type: "Event",
  effects: [
    {
      id: "OP06-056_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            dual_targets: [
              { filter: { cost_max: 2 }, count: { up_to: 1 } },
              { filter: { cost_max: 1 }, count: { up_to: 1 } },
            ],
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "OP06-056_trigger",
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

// ─── OP06-057 But I Will Never Doubt a Woman's Tears!!!! (Event) ────────────
// [Main] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn. Then, reveal 1 card from the top of your deck, play up to 1
// Character card with a cost of 2, and place the rest at the top or bottom of
// your deck.
// [Trigger] Play up to 1 Character card with a cost of 2 from your hand.

export const OP06_057_BUT_I_WILL_NEVER_DOUBT: EffectSchema = {
  card_id: "OP06-057",
  card_name: "But I Will Never Doubt a Woman's Tears!!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP06-057_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 1,
            filter: {
              card_type: "CHARACTER",
              cost_exact: 2,
            },
            rest_destination: "BOTTOM",
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP06-057_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { card_type: "CHARACTER", cost_exact: 2 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP06-058 Gravity Blade Raging Tiger (Event) ────────────────────────────
// [Main] Place up to 2 Characters with a cost of 6 or less at the bottom of the
// owner's deck in any order.
// [Trigger] Place up to 1 Character with a cost of 5 or less at the bottom of
// the owner's deck.

export const OP06_058_GRAVITY_BLADE_RAGING_TIGER: EffectSchema = {
  card_id: "OP06-058",
  card_name: "Gravity Blade Raging Tiger",
  card_type: "Event",
  effects: [
    {
      id: "OP06-058_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 2 },
            filter: { cost_max: 6 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "OP06-058_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP06-059 White Snake (Event) ───────────────────────────────────────────
// [Counter] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn, and draw 1 card.
// [Trigger] Look at 5 cards from the top of your deck and place them at the top
// or bottom of your deck in any order.

export const OP06_059_WHITE_SNAKE: EffectSchema = {
  card_id: "OP06-059",
  card_name: "White Snake",
  card_type: "Event",
  effects: [
    {
      id: "OP06-059_effect_1",
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
          duration: { type: "THIS_TURN" },
        },
        {
          type: "DRAW",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP06-059_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 5 },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — GERMA 66 (OP06-060 to OP06-079)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP06-060 Vinsmoke Ichiji (3-cost) ──────────────────────────────────────
// [Activate: Main] DON!! −1 You may trash this Character: If your Leader has
// the {GERMA 66} type, play up to 1 [Vinsmoke Ichiji] with a cost of 7 from
// your hand or trash.

export const OP06_060_VINSMOKE_ICHIJI_3: EffectSchema = {
  card_id: "OP06-060",
  card_name: "Vinsmoke Ichiji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-060_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "GERMA 66" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { name: "Vinsmoke Ichiji", cost_exact: 7 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP06-061 Vinsmoke Ichiji (7-cost) ──────────────────────────────────────
// [On Play] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field, give up to 1 of your opponent's
// Characters −2000 power during this turn and this Character gains [Rush].

export const OP06_061_VINSMOKE_ICHIJI_7: EffectSchema = {
  card_id: "OP06-061",
  card_name: "Vinsmoke Ichiji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-061_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
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
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP06-062 Vinsmoke Judge ────────────────────────────────────────────────
// [On Play] DON!! −1 You may trash 2 cards from your hand: Play up to 4
// {GERMA 66} type Character cards with different card names and 4000 power or
// less from your trash.
// [Activate: Main] [Once Per Turn] DON!! −1: Rest up to 1 of your opponent's
// DON!! cards.

export const OP06_062_VINSMOKE_JUDGE: EffectSchema = {
  card_id: "OP06-062",
  card_name: "Vinsmoke Judge",
  card_type: "Character",
  effects: [
    {
      id: "OP06-062_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 4 },
            filter: {
              traits: ["GERMA 66"],
              card_type: "CHARACTER",
              power_max: 4000,
            },
            uniqueness_constraint: { field: "name" },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
    {
      id: "OP06-062_effect_2",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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

// ─── OP06-063 Vinsmoke Sora ─────────────────────────────────────────────────
// [On Play] You may trash 1 card from your hand: If the number of DON!! cards
// on your field is equal to or less than the number on your opponent's field,
// add up to 1 {The Vinsmoke Family} type Character card with 4000 power or less
// from your trash to your hand.

export const OP06_063_VINSMOKE_SORA: EffectSchema = {
  card_id: "OP06-063",
  card_name: "Vinsmoke Sora",
  card_type: "Character",
  effects: [
    {
      id: "OP06-063_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["The Vinsmoke Family"],
              card_type: "CHARACTER",
              power_max: 4000,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP06-064 Vinsmoke Niji (3-cost) ────────────────────────────────────────
// [Activate: Main] DON!! −1 You may trash this Character: If your Leader has
// the {GERMA 66} type, play up to 1 [Vinsmoke Niji] with a cost of 5 from your
// hand or trash.

export const OP06_064_VINSMOKE_NIJI_3: EffectSchema = {
  card_id: "OP06-064",
  card_name: "Vinsmoke Niji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-064_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "GERMA 66" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { name: "Vinsmoke Niji", cost_exact: 5 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP06-065 Vinsmoke Niji (5-cost) ────────────────────────────────────────
// [On Play] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field, choose one:
// • K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
// • Return up to 1 of your opponent's Characters with a cost of 4 or less to
//   the owner's hand.

export const OP06_065_VINSMOKE_NIJI_5: EffectSchema = {
  card_id: "OP06-065",
  card_name: "Vinsmoke Niji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-065_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
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
                    filter: { cost_max: 2 },
                  },
                },
              ],
              [
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
            ],
            labels: [
              "K.O. up to 1 opponent Character with cost 2 or less",
              "Return up to 1 opponent Character with cost 4 or less to hand",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP06-066 Vinsmoke Yonji (2-cost) ───────────────────────────────────────
// [Activate: Main] DON!! −1 You may trash this Character: If your Leader has
// the {GERMA 66} type, play up to 1 [Vinsmoke Yonji] with a cost of 4 from
// your hand or trash.

export const OP06_066_VINSMOKE_YONJI_2: EffectSchema = {
  card_id: "OP06-066",
  card_name: "Vinsmoke Yonji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-066_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "GERMA 66" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { name: "Vinsmoke Yonji", cost_exact: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP06-067 Vinsmoke Yonji (4-cost) ───────────────────────────────────────
// If the number of DON!! cards on your field is equal to or less than the number
// on your opponent's field, this Character gains +1000 power.
// [Blocker]

export const OP06_067_VINSMOKE_YONJI_4: EffectSchema = {
  card_id: "OP06-067",
  card_name: "Vinsmoke Yonji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-067_effect_1",
      category: "permanent",
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
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
      id: "OP06-067_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP06-068 Vinsmoke Reiju (2-cost) ───────────────────────────────────────
// [Activate: Main] DON!! −1 You may trash this Character: If your Leader has
// the {GERMA 66} type, play up to 1 [Vinsmoke Reiju] with a cost of 4 from
// your hand or trash.

export const OP06_068_VINSMOKE_REIJU_2: EffectSchema = {
  card_id: "OP06-068",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "OP06-068_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_MINUS", amount: 1 },
        { type: "TRASH_SELF" },
      ],
      flags: { optional: true },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "GERMA 66" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: ["HAND", "TRASH"],
            count: { up_to: 1 },
            filter: { name: "Vinsmoke Reiju", cost_exact: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP06-069 Vinsmoke Reiju (4-cost) ───────────────────────────────────────
// [On Play] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field and you have 5 or less cards in your hand,
// draw 2 cards.

export const OP06_069_VINSMOKE_REIJU_4: EffectSchema = {
  card_id: "OP06-069",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "OP06-069_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "COMPARATIVE",
            metric: "DON_FIELD_COUNT",
            operator: "<=",
          },
          {
            type: "HAND_COUNT",
            controller: "SELF",
            operator: "<=",
            value: 5,
          },
        ],
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
      ],
    },
  ],
};

// ─── OP06-071 Gild Tesoro ──────────────────────────────────────────────────
// [On Play] DON!! −1: If your Leader has the {FILM} type, add up to 2 {FILM}
// type Character cards with a cost of 4 or less from your trash to your hand.

export const OP06_071_GILD_TESORO: EffectSchema = {
  card_id: "OP06-071",
  card_name: "Gild Tesoro",
  card_type: "Character",
  effects: [
    {
      id: "OP06-071_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "FILM" },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 2 },
            filter: {
              traits: ["FILM"],
              card_type: "CHARACTER",
              cost_max: 4,
            },
          },
        },
      ],
    },
  ],
};

// ─── OP06-072 Cosette ──────────────────────────────────────────────────────
// If your Leader has the {GERMA 66} type and the number of DON!! cards on your
// field is at least 2 less than the number on your opponent's field, this
// Character gains [Blocker].

export const OP06_072_COSETTE: EffectSchema = {
  card_id: "OP06-072",
  card_name: "Cosette",
  card_type: "Character",
  effects: [
    {
      id: "OP06-072_effect_1",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "GERMA 66" },
          },
          {
            type: "COMPARATIVE",
            metric: "DON_FIELD_COUNT",
            operator: "<=",
            margin: -2,
          },
        ],
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

// ─── OP06-073 Shiki ─────────────────────────────────────────────────────────
// [Blocker]
// [On Play] If you have 8 or more DON!! cards on your field, draw 1 card and
// trash 1 card from your hand.

export const OP06_073_SHIKI: EffectSchema = {
  card_id: "OP06-073",
  card_name: "Shiki",
  card_type: "Character",
  effects: [
    {
      id: "OP06-073_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP06-073_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 8,
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP06-074 Zephyr ────────────────────────────────────────────────────────
// [On Play] DON!! −1: Negate the effect of up to 1 of your opponent's
// Characters during this turn. Then, if that Character has 5000 power or less,
// K.O. it.

export const OP06_074_ZEPHYR: EffectSchema = {
  card_id: "OP06-074",
  card_name: "Zephyr",
  card_type: "Character",
  effects: [
    {
      id: "OP06-074_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
          result_ref: "negated_character",
        },
        {
          type: "KO",
          target_ref: "negated_character",
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { power_max: 5000 },
          },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP06-075 Count Battler ─────────────────────────────────────────────────
// [On Play] DON!! −1: Rest up to 2 of your opponent's Characters with a cost of
// 2 or less.

export const OP06_075_COUNT_BATTLER: EffectSchema = {
  card_id: "OP06-075",
  card_name: "Count Battler",
  card_type: "Character",
  effects: [
    {
      id: "OP06-075_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP06-076 Hitokiri Kamazo ──────────────────────────────────────────────
// [Your Turn] [Once Per Turn] When a DON!! card on your field is returned to
// your DON!! deck, K.O. up to 1 of your opponent's Characters with a cost of 2
// or less.

export const OP06_076_HITOKIRI_KAMAZO: EffectSchema = {
  card_id: "OP06-076",
  card_name: "Hitokiri Kamazo",
  card_type: "Character",
  effects: [
    {
      id: "OP06-076_effect_1",
      category: "auto",
      trigger: {
        event: "DON_RETURNED_TO_DON_DECK",
        filter: { controller: "SELF" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
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
      ],
    },
  ],
};

// ─── OP06-077 Black Bug (Event) ─────────────────────────────────────────────
// [Main] If the number of DON!! cards on your field is equal to or less than the
// number on your opponent's field, place up to 1 of your opponent's Characters
// with a cost of 5 or less at the bottom of the owner's deck.
// [Trigger] Place up to 1 of your opponent's Characters with a cost of 4 or
// less at the bottom of the owner's deck.

export const OP06_077_BLACK_BUG: EffectSchema = {
  card_id: "OP06-077",
  card_name: "Black Bug",
  card_type: "Event",
  effects: [
    {
      id: "OP06-077_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
    {
      id: "OP06-077_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 4 },
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

// ─── OP06-078 GERMA 66 (Event) ──────────────────────────────────────────────
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 card with a
// type including "GERMA" other than [GERMA 66] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP06_078_GERMA_66: EffectSchema = {
  card_id: "OP06-078",
  card_name: "GERMA 66",
  card_type: "Event",
  effects: [
    {
      id: "OP06-078_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits_contains: ["GERMA"],
              exclude_name: "GERMA 66",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP06-078_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP06-079 Kingdom of GERMA (Stage) ──────────────────────────────────────
// [Activate: Main] You may trash 1 card from your hand and rest this Stage:
// Look at 3 cards from the top of your deck; reveal up to 1 card with a type
// including "GERMA" and add it to your hand. Then, place the rest at the bottom
// of your deck in any order.

export const OP06_079_KINGDOM_OF_GERMA: EffectSchema = {
  card_id: "OP06-079",
  card_name: "Kingdom of GERMA",
  card_type: "Stage",
  effects: [
    {
      id: "OP06-079_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: {
              traits_contains: ["GERMA"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Thriller Bark Pirates (OP06-080 to OP06-098)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP06-080 Gecko Moria (Leader) ──────────────────────────────────────────
// [DON!! x1] [When Attacking] ➁ You may trash 1 card from your hand: Trash 2
// cards from the top of your deck and play up to 1 {Thriller Bark Pirates} type
// Character card with a cost of 4 or less from your trash.

export const OP06_080_GECKO_MORIA: EffectSchema = {
  card_id: "OP06-080",
  card_name: "Gecko Moria",
  card_type: "Leader",
  effects: [
    {
      id: "OP06-080_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      costs: [
        { type: "DON_REST", amount: 2 },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      flags: { optional: true },
      actions: [
        { type: "MILL", params: { amount: 2 } },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              card_type: "CHARACTER",
              cost_max: 4,
            },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP06-081 Absalom ───────────────────────────────────────────────────────
// [On Play] You may return 2 cards from your trash to the bottom of your deck
// in any order: K.O. up to 1 Character with a cost of 2 or less.

export const OP06_081_ABSALOM: EffectSchema = {
  card_id: "OP06-081",
  card_name: "Absalom",
  card_type: "Character",
  effects: [
    {
      id: "OP06-081_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 2, position: "BOTTOM" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
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

// ─── OP06-082 Inuppe ────────────────────────────────────────────────────────
// [On Play]/[On K.O.] If your Leader has the {Thriller Bark Pirates} type, draw
// 2 cards and trash 2 cards from your hand.

export const OP06_082_INUPPE: EffectSchema = {
  card_id: "OP06-082",
  card_name: "Inuppe",
  card_type: "Character",
  effects: [
    {
      id: "OP06-082_effect_1",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "ON_KO" },
        ],
      },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Thriller Bark Pirates" },
      },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP06-083 Oars ──────────────────────────────────────────────────────────
// This Character cannot attack.
// [Activate: Main] You may K.O. 1 of your {Thriller Bark Pirates} type
// Characters: This Character's effect is negated during this turn.

export const OP06_083_OARS: EffectSchema = {
  card_id: "OP06-083",
  card_name: "Oars",
  card_type: "Character",
  effects: [
    {
      id: "OP06-083_cannot_attack",
      category: "permanent",
      prohibitions: [
        { type: "CANNOT_ATTACK" },
      ],
    },
    {
      id: "OP06-083_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "KO_OWN_CHARACTER",
          amount: 1,
          filter: { traits: ["Thriller Bark Pirates"] },
        },
      ],
      flags: { optional: true },
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

// ─── OP06-084 Jigoro of the Wind ────────────────────────────────────────────
// [On K.O.] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP06_084_JIGORO_OF_THE_WIND: EffectSchema = {
  card_id: "OP06-084",
  card_name: "Jigoro of the Wind",
  card_type: "Character",
  effects: [
    {
      id: "OP06-084_effect_1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
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

// ─── OP06-085 Kumacy ────────────────────────────────────────────────────────
// [DON!! x2] [Your Turn] This Character gains +1000 power for every 5 cards in
// your trash.

export const OP06_085_KUMACY: EffectSchema = {
  card_id: "OP06-085",
  card_name: "Kumacy",
  card_type: "Character",
  effects: [
    {
      id: "OP06-085_effect_1",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: 1000,
              divisor: 5,
            },
          },
          duration: { type: "WHILE_CONDITION", condition: { all_of: [{ type: "IS_MY_TURN", controller: "SELF" }, { type: "SELF_STATE", required_state: "ACTIVE" }] } },
        },
      ],
    },
  ],
};

// ─── OP06-086 Gecko Moria (Character) ───────────────────────────────────────
// [On Play] Choose up to 1 Character card with a cost of 4 or less and up to 1
// Character card with a cost of 2 or less from your trash. Play 1 card and play
// the other card rested.

export const OP06_086_GECKO_MORIA_CHARACTER: EffectSchema = {
  card_id: "OP06-086",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "OP06-086_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            dual_targets: [
              { filter: { card_type: "CHARACTER", cost_max: 4 }, count: { up_to: 1 } },
              { filter: { card_type: "CHARACTER", cost_max: 2 }, count: { up_to: 1 } },
            ],
          },
          params: {
            source_zone: "TRASH",
            cost_override: "FREE",
            entry_state: "PLAYER_CHOICE",
            state_distribution: { ACTIVE: 1, RESTED: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP06-087 Cerberus ──────────────────────────────────────────────────────
// [Blocker]

export const OP06_087_CERBERUS: EffectSchema = {
  card_id: "OP06-087",
  card_name: "Cerberus",
  card_type: "Character",
  effects: [
    {
      id: "OP06-087_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP06-088 Sai ───────────────────────────────────────────────────────────
// If your Leader has the {Dressrosa} type and is active, this Character gains
// +2000 power.

export const OP06_088_SAI: EffectSchema = {
  card_id: "OP06-088",
  card_name: "Sai",
  card_type: "Character",
  effects: [
    {
      id: "OP06-088_effect_1",
      category: "permanent",
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Dressrosa" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { power: { operator: ">=", value: 0 } },
          },
        ],
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

// ─── OP06-089 Taralan ───────────────────────────────────────────────────────
// [On Play]/[On K.O.] Trash 3 cards from the top of your deck.

export const OP06_089_TARALAN: EffectSchema = {
  card_id: "OP06-089",
  card_name: "Taralan",
  card_type: "Character",
  effects: [
    {
      id: "OP06-089_effect_1",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "ON_PLAY" },
          { keyword: "ON_KO" },
        ],
      },
      actions: [
        { type: "MILL", params: { amount: 3 } },
      ],
    },
  ],
};

// ─── OP06-090 Dr. Hogback ──────────────────────────────────────────────────
// [On Play] You may return 2 cards from your trash to the bottom of your deck
// in any order: Add up to 1 {Thriller Bark Pirates} type card other than
// [Dr. Hogback] from your trash to your hand.

export const OP06_090_DR_HOGBACK: EffectSchema = {
  card_id: "OP06-090",
  card_name: "Dr. Hogback",
  card_type: "Character",
  effects: [
    {
      id: "OP06-090_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "PLACE_FROM_TRASH_TO_DECK", amount: 2, position: "BOTTOM" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              exclude_name: "Dr. Hogback",
            },
          },
        },
      ],
    },
  ],
};

// ─── OP06-091 Victoria Cindry ───────────────────────────────────────────────
// [On Play] If your Leader has the {Thriller Bark Pirates} type, trash 5 cards
// from the top of your deck.

export const OP06_091_VICTORIA_CINDRY: EffectSchema = {
  card_id: "OP06-091",
  card_name: "Victoria Cindry",
  card_type: "Character",
  effects: [
    {
      id: "OP06-091_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Thriller Bark Pirates" },
      },
      actions: [
        { type: "MILL", params: { amount: 5 } },
      ],
    },
  ],
};

// ─── OP06-092 Brook ─────────────────────────────────────────────────────────
// [On Play] Choose one:
// • Trash up to 1 of your opponent's Characters with a cost of 4 or less.
// • Your opponent places 3 cards from their trash at the bottom of their deck
//   in any order.

export const OP06_092_BROOK: EffectSchema = {
  card_id: "OP06-092",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "OP06-092_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "TRASH_CARD",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 4 },
                  },
                },
              ],
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    action: {
                      type: "PLACE_HAND_TO_DECK",
                      params: { amount: 3, position: "BOTTOM" },
                    },
                  },
                },
              ],
            ],
            labels: [
              "Trash up to 1 opponent Character with cost 4 or less",
              "Opponent places 3 cards from trash at bottom of deck",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP06-093 Perona ────────────────────────────────────────────────────────
// [On Play] If your opponent has 5 or more cards in their hand, choose one:
// • Your opponent trashes 1 card from their hand.
// • Give up to 1 of your opponent's Characters −3 cost during this turn.

export const OP06_093_PERONA: EffectSchema = {
  card_id: "OP06-093",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "OP06-093_effect_1",
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
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    action: {
                      type: "TRASH_FROM_HAND",
                      params: { amount: 1 },
                    },
                  },
                },
              ],
              [
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
            ],
            labels: [
              "Opponent trashes 1 card from hand",
              "Give up to 1 opponent Character −3 cost this turn",
            ],
          },
        },
      ],
    },
  ],
};

// ─── OP06-095 Shadows Asgard (Event) ────────────────────────────────────────
// [Main]/[Counter] Your Leader gains +1000 power during this turn. Then, you
// may K.O. any number of your {Thriller Bark Pirates} type Characters with a
// cost of 2 or less. Your Leader gains an additional +1000 power during this
// turn for every Character K.O.'d.
// [Trigger] Draw 2 cards and trash 1 card from your hand.

export const OP06_095_SHADOWS_ASGARD: EffectSchema = {
  card_id: "OP06-095",
  card_name: "Shadows Asgard",
  card_type: "Event",
  effects: [
    {
      id: "OP06-095_effect_1",
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
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { any_number: true },
            filter: {
              traits: ["Thriller Bark Pirates"],
              cost_max: 2,
            },
          },
          chain: "THEN",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CHARACTERS_KO_THIS_WAY",
              multiplier: 1000,
            },
          },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP06-095_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP06-096 ...Nothing...at All!!! (Event) ────────────────────────────────
// [Counter] You may add 1 card from the top of your Life cards to your hand:
// Your Characters with a cost of 7 or less cannot be K.O.'d in battle during
// this turn.
// [Trigger] Activate this card's [Counter] effect.

export const OP06_096_NOTHING_AT_ALL: EffectSchema = {
  card_id: "OP06-096",
  card_name: "...Nothing...at All!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP06-096_effect_1",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { cost_max: 7 },
          },
          params: {
            prohibition_type: "CANNOT_BE_KO",
            scope: { cause: "BATTLE" },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP06-096_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "COUNTER" },
        },
      ],
    },
  ],
};

// ─── OP06-097 Negative Hollow (Event) ───────────────────────────────────────
// [Main] Trash 1 card from your opponent's hand.
// [Trigger] Activate this card's [Main] effect.

export const OP06_097_NEGATIVE_HOLLOW: EffectSchema = {
  card_id: "OP06-097",
  card_name: "Negative Hollow",
  card_type: "Event",
  effects: [
    {
      id: "OP06-097_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
        },
      ],
    },
    {
      id: "OP06-097_trigger",
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

// ─── OP06-098 Thriller Bark (Stage) ─────────────────────────────────────────
// [Activate: Main] ➀ You may rest this Stage: If your Leader has the {Thriller
// Bark Pirates} type, play up to 1 {Thriller Bark Pirates} type Character card
// with a cost of 2 or less from your trash rested.

export const OP06_098_THRILLER_BARK: EffectSchema = {
  card_id: "OP06-098",
  card_name: "Thriller Bark",
  card_type: "Stage",
  effects: [
    {
      id: "OP06-098_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "DON_REST", amount: 1 },
        { type: "REST_SELF" },
      ],
      flags: { optional: true },
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
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: {
              traits: ["Thriller Bark Pirates"],
              card_type: "CHARACTER",
              cost_max: 2,
            },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Land of Wano / Shandian (OP06-099 to OP06-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP06-099 Aisa ──────────────────────────────────────────────────────────
// [On Play] Look at up to 1 card from the top of your or your opponent's Life
// cards and place it at the top or bottom of the Life cards.

export const OP06_099_AISA: EffectSchema = {
  card_id: "OP06-099",
  card_name: "Aisa",
  card_type: "Character",
  effects: [
    {
      id: "OP06-099_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "LIFE_SCRY",
          target: {
            type: "LIFE_CARD",
            controller: "EITHER",
            count: { up_to: 1 },
          },
          params: { look_at: 1 },
        },
      ],
    },
  ],
};

// ─── OP06-100 Inuarashi ─────────────────────────────────────────────────────
// [DON!! x2] [When Attacking] You may trash 1 card from your hand: K.O. up to
// 1 of your opponent's Characters with a cost equal to or less than the number
// of your opponent's Life cards.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_100_INUARASHI: EffectSchema = {
  card_id: "OP06-100",
  card_name: "Inuarashi",
  card_type: "Character",
  effects: [
    {
      id: "OP06-100_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
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
                source: "OPPONENT_LIFE_COUNT",
              },
            },
          },
        },
      ],
    },
    {
      id: "OP06-100_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-101 O-Nami ────────────────────────────────────────────────────────
// [On Play] Up to 1 of your Leader or Character cards gains [Banish] during
// this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 5 or
// less.

export const OP06_101_O_NAMI: EffectSchema = {
  card_id: "OP06-101",
  card_name: "O-Nami",
  card_type: "Character",
  effects: [
    {
      id: "OP06-101_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "OP06-101_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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
    },
  ],
};

// ─── OP06-102 Kamakiri ──────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may place 1 Stage with a cost of 1 at
// the bottom of the owner's deck: K.O. up to 1 of your opponent's Characters
// with a cost of 2 or less.
// [Trigger] If you have 2 or less Life cards, play this card.

export const OP06_102_KAMAKIRI: EffectSchema = {
  card_id: "OP06-102",
  card_name: "Kamakiri",
  card_type: "Character",
  effects: [
    {
      id: "OP06-102_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "PLACE_STAGE_TO_DECK",
          amount: 1,
          filter: { cost_exact: 1 },
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
            filter: { cost_max: 2 },
          },
        },
      ],
    },
    {
      id: "OP06-102_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-103 Kawamatsu ─────────────────────────────────────────────────────
// [When Attacking] You may trash 2 cards from your hand: Add up to 1 of your
// Characters with 0 power to the top or bottom of the owner's Life cards
// face-up.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_103_KAWAMATSU: EffectSchema = {
  card_id: "OP06-103",
  card_name: "Kawamatsu",
  card_type: "Character",
  effects: [
    {
      id: "OP06-103_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2 }],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { power_exact: 0 },
          },
          params: { face: "UP" },
        },
      ],
    },
    {
      id: "OP06-103_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-104 Kikunojo ──────────────────────────────────────────────────────
// [On K.O.] If your opponent has 3 or less Life cards, add up to 1 card from
// the top of your deck to the top of your Life cards.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_104_KIKUNOJO: EffectSchema = {
  card_id: "OP06-104",
  card_name: "Kikunojo",
  card_type: "Character",
  effects: [
    {
      id: "OP06-104_effect_1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
    {
      id: "OP06-104_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-106 Kouzuki Hiyori ────────────────────────────────────────────────
// [On Play] You may add 1 card from the top or bottom of your Life cards to
// your hand: Add up to 1 card from your hand to the top of your Life cards.

export const OP06_106_KOUZUKI_HIYORI: EffectSchema = {
  card_id: "OP06-106",
  card_name: "Kouzuki Hiyori",
  card_type: "Character",
  effects: [
    {
      id: "OP06-106_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          params: { amount: 1, position: "TOP" },
        },
      ],
    },
  ],
};

// ─── OP06-107 Kouzuki Momonosuke ────────────────────────────────────────────
// [Blocker]
// [On Play] Add up to 1 of your {Land of Wano} type Characters other than
// [Kouzuki Momonosuke] to the top or bottom of the owner's Life cards face-up.

export const OP06_107_KOUZUKI_MOMONOSUKE: EffectSchema = {
  card_id: "OP06-107",
  card_name: "Kouzuki Momonosuke",
  card_type: "Character",
  effects: [
    {
      id: "OP06-107_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP06-107_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_FIELD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["Land of Wano"],
              exclude_name: "Kouzuki Momonosuke",
            },
          },
          params: { face: "UP" },
        },
      ],
    },
  ],
};

// ─── OP06-109 Denjiro ───────────────────────────────────────────────────────
// [DON!! x2] If your opponent has 3 or less Life cards, this Character cannot
// be K.O.'d by effects.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_109_DENJIRO: EffectSchema = {
  card_id: "OP06-109",
  card_name: "Denjiro",
  card_type: "Character",
  effects: [
    {
      id: "OP06-109_effect_1",
      category: "permanent",
      conditions: {
        all_of: [
          { type: "DON_GIVEN", controller: "SELF", mode: "SPECIFIC_CARD", operator: ">=", value: 2 },
          {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: "<=",
            value: 3,
          },
        ],
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
    {
      id: "OP06-109_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-110 Nekomamushi ───────────────────────────────────────────────────
// [DON!! x2] This Character can also attack your opponent's active Characters.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_110_NEKOMAMUSHI: EffectSchema = {
  card_id: "OP06-110",
  card_name: "Nekomamushi",
  card_type: "Character",
  effects: [
    {
      id: "OP06-110_effect_1",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 2,
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
      id: "OP06-110_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-111 Braham ────────────────────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may place 1 Stage with a cost of 1 at
// the bottom of the owner's deck: Rest up to 1 of your opponent's Characters
// with a cost of 4 or less.
// [Trigger] If you have 2 or less Life cards, play this card.

export const OP06_111_BRAHAM: EffectSchema = {
  card_id: "OP06-111",
  card_name: "Braham",
  card_type: "Character",
  effects: [
    {
      id: "OP06-111_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        {
          type: "PLACE_STAGE_TO_DECK",
          amount: 1,
          filter: { cost_exact: 1 },
          position: "BOTTOM",
        },
      ],
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
      id: "OP06-111_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-112 Raizo ─────────────────────────────────────────────────────────
// [When Attacking] You may trash 1 card from your hand: Rest up to 1 of your
// opponent's DON!! cards.
// [Trigger] If your opponent has 3 or less Life cards, play this card.

export const OP06_112_RAIZO: EffectSchema = {
  card_id: "OP06-112",
  card_name: "Raizo",
  card_type: "Character",
  effects: [
    {
      id: "OP06-112_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "REST_OPPONENT_DON",
          params: { amount: 1 },
        },
      ],
    },
    {
      id: "OP06-112_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "OPPONENT",
        operator: "<=",
        value: 3,
      },
      actions: [
        { type: "PLAY_SELF" },
      ],
    },
  ],
};

// ─── OP06-113 Raki ──────────────────────────────────────────────────────────
// If you have a {Shandian Warrior} type Character other than [Raki], this
// Character gains [Blocker].

export const OP06_113_RAKI: EffectSchema = {
  card_id: "OP06-113",
  card_name: "Raki",
  card_type: "Character",
  effects: [
    {
      id: "OP06-113_effect_1",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          traits: ["Shandian Warrior"],
          card_type: "CHARACTER",
          exclude_name: "Raki",
        },
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

// ─── OP06-114 Wyper ─────────────────────────────────────────────────────────
// [On Play] You may place 1 Stage with a cost of 1 at the bottom of the
// owner's deck: Look at 5 cards from the top of your deck; reveal up to 1
// [Upper Yard] or {Shandian Warrior} type card and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.

export const OP06_114_WYPER: EffectSchema = {
  card_id: "OP06-114",
  card_name: "Wyper",
  card_type: "Character",
  effects: [
    {
      id: "OP06-114_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_STAGE_TO_DECK",
          amount: 1,
          filter: { cost_exact: 1 },
          position: "BOTTOM",
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Upper Yard" },
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

// ─── OP06-115 You're the One Who Should Disappear. (Event) ──────────────────
// [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or
// Character cards gains +3000 power during this battle.
// [Trigger] If you have 0 Life cards, you may add up to 1 card from the top of
// your deck to the top of your Life cards. Then, trash 1 card from your hand.

export const OP06_115_YOURE_THE_ONE_WHO_SHOULD_DISAPPEAR: EffectSchema = {
  card_id: "OP06-115",
  card_name: "You're the One Who Should Disappear.",
  card_type: "Event",
  effects: [
    {
      id: "OP06-115_effect_1",
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
    {
      id: "OP06-115_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "==",
        value: 0,
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP06-116 Reject (Event) ────────────────────────────────────────────────
// [Main] Choose one:
// • K.O. up to 1 of your opponent's Characters with a cost of 5 or less.
// • If your opponent has 1 Life card, deal 1 damage to your opponent. Then, add
//   1 card from the top of your Life cards to your hand.
// [Trigger] Draw 1 card.

export const OP06_116_REJECT: EffectSchema = {
  card_id: "OP06-116",
  card_name: "Reject",
  card_type: "Event",
  effects: [
    {
      id: "OP06-116_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
                    filter: { cost_max: 5 },
                  },
                },
              ],
              [
                {
                  type: "DEAL_DAMAGE",
                  target: { type: "PLAYER", controller: "OPPONENT" },
                  params: { amount: 1 },
                  conditions: {
                    type: "LIFE_COUNT",
                    controller: "OPPONENT",
                    operator: "==",
                    value: 1,
                  },
                },
                {
                  type: "LIFE_TO_HAND",
                  params: { amount: 1, position: "TOP" },
                  chain: "THEN",
                },
              ],
            ],
            labels: [
              "K.O. up to 1 opponent Character with cost 5 or less",
              "If opponent has 1 Life, deal 1 damage then add 1 Life to hand",
            ],
          },
        },
      ],
    },
    {
      id: "OP06-116_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── OP06-117 The Ark Maxim (Stage) ─────────────────────────────────────────
// [Activate: Main] [Once Per Turn] You may rest this card and 1 of your [Enel]
// cards: K.O. all of your opponent's Characters with a cost of 2 or less.

export const OP06_117_THE_ARK_MAXIM: EffectSchema = {
  card_id: "OP06-117",
  card_name: "The Ark Maxim",
  card_type: "Stage",
  effects: [
    {
      id: "OP06-117_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [
        { type: "REST_SELF" },
        { type: "REST_NAMED_CARD", filter: { name: "Enel" }, amount: 1 },
      ],
      actions: [
        {
          type: "KO",
          target: {
            type: "ALL_OPPONENT_CHARACTERS",
            filter: { cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── OP06-118 Roronoa Zoro ──────────────────────────────────────────────────
// [When Attacking] [Once Per Turn] ➀: Set this Character as active.
// [Activate: Main] [Once Per Turn] ➁: Set this Character as active.

export const OP06_118_RORONOA_ZORO: EffectSchema = {
  card_id: "OP06-118",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP06-118_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", once_per_turn: true },
      costs: [{ type: "DON_REST", amount: 1 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
    {
      id: "OP06-118_effect_2",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_REST", amount: 2 }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "SELF" },
        },
      ],
    },
  ],
};

// ─── OP06-119 Sanji ─────────────────────────────────────────────────────────
// [On Play] Reveal 1 card from the top of your deck and play up to 1 Character
// with a cost of 9 or less other than [Sanji]. Then, place the rest at the
// bottom of your deck.

export const OP06_119_SANJI: EffectSchema = {
  card_id: "OP06-119",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP06-119_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_AND_PLAY",
          params: {
            look_at: 1,
            filter: {
              card_type: "CHARACTER",
              cost_max: 9,
              exclude_name: "Sanji",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP06_SCHEMAS: Record<string, EffectSchema> = {
  // Red (FILM)
  "OP06-001": OP06_001_UTA,
  "OP06-002": OP06_002_INAZUMA,
  "OP06-003": OP06_003_EMPORIO_IVANKOV,
  "OP06-004": OP06_004_BARON_OMATSURI,
  "OP06-006": OP06_006_SAGA,
  "OP06-007": OP06_007_SHANKS,
  "OP06-009": OP06_009_SHURAIYA,
  "OP06-010": OP06_010_DOUGLAS_BULLET,
  "OP06-011": OP06_011_TOT_MUSICA,
  "OP06-012": OP06_012_BEAR_KING,
  "OP06-013": OP06_013_MONKEY_D_LUFFY,
  "OP06-014": OP06_014_RATCHET,
  "OP06-015": OP06_015_LILY_CARNATION,
  "OP06-016": OP06_016_RAISE_MAX,
  "OP06-017": OP06_017_METEOR_STRIKE_OF_LOVE,
  "OP06-018": OP06_018_GUM_GUM_KING_KONG_GATLING,
  "OP06-019": OP06_019_BLUE_DRAGON_SEAL_WATER_STREAM,

  // Green (Fish-Man / New Fish-Man Pirates)
  "OP06-020": OP06_020_HODY_JONES,
  "OP06-021": OP06_021_PERONA,
  "OP06-022": OP06_022_YAMATO,
  "OP06-023": OP06_023_ARLONG,
  "OP06-024": OP06_024_IKAROS_MUCH,
  "OP06-025": OP06_025_CAMIE,
  "OP06-026": OP06_026_KOUSHIROU,
  "OP06-027": OP06_027_GYRO,
  "OP06-028": OP06_028_ZEO,
  "OP06-029": OP06_029_DARUMA,
  "OP06-030": OP06_030_DOSUN,
  "OP06-032": OP06_032_HAMMOND,
  "OP06-033": OP06_033_VANDER_DECKEN_IX,
  "OP06-034": OP06_034_HYOUZOU,
  "OP06-035": OP06_035_HODY_JONES_CHARACTER,
  "OP06-036": OP06_036_RYUMA,
  "OP06-038": OP06_038_THE_BILLION_FOLD_WORLD,
  "OP06-039": OP06_039_YOU_AINT_EVEN_WORTH,
  "OP06-040": OP06_040_SHARK_ARROWS,
  "OP06-041": OP06_041_THE_ARK_NOAH,

  // Blue (Navy / East Blue)
  "OP06-042": OP06_042_VINSMOKE_REIJU,
  "OP06-043": OP06_043_ARAMAKI,
  "OP06-044": OP06_044_GION,
  "OP06-045": OP06_045_KUZAN,
  "OP06-046": OP06_046_SAKAZUKI,
  "OP06-047": OP06_047_CHARLOTTE_PUDDING,
  "OP06-048": OP06_048_ZEFF,
  "OP06-050": OP06_050_TASHIGI,
  "OP06-051": OP06_051_TSURU,
  "OP06-052": OP06_052_TOKIKAKE,
  "OP06-053": OP06_053_JAGUAR_D_SAUL,
  "OP06-054": OP06_054_BORSALINO,
  "OP06-055": OP06_055_MONKEY_D_GARP,
  "OP06-056": OP06_056_AMA_NO_MURAKUMO_SWORD,
  "OP06-057": OP06_057_BUT_I_WILL_NEVER_DOUBT,
  "OP06-058": OP06_058_GRAVITY_BLADE_RAGING_TIGER,
  "OP06-059": OP06_059_WHITE_SNAKE,

  // Purple (GERMA 66)
  "OP06-060": OP06_060_VINSMOKE_ICHIJI_3,
  "OP06-061": OP06_061_VINSMOKE_ICHIJI_7,
  "OP06-062": OP06_062_VINSMOKE_JUDGE,
  "OP06-063": OP06_063_VINSMOKE_SORA,
  "OP06-064": OP06_064_VINSMOKE_NIJI_3,
  "OP06-065": OP06_065_VINSMOKE_NIJI_5,
  "OP06-066": OP06_066_VINSMOKE_YONJI_2,
  "OP06-067": OP06_067_VINSMOKE_YONJI_4,
  "OP06-068": OP06_068_VINSMOKE_REIJU_2,
  "OP06-069": OP06_069_VINSMOKE_REIJU_4,
  "OP06-071": OP06_071_GILD_TESORO,
  "OP06-072": OP06_072_COSETTE,
  "OP06-073": OP06_073_SHIKI,
  "OP06-074": OP06_074_ZEPHYR,
  "OP06-075": OP06_075_COUNT_BATTLER,
  "OP06-076": OP06_076_HITOKIRI_KAMAZO,
  "OP06-077": OP06_077_BLACK_BUG,
  "OP06-078": OP06_078_GERMA_66,
  "OP06-079": OP06_079_KINGDOM_OF_GERMA,

  // Black (Thriller Bark Pirates)
  "OP06-080": OP06_080_GECKO_MORIA,
  "OP06-081": OP06_081_ABSALOM,
  "OP06-082": OP06_082_INUPPE,
  "OP06-083": OP06_083_OARS,
  "OP06-084": OP06_084_JIGORO_OF_THE_WIND,
  "OP06-085": OP06_085_KUMACY,
  "OP06-086": OP06_086_GECKO_MORIA_CHARACTER,
  "OP06-087": OP06_087_CERBERUS,
  "OP06-088": OP06_088_SAI,
  "OP06-089": OP06_089_TARALAN,
  "OP06-090": OP06_090_DR_HOGBACK,
  "OP06-091": OP06_091_VICTORIA_CINDRY,
  "OP06-092": OP06_092_BROOK,
  "OP06-093": OP06_093_PERONA,
  "OP06-095": OP06_095_SHADOWS_ASGARD,
  "OP06-096": OP06_096_NOTHING_AT_ALL,
  "OP06-097": OP06_097_NEGATIVE_HOLLOW,
  "OP06-098": OP06_098_THRILLER_BARK,

  // Yellow (Land of Wano / Shandian)
  "OP06-099": OP06_099_AISA,
  "OP06-100": OP06_100_INUARASHI,
  "OP06-101": OP06_101_O_NAMI,
  "OP06-102": OP06_102_KAMAKIRI,
  "OP06-103": OP06_103_KAWAMATSU,
  "OP06-104": OP06_104_KIKUNOJO,
  "OP06-106": OP06_106_KOUZUKI_HIYORI,
  "OP06-107": OP06_107_KOUZUKI_MOMONOSUKE,
  "OP06-109": OP06_109_DENJIRO,
  "OP06-110": OP06_110_NEKOMAMUSHI,
  "OP06-111": OP06_111_BRAHAM,
  "OP06-112": OP06_112_RAIZO,
  "OP06-113": OP06_113_RAKI,
  "OP06-114": OP06_114_WYPER,
  "OP06-115": OP06_115_YOURE_THE_ONE_WHO_SHOULD_DISAPPEAR,
  "OP06-116": OP06_116_REJECT,
  "OP06-117": OP06_117_THE_ARK_MAXIM,
  "OP06-118": OP06_118_RORONOA_ZORO,
  "OP06-119": OP06_119_SANJI,
};
