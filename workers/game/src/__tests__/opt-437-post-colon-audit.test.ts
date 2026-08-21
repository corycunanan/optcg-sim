/**
 * OPT-437 — schema-wide post-colon condition audit.
 *
 * 142 effect blocks encoded post-colon "If ..." clauses as block-level
 * `conditions`, which resolveEffect evaluates BEFORE optional activation and
 * cost payment — suppressing legal cost payment. Per Rules 8-3-1/8-3-3 the
 * clause gates only the post-colon effect, and per Rule 4-10-1 it gates the
 * ENTIRE post-colon remainder, evaluated once. Each block was verified
 * against docs/cards printed text and re-encoded onto the new
 * `post_cost_conditions` gate (evaluated exactly once after costs are paid,
 * skipping the whole action chain when false). Lint rule C6 rejects new
 * costs + block-level-conditions encodings outside the pre-cost allowlist.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { evaluateCondition } from "../engine/conditions.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { EB03_028_YU } from "../engine/schemas/eb03.js";
import { EB02_010_MONKEY_D_LUFFY } from "../engine/schemas/eb02.js";
import { OP01_002_TRAFALGAR_LAW } from "../engine/schemas/op01.js";
import { ST23_003_BENN_BECKMAN } from "../engine/schemas/st23.js";
import { OP09_092_MARSHALL_D_TEACH } from "../engine/schemas/op09.js";
import { createBattleReadyState, createTestCardDb, padChars, CARDS } from "./helpers.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[idx] = { ...players[idx], ...patch };
  return { ...state, players };
}

/** Every block corrected by the OPT-437 audit (cardId, blockId). */
const CORRECTED: ReadonlyArray<readonly [string, string]> = [
  ["EB01-002", "on_opponent_attack_debuff"],
  ["EB01-031", "on_play_recover"],
  ["EB01-033", "on_play_play_character"],
  ["EB01-034", "on_opponent_attack_add_don"],
  ["EB01-038", "counter_redirect"],
  ["EB02-010", "activate_set_don_active_power"],
  ["EB02-025", "activate_search_and_play"],
  ["EB02-039", "main_trash_and_play"],
  ["EB02-041", "activate_cost_buff"],
  ["EB02-049", "activate_ko"],
  ["EB02-052", "when_attacking_life_and_power"],
  ["EB03-028", "activate_trash_draw"],
  ["EB03-029", "main_play_character"],
  ["EB03-031", "on_play_activate_event"],
  ["EB03-038", "main_add_don"],
  ["EB03-049", "main_play_characters"],
  ["EB03-052", "activate_add_life_power"],
  ["EB03-055", "on_play_trash_life_add"],
  ["EB04-019", "main_cost_reduction"],
  ["EB04-022", "on_play_force_place"],
  ["EB04-028", "main_prohibit_attack"],
  ["EB04-030", "on_play_rush_rest"],
  ["EB04-032", "activate_add_don"],
  ["EB04-033", "on_play_ko"],
  ["EB04-034", "on_opponent_attack_boost"],
  ["EB04-036", "on_play_draw_trash_rest"],
  ["EB04-045", "activate_power_boost"],
  ["EB04-059", "main_ko_two"],
  ["OP01-002", "activate_swap"],
  ["OP01-042", "on_play_set_active_wano"],
  ["OP01-094", "on_play_board_wipe"],
  ["OP02-066", "main_draw"],
  ["OP02-070", "activate_cycle"],
  ["OP03-020", "activate_search_event"],
  ["OP03-063", "on_play_conditional_draw"],
  ["OP03-073", "main_conditional_ko"],
  ["OP03-075", "activate_add_don"],
  ["OP03-077", "when_attacking_add_life"],
  ["OP03-093", "on_play_ko_cost_1"],
  ["OP03-098", "activate_cost_reduce"],
  ["OP04-026", "when_attacking_rest_then_don"],
  ["OP04-039", "activate_search"],
  ["OP04-059", "on_opponent_attack_blocker"],
  ["OP04-060", "on_play_add_life"],
  ["OP04-061", "activate_trash_add_don"],
  ["OP04-063", "on_opponent_attack_power"],
  ["OP04-091", "on_play_rest_leader_ko_mill"],
  ["OP04-098", "on_play_trash_for_life"],
  ["OP06-060", "OP06-060_effect_1"],
  ["OP06-063", "OP06-063_effect_1"],
  ["OP06-064", "OP06-064_effect_1"],
  ["OP06-066", "OP06-066_effect_1"],
  ["OP06-068", "OP06-068_effect_1"],
  ["OP06-071", "OP06-071_effect_1"],
  ["OP06-098", "OP06-098_effect_1"],
  ["OP07-047", "OP07-047_effect_1"],
  ["OP07-058", "OP07-058_effect_1"],
  ["OP07-059", "OP07-059_effect_1"],
  ["OP07-061", "OP07-061_effect_1"],
  ["OP07-063", "OP07-063_effect_1"],
  ["OP07-073", "OP07-073_effect_1"],
  ["OP07-074", "OP07-074_effect_1"],
  ["OP07-109", "OP07-109_effect_1"],
  ["OP08-016", "activate_power_boost"],
  ["OP08-032", "activate_set_don_active"],
  ["OP08-039", "activate_set_don_active"],
  ["OP08-040", "on_play_bounce"],
  ["OP08-041", "activate_bottom_deck"],
  ["OP08-059", "activate_evolve"],
  ["OP08-060", "on_play_rush"],
  ["OP08-062", "activate_evolve"],
  ["OP08-079", "activate_trash"],
  ["OP08-101", "activate_life_swap"],
  ["OP08-111", "trigger_effect"],
  ["OP08-114", "trigger_effect"],
  ["OP09-011", "activate_debuff"],
  ["OP09-021", "activate_debuff"],
  ["OP09-060", "activate_draw"],
  ["OP09-075", "on_play_life_for_don"],
  ["OP09-078", "counter_buff_draw"],
  ["OP09-083", "activate_cost_reduction"],
  ["OP09-089", "activate_draw_and_debuff"],
  ["OP09-090", "activate_ko"],
  ["OP09-092", "activate_draw_trash"],
  ["OP11-007", "activate_buff_navy"],
  ["OP11-008", "on_play_debuff"],
  ["OP11-063", "on_play_rest"],
  ["OP11-069", "on_play_life_for_don"],
  ["OP11-080", "main_add_don"],
  ["OP11-082", "activate_grant_and_mill"],
  ["OP11-114", "main_ko"],
  ["OP13-057", "OP13-057_main"],
  ["OP13-075", "OP13-075_main"],
  ["OP13-076", "OP13-076_main"],
  ["OP13-077", "OP13-077_main"],
  ["OP13-095", "OP13-095_on_play"],
  ["OP13-097", "OP13-097_main"],
  ["OP13-098", "OP13-098_main"],
  ["OP13-102", "OP13-102_activate_main"],
  ["OP13-104", "OP13-104_on_ko"],
  ["OP14-020", "OP14-020_activate"],
  ["OP14-076", "OP14-076_main"],
  ["OP14-078", "OP14-078_counter"],
  ["OP15-032", "OP15-032_activate"],
  ["OP15-042", "OP15-042_on_play"],
  ["OP15-064", "OP15-064_activate"],
  ["OP15-072", "OP15-072_activate"],
  ["OP15-074", "OP15-074_main"],
  ["OP15-075", "OP15-075_main"],
  ["OP15-076", "OP15-076_main"],
  ["OP15-083", "OP15-083_activate"],
  ["OP15-085", "OP15-085_activate"],
  ["OP15-093", "OP15-093_activate"],
  ["OP15-095", "OP15-095_main"],
  ["OP15-096", "OP15-096_main"],
  ["OP15-109", "OP15-109_on_play"],
  ["OP16-012", "on_play_rest_don_play_shanks"],
  ["OP16-038", "main_set_all_active"],
  ["OP16-047", "activate_opponent_hand_to_deck"],
  ["OP16-065", "activate_rest_don_add_active"],
  ["OP16-070", "on_play_rest_don_add"],
  ["OP16-081", "activate_big_character_debuff"],
  ["OP16-087", "on_play_trash_draw_cost"],
  ["OP16-100", "main_set_yamato_active"],
  ["P-081", "activate_return_self_play_cross_guild"],
  ["PRB02-010", "on_play_don_minus_draw_play"],
  ["ST04-017", "activate_add_don"],
  ["ST05-005", "activate_add_don"],
  ["ST06-017", "activate_cost_reduction"],
  ["ST07-001", "when_attacking_life_swap"],
  ["ST10-010", "on_play_opponent_trash"],
  ["ST12-007", "on_play_set_active"],
  ["ST13-003", "activate_add_to_life"],
  ["ST13-009", "ST13-009_on_play"],
  ["ST17-002", "on_play_bounce_for_bounce"],
  ["ST19-002", "on_play_trash_draw"],
  ["ST23-003", "on_play_ko"],
  ["ST25-004", "activate_play_cross_guild"],
  ["ST26-005", "on_play_or_attack_set_base_power"],
  ["ST27-001", "activate_power_boost"],
  ["ST27-002", "activate_cost_reduction"]
];

