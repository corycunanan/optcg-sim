/**
 * OP18 Effect Schemas — BOOSTER PACK -THE DOMINANCE OF GOD- [OP-18]
 *
 * Effect-bearing new IDs. Reprint slots are authored in their origin sets.
 * Rulings: docs/FAQs/qa_op18.md.
 *
 * Partial cards (every expressible block authored; the missing clause is named
 * in a "Partial:" comment and in docs/game-engine/DEFERRED-CARD-EFFECTS.md):
 * OP18-080. Cards with no expressible block have no schema
 * yet: OP18-105, OP18-117.
 */
import type { Action, Condition, Cost, EffectSchema, TargetFilter } from "../effect-types.js";

type Block = EffectSchema["effects"][number];

function leaderTrait(trait: string): Condition {
  return { type: "LEADER_PROPERTY", controller: "SELF", property: { trait } };
}

function leaderTraitContains(trait: string): Condition {
  return { type: "LEADER_PROPERTY", controller: "SELF", property: { trait_contains: trait } };
}

function leaderName(name: string): Condition {
  return { type: "LEADER_PROPERTY", controller: "SELF", property: { name } };
}

const OPPONENT_TURN: Condition = { type: "IS_MY_TURN", controller: "OPPONENT" };
const YOUR_TURN: Condition = { type: "IS_MY_TURN", controller: "SELF" };

const ANIMAL_ALABASTA: TargetFilter = { traits: ["Animal", "Alabasta"] };
const BAROQUE_WORKS: TargetFilter = { traits_contains: ["Baroque Works"] };
const CP: TargetFilter = { traits_contains: ["CP"] };

function draw(amount: number, chain?: "THEN" | "AND"): Action {
  return chain ? { type: "DRAW", params: { amount }, chain } : { type: "DRAW", params: { amount } };
}

function trashOwnHand(amount: number): Action {
  return {
    type: "TRASH_FROM_HAND",
    chain: "THEN",
    target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: amount } },
    params: { amount },
  };
}

/** "your opponent trashes 1 card from their hand" — the opponent chooses (qa_op18 OP18-041/089). */
function opponentTrashesFromHand(chain?: "THEN" | "AND"): Action {
  const action: Action = {
    type: "TRASH_FROM_HAND",
    target: { type: "CARD_IN_HAND", controller: "OPPONENT", count: { exact: 1 } },
    params: { amount: 1, chooser: "OPPONENT" },
  };
  return chain ? { ...action, chain } : action;
}

function bottomOfOwnersDeck(costMax: number, chain?: "THEN" | "AND"): Action {
  const action: Action = {
    type: "RETURN_TO_DECK",
    target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 }, filter: { cost_max: costMax } },
    params: { position: "BOTTOM" },
  };
  return chain ? { ...action, chain } : action;
}

function permanentKeywordsAndPower(
  id: string,
  keywords: Array<"RUSH" | "BANISH" | "BLOCKER" | "DOUBLE_ATTACK" | "UNBLOCKABLE">,
  power: number,
  condition?: Condition,
): Block {
  const modifiers: NonNullable<Block["modifiers"]> = keywords.map((keyword) => ({
    type: "GRANT_KEYWORD",
    target: { type: "SELF" },
    params: { keyword },
  }));
  if (power !== 0) modifiers.push({ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: power } });
  if (!condition) return { id, category: "permanent", modifiers };
  // Turn gates follow the WHILE_CONDITION precedent (OP17-002); state gates use block conditions (ST01-013).
  return condition === OPPONENT_TURN || condition === YOUR_TURN
    ? { id, category: "permanent", modifiers, duration: { type: "WHILE_CONDITION", condition } }
    : { id, category: "permanent", conditions: condition, modifiers };
}

const PLUS_TWELVE_COST: Block = {
  id: "plus_twelve_cost",
  category: "permanent",
  modifiers: [{ type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 12 } }],
};

const DON_X1_PLUS_1000: Block = {
  id: "don_x1_power",
  category: "permanent",
  conditions: { type: "DON_GIVEN", controller: "SELF", mode: "SPECIFIC_CARD", operator: ">=", value: 1 },
  modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
};

const TRIGGER_DRAW_1: Block = {
  id: "trigger_draw",
  category: "auto",
  trigger: { keyword: "TRIGGER" },
  actions: [draw(1)],
};

const TRIGGER_REUSE_MAIN: Block = {
  id: "trigger_reuse_main",
  category: "auto",
  trigger: { keyword: "TRIGGER" },
  actions: [{ type: "REUSE_EFFECT", params: { target_effect: "MAIN_EVENT" } }],
};

function onKoPlaySelfFromTrash(costs: NonNullable<Block["costs"]>, extra: Partial<Block> = {}): Block {
  return {
    id: "on_ko_play_self_from_trash",
    category: "auto",
    trigger: { keyword: "ON_KO" },
    ...(costs.length > 0 ? { costs, flags: { optional: true } } : {}),
    ...extra,
    actions: [
      {
        type: "PLAY_CARD",
        target: { type: "TRIGGERING_CARD_IN_TRASH", controller: "SELF", count: { exact: 1 } },
        params: { source_zone: "TRASH" },
      },
    ],
  };
}

/** "[Trigger] If your Leader's type includes "CP", ..." — the condition gates every clause (qa_op18). */
function cpTrigger(actions: Action[]): Block {
  return {
    id: "trigger_cp",
    category: "auto",
    trigger: { keyword: "TRIGGER" },
    conditions: leaderTraitContains("CP"),
    actions,
  };
}

/** "Add up to 1 card with a type including "CP" from your hand to the top or bottom of your Life cards face-up." */
function cpHandToLifeFaceUp(chain?: "THEN"): Action {
  const add = (position: "TOP" | "BOTTOM"): Action => ({
    type: "ADD_TO_LIFE_FROM_HAND",
    target: { type: "CARD_IN_HAND", controller: "SELF", count: { up_to: 1 }, filter: CP },
    params: { amount: 1, face: "UP", position },
  });
  const choice: Action = {
    type: "PLAYER_CHOICE",
    params: { labels: ["Top of Life", "Bottom of Life"], options: [[add("TOP")], [add("BOTTOM")]] },
  };
  return chain ? { ...choice, chain } : choice;
}

/** "K.O. or rest up to 1 of your opponent's Characters with a cost of 6 or less." */
const KO_OR_REST_COST_6: Action = {
  type: "PLAYER_CHOICE",
  params: {
    labels: ["K.O.", "Rest"],
    options: [
      [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 6 } } }],
      [{ type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 6 } } }],
    ],
  },
};

function cannotBeRestedUntilNextEnd(costMax?: number, chain?: "THEN"): Action {
  const action: Action = {
    type: "APPLY_PROHIBITION",
    target: {
      type: "CHARACTER",
      controller: "OPPONENT",
      count: { up_to: 1 },
      ...(costMax !== undefined ? { filter: { cost_max: costMax } } : {}),
    },
    params: { prohibition_type: "CANNOT_BE_RESTED" },
    duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
  };
  return chain ? { ...action, chain } : action;
}

/** Stage [On Play]: "Draw 1 card, then add up to 1 DON!! card as rested from your DON!! deck." */
const STAGE_ON_PLAY_DRAW_DON: Block = {
  id: "on_play_draw_add_don",
  category: "auto",
  trigger: { keyword: "ON_PLAY" },
  actions: [
    draw(1),
    { type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED", up_to: true }, chain: "THEN" },
  ],
};

function searchTopToHand(lookAt: number, filter: TargetFilter, pick = 1): Action {
  return {
    type: "SEARCH_DECK",
    params: { look_at: lookAt, pick: { up_to: pick }, filter, rest_destination: "BOTTOM" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RED (and the Red/Blue Leader)
// ═══════════════════════════════════════════════════════════════════════════

export const OP18_001_KAROO: EffectSchema = {
  card_id: "OP18-001",
  card_name: "Karoo",
  card_type: "Leader",
  effects: [
    {
      id: "animal_alabasta_aura",
      category: "permanent",
      modifiers: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: ANIMAL_ALABASTA },
          params: { keyword: "RUSH" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: ANIMAL_ALABASTA },
          params: { amount: 1000 },
        },
      ],
    },
    {
      // FAQ: two simultaneous K.O.s still draw only 1 card.
      id: "alabasta_ko_draw",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        once_per_turn: true,
        filter: { controller: "SELF", target_filter: { traits: ["Alabasta"] } },
      },
      actions: [draw(1)],
    },
  ],
};

