/**
 * OP17 Effect Schemas — Leaders, Events, and Stage
 *
 * OPT-727 slice: 6 Leaders, 15 Events, and 1 Stage.
 */

import type { EffectSchema } from "../effect-types.js";

// ─── OP17-001 Edward.Newgate (Leader) ───────────────────────────────────────
// [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your
// hand: Up to 1 of your Leader or Characters gains +4000 power during this battle.

export const OP17_001_EDWARD_NEWGATE: EffectSchema = {
  card_id: "OP17-001",
  card_name: "Edward.Newgate",
  card_type: "Leader",
  effects: [
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-017 Ga Ha Ha Ha!! (Event) ─────────────────────────────────────────

export const OP17_017_GA_HA_HA_HA: EffectSchema = {
  card_id: "OP17-017",
  card_name: "Ga Ha Ha Ha!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_power_swing",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Whitebeard Pirates"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

// ─── OP17-019 I Don't Have Time to Chat with Snot-Nosed Brats (Event) ───────

export const OP17_019_I_DONT_HAVE_TIME_TO_CHAT: EffectSchema = {
  card_id: "OP17-019",
  card_name: "I Don't Have Time to Chat with Snot-Nosed Brats",
  card_type: "Event",
  effects: [
    {
      id: "main_search_whitebeard",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Whitebeard Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "trigger_leader_power",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ─── OP17-020 Shanks (Leader) ───────────────────────────────────────────────

export const OP17_020_SHANKS: EffectSchema = {
  card_id: "OP17-020",
  card_name: "Shanks",
  card_type: "Leader",
  effects: [
    {
      id: "activate_skip_refresh",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "CHOICE",
          labels: ["Trash card from hand", "Rest 1 DON"],
          options: [
            [{ type: "TRASH_FROM_HAND", amount: 1 }],
            [{ type: "REST_DON", amount: 1 }],
          ],
        },
      ],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-036 Withdraw Now and Allow Me to Save Face (Event) ────────────────

export const OP17_036_WITHDRAW_NOW: EffectSchema = {
  card_id: "OP17-036",
  card_name: "Withdraw Now and Allow Me to Save Face",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_then_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { is_rested: true, cost_max: 6 },
          },
          chain: "THEN",
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_shanks_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Shanks" },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-037 Are You That Afraid of the New Era?!! (Event) ────────────────

export const OP17_037_AFRAID_OF_THE_NEW_ERA: EffectSchema = {
  card_id: "OP17-037",
  card_name: "Are You That Afraid of the New Era?!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search_red_hair",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "SEARCH_DECK",
          params: {
            look_at: 5,
            pick: { up_to: 1 },
            filter: { traits_contains: ["Red-Haired Pirates"] },
            rest_destination: "BOTTOM",
          },
        },
      ],
    },
    {
      id: "counter_rest_card_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [
        {
          type: "CHOICE",
          labels: ["Rest 1 field card", "Rest 1 DON!! card"],
          options: [
            [
              {
                type: "REST_CARDS",
                amount: 1,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
            ],
            [{ type: "REST_DON", amount: 1 }],
          ],
        },
      ],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP17-038 I Think He's Seen an Ugly Future... (Event) ──────────────────

export const OP17_038_UGLY_FUTURE: EffectSchema = {
  card_id: "OP17-038",
  card_name: "I Think He's Seen an Ugly Future...",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_character",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        {
          type: "CHOICE",
          labels: [
            "Rest 4 field cards",
            "Rest 3 field cards and 1 DON!! card",
            "Rest 2 field cards and 2 DON!! cards",
            "Rest 1 field card and 3 DON!! cards",
            "Rest 4 DON!! cards",
          ],
          options: [
            [
              {
                type: "REST_CARDS",
                amount: 4,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
            ],
            [
              {
                type: "REST_CARDS",
                amount: 3,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
              { type: "REST_DON", amount: 1 },
            ],
            [
              {
                type: "REST_CARDS",
                amount: 2,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
              { type: "REST_DON", amount: 2 },
            ],
            [
              {
                type: "REST_CARDS",
                amount: 1,
                filter: { card_type: ["LEADER", "CHARACTER", "STAGE"] },
              },
              { type: "REST_DON", amount: 3 },
            ],
            [{ type: "REST_DON", amount: 4 }],
          ],
        },
      ],
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_trash_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      flags: { optional: true },
    },
  ],
};

// ─── OP17-039 Rocks.D.Xebec (Leader) ────────────────────────────────────────

export const OP17_039_ROCKS_D_XEBEC: EffectSchema = {
  card_id: "OP17-039",
  card_name: "Rocks.D.Xebec",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_reveal_draw",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "REVEAL",
          params: { amount: 1, source: "DECK_TOP" },
          result_ref: "revealed",
        },
        {
          type: "DRAW",
          params: { amount: 2 },
          chain: "THEN",
          conditions: {
            type: "REVEALED_CARD_PROPERTY",
            result_ref: "revealed",
            filter: { traits_contains: ["Rocks Pirates"] },
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-055 There's No Authority in the World That Lasts Forever (Event) ─

export const OP17_055_NO_AUTHORITY_LASTS_FOREVER: EffectSchema = {
  card_id: "OP17-055",
  card_name: "There's No Authority in the World That Lasts Forever!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_xebec_unblockable",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 1 }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Rocks.D.Xebec" },
          },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_rocks_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Rocks Pirates"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-056 Rocks Pirates (Event) ─────────────────────────────────────────

export const OP17_056_ROCKS_PIRATES: EffectSchema = {
  card_id: "OP17-056",
  card_name: "Rocks Pirates",
  card_type: "Event",
  effects: [
    {
      id: "main_return_character",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 5 }],
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
    {
      id: "counter_rocks_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Rocks Pirates"] },
          },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-057 Fullalead (Stage) ─────────────────────────────────────────────

export const OP17_057_FULLALEAD: EffectSchema = {
  card_id: "OP17-057",
  card_name: "Fullalead",
  card_type: "Stage",
  effects: [
    {
      id: "on_opponent_attack_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      costs: [{ type: "REST_SELF" }, { type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits_contains: ["Rocks Pirates"] },
          },
          params: { amount: 1000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-058 Kaido (Leader) ────────────────────────────────────────────────

export const OP17_058_KAIDO: EffectSchema = {
  card_id: "OP17-058",
  card_name: "Kaido",
  card_type: "Leader",
  effects: [
    {
      id: "attack_timing_debuff",
      category: "auto",
      trigger: {
        any_of: [
          { keyword: "WHEN_ATTACKING" },
          { keyword: "ON_OPPONENT_ATTACK" },
        ],
      },
      costs: [{ type: "DON_MINUS", amount: 1 }],
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
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

// ─── OP17-076 Wo Ro Ro Ro Ro... I Think I've Sobered Up (Event) ────────────

export const OP17_076_I_THINK_IVE_SOBERED_UP: EffectSchema = {
  card_id: "OP17-076",
  card_name: "Wo Ro Ro Ro Ro... I Think I've Sobered Up",
  card_type: "Event",
  effects: [
    {
      id: "counter_trash_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      // Canonical source typo: "Charactes" is interpreted as "Characters".
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
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
      flags: { optional: true },
    },
    {
      id: "trigger_draw",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    },
  ],
};

// ─── OP17-077 Kundali Dragon Swarm (Event) ──────────────────────────────────

export const OP17_077_KUNDALI_DRAGON_SWARM: EffectSchema = {
  card_id: "OP17-077",
  card_name: "Kundali Dragon Swarm",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "REST_DON", amount: 3 },
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 3, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_leader_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-078 Drunken Dragon Bagua (Event) ──────────────────────────────────

export const OP17_078_DRUNKEN_DRAGON_BAGUA: EffectSchema = {
  card_id: "OP17-078",
  card_name: "Drunken Dragon Bagua",
  card_type: "Event",
  effects: [
    {
      id: "main_add_don",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [
        { type: "REST_DON", amount: 2 },
        { type: "TRASH_FROM_HAND", amount: 2 },
      ],
      post_cost_conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { trait: "Animal Kingdom Pirates" },
      },
      actions: [
        {
          type: "ADD_DON_FROM_DECK",
          params: { amount: 3, target_state: "RESTED" },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_power",
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
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-079 Monkey.D.Luffy (Leader) ───────────────────────────────────────

export const OP17_079_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP17-079",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "cost_12_blocker_aura",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
            filter: { cost_min: 12 },
          },
          params: { keyword: "BLOCKER" },
        },
      ],
    },
  ],
};

// ─── OP17-096 I'm Luffy!! The Man Who Will Be King of the Pirates!! ─────────

export const OP17_096_IM_LUFFY: EffectSchema = {
  card_id: "OP17-096",
  card_name: "I'm Luffy!! The Man Who Will Be King of the Pirates!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_cost_12_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
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
      id: "trigger_recover_elbaph",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CARD_IN_TRASH",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { traits: ["Elbaph"] },
          },
        },
      ],
    },
  ],
};

// ─── OP17-097 I'll Feed on This Rage and Use It to Bring the World to Ruin ──

export const OP17_097_FEED_ON_THIS_RAGE: EffectSchema = {
  card_id: "OP17-097",
  card_name: "I'll Feed on This Rage and Use It to Bring the World to Ruin!!!",
  card_type: "Event",
  effects: [
    {
      id: "main_all_opponent_cost",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_OPPONENT_CHARACTERS" },
          params: { amount: -1 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_leader_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-098 Gum-Gum Kong Gun (Event) ──────────────────────────────────────

export const OP17_098_GUM_GUM_KONG_GUN: EffectSchema = {
  card_id: "OP17-098",
  card_name: "Gum-Gum Kong Gun",
  card_type: "Event",
  effects: [
    {
      id: "main_cost_12_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 6 }],
      post_cost_conditions: {
        type: "BOARD_WIDE_EXISTENCE",
        filter: { card_type: "CHARACTER", cost_min: 12 },
      },
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 2 },
            filter: { cost_max: 6 },
          },
        },
      ],
      flags: { optional: true },
    },
    {
      id: "counter_leader_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-099 Charlotte Linlin (Leader) ─────────────────────────────────────

export const OP17_099_CHARLOTTE_LINLIN: EffectSchema = {
  card_id: "OP17-099",
  card_name: "Charlotte Linlin",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_opponent_choice",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            labels: ["Trash 1 card; add 1 Life", "Trash 1 card from hand"],
            options: [
              [
                { type: "TRASH_FROM_HAND", params: { amount: 1 } },
                {
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP", face: "DOWN" },
                  chain: "THEN",
                },
              ],
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: {
                      type: "TRASH_CARD",
                      target: {
                        type: "CARD_IN_HAND",
                        controller: "SELF",
                        count: { exact: 1 },
                      },
                    },
                  },
                },
              ],
            ],
          },
        },
      ],
      flags: { optional: true },
    },
  ],
};

