/**
 * EB05 Effect Schemas — EXTRA BOOSTER -ONE PIECE HEROINES EDITION vol.2- [EB-05]
 *
 * 55 effect-bearing new IDs. Reprint slots are authored in their origin sets.
 * Rulings: docs/FAQs/qa_eb05.md.
 *
 * Partial encodings (the missing clause is NOT approximated; see
 * docs/game-engine/DEFERRED-CARD-EFFECTS.md):
 * - EB05-010 Nico Robin (Leader): the "When one of your Characters with the
 *   Wisdom attribute and without [Blocker] is K.O.'d" auto effect needs a
 *   negation-aware "without [Blocker]" filter read from last-known
 *   information. Only the [Activate: Main] effect is encoded.
 * - EB05-052 Gloriosa: "If you would take damage, you may trash this
 *   Character instead" needs a damage replacement event. Only the [Trigger]
 *   is encoded.
 */
import type { Action, Condition, EffectSchema } from "../effect-types.js";

function leaderTrait(trait: string): Condition {
  return { type: "LEADER_PROPERTY", controller: "SELF", property: { trait } };
}

function leaderName(name: string): Condition {
  return { type: "LEADER_PROPERTY", controller: "SELF", property: { name } };
}

const OWN_LIFE_AT_MOST_2: Condition = {
  type: "LIFE_COUNT",
  controller: "SELF",
  operator: "<=",
  value: 2,
};

/** "add up to 1 card from the top of your deck to the top of your Life cards" */
const ADD_TOP_DECK_TO_LIFE: Action = {
  type: "ADD_TO_LIFE_FROM_DECK",
  params: { amount: 1, position: "TOP", face: "DOWN", up_to: true },
};

function trashFromHand(amount: number): Action {
  return {
    type: "TRASH_FROM_HAND",
    chain: "THEN",
    target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: amount } },
    params: { amount },
  };
}

function leaderBattlePower(amount: number): Action {
  return {
    type: "MODIFY_POWER",
    target: { type: "YOUR_LEADER" },
    params: { amount },
    duration: { type: "THIS_BATTLE" },
  };
}

function ownLeaderOrCharacterBattlePower(amount: number): Action {
  return {
    type: "MODIFY_POWER",
    target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
    params: { amount },
    duration: { type: "THIS_BATTLE" },
  };
}

/** "[Trigger] You may trash 1 card from your hand: If you have 2 or less Life cards, play this card." */
const TRIGGER_TRASH_PLAY_SELF_AT_TWO_LIFE = {
  id: "trigger_trash_play_self",
  category: "auto",
  trigger: { keyword: "TRIGGER" },
  flags: { optional: true },
  costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
  post_cost_conditions: OWN_LIFE_AT_MOST_2,
  actions: [{ type: "PLAY_SELF" }],
} as const satisfies EffectSchema["effects"][number];

const TRIGGER_PLAY_SELF = {
  id: "trigger_play_self",
  category: "auto",
  trigger: { keyword: "TRIGGER" },
  actions: [{ type: "PLAY_SELF" }],
} as const satisfies EffectSchema["effects"][number];

const TRIGGER_REUSE_ON_PLAY = {
  id: "trigger_reuse_on_play",
  category: "auto",
  trigger: { keyword: "TRIGGER" },
  actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_PLAY" } }],
} as const satisfies EffectSchema["effects"][number];

const TRIGGER_DRAW_2_TRASH_1 = {
  id: "trigger_draw_trash",
  category: "auto",
  trigger: { keyword: "TRIGGER" },
  actions: [{ type: "DRAW", params: { amount: 2 } }, trashFromHand(1)],
} as const satisfies EffectSchema["effects"][number];

// ═══════════════════════════════════════════════════════════════════════════
// RED
// ═══════════════════════════════════════════════════════════════════════════

