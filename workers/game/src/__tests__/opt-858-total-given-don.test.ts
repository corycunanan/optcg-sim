import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { executeKO, executeReturnToHand } from "../engine/effect-resolver/actions/removal.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import {
  findDonGivenModeViolations,
  findTotalGivenTextViolations,
} from "../engine/schema-don-given-lint.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Expected values come from printed card text (docs/cards/OP-12.md, OP-13.md)
// and the ST31-004 FAQ: "a total of N or more given DON!! cards" sums DON!!
// given to the Leader and all Characters, including the source Character.
// Every effect comes from the production authored registry.

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    expect(schema, `${id} must be authored`).not.toBeNull();
    db.set(id, { ...CARDS.VANILLA, id, name: schema!.card_name ?? id, effectSchema: schema, ...overrides });
  }
  function put(id: string, controller: 0 | 1): CardInstance {
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${controller}-${serial++}`,
      owner: controller,
      controller,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex as 0 | 1) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  /** Player 0 gives DON!! through the real ATTACH_DON action. */
  function give(targetInstanceId: string, count = 1) {
    act({ type: "ATTACH_DON", targetInstanceId, count }, 0);
  }
  /** Seeds already-given DON!! (e.g. the non-turn player's, which cannot ATTACH_DON now). */
  function seed(card: CardInstance, count: number) {
    const live = find(card.instanceId) ?? state.players[card.controller].leader;
    for (let i = 0; i < count; i++) {
      live.attachedDon.push({ instanceId: `seed-${card.instanceId}-${i}`, state: "ACTIVE", attachedTo: live.instanceId });
    }
  }
  function find(instanceId: string): CardInstance | undefined {
    for (const p of state.players) {
      const hit = p.characters.find((c) => c?.instanceId === instanceId);
      if (hit) return hit;
    }
    return undefined;
  }
  function remove(kind: "KO" | "BOUNCE", instanceId: string, owner: 0 | 1) {
    const source = state.players[1 - owner].leader.instanceId;
    const target = { type: "CHARACTER" as const, controller: "OPPONENT" as const, count: { exact: 1 } };
    const result =
      kind === "KO"
        ? executeKO(state, { type: "KO", target }, source, (1 - owner) as 0 | 1, db, new Map(), [instanceId], resolverExecutionServices)
        : executeReturnToHand(state, { type: "RETURN_TO_HAND", target }, source, (1 - owner) as 0 | 1, db, new Map(), [instanceId], resolverExecutionServices);
    expect(result.succeeded).toBe(true);
    state = result.state;
    expect(find(instanceId)).toBeUndefined();
  }
  function choice(action: GameAction) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected).toBe(false);
    state = result.state;
  }
  function power(instanceId: string) {
    const card = find(instanceId)!;
    return getEffectivePower(card, db.get(card.cardId)!, state, db);
  }
  return {
    db, data, put, act, give, seed, find, remove, choice, power,
    leader: (p: 0 | 1) => state.players[p].leader,
    get state() { return state; },
  };
}

type F = ReturnType<typeof fixture>;

// ─── OP12-015 Monkey.D.Luffy ─────────────────────────────────────────────────
// "If you have a total of 2 or more given DON!! cards, this Character gains +2000 power."
describe("OP12-015 total-given threshold (2)", () => {
  function scene() {
    const f = fixture();
    f.data("OP12-015", { cost: 4, power: 5000 });
    const luffy = f.put("OP12-015", 0);
    const other = f.put(CARDS.VANILLA.id, 0);
    return { f, luffy, other };
  }

  it("does not gain +2000 with 0 or 1 given DON!!", () => {
    const { f, luffy } = scene();
    expect(f.power(luffy.instanceId)).toBe(5000);
    f.give(f.leader(0).instanceId);
    expect(f.power(luffy.instanceId)).toBe(5000);
  });

  it("gains +2000 at exactly 2, split Leader + another Character", () => {
    const { f, luffy, other } = scene();
    f.give(f.leader(0).instanceId);
    f.give(other.instanceId);
    expect(f.power(luffy.instanceId)).toBe(7000);
  });

  it("counts DON!! given to itself: 1 on Luffy + 1 on Leader", () => {
    const { f, luffy } = scene();
    f.give(luffy.instanceId);
    expect(f.power(luffy.instanceId)).toBe(6000); // +1000 given DON!!, below threshold
    f.give(f.leader(0).instanceId);
    expect(f.power(luffy.instanceId)).toBe(8000); // +1000 given DON!! +2000 effect
  });

  it("stays +2000 (not stacking) above the threshold", () => {
    const { f, luffy, other } = scene();
    f.give(f.leader(0).instanceId);
    f.give(other.instanceId, 2);
    expect(f.power(luffy.instanceId)).toBe(7000);
  });

  it("ignores the opponent's given DON!!", () => {
    const { f, luffy } = scene();
    const theirs = f.put(CARDS.VANILLA.id, 1);
    f.seed(theirs, 2);
    f.seed(f.leader(1), 2);
    f.give(f.leader(0).instanceId);
    expect(f.power(luffy.instanceId)).toBe(5000);
  });

  it.each(["KO", "BOUNCE"] as const)("loses +2000 when a DON!!-holding Character leaves (%s)", (kind) => {
    const { f, luffy, other } = scene();
    f.give(f.leader(0).instanceId);
    f.give(other.instanceId);
    expect(f.power(luffy.instanceId)).toBe(7000);
    f.remove(kind, other.instanceId, 0);
    expect(f.power(luffy.instanceId)).toBe(5000);
  });
});

// ─── OP12-024 Gyukimaru ──────────────────────────────────────────────────────
// "[When Attacking] If you have a total of 3 or more given DON!! cards, rest up
// to 1 of your opponent's Characters with a base cost of 6 or less."
describe("OP12-024 total-given threshold (3) at [When Attacking]", () => {
  function scene() {
    const f = fixture();
    f.data("OP12-024", { cost: 5, power: 6000 });
    const gyukimaru = f.put("OP12-024", 0);
    const other = f.put(CARDS.VANILLA.id, 0);
    const victim = f.put(CARDS.VANILLA.id, 1); // base cost 3
    return { f, gyukimaru, other, victim };
  }
  function attack(f: F, attacker: CardInstance) {
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: f.leader(1).instanceId }, 0);
  }
  function expectRestPrompt(f: F, victim: CardInstance, fires: boolean) {
    const options = f.state.pendingPrompt?.options;
    if (!fires) {
      expect(options?.promptType === "SELECT_TARGET" && options.validTargets.includes(victim.instanceId)).toBe(false);
      expect(f.find(victim.instanceId)!.state).toBe("ACTIVE");
      return;
    }
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET") throw new Error("expected SELECT_TARGET");
    expect(options.validTargets).toEqual([victim.instanceId]);
    f.choice({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });
    expect(f.find(victim.instanceId)!.state).toBe("RESTED");
  }

  it("does not fire at 2 given DON!! (Leader + attacker)", () => {
    const { f, gyukimaru, victim } = scene();
    f.give(f.leader(0).instanceId);
    f.give(gyukimaru.instanceId);
    attack(f, gyukimaru);
    expectRestPrompt(f, victim, false);
  });

  it("fires at exactly 3, split Leader + attacker + another Character", () => {
    const { f, gyukimaru, other, victim } = scene();
    f.give(f.leader(0).instanceId);
    f.give(gyukimaru.instanceId);
    f.give(other.instanceId);
    attack(f, gyukimaru);
    expectRestPrompt(f, victim, true);
  });

  it("fires above the threshold (4)", () => {
    const { f, gyukimaru, other, victim } = scene();
    f.give(f.leader(0).instanceId, 2);
    f.give(other.instanceId, 2);
    attack(f, gyukimaru);
    expectRestPrompt(f, victim, true);
  });

  it("ignores the opponent's given DON!!", () => {
    const { f, gyukimaru, victim } = scene();
    f.seed(victim, 2);
    f.seed(f.leader(1), 2);
    f.give(f.leader(0).instanceId);
    f.give(gyukimaru.instanceId);
    attack(f, gyukimaru);
    expectRestPrompt(f, victim, false);
  });

  it("does not fire after a DON!!-holding Character leaves the field", () => {
    const { f, gyukimaru, other, victim } = scene();
    f.give(f.leader(0).instanceId);
    f.give(gyukimaru.instanceId);
    f.give(other.instanceId);
    f.remove("KO", other.instanceId, 0);
    attack(f, gyukimaru);
    expectRestPrompt(f, victim, false);
  });
});

// ─── OP13-112 Vegapunk ───────────────────────────────────────────────────────
// "If you have a total of 2 or more given DON!! cards, this Character gains [Blocker]."
// Vegapunk belongs to player 1, the defender; their DON!! was given on their own turn.
describe("OP13-112 total-given threshold (2) grants [Blocker]", () => {
  function scene() {
    const f = fixture();
    f.data("OP13-112", { cost: 4, power: 3000 });
    const vegapunk = f.put("OP13-112", 1);
    const other = f.put(CARDS.VANILLA.id, 1);
    const attacker = f.put(CARDS.VANILLA.id, 0);
    return { f, vegapunk, other, attacker };
  }
  function blocks(f: F, attacker: CardInstance, vegapunk: CardInstance): boolean {
    const card = f.find(vegapunk.instanceId)!;
    const granted = hasEffectiveKeyword(card, f.db.get(card.cardId)!, "BLOCKER", f.state, f.db);
    f.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: f.leader(1).instanceId }, 0);
    const result = runPipeline(f.state, { type: "DECLARE_BLOCKER", blockerInstanceId: vegapunk.instanceId }, f.db, 1);
    expect(result.valid).toBe(granted);
    return result.valid;
  }

  it("cannot block with 1 given DON!!", () => {
    const { f, vegapunk, attacker } = scene();
    f.seed(f.leader(1), 1);
    expect(blocks(f, attacker, vegapunk)).toBe(false);
  });

  it("blocks at exactly 2, split Leader + another Character", () => {
    const { f, vegapunk, other, attacker } = scene();
    f.seed(f.leader(1), 1);
    f.seed(other, 1);
    expect(blocks(f, attacker, vegapunk)).toBe(true);
  });

  it("counts DON!! given to itself: 1 on Vegapunk + 1 on Leader", () => {
    const { f, vegapunk, attacker } = scene();
    f.seed(vegapunk, 1);
    f.seed(f.leader(1), 1);
    expect(blocks(f, attacker, vegapunk)).toBe(true);
  });

  it("blocks above the threshold (3)", () => {
    const { f, vegapunk, other, attacker } = scene();
    f.seed(f.leader(1), 1);
    f.seed(other, 2);
    expect(blocks(f, attacker, vegapunk)).toBe(true);
  });

  it("ignores the opponent's given DON!!", () => {
    const { f, vegapunk, attacker } = scene();
    f.seed(f.leader(1), 1);
    f.give(f.leader(0).instanceId, 2);
    f.give(attacker.instanceId, 1);
    expect(blocks(f, attacker, vegapunk)).toBe(false);
  });

  it.each(["KO", "BOUNCE"] as const)("loses [Blocker] when a DON!!-holding Character leaves (%s)", (kind) => {
    const { f, vegapunk, other, attacker } = scene();
    f.seed(f.leader(1), 1);
    f.seed(other, 1);
    const live = f.find(vegapunk.instanceId)!;
    expect(hasEffectiveKeyword(live, f.db.get(live.cardId)!, "BLOCKER", f.state, f.db)).toBe(true);
    f.remove(kind, other.instanceId, 1);
    expect(blocks(f, attacker, vegapunk)).toBe(false);
  });
});

// ─── Schema lint ─────────────────────────────────────────────────────────────
describe("DON_GIVEN schema lint", () => {
  function withCondition(condition: Record<string, unknown>): EffectSchema {
    return {
      card_id: "TEST-858",
      card_name: "Test",
      card_type: "Character",
      effects: [{ id: "b", category: "permanent", conditions: condition, modifiers: [] }],
    } as unknown as EffectSchema;
  }

  it("rejects ANY_CARD_HAS_DON carrying a threshold, including nested", () => {
    const nested = withCondition({
      all_of: [{ type: "DON_GIVEN", controller: "SELF", mode: "ANY_CARD_HAS_DON", operator: ">=", value: 2 }],
    });
    expect(findDonGivenModeViolations(nested)).toEqual([
      expect.stringContaining("TEST-858 effects[0].conditions.all_of[0]: DON_GIVEN ANY_CARD_HAS_DON ignores operator/value"),
    ]);
  });

  it("accepts boolean ANY_CARD_HAS_DON and rejects TOTAL_GIVEN without a comparison", () => {
    expect(findDonGivenModeViolations(withCondition({ type: "DON_GIVEN", controller: "SELF", mode: "ANY_CARD_HAS_DON" }))).toEqual([]);
    expect(findDonGivenModeViolations(withCondition({ type: "DON_GIVEN", controller: "SELF", mode: "TOTAL_GIVEN", value: 2 }))).toEqual([
      expect.stringContaining("TOTAL_GIVEN requires both operator and value"),
    ]);
  });

  it("requires TOTAL_GIVEN >= N for canonical total-given text", () => {
    const text = "If you have a total of 2 or more given DON!! cards, this Character gains [Blocker].";
    const wrongMode = withCondition({ type: "DON_GIVEN", controller: "SELF", mode: "ANY_CARD_HAS_DON" });
    const wrongValue = withCondition({ type: "DON_GIVEN", controller: "SELF", mode: "TOTAL_GIVEN", operator: ">=", value: 3 });
    const right = withCondition({ type: "DON_GIVEN", controller: "SELF", mode: "TOTAL_GIVEN", operator: ">=", value: 2 });
    expect(findTotalGivenTextViolations("TEST-858", text, wrongMode)).toHaveLength(1);
    expect(findTotalGivenTextViolations("TEST-858", text, wrongValue)).toHaveLength(1);
    expect(findTotalGivenTextViolations("TEST-858", text, right)).toEqual([]);
    expect(findTotalGivenTextViolations("TEST-858", "If you have any DON!! cards given, draw 1 card.", wrongMode)).toEqual([]);
  });
});
