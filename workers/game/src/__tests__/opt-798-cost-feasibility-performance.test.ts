/**
 * OPT-798 review round 1 — the upfront whole-sequence feasibility check
 * (cost/orchestrator.ts → isCostSequencePayable) must never enumerate a
 * combinatorial payment space for authored costs.
 *
 * Before the fix, every combination of a selection cost's targets was
 * materialized as a hypothetical GameState, even for a terminal cost: OP04-090
 * (return 7 of N trash cards) with 26 trash took ~3.7 s and OP05-080 (return
 * 20 of N) with 28 trash exhausted the Node heap. A terminal combination cost
 * is now a count check, and non-terminal enumeration is lazy.
 */
import { describe, expect, it } from "vitest";
import type { CardInstance, GameAction, GameState } from "../types.js";
import type { Cost } from "../engine/effect-types.js";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { costNeedsPlayerSelection } from "../engine/effect-resolver/cost/payability.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const BUDGET_MS = 250;
const TRASH_SIZE = 30;

function fixture(sourceId: string) {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  db.set(sourceId, { ...CARDS.VANILLA, id: sourceId, name: sourceId, cost: 5, power: 6000, effectSchema: getEffectSchema(sourceId)! });
  const source: CardInstance = {
    instanceId: `${sourceId}-src`, cardId: sourceId, zone: "CHARACTER", state: "ACTIVE",
    attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
  };
  state.players[0].characters[0] = source;
  state = registerCardEnteredField(state, source, db.get(sourceId)!);
  state.players[0].trash = Array.from({ length: TRASH_SIZE }, (_, i) => ({
    instanceId: `trash-${i}`, cardId: CARDS.VANILLA.id, zone: "TRASH" as const, state: "ACTIVE" as const,
    attachedDon: [], turnPlayed: null, controller: 0 as const, owner: 0 as const,
  }));
  const act = (action: GameAction, player: 0 | 1 = 0) => {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  };
  return { source, act, get state() { return state; } };
}

function timed(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("OPT-798 upfront cost feasibility stays bounded", () => {
  it(`OP04-090 (return 7 of ${TRASH_SIZE} trash) prompts the selection within ${BUDGET_MS} ms`, () => {
    const f = fixture("OP04-090");
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: f.source.instanceId, effectId: "activate_untap_from_trash" });
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const elapsed = timed(() => f.act({ type: "PLAYER_CHOICE", choiceId: "accept" }));
    expect(f.state.pendingPrompt?.options).toMatchObject({ promptType: "SELECT_TARGET", countMin: 7, countMax: 7 });
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it(`OP05-080 (return 20 of ${TRASH_SIZE} trash) prompts the selection within ${BUDGET_MS} ms`, () => {
    const f = fixture("OP05-080");
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.source.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const elapsed = timed(() => f.act({ type: "PLAYER_CHOICE", choiceId: "accept" }));
    expect(f.state.pendingPrompt?.options).toMatchObject({ promptType: "SELECT_TARGET", countMin: 20, countMax: 20 });
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("a payable non-terminal 20-of-30 selection short-circuits on the first working payment", () => {
    // C(30,20) ≈ 30M hypothetical payments: only a lazy search survives this.
    const f = fixture("OP04-090");
    const costs: Cost[] = [
      { type: "PLACE_FROM_TRASH_TO_DECK", amount: 20 },
      { type: "REST_SELF" },
    ];
    const db = createTestCardDb();
    const elapsed = timed(() => {
      expect(isCostSequencePayable(f.state, costs, 0, db, f.source.instanceId)).toBe(true);
    });
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("an unpayable non-terminal selection still stops once no payment can work", () => {
    // 30 trash cards, 3-of-30 first cost, impossible second cost: the lazy
    // search must visit every combination (4060) — bounded and fast.
    const f = fixture("OP04-090");
    const costs: Cost[] = [
      { type: "PLACE_FROM_TRASH_TO_DECK", amount: 3 },
      { type: "TRASH_FROM_HAND", amount: 99 },
    ];
    const db = createTestCardDb();
    const elapsed = timed(() => {
      expect(isCostSequencePayable(f.state, costs, 0, db, f.source.instanceId)).toBe(false);
    });
    expect(elapsed).toBeLessThan(2000);
  });

  /**
   * Registry guard: the only costs the feasibility search enumerates are
   * non-terminal selection costs in a printed cost sequence. Bound their
   * worst-case combination product with generous pool sizes so a future
   * authored block (e.g. "return 20 from trash" followed by another cost)
   * fails here instead of stalling a game session.
   */
  it("every authored multi-cost sequence has a small worst-case enumeration", () => {
    const POOL = { hand: 20, trash: 60, life: 5, field: 12 };
    const pool = (cost: Cost): number => {
      switch (cost.type) {
        case "TRASH_FROM_HAND":
        case "PLACE_HAND_TO_DECK":
        case "REVEAL_FROM_HAND":
        case "PLAY_NAMED_CARD_FROM_HAND":
        case "PLACE_SELF_AND_HAND_TO_DECK":
        case "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE":
          return POOL.hand;
        case "PLACE_FROM_TRASH_TO_DECK":
        case "PLACE_SELF_AND_TRASH_TO_DECK":
          return POOL.trash;
        case "LIFE_TO_HAND":
        case "TRASH_FROM_LIFE":
          return 2;
        default:
          return POOL.field;
      }
    };
    const choose = (n: number, k: number): number => {
      let r = 1;
      for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
      return Math.round(r);
    };
    const expand = (costs: Cost[]): Cost[][] => {
      if (costs.length === 0) return [[]];
      const [head, ...rest] = costs;
      const tails = expand(rest);
      const heads: Cost[][] = head.type === "CHOICE"
        ? head.options
        : head.type === "CHOOSE_ONE_COST"
          ? (head.options ?? []).map((option) => [option])
          : [[head]];
      return heads.flatMap((h) => tails.map((t) => [...h, ...t]));
    };
    let worst = { count: 1, where: "none" };
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      for (const block of schema.effects) {
        for (const sequence of expand(block.costs ?? [])) {
          let count = 1;
          for (const cost of sequence.slice(0, -1)) {
            if ((cost.type === "REST_DON" || cost.type === "DON_REST") && cost.amount === "ANY_NUMBER") {
              count *= 10;
            } else if (costNeedsPlayerSelection(cost)) {
              const amount = cost.type !== "CHOICE" && typeof cost.amount === "number" ? cost.amount : 1;
              count *= cost.type === "REST_CARDS" && cost.amount === "ANY_NUMBER"
                ? 2 ** POOL.field
                : choose(pool(cost), amount);
            }
          }
          if (count > worst.count) worst = { count, where: `${cardId} ${block.id}` };
        }
      }
    }
    // At review time the maximum is OP17-038 (rest 3 cards, then rest DON!!)
    // → C(12,3) = 220; next OP09-060 (place 2 from hand, then rest) → C(20,2) = 190.
    expect(worst.count, worst.where).toBeLessThanOrEqual(1000);
  });
});