export const EB05_001_JEWELRY_BONNEY: EffectSchema = {
  card_id: "EB05-001",
  card_name: "Jewelry Bonney",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_play_two",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: leaderTrait("Supernovas"),
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 2 },
            filter: { power_max: 2000 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
    {
      id: "activate_debuff_big",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { power_min: 6000 },
          },
          params: { amount: -1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

export const EB05_002_DOLL: EffectSchema = {
  card_id: "EB05-002",
  card_name: "Doll",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_navy_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { traits: ["Navy"], cost_min: 2 },
            rest_destination: "BOTTOM",
          },
        },
        trashFromHand(1),
      ],
    },
  ],
};

export const EB05_004_BABY_5: EffectSchema = {
  card_id: "EB05-004",
  card_name: "Baby 5",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_events_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "REVEAL_FROM_HAND", amount: 2, filter: { card_type: "EVENT" } }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
    {
      id: "on_ko_play_rested",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { power_max: 6000 },
          },
          params: { source_zone: "HAND", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

export const EB05_005_BELO_BETTY: EffectSchema = {
  card_id: "EB05-005",
  card_name: "Belo Betty",
  card_type: "Character",
  effects: [
    {
      id: "on_play_buff_revolutionary_triggers",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 3 },
            filter: { traits: ["Revolutionary Army"], has_trigger: true },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "activate_trash_self_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_006_MISS_BUCKINGHAM_STUSSY: EffectSchema = {
  card_id: "EB05-006",
  card_name: "Miss Buckingham Stussy",
  card_type: "Character",
  effects: [
    {
      // FAQ: either mode may target either player's Character, and the mode
      // is chosen after the Life card is in hand.
      id: "activate_life_choose_one",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP" }],
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            labels: ["+3000 power", "−4000 power"],
            options: [
              [
                {
                  type: "MODIFY_POWER",
                  target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 } },
                  params: { amount: 3000 },
                  duration: { type: "THIS_TURN" },
                },
              ],
              [
                {
                  type: "MODIFY_POWER",
                  target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 } },
                  params: { amount: -4000 },
                  duration: { type: "THIS_TURN" },
                },
              ],
            ],
          },
        },
      ],
    },
  ],
};

export const EB05_007_MONET: EffectSchema = {
  card_id: "EB05-007",
  card_name: "Monet",
  card_type: "Character",
  effects: [
    {
      id: "on_play_reveal_three_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [
        {
          type: "REVEAL_FROM_HAND",
          amount: 3,
          filter: { any_of: [{ card_type: "EVENT" }, { traits: ["Punk Hazard"] }] },
        },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
    {
      id: "end_of_turn_self_buff",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 5000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

export const EB05_008_LUFFY_NOWS_YOUR_CHANCE: EffectSchema = {
  card_id: "EB05-008",
  card_name: "Luffy, Now's Your Chance",
  card_type: "Event",
  effects: [
    {
      id: "main_give_don_reveal_debuff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        {
          type: "GIVE_DON",
          amount: 1,
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { exact: 1 },
            filter: { card_type: "LEADER" },
          },
        },
        { type: "REVEAL_FROM_HAND", amount: 2, filter: { card_type: "EVENT", color: "RED" } },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { amount: -7000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      // FAQ: usable with 0 Characters.
      id: "counter_buff_without_big_characters",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        not: {
          type: "CARD_ON_FIELD",
          controller: "SELF",
          filter: { card_type: "CHARACTER", cost_min: 5 },
        },
      },
      actions: [ownLeaderOrCharacterBattlePower(4000)],
    },
  ],
};

export const EB05_009_FIGHT_AND_DIE_WITH_ME: EffectSchema = {
  card_id: "EB05-009",
  card_name: "Fight and Die with Me!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_team_buff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "ALL_YOUR_CHARACTERS", filter: { base_power_max: 4000 } },
          params: { amount: 1000 },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "counter_leader_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [leaderBattlePower(3000)],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// GREEN (and the Green/Yellow Leader)
// ═══════════════════════════════════════════════════════════════════════════

export const EB05_010_NICO_ROBIN: EffectSchema = {
  card_id: "EB05-010",
  card_name: "Nico Robin",
  card_type: "Leader",
  effects: [
    // Partial: the Wisdom-without-[Blocker] K.O. watcher is deferred (header).
    {
      id: "activate_set_wisdom_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "SET_ACTIVE",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { attribute: "WISDOM", power_max: 6000 },
          },
        },
      ],
    },
  ],
};

