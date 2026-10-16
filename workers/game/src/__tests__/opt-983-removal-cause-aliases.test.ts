import { describe, expect, it } from "vitest";
import { rig, type Rig } from "./opt-960-rig.js";
import { isRemovalProhibited } from "../engine/prohibitions.js";
import { validateEffectSchema } from "../engine/schema-registry.js";

function attack(r: Rig, attacker: string, target: string) {
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker, targetInstanceId: target });
  r.act({ type: "PASS" }, 1);
}

function remains(r: Rig, id: string) {
  return r.state.players.some((p) => p.characters.some((c) => c?.instanceId === id));
}

describe("OPT-983 real-card removal cause aliases", () => {
  it("OP02-118 prevents battle KO but permits opposing effect KO", () => {
    const r = rig();
    const attacker = r.put("ST08-013", 0, "CHARACTER", { data: { power: 5000 } });
    r.act({ type: "ATTACH_DON", targetInstanceId: attacker.instanceId, count: 1 });
    const target = r.put("TEST-983-TARGET", 1, "CHARACTER", { state: "RESTED", data: { power: 1000 } });
    const counter = r.put("OP02-118", 1, "HAND", { data: { type: "Event", cost: 0, effectText: "[Counter] You may trash 1 card from your hand: Select up to 1 of your Characters. The selected Character cannot be K.O.'d during this battle." } });
    const discard = r.put("TEST-983-DISCARD", 1, "HAND");
    attack(r, attacker.instanceId, target.instanceId);
    r.act({ type: "USE_COUNTER_EVENT", cardInstanceId: counter.instanceId, counterTargetInstanceId: target.instanceId }, 1);
    if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
    r.select([discard.instanceId]);
    r.select([target.instanceId]);
    expect(r.state.prohibitions.some((p) => p.scope?.cause === "IN_BATTLE")).toBe(true);
    // Probe opposing effect resolution while the counter's protection is live.
    // Main-phase dispatch is a fixture: ordinary Main events cannot be played
    // in the Counter Step. Retain the granted protection without running battle cleanup.
    const protectedBattle = structuredClone(r.state);
    r.state.turn.phase = "MAIN";
    r.state.turn.battle = null;
    r.state.turn.battleSubPhase = null;
    const removal = r.put("ST04-015", 0, "HAND", { data: { type: "Event", cost: 6, effectText: "[Main] K.O. up to 1 of your opponent's Characters with a cost of 6 or less." } });
    r.act({ type: "PLAY_CARD", cardInstanceId: removal.instanceId });
    r.select([target.instanceId]);
    expect(remains(r, target.instanceId)).toBe(false);
    r.state = protectedBattle;
    r.act({ type: "PASS" }, 1);
    expect(remains(r, target.instanceId)).toBe(true);
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    r.accept();
    expect(remains(r, target.instanceId)).toBe(false);
    expect(remains(r, attacker.instanceId)).toBe(false);
  });

  it("OP09-033 prevents opposing effect KO but permits battle KO", () => {
    const r = rig();
    const target = r.put("TEST-983-ODYSSEY", 0, "CHARACTER", { state: "RESTED", data: { types: ["ODYSSEY"], power: 1000, cost: 1 } });
    r.put("TEST-983-RESTED", 0, "CHARACTER", { state: "RESTED" });
    const robin = r.put("OP09-033", 0, "HAND", { data: { cost: 3, types: ["ODYSSEY"] } });
    r.act({ type: "PLAY_CARD", cardInstanceId: robin.instanceId });
    expect(r.state.prohibitions.some((p) => p.scope?.cause === "BY_EFFECT")).toBe(true);
    // Start the opponent's main phase with the granted, persistent protection.
    r.state = { ...r.state, turn: { ...r.state.turn, activePlayerIndex: 1 } };
    const removal = r.put("ST04-015", 1, "HAND", { data: { type: "Event", cost: 6, effectText: "[Main] K.O. up to 1 of your opponent's Characters with a cost of 6 or less." } });
    r.act({ type: "PLAY_CARD", cardInstanceId: removal.instanceId }, 1);
    r.select([target.instanceId]);
    expect(remains(r, target.instanceId)).toBe(true);
    r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:0" });
    expect(r.state.pendingPrompt).toBeNull();
    const attacker = r.put("TEST-983-ATTACKER", 1, "CHARACTER", { data: { power: 5000 } });
    r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1);
    r.act({ type: "PASS" }, 0);
    r.act({ type: "PASS" }, 0);
    expect(remains(r, target.instanceId)).toBe(false);
  });
});

it.each(["ANY", "BATTLE", "EFFECT", "OPPONENT_EFFECT", "BY_OPPONENT_EFFECT", "BY_EFFECT", "IN_BATTLE", "TYPO"])("cause matrix: %s", (cause) => {
  const r = rig();
  const target = r.put("TEST-983-MATRIX", 0, "CHARACTER");
  r.state.prohibitions.push({ id: "matrix", sourceCardInstanceId: target.instanceId, sourceEffectBlockId: "matrix", prohibitionType: "CANNOT_BE_KO", scope: { cause: cause as never }, controller: 0, appliesTo: [target.instanceId], duration: { type: "THIS_TURN" }, usesRemaining: null });
  for (const context of ["BATTLE", "EFFECT", "COST"] as const) {
    for (const controller of [0, 1] as const) {
      const expected = cause === "ANY" || (context === "BATTLE" && ["BATTLE", "IN_BATTLE"].includes(cause)) || (context === "EFFECT" && (["EFFECT", "BY_EFFECT"].includes(cause) || (controller === 1 && ["OPPONENT_EFFECT", "BY_OPPONENT_EFFECT"].includes(cause))));
      expect(isRemovalProhibited(r.state, target.instanceId, { action: "KO", cause: context, causingController: controller }, r.db), `${context}/${controller}`).toBe(expected);
    }
  }
});

it.each(["CANNOT_BE_KO", "APPLY_PROHIBITION"])("rejects unknown removal causes in %s", (type) => {
  const prohibition = { type: "CANNOT_BE_KO", scope: { cause: "TYPO" } };
  const schema = { effects: [{ id: "bad", category: "permanent", ...(type === "CANNOT_BE_KO" ? { prohibitions: [prohibition] } : { actions: [{ type, params: { prohibition_type: prohibition.type, scope: prohibition.scope } }] }) }] };
  expect(validateEffectSchema(schema).some((e) => e.includes("scope.cause"))).toBe(true);
});