describe("OPT-437: corrected blocks use the post_cost_conditions gate", () => {
  const schemas = getAllAuthoredSchemas();
  it.each(CORRECTED)("%s %s", (cardId, blockId) => {
    const block = schemas[cardId]?.effects.find((b) => b.id === blockId);
    expect(block, `${cardId} ${blockId} missing`).toBeDefined();
    expect(block!.conditions, "block-level conditions must be gone").toBeUndefined();
    expect(block!.post_cost_conditions, "post_cost_conditions must be set").toBeDefined();
  });
});

describe("OPT-437 family: single gated action (EB03-028 Yu)", () => {
  function setup(handSize: number) {
    const cardDb = createTestCardDb();
    const yu: CardData = {
      ...cardDb.get("CHAR-VANILLA")!,
      id: "EB03-028",
      name: "Yu",
      effectSchema: EB03_028_YU,
    };
    cardDb.set(yu.id, yu);
    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      instanceId: "char-0-yu",
      cardId: yu.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state = withPlayer(state, 0, {
      characters: padChars([source]),
      hand: state.players[0].hand.slice(0, handSize),
    });
    return { state, cardDb };
  }

  it("with 5 hand cards: the TRASH_SELF cost is still paid, DRAW is skipped", () => {
    const { state, cardDb } = setup(5);
    const block = EB03_028_YU.effects.find((b) => b.id === "activate_trash_draw")!;
    const offered = resolveEffect(state, block, "char-0-yu", 0, cardDb);
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const result = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].characters.some((c) => c?.instanceId === "char-0-yu")).toBe(false);
    expect(result.state.players[0].trash.some((c) => c.cardId === "EB03-028")).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(5);
  });

  it("with 3 hand cards: the cost is paid and DRAW 2 resolves", () => {
    const { state, cardDb } = setup(3);
    const block = EB03_028_YU.effects.find((b) => b.id === "activate_trash_draw")!;
    const offered = resolveEffect(state, block, "char-0-yu", 0, cardDb);
    const result = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].characters.some((c) => c?.instanceId === "char-0-yu")).toBe(false);
    expect(result.state.players[0].hand).toHaveLength(5);
  });
});