export const EB05_011_OTOHIME: EffectSchema = {
  card_id: "EB05-011",
  card_name: "Otohime",
  card_type: "Character",
  effects: [
    {
      // FAQ: unusable when the top Life card is already face-down.
      id: "on_play_face_down_life_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      conditions: leaderName("Shirahoshi"),
      costs: [{ type: "TURN_LIFE_FACE_DOWN", amount: 1, position: "TOP" }],
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
    },
  ],
};

export const EB05_012_CAMIE: EffectSchema = {
  card_id: "EB05-012",
  card_name: "Camie",
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
            filter: { cost_max: 6 },
          },
        },
      ],
    },
  ],
};

export const EB05_013_SHIRLEY: EffectSchema = {
  card_id: "EB05-013",
  card_name: "Shirley",
  card_type: "Character",
  effects: [
    {
      id: "opponent_attack_rest_don_leader_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER", filter: { traits_any_of: ["Fish-Man", "Merfolk"] } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

export const EB05_014_SHIRAHOSHI: EffectSchema = {
  card_id: "EB05-014",
  card_name: "Shirahoshi",
  card_type: "Character",
  effects: [
    {
      // FAQ: two [Megalo] or two {Neptunian} cards are both legal picks.
      id: "on_play_search_trash_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { any_of: [{ name: "Megalo" }, { traits: ["Neptunian"] }] },
            rest_destination: "TRASH",
          },
        },
      ],
    },
    {
      id: "activate_rest_self_grant_rush",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Neptunian"], power_max: 6000 },
          },
          params: { keyword: "RUSH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_016_NICO_ROBIN: EffectSchema = {
  card_id: "EB05-016",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_on_play_play_wisdom",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { cost_max: 5, attribute: "WISDOM" },
          },
          params: { source_zone: "HAND" },
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

export const EB05_017_MERMAID_CAFE_DANCERS: EffectSchema = {
  card_id: "EB05-017",
  card_name: "Mermaid Cafe Dancers",
  card_type: "Character",
  effects: [
    {
      id: "opponent_attack_rest_don_trash_self_leader_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { optional: true },
      costs: [{ type: "REST_DON", amount: 1 }, { type: "TRASH_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER", filter: { traits_any_of: ["Fish-Man", "Merfolk"] } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

export const EB05_018_REBECCA: EffectSchema = {
  card_id: "EB05-018",
  card_name: "Rebecca",
  card_type: "Character",
  effects: [
    {
      id: "on_play_skip_refresh",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, cost_max: 6 },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

export const EB05_019_OPEN_THIS_COUNTRY: EffectSchema = {
  card_id: "EB05-019",
  card_name: "I Choose to Open This Country to the World!! I Want to Fight on Your Side!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_rest_card_wano_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "REST_CARDS", amount: 1, filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] } },
      ],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"] },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_play_wano",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: { type: "LIFE_COUNT", controller: "OPPONENT", operator: "<=", value: 3 },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Land of Wano"], power_max: 6000 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const EB05_020_MY_NAME_IS_SHIRAHOSHI: EffectSchema = {
  card_id: "EB05-020",
  card_name: "My name is Shirahoshi!!",
  card_type: "Event",
  effects: [
    {
      // FAQ: usable on your first turn.
      id: "main_rest_leader_draw",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "REST_CARDS", amount: 1, filter: { card_type: "LEADER", name: "Shirahoshi" } },
      ],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// BLUE
// ═══════════════════════════════════════════════════════════════════════════

export const EB05_021_ALVIDA: EffectSchema = {
  card_id: "EB05-021",
  card_name: "Alvida",
  card_type: "Character",
  effects: [
    {
      // FAQ: the played Cross Guild Character's own [On Play] resolves after
      // the play lock, so it cannot play a further Character.
      id: "on_play_draw_play_cross_guild_lock",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 2 } },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { traits: ["Cross Guild"], cost_max: 8 },
          },
          params: { source_zone: "HAND" },
        },
        {
          type: "APPLY_PROHIBITION",
          chain: "THEN",
          params: { prohibition_type: "CANNOT_PLAY_CHARACTER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "when_attacking_negate",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_022_OCTOPAKO: EffectSchema = {
  card_id: "EB05-022",
  card_name: "Octopako",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_draw",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

export const EB05_023_OSOME: EffectSchema = {
  card_id: "EB05-023",
  card_name: "Osome",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_events_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 2, filter: { card_type: "EVENT" } }],
      actions: [{ type: "DRAW", params: { amount: 3 } }],
    },
  ],
};

export const EB05_024_LITTLE_SADI: EffectSchema = {
  card_id: "EB05-024",
  card_name: "Little Sadi",
  card_type: "Character",
  effects: [
    {
      id: "impel_down_blocker_cost",
      category: "permanent",
      conditions: leaderTrait("Impel Down"),
      modifiers: [
        { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" } },
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 2 } },
      ],
    },
  ],
};

export const EB05_025_DOMINO: EffectSchema = {
  card_id: "EB05-025",
  card_name: "Domino",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_impel_down",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Impel Down"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    TRIGGER_REUSE_ON_PLAY,
  ],
};

export const EB05_027_HIBARI: EffectSchema = {
  card_id: "EB05-027",
  card_name: "Hibari",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash_bottom",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "DRAW", params: { amount: 3 } },
        trashFromHand(2),
        {
          type: "RETURN_TO_DECK",
          chain: "THEN",
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

export const EB05_028_BOA_HANCOCK: EffectSchema = {
  card_id: "EB05-028",
  card_name: "Boa Hancock",
  card_type: "Character",
  effects: [
    {
      // FAQ: the opponent chooses the 4 cards.
      id: "on_play_opponent_trashes_four",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: { type: "HAND_COUNT", controller: "OPPONENT", operator: ">=", value: 9 },
      actions: [
        {
          type: "OPPONENT_ACTION",
          params: {
            action: {
              type: "TRASH_FROM_HAND",
              target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 4 } },
              params: { amount: 4 },
            },
          },
        },
      ],
    },
  ],
};

export const EB05_029_KIMONO_SLEEVE_CAGE: EffectSchema = {
  card_id: "EB05-029",
  card_name: "Kimono Sleeve Cage",
  card_type: "Event",
  effects: [
    {
      id: "main_trash_negate_bounce",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "NEGATE_EFFECTS",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 6 },
          },
          duration: { type: "THIS_TURN" },
          result_ref: "negated_character",
        },
        { type: "RETURN_TO_HAND", target_ref: "negated_character", chain: "THEN" },
      ],
    },
    TRIGGER_DRAW_2_TRASH_1,
  ],
};