export const OP18_002_IGARAM: EffectSchema = {
  card_id: "OP18-002",
  card_name: "Igaram",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Alabasta"] } }],
      actions: [draw(2)],
    },
  ],
};

export const OP18_004_KAROO: EffectSchema = {
  card_id: "OP18-004",
  card_name: "Karoo",
  card_type: "Character",
  effects: [
    // FAQ: at 7000 or more it has all three keywords.
    permanentKeywordsAndPower("power_5000_rush", ["RUSH"], 0, { type: "SELF_POWER", operator: ">=", value: 5000 }),
    permanentKeywordsAndPower("power_6000_banish", ["BANISH"], 0, { type: "SELF_POWER", operator: ">=", value: 6000 }),
    permanentKeywordsAndPower("power_7000_unblockable", ["UNBLOCKABLE"], 0, { type: "SELF_POWER", operator: ">=", value: 7000 }),
  ],
};

export const OP18_005_KUNG_FU_JUGON: EffectSchema = {
  card_id: "OP18-005",
  card_name: "Kung Fu Jugon",
  card_type: "Character",
  effects: [
    {
      // FAQ: counts itself, and an all-names Leader.
      id: "your_turn_per_jugon_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "MATCHING_CARDS_ON_FIELD",
              multiplier: 1000,
              filter: { name: "Kung Fu Jugon" },
            },
          },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: YOUR_TURN },
    },
  ],
};

export const OP18_006_KOZA: EffectSchema = {
  card_id: "OP18-006",
  card_name: "Koza",
  card_type: "Character",
  effects: [
    permanentKeywordsAndPower("vivi_rush_power", ["RUSH"], 1000, {
      type: "CARD_ON_FIELD",
      controller: "SELF",
      filter: { name: "Nefeltari Vivi" },
    }),
  ],
};

export const OP18_007_SMOKER: EffectSchema = {
  card_id: "OP18-007",
  card_name: "Smoker",
  card_type: "Character",
  effects: [permanentKeywordsAndPower("navy_banish_power", ["BANISH"], 1000, leaderTrait("Navy"))],
};

export const OP18_008_CHAKA: EffectSchema = {
  card_id: "OP18-008",
  card_name: "Chaka",
  card_type: "Character",
  effects: [
    permanentKeywordsAndPower("alabasta_rush", ["RUSH"], 0, leaderTrait("Alabasta")),
    {
      id: "on_play_trash_draw_banish",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_max: 5000 } }],
      actions: [
        draw(2),
        {
          type: "GRANT_KEYWORD",
          target: { type: "SELF" },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP18_009_SUPER_SPOT_BILLED_DUCK_TROOPS: EffectSchema = {
  card_id: "OP18-009",
  card_name: "Super Spot-Billed Duck Troops",
  card_type: "Character",
  effects: [
    { id: "rush", category: "permanent", flags: { keywords: ["RUSH"] } },
    {
      id: "activate_trash_self_play_karoo",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      post_cost_conditions: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 9 },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            count: { up_to: 1 },
            filter: { name: "Karoo" },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const OP18_010_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP18-010",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_trash_to_hand",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { power_max: 4000 },
          },
        },
      ],
    },
  ],
};

export const OP18_011_NEFELTARI_VIVI: EffectSchema = {
  card_id: "OP18-011",
  card_name: "Nefeltari Vivi",
  card_type: "Character",
  effects: [
    {
      id: "animal_alabasta_power_aura",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: ANIMAL_ALABASTA },
          params: { amount: 1000 },
        },
      ],
    },
    permanentKeywordsAndPower("opponent_turn_blocker_power", ["BLOCKER"], 6000, OPPONENT_TURN),
  ],
};

export const OP18_012_PINCERS: EffectSchema = {
  card_id: "OP18-012",
  card_name: "Pincers",
  card_type: "Character",
  effects: [
    {
      id: "when_attacking_buff",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: ANIMAL_ALABASTA },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_013_PELL: EffectSchema = {
  card_id: "OP18-013",
  card_name: "Pell",
  card_type: "Character",
  effects: [
    permanentKeywordsAndPower("alabasta_rush", ["RUSH"], 0, leaderTrait("Alabasta")),
    {
      id: "on_play_trash_draw_trash_character",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { card_type: "CHARACTER", power_max: 5000 } }],
      actions: [
        draw(2),
        {
          type: "TRASH_CARD",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { base_power_max: 3000 } },
          chain: "THEN",
        },
      ],
    },
  ],
};

/** "[When Attacking] Up to 1 of your {Alabasta} type Characters gains [Rush] during this turn." */
const WHEN_ATTACKING_ALABASTA_RUSH: Block = {
  id: "when_attacking_grant_rush",
  category: "auto",
  trigger: { keyword: "WHEN_ATTACKING" },
  actions: [
    {
      type: "GRANT_KEYWORD",
      target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Alabasta"] } },
      params: { keyword: "RUSH" },
      duration: { type: "THIS_TURN" },
    },
  ],
};

export const OP18_014_PORTGAS_D_ACE: EffectSchema = {
  card_id: "OP18-014",
  card_name: "Portgas.D.Ace",
  card_type: "Character",
  effects: [WHEN_ATTACKING_ALABASTA_RUSH],
};