describe("OPT-437 family: the gate covers the whole chain incl. THEN (EB02-010 Luffy)", () => {
  function setup(pureBoard: boolean) {
    const cardDb = createTestCardDb();
    const leader: CardData = {
      ...cardDb.get("LEADER-T")!,
      id: "EB02-010",
      name: "Monkey.D.Luffy",
      effectSchema: EB02_010_MONKEY_D_LUFFY,
    };
    cardDb.set(leader.id, leader);
    const shc: CardData = {
      ...cardDb.get("CHAR-VANILLA")!,
      id: "SHC-CHAR",
      name: "Nami",
      types: ["Straw Hat Crew"],
    };
    cardDb.set(shc.id, shc);

    let state = createBattleReadyState(cardDb);
    const chars: CardInstance[] = pureBoard
      ? [{
          instanceId: "char-0-shc",
          cardId: shc.id,
          zone: "CHARACTER",
          state: "ACTIVE",
          attachedDon: [],
          turnPlayed: 1,
          controller: 0,
          owner: 0,
        }]
      : (state.players[0].characters.filter(Boolean) as CardInstance[]);
    const donCostArea = state.players[0].donCostArea.map((d, i, arr) =>
      i >= arr.length - 2 ? { ...d, state: "RESTED" as const } : d,
    );
    state = withPlayer(state, 0, {
      leader: { ...state.players[0].leader, cardId: leader.id },
      characters: padChars(chars),
      donCostArea,
    });
    return { state, cardDb };
  }

  it("impure board: cost paid, SET_DON_ACTIVE and the THEN power boost are BOTH skipped", () => {
    const { state, cardDb } = setup(false);
    const donDeckBefore = state.players[0].donDeck.length;
    const activeEffectsBefore = state.activeEffects.length;
    const block = EB02_010_MONKEY_D_LUFFY.effects.find(
      (b) => b.id === "activate_set_don_active_power",
    )!;
    const result = resolveEffect(state, block, state.players[0].leader.instanceId, 0, cardDb);

    expect(result.resolved).toBe(true);
    // Cost paid: 2 DON returned to the DON deck.
    expect(result.state.players[0].donDeck).toHaveLength(donDeckBefore + 2);
    // Gated SET_DON_ACTIVE skipped: the rested pair stays rested.
    expect(
      result.state.players[0].donCostArea.filter((d) => d.state === "RESTED"),
    ).toHaveLength(2);
    // Rule 4-10-1: the "Then, +1000 power" clause is also skipped — no new
    // modifier was registered (pre-fix the THEN action ran unconditionally).
    expect(result.state.activeEffects).toHaveLength(activeEffectsBefore);
  });

  it("pure Straw Hat Crew board: both the DON activation and the power boost resolve", () => {
    const { state, cardDb } = setup(true);
    const activeEffectsBefore = state.activeEffects.length;
    const block = EB02_010_MONKEY_D_LUFFY.effects.find(
      (b) => b.id === "activate_set_don_active_power",
    )!;
    let result = resolveEffect(state, block, state.players[0].leader.instanceId, 0, cardDb);
    result = resumeFromStack(
      result.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:2" },
      cardDb,
    );

    expect(result.resolved).toBe(true);
    // Rested DON reactivated (2 rested → 0; DON_MINUS took 2 active first).
    expect(
      result.state.players[0].donCostArea.filter((d) => d.state === "RESTED"),
    ).toHaveLength(0);
    // The THEN power boost registered a modifier.
    expect(result.state.activeEffects.length).toBeGreaterThan(activeEffectsBefore);
  });
});