export const EB05_030_TAKE_CARE_EVERYBODY: EffectSchema = {
  card_id: "EB05-030",
  card_name: "Take Care, Everybody. ♡",
  card_type: "Event",
  effects: [
    {
      id: "main_nami_bounce",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: leaderName("Nami"),
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            count: { up_to: 1 },
            filter: { cost_max: 5 },
          },
        },
      ],
    },
    {
      id: "counter_draw_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "MODIFY_POWER",
          chain: "THEN",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PURPLE
// ═══════════════════════════════════════════════════════════════════════════

export const EB05_031_VINSMOKE_REIJU: EffectSchema = {
  card_id: "EB05-031",
  card_name: "Vinsmoke Reiju",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_minus_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: leaderTrait("The Vinsmoke Family"),
      actions: [{ type: "MILL", params: { amount: 10 } }],
    },
    {
      id: "activate_trash_self_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      post_cost_conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER", base_power_min: 8000 },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 4, target_state: "ACTIVE", up_to: true },
        },
      ],
    },
  ],
};

export const EB05_033_NICO_ROBIN: EffectSchema = {
  card_id: "EB05-033",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      // FAQ: when either condition fails, nothing resolves (no DON!! added).
      id: "on_play_draw_trash_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          leaderTrait("Straw Hat Crew"),
          { type: "COMPARATIVE", metric: "DON_FIELD_COUNT", operator: "<=", margin: -6 },
        ],
      },
      actions: [
        { type: "DRAW", params: { amount: 3 } },
        trashFromHand(2),
        {
          type: "ADD_DON_FROM_DECK",
          chain: "THEN",
          params: { amount: 4, target_state: "RESTED", up_to: true },
        },
      ],
    },
  ],
};