export const OP18_015_EYELASHES: EffectSchema = {
  card_id: "OP18-015",
  card_name: "Eyelashes",
  card_type: "Character",
  effects: [
    {
      // FAQ: any of the opponent's Leader or Characters, not only the attacker.
      id: "on_opponent_attack_debuff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      post_cost_conditions: leaderTrait("Alabasta"),
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_016_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP18-016",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    { id: "banish", category: "permanent", flags: { keywords: ["BANISH"] } },
    {
      id: "on_ko_play_alabasta",
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
            filter: { traits: ["Alabasta"], power_max: 6000 },
          },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

export const OP18_017_RORONOA_ZORO: EffectSchema = {
  card_id: "OP18-017",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    {
      // FAQ: also protects this Character itself.
      id: "removal_replacement_leader_debuff",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", traits: ["Alabasta"] },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: -2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    WHEN_ATTACKING_ALABASTA_RUSH,
  ],
};

export const OP18_018_LETS_GO_KAROO: EffectSchema = {
  card_id: "OP18-018",
  card_name: "Let's Go, Karoo!!",
  card_type: "Event",
  effects: [
    {
      // FAQ: Characters played after resolution do not gain the +1000.
      id: "main_alabasta_buff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { traits: ["Alabasta"] } },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "trigger_buff",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 2000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_019_QUACK: EffectSchema = {
  card_id: "OP18-019",
  card_name: "Quack!!!",
  card_type: "Event",
  effects: [
    {
      // FAQ: usable with 0 Characters.
      id: "main_debuff",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: {
        not: { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "CHARACTER", base_power_min: 7000 } },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
    {
      id: "counter_leader_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        { type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } },
      ],
    },
  ],
};

// OP18-020 Stop Fighting!!!
// [Counter] You may add all of your Life cards to your hand: If your Leader is
// [Nefeltari Vivi], give your opponent's Leader and all of their Characters
// −5000 power during this turn.
// FAQ: at 0 Life the cost cannot be paid, so the −5000 does not happen.

export const OP18_020_STOP_FIGHTING: EffectSchema = {
  card_id: "OP18-020",
  card_name: "Stop Fighting!!!",
  card_type: "Event",
  effects: [
    {
      id: "counter_all_life_debuff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", all: true }],
      // Post-colon "If" gate — evaluated once after costs are paid (rule 8-3-1).
      post_cost_conditions: leaderName("Nefeltari Vivi"),
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { all: true } },
          params: { amount: -5000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// GREEN (and the Green/Purple Leader)
// ═══════════════════════════════════════════════════════════════════════════

export const OP18_021_FRANKY: EffectSchema = {
  card_id: "OP18-021",
  card_name: "Franky",
  card_type: "Leader",
  effects: [
    {
      // All Stage cards in your hand have a +3000 Counter. FAQ: a Stage is
      // used in the Counter Step like a Character with a printed Counter.
      id: "stage_counter_grant",
      category: "rule_modification",
      rule: { rule_type: "COUNTER_GRANT", value: 3000, filter: { card_type: "STAGE" } },
    },
    {
      id: "activate_play_stage",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "STAGE_CARD", controller: "SELF", source_zone: "HAND", count: { up_to: 1 }, filter: { cost_max: 5 } },
          params: { source_zone: "HAND" },
        },
      ],
    },
  ],
};

/** "set this card as active. Then, it will not become active in your next Refresh Phase." (FAQ: if still active at that Refresh Phase, it stays active) */
function setSelfActiveSkipRefresh(chain: "THEN" | "AND" | undefined, prohibitionChain: "THEN" | "IF_DO"): Action[] {
  const setActive: Action = { type: "SET_ACTIVE", target: { type: "SELF" } };
  return [
    chain ? { ...setActive, chain } : setActive,
    {
      type: "APPLY_PROHIBITION",
      target: { type: "SELF" },
      params: { prohibition_type: "CANNOT_REFRESH" },
      duration: { type: "SKIP_NEXT_REFRESH" },
      chain: prohibitionChain,
    },
  ];
}

export const OP18_022_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP18-022",
  card_name: "Monkey.D.Luffy",
  card_type: "Leader",
  effects: [
    {
      id: "when_attacking_set_active",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING", don_requirement: 3 },
      flags: { once_per_turn: true, optional: true },
      actions: setSelfActiveSkipRefresh(undefined, "IF_DO"),
    },
  ],
};

export const OP18_023_GAIMON: EffectSchema = {
  card_id: "OP18-023",
  card_name: "Gaimon",
  card_type: "Character",
  effects: [
    {
      id: "on_play_grant_banish",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["East Blue"] } },
          params: { keyword: "BANISH" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

const SET_LEADER_ACTIVE: Action = { type: "SET_ACTIVE", target: { type: "YOUR_LEADER" } };

export const OP18_024_KOKORO: EffectSchema = {
  card_id: "OP18-024",
  card_name: "Kokoro",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "end_of_turn_trash_set_leader_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [SET_LEADER_ACTIVE],
    },
  ],
};

export const OP18_025_GONBE: EffectSchema = {
  card_id: "OP18-025",
  card_name: "Gonbe",
  card_type: "Character",
  effects: [
    {
      id: "end_of_turn_rested_set_leader_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      conditions: { type: "SELF_STATE", required_state: "RESTED" },
      actions: [SET_LEADER_ACTIVE],
    },
  ],
};

export const OP18_026_SANJI: EffectSchema = {
  card_id: "OP18-026",
  card_name: "Sanji",
  card_type: "Character",
  effects: [
    {
      // FAQ: also protects this Character itself.
      id: "removal_replacement_trash_self",
      category: "replacement",
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", traits: ["Straw Hat Crew"] },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
    },
  ],
};

export const OP18_027_ZORO_AND_SOGEKING: EffectSchema = {
  card_id: "OP18-027",
  card_name: "Zoro & Sogeking",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_luffy_base_power",
      category: "permanent",
      modifiers: [
        {
          type: "SET_POWER",
          target: {
            type: "YOUR_LEADER",
            filter: { name: "Monkey.D.Luffy", is_active: true, don_given_count: { operator: ">=", value: 3 } },
          },
          params: { value: 7000 },
        },
      ],
      duration: { type: "WHILE_CONDITION", condition: OPPONENT_TURN },
    },
    {
      id: "on_play_don_active_lock",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: { type: "DON_IN_COST_AREA", controller: "SELF", count: { up_to: 2 } },
          params: { amount: 2, up_to: true },
        },
        cannotBeRestedUntilNextEnd(6, "THEN"),
      ],
    },
  ],
};

export const OP18_028_CHIMNEY: EffectSchema = {
  card_id: "OP18-028",
  card_name: "Chimney",
  card_type: "Character",
  effects: [
    {
      id: "activate_rest_gonbe_set_luffy_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_NAMED_CARD", filter: { name: "Gonbe" }, amount: 1 }, { type: "REST_SELF" }],
      actions: [{ type: "SET_ACTIVE", target: { type: "YOUR_LEADER", filter: { name: "Monkey.D.Luffy" } } }],
    },
  ],
};

export const OP18_029_TONY_TONY_CHOPPER: EffectSchema = {
  card_id: "OP18-029",
  card_name: "Tony Tony.Chopper",
  card_type: "Character",
  effects: [
    { id: "rush", category: "permanent", flags: { keywords: ["RUSH"] } },
    {
      id: "when_attacking_give_don_set_active",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { once_per_turn: true },
      actions: [
        { type: "GIVE_DON", target: { type: "YOUR_LEADER" }, params: { amount: 3, don_state: "RESTED" } },
        ...setSelfActiveSkipRefresh("THEN", "THEN"),
      ],
    },
  ],
};

export const OP18_030_NAMI: EffectSchema = {
  card_id: "OP18-030",
  card_name: "Nami",
  card_type: "Character",
  effects: [
    {
      id: "opponent_turn_rested_debuff",
      category: "permanent",
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: -2000 } }],
      duration: {
        type: "WHILE_CONDITION",
        condition: { all_of: [OPPONENT_TURN, { type: "SELF_STATE", required_state: "RESTED" }] },
      },
    },
  ],
};

export const OP18_031_NICO_ROBIN: EffectSchema = {
  card_id: "OP18-031",
  card_name: "Nico Robin",
  card_type: "Character",
  effects: [
    {
      // FAQ: protects itself while active; unusable once already rested.
      id: "opponent_turn_removal_replacement_rest_self",
      category: "replacement",
      flags: { optional: true },
      conditions: OPPONENT_TURN,
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER" },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
    },
    {
      // FAQ: only your own DON!! cards.
      id: "end_of_turn_set_water_seven_and_don_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "FIELD_CARD", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Water Seven"] } },
        },
        {
          type: "SET_DON_ACTIVE",
          target: { type: "DON_IN_COST_AREA", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 1, up_to: true },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP18_032_BUGGY: EffectSchema = {
  card_id: "OP18-032",
  card_name: "Buggy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_ko_skip_refresh",
      category: "auto",
      trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "ON_KO" }] },
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { is_rested: true, power_max: 8000 },
          },
          params: { prohibition_type: "CANNOT_REFRESH" },
          duration: { type: "SKIP_NEXT_REFRESH" },
        },
      ],
    },
  ],
};

export const OP18_033_BANBAN: EffectSchema = {
  card_id: "OP18-033",
  card_name: "Banban",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "end_of_turn_trash_set_character_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [{ type: "SET_ACTIVE", target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } } }],
    },
  ],
};

export const OP18_034_FRANKY: EffectSchema = {
  card_id: "OP18-034",
  card_name: "Franky",
  card_type: "Character",
  effects: [
    {
      // FAQ: the played card may be a Stage.
      id: "on_play_play_card_then_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CARD_IN_HAND",
            controller: "SELF",
            count: { up_to: 1 },
            filter: {
              card_type: ["CHARACTER", "STAGE"],
              cost_max: 5,
              traits_any_of: ["The Franky Family", "Straw Hat Crew"],
            },
          },
          params: { source_zone: "HAND" },
        },
        {
          type: "SET_REST",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 6 } },
          conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "STAGE", cost_min: 5 } },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP18_036_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP18-036",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "end_of_turn_trash_draw_set_leader_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      flags: { optional: true },
      costs: [{ type: "TRASH_SELF" }],
      actions: [draw(1), { ...SET_LEADER_ACTIVE, chain: "THEN" }],
    },
  ],
};

export const OP18_037_YOKOZUNA: EffectSchema = {
  card_id: "OP18-037",
  card_name: "Yokozuna",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      // FAQ: any one Character, Stage, Leader or DON!! card (OP14-024 shape).
      id: "on_ko_rest_opponent_card",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        {
          type: "SET_REST",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            mixed_pool: {
              types: ["LEADER_OR_CHARACTER", "STAGE", "DON_IN_COST_AREA"],
              total_count: { up_to: 1 },
              filters: {
                LEADER_OR_CHARACTER: { is_active: true },
                STAGE: { is_active: true },
                DON_IN_COST_AREA: { is_active: true },
              },
            },
          },
        },
      ],
    },
  ],
};

export const OP18_038_SHOOT_DOWN_THAT_FLAG: EffectSchema = {
  card_id: "OP18-038",
  card_name: "Shoot Down That Flag.",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [searchTopToHand(5, { any_of: [{ name: "Sogeking" }, { traits: ["Straw Hat Crew"] }] })],
    },
    TRIGGER_DRAW_1,
  ],
};

