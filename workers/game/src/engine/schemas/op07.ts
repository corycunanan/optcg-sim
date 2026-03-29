/**
 * OP07 Effect Schemas
 *
 * Red (Revolutionary Army / Ace): OP07-001 to OP07-018
 * Green (Supernovas / Fish-Man / Wano): OP07-019 to OP07-037
 * Blue (Seven Warlords / Amazon Lily): OP07-038 to OP07-058
 * Purple (Foxy Pirates / Vinsmoke): OP07-059 to OP07-078
 * Black (CP / Thriller Bark): OP07-079 to OP07-096
 * Yellow (Egghead / Vegapunk): OP07-097 to OP07-119
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Revolutionary Army / Ace (OP07-001 to OP07-018)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP07-001 Monkey.D.Dragon (Leader) — ACTIVATE_MAIN redistribute DON ─────
// [Activate: Main] [Once Per Turn] Give up to 2 total of your currently given
// DON!! cards to 1 of your Characters.

export const OP07_001_MONKEY_D_DRAGON: EffectSchema = {
  card_id: "OP07-001",
  card_name: "Monkey.D.Dragon",
  card_type: "Leader",
  effects: [
    {
      id: "OP07-001_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "REDISTRIBUTE_DON",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
          },
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP07-002 Ain — ON_PLAY set opponent character power to 0 ───────────────
// [On Play] Set the power of up to 1 of your opponent's Characters to 0 during
// this turn.

export const OP07_002_AIN: EffectSchema = {
  card_id: "OP07-002",
  card_name: "Ain",
  card_type: "Character",
  effects: [
    {
      id: "OP07-002_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_POWER_TO_ZERO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-003 Outlook III — ACTIVATE_MAIN trash self, give -2000 to 2 chars ─
// [Activate: Main] You may trash this Character: Give up to 2 of your
// opponent's Characters -2000 power during this turn.

export const OP07_003_OUTLOOK_III: EffectSchema = {
  card_id: "OP07-003",
  card_name: "Outlook III",
  card_type: "Character",
  effects: [
    {
      id: "OP07-003_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      flags: { optional: true },
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
  ],
};

// ─── OP07-004 Curly.Dadan — ON_PLAY trash from hand + search deck ───────────
// [On Play] You may trash 1 card from your hand: Look at 5 cards from the top
// of your deck; reveal up to 1 Character card with 2000 power or less and add
// it to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP07_004_CURLY_DADAN: EffectSchema = {
  card_id: "OP07-004",
  card_name: "Curly.Dadan",
  card_type: "Character",
  effects: [
    {
      id: "OP07-004_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              card_type: "CHARACTER",
              power_max: 2000,
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP07-005 Carina — Blocker + ON_PLAY give -2000 power ───────────────────
// [Blocker]
// [On Play] Give up to 1 of your opponent's Characters -2000 power during this
// turn.

export const OP07_005_CARINA: EffectSchema = {
  card_id: "OP07-005",
  card_name: "Carina",
  card_type: "Character",
  effects: [
    {
      id: "OP07-005_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-005_effect_1",
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

// ─── OP07-006 Sterry — ON_PLAY leader power cost + draw + trash ─────────────
// [On Play] You may give your 1 active Leader -5000 power during this turn:
// Draw 1 card and trash 1 card from your hand.

export const OP07_006_STERRY: EffectSchema = {
  card_id: "OP07-006",
  card_name: "Sterry",
  card_type: "Character",
  effects: [
    {
      id: "OP07-006_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LEADER_POWER_REDUCTION", amount: 5000 }],
      flags: { optional: true },
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

// ─── OP07-008 Mr. Tanaka — Blocker + Trigger play self ─────────────────────
// [Blocker]
// [Trigger] Play this card.

export const OP07_008_MR_TANAKA: EffectSchema = {
  card_id: "OP07-008",
  card_name: "Mr. Tanaka",
  card_type: "Character",
  effects: [
    {
      id: "OP07-008_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-008_trigger",
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

// ─── OP07-009 Dogura & Magura — ON_PLAY give Double Attack to red cost 1 ────
// [On Play] Up to 1 of your red Characters with a cost of 1 gains [Double
// Attack] during this turn.

export const OP07_009_DOGURA_MAGURA: EffectSchema = {
  card_id: "OP07-009",
  card_name: "Dogura & Magura",
  card_type: "Character",
  effects: [
    {
      id: "OP07-009_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "RED", cost_exact: 1 },
          },
          params: { keyword: "DOUBLE_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-010 Baccarat — Blocker + ON_OPPONENT_ATTACK trash from hand for +2000
// [Blocker]
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
// hand: Up to 1 of your Leader or Character cards gains +2000 power during this
// battle.

export const OP07_010_BACCARAT: EffectSchema = {
  card_id: "OP07-010",
  card_name: "Baccarat",
  card_type: "Character",
  effects: [
    {
      id: "OP07-010_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-010_effect_1",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
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
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP07-011 Bluejam — DON!! x1 WHEN_ATTACKING KO opponent 2000 power ─────
// [DON!! x1] [When Attacking] K.O. up to 1 of your opponent's Characters with
// 2000 power or less.

export const OP07_011_BLUEJAM: EffectSchema = {
  card_id: "OP07-011",
  card_name: "Bluejam",
  card_type: "Character",
  effects: [
    {
      id: "OP07-011_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP07-012 Porchemy — ON_PLAY give -1000 power ──────────────────────────
// [On Play] Give up to 1 of your opponent's Characters -1000 power during this
// turn.

export const OP07_012_PORCHEMY: EffectSchema = {
  card_id: "OP07-012",
  card_name: "Porchemy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-012_effect_1",
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
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-013 Masked Deuce — ON_PLAY conditional search deck ────────────────
// [On Play] If your Leader is [Portgas.D.Ace], look at 5 cards from the top of
// your deck; reveal up to 1 [Portgas.D.Ace] or red Event and add it to your
// hand. Then, place the rest at the bottom of your deck in any order.

export const OP07_013_MASKED_DEUCE: EffectSchema = {
  card_id: "OP07-013",
  card_name: "Masked Deuce",
  card_type: "Character",
  effects: [
    {
      id: "OP07-013_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Portgas.D.Ace" },
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              any_of: [
                { name: "Portgas.D.Ace" },
                { color: "RED", card_type: "EVENT" },
              ],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP07-014 Moda — YOUR_TURN ON_PLAY give Ace +2000 ──────────────────────
// [Your Turn] [On Play] Up to 1 of your [Portgas.D.Ace] cards gains +2000
// power during this turn.

export const OP07_014_MODA: EffectSchema = {
  card_id: "OP07-014",
  card_name: "Moda",
  card_type: "Character",
  effects: [
    {
      id: "OP07-014_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Portgas.D.Ace" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-015 Monkey.D.Dragon — Rush + ON_PLAY give rested DON ─────────────
// [Rush]
// [On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your
// Characters.

export const OP07_015_MONKEY_D_DRAGON: EffectSchema = {
  card_id: "OP07-015",
  card_name: "Monkey.D.Dragon",
  card_type: "Character",
  effects: [
    {
      id: "OP07-015_keywords",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "OP07-015_effect_1",
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
          params: { amount: 2 },
        },
      ],
    },
  ],
};

// ─── OP07-016 Galaxy Wink — MAIN_EVENT +2000 to Revolutionary Army + -1000 ──
// [Main] Up to 1 of your {Revolutionary Army} type Characters gains +2000 power
// during this turn. Then, give up to 1 of your opponent's Characters -1000 power
// during this turn.
// [Trigger] Activate this card's [Main] effect.

export const OP07_016_GALAXY_WINK: EffectSchema = {
  card_id: "OP07-016",
  card_name: "Galaxy Wink",
  card_type: "Event",
  effects: [
    {
      id: "OP07-016_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
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
      id: "OP07-016_trigger",
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

// ─── OP07-017 Dragon Breath — MAIN_EVENT KO char + KO stage ────────────────
// [Main] K.O. up to 1 of your opponent's Characters with 3000 power or less and
// up to 1 of your opponent's Stages with a cost of 1 or less.
// [Trigger] Activate this card's [Main] effect.

export const OP07_017_DRAGON_BREATH: EffectSchema = {
  card_id: "OP07-017",
  card_name: "Dragon Breath",
  card_type: "Event",
  effects: [
    {
      id: "OP07-017_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
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
        {
          type: "KO",
          target: {
            type: "STAGE",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 1 },
          },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP07-017_trigger",
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

// ─── OP07-018 KEEP OUT — COUNTER +2000 to Revolutionary Army until next turn ─
// [Counter] Up to 1 of your {Revolutionary Army} type Characters gains +2000
// power until the end of your next turn.
// [Trigger] Activate this card's [Counter] effect.

export const OP07_018_KEEP_OUT: EffectSchema = {
  card_id: "OP07-018",
  card_name: "KEEP OUT",
  card_type: "Event",
  effects: [
    {
      id: "OP07-018_effect_1",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Revolutionary Army"] },
          },
          params: { amount: 2000 },
          duration: { type: "UNTIL_END_OF_YOUR_NEXT_TURN" },
        },
      ],
    },
    {
      id: "OP07-018_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "REUSE_EFFECT",
          params: { target_effect: "COUNTER_EVENT" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — Supernovas / Fish-Man / Wano (OP07-019 to OP07-037)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP07-019 Jewelry Bonney (Leader) — ON_OPPONENT_ATTACK DON rest cost, rest opponent
// [On Your Opponent's Attack] [Once Per Turn] ➀: Rest up to 1 of your
// opponent's Leader or Character cards.

export const OP07_019_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP07-019",
  card_name: "Jewelry Bonney",
  card_type: "Leader",
  effects: [
    {
      id: "OP07-019_effect_1",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true },
      costs: [{ type: "DON_REST", amount: 1 }],
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
  ],
};

// ─── OP07-020 Aladine — Blocker + ON_KO conditional play from hand ──────────
// [Blocker]
// [On K.O.] If your Leader has the {Fish-Man} type, play up to 1 {Fish-Man} or
// {Merfolk} type Character card with a cost of 3 or less from your hand.

export const OP07_020_ALADINE: EffectSchema = {
  card_id: "OP07-020",
  card_name: "Aladine",
  card_type: "Character",
  effects: [
    {
      id: "OP07-020_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-020_effect_1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Fish-Man" },
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits_any_of: ["Fish-Man", "Merfolk"],
              cost_max: 3,
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP07-021 Urouge — Blocker + END_OF_YOUR_TURN set DON active ────────────
// [Blocker]
// [End of Your Turn] Set up to 1 of your DON!! cards as active.

export const OP07_021_UROUGE: EffectSchema = {
  card_id: "OP07-021",
  card_name: "Urouge",
  card_type: "Character",
  effects: [
    {
      id: "OP07-021_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-021_effect_1",
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

// ─── OP07-022 Otama — ON_PLAY search deck for green Land of Wano ────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 green
// {Land of Wano} type card other than [Otama] and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.

export const OP07_022_OTAMA: EffectSchema = {
  card_id: "OP07-022",
  card_name: "Otama",
  card_type: "Character",
  effects: [
    {
      id: "OP07-022_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              color: "GREEN",
              traits: ["Land of Wano"],
              exclude_name: "Otama",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP07-023 Caribou — Conditional +1000 power + Blocker ───────────────────
// If you have 6 or more rested DON!! cards, this Character gains +1000 power.
// [Blocker]

export const OP07_023_CARIBOU: EffectSchema = {
  card_id: "OP07-023",
  card_name: "Caribou",
  card_type: "Character",
  effects: [
    {
      id: "OP07-023_effect_1",
      category: "permanent",
      conditions: {
        type: "RESTED_CARD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 6,
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
      id: "OP07-023_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP07-024 Koala — ON_OPPONENT_ATTACK rest self cost, give Blocker ───────
// [On Your Opponent's Attack] You may rest this Character: Up to 1 of your
// {Fish-Man} type Characters with a cost of 5 or less gains [Blocker] during
// this turn.

export const OP07_024_KOALA: EffectSchema = {
  card_id: "OP07-024",
  card_name: "Koala",
  card_type: "Character",
  effects: [
    {
      id: "OP07-024_effect_1",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "REST_SELF" }],
      flags: { optional: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Fish-Man"], cost_max: 5 },
          },
          params: { keyword: "BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-025 Coribou — ON_PLAY play Caribou from hand rested ───────────────
// [On Play] Play up to 1 [Caribou] with a cost of 4 or less from your hand
// rested.

export const OP07_025_CORIBOU: EffectSchema = {
  card_id: "OP07-025",
  card_name: "Coribou",
  card_type: "Character",
  effects: [
    {
      id: "OP07-025_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Caribou", cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP07-026 Jewelry Bonney — ON_PLAY skip opponent refresh ────────────────
// [On Play] Up to 1 of your opponent's rested Character or DON!! cards will not
// become active in your opponent's next Refresh Phase.

export const OP07_026_JEWELRY_BONNEY: EffectSchema = {
  card_id: "OP07-026",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "OP07-026_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

// ─── OP07-029 Basil Hawkins — Conditional Blocker + replacement effect ──────
// If your Leader has the {Supernovas} type, this Character gains [Blocker].
// [Once Per Turn] If this Character would be removed from the field by your
// opponent's effect, you may rest 1 of your opponent's Characters instead.

export const OP07_029_BASIL_HAWKINS: EffectSchema = {
  card_id: "OP07-029",
  card_name: "Basil Hawkins",
  card_type: "Character",
  effects: [
    {
      id: "OP07-029_effect_1",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Supernovas" },
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
      id: "OP07-029_effect_2",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP07-030 Pappag — Conditional Blocker if Camie on field ────────────────
// If you have a [Camie] Character, this Character gains [Blocker].

export const OP07_030_PAPPAG: EffectSchema = {
  card_id: "OP07-030",
  card_name: "Pappag",
  card_type: "Character",
  effects: [
    {
      id: "OP07-030_effect_1",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { name: "Camie", card_type: "CHARACTER" },
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

// ─── OP07-031 Bartolomeo — Blocker + YOUR_TURN rest trigger draw/trash ──────
// [Blocker]
// [Your Turn] [Once Per Turn] If a Character is rested by your effect, draw 1
// card and trash 1 card from your hand.

export const OP07_031_BARTOLOMEO: EffectSchema = {
  card_id: "OP07-031",
  card_name: "Bartolomeo",
  card_type: "Character",
  effects: [
    {
      id: "OP07-031_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-031_effect_1",
      category: "auto",
      trigger: {
        event: "CHARACTER_BECOMES_RESTED",
        filter: { cause: "BY_YOUR_EFFECT" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
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
      ],
    },
  ],
};

// ─── OP07-032 Fisher Tiger — Rush Character + ON_PLAY rest opponent char ────
// This Character can attack Characters on the turn in which it is played.
// [On Play] If your Leader has the {Fish-Man} or {Merfolk} type, rest up to 1
// of your opponent's Characters with a cost of 6 or less.

export const OP07_032_FISHER_TIGER: EffectSchema = {
  card_id: "OP07-032",
  card_name: "Fisher Tiger",
  card_type: "Character",
  effects: [
    {
      id: "OP07-032_keywords",
      category: "permanent",
      flags: { keywords: ["RUSH_CHARACTER"] },
    },
    {
      id: "OP07-032_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Fish-Man" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Merfolk" },
          },
        ],
      },
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

// ─── OP07-033 Monkey.D.Luffy — Permanent protection for cost 3 or less chars
// If you have 3 or more Characters, your Characters with a cost of 3 or less
// other than [Monkey.D.Luffy] cannot be K.O.'d by your opponent's effects.

export const OP07_033_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP07-033",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-033_effect_1",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER" },
        count: { operator: ">=", value: 3 },
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: { cost_max: 3, exclude_name: "Monkey.D.Luffy" },
          },
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
  ],
};

// ─── OP07-034 Roronoa Zoro — WHEN_ATTACKING conditional +2000 ──────────────
// [When Attacking] If you have 3 or more Characters, this Character gains +2000
// power during this turn.

export const OP07_034_RORONOA_ZORO: EffectSchema = {
  card_id: "OP07-034",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "OP07-034_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER" },
        count: { operator: ">=", value: 3 },
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

// ─── OP07-035 Karmic Punishment — COUNTER +2000 + conditional +1000 + Trigger KO
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 3 or more Characters, that card gains an
// additional +1000 power during this battle.
// [Trigger] K.O. up to 1 of your opponent's rested Characters with a cost of 4
// or less.

export const OP07_035_KARMIC_PUNISHMENT: EffectSchema = {
  card_id: "OP07-035",
  card_name: "Karmic Punishment",
  card_type: "Event",
  effects: [
    {
      id: "OP07-035_effect_1",
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
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER" },
            count: { operator: ">=", value: 3 },
          },
        },
      ],
    },
    {
      id: "OP07-035_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
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

// ─── OP07-036 Demonic Aura Nine-Sword Style Asura Demon Nine Flash ──────────
// [Main] Up to 1 of your Leader or Character cards gains +3000 power during
// this turn. Then, you may rest 1 of your Characters with a cost of 3 or more.
// If you do, rest up to 1 of your opponent's Characters with a cost of 5 or less.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP07_036_DEMONIC_AURA: EffectSchema = {
  card_id: "OP07-036",
  card_name: "Demonic Aura Nine-Sword Style Asura Demon Nine Flash",
  card_type: "Event",
  effects: [
    {
      id: "OP07-036_effect_1",
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
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { cost_min: 3 },
          },
          chain: "THEN",
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
          chain: "IF_DO",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "OP07-036_trigger",
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

// ─── OP07-037 More Pizza!! — MAIN_EVENT search deck for Supernovas + Trigger draw
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas}
// type card other than [More Pizza!!] and add it to your hand. Then, place the
// rest at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP07_037_MORE_PIZZA: EffectSchema = {
  card_id: "OP07-037",
  card_name: "More Pizza!!",
  card_type: "Event",
  effects: [
    {
      id: "OP07-037_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Supernovas"],
              exclude_name: "More Pizza!!",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP07-037_trigger",
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

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE — Seven Warlords / Amazon Lily (OP07-038 to OP07-058)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP07-038 Boa Hancock (Leader) — YOUR_TURN once per turn, draw on removal
// [Your Turn] [Once Per Turn] This effect can be activated when a Character is
// removed from the field by your effect. If you have 5 or less cards in your
// hand, draw 1 card.

export const OP07_038_BOA_HANCOCK: EffectSchema = {
  card_id: "OP07-038",
  card_name: "Boa Hancock",
  card_type: "Leader",
  effects: [
    {
      id: "OP07-038_effect_1",
      category: "auto",
      trigger: {
        event: "CHARACTER_RETURNED_TO_HAND",
        filter: { cause: "BY_YOUR_EFFECT" },
        turn_restriction: "YOUR_TURN",
        once_per_turn: true,
      },
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 5,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP07-039 Edward Weevil — DON!! x1 WHEN_ATTACKING scry 3 ──────────────
// [DON!! x1] [When Attacking] Look at 3 cards from the top of your deck and
// place them at the top or bottom of the deck in any order.

export const OP07_039_EDWARD_WEEVIL: EffectSchema = {
  card_id: "OP07-039",
  card_name: "Edward Weevil",
  card_type: "Character",
  effects: [
    {
      id: "OP07-039_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "DECK_SCRY",
          params: { look_at: 3 },
        },
      ],
    },
  ],
};

// ─── OP07-040 Crocodile — ON_PLAY DON rest cost, return to hand ────────────
// [On Play] ①: Return up to 1 Character with a cost of 2 or less to the
// owner's hand.

export const OP07_040_CROCODILE: EffectSchema = {
  card_id: "OP07-040",
  card_name: "Crocodile",
  card_type: "Character",
  effects: [
    {
      id: "OP07-040_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_REST", amount: 1 }],
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

// ─── OP07-041 Gloriosa (Grandma Nyon) — ON_PLAY search deck ────────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Amazon
// Lily} or {Kuja Pirates} type card other than [Gloriosa (Grandma Nyon)] and add
// it to your hand. Then, place the rest at the bottom of your deck in any order.

export const OP07_041_GLORIOSA: EffectSchema = {
  card_id: "OP07-041",
  card_name: "Gloriosa (Grandma Nyon)",
  card_type: "Character",
  effects: [
    {
      id: "OP07-041_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Amazon Lily", "Kuja Pirates"],
              exclude_name: "Gloriosa (Grandma Nyon)",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP07-042 Gecko Moria — Conditional replacement effect ──────────────────
// [Once Per Turn] If your Leader has the {The Seven Warlords of the Sea} type
// and this Character would be removed from the field by your opponent's effect,
// you may place 1 of your Characters other than [Gecko Moria] at the bottom of
// the owner's deck instead.

export const OP07_042_GECKO_MORIA: EffectSchema = {
  card_id: "OP07-042",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "OP07-042_effect_1",
      category: "replacement",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Seven Warlords of the Sea" },
      },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { exclude_name: "Gecko Moria" },
          },
          params: { position: "BOTTOM" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP07-043 Salome — YOUR_TURN ON_PLAY give Boa Hancock +2000 ────────────
// [Your Turn] [On Play] Up to 1 of your [Boa Hancock] cards gains +2000 power
// during this turn.

export const OP07_043_SALOME: EffectSchema = {
  card_id: "OP07-043",
  card_name: "Salome",
  card_type: "Character",
  effects: [
    {
      id: "OP07-043_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Boa Hancock" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-044 Dracule Mihawk — ON_PLAY draw 1 ─────────────────────────────
// [On Play] Draw 1 card.

export const OP07_044_DRACULE_MIHAWK: EffectSchema = {
  card_id: "OP07-044",
  card_name: "Dracule Mihawk",
  card_type: "Character",
  effects: [
    {
      id: "OP07-044_effect_1",
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

// ─── OP07-045 Jinbe — ON_PLAY play Seven Warlords from hand ────────────────
// [On Play] Play up to 1 {The Seven Warlords of the Sea} type Character card
// with a cost of 4 or less other than [Jinbe] from your hand.

export const OP07_045_JINBE: EffectSchema = {
  card_id: "OP07-045",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "OP07-045_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              traits: ["The Seven Warlords of the Sea"],
              cost_max: 4,
              exclude_name: "Jinbe",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP07-046 Sengoku — ON_PLAY search deck for Seven Warlords ─────────────
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {The
// Seven Warlords of the Sea} type card and add it to your hand. Then, place the
// rest at the bottom of your deck in any order.

export const OP07_046_SENGOKU: EffectSchema = {
  card_id: "OP07-046",
  card_name: "Sengoku",
  card_type: "Character",
  effects: [
    {
      id: "OP07-046_effect_1",
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
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

// ─── OP07-047 Trafalgar Law — ACTIVATE_MAIN return self, opponent places card
// [Activate: Main] You may return this Character to the owner's hand: If your
// opponent has 6 or more cards in their hand, your opponent places 1 card from
// their hand at the bottom of their deck.

export const OP07_047_TRAFALGAR_LAW: EffectSchema = {
  card_id: "OP07-047",
  card_name: "Trafalgar Law",
  card_type: "Character",
  effects: [
    {
      id: "OP07-047_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      conditions: {
        type: "HAND_COUNT",
        controller: "OPPONENT",
        operator: ">=",
        value: 6,
      },
      flags: { optional: true },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
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

// ─── OP07-048 Donquixote Doflamingo (Character) — Activate reveal conditional play
// [Activate: Main] [Once Per Turn] ➁: Reveal 1 card from the top of your deck.
// If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less,
// you may play that card rested. Then, place the rest at the bottom of your deck.

export const OP07_048_DONQUIXOTE_DOFLAMINGO: EffectSchema = {
  card_id: "OP07-048",
  card_name: "Donquixote Doflamingo",
  card_type: "Character",
  effects: [
    {
      id: "activate_reveal_play",
      category: "activate",
      costs: [{ type: "DON_REST", amount: 2 }],
      flags: { once_per_turn: true },
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
        {
          type: "RETURN_TO_DECK",
          target_ref: "revealed",
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP07-049 Buckin — ON_PLAY play Edward Weevil from hand rested ──────────
// [On Play] Play up to 1 [Edward Weevil] with a cost of 4 or less from your
// hand rested.

export const OP07_049_BUCKIN: EffectSchema = {
  card_id: "OP07-049",
  card_name: "Buckin",
  card_type: "Character",
  effects: [
    {
      id: "OP07-049_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Edward Weevil", cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP07-050 Boa Sandersonia — ON_PLAY conditional return to hand ──────────
// [On Play] If you have 2 or more {Amazon Lily} or {Kuja Pirates} type
// Characters on your field, return up to 1 of your opponent's Characters with a
// cost of 3 or less to the owner's hand.

export const OP07_050_BOA_SANDERSONIA: EffectSchema = {
  card_id: "OP07-050",
  card_name: "Boa Sandersonia",
  card_type: "Character",
  effects: [
    {
      id: "OP07-050_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          card_type: "CHARACTER",
          traits_any_of: ["Amazon Lily", "Kuja Pirates"],
        },
        count: { operator: ">=", value: 2 },
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP07-051 Boa Hancock — ON_PLAY cannot attack + return to deck ──────────
// [On Play] Up to 1 of your opponent's Characters other than [Monkey.D.Luffy]
// cannot attack until the end of your opponent's next turn. Then, place up to 1
// Character with a cost of 1 or less at the bottom of the owner's deck.

export const OP07_051_BOA_HANCOCK: EffectSchema = {
  card_id: "OP07-051",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      id: "OP07-051_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { exclude_name: "Monkey.D.Luffy" },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
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
  ],
};

// ─── OP07-052 Boa Marigold — ON_PLAY conditional return to deck ─────────────
// [On Play] If you have 2 or more {Amazon Lily} or {Kuja Pirates} type
// Characters on your field, place up to 1 Character with a cost of 2 or less at
// the bottom of the owner's deck.

export const OP07_052_BOA_MARIGOLD: EffectSchema = {
  card_id: "OP07-052",
  card_name: "Boa Marigold",
  card_type: "Character",
  effects: [
    {
      id: "OP07-052_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: {
          card_type: "CHARACTER",
          traits_any_of: ["Amazon Lily", "Kuja Pirates"],
        },
        count: { operator: ">=", value: 2 },
      },
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

// ─── OP07-053 Portgas.D.Ace — Blocker + ON_PLAY draw 2 place 2 ─────────────
// [Blocker]
// [On Play] Draw 2 cards and place 2 cards from your hand at the top or bottom
// of your deck in any order.

export const OP07_053_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP07-053",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "OP07-053_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-053_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "BOTTOM" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-054 Marguerite — Blocker + ON_PLAY draw 1 ────────────────────────
// [Blocker]
// [On Play] Draw 1 card.

export const OP07_054_MARGUERITE: EffectSchema = {
  card_id: "OP07-054",
  card_name: "Marguerite",
  card_type: "Character",
  effects: [
    {
      id: "OP07-054_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-054_effect_1",
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

// ─── OP07-055 Snake Dance — COUNTER +4000 + return own char + Trigger ───────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, return up to 1 of your Characters to the owner's hand.
// [Trigger] You may return 1 of your Characters to the owner's hand: Return up
// to 1 of your opponent's Characters with a cost of 5 or less to the owner's
// hand.

export const OP07_055_SNAKE_DANCE: EffectSchema = {
  card_id: "OP07-055",
  card_name: "Snake Dance",
  card_type: "Event",
  effects: [
    {
      id: "OP07-055_effect_1",
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
          type: "RETURN_TO_HAND",
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
      id: "OP07-055_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND" }],
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP07-056 Slave Arrow — COUNTER return own char cost, +4000 + Trigger ───
// [Counter] You may return 1 of your Characters with a cost of 2 or more to the
// owner's hand: Up to 1 of your Leader or Character cards gains +4000 power
// during this battle.
// [Trigger] Draw 2 cards and place 2 cards from your hand at the bottom of your
// deck in any order.

export const OP07_056_SLAVE_ARROW: EffectSchema = {
  card_id: "OP07-056",
  card_name: "Slave Arrow",
  card_type: "Event",
  effects: [
    {
      id: "OP07-056_effect_1",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        {
          type: "RETURN_OWN_CHARACTER_TO_HAND",
          filter: { cost_min: 2 },
        },
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "OP07-056_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "PLACE_HAND_TO_DECK",
          params: { amount: 2, position: "BOTTOM" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-057 Perfume Femur — MAIN_EVENT +2000 + cannot activate Blocker ────
// [Main] Select up to 1 of your {The Seven Warlords of the Sea} type Leader or
// Character cards and that card gains +2000 power during this turn. Then, if
// the selected card attacks during this turn, your opponent cannot activate
// [Blocker].
// [Trigger] Draw 1 card.

export const OP07_057_PERFUME_FEMUR: EffectSchema = {
  card_id: "OP07-057",
  card_name: "Perfume Femur",
  card_type: "Event",
  effects: [
    {
      id: "OP07-057_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["The Seven Warlords of the Sea"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
          result_ref: "selected_card",
        },
        {
          type: "GRANT_KEYWORD",
          target_ref: "selected_card",
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP07-057_trigger",
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

// ─── OP07-058 Island of Women — ACTIVATE_MAIN trash from hand + rest stage ──
// [Activate: Main] You may trash 1 card from your hand and rest this Stage: If
// your Leader has the {Kuja Pirates} type, return up to 1 of your {Amazon Lily}
// or {Kuja Pirates} type Characters to the owner's hand.

export const OP07_058_ISLAND_OF_WOMEN: EffectSchema = {
  card_id: "OP07-058",
  card_name: "Island of Women",
  card_type: "Stage",
  effects: [
    {
      id: "OP07-058_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type: "REST_SELF" },
      ],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Kuja Pirates" },
      },
      flags: { optional: true },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_any_of: ["Amazon Lily", "Kuja Pirates"] },
          },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PURPLE — Foxy Pirates / Vinsmoke (OP07-059 to OP07-078)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP07-059 Foxy (Leader) — WHEN_ATTACKING DON -3 cost, skip refresh ──────
// [When Attacking] DON!! -3: If you have 3 or more {Foxy Pirates} type
// Characters, select your opponent's rested Leader and up to 1 Character card.
// The selected cards will not become active in your opponent's next Refresh Phase.

export const OP07_059_FOXY: EffectSchema = {
  card_id: "OP07-059",
  card_name: "Foxy",
  card_type: "Leader",
  effects: [
    {
      id: "OP07-059_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "DON_MINUS", amount: 3 }],
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", traits: ["Foxy Pirates"] },
        count: { operator: ">=", value: 3 },
      },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "OPPONENT_LEADER",
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-060 Itomimizu — ACTIVATE_MAIN conditional add DON rested ──────────
// [Activate: Main] [Once Per Turn] If your Leader has the {Foxy Pirates} type
// and you have no other [Itomimizu], add up to 1 DON!! card from your DON!!
// deck and rest it.

export const OP07_060_ITOMIMIZU: EffectSchema = {
  card_id: "OP07-060",
  card_name: "Itomimizu",
  card_type: "Character",
  effects: [
    {
      id: "OP07-060_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Foxy Pirates" },
          },
          {
            not: {
              type: "CARD_ON_FIELD",
              controller: "SELF",
              filter: { name: "Itomimizu", exclude_self: true },
            },
          },
        ],
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

// ─── OP07-061 Vinsmoke Sanji — ON_PLAY DON -1 cost, conditional draw ────────
// [On Play] DON!! -1: If your Leader has the {The Vinsmoke Family} type, draw
// 1 card.

export const OP07_061_VINSMOKE_SANJI: EffectSchema = {
  card_id: "OP07-061",
  card_name: "Vinsmoke Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP07-061_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "The Vinsmoke Family" },
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── OP07-062 Vinsmoke Reiju — ON_PLAY conditional return own char ──────────
// [On Play] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field, return up to 1 of your {The Vinsmoke
// Family} type Characters with a cost of 1 to the owner's hand.

export const OP07_062_VINSMOKE_REIJU: EffectSchema = {
  card_id: "OP07-062",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "OP07-062_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["The Vinsmoke Family"], cost_exact: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP07-063 Capote — ON_PLAY DON -1, opponent char cannot attack ──────────
// [On Play] DON!! -1: If your Leader has the {Foxy Pirates} type, up to 1 of
// your opponent's Characters with a cost of 6 or less cannot attack until the
// end of your opponent's next turn.

export const OP07_063_CAPOTE: EffectSchema = {
  card_id: "OP07-063",
  card_name: "Capote",
  card_type: "Character",
  effects: [
    {
      id: "OP07-063_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Foxy Pirates" },
      },
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
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-064 Sanji — DEFERRED (HAND_ZONE_MODIFIER)
// [Blocker] keyword only — hand cost reduction deferred.
// See docs/game-engine/DEFERRED-CARD-EFFECTS.md

export const OP07_064_SANJI: EffectSchema = {
  card_id: "OP07-064",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "OP07-064_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP07-065 Gina — ON_PLAY conditional add DON active ─────────────────────
// [On Play] If your Leader has the {Foxy Pirates} type and the number of DON!!
// cards on your field is equal to or less than the number on your opponent's
// field, add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP07_065_GINA: EffectSchema = {
  card_id: "OP07-065",
  card_name: "Gina",
  card_type: "Character",
  effects: [
    {
      id: "OP07-065_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Foxy Pirates" },
          },
          {
            type: "COMPARATIVE",
            metric: "DON_FIELD_COUNT",
            operator: "<=",
          },
        ],
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "ACTIVE" },
        },
      ],
    },
  ],
};

// ─── OP07-066 Tony Tony.Chopper — Blocker + ON_PLAY conditional add DON rested
// [Blocker]
// [On Play] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field, add up to 1 DON!! card from your DON!!
// deck and rest it.

export const OP07_066_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP07-066",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "OP07-066_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-066_effect_1",
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

// ─── OP07-068 Hamburg — DON x1 WHEN_ATTACKING conditional add DON rested ────
// [DON!! x1] [When Attacking] If the number of DON!! cards on your field is
// equal to or less than the number on your opponent's field, add up to 1 DON!!
// card from your DON!! deck and rest it.

export const OP07_068_HAMBURG: EffectSchema = {
  card_id: "OP07-068",
  card_name: "Hamburg",
  card_type: "Character",
  effects: [
    {
      id: "OP07-068_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
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

// ─── OP07-069 Pickles — Conditional KO protection for Foxy Pirates ──────────
// If the number of DON!! cards on your field is equal to or less than the number
// on your opponent's field, your {Foxy Pirates} type Characters other than
// [Pickles] cannot be K.O.'d by your opponent's effects.

export const OP07_069_PICKLES: EffectSchema = {
  card_id: "OP07-069",
  card_name: "Pickles",
  card_type: "Character",
  effects: [
    {
      id: "OP07-069_effect_1",
      category: "permanent",
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: {
              traits: ["Foxy Pirates"],
              exclude_name: "Pickles",
            },
          },
          scope: { cause: "BY_OPPONENT_EFFECT" },
        },
      ],
    },
  ],
};

// ─── OP07-070 Big Bun — ON_PLAY conditional play Foxy Pirates from hand ─────
// [On Play] If the number of DON!! cards on your field is equal to or less than
// the number on your opponent's field, play up to 1 {Foxy Pirates} type card
// with a cost of 4 or less from your hand.

export const OP07_070_BIG_BUN: EffectSchema = {
  card_id: "OP07-070",
  card_name: "Big Bun",
  card_type: "Character",
  effects: [
    {
      id: "OP07-070_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Foxy Pirates"], cost_max: 4 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP07-071 Foxy — Permanent aura -1000 to opponent chars + ACTIVATE_MAIN DON
// [Opponent's Turn] If your Leader has the {Foxy Pirates} type, give all of
// your opponent's Characters -1000 power.
// [Activate: Main] [Once Per Turn] Add up to 1 DON!! card from your DON!! deck
// and rest it.

export const OP07_071_FOXY: EffectSchema = {
  card_id: "OP07-071",
  card_name: "Foxy",
  card_type: "Character",
  effects: [
    {
      // [Opponent's Turn] scoped permanent: only active during opponent's turn
      id: "OP07-071_effect_1",
      category: "permanent",
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Foxy Pirates" },
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -1000 },
        },
      ],
    },
    {
      id: "OP07-071_effect_2",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP07-072 Porche — ON_PLAY DON -1 search deck + play purple char ────────
// [On Play] DON!! -1: Look at 5 cards from the top of your deck; reveal up to
// 1 {Foxy Pirates} type card and add it to your hand. Then, place the rest at
// the bottom of your deck in any order and play up to 1 purple Character card
// with 4000 power or less from your hand.

export const OP07_072_PORCHE: EffectSchema = {
  card_id: "OP07-072",
  card_name: "Porche",
  card_type: "Character",
  effects: [
    {
      id: "OP07-072_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits: ["Foxy Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "PURPLE", card_type: "CHARACTER", power_max: 4000 },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP07-073 Monkey.D.Luffy — ACTIVATE_MAIN DON -3 set self active ────────
// [Activate: Main] [Once Per Turn] DON!! -3: If your opponent has 3 or more
// Characters, set this Character as active.

export const OP07_073_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP07-073",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-073_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 3 }],
      flags: { once_per_turn: true },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER" },
        count: { operator: ">=", value: 3 },
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

// ─── OP07-074 Monda — ACTIVATE_MAIN trash self, add DON rested ─────────────
// [Activate: Main] You may trash this Character: If your Leader has the {Foxy
// Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.

export const OP07_074_MONDA: EffectSchema = {
  card_id: "OP07-074",
  card_name: "Monda",
  card_type: "Character",
  effects: [
    {
      id: "OP07-074_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Foxy Pirates" },
      },
      flags: { optional: true },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 1, target_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── OP07-075 Slow-Slow Beam — COUNTER DON -1 give -2000 to leader + char ──
// [Counter] DON!! -1: Give up to 1 each of your opponent's Leader and Character
// cards -2000 power during this turn.

export const OP07_075_SLOW_SLOW_BEAM: EffectSchema = {
  card_id: "OP07-075",
  card_name: "Slow-Slow Beam",
  card_type: "Event",
  effects: [
    {
      id: "OP07-075_effect_1",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "OPPONENT_LEADER",
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-076 Slow-Slow Beam Sword — COUNTER DON -1 +2000 + rest opponent + Trigger
// [Counter] DON!! -1: Up to 1 of your Leader or Character cards gains +2000
// power during this battle. Then, rest up to 1 of your opponent's Characters.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP07_076_SLOW_SLOW_BEAM_SWORD: EffectSchema = {
  card_id: "OP07-076",
  card_name: "Slow-Slow Beam Sword",
  card_type: "Event",
  effects: [
    {
      id: "OP07-076_effect_1",
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
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP07-076_trigger",
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

// ─── OP07-077 We're Going to Claim the One Piece!!! — MAIN_EVENT conditional search
// [Main] If your Leader has the {Animal Kingdom Pirates} or {Big Mom Pirates}
// type, look at 5 cards from the top of your deck; reveal up to 1 {Animal
// Kingdom Pirates} or {Big Mom Pirates} type card and add it to your hand. Then,
// place the rest at the bottom of your deck in any order.
// [Trigger] Activate this card's [Main] effect.

export const OP07_077_WERE_GOING_TO_CLAIM: EffectSchema = {
  card_id: "OP07-077",
  card_name: "We're Going to Claim the One Piece!!!",
  card_type: "Event",
  effects: [
    {
      id: "OP07-077_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        any_of: [
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Animal Kingdom Pirates" },
          },
          {
            type: "LEADER_PROPERTY",
            controller: "SELF",
            property: { trait: "Big Mom Pirates" },
          },
        ],
      },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits_any_of: ["Animal Kingdom Pirates", "Big Mom Pirates"],
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP07-077_trigger",
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

// ─── OP07-078 Megaton Nine-Tails Rush — MAIN_EVENT conditional set Foxy active + Trigger
// [Main] If the number of DON!! cards on your field is equal to or less than the
// number on your opponent's field, set up to 1 of your [Foxy] cards as active.
// [Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.

export const OP07_078_MEGATON_NINE_TAILS_RUSH: EffectSchema = {
  card_id: "OP07-078",
  card_name: "Megaton Nine-Tails Rush",
  card_type: "Event",
  effects: [
    {
      id: "OP07-078_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "COMPARATIVE",
        metric: "DON_FIELD_COUNT",
        operator: "<=",
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Foxy" },
          },
        },
      ],
    },
    {
      id: "OP07-078_trigger",
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
// BLACK — CP / Thriller Bark (OP07-079 to OP07-096)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP07-079 Rob Lucci (Leader) — WHEN_ATTACKING trash from deck, -1 cost ──
// [When Attacking] You may trash 2 cards from the top of your deck: Give up to
// 1 of your opponent's Characters -1 cost during this turn.

export const OP07_079_ROB_LUCCI: EffectSchema = {
  card_id: "OP07-079",
  card_name: "Rob Lucci",
  card_type: "Leader",
  effects: [
    {
      id: "OP07-079_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
        },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
          chain: "IF_DO",
        },
      ],
    },
  ],
};

// ─── OP07-080 Kaku — ON_PLAY place from trash cost, -3 cost ────────────────
// [On Play] You may place 2 cards with a type including "CP" from your trash at
// the bottom of your deck in any order: Give up to 1 of your opponent's
// Characters -3 cost during this turn.

export const OP07_080_KAKU: EffectSchema = {
  card_id: "OP07-080",
  card_name: "Kaku",
  card_type: "Character",
  effects: [
    {
      id: "OP07-080_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          filter: { traits_contains: ["CP"] },
        },
      ],
      flags: { optional: true },
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

// ─── OP07-081 Kalifa — DON x1 YOUR_TURN permanent -1 cost to all opponent chars
// [DON!! x1] [Your Turn] Give all of your opponent's Characters -1 cost.

export const OP07_081_KALIFA: EffectSchema = {
  card_id: "OP07-081",
  card_name: "Kalifa",
  card_type: "Character",
  effects: [
    {
      // [DON!! x1] [Your Turn] permanent aura — -1 cost to all opponent chars
      id: "OP07-081_effect_1",
      category: "permanent",
      conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 1,
      },
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -1 },
        },
      ],
    },
  ],
};

// ─── OP07-082 Captain John — ON_PLAY mill 2 + -1 cost ──────────────────────
// [On Play] Trash 2 cards from the top of your deck and give up to 1 of your
// opponent's Characters -1 cost during this turn.

export const OP07_082_CAPTAIN_JOHN: EffectSchema = {
  card_id: "OP07-082",
  card_name: "Captain John",
  card_type: "Character",
  effects: [
    {
      id: "OP07-082_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
        },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-083 Gecko Moria — ACTIVATE_MAIN place from trash cost, Banish + power
// [Activate: Main] You may place 4 {Thriller Bark Pirates} type cards from your
// trash at the bottom of your deck in any order: This Character gains [Banish]
// and +1000 power during this turn.

export const OP07_083_GECKO_MORIA: EffectSchema = {
  card_id: "OP07-083",
  card_name: "Gecko Moria",
  card_type: "Character",
  effects: [
    {
      id: "OP07-083_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 4,
          filter: { traits: ["Thriller Bark Pirates"] },
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-084 Gismonda — Blocker ────────────────────────────────────────────
// [Blocker]

export const OP07_084_GISMONDA: EffectSchema = {
  card_id: "OP07-084",
  card_name: "Gismonda",
  card_type: "Character",
  effects: [
    {
      id: "OP07-084_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── OP07-085 Stussy — ON_PLAY trash own char cost, KO opponent char ────────
// [On Play] You may trash 1 of your Characters: K.O. up to 1 of your
// opponent's Characters.

export const OP07_085_STUSSY: EffectSchema = {
  card_id: "OP07-085",
  card_name: "Stussy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-085_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_OWN_CHARACTER", amount: 1 }],
      flags: { optional: true },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
    },
  ],
};

// ─── OP07-086 Spandam — ON_PLAY mill 2 + -2 cost ───────────────────────────
// [On Play] Trash 2 cards from the top of your deck and give up to 1 of your
// opponent's Characters -2 cost during this turn.

export const OP07_086_SPANDAM: EffectSchema = {
  card_id: "OP07-086",
  card_name: "Spandam",
  card_type: "Character",
  effects: [
    {
      id: "OP07-086_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MILL",
          params: { amount: 2 },
        },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-087 Baskerville — YOUR_TURN conditional +3000 power ───────────────
// [Your Turn] If your opponent has a Character with a cost of 0, this Character
// gains +3000 power.

export const OP07_087_BASKERVILLE: EffectSchema = {
  card_id: "OP07-087",
  card_name: "Baskerville",
  card_type: "Character",
  effects: [
    {
      id: "OP07-087_effect_1",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER", cost_exact: 0 },
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

// ─── OP07-088 Hattori — YOUR_TURN ON_PLAY give Rob Lucci +2000 ─────────────
// [Your Turn] [On Play] Up to 1 of your [Rob Lucci] cards gains +2000 power
// during this turn.

export const OP07_088_HATTORI: EffectSchema = {
  card_id: "OP07-088",
  card_name: "Hattori",
  card_type: "Character",
  effects: [
    {
      id: "OP07-088_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Rob Lucci" },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP07-090 Morgans — ON_PLAY opponent trashes + reveals + draws ──────────
// [On Play] Your opponent trashes 1 card from their hand and reveals their hand.
// Then, your opponent draws 1 card.

export const OP07_090_MORGANS: EffectSchema = {
  card_id: "OP07-090",
  card_name: "Morgans",
  card_type: "Character",
  effects: [
    {
      id: "OP07-090_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
        },
        {
          type: "REVEAL_HAND",
          target: {
            type: "PLAYER",
            controller: "OPPONENT",
          },
          chain: "AND",
        },
        {
          type: "DRAW",
          target: {
            type: "PLAYER",
            controller: "OPPONENT",
          },
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP07-091 Monkey.D.Luffy — WHEN_ATTACKING trash char + place to deck + power
// [When Attacking] Trash up to 1 of your opponent's Characters with a cost of 2
// or less. Then, place any number of Character cards with a cost of 4 or more
// from your trash at the bottom of your deck in any order. This Character gains
// +1000 power during this turn for every 3 cards placed at the bottom of your
// deck.

export const OP07_091_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP07-091",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-091_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "TRASH_CARD",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
        },
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { any_number: true },
            filter: { card_type: "CHARACTER", cost_min: 4 },
          },
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_PLACED_TO_DECK_THIS_WAY",
              multiplier: 1000,
              divisor: 3,
            },
          },
          duration: { type: "THIS_TURN" },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-092 Joseph — ON_PLAY place from trash cost, KO cost 1 or less ────
// [On Play] You may place 2 cards with a type including "CP" from your trash at
// the bottom of your deck in any order: K.O. up to 1 of your opponent's
// Characters with a cost of 1 or less.

export const OP07_092_JOSEPH: EffectSchema = {
  card_id: "OP07-092",
  card_name: "Joseph",
  card_type: "Character",
  effects: [
    {
      id: "OP07-092_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 2,
          filter: { traits_contains: ["CP"] },
        },
      ],
      flags: { optional: true },
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

// ─── OP07-093 Rob Lucci — ON_PLAY place from trash cost, opponent trash + place
// [On Play] You may place 3 cards from your trash at the bottom of your deck in
// any order: Your opponent trashes 1 card from their hand. Then, you may place
// up to 1 card from your opponent's trash at the bottom of their deck.

export const OP07_093_ROB_LUCCI: EffectSchema = {
  card_id: "OP07-093",
  card_name: "Rob Lucci",
  card_type: "Character",
  effects: [
    {
      id: "OP07-093_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [
        {
          type: "PLACE_FROM_TRASH_TO_DECK",
          amount: 3,
        },
      ],
      flags: { optional: true },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            mandatory: true,
            action: {
              type: "TRASH_FROM_HAND",
              params: { amount: 1 },
            },
          },
        },
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CARD_IN_TRASH",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { position: "BOTTOM" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP07-094 Shave — COUNTER +2000 + conditional return CP char + Trigger ──
// [Counter] Up to 1 of your Leader or Character cards gains +2000 power during
// this battle. Then, if you have 10 or more cards in your trash, return up to 1
// of your Characters with a type including "CP" to the owner's hand.
// [Trigger] Return up to 1 of your Characters to the owner's hand.

export const OP07_094_SHAVE: EffectSchema = {
  card_id: "OP07-094",
  card_name: "Shave",
  card_type: "Event",
  effects: [
    {
      id: "OP07-094_effect_1",
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
        },
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["CP"] },
          },
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
    {
      id: "OP07-094_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
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

// ─── OP07-095 Iron Body — COUNTER +4000 + conditional +2000 + Trigger ───────
// [Counter] Up to 1 of your Leader or Character cards gains +4000 power during
// this battle. Then, if you have 10 or more cards in your trash, that card gains
// an additional +2000 power during this battle.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during
// this turn.

export const OP07_095_IRON_BODY: EffectSchema = {
  card_id: "OP07-095",
  card_name: "Iron Body",
  card_type: "Event",
  effects: [
    {
      id: "OP07-095_effect_1",
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
            value: 10,
          },
        },
      ],
    },
    {
      id: "OP07-095_trigger",
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

// ─── OP07-096 Tempest Kick — MAIN_EVENT draw + conditional -3 cost + Trigger ─
// [Main] Draw 1 card. Then, if you have 10 or more cards in your trash, give up
// to 1 of your opponent's Characters -3 cost during this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.

export const OP07_096_TEMPEST_KICK: EffectSchema = {
  card_id: "OP07-096",
  card_name: "Tempest Kick",
  card_type: "Event",
  effects: [
    {
      id: "OP07-096_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "DRAW",
          params: { amount: 1 },
        },
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -3 },
          duration: { type: "THIS_TURN" },
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
    {
      id: "OP07-096_trigger",
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

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — Egghead / Vegapunk (OP07-097 to OP07-119)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── OP07-097 Vegapunk (Leader) — Cannot attack + ACTIVATE_MAIN play or add to life
// This Leader cannot attack.
// [Activate: Main] [Once Per Turn] ➀: Select up to 1 {Egghead} type card with
// a cost of 5 or less from your hand and play it or add it to the top of your
// Life cards face-up.

export const OP07_097_VEGAPUNK: EffectSchema = {
  card_id: "OP07-097",
  card_name: "Vegapunk",
  card_type: "Leader",
  effects: [
    {
      id: "OP07-097_cannot_attack",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_ATTACK",
        },
      ],
    },
    {
      id: "OP07-097_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_REST", amount: 1 }],
      flags: { once_per_turn: true },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "PLAY_CARD",
                  target: {
                    type: "CHARACTER_CARD",
                    source_zone: "HAND",
                    controller: "SELF",
                    count: { up_to: 1 },
                    filter: { traits: ["Egghead"], cost_max: 5 },
                  },
                  params: { source_zone: "HAND", cost_override: "FREE" },
                },
              ],
              [
                {
                  type: "ADD_TO_LIFE_FROM_HAND",
                  target: {
                    type: "CARD_IN_HAND",
                    controller: "SELF",
                    count: { up_to: 1 },
                    filter: { traits: ["Egghead"], cost_max: 5 },
                  },
                  params: { amount: 1, face: "UP", position: "TOP" },
                },
              ],
            ],
            labels: ["Play", "Add to Life"],
          },
        },
      ],
    },
  ],
};

// ─── OP07-098 Atlas — Conditional KO protection + conditional Trigger play ──
// If you have less Life cards than your opponent, this Character cannot be
// K.O.'d in battle.
// [Trigger] If your Leader is [Vegapunk], play this card.

export const OP07_098_ATLAS: EffectSchema = {
  card_id: "OP07-098",
  card_name: "Atlas",
  card_type: "Character",
  effects: [
    {
      id: "OP07-098_effect_1",
      category: "permanent",
      conditions: {
        type: "COMPARATIVE",
        metric: "LIFE_COUNT",
        operator: "<",
      },
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          scope: { cause: "BATTLE" },
        },
      ],
    },
    {
      id: "OP07-098_trigger",
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

// ─── OP07-100 Edison — ON_PLAY conditional draw 2 trash 2 + Trigger ─────────
// [On Play] If you have 2 or less Life cards, draw 2 cards and trash 2 card
// from your hand.
// [Trigger] If your Leader is [Vegapunk], play this card.

export const OP07_100_EDISON: EffectSchema = {
  card_id: "OP07-100",
  card_name: "Edison",
  card_type: "Character",
  effects: [
    {
      id: "OP07-100_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "DRAW",
          params: { amount: 2 },
        },
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 2 },
          chain: "AND",
        },
      ],
    },
    {
      id: "OP07-100_trigger",
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

// ─── OP07-101 Shaka — Blocker + conditional Trigger play ────────────────────
// [Blocker]
// [Trigger] If your Leader is [Vegapunk], play this card.

export const OP07_101_SHAKA: EffectSchema = {
  card_id: "OP07-101",
  card_name: "Shaka",
  card_type: "Character",
  effects: [
    {
      id: "OP07-101_keywords",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "OP07-101_trigger",
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

// ─── OP07-105 Pythagoras — ON_KO conditional play from trash + Trigger ──────
// [On K.O.] If you have 2 or less Life cards, play up to 1 {Egghead} type
// Character card with a cost of 4 or less from your trash rested.
// [Trigger] If your Leader is [Vegapunk], play this card.

export const OP07_105_PYTHAGORAS: EffectSchema = {
  card_id: "OP07-105",
  card_name: "Pythagoras",
  card_type: "Character",
  effects: [
    {
      id: "OP07-105_effect_1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Egghead"], cost_max: 4 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE", entry_state: "RESTED" },
        },
      ],
    },
    {
      id: "OP07-105_trigger",
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

// ─── OP07-106 Fuza — DON x1 WHEN_ATTACKING conditional KO ──────────────────
// [DON!! x1] [When Attacking] If you have 1 or less Life cards, K.O. up to 1
// of your opponent's Characters with a cost of 3 or less.

export const OP07_106_FUZA: EffectSchema = {
  card_id: "OP07-106",
  card_name: "Fuza",
  card_type: "Character",
  effects: [
    {
      id: "OP07-106_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 1,
      },
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

// ─── OP07-109 Monkey.D.Luffy — ACTIVATE_MAIN trash self, KO + draw + Trigger
// [Activate: Main] You may trash this Character: If you have 2 or less Life
// cards, K.O. up to 1 of your opponent's Characters with a cost of 4 or less.
// Then, draw 1 card.
// [Trigger] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP07_109_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP07-109",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-109_effect_1",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
      flags: { optional: true },
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
          type: "DRAW",
          params: { amount: 1 },
          chain: "THEN",
        },
      ],
    },
    {
      id: "OP07-109_trigger",
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

// ─── OP07-110 York — ON_PLAY life to hand cost, KO + conditional Trigger ────
// [On Play] You may add 1 card from the top or bottom of your Life cards to
// your hand: K.O. up to 1 of your opponent's Characters with a cost of 2 or
// less.
// [Trigger] If your Leader is [Vegapunk], play this card.

export const OP07_110_YORK: EffectSchema = {
  card_id: "OP07-110",
  card_name: "York",
  card_type: "Character",
  effects: [
    {
      id: "OP07-110_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
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
      id: "OP07-110_trigger",
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

// ─── OP07-111 Lilith — ON_PLAY search deck for Egghead + conditional Trigger
// [On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Egghead}
// type card other than [Lilith] and add it to your hand. Then, place the rest at
// the bottom of your deck in any order.
// [Trigger] If your Leader is [Vegapunk], play this card.

export const OP07_111_LILITH: EffectSchema = {
  card_id: "OP07-111",
  card_name: "Lilith",
  card_type: "Character",
  effects: [
    {
      id: "OP07-111_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Egghead"],
              exclude_name: "Lilith",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP07-111_trigger",
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

// ─── OP07-112 Lucy — WHEN_ATTACKING life to hand cost, rest + add life ──────
// [When Attacking] [Once Per Turn] You may add 1 card from the top or bottom of
// your Life cards to your hand: You may rest up to 1 of your opponent's
// Characters with a cost of 4 or less. Then, if you have 1 or less Life cards,
// add up to 1 card from the top of your deck to the top of your Life cards.

export const OP07_112_LUCY: EffectSchema = {
  card_id: "OP07-112",
  card_name: "Lucy",
  card_type: "Character",
  effects: [
    {
      id: "OP07-112_effect_1",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", once_per_turn: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" }],
      flags: { optional: true },
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

// ─── OP07-114 He Possesses the World's Most Brilliant Mind — MAIN_EVENT search
// [Main] Look at 5 cards from the top of your deck; reveal up to 1 {Egghead}
// type card other than [He Possesses the World's Most Brilliant Mind] and add it
// to your hand. Then, place the rest at the bottom of your deck in any order.
// [Trigger] Draw 1 card.

export const OP07_114_HE_POSSESSES: EffectSchema = {
  card_id: "OP07-114",
  card_name: "He Possesses the World's Most Brilliant Mind",
  card_type: "Event",
  effects: [
    {
      id: "OP07-114_effect_1",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: {
              traits: ["Egghead"],
              exclude_name: "He Possesses the World's Most Brilliant Mind",
            },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "OP07-114_trigger",
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

// ─── OP07-115 I Re-Quasar Helllp!! — COUNTER conditional +3000 + Trigger play
// [Counter] If you have 2 or less Life cards, up to 1 of your Leader or
// Character cards gains +3000 power during this battle.
// [Trigger] Play up to 1 of your {Egghead} type Character cards with a cost of
// 5 or less from your trash.

export const OP07_115_I_RE_QUASAR_HELLLP: EffectSchema = {
  card_id: "OP07-115",
  card_name: "I Re-Quasar Helllp!!",
  card_type: "Event",
  effects: [
    {
      id: "OP07-115_effect_1",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 2,
      },
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
      id: "OP07-115_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Egghead"], cost_max: 5 },
          },
          params: { source_zone: "TRASH", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── OP07-116 Blaze Slice — MAIN/COUNTER +1000 + conditional rest + Trigger ─
// [Main]/[Counter] Up to 1 of your Leader or Character cards gains +1000 power
// during this turn. Then, if your opponent has 2 or less Life cards, rest up to
// 1 of your opponent's Characters with a cost of 4 or less.
// [Trigger] Rest up to 1 of your opponent's Characters with a cost of 4 or less.

export const OP07_116_BLAZE_SLICE: EffectSchema = {
  card_id: "OP07-116",
  card_name: "Blaze Slice",
  card_type: "Event",
  effects: [
    {
      id: "OP07-116_effect_1",
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
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
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
          conditions: {
            type: "LIFE_COUNT",
            controller: "OPPONENT",
            operator: "<=",
            value: 2,
          },
        },
      ],
    },
    {
      id: "OP07-116_trigger",
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

// ─── OP07-117 Egghead — END_OF_YOUR_TURN conditional set Egghead char active + Trigger
// [End of Your Turn] If you have 3 or less Life cards, set up to 1 {Egghead}
// type Character with a cost of 5 or less as active.
// [Trigger] Play this card.

export const OP07_117_EGGHEAD: EffectSchema = {
  card_id: "OP07-117",
  card_name: "Egghead",
  card_type: "Stage",
  effects: [
    {
      id: "OP07-117_effect_1",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 3,
      },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Egghead"], cost_max: 5 },
          },
        },
      ],
    },
    {
      id: "OP07-117_trigger",
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

// ─── OP07-118 Sabo — ON_PLAY trash from hand cost, KO two targets ──────────
// [On Play] You may trash 1 card from your hand: K.O. up to 1 of your
// opponent's Characters with a cost of 5 or less and up to 1 of your opponent's
// Characters with a cost of 3 or less.

export const OP07_118_SABO: EffectSchema = {
  card_id: "OP07-118",
  card_name: "Sabo",
  card_type: "Character",
  effects: [
    {
      id: "OP07-118_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      flags: { optional: true },
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
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
          chain: "AND",
        },
      ],
    },
  ],
};

// ─── OP07-119 Portgas.D.Ace — ON_PLAY add to life + conditional Rush ────────
// [On Play] Add up to 1 card from the top of your deck to the top of your Life
// cards. Then, if you have 2 or less Life cards, this Character gains [Rush]
// during this turn.

export const OP07_119_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP07-119",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [
    {
      id: "OP07-119_effect_1",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP", face: "DOWN" },
        },
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
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
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// OP07 SCHEMAS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const OP07_SCHEMAS: Record<string, EffectSchema> = {
  // Red
  "OP07-001": OP07_001_MONKEY_D_DRAGON,
  "OP07-002": OP07_002_AIN,
  "OP07-003": OP07_003_OUTLOOK_III,
  "OP07-004": OP07_004_CURLY_DADAN,
  "OP07-005": OP07_005_CARINA,
  "OP07-006": OP07_006_STERRY,
  "OP07-008": OP07_008_MR_TANAKA,
  "OP07-009": OP07_009_DOGURA_MAGURA,
  "OP07-010": OP07_010_BACCARAT,
  "OP07-011": OP07_011_BLUEJAM,
  "OP07-012": OP07_012_PORCHEMY,
  "OP07-013": OP07_013_MASKED_DEUCE,
  "OP07-014": OP07_014_MODA,
  "OP07-015": OP07_015_MONKEY_D_DRAGON,
  "OP07-016": OP07_016_GALAXY_WINK,
  "OP07-017": OP07_017_DRAGON_BREATH,
  "OP07-018": OP07_018_KEEP_OUT,
  // Green
  "OP07-019": OP07_019_JEWELRY_BONNEY,
  "OP07-020": OP07_020_ALADINE,
  "OP07-021": OP07_021_UROUGE,
  "OP07-022": OP07_022_OTAMA,
  "OP07-023": OP07_023_CARIBOU,
  "OP07-024": OP07_024_KOALA,
  "OP07-025": OP07_025_CORIBOU,
  "OP07-026": OP07_026_JEWELRY_BONNEY,
  "OP07-029": OP07_029_BASIL_HAWKINS,
  "OP07-030": OP07_030_PAPPAG,
  "OP07-031": OP07_031_BARTOLOMEO,
  "OP07-032": OP07_032_FISHER_TIGER,
  "OP07-033": OP07_033_MONKEY_D_LUFFY,
  "OP07-034": OP07_034_RORONOA_ZORO,
  "OP07-035": OP07_035_KARMIC_PUNISHMENT,
  "OP07-036": OP07_036_DEMONIC_AURA,
  "OP07-037": OP07_037_MORE_PIZZA,
  // Blue
  "OP07-038": OP07_038_BOA_HANCOCK,
  "OP07-039": OP07_039_EDWARD_WEEVIL,
  "OP07-040": OP07_040_CROCODILE,
  "OP07-041": OP07_041_GLORIOSA,
  "OP07-042": OP07_042_GECKO_MORIA,
  "OP07-043": OP07_043_SALOME,
  "OP07-044": OP07_044_DRACULE_MIHAWK,
  "OP07-045": OP07_045_JINBE,
  "OP07-046": OP07_046_SENGOKU,
  "OP07-047": OP07_047_TRAFALGAR_LAW,
  "OP07-048": OP07_048_DONQUIXOTE_DOFLAMINGO,
  "OP07-049": OP07_049_BUCKIN,
  "OP07-050": OP07_050_BOA_SANDERSONIA,
  "OP07-051": OP07_051_BOA_HANCOCK,
  "OP07-052": OP07_052_BOA_MARIGOLD,
  "OP07-053": OP07_053_PORTGAS_D_ACE,
  "OP07-054": OP07_054_MARGUERITE,
  "OP07-055": OP07_055_SNAKE_DANCE,
  "OP07-056": OP07_056_SLAVE_ARROW,
  "OP07-057": OP07_057_PERFUME_FEMUR,
  "OP07-058": OP07_058_ISLAND_OF_WOMEN,
  // Purple
  "OP07-059": OP07_059_FOXY,
  "OP07-060": OP07_060_ITOMIMIZU,
  "OP07-061": OP07_061_VINSMOKE_SANJI,
  "OP07-062": OP07_062_VINSMOKE_REIJU,
  "OP07-063": OP07_063_CAPOTE,
  "OP07-064": OP07_064_SANJI,
  "OP07-065": OP07_065_GINA,
  "OP07-066": OP07_066_TONY_TONY_CHOPPER,
  "OP07-068": OP07_068_HAMBURG,
  "OP07-069": OP07_069_PICKLES,
  "OP07-070": OP07_070_BIG_BUN,
  "OP07-071": OP07_071_FOXY,
  "OP07-072": OP07_072_PORCHE,
  "OP07-073": OP07_073_MONKEY_D_LUFFY,
  "OP07-074": OP07_074_MONDA,
  "OP07-075": OP07_075_SLOW_SLOW_BEAM,
  "OP07-076": OP07_076_SLOW_SLOW_BEAM_SWORD,
  "OP07-077": OP07_077_WERE_GOING_TO_CLAIM,
  "OP07-078": OP07_078_MEGATON_NINE_TAILS_RUSH,
  // Black
  "OP07-079": OP07_079_ROB_LUCCI,
  "OP07-080": OP07_080_KAKU,
  "OP07-081": OP07_081_KALIFA,
  "OP07-082": OP07_082_CAPTAIN_JOHN,
  "OP07-083": OP07_083_GECKO_MORIA,
  "OP07-084": OP07_084_GISMONDA,
  "OP07-085": OP07_085_STUSSY,
  "OP07-086": OP07_086_SPANDAM,
  "OP07-087": OP07_087_BASKERVILLE,
  "OP07-088": OP07_088_HATTORI,
  "OP07-090": OP07_090_MORGANS,
  "OP07-091": OP07_091_MONKEY_D_LUFFY,
  "OP07-092": OP07_092_JOSEPH,
  "OP07-093": OP07_093_ROB_LUCCI,
  "OP07-094": OP07_094_SHAVE,
  "OP07-095": OP07_095_IRON_BODY,
  "OP07-096": OP07_096_TEMPEST_KICK,
  // Yellow
  "OP07-097": OP07_097_VEGAPUNK,
  "OP07-098": OP07_098_ATLAS,
  "OP07-100": OP07_100_EDISON,
  "OP07-101": OP07_101_SHAKA,
  "OP07-105": OP07_105_PYTHAGORAS,
  "OP07-106": OP07_106_FUZA,
  "OP07-109": OP07_109_MONKEY_D_LUFFY,
  "OP07-110": OP07_110_YORK,
  "OP07-111": OP07_111_LILITH,
  "OP07-112": OP07_112_LUCY,
  "OP07-114": OP07_114_HE_POSSESSES,
  "OP07-115": OP07_115_I_RE_QUASAR_HELLLP,
  "OP07-116": OP07_116_BLAZE_SLICE,
  "OP07-117": OP07_117_EGGHEAD,
  "OP07-118": OP07_118_SABO,
  "OP07-119": OP07_119_PORTGAS_D_ACE,
};