export const EB05_034_SUGAR: EffectSchema = {
  card_id: "EB05-034",
  card_name: "Sugar",
  card_type: "Character",
  effects: [
    {
      // FAQ: the DON!! count is checked after paying DON!! −2.
      id: "on_play_don_minus_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 2 }],
      post_cost_conditions: {
        type: "DON_FIELD_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 7,
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_035_SPEED: EffectSchema = {
  card_id: "EB05-035",
  card_name: "Speed",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_minus_search_play_smile",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 2 },
            filter: { traits: ["SMILE"] },
            rest_destination: "BOTTOM",
          },
        },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 2 },
            filter: { traits: ["SMILE"], power_max: 5000 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const EB05_036_TSURU: EffectSchema = {
  card_id: "EB05-036",
  card_name: "Tsuru",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: leaderTrait("Navy"),
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "ADD_DON_FROM_DECK",
          chain: "THEN",
          params: { amount: 1, target_state: "RESTED", up_to: true },
        },
      ],
    },
  ],
};

export const EB05_037_BLACK_MARIA: EffectSchema = {
  card_id: "EB05-037",
  card_name: "Black Maria",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_animal_kingdom",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits: ["Animal Kingdom Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
  ],
};

export const EB05_038_RUSSIAN: EffectSchema = {
  card_id: "EB05-038",
  card_name: "Russian",
  card_type: "Character",
  effects: [
    {
      id: "on_play_buff_senor_pink",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Senor Pink" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_039_PINK_HORNET: EffectSchema = {
  card_id: "EB05-039",
  card_name: "Pink Hornet",
  card_type: "Event",
  effects: [
    {
      id: "main_don_minus_debuff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      post_cost_conditions: leaderTrait("The Vinsmoke Family"),
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -4000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_don_minus_leader_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [leaderBattlePower(4000)],
    },
  ],
};

export const EB05_040_YOU_NEED_ME_DONT_YOU: EffectSchema = {
  card_id: "EB05-040",
  card_name: "You Need Me, Don't You?!!♡",
  card_type: "Event",
  effects: [
    {
      id: "main_return_active_don_draw",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1, filter: { is_active: true } }],
      post_cost_conditions: leaderTrait("Donquixote Pirates"),
      actions: [{ type: "DRAW", params: { amount: 3 } }, trashFromHand(1)],
    },
    {
      id: "counter_leader_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [leaderBattlePower(2000)],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// BLACK
// ═══════════════════════════════════════════════════════════════════════════

export const EB05_042_SHINOBU: EffectSchema = {
  card_id: "EB05-042",
  card_name: "Shinobu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 2 } }, trashFromHand(2)],
    },
  ],
};

export const EB05_043_PERONA: EffectSchema = {
  card_id: "EB05-043",
  card_name: "Perona",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_ko_or_rest",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            labels: ["K.O.", "Rest"],
            options: [
              [
                {
                  type: "KO",
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
                  type: "SET_REST",
                  target: {
                    type: "CHARACTER",
                    controller: "OPPONENT",
                    count: { up_to: 1 },
                    filter: { cost_max: 6 },
                  },
                },
              ],
            ],
          },
        },
      ],
    },
  ],
};