export const OP18_039_GUM_GUM_GIANT_AXE: EffectSchema = {
  card_id: "OP18-039",
  card_name: "Gum-Gum Giant Axe",
  card_type: "Event",
  effects: [
    {
      id: "counter_luffy_buff_draw",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Monkey.D.Luffy" } },
          params: { amount: 2000 },
          duration: { type: "THIS_BATTLE" },
        },
        {
          ...draw(1, "THEN"),
          conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "LEADER", is_active: true } },
        },
      ],
    },
  ],
};

export const OP18_040_DIABLE_JAMBE_FLAMBE_SHOT: EffectSchema = {
  card_id: "OP18-040",
  card_name: "Diable Jambe Flambé Shot",
  card_type: "Event",
  effects: [
    {
      id: "main_ko_rested",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { is_rested: true, cost_max: 7 } } },
      ],
    },
    {
      id: "trigger_rest",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        { type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 7 } } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// BLUE
// ═══════════════════════════════════════════════════════════════════════════

export const OP18_041_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP18-041",
  card_name: "Ms. All Sunday",
  card_type: "Leader",
  effects: [
    {
      // FAQ: mandatory; the opponent chooses the card; still draws at 0 cards in their hand.
      id: "baroque_works_ko_draw_discard",
      category: "auto",
      trigger: {
        event: "ANY_CHARACTER_KO",
        filter: { controller: "SELF", target_filter: { ...BAROQUE_WORKS, base_power_min: 3000 } },
      },
      actions: [draw(1), opponentTrashesFromHand("THEN")],
    },
  ],
};

export const OP18_042_HACK: EffectSchema = {
  card_id: "OP18-042",
  card_name: "Hack",
  card_type: "Character",
  effects: [
    { id: "on_ko_draw", category: "auto", trigger: { keyword: "ON_KO" }, actions: [draw(1)] },
    {
      id: "activate_give_rested_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      actions: [
        {
          type: "GIVE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { exact: 1 }, filter: { traits: ["Dressrosa"] } },
          params: { amount: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

export const OP18_044_MR_BEANS_AND_MISS_KATHERINA: EffectSchema = {
  card_id: "OP18-044",
  card_name: "Mr.Beans & Miss.Katherina",
  card_type: "Character",
  effects: [
    DON_X1_PLUS_1000,
    { id: "on_play_draw_trash", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [draw(1), trashOwnHand(1)] },
  ],
};

export const OP18_045_MR_PRINCE: EffectSchema = {
  card_id: "OP18-045",
  card_name: "Mr.Prince",
  card_type: "Character",
  rule_modifications: [{ rule_type: "NAME_ALIAS", aliases: ["Sanji"] }],
  effects: [
    {
      id: "per_five_events_power",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: { type: "PER_COUNT", source: "EVENTS_IN_TRASH", multiplier: 1000, divisor: 5 } },
        },
      ],
    },
  ],
};

export const OP18_046_MR_0_AND_MS_ALL_SUNDAY: EffectSchema = {
  card_id: "OP18-046",
  card_name: "Mr.0 & Ms. All Sunday",
  card_type: "Character",
  effects: [
    {
      // OPT-955 acceptance card. FAQ: each target receives 0 to 2 rested DON!!.
      id: "on_play_draw_distribute_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        draw(2),
        {
          type: "DISTRIBUTE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { all: true } },
          params: { max_per_target: 2, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
    {
      id: "on_opponent_attack_leader_base_power",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "SET_BASE_POWER",
          target: { type: "YOUR_LEADER", filter: BAROQUE_WORKS },
          params: { value: 7000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_047_MR_1_DAZ_BONEZ: EffectSchema = {
  card_id: "OP18-047",
  card_name: "Mr.1(Daz.Bonez)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_leader_unblockable",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "YOUR_LEADER", filter: { any_of: [{ traits: ["Cross Guild"] }, BAROQUE_WORKS] } },
          params: { keyword: "UNBLOCKABLE" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

function playBaroqueWorksFromHand(costMax: number): Block {
  return {
    id: "on_play_play_baroque_works",
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
          filter: { ...BAROQUE_WORKS, cost_max: costMax },
        },
        params: { source_zone: "HAND" },
      },
    ],
  };
}

export const OP18_048_MR_1_AND_MISS_DOUBLEFINGER: EffectSchema = {
  card_id: "OP18-048",
  card_name: "Mr.1 & Miss Doublefinger",
  card_type: "Character",
  effects: [{ id: "rush", category: "permanent", flags: { keywords: ["RUSH"] } }, playBaroqueWorksFromHand(5)],
};

export const OP18_049_MR_2_BON_KUREI: EffectSchema = {
  card_id: "OP18-049",
  card_name: "Mr.2.Bon.Kurei(Bentham)",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_give_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        searchTopToHand(5, BAROQUE_WORKS),
        {
          type: "GIVE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { exact: 1 } },
          params: { amount: 1, don_state: "RESTED" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP18_050_MR_3_AND_MISS_GOLDENWEEK: EffectSchema = {
  card_id: "OP18-050",
  card_name: "Mr.3 & Miss.Goldenweek",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      conditions: leaderTraitContains("Baroque Works"),
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 7 } },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
  ],
};

export const OP18_051_MR_4_AND_MISS_MERRYCHRISTMAS: EffectSchema = {
  card_id: "OP18-051",
  card_name: "Mr.4 & Miss.MerryChristmas",
  card_type: "Character",
  effects: [
    DON_X1_PLUS_1000,
    {
      // FAQ: either player's Characters, each to its owner's deck.
      id: "on_play_rest_don_bottom_two",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "DON_REST", amount: 5 }],
      actions: [
        {
          type: "RETURN_TO_DECK",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            dual_targets: [
              { filter: { cost_max: 6 }, count: { up_to: 1 } },
              { filter: { cost_max: 5 }, count: { up_to: 1 } },
            ],
          },
          params: { position: "BOTTOM" },
        },
      ],
    },
  ],
};

export const OP18_052_MR_5_AND_MISS_VALENTINE: EffectSchema = {
  card_id: "OP18-052",
  card_name: "Mr.5 & Miss.Valentine",
  card_type: "Character",
  effects: [DON_X1_PLUS_1000, playBaroqueWorksFromHand(3)],
};

export const OP18_053_MR_7_AND_MISS_FATHERSDAY: EffectSchema = {
  card_id: "OP18-053",
  card_name: "Mr.7 & Miss.Father'sDay",
  card_type: "Character",
  effects: [
    DON_X1_PLUS_1000,
    {
      id: "on_play_scry",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DECK_SCRY", params: { look_at: 3, destination: "TOP_OR_BOTTOM" } }],
    },
  ],
};

export const OP18_054_MR_8_AND_MS_MONDAY: EffectSchema = {
  card_id: "OP18-054",
  card_name: "Mr.8 & Ms. Monday",
  card_type: "Character",
  effects: [
    DON_X1_PLUS_1000,
    {
      // FAQ: also protects this Character itself.
      id: "opponent_turn_removal_replacement_trash_hand",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      conditions: OPPONENT_TURN,
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", ...BAROQUE_WORKS },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }],
    },
  ],
};

export const OP18_055_MR_9_AND_MS_WEDNESDAY: EffectSchema = {
  card_id: "OP18-055",
  card_name: "Mr.9 & Ms. Wednesday",
  card_type: "Character",
  effects: [
    DON_X1_PLUS_1000,
    {
      id: "on_play_bounce",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 2 } } },
      ],
    },
  ],
};

export const OP18_056_MR_13_AND_MS_FRIDAY: EffectSchema = {
  card_id: "OP18-056",
  card_name: "Mr.13 & Ms.Friday",
  card_type: "Character",
  effects: [
    DON_X1_PLUS_1000,
    {
      // FAQ: another copy of this card may pay the cost.
      id: "on_play_bottom_ally_discard",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1, filter: { ...BAROQUE_WORKS, exclude_self: true } }],
      actions: [opponentTrashesFromHand()],
    },
  ],
};

const COUNTER_LEADER_3000: Block = {
  id: "counter_leader_buff",
  category: "auto",
  trigger: { keyword: "COUNTER_EVENT" },
  actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }],
};

export const OP18_057_ATOMIC_DICER: EffectSchema = {
  card_id: "OP18-057",
  card_name: "Atomic Dicer",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_don_bounce",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "DON_REST", amount: 3 }],
      actions: [
        { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "EITHER", count: { up_to: 1 }, filter: { cost_max: 5 } } },
      ],
    },
    COUNTER_LEADER_3000,
  ],
};

