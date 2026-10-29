import { describe, expect, it, vi } from "vitest";
import { isCardNegated, getEffectivePower, getEffectiveCostForRead } from "../engine/modifiers.js";
import { canAttackThisTurn, hasEffectiveKeyword } from "../engine/keywords.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { CARDS } from "./helpers.js";
import { rig, synSchema } from "./opt-960-rig.js";
import type { TargetFilter, Modifier } from "../engine/effect-types.js";
import { executeNegateEffects } from "../engine/effect-resolver/actions/modifiers.js";

function fixture(modifier?: Modifier) {
  const r = rig();
  const roger = r.put("OP13-064", 0, "CHARACTER", { data: { types: ["Roger Pirates"] } });
  const ally = r.put("SYN-rush-ally", 0, "CHARACTER", {
    data: { ...CARDS.RUSH, id: "SYN-rush-ally", types: [], power: 4000, cost: 3 },
    ...(modifier ? { schema: synSchema("SYN-rush-ally", [{ id: "synthetic-stat", category: "permanent", modifiers: [modifier] }]) } : {}),
  });
  ally.turnPlayed = r.state.turn.number;
  const aura = r.state.activeEffects.find(effect => effect.sourceEffectBlockId === "OP13-064_negate_effects")!;
  return { r, roger, ally, aura };
}
const rushFilter: TargetFilter = { card_type: "CHARACTER", keywords: ["RUSH"] };

/** Synthetic future-schema cases; authored OP13-064 itself is unconditional.
 * User accepted apply-once for self-falsification on 2026-10-28, matching the
 * engine's OPT-242 cost-threshold precedent; not a claim of a specific FAQ.
 */