export const EB05_044_MS_FATHERS_DAY: EffectSchema = {
  card_id: "EB05-044",
  card_name: "Ms. Father's Day",
  card_type: "Character",
  effects: [
    {
      id: "on_play_leader_debuff",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: {
        all_of: [
          { type: "LEADER_PROPERTY", controller: "SELF", property: { trait_contains: "Baroque Works" } },
          {
            type: "CARD_ON_FIELD",
            controller: "OPPONENT",
            filter: { card_type: "CHARACTER", cost_exact: 0 },
          },
        ],
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "OPPONENT_LEADER" },
          params: { amount: -1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_045_MS_MONDAY: EffectSchema = {
  card_id: "EB05-045",
  card_name: "Ms. Monday",
  card_type: "Character",
  effects: [
    {
      // FAQ: may K.O. itself, or nothing.
      id: "on_play_ko_own_baroque_works",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Baroque Works"] },
          },
        },
      ],
    },
    {
      id: "on_ko_search_trash_rest",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: {
            look_at: 3,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Baroque Works"] },
            rest_destination: "TRASH",
          },
        },
      ],
    },
  ],
};

export const EB05_046_YAMATO: EffectSchema = {
  card_id: "EB05-046",
  card_name: "Yamato",
  card_type: "Character",
  effects: [
    {
      id: "big_opponent_blocker_power",
      category: "permanent",
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "OPPONENT",
        filter: { card_type: "CHARACTER", base_power_min: 8000 },
      },
      modifiers: [
        { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" } },
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 3000 } },
      ],
    },
    {
      // FAQ: the trash count includes the card trashed for the cost.
      id: "opponent_attack_trash_set_leader_base_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      post_cost_conditions: {
        type: "TRASH_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 10,
      },
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER" },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const EB05_047_RIPLEY: EffectSchema = {
  card_id: "EB05-047",
  card_name: "Ripley",
  card_type: "Character",
  effects: [
    {
      id: "plus_twelve_cost",
      category: "permanent",
      modifiers: [{ type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } }],
    },
    {
      id: "on_play_trash_play_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { cost_max: 2 },
          },
          params: { source_zone: "TRASH" },
        },
      ],
    },
  ],
};

export const EB05_048_HEDGEHOG_STINGER: EffectSchema = {
  card_id: "EB05-048",
  card_name: "Hedgehog Stinger",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_zero_no_blocker",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "KO_OWN_CHARACTER", amount: 1, filter: { traits_contains: ["Baroque Works"] } },
      ],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "ALL_OPPONENT_CHARACTERS", filter: { cost_exact: 0 } },
          params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_leader_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [leaderBattlePower(3000)],
    },
  ],
};

export const EB05_049_SPECIAL_HOLLOW: EffectSchema = {
  card_id: "EB05-049",
  card_name: "Special Hollow",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_thriller_bark_cost_down",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "KO_OWN_CHARACTER", amount: 1, filter: { traits: ["Thriller Bark Pirates"] } },
      ],
      actions: [
        {
          type: "MODIFY_COST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_ko_thriller_bark_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "KO_OWN_CHARACTER", amount: 1, filter: { traits: ["Thriller Bark Pirates"] } },
      ],
      actions: [ownLeaderOrCharacterBattlePower(4000)],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// YELLOW
// ═══════════════════════════════════════════════════════════════════════════

export const EB05_050_ATLAS: EffectSchema = {
  card_id: "EB05-050",
  card_name: "Atlas",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_wisdom",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 4,
            pick: { up_to: 1 },
            filter: { attribute: "WISDOM" },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    TRIGGER_REUSE_ON_PLAY,
  ],
};

export const EB05_051_AHIRU: EffectSchema = {
  card_id: "EB05-051",
  card_name: "Ahiru",
  card_type: "Character",
  effects: [
    {
      id: "on_play_rest_by_combined_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: { type: "GAME_STATE", source: "COMBINED_LIFE_COUNT" } },
          },
        },
      ],
    },
    TRIGGER_PLAY_SELF,
  ],
};