describe("OPT-437: OP01-002 Law — the gate is evaluated once, not per action", () => {
  it("with exactly 5 characters, the PLAY_CARD half is reachable after the return", () => {
    const cardDb = createTestCardDb();
    const leader: CardData = {
      ...cardDb.get("LEADER-T")!,
      id: "OP01-002",
      name: "Trafalgar Law",
      effectSchema: OP01_002_TRAFALGAR_LAW,
    };
    cardDb.set(leader.id, leader);

    let state = createBattleReadyState(cardDb);
    // Exactly 5 characters — the only satisfiable case (area cap is 5), and
    // the case that pre-fix ALWAYS dead-ended: the return dropped the count
    // to 4 and the per-action re-check skipped PLAY_CARD.
    const fillers: CardInstance[] = Array.from({ length: 5 }, (_, i) => ({
      instanceId: `law-char-${i}`,
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    }));
    // A playable BLUE hand candidate — the play filter excludes cards
    // matching the returned character's color (red in the test db).
    const blueChar: CardData = {
      ...cardDb.get("CHAR-VANILLA")!,
      id: "BLUE-CHAR",
      name: "Blue Candidate",
      color: ["Blue"],
    };
    cardDb.set(blueChar.id, blueChar);
    state = withPlayer(state, 0, {
      leader: { ...state.players[0].leader, cardId: leader.id },
      characters: padChars(fillers),
      hand: [
        ...state.players[0].hand,
        {
          instanceId: "hand-blue",
          cardId: blueChar.id,
          zone: "HAND",
          state: "ACTIVE",
          attachedDon: [],
          turnPlayed: null,
          controller: 0,
          owner: 0,
        },
      ],
    });

    const block = OP01_002_TRAFALGAR_LAW.effects[0];
    const offered = resolveEffect(state, block, state.players[0].leader.instanceId, 0, cardDb);
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const afterReturn = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["law-char-0"] },
      cardDb,
    );
    // Pre-fix: resolved with no further prompt (PLAY_CARD dead). Post-fix the
    // chain continues into the play half — either prompting for the hand
    // candidate or resolving it — with the character returned to hand.
    expect(
      afterReturn.state.players[0].characters.some((c) => c?.instanceId === "law-char-0"),
    ).toBe(false);
    const playHalfReached =
      afterReturn.pendingPrompt !== undefined ||
      afterReturn.state.players[0].characters.filter(Boolean).length === 5;
    expect(playHalfReached).toBe(true);
  });
});