export const OP18_058_THIS_KINGDOM_IS_DOOMED: EffectSchema = {
  card_id: "OP18-058",
  card_name: "This Kingdom is Doomed. You Can't Save It!",
  card_type: "Event",
  effects: [
    {
      id: "main_bounce_own_bottom_any",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1 }],
      actions: [bottomOfOwnersDeck(4)],
    },
    TRIGGER_REUSE_MAIN,
  ],
};

export const OP18_059_I_PRAY_FOR_YOUR_SUCCESS: EffectSchema = {
  card_id: "OP18-059",
  card_name: "I Pray For Your Success.",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_trash_draw",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "DON_REST", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1, filter: BAROQUE_WORKS }],
      actions: [draw(2)],
    },
    {
      id: "counter_trash_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PURPLE (and the Purple/Black Leader)
// ═══════════════════════════════════════════════════════════════════════════

export const OP18_060_SAINT_GUNKO: EffectSchema = {
  card_id: "OP18-060",
  card_name: "Saint Gunko",
  card_type: "Leader",
  effects: [
    {
      id: "trash_played_draw_discard",
      category: "auto",
      trigger: {
        event: "CHARACTER_PLAYED",
        once_per_turn: true,
        filter: { controller: "SELF", source_zone: "TRASH" },
      },
      actions: [draw(2), trashOwnHand(1)],
    },
    {
      id: "activate_trash_add_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      post_cost_conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", base_power_min: 8000 },
      },
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "ACTIVE", up_to: true } }],
    },
  ],
};

export const OP18_061_ICEBURG: EffectSchema = {
  card_id: "OP18-061",
  card_name: "Iceburg",
  card_type: "Character",
  effects: [
    {
      // FAQ: any Stage qualifies, Water Seven or not.
      id: "on_play_search_two",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [searchTopToHand(5, { any_of: [{ card_type: "STAGE" }, { traits: ["Water Seven"] }] }, 2)],
    },
  ],
};

// "You may K.O. 1 of your Stages with a cost of 5 or less:" (OPT-1050).
const KO_OWN_STAGE_COST_5: Cost[] = [{ type: "KO_OWN_STAGE", filter: { cost_max: 5 } }];

// OP18-063 Kiwi & Mozu
// [On Play] You may K.O. 1 of your Stages with a cost of 5 or less: Add up to
// 1 DON!! card as rested from your DON!! deck.

export const OP18_063_KIWI_AND_MOZU: EffectSchema = {
  card_id: "OP18-063",
  card_name: "Kiwi & Mozu",
  card_type: "Character",
  effects: [
    {
      id: "on_play_ko_stage_add_don",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: KO_OWN_STAGE_COST_5,
      actions: [{ type: "ADD_DON_FROM_DECK", params: { amount: 1, target_state: "RESTED", up_to: true } }],
    },
  ],
};

export const OP18_064_SAINT_KILLINGHAM: EffectSchema = {
  card_id: "OP18-064",
  card_name: "Saint Killingham",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_on_play_cannot_attack",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            dual_targets: [
              { filter: { base_power_max: 7000 }, count: { up_to: 1 } },
              { filter: { base_power_max: 5000 }, count: { up_to: 1 } },
            ],
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
        },
      ],
    },
    onKoPlaySelfFromTrash([{ type: "DON_MINUS", amount: 1 }]),
  ],
};

export const OP18_065_SAINT_GUNKO: EffectSchema = {
  card_id: "OP18-065",
  card_name: "Saint Gunko",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      id: "on_play_play_celestial_dragon_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Celestial Dragons"], power_max: 6000 },
          },
          params: { source_zone: "TRASH" },
        },
      ],
    },
  ],
};

// OP18-066 Zambai
// [Activate: Main] You may K.O. 1 of your Stages with a cost of 5 or less:
// This Character gains [Rush] during this turn.

export const OP18_066_ZAMBAI: EffectSchema = {
  card_id: "OP18-066",
  card_name: "Zambai",
  card_type: "Character",
  effects: [
    {
      id: "activate_ko_stage_rush",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: KO_OWN_STAGE_COST_5,
      actions: [
        { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "RUSH" }, duration: { type: "THIS_TURN" } },
      ],
    },
  ],
};

export const OP18_067_CHARLOTTE_SMOOTHIE: EffectSchema = {
  card_id: "OP18-067",
  card_name: "Charlotte Smoothie",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Big Mom Pirates"] } }],
      actions: [draw(2)],
    },
  ],
};

export const OP18_068_SENOR_PINK: EffectSchema = {
  card_id: "OP18-068",
  card_name: "Senor Pink",
  card_type: "Character",
  effects: [
    {
      id: "replacement_ko_don_minus",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }],
    },
    {
      id: "on_play_cannot_be_rested",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [cannotBeRestedUntilNextEnd(7)],
    },
  ],
};

export const OP18_069_SODOMU_AND_GOMORA: EffectSchema = {
  card_id: "OP18-069",
  card_name: "Sodomu & Gomora",
  card_type: "Character",
  effects: [
    {
      id: "franky_family_ko_replacement",
      category: "replacement",
      flags: { optional: true },
      replaces: {
        event: "WOULD_BE_KO",
        target_filter: { controller: "SELF", card_type: "CHARACTER", traits: ["The Franky Family"] },
      },
      replacement_actions: [
        { type: "RETURN_DON_TO_DECK", params: { amount: 1 } },
        { type: "SET_REST", target: { type: "SELF" }, chain: "THEN" },
      ],
    },
  ],
};

export const OP18_070_TOM: EffectSchema = {
  card_id: "OP18-070",
  card_name: "Tom",
  card_type: "Character",
  effects: [
    {
      id: "on_play_stages_from_trash",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        { type: "RETURN_TO_HAND", target: { type: "STAGE_CARD", controller: "SELF", source_zone: "TRASH", count: { up_to: 2 } } },
      ],
    },
  ],
};

export const OP18_071_TREBOL: EffectSchema = {
  card_id: "OP18-071",
  card_name: "Trebol",
  card_type: "Character",
  effects: [
    {
      // FAQ: also protects this Character itself.
      id: "donquixote_removal_replacement",
      category: "replacement",
      flags: { once_per_turn: true, optional: true },
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", traits: ["Donquixote Pirates"] },
        cause_filter: { by: "OPPONENT_EFFECT" },
      },
      replacement_actions: [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }],
    },
    // Printed "If your Leader is {Sugar}". No card has a Sugar type, so this
    // reads as the Leader's name, like other "If your Leader is [X]" text.
    permanentKeywordsAndPower("opponent_turn_sugar_blocker_power", ["BLOCKER"], 2000, {
      all_of: [OPPONENT_TURN, leaderName("Sugar")],
    }),
  ],
};

export const OP18_072_THE_FRANKY_FAMILY: EffectSchema = {
  card_id: "OP18-072",
  card_name: "The Franky Family",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    {
      // [Activate: Main] [Once Per Turn] You may K.O. 1 of your Stages with a
      // cost of 5 or less: If this Character was played on this turn, give up
      // to 1 of your opponent's Characters −3000 power during this turn.
      id: "activate_ko_stage_debuff",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true, optional: true },
      costs: KO_OWN_STAGE_COST_5,
      // Post-colon "If" gate — evaluated once after costs are paid (rule 8-3-1).
      post_cost_conditions: { type: "WAS_PLAYED_THIS_TURN" },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          params: { amount: -3000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_074_CAN_YOU_PLEASE_SAIL: EffectSchema = {
  card_id: "OP18-074",
  card_name: "Can You Please Sail on the Ship I Made?!",
  card_type: "Event",
  effects: [
    {
      id: "counter_stage_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "STAGE", cost_min: 5 } },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    {
      id: "trigger_stages_from_trash",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      costs: [{ type: "DON_MINUS", amount: 1 }],
      actions: [
        { type: "RETURN_TO_HAND", target: { type: "STAGE_CARD", controller: "SELF", source_zone: "TRASH", count: { up_to: 2 } } },
      ],
    },
  ],
};

export const OP18_075_THOUSAND_SUNNY: EffectSchema = {
  card_id: "OP18-075",
  card_name: "Thousand Sunny",
  card_type: "Stage",
  effects: [
    STAGE_ON_PLAY_DRAW_DON,
    {
      id: "activate_set_straw_hat_active",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "DON_MINUS", amount: 2 }, { type: "REST_SELF" }],
      actions: [
        {
          type: "SET_ACTIVE",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Straw Hat Crew"], power_max: 7000 } },
        },
      ],
    },
  ],
};

