/**
 * ST01 Effect Schemas
 *
 * Red (Straw Hat Crew): ST01-001 to ST01-017
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — Straw Hat Crew (ST01-001 to ST01-017)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST01-001 Monkey.D.Luffy (Leader) — give rested DON
// [Activate: Main] [Once Per Turn] Give this Leader or 1 of your Characters up to 1 rested DON!! card.

export const ST01_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST01-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── ST01-002 Usopp (Character) — blocker prohibition + trigger play self
// [DON!! x2] [When Attacking] Your opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle.
// [Trigger] Play this card.

export const ST01_002_USOPP: EffectSchema = {
  card_id: "ST01-002",
  card_name: "Usopp",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_blocker_prohibition",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_ACTIVATE_BLOCKER",
            scope: { controller: "OPPONENT", filter: { power_min: 5000 } },
          },
          duration: { type: "THIS_BATTLE" },
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

// ─── ST01-004 Sanji (Character) — DON!!x2 Rush
// [DON!! x2] This Character gains [Rush].

export const ST01_004_SANJI: EffectSchema = {
  card_id: "ST01-004",
  card_name: "Sanji",
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
  ],
};

// ─── ST01-005 Jinbe (Character) — DON!!x1 When Attacking +1000
// [DON!! x1] [When Attacking] Up to 1 of your Leader or Character cards other than this card gains +1000 power during this turn.

export const ST01_005_JINBE: EffectSchema = {
  card_id: "ST01-005",
  card_name: "Jinbe",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_power_boost",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 1 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { exclude_self: true },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST01-006 Tony Tony.Chopper (Character) — Blocker
// [Blocker]

export const ST01_006_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "ST01-006",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
  ],
};

// ─── ST01-007 Nami (Character) — give rested DON
// [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.

export const ST01_007_NAMI: EffectSchema = {
  card_id: "ST01-007",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "activate_give_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── ST01-011 Brook (Character) — On Play give DON
// [On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.

export const ST01_011_BROOK: EffectSchema = {
  card_id: "ST01-011",
  card_name: "Brook",
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

// ─── ST01-012 Monkey.D.Luffy (Character) — Rush + blocker prohibition
// [Rush]
// [DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.

export const ST01_012_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST01-012",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "rush",
      category: "permanent",
      flags: { keywords: ["RUSH"] },
    },
    {
      id: "when_attacking_no_blocker",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 2 },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── ST01-013 Roronoa Zoro (Character) — DON!!x1 +1000 power
// [DON!! x1] This Character gains +1000 power.

export const ST01_013_RORONOA_ZORO: EffectSchema = {
  card_id: "ST01-013",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      id: "don_power_boost",
      category: "permanent",
      conditions: {
        type: "DON_GIVEN",
        controller: "SELF",
        mode: "SPECIFIC_CARD",
        operator: ">=",
        value: 1,
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

// ─── ST01-014 Guard Point (Event) — Counter +3000 / Trigger +1000
// [Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle.
// [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.

export const ST01_014_GUARD_POINT: EffectSchema = {
  card_id: "ST01-014",
  card_name: "Guard Point",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_boost",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
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
      id: "trigger_power_boost",
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

// ─── ST01-015 Gum-Gum Jet Pistol (Event) — KO + trigger reuse
// [Main] K.O. up to 1 of your opponent's Characters with 6000 power or less.
// [Trigger] Activate this card's [Main] effect.

export const ST01_015_GUM_GUM_JET_PISTOL: EffectSchema = {
  card_id: "ST01-015",
  card_name: "Gum-Gum Jet Pistol",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_max: 6000 },
          },
        },
      ],
    },
    {
      id: "trigger_reuse_main",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } },
      ],
    },
  ],
};

// ─── ST01-016 Diable Jambe (Event) — blocker prohibition + trigger KO blocker
// [Main] Select up to 1 of your {Straw Hat Crew} type Leader or Character cards. Your opponent cannot activate [Blocker] if that Leader or Character attacks during this turn.
// [Trigger] K.O. up to 1 of your opponent's [Blocker] Characters with a cost of 3 or less.

export const ST01_016_DIABLE_JAMBE: EffectSchema = {
  card_id: "ST01-016",
  card_name: "Diable Jambe",
  card_type: "Event",
  effects: [
    {
      id: "main_blocker_prohibition",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_ko_blocker",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { keywords: ["BLOCKER"], cost_max: 3 },
          },
        },
      ],
    },
  ],
};

// ─── ST01-017 Thousand Sunny (Stage) — rest self +1000
// [Activate: Main] You may rest this Stage: Up to 1 {Straw Hat Crew} type Leader or Character card on your field gains +1000 power during this turn.

export const ST01_017_THOUSAND_SUNNY: EffectSchema = {
  card_id: "ST01-017",
  card_name: "Thousand Sunny",
  card_type: "Stage",
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
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Straw Hat Crew"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST01_SCHEMAS: Record<string, EffectSchema> = {
  "ST01-001": ST01_001_MONKEY_D_LUFFY,
  "ST01-002": ST01_002_USOPP,
  "ST01-004": ST01_004_SANJI,
  "ST01-005": ST01_005_JINBE,
  "ST01-006": ST01_006_TONY_TONY_CHOPPER,
  "ST01-007": ST01_007_NAMI,
  "ST01-011": ST01_011_BROOK,
  "ST01-012": ST01_012_MONKEY_D_LUFFY,
  "ST01-013": ST01_013_RORONOA_ZORO,
  "ST01-014": ST01_014_GUARD_POINT,
  "ST01-015": ST01_015_GUM_GUM_JET_PISTOL,
  "ST01-016": ST01_016_DIABLE_JAMBE,
  "ST01-017": ST01_017_THOUSAND_SUNNY,
};
