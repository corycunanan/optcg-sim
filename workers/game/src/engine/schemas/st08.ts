/**
 * ST08 Effect Schemas
 *
 * Black (Monkey.D.Luffy): ST08-001 to ST08-015
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BLACK — Monkey.D.Luffy (ST08-001 to ST08-015)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ST08-001 Monkey.D.Luffy (Leader) — Your Turn character KO gives DON
// [Your Turn] When a Character is K.O.'d, give up to 1 rested DON!! card to this Leader.

export const ST08_001_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "ST08-001",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "ko_give_don",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        turn_restriction: "YOUR_TURN",
      },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
    },
  ],
};

// ─── ST08-002 Uta (Character) — cannot be KO'd in battle by Leaders + activate -2 cost
// This Character cannot be K.O.'d in battle by Leaders.
// [Activate: Main] You may rest this Character: Give up to 1 of your opponent's Characters −2 cost during this turn.

export const ST08_002_UTA: EffectSchema = {
  card_id: "ST08-002",
  card_name: "Uta",
  card_type: "Character",
  effects: [
    {
      id: "ko_protection_vs_leaders",
      category: "permanent",
      prohibitions: [
        {
          type: "CANNOT_BE_KO",
          target: { type: "SELF" },
          scope: { cause: "BATTLE", source_filter: { card_type: "LEADER" } },
        },
      ],
    },
    {
      id: "activate_cost_reduction",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST08-004 Koby (Character) — activate KO cost 2
// [Activate: Main] You may rest this Character: K.O. up to 1 of your opponent's Characters with a cost of 2 or less.

export const ST08_004_KOBY: EffectSchema = {
  card_id: "ST08-004",
  card_name: "Koby",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "REST_SELF" }],
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
      flags: { optional: true },
    },
  ],
};

// ─── ST08-005 Shanks (Character) — On Play KO all cost 1 or less
// [On Play] You may trash 1 card from your hand: K.O. all Characters with a cost of 1 or less.

export const ST08_005_SHANKS: EffectSchema = {
  card_id: "ST08-005",
  card_name: "Shanks",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_all",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { all: true },
            filter: { cost_max: 1 },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST08-006 Shirahoshi (Character) — Blocker + On Play -4 cost
// [Blocker]
// [On Play] Give up to 1 of your opponent's Characters −4 cost during this turn.

export const ST08_006_SHIRAHOSHI: EffectSchema = {
  card_id: "ST08-006",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "on_play_cost_reduction",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -4 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST08-007 Nefeltari Vivi (Character) — Blocker + trigger play self
// [Blocker]
// [Trigger] Play this card.

export const ST08_007_NEFELTARI_VIVI: EffectSchema = {
  card_id: "ST08-007",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "blocker",
      category: "permanent",
      flags: { keywords: ["BLOCKER"] },
    },
    {
      id: "trigger_play_self",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    },
  ],
};

// ─── ST08-008 Higuma (Character) — On Play -2 cost
// [On Play] Give up to 1 of your opponent's Characters −2 cost during this turn.

export const ST08_008_HIGUMA: EffectSchema = {
  card_id: "ST08-008",
  card_name: "Higuma",
  card_type: "Character",
  effects: [
    {
      id: "on_play_cost_reduction",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── ST08-009 Makino (Character) — On Play conditional draw
// [On Play] If there is a Character with a cost of 0, draw 1 card.

export const ST08_009_MAKINO: EffectSchema = {
  card_id: "ST08-009",
  card_name: "Makino",
  card_type: "Character",
  effects: [
    {
      id: "on_play_conditional_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_exact: 0 },
      },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ─── ST08-013 Mr.2.Bon.Kurei(Bentham) (Character) — end of battle mutual KO
// [DON!! x1] At the end of a battle in which this Character battles your opponent's Character, you may K.O. the opponent's Character you battled with. If you do, K.O. this Character.

export const ST08_013_MR_2_BON_KUREI_BENTHAM: EffectSchema = {
  card_id: "ST08-013",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "end_of_battle_mutual_ko",
      category: "auto",
      trigger: {
        event: "END_OF_BATTLE",
        filter: { battle_target_type: "CHARACTER" },
        don_requirement: 1,
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
        {
          type: "KO",
          target: { type: "SELF" },
          chain: "IF_DO",
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── ST08-014 Gum-Gum Bell (Event) — Main life cost -7 cost + trigger retrieve
// [Main] You may add 1 card from the top of your Life cards to your hand: Give up to 1 of your opponent's Characters −7 cost during this turn.
// [Trigger] Add up to 1 black Character card with a cost of 2 or less from your trash to your hand.

export const ST08_014_GUM_GUM_BELL: EffectSchema = {
  card_id: "ST08-014",
  card_name: "Gum-Gum Bell",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_reduction",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP" }],
      actions: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -7 },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "trigger_retrieve_from_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { color: "BLACK", card_type: "CHARACTER", cost_max: 2 },
          },
        },
      ],
    },
  ],
};

// ─── ST08-015 Gum-Gum Pistol (Event) — Main KO cost 2 + trigger draw
// [Main] K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
// [Trigger] Draw 1 card.

export const ST08_015_GUM_GUM_PISTOL: EffectSchema = {
  card_id: "ST08-015",
  card_name: "Gum-Gum Pistol",
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
            filter: { cost_max: 2 },
          },
        },
      ],
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ST08_SCHEMAS: Record<string, EffectSchema> = {
  "ST08-001": ST08_001_MONKEY_D_LUFFY,
  "ST08-002": ST08_002_UTA,
  "ST08-004": ST08_004_KOBY,
  "ST08-005": ST08_005_SHANKS,
  "ST08-006": ST08_006_SHIRAHOSHI,
  "ST08-007": ST08_007_NEFELTARI_VIVI,
  "ST08-008": ST08_008_HIGUMA,
  "ST08-009": ST08_009_MAKINO,
  "ST08-013": ST08_013_MR_2_BON_KUREI_BENTHAM,
  "ST08-014": ST08_014_GUM_GUM_BELL,
  "ST08-015": ST08_015_GUM_GUM_PISTOL,
};
