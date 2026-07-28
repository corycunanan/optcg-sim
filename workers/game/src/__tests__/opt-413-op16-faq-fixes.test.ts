/**
 * OPT-413 — OP16 official FAQ cross-reference fixes.
 *
 * Covers the six actionable findings:
 *  1. CARD_ON_FIELD supports controller EITHER (OP16-081 Otama).
 *  3. FIELD_PURITY is false on an empty field (OP16-022 Leader Luffy).
 *  4. REUSE_EFFECT honors the reused block's turn_restriction (OP16-103).
 *  5. [Trigger] is not offered when its cost is unpayable (OP16-107).
 *  6. ATTACKED performed-actions record attacker + final target at battle
 *     end (OP12-020 Zoro / OP16-080 Teach redirect).
 *  7. FORCE_OPPONENT_DON_RETURN lets the DON owner pick the active/rested
 *     split (OP16-074 Magellan).
 * (Finding 2, OP16-058, is deferred per the ticket.)
 */

import { describe, it, expect } from "vitest";
import type { CardData, GameState, PlayerState, PerformedAction } from "../types.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { evaluateCondition } from "../engine/conditions.js";
import { runPipeline } from "../engine/pipeline.js";
import { canOfferTrigger } from "../engine/battle.js";
import { resolveEffect, resumeEffectChain } from "../engine/effect-resolver/index.js";
import { executeForceOpponentDonReturn } from "../engine/effect-resolver/actions/don.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[idx] = { ...newPlayers[idx], ...patch };
  return { ...state, players: newPlayers };
}

const ctx0 = (cardDb: Map<string, CardData>) => ({
  sourceCardInstanceId: "char-0-v1",
  controller: 0 as const,
  cardDb,
});

// ─── 1. CARD_ON_FIELD controller EITHER ──────────────────────────────────────

describe("OPT-413: CARD_ON_FIELD EITHER (OP16-081 Otama)", () => {
  function stateWithBigOpponentChar(cardDb: Map<string, CardData>): GameState {
    const big: CardData = { ...CARDS.VANILLA, id: "CHAR-BIG", name: "Big Guy", cost: 8 };
    cardDb.set(big.id, big);
    const state = createBattleReadyState(cardDb);
    const chars = [...state.players[1].characters];
    chars[0] = { ...chars[0]!, cardId: big.id };
    return withPlayer(state, 1, { characters: chars });
  }

  it("EITHER matches a cost-8 Character on the opponent's field", () => {
    const cardDb = createTestCardDb();
    const state = stateWithBigOpponentChar(cardDb);
    expect(evaluateCondition(state, {
      type: "CARD_ON_FIELD", controller: "EITHER",
      filter: { card_type: "CHARACTER", cost_min: 8 },
    } as never, ctx0(cardDb))).toBe(true);
  });

  it("SELF still ignores the opponent's field", () => {
    const cardDb = createTestCardDb();
    const state = stateWithBigOpponentChar(cardDb);
    expect(evaluateCondition(state, {
      type: "CARD_ON_FIELD", controller: "SELF",
      filter: { card_type: "CHARACTER", cost_min: 8 },
    } as never, ctx0(cardDb))).toBe(false);
  });
});

// ─── 3. FIELD_PURITY on empty field ──────────────────────────────────────────

describe("OPT-413: FIELD_PURITY requires at least one Character (OP16-022)", () => {
  it("is false with zero Characters", () => {
    const cardDb = createTestCardDb();
    const state = withPlayer(createBattleReadyState(cardDb), 0, {
      characters: [null, null, null, null, null],
    });
    expect(evaluateCondition(state, {
      type: "FIELD_PURITY", controller: "SELF", filter: { card_type: "CHARACTER" },
    } as never, ctx0(cardDb))).toBe(false);
  });

  it("stays true when every Character matches", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    expect(evaluateCondition(state, {
      type: "FIELD_PURITY", controller: "SELF", filter: { card_type: "CHARACTER" },
    } as never, ctx0(cardDb))).toBe(true);
  });
});

// ─── 4. REUSE_EFFECT turn restriction ────────────────────────────────────────

