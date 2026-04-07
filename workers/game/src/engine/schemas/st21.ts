/**
 * ST21 Effect Schemas
 *
 * Red (Straw Hat Crew): ST21-001 to ST21-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Straw Hat Crew (ST21-001 to ST21-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST21-001 Monkey.D.Luffy (Leader) — give rested DON to character
// [DON!! x1] [Activate: Main] [Once Per Turn] Give up to 2 rested DON!! cards to 1 of your Characters.

export const ST21_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST21-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN", don_requirement: 1 },
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
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST21-002 Usopp (Character) — DON!! x2 opponent's turn power boost
// [DON!! x2] [Opponent's Turn] This Character gains +2000 power.

export const ST21_002_USOPP: EffectSchema = {
  card_id: "ST21-002",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "don_opponent_turn_power",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
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

// ─── ST21-003 Sanji (Character) — on play blocker prohibition on selected character
// [On Play] Select up to 1 of your {Straw Hat Crew} type Characters with 6000 power or more. If the selected Character attacks during this turn, your opponent cannot activate [Blocker].

export const ST21_003_SANJI: EffectSchema = {
  card_id: "ST21-003",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      id: "on_play_blocker_prohibition",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"], power_min: 6000 },
          },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
          },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST21-004 Jewelry Bonney (Character) — DON!! x2 on KO draw
// [DON!! x2] [On K.O.] Draw 1 card.

export const ST21_004_JEWELRY_BONNEY: EffectSchema = {
  card_id: "ST21-004",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "don_on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO", don_requirement: 2 },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST21-007 Sentomaru (Character) — Blocker
// [Blocker]

export const ST21_007_SENTOMARU: EffectSchema = {
  card_id: "ST21-007",
  card_name: "Sentomaru",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST21-009 Nami (Character) — activate give rested DON to Straw Hat Crew
// [Activate: Main] [Once Per Turn] Give up to 2 rested DON!! cards to 1 of your {Straw Hat Crew} type Leader or Character cards.

export const ST21_009_NAMI: EffectSchema = {
  card_id: "ST21-009",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
      flags: { once_per_turn: true },
    },
  ],
};

// ─── ST21-010 Nico Robin (Character) — DON!! x2 when attacking KO
// [DON!! x2] [When Attacking] K.O. up to 1 of your opponent's Characters with 4000 power or less.

export const ST21_010_NICO_ROBIN: EffectSchema = {
  card_id: "ST21-010",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "don_when_attacking_ko",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
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

// ─── ST21-011 Franky (Character) — DON!! x2 opponent's turn aura power boost
// [DON!! x2] [Opponent's Turn] All of your {Straw Hat Crew} type Characters with 4000 base power or less gain +1000 power.

export const ST21_011_FRANKY: EffectSchema = {
  card_id: "ST21-011",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      id: "don_opponent_turn_aura",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { traits: ["Straw Hat Crew"], base_power_max: 4000 },
          },
          params: { amount: 1000 },
        },
      ],
    },
  ],
};

// ─── ST21-012 Brook (Character) — when attacking give rested DON
// [When Attacking] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.

export const ST21_012_BROOK: EffectSchema = {
  card_id: "ST21-012",
  card_name: "Brook",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_give_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 2, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ─── ST21-014 Monkey.D.Luffy (Character) — Rush + when attacking give DON
// [Rush] (This card can attack on the turn in which it is played.)
// [When Attacking] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST21_014_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST21-014",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "when_attacking_give_don",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
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
      ],
    },
  ],
};

// ─── ST21-015 Roronoa Zoro (Character) — DON!! x2 Rush + on KO play from hand
// [DON!! x2] This Character gains [Rush].
// [On K.O.] Play up to 1 red Character card with 6000 power or less other than [Roronoa Zoro] from your hand.

export const ST21_015_RORONOA_ZORO: EffectSchema = {
  card_id: "ST21-015",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "don_rush",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 2,
      },
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "RUSH" },
        },
      ],
    },
    {
      id: "on_ko_play_from_hand",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: {
              color: "RED",
              power_max: 6000,
              exclude_name: "Roronoa Zoro",
            },
          },
          params: { source_zone: "HAND", cost_override: "FREE" },
        },
      ],
    },
  ],
};

// ─── ST21-016 Gum-Gum Dawn Whip (Event) — power boost + blocker prohibition + trigger KO
// [Main] Up to 1 of your Leader or Character cards gains +1000 power during this turn. Then, up to 1 of your opponent's Characters with 4000 power or less cannot activate [Blocker] during this turn.
// [Trigger] K.O. up to 1 of your opponent's Characters with 4000 power or less.

export const ST21_016_GUM_GUM_DAWN_WHIP: EffectSchema = {
  card_id: "ST21-016",
  card_name: "Gum-Gum Dawn Whip",
  card_type: "Event",
  effects: [
    {
      id: "main_effect",
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
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 4000 },
          },
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
          },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
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
            filter: { power_max: 4000 },
          },
        },
      ],
    },
  ],
};

// ─── ST21-017 Gum-Gum Mole Pistol (Event) — power debuff + conditional KO + trigger reuse
// [Main] Give up to 1 of your opponent's Characters −5000 power during this turn. Then, if you have a Character with 6000 power or more, K.O. up to 1 of your opponent's Characters with 2000 power or less.
// [Trigger] Activate this card's [Main] effect.

export const ST21_017_GUM_GUM_MOLE_PISTOL: EffectSchema = {
  card_id: "ST21-017",
  card_name: "Gum-Gum Mole Pistol",
  card_type: "Event",
  effects: [
    {
      id: "main_effect",
      category: "auto",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -5000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 2000 },
          },
          chain: "THEN",
          conditions: {
            type: "CARD_ON_FIELD",
            controller: "SELF",
            filter: { card_type: "CHARACTER", power_min: 6000 },
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

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST21_SCHEMAS: Record<string, EffectSchema> = {
  "ST21-001": ST21_001_MONKEY_D_LUFFY,
  "ST21-002": ST21_002_USOPP,
  "ST21-003": ST21_003_SANJI,
  "ST21-004": ST21_004_JEWELRY_BONNEY,
  "ST21-007": ST21_007_SENTOMARU,
  "ST21-009": ST21_009_NAMI,
  "ST21-010": ST21_010_NICO_ROBIN,
  "ST21-011": ST21_011_FRANKY,
  "ST21-012": ST21_012_BROOK,
  "ST21-014": ST21_014_MONKEY_D_LUFFY,
  "ST21-015": ST21_015_RORONOA_ZORO,
  "ST21-016": ST21_016_GUM_GUM_DAWN_WHIP,
  "ST21-017": ST21_017_GUM_GUM_MOLE_PISTOL,
};
