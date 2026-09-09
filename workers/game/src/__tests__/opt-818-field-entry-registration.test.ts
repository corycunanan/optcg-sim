import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { OP13_079_IMU, OP13_080_ST_ETHANBARON_V_NUSJURO, OP13_082_FIVE_ELDERS } from "../engine/schemas/op13.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const imu: CardData = { ...CARDS.LEADER, id: "OP13-079", name: "Imu", effectSchema: OP13_079_IMU };
const elders: CardData = { ...CARDS.VANILLA, id: "OP13-082", name: "Five Elders", power: 12000, types: ["Five Elders"], effectSchema: OP13_082_FIVE_ELDERS };
const nusjuro: CardData = { ...CARDS.VANILLA, id: "OP13-080", name: "St. Ethanbaron V. Nusjuro", power: 5000, types: ["Five Elders"], effectSchema: OP13_080_ST_ETHANBARON_V_NUSJURO };
function card(cardId: string, instanceId: string, zone: CardInstance["zone"] = "CHARACTER"): CardInstance {
  return { cardId, instanceId, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 1, owner: 0, controller: 0 };
}
function resume(state: GameState, action: GameAction, db: Map<string, CardData>) {
  const result = resumePromptLifecycle(state, action, db, { drainPregame: s => s, advanceStartOfTurn: s => s });
  expect(result.responseRejected).toBe(false);
  return result.state;
}
function playNusjuro() {
  const db = createTestCardDb();
  for (const data of [imu, elders, nusjuro]) db.set(data.id, data);
  let state = createBattleReadyState(db);
  state.players[0] = { ...state.players[0], leader: { ...state.players[0].leader, cardId: imu.id }, characters: padChars([card(elders.id, "elders")]), trash: [card(nusjuro.id, "nusjuro-trash", "TRASH"), ...Array.from({ length: 9 }, (_, i) => card(CARDS.VANILLA.id, `trash-${i}`, "TRASH"))] };
  state.players[1] = { ...state.players[1], characters: padChars([{ ...card(CARDS.VANILLA.id, "opponent"), owner: 1, controller: 1 }]) };
  const activation = runPipeline(state, { type: "ACTIVATE_EFFECT", cardInstanceId: "elders", effectId: "OP13-082_activate_main" }, db, 0);
  expect(activation.valid).toBe(true);
  state = activation.state;
  for (let i = 0; state.pendingPrompt && i < 10; i++) {
    const options = state.pendingPrompt.options;
    if (options.promptType === "OPTIONAL_EFFECT") state = resume(state, { type: "PLAYER_CHOICE", choiceId: "accept" }, db);
    else if (options.promptType === "SELECT_TARGET") state = resume(state, { type: "SELECT_TARGET", selectedInstanceIds: options.validTargets.slice(0, options.countMax) }, db);
    else throw new Error(`Unexpected prompt ${options.promptType}`);
  }
  expect(state.pendingPrompt).toBeNull();
  const played = state.players[0].characters.find(c => c?.cardId === nusjuro.id)!;
  expect(played).toBeDefined();
  expect(played.instanceId).not.toBe("nusjuro-trash");
  return { state, db, played };
}

// OP-13.md OP13-080/082; comprehensive rules v1.2.0 §§3-1-6, 8-1-3-1:
// one attack event activates Nusjuro's one When Attacking clause exactly once.
describe("OPT-818 field-entry registration", () => {
  it("registers effect-played Nusjuro once through durable prompt continuation", () => {
    const { state, played } = playNusjuro();
    expect(state.triggerRegistry.filter(t => t.sourceCardInstanceId === played.instanceId)).toHaveLength(1);
    expect(state.activeEffects.filter(e => e.sourceCardInstanceId === played.instanceId)).toHaveLength(1);
  });
  it("offers the power target directly and applies minus 2000 once on attack", () => {
    const scenario = playNusjuro();
    scenario.played.turnPlayed = 1;
    const attack = runPipeline(scenario.state, { type: "DECLARE_ATTACK", attackerInstanceId: scenario.played.instanceId, targetInstanceId: scenario.state.players[1].leader.instanceId }, scenario.db, 0);
    expect(attack.valid).toBe(true);
    expect(attack.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const state = resume(attack.state, { type: "SELECT_TARGET", selectedInstanceIds: ["opponent"] }, scenario.db);
    const effects = state.activeEffects.filter(e => e.sourceCardInstanceId === scenario.played.instanceId && e.modifiers.some(m => m.type === "MODIFY_POWER"));
    expect(effects).toHaveLength(1);
    expect(effects[0].modifiers).toEqual([expect.objectContaining({ type: "MODIFY_POWER", params: expect.objectContaining({ amount: -2000 }) })]);
    expect(effects[0].appliesTo).toEqual(["opponent"]);
  });
});