// ─── OP17-115 Don't You Know... There's Still a Code of Honor?!! (Event) ───

export const OP17_115_CODE_OF_HONOR: EffectSchema = {
  card_id: "OP17-115",
  card_name:
    "Don't you know that even in the cruel world of pirates there's still a code of honor?!!",
  card_type: "Event",
  effects: [
    {
      id: "main_linlin_unblockable",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        type: "LEADER_PROPERTY",
        controller: "SELF",
        property: { name: "Charlotte Linlin" },
      },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "YOUR_LEADER" },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_linlin_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ─── OP17-117 Maser Saber (Event) ───────────────────────────────────────────

export const OP17_117_MASER_SABER: EffectSchema = {
  card_id: "OP17-117",
  card_name: "Maser Saber",
  card_type: "Event",
  effects: [
    {
      id: "counter_linlin_power",
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
            filter: { name: "Charlotte Linlin" },
          },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_discard_or_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          // GAP: OPPONENT_CHOICE has no branch-feasibility contract, so the
          // exact-3 branch cannot be hidden when the opponent has fewer than
          // 3 cards without changing engine vocabulary.
          type: "OPPONENT_CHOICE",
          params: {
            mandatory: true,
            labels: ["Trash 3 cards from hand", "K.O. a Character"],
            options: [
              [
                {
                  type: "OPPONENT_ACTION",
                  params: {
                    mandatory: true,
                    action: {
                      type: "TRASH_CARD",
                      target: {
                        type: "CARD_IN_HAND",
                        controller: "SELF",
                        count: { exact: 3 },
                      },
                    },
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

export const OP17_SCHEMAS: Record<string, EffectSchema> = {
  "OP17-001": OP17_001_EDWARD_NEWGATE,
  "OP17-017": OP17_017_GA_HA_HA_HA,
  "OP17-019": OP17_019_I_DONT_HAVE_TIME_TO_CHAT,
  "OP17-020": OP17_020_SHANKS,
  "OP17-036": OP17_036_WITHDRAW_NOW,
  "OP17-037": OP17_037_AFRAID_OF_THE_NEW_ERA,
  "OP17-038": OP17_038_UGLY_FUTURE,
  "OP17-039": OP17_039_ROCKS_D_XEBEC,
  "OP17-055": OP17_055_NO_AUTHORITY_LASTS_FOREVER,
  "OP17-056": OP17_056_ROCKS_PIRATES,
  "OP17-057": OP17_057_FULLALEAD,
  "OP17-058": OP17_058_KAIDO,
  "OP17-076": OP17_076_I_THINK_IVE_SOBERED_UP,
  "OP17-077": OP17_077_KUNDALI_DRAGON_SWARM,
  "OP17-078": OP17_078_DRUNKEN_DRAGON_BAGUA,
  "OP17-079": OP17_079_MONKEY_D_LUFFY,
  "OP17-096": OP17_096_IM_LUFFY,
  "OP17-097": OP17_097_FEED_ON_THIS_RAGE,
  "OP17-098": OP17_098_GUM_GUM_KONG_GUN,
  "OP17-099": OP17_099_CHARLOTTE_LINLIN,
  "OP17-115": OP17_115_CODE_OF_HONOR,
  "OP17-117": OP17_117_MASER_SABER,
};