describe("OPT-413: REUSE_EFFECT honors turn_restriction (OP16-103 Van Augur)", () => {
  function setupReuse(cardDb: Map<string, CardData>): GameState {
    const schema: EffectSchema = {
      card_id: "CHAR-REUSE",
      card_name: "Reuser",
      card_type: "Character",
      effects: [
        {
          id: "on_ko_draw",
          category: "auto",
          trigger: { keyword: "ON_KO", turn_restriction: "OPPONENT_TURN" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    } as EffectSchema;
    const reuser: CardData = { ...CARDS.VANILLA, id: "CHAR-REUSE", name: "Reuser", effectSchema: schema as never };
    cardDb.set(reuser.id, reuser);
    const state = createBattleReadyState(cardDb);
    const chars = [...state.players[0].characters];
    chars[0] = { ...chars[0]!, cardId: reuser.id };
    return withPlayer(state, 0, { characters: chars });
  }

  const reuseBlock: EffectBlock = {
    id: "trigger_reuse",
    category: "auto",
    trigger: { keyword: "TRIGGER" },
    actions: [{ type: "REUSE_EFFECT", params: { target_effect: "ON_KO" } }],
  } as EffectBlock;

  it("does nothing when the restriction fails (own turn, OPPONENT_TURN-only block)", () => {
    const cardDb = createTestCardDb();
    const state = setupReuse(cardDb); // activePlayerIndex = 0 = controller
    const handBefore = state.players[0].hand.length;
    const result = resolveEffect(state, reuseBlock, "char-0-v1", 0, cardDb);
    expect(result.state.players[0].hand.length).toBe(handBefore);
  });

  it("resolves when the restriction passes (opponent's turn)", () => {
    const cardDb = createTestCardDb();
    let state = setupReuse(cardDb);
    state = { ...state, turn: { ...state.turn, activePlayerIndex: 1 } };
    const handBefore = state.players[0].hand.length;
    const result = resolveEffect(state, reuseBlock, "char-0-v1", 0, cardDb);
    expect(result.state.players[0].hand.length).toBe(handBefore + 1);
  });
});

// ─── 5. Trigger cost-feasibility gate ────────────────────────────────────────

describe("OPT-413: costed [Trigger] not offered when unpayable (OP16-107 Burgess)", () => {
  function burgessLike(cardDb: Map<string, CardData>): CardData {
    const schema: EffectSchema = {
      card_id: "CHAR-BURGESS",
      card_name: "Burgess Like",
      card_type: "Character",
      effects: [
        {
          id: "trigger_trash_play_self",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
          actions: [{ type: "PLAY_SELF" }],
          flags: { optional: true },
        },
      ],
    } as EffectSchema;
    const card: CardData = {
      ...CARDS.VANILLA,
      id: "CHAR-BURGESS",
      name: "Burgess Like",
      keywords: { ...CARDS.VANILLA.keywords, trigger: true },
      effectSchema: schema as never,
    };
    cardDb.set(card.id, card);
    return card;
  }

  it("gates the offer on cost payability", () => {
    const cardDb = createTestCardDb();
    const card = burgessLike(cardDb);
    const state = createBattleReadyState(cardDb);

    // Hand has cards → payable → offered.
    expect(canOfferTrigger(state, card.id, cardDb, 0)).toBe(true);
    // Empty hand → unpayable → NOT offered (card goes to hand as normal damage).
    const emptyHand = withPlayer(state, 0, { hand: [] });
    expect(canOfferTrigger(emptyHand, card.id, cardDb, 0)).toBe(false);
  });

  it("offers authored costless triggers and fails closed for schema-less trigger cards", () => {
    const cardDb = createTestCardDb();
    const state = withPlayer(createBattleReadyState(cardDb), 0, { hand: [] });
    const costless = burgessLike(cardDb);
    costless.effectSchema!.effects[0].costs = undefined;
    expect(canOfferTrigger(state, costless.id, cardDb, 0)).toBe(true);
    const schemaLessTrigger = {
      ...CARDS.TRIGGER,
      id: "SCHEMA-LESS-TRIGGER",
      effectSchema: null,
    };
    cardDb.set(schemaLessTrigger.id, schemaLessTrigger);
    // A Trigger-keyword card with no authored block fails closed. Mitigation chooses
    // the normal add-to-hand outcome instead of offering a destructive no-op.
    expect(canOfferTrigger(state, schemaLessTrigger.id, cardDb, 0)).toBe(false);
    // Non-trigger cards are never offered.
    expect(canOfferTrigger(state, CARDS.VANILLA.id, cardDb, 0)).toBe(false);
  });
});

// ─── 6. ATTACKED recorded at battle end with final target ───────────────────

function runFullAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): GameState {
  let result = runPipeline(
    state,
    { type: "DECLARE_ATTACK", attackerInstanceId, targetInstanceId },
    cardDb,
    state.turn.activePlayerIndex,
  );
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex); // block step
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex); // counter step
  expect(result.valid).toBe(true);
  return result.state;
}