export const OP18_076_SHARK_SUBMERGE_3: EffectSchema = {
  card_id: "OP18-076",
  card_name: "Shark Submerge 3",
  card_type: "Stage",
  effects: [
    STAGE_ON_PLAY_DRAW_DON,
    {
      // FAQ: the 5000 check reads current power (a 6000 Leader at −1000 qualifies).
      id: "on_opponent_attack_buff",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER", filter: { power_max: 5000 } },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 2 } },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
          chain: "THEN",
        },
      ],
    },
  ],
};

export const OP18_077_WHITE_HOBBY_HORSE_1: EffectSchema = {
  card_id: "OP18-077",
  card_name: "White Hobby Horse 1",
  card_type: "Stage",
  effects: [
    STAGE_ON_PLAY_DRAW_DON,
    {
      id: "activate_grant_rush_character",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "GRANT_KEYWORD",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Straw Hat Crew"] } },
          params: { keyword: "RUSH_CHARACTER" },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_078_MINI_MERRY: EffectSchema = {
  card_id: "OP18-078",
  card_name: "Mini-Merry",
  card_type: "Stage",
  effects: [
    STAGE_ON_PLAY_DRAW_DON,
    {
      // FAQ: at most 4 recipients in total, Leader included.
      id: "activate_distribute_don",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "DISTRIBUTE_DON",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 4 } },
          params: { amount_per_target: 1, don_state: "RESTED" },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// BLACK (and the Black/Yellow Leader)
// ═══════════════════════════════════════════════════════════════════════════

export const OP18_079_SPANDAM: EffectSchema = {
  card_id: "OP18-079",
  card_name: "Spandam",
  card_type: "Leader",
  effects: [
    {
      id: "activate_add_life",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [
        { type: "DON_REST", amount: 2 },
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1, filter: CP },
      ],
      actions: [{ type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN", up_to: true } }],
    },
  ],
};

export const OP18_080_VAN_AUGUR: EffectSchema = {
  card_id: "OP18-080",
  card_name: "Van Augur",
  card_type: "Character",
  effects: [
    // Partial: "When a card is trashed from your hand by your [Marshall.D.Teach]
    // Leader's effect" is deferred. The CARD_TRASHED_FROM_HAND effect_source
    // filter matches only controller and traits, not a name or the Leader.
    { id: "on_ko_draw", category: "auto", trigger: { keyword: "ON_KO" }, actions: [draw(1)] },
  ],
};

export const OP18_081_OARS: EffectSchema = {
  card_id: "OP18-081",
  card_name: "Oars",
  card_type: "Character",
  effects: [
    permanentKeywordsAndPower("moria_double_attack_blocker", ["DOUBLE_ATTACK", "BLOCKER"], 0, {
      type: "CARD_ON_FIELD",
      controller: "SELF",
      filter: { card_type: "CHARACTER", name: "Gecko Moria" },
    }),
    {
      id: "trigger_play_thriller_bark_rested",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        {
          type: "PLAY_CARD",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "TRASH",
            count: { up_to: 1 },
            filter: { traits: ["Thriller Bark Pirates"], cost_max: 4 },
          },
          params: { source_zone: "TRASH", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

export const OP18_082_CATARINA_DEVON: EffectSchema = {
  card_id: "OP18-082",
  card_name: "Catarina Devon",
  card_type: "Character",
  effects: [
    {
      // "your opponent's Leader's power": total power, as OP16-055.
      id: "when_attacking_copy_leader_power",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [{ type: "COPY_POWER", target: { type: "SELF" }, params: { source: "OPPONENT_LEADER" }, duration: { type: "THIS_TURN" } }],
    },
    {
      id: "on_ko_play_self_rested",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      post_cost_conditions: leaderTrait("Blackbeard Pirates"),
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "TRIGGERING_CARD_IN_TRASH", controller: "SELF", count: { exact: 1 } },
          params: { source_zone: "TRASH", entry_state: "RESTED" },
        },
      ],
    },
  ],
};

const HOLY_KNIGHTS: TargetFilter = { traits: ["Holy Knights of God"] };

function playHolyKnightFromTrash(): Action {
  return {
    type: "PLAY_CARD",
    target: {
      type: "CHARACTER_CARD",
      controller: "SELF",
      source_zone: "TRASH",
      count: { up_to: 1 },
      filter: { ...HOLY_KNIGHTS, cost_max: 6 },
    },
    params: { source_zone: "TRASH" },
  };
}

export const OP18_083_SAINT_KILLINGHAM: EffectSchema = {
  card_id: "OP18-083",
  card_name: "Saint Killingham",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_on_play_play_sleeptids",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      actions: [
        {
          type: "PLAY_CARD",
          target: { type: "CHARACTER_CARD", controller: "SELF", source_zone: "TRASH", count: { up_to: 1 }, filter: { name: "Sleeptids" } },
          params: { source_zone: "TRASH" },
        },
      ],
    },
    onKoPlaySelfFromTrash([{ type: "TRASH_FROM_HAND", amount: 2 }]),
  ],
};

export const OP18_084_SAINT_GUNKO: EffectSchema = {
  card_id: "OP18-084",
  card_name: "Saint Gunko",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search_trash_rest",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SEARCH_TRASH_THE_REST",
          params: { look_at: 4, pick: { up_to: 1 }, filter: HOLY_KNIGHTS, pick_destination: "HAND", rest_destination: "TRASH" },
        },
      ],
    },
    {
      id: "activate_rest_don_play_from_trash",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "DON_REST", amount: 4 }],
      actions: [playHolyKnightFromTrash()],
    },
  ],
};

// OP18-085 Cerberus
// [Activate: Main] You may return this Character to the owner's hand: Up to 1
// of your [Saint Shamrock] Characters gains [Rush], [Banish] or [Unblockable]
// during this turn.

function grantSaintShamrock(keyword: "RUSH" | "BANISH" | "UNBLOCKABLE"): Action[] {
  return [{
    type: "GRANT_KEYWORD",
    target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Saint Shamrock" } },
    params: { keyword },
    duration: { type: "THIS_TURN" },
  }];
}

export const OP18_085_CERBERUS: EffectSchema = {
  card_id: "OP18-085",
  card_name: "Cerberus",
  card_type: "Character",
  effects: [
    {
      id: "activate_return_self_grant_keyword",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      // OPT-1051: only this Character can pay the cost.
      costs: [{ type: "RETURN_SELF_TO_HAND" }],
      actions: [
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [grantSaintShamrock("RUSH"), grantSaintShamrock("BANISH"), grantSaintShamrock("UNBLOCKABLE")],
            labels: ["Rush", "Banish", "Unblockable"],
          },
        },
      ],
    },
  ],
};

export const OP18_086_GOLDBERG: EffectSchema = {
  card_id: "OP18-086",
  card_name: "Goldberg",
  card_type: "Character",
  effects: [
    PLUS_TWELVE_COST,
    {
      id: "on_ko_ko",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 4 } } }],
    },
  ],
};

export const OP18_087_STANSEN: EffectSchema = {
  card_id: "OP18-087",
  card_name: "Stansen",
  card_type: "Character",
  effects: [
    PLUS_TWELVE_COST,
    permanentKeywordsAndPower("cost_12_purity_power", [], 2000, {
      type: "FIELD_PURITY",
      controller: "SELF",
      filter: { cost_min: 12 },
    }),
  ],
};

export const OP18_088_SAINT_SOMMERS: EffectSchema = {
  card_id: "OP18-088",
  card_name: "Saint Sommers",
  card_type: "Character",
  effects: [
    {
      id: "your_turn_on_play_ko",
      category: "auto",
      trigger: { keyword: "ON_PLAY", turn_restriction: "YOUR_TURN" },
      conditions: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 6 },
      actions: [
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { base_cost_max: 4 } } },
      ],
    },
    onKoPlaySelfFromTrash([{ type: "TRASH_FROM_HAND", amount: 2 }]),
  ],
};

export const OP18_089_DORRY: EffectSchema = {
  card_id: "OP18-089",
  card_name: "Dorry",
  card_type: "Character",
  effects: [
    PLUS_TWELVE_COST,
    {
      // FAQ: the opponent chooses the card.
      id: "on_play_trash_discard",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [opponentTrashesFromHand()],
    },
  ],
};