export const EB05_052_GLORIOSA: EffectSchema = {
  card_id: "EB05-052",
  card_name: "Gloriosa",
  card_type: "Character",
  // Partial: the "If you would take damage" replacement is deferred (header).
  effects: [TRIGGER_DRAW_2_TRASH_1],
};

export const EB05_053_CHARLOTTE_PRALINE: EffectSchema = {
  card_id: "EB05-053",
  card_name: "Charlotte Praline",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_hand_to_life",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { once_per_turn: true },
      conditions: { type: "HAND_COUNT", controller: "OPPONENT", operator: ">=", value: 9 },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_HAND",
          target: { type: "CARD_IN_HAND", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1, face: "DOWN", position: "TOP" },
        },
      ],
    },
    TRIGGER_TRASH_PLAY_SELF_AT_TWO_LIFE,
  ],
};

export const EB05_054_CHARLOTTE_BRULEE: EffectSchema = {
  card_id: "EB05-054",
  card_name: "Charlotte Brulee",
  card_type: "Character",
  effects: [
    {
      id: "trigger_play_two_big_mom",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 2 },
            filter: { traits: ["Big Mom Pirates"], power_exact: 4000 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const EB05_055_NAMI: EffectSchema = {
  card_id: "EB05-055",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_on_play_add_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { attribute: "WISDOM" },
      },
      actions: [ADD_TOP_DECK_TO_LIFE],
    },
    TRIGGER_TRASH_PLAY_SELF_AT_TWO_LIFE,
  ],
};

export const EB05_056_NICO_OLVIA: EffectSchema = {
  card_id: "EB05-056",
  card_name: "Nico Olvia",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_trigger_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { has_trigger: true } }],
      post_cost_conditions: leaderName("Nico Robin"),
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
    TRIGGER_PLAY_SELF,
  ],
};