describe("OPT-437: the gate holds on the selectable-cost resume path (ST23-003)", () => {
  it("false gate after a selected TRASH_FROM_HAND cost: cost stays paid, KO skipped", () => {
    const cardDb = createTestCardDb();
    const benn: CardData = {
      ...cardDb.get("CHAR-VANILLA")!,
      id: "ST23-003",
      name: "Benn.Beckman",
      effectSchema: ST23_003_BENN_BECKMAN,
    };
    cardDb.set(benn.id, benn);

    // Default test leader has no {Red-Haired Pirates} trait -> gate false.
    const state = createBattleReadyState(cardDb);
    const block = ST23_003_BENN_BECKMAN.effects[0];
    const handBefore = state.players[0].hand.length;
    const oppCharsBefore = state.players[1].characters.filter(Boolean).length;

    const offered = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const accepted = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );
    // TRASH_FROM_HAND is a selectable cost: the cost prompt opens even though
    // the post-colon gate will be false — the cost must be offered and paid
    // (Rules 8-3-1/8-3-3).
    expect(accepted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const trashId = state.players[0].hand[0].instanceId;
    const done = resumeFromStack(
      accepted.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [trashId] },
      cardDb,
    );
    expect(done.resolved).toBe(true);
    // Cost paid through finishCostsAndRunActions...
    expect(done.state.players[0].hand).toHaveLength(handBefore - 1);
    expect(done.state.players[0].trash.some((c) => c.instanceId === trashId)).toBe(false);
    // ...and the gated KO chain skipped: no opponent character left the field
    // and no KO target prompt opened.
    expect(done.pendingPrompt).toBeUndefined();
    expect(done.state.players[1].characters.filter(Boolean)).toHaveLength(oppCharsBefore);
    expect(done.state.effectStack).toHaveLength(0);
  });
});

describe("OPT-437: OP09-092 hand-gap comparison uses the real HAND_COUNT metric", () => {
  it("is true at a 3-card deficit and false at a 2-card deficit", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const cond = OP09_092_MARSHALL_D_TEACH.effects[0].post_cost_conditions!;

    state = withPlayer(state, 0, { hand: state.players[0].hand.slice(0, 5) });
    state = withPlayer(state, 1, {
      hand: padHand(state.players[1].hand, 8),
    });
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "x", controller: 0, cardDb })).toBe(true);

    state = withPlayer(state, 1, { hand: state.players[1].hand.slice(0, 7) });
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "x", controller: 0, cardDb })).toBe(false);
  });
});

function padHand(hand: CardInstance[], size: number): CardInstance[] {
  const out = [...hand];
  let i = 0;
  while (out.length < size) {
    out.push({
      instanceId: `pad-hand-${i++}`,
      cardId: CARDS.VANILLA.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    });
  }
  return out.slice(0, size);
}