describe("OPT-413: ATTACKED performed-action fidelity (OP12-020 / OP16-080)", () => {
  it("records attacker controller and LEADER target at battle end", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;

    const after = runFullAttack(state, attacker.instanceId, state.players[1].leader.instanceId, cardDb);

    const entry = after.turn.actionsPerformedThisTurn.find(
      (a: PerformedAction) => a.actionType === "ATTACKED",
    );
    expect(entry).toBeTruthy();
    expect(entry!.controller).toBe(0);
    expect(entry!.attackerInstanceId).toBe(attacker.instanceId);
    expect(entry!.targetType).toBe("LEADER");

    // OP12-020 Zoro shape: "battled a CHARACTER this turn" must be false
    // for a Leader battle...
    expect(evaluateCondition(after, {
      type: "ACTION_PERFORMED_THIS_TURN", controller: "SELF", action: "ATTACKED",
      filter: { card_type: "CHARACTER" },
    } as never, ctx0(cardDb))).toBe(false);
    // ...while the unfiltered "attacked this turn" is true.
    expect(evaluateCondition(after, {
      type: "ACTION_PERFORMED_THIS_TURN", controller: "SELF", action: "ATTACKED",
    } as never, ctx0(cardDb))).toBe(true);
    // And the opponent did not attack.
    expect(evaluateCondition(after, {
      type: "ACTION_PERFORMED_THIS_TURN", controller: "OPPONENT", action: "ATTACKED",
    } as never, ctx0(cardDb))).toBe(false);
  });

  it("records CHARACTER when a rested Character was battled", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    // Rest the opponent's blocker-less vanilla so it is attackable.
    const oppChars = [...state.players[1].characters];
    oppChars[0] = { ...oppChars[0]!, state: "RESTED" as const };
    state = withPlayer(state, 1, { characters: oppChars });
    const attacker = state.players[0].characters[0]!;

    const after = runFullAttack(state, attacker.instanceId, oppChars[0]!.instanceId, cardDb);

    const entry = after.turn.actionsPerformedThisTurn.find(
      (a: PerformedAction) => a.actionType === "ATTACKED",
    );
    expect(entry?.targetType).toBe("CHARACTER");
    expect(evaluateCondition(after, {
      type: "ACTION_PERFORMED_THIS_TURN", controller: "SELF", action: "ATTACKED",
      filter: { card_type: "CHARACTER" },
    } as never, ctx0(cardDb))).toBe(true);
  });

  it("does not record an ATTACKED entry for an aborted battle (Codex review)", async () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    // Rest an opponent character so it is attackable.
    const oppChars = [...state.players[1].characters];
    oppChars[0] = { ...oppChars[0]!, state: "RESTED" as const };
    state = withPlayer(state, 1, { characters: oppChars });
    const attacker = state.players[0].characters[0]!;
    const target = oppChars[0]!;

    // Declare + pass block → COUNTER_STEP, then remove the target mid-battle.
    let result = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId },
      cardDb,
      state.turn.activePlayerIndex,
    );
    expect(result.valid).toBe(true);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, result.state.turn.activePlayerIndex);
    expect(result.valid).toBe(true);

    const { moveCard } = await import("../engine/state.js");
    let midBattle = moveCard(result.state, target.instanceId, "TRASH");
    const afterPass = runPipeline(midBattle, { type: "PASS" }, cardDb, midBattle.turn.activePlayerIndex);
    expect(afterPass.valid).toBe(true);
    expect(afterPass.state.turn.battle).toBeNull();

    // Same ruling that gates CHARACTER_BATTLES: an aborted battle is not
    // "battled a Character this turn"...
    const entry = afterPass.state.turn.actionsPerformedThisTurn.find(
      (a: PerformedAction) => a.actionType === "ATTACKED",
    );
    expect(entry).toBeUndefined();
    expect(evaluateCondition(afterPass.state, {
      type: "ACTION_PERFORMED_THIS_TURN", controller: "SELF", action: "ATTACKED",
      filter: { card_type: "CHARACTER" },
    } as never, ctx0(cardDb))).toBe(false);
    // ...but the unscoped "attacked this turn" still holds via the
    // declaration-time DECLARE_ATTACK entry.
    expect(evaluateCondition(afterPass.state, {
      type: "ACTION_PERFORMED_THIS_TURN", action: "ATTACKED",
    } as never, ctx0(cardDb))).toBe(true);
  });

  it("legacy declaration-time entries only satisfy unscoped conditions", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    state = {
      ...state,
      turn: {
        ...state.turn,
        actionsPerformedThisTurn: [{ actionType: "DECLARE_ATTACK", timestamp: 1 }],
      },
    };
    expect(evaluateCondition(state, {
      type: "ACTION_PERFORMED_THIS_TURN", action: "ATTACKED",
    } as never, ctx0(cardDb))).toBe(true);
    expect(evaluateCondition(state, {
      type: "ACTION_PERFORMED_THIS_TURN", controller: "SELF", action: "ATTACKED",
      filter: { card_type: "CHARACTER" },
    } as never, ctx0(cardDb))).toBe(false);
  });
});