export const OP18_091_BROGY: EffectSchema = {
  card_id: "OP18-091",
  card_name: "Brogy",
  card_type: "Character",
  effects: [
    PLUS_TWELVE_COST,
    {
      id: "when_attacking_trash_recover",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "RETURN_TO_HAND",
          target: { type: "CHARACTER_CARD", controller: "SELF", source_zone: "TRASH", count: { up_to: 1 }, filter: { cost_max: 2 } },
        },
      ],
    },
  ],
};

export const OP18_092_RORONOA_ZORO: EffectSchema = {
  card_id: "OP18-092",
  card_name: "Roronoa Zoro",
  card_type: "Character",
  effects: [
    permanentKeywordsAndPower("cost_12_power", [], 3000, {
      type: "BOARD_WIDE_EXISTENCE",
      filter: { card_type: "CHARACTER", cost_min: 12 },
    }),
    permanentKeywordsAndPower("trash_10_rush", ["RUSH"], 0, {
      type: "TRASH_COUNT",
      controller: "SELF",
      operator: ">=",
      value: 10,
    }),
  ],
};

export const OP18_093_SLEEPTIDS: EffectSchema = {
  card_id: "OP18-093",
  card_name: "Sleeptids",
  card_type: "Character",
  effects: [
    { id: "unlimited_copies", category: "rule_modification", rule: { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" } },
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
  ],
};

export const OP18_094_HEE_HEE_HEE: EffectSchema = {
  card_id: "OP18-094",
  card_name: "Hee Hee Hee!! I Smell Adventure!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [searchTopToHand(5, { traits: ["Elbaph"] })],
    },
    TRIGGER_DRAW_1,
  ],
};

export const OP18_095_IM_LATE: EffectSchema = {
  card_id: "OP18-095",
  card_name: "I'm Late, I'm Very Late!!",
  card_type: "Event",
  effects: [
    {
      id: "main_search",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      conditions: leaderTrait("Celestial Dragons"),
      actions: [searchTopToHand(5, { any_of: [{ name: "Sleeptids" }, HOLY_KNIGHTS] })],
    },
    TRIGGER_REUSE_MAIN,
  ],
};

export const OP18_096_ILL_MAKE_THE_CALL: EffectSchema = {
  card_id: "OP18-096",
  card_name: "I'll Make the Call",
  card_type: "Event",
  effects: [
    {
      id: "main_rest_don_play_from_trash",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      costs: [{ type: "DON_REST", amount: 3 }],
      actions: [playHolyKnightFromTrash()],
    },
    {
      id: "counter_trash_10_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: { type: "TRASH_COUNT", controller: "SELF", operator: ">=", value: 10 },
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
  ],
};

export const OP18_097_ABYSS_PENTAGRAM: EffectSchema = {
  card_id: "OP18-097",
  card_name: "Abyss Pentagram",
  card_type: "Stage",
  effects: [
    {
      // OP05-097 Mary Geoise shape, gated on the Leader instead of the turn.
      id: "permanent_play_cost_reduction",
      category: "permanent",
      conditions: leaderTrait("Celestial Dragons"),
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER_CARD",
            controller: "SELF",
            source_zone: "HAND",
            filter: { traits_any_of: ["Holy Knights of God", "Five Elders"], cost_min: 2 },
          },
          params: { amount: -1 },
        },
      ],
    },
    {
      id: "on_play_draw_mill",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [draw(1), { type: "MILL", params: { amount: 2 }, chain: "THEN" }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// YELLOW
// ═══════════════════════════════════════════════════════════════════════════

export const OP18_098_ONIGUMO: EffectSchema = {
  card_id: "OP18-098",
  card_name: "Onigumo",
  card_type: "Character",
  effects: [{ id: "unblockable", category: "permanent", flags: { keywords: ["UNBLOCKABLE"] } }],
};

/** "[Trigger] If your Leader's type includes "CP", draw 1 card and place up to 1 Character with a cost of 8 or less at the bottom of the owner's deck." */
const CP_TRIGGER_DRAW_BOTTOM_8 = cpTrigger([draw(1), bottomOfOwnersDeck(8, "THEN")]);

export const OP18_099_KAKU: EffectSchema = {
  card_id: "OP18-099",
  card_name: "Kaku",
  card_type: "Character",
  effects: [
    { id: "on_play_cp_to_life", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [cpHandToLifeFaceUp()] },
    CP_TRIGGER_DRAW_BOTTOM_8,
  ],
};

export const OP18_100_KALIFA: EffectSchema = {
  card_id: "OP18-100",
  card_name: "Kalifa",
  card_type: "Character",
  effects: [
    {
      id: "on_play_draw_cp_to_life",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [draw(1), cpHandToLifeFaceUp("THEN")],
    },
    cpTrigger([
      draw(1),
      { type: "SET_REST", target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { up_to: 1 } }, chain: "THEN" },
    ]),
  ],
};

export const OP18_101_KUMADORI: EffectSchema = {
  card_id: "OP18-101",
  card_name: "Kumadori",
  card_type: "Character",
  effects: [
    { id: "on_ko_cp_to_life", category: "auto", trigger: { keyword: "ON_KO" }, actions: [cpHandToLifeFaceUp()] },
    cpTrigger([KO_OR_REST_COST_6]),
  ],
};

const TRASH_OPPONENT_TOP_LIFE: Action = {
  type: "TRASH_FROM_LIFE",
  target: { type: "OPPONENT_LIFE" },
  params: { amount: 1, position: "TOP", controller: "OPPONENT", up_to: true },
};

export const OP18_103_JABRA: EffectSchema = {
  card_id: "OP18-103",
  card_name: "Jabra",
  card_type: "Character",
  effects: [
    {
      id: "on_ko_life_swap",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [
        { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN", up_to: true } },
        { ...TRASH_OPPONENT_TOP_LIFE, chain: "THEN" },
      ],
    },
    CP_TRIGGER_DRAW_BOTTOM_8,
  ],
};

export const OP18_104_STRAWBERRY: EffectSchema = {
  card_id: "OP18-104",
  card_name: "Strawberry",
  card_type: "Character",
  effects: [{ id: "banish", category: "permanent", flags: { keywords: ["BANISH"] } }],
};

// OP18-105 Spandam — no schema yet: its [Trigger] activates the [Trigger] of a
// revealed hand card, and no action does that (FAQ: the revealed card returns
// to hand and this card is trashed). See DEFERRED-CARD-EFFECTS.md.

export const OP18_106_DOBERMAN: EffectSchema = {
  card_id: "OP18-106",
  card_name: "Doberman",
  card_type: "Character",
  effects: [{ id: "double_attack", category: "permanent", flags: { keywords: ["DOUBLE_ATTACK"] } }],
};

export const OP18_107_NERO: EffectSchema = {
  card_id: "OP18-107",
  card_name: "Nero",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    cpTrigger([bottomOfOwnersDeck(5)]),
  ],
};

export const OP18_108_FUNKFREED: EffectSchema = {
  card_id: "OP18-108",
  card_name: "Funkfreed",
  card_type: "Character",
  effects: [
    {
      id: "on_play_trash_cp_draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1, filter: CP }],
      actions: [draw(2)],
    },
    {
      id: "activate_rest_buff_spandam",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { optional: true },
      costs: [{ type: "REST_SELF" }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { name: "Spandam" } },
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    },
  ],
};

export const OP18_109_FUKUROU: EffectSchema = {
  card_id: "OP18-109",
  card_name: "Fukurou",
  card_type: "Character",
  effects: [
    { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
    cpTrigger([KO_OR_REST_COST_6]),
  ],
};

export const OP18_110_BLUENO: EffectSchema = {
  card_id: "OP18-110",
  card_name: "Blueno",
  card_type: "Character",
  effects: [
    {
      id: "on_play_search",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [searchTopToHand(4, { ...CP, exclude_name: "Blueno" })],
    },
    {
      id: "trigger_draw_ko",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        draw(1),
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 2 } }, chain: "THEN" },
      ],
    },
  ],
};

export const OP18_111_MOMONGA: EffectSchema = {
  card_id: "OP18-111",
  card_name: "Momonga",
  card_type: "Character",
  effects: [{ id: "rush", category: "permanent", flags: { keywords: ["RUSH"] } }],
};