describe("OPT-1008 bounded conditional permanent negation", () => {
  it("applies once through the effective-keyword condition path at every public entry", () => {
    const { r, ally, aura } = fixture();
    aura.conditions = { type: "CARD_ON_FIELD", controller: "SELF", filter: rushFilter };
    const data = r.db.get(ally.cardId)!;
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    expect(hasEffectiveKeyword(ally, data, "RUSH", r.state, r.db)).toBe(false);
    expect(canAttackThisTurn(ally, data, r.state, r.db)).toBe(false);
    expect(runPipeline(r.state, { type: "DECLARE_ATTACK", attackerInstanceId: ally.instanceId,
      targetInstanceId: r.state.players[1].leader.instanceId }, r.db, 0).valid).toBe(false);
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
  });

  it("registers a synthetic conditional schema through the production permanent producer", () => {
    const r = rig();
    const schema = structuredClone(getEffectSchema("OP13-064")!);
    schema.effects[0].conditions = { type: "CARD_ON_FIELD", controller: "SELF", filter: rushFilter };
    r.put("OP13-064", 0, "CHARACTER", { schema, data: { types: ["Roger Pirates"] } });
    const ally = r.put("SYN-authored-path-ally", 0, "CHARACTER", { data: { ...CARDS.RUSH, id: "SYN-authored-path-ally", types: [] } });
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
  });

  it.each(["block", "modifier"])("bounds a synthetic %s WHILE_CONDITION gate", gate => {
    const { r, ally, aura } = fixture();
    const duration = { type: "WHILE_CONDITION" as const, condition: {
      type: "CARD_ON_FIELD" as const, controller: "SELF" as const, filter: rushFilter,
    } };
    if (gate === "block") aura.duration = duration;
    else aura.modifiers![0].duration = duration;
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
  });

  it("bounds the modifier's own effective-keyword target filter", () => {
    const { r, ally, aura } = fixture();
    aura.modifiers![0].target!.filter = { ...aura.modifiers![0].target!.filter, keywords: ["RUSH"] };
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    expect(hasEffectiveKeyword(ally, r.db.get(ally.cardId)!, "RUSH", r.state, r.db)).toBe(false);
  });

  it.each([
    ["power", { type: "MODIFY_POWER", params: { amount: 1000 } }, { power_min: 5000 }],
    ["cost", { type: "MODIFY_COST", params: { amount: 1 } }, { cost_min: 4 }],
    ["base-setting snapshot", { type: "SET_POWER", params: { value: 5000 } }, { base_power_min: 5000 }],
  ] as [string, Modifier, TargetFilter][])("bounds %s condition re-entry through source negation", (_, modifier, filter) => {
    const { r, ally, aura } = fixture(modifier);
    aura.conditions = { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "CHARACTER", ...filter } };
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    const data = r.db.get(ally.cardId)!;
    // SET_POWER separately excludes itself from eligibility. That existing
    // query-local rule sees no5000 witness and retains the setter; do not
    // redefine the numeric layer while bounding its negation callback.
    expect(getEffectivePower(ally, data, r.state, r.db)).toBe(modifier.type === "SET_POWER" ? 5000 : 4000);
    expect(getEffectiveCostForRead(ally, data, r.state, r.db)).toBe(3);
  });

  it("independent opponent witness activates and removal deactivates the condition", () => {
    const { r, ally, aura } = fixture();
    aura.conditions = { type: "CARD_ON_FIELD", controller: "OPPONENT", filter: rushFilter };
    expect(isCardNegated(ally, r.state, r.db)).toBe(false);
    const witness = r.put("SYN-independent", 1, "CHARACTER", { data: { ...CARDS.RUSH, id: "SYN-independent" } });
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    expect(isCardNegated(witness, r.state, r.db)).toBe(false);
    r.state.players[1].characters = r.state.players[1].characters.map(c => c === witness ? null : c);
    expect(isCardNegated(ally, r.state, r.db)).toBe(false);
  });

  it("preserves Roger Pirates and opponent exemptions, source flags and source removal", () => {
    const { r, roger, ally, aura } = fixture();
    aura.conditions = { type: "CARD_ON_FIELD", controller: "SELF", filter: rushFilter };
    const exempt = r.put("SYN-exempt", 0, "CHARACTER", { data: { ...CARDS.RUSH, id: "SYN-exempt", types: ["Roger Pirates"] } });
    const opponent = r.put("SYN-opponent", 1, "CHARACTER", { data: { ...CARDS.RUSH, id: "SYN-opponent" } });
    expect(isCardNegated(exempt, r.state, r.db)).toBe(false);
    expect(isCardNegated(opponent, r.state, r.db)).toBe(false);
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    r.state = executeNegateEffects(r.state, { type: "NEGATE_EFFECTS" }, opponent.instanceId, 1, r.db, new Map(), [roger.instanceId]).state;
    expect(isCardNegated(roger, r.state, r.db)).toBe(true);
    expect(isCardNegated(ally, r.state, r.db)).toBe(false);
    r.state.players[0].characters = r.state.players[0].characters.map(c => c === roger ? null : c);
    expect(isCardNegated(ally, r.state, r.db)).toBe(false);
  });

  it("cleans up after a nested query exception", () => {
    const { r, roger, ally, aura } = fixture();
    aura.conditions = { type: "CARD_ON_FIELD", controller: "SELF", filter: rushFilter };
    const originalGet = r.db.get.bind(r.db);
    const get = vi.spyOn(r.db, "get").mockImplementation(id => {
      // Root applicability reads the ally; the condition's field scan reaches Roger.
      if (id === roger.cardId) throw Error("synthetic query failure");
      return originalGet(id);
    });
    expect(() => isCardNegated(ally, r.state, r.db)).toThrow("synthetic query failure");
    get.mockRestore();
    // A leaked scope has an empty visiting set after unwinding, so merely
    // repeating the Boolean query would not detect that retained context.
    const effects = r.state.activeEffects;
    r.state.activeEffects = [];
    const NativeSet = Set;
    let allocations = 0;
    class CountingSet<T> extends NativeSet<T> {
      constructor(values?: readonly T[] | null) { super(values); allocations++; }
    }
    vi.stubGlobal("Set", CountingSet);
    try {
      expect(isCardNegated(ally, r.state, r.db)).toBe(false);
      expect(allocations).toBe(1); // a fresh root guard after the exception
    } finally { vi.unstubAllGlobals(); r.state.activeEffects = effects; }
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    aura.conditions = { type: "IS_MY_TURN", controller: "OPPONENT" };
    expect(isCardNegated(ally, r.state, r.db)).toBe(false);
  });

  it.each(["snapshot", "shallow snapshot", "database", "game"])("isolates a synchronously reentered independent %s", kind => {
    const { r, ally, aura } = fixture();
    aura.conditions = { type: "CARD_ON_FIELD", controller: "SELF", filter: rushFilter };
    const otherState = kind === "snapshot" ? structuredClone(r.state)
      : kind === "shallow snapshot" ? { ...r.state }
      : kind === "game" ? { ...r.state, id: "independent-game" } : r.state;
    const otherDb = kind === "database" ? new Map(r.db) : r.db;
    const originalGet = r.db.get.bind(r.db);
    let nested: boolean | undefined;
    let entered = false;
    const get = vi.spyOn(r.db, "get").mockImplementation(id => {
      if (!entered) {
        entered = true;
        nested = isCardNegated(ally, otherState, otherDb);
      }
      return originalGet(id);
    });
    try {
      expect(isCardNegated(ally, r.state, r.db)).toBe(true);
      expect(nested).toBe(true);
    } finally { get.mockRestore(); }
  });
});