export const EB05_057_NOJIKO: EffectSchema = {
  card_id: "EB05-057",
  card_name: "Nojiko",
  card_type: "Character",
  effects: [
    {
      // FAQ: a multi-attribute card qualifies if it has Special or Wisdom.
      id: "activate_give_rested_don",
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
            filter: { any_of: [{ attribute: "SPECIAL" }, { attribute: "WISDOM" }] },
          },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
    {
      id: "trigger_play_trigger_character",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      conditions: OWN_LIFE_AT_MOST_2,
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { power_max: 6000, has_trigger: true },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const EB05_059_CHARLOTTE_PUDDING: EffectSchema = {
  card_id: "EB05-059",
  card_name: "Charlotte Pudding!!",
  card_type: "Event",
  effects: [
    {
      // FAQ: OP17-107 Charlotte Daifuku is not protected by this effect.
      id: "main_draw_battle_ko_protection",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "APPLY_PROHIBITION",
          chain: "THEN",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { base_power_exact: 4000, traits: ["Big Mom Pirates"] },
          },
          params: { prohibition_type: "CANNOT_BE_KO", scope: { cause: "BATTLE" } },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    {
      id: "trigger_draw_play_trigger_character",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "PLAY_CARD",
          chain: "THEN",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { power_exact: 4000, has_trigger: true },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const EB05_060_TAKE_CARE_OF_LILITH: EffectSchema = {
  card_id: "EB05-060",
  card_name: "Take Care of Lilith!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_trash_egghead_add_life",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [
        { type: "TRASH_OWN_CHARACTER", amount: 1, filter: { traits: ["Egghead"], cost_min: 5 } },
      ],
      actions: [ADD_TOP_DECK_TO_LIFE],
    },
    {
      id: "counter_face_up_life_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [{ type: "TURN_LIFE_FACE_UP", amount: 1, position: "TOP" }],
      actions: [ownLeaderOrCharacterBattlePower(4000)],
    },
  ],
};

export const EB05_061_NAMI: EffectSchema = {
  card_id: "EB05-061",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      // FAQ: covers this Character itself; unusable with 0 Life cards.
      id: "removal_life_to_hand_instead",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", base_power_max: 6000 },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [{ type: "LIFE_TO_HAND", params: { amount: 1, position: "TOP" } }],
      flags: { once_per_turn: true, optional: true },
    },
    {
      id: "on_play_play_red_cost_two",
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
            filter: { color: "RED", cost_max: 2 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const EB05_SCHEMAS: Record<string, EffectSchema> = {
  "EB05-001": EB05_001_JEWELRY_BONNEY,
  "EB05-002": EB05_002_DOLL,
  "EB05-004": EB05_004_BABY_5,
  "EB05-005": EB05_005_BELO_BETTY,
  "EB05-006": EB05_006_MISS_BUCKINGHAM_STUSSY,
  "EB05-007": EB05_007_MONET,
  "EB05-008": EB05_008_LUFFY_NOWS_YOUR_CHANCE,
  "EB05-009": EB05_009_FIGHT_AND_DIE_WITH_ME,
  "EB05-010": EB05_010_NICO_ROBIN,
  "EB05-011": EB05_011_OTOHIME,
  "EB05-012": EB05_012_CAMIE,
  "EB05-013": EB05_013_SHIRLEY,
  "EB05-014": EB05_014_SHIRAHOSHI,
  "EB05-016": EB05_016_NICO_ROBIN,
  "EB05-017": EB05_017_MERMAID_CAFE_DANCERS,
  "EB05-018": EB05_018_REBECCA,
  "EB05-019": EB05_019_OPEN_THIS_COUNTRY,
  "EB05-020": EB05_020_MY_NAME_IS_SHIRAHOSHI,
  "EB05-021": EB05_021_ALVIDA,
  "EB05-022": EB05_022_OCTOPAKO,
  "EB05-023": EB05_023_OSOME,
  "EB05-024": EB05_024_LITTLE_SADI,
  "EB05-025": EB05_025_DOMINO,
  "EB05-027": EB05_027_HIBARI,
  "EB05-028": EB05_028_BOA_HANCOCK,
  "EB05-029": EB05_029_KIMONO_SLEEVE_CAGE,
  "EB05-030": EB05_030_TAKE_CARE_EVERYBODY,
  "EB05-031": EB05_031_VINSMOKE_REIJU,
  "EB05-033": EB05_033_NICO_ROBIN,
  "EB05-034": EB05_034_SUGAR,
  "EB05-035": EB05_035_SPEED,
  "EB05-036": EB05_036_TSURU,
  "EB05-037": EB05_037_BLACK_MARIA,
  "EB05-038": EB05_038_RUSSIAN,
  "EB05-039": EB05_039_PINK_HORNET,
  "EB05-040": EB05_040_YOU_NEED_ME_DONT_YOU,
  "EB05-042": EB05_042_SHINOBU,
  "EB05-043": EB05_043_PERONA,
  "EB05-044": EB05_044_MS_FATHERS_DAY,
  "EB05-045": EB05_045_MS_MONDAY,
  "EB05-046": EB05_046_YAMATO,
  "EB05-047": EB05_047_RIPLEY,
  "EB05-048": EB05_048_HEDGEHOG_STINGER,
  "EB05-049": EB05_049_SPECIAL_HOLLOW,
  "EB05-050": EB05_050_ATLAS,
  "EB05-051": EB05_051_AHIRU,
  "EB05-052": EB05_052_GLORIOSA,
  "EB05-053": EB05_053_CHARLOTTE_PRALINE,
  "EB05-054": EB05_054_CHARLOTTE_BRULEE,
  "EB05-055": EB05_055_NAMI,
  "EB05-056": EB05_056_NICO_OLVIA,
  "EB05-057": EB05_057_NOJIKO,
  "EB05-059": EB05_059_CHARLOTTE_PUDDING,
  "EB05-060": EB05_060_TAKE_CARE_OF_LILITH,
  "EB05-061": EB05_061_NAMI,
};