export const OP18_112_YAMAKAJI: EffectSchema = {
  card_id: "OP18-112",
  card_name: "Yamakaji",
  card_type: "Character",
  effects: [{ id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } }],
};

export const OP18_113_ROB_LUCCI: EffectSchema = {
  card_id: "OP18-113",
  card_name: "Rob Lucci",
  card_type: "Character",
  effects: [
    {
      id: "on_play_or_ko_trash_opponent_life",
      category: "auto",
      trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "ON_KO" }] },
      actions: [TRASH_OPPONENT_TOP_LIFE],
    },
    CP_TRIGGER_DRAW_BOTTOM_8,
  ],
};

export const OP18_114_WANZE: EffectSchema = {
  card_id: "OP18-114",
  card_name: "Wanze",
  card_type: "Character",
  effects: [
    { id: "on_play_reorder_life", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "REORDER_ALL_LIFE" }] },
    cpTrigger([bottomOfOwnersDeck(5)]),
  ],
};

export const OP18_115_TEN_FINGER_PISTOL: EffectSchema = {
  card_id: "OP18-115",
  card_name: "Ten Finger Pistol",
  card_type: "Event",
  effects: [
    {
      id: "main_ko",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 5 } } }],
    },
    cpTrigger([draw(1), bottomOfOwnersDeck(7, "THEN")]),
  ],
};

export const OP18_116_IRON_BODY_EMPTY_TREE: EffectSchema = {
  card_id: "OP18-116",
  card_name: "Iron Body Empty Tree",
  card_type: "Event",
  effects: [
    {
      id: "counter_trash_buff",
      category: "auto",
      trigger: { keyword: "COUNTER_EVENT" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [
        {
          type: "MODIFY_POWER",
          target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    },
    cpTrigger([{ type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }]),
  ],
};

// OP18-117 Buster Call — no schema yet: it is paid by "trash all of your Life
// cards" (no cost type takes all of the Life; FAQ: at 0 Life nothing happens),
// and "play up to a total of 5 ... with different card names from your deck
// or trash" has no batch play from two zones. See DEFERRED-CARD-EFFECTS.md.

export const OP18_118_MONKEY_D_LUFFY: EffectSchema = {
  card_id: "OP18-118",
  card_name: "Monkey.D.Luffy",
  card_type: "Character",
  effects: [
    {
      id: "on_play_don_active_lock",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "SET_DON_ACTIVE",
          target: { type: "DON_IN_COST_AREA", controller: "SELF", count: { up_to: 3 } },
          params: { amount: 3, up_to: true },
        },
        cannotBeRestedUntilNextEnd(undefined, "THEN"),
      ],
    },
    {
      id: "end_of_turn_set_water_seven_active",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [
        { type: "SET_ACTIVE", target: { type: "FIELD_CARD", controller: "SELF", count: { up_to: 1 }, filter: { traits: ["Water Seven"] } } },
      ],
    },
  ],
};

export const OP18_119_SAINT_SHAMROCK: EffectSchema = {
  card_id: "OP18-119",
  card_name: "Saint Shamrock",
  card_type: "Character",
  effects: [
    onKoPlaySelfFromTrash([{ type: "TRASH_FROM_HAND", amount: 1 }]),
    {
      // FAQ: a copy re-played from the trash this turn qualifies.
      id: "activate_play_holy_knight",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      flags: { once_per_turn: true },
      conditions: { type: "WAS_PLAYED_THIS_TURN" },
      actions: [playHolyKnightFromTrash()],
    },
  ],
};

export const OP18_SCHEMAS: Record<string, EffectSchema> = Object.fromEntries(
  [
    OP18_001_KAROO, OP18_002_IGARAM, OP18_004_KAROO, OP18_005_KUNG_FU_JUGON, OP18_006_KOZA,
    OP18_007_SMOKER, OP18_008_CHAKA, OP18_009_SUPER_SPOT_BILLED_DUCK_TROOPS, OP18_010_TONY_TONY_CHOPPER,
    OP18_011_NEFELTARI_VIVI, OP18_012_PINCERS, OP18_013_PELL, OP18_014_PORTGAS_D_ACE, OP18_015_EYELASHES,
    OP18_016_MONKEY_D_LUFFY, OP18_017_RORONOA_ZORO, OP18_018_LETS_GO_KAROO, OP18_019_QUACK, OP18_020_STOP_FIGHTING,
    OP18_021_FRANKY, OP18_022_MONKEY_D_LUFFY, OP18_023_GAIMON, OP18_024_KOKORO, OP18_025_GONBE,
    OP18_026_SANJI, OP18_027_ZORO_AND_SOGEKING, OP18_028_CHIMNEY, OP18_029_TONY_TONY_CHOPPER, OP18_030_NAMI,
    OP18_031_NICO_ROBIN, OP18_032_BUGGY, OP18_033_BANBAN, OP18_034_FRANKY, OP18_036_MONKEY_D_LUFFY,
    OP18_037_YOKOZUNA, OP18_038_SHOOT_DOWN_THAT_FLAG, OP18_039_GUM_GUM_GIANT_AXE, OP18_040_DIABLE_JAMBE_FLAMBE_SHOT,
    OP18_041_MS_ALL_SUNDAY, OP18_042_HACK, OP18_044_MR_BEANS_AND_MISS_KATHERINA, OP18_045_MR_PRINCE,
    OP18_046_MR_0_AND_MS_ALL_SUNDAY, OP18_047_MR_1_DAZ_BONEZ, OP18_048_MR_1_AND_MISS_DOUBLEFINGER,
    OP18_049_MR_2_BON_KUREI, OP18_050_MR_3_AND_MISS_GOLDENWEEK, OP18_051_MR_4_AND_MISS_MERRYCHRISTMAS,
    OP18_052_MR_5_AND_MISS_VALENTINE, OP18_053_MR_7_AND_MISS_FATHERSDAY, OP18_054_MR_8_AND_MS_MONDAY,
    OP18_055_MR_9_AND_MS_WEDNESDAY, OP18_056_MR_13_AND_MS_FRIDAY, OP18_057_ATOMIC_DICER,
    OP18_058_THIS_KINGDOM_IS_DOOMED, OP18_059_I_PRAY_FOR_YOUR_SUCCESS,
    OP18_060_SAINT_GUNKO, OP18_061_ICEBURG, OP18_063_KIWI_AND_MOZU, OP18_064_SAINT_KILLINGHAM, OP18_065_SAINT_GUNKO,
    OP18_066_ZAMBAI,
    OP18_067_CHARLOTTE_SMOOTHIE, OP18_068_SENOR_PINK, OP18_069_SODOMU_AND_GOMORA, OP18_070_TOM, OP18_071_TREBOL,
    OP18_072_THE_FRANKY_FAMILY, OP18_074_CAN_YOU_PLEASE_SAIL, OP18_075_THOUSAND_SUNNY, OP18_076_SHARK_SUBMERGE_3,
    OP18_077_WHITE_HOBBY_HORSE_1, OP18_078_MINI_MERRY,
    OP18_079_SPANDAM, OP18_080_VAN_AUGUR, OP18_081_OARS, OP18_082_CATARINA_DEVON, OP18_083_SAINT_KILLINGHAM,
    OP18_084_SAINT_GUNKO, OP18_085_CERBERUS, OP18_086_GOLDBERG, OP18_087_STANSEN, OP18_088_SAINT_SOMMERS, OP18_089_DORRY,
    OP18_091_BROGY, OP18_092_RORONOA_ZORO, OP18_093_SLEEPTIDS, OP18_094_HEE_HEE_HEE, OP18_095_IM_LATE,
    OP18_096_ILL_MAKE_THE_CALL, OP18_097_ABYSS_PENTAGRAM,
    OP18_098_ONIGUMO, OP18_099_KAKU, OP18_100_KALIFA, OP18_101_KUMADORI, OP18_103_JABRA, OP18_104_STRAWBERRY,
    OP18_106_DOBERMAN, OP18_107_NERO, OP18_108_FUNKFREED, OP18_109_FUKUROU, OP18_110_BLUENO, OP18_111_MOMONGA,
    OP18_112_YAMAKAJI, OP18_113_ROB_LUCCI, OP18_114_WANZE, OP18_115_TEN_FINGER_PISTOL, OP18_116_IRON_BODY_EMPTY_TREE,
    OP18_118_MONKEY_D_LUFFY, OP18_119_SAINT_SHAMROCK,
  ].map((schema) => [schema.card_id!, schema]),
);