// ─── 7. FORCE_OPPONENT_DON_RETURN owner choice ───────────────────────────────

describe("OPT-413: FORCE_OPPONENT_DON_RETURN owner picks the split (OP16-074 Magellan)", () => {
  const donAction = (amount: number) =>
    ({ type: "FORCE_OPPONENT_DON_RETURN", params: { amount } }) as never;

  function withOppDon(state: GameState, active: number, rested: number): GameState {
    const don = [
      ...Array.from({ length: active }, (_, i) => ({ instanceId: `don-a-${i}`, state: "ACTIVE" as const, attachedTo: null })),
      ...Array.from({ length: rested }, (_, i) => ({ instanceId: `don-r-${i}`, state: "RESTED" as const, attachedTo: null })),
    ];
    return withPlayer(state, 1, { donCostArea: don, donDeck: [] });
  }

  it("prompts the DON owner when the active/rested split is a real choice", () => {
    const cardDb = createTestCardDb();
    const state = withOppDon(createBattleReadyState(cardDb), 2, 2);

    const result = executeForceOpponentDonReturn(state, donAction(1), "char-0-v1", 0, cardDb, new Map());
    expect(result.pendingPrompt).toBeTruthy();
    const prompt = result.pendingPrompt!;
    expect(prompt.respondingPlayer).toBe(1); // the DON owner, not the effect controller
    expect(prompt.options.promptType).toBe("PLAYER_CHOICE");
    if (prompt.options.promptType === "PLAYER_CHOICE") {
      expect(prompt.options.choices.map((c) => c.id)).toEqual(["don-return:0:1", "don-return:1:1"]);
    }
    // No DON moved yet.
    expect(result.state.players[1].donCostArea).toHaveLength(4);
  });

  it("auto-resolves when there is no real choice (all one state)", () => {
    const cardDb = createTestCardDb();
    const state = withOppDon(createBattleReadyState(cardDb), 3, 0);

    const result = executeForceOpponentDonReturn(state, donAction(2), "char-0-v1", 0, cardDb, new Map());
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.succeeded).toBe(true);
    expect(result.state.players[1].donCostArea).toHaveLength(1);
    expect(result.state.players[1].donDeck).toHaveLength(2);
  });

  it("auto-resolves when the whole cost area returns", () => {
    const cardDb = createTestCardDb();
    const state = withOppDon(createBattleReadyState(cardDb), 2, 2);

    const result = executeForceOpponentDonReturn(state, donAction(4), "char-0-v1", 0, cardDb, new Map());
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[1].donCostArea).toHaveLength(0);
    expect(result.state.players[1].donDeck).toHaveLength(4);
  });

  it("applies the chosen split on resume and rejects unoffered choices", () => {
    const cardDb = createTestCardDb();
    const state = withOppDon(createBattleReadyState(cardDb), 2, 2);

    const result = executeForceOpponentDonReturn(state, donAction(2), "char-0-v1", 0, cardDb, new Map());
    expect(result.pendingPrompt).toBeTruthy();
    const resumeCtx = result.pendingPrompt!.resumeContext as never;

    // The owner chooses: return 1 active + 1 rested.
    const resumed = resumeEffectChain(
      result.state,
      resumeCtx,
      { type: "PLAYER_CHOICE", choiceId: "don-return:1:2" },
      cardDb,
    );
    const opp = resumed.state.players[1];
    expect(opp.donCostArea).toHaveLength(2);
    expect(opp.donDeck).toHaveLength(2);
    expect(opp.donCostArea.filter((d) => d.state === "ACTIVE")).toHaveLength(1);
    expect(opp.donCostArea.filter((d) => d.state === "RESTED")).toHaveLength(1);

    // A choice id the prompt never offered is rejected outright.
    const stale = resumeEffectChain(
      result.state,
      resumeCtx,
      { type: "PLAYER_CHOICE", choiceId: "don-return:9:9" },
      cardDb,
    );
    expect(stale.resolved).toBe(false);
    expect(stale.state.players[1].donCostArea).toHaveLength(4);
  });
});
