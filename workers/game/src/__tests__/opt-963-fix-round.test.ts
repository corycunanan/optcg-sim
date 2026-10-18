import { describe, expect, it } from "vitest";
import corpus from "./fixtures/opt-963-5b-written-states.json";
import type { CardData, GameAction, GameState } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { buildV3SyntheticStates, goldenV2State, liftToVersion3, persistedV3 } from "./fixtures/opt-963-v3-states.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";

const services = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };
const coordinator = new SessionCoordinator();
function reply(state: GameState, db: Map<string, CardData>, action?: GameAction): GameState {
  const p = state.pendingPrompt!;
  const a = action ?? (p.options.promptType === "REVEAL_TRIGGER"
    ? { type: "REVEAL_TRIGGER", reveal: false, promptId: p.promptId }
    : p.options.promptType === "SELECT_TARGET"
      ? { type: "SELECT_TARGET", selectedInstanceIds: (p.options.validTargets ?? []).slice(0, p.options.countMin ?? 0), promptId: p.promptId }
      : { type: "PASS", promptId: p.promptId });
  const result = coordinator.executeAction(state, [], p.respondingPlayer, a, db);
  expect(["applied", "resume"]).toContain(result.kind);
  if (result.kind === "resume") {
    const resumed = resumePromptLifecycle(result.state, a, db, services);
    expect(resumed.responseRejected).toBe(false);
    return coordinator.surfaceRevealTrigger(resumed.state, db);
  }
  return coordinator.surfaceRevealTrigger(result.state, db);
}
function drain(state: GameState, db: Map<string, CardData>, parkedPhase = false): GameState {
  for (let i = 0; i < 20 && state.pendingPrompt && state.status === "IN_PROGRESS"; i++) state = reply(state, db);
  expect(state.pendingPrompt).toBeNull();
  if (parkedPhase) {
    expect(state.effectStack).toHaveLength(1);
    expect(state.effectStack[0].phaseBoundaryContinuation).toBeDefined();
  } else expect(state.effectStack).toHaveLength(0);
  return state;
}
function captured(name: keyof typeof corpus.cases) {
  const entry = corpus.cases[name];
  return { state: convertPersistedGameState(entry.state, "state"), db: new Map(Object.entries(entry.cardDb) as unknown as [string, CardData][]) };
}

describe("OPT-963 fix round executable rollback", () => {
  it.each(["corpus", "golden"])("C0 OPT-974 %s both-window fallback proves both v2 routing failures", source => {
    const { state, db } = source === "corpus" ? captured("both-trigger-windows") : {
      state: convertPersistedGameState(persistedV3(liftToVersion3(goldenV2State("both-trigger-windows"))), "state"),
      db: new Map(Object.entries(JSON.parse(loadGoldenFixture().cases["both-trigger-windows"].cardDbJson)) as [string, CardData][]),
    };
    const p = state.pendingPrompt!;
    expect(p.respondingPlayer).toBe(1);
    if (p.options.promptType !== "REVEAL_TRIGGER") throw new Error("wrong prompt");
    expect(p.options.cards[0].instanceId).toBe(state.turn.battle!.pendingTriggerLifeCard!.instanceId);
    for (const player of [0, 1] as const) {
      expect(coordinator.executeAction(state, [], player, { type: "REVEAL_TRIGGER", reveal: false, promptId: p.promptId }, db).kind).toBe("reject");
    }
    // Re-pointing cannot faithfully resolve the effect window first:
    // executeRevealTrigger consumes the battle card, stranding the nested corpus.
    const effectPlayer = state.turn.pendingTriggerFromEffect!.damagedPlayerIndex;
    const alternative = { ...state, pendingPrompt: { ...p, respondingPlayer: effectPlayer } };
    const result = coordinator.executeAction(alternative, [], effectPlayer, { type: "REVEAL_TRIGGER", reveal: false, promptId: p.promptId }, db);
    expect(result.kind).toBe("applied");
    expect(result.state.turn.pendingTriggerFromEffect).toBeDefined();
    expect(result.state.turn.battle?.pendingTriggerLifeCard).toBeUndefined();
    // The effect player's answer consumed the defender's card, not their own.
    expect(result.state.players[1].hand.length).toBeGreaterThan(state.players[1].hand.length);
    if (source === "corpus") expect(result.state.pendingPrompt).toBeNull();
    else {
      expect(result.state.pendingPrompt?.respondingPlayer).toBe(effectPlayer);
      const end = reply(result.state, db);
      expect(end.turn.battle).toBeNull();
      expect(end.turn.pendingTriggerFromEffect == null).toBe(true);
    }
  });

  it.each(buildV3SyntheticStates().map(e => e.name))("drives lowering fixture %s to a stable point or pins its base limitation", name => {
    const entry = buildV3SyntheticStates().find(e => e.name === name)!;
    let state = convertPersistedGameState(persistedV3(entry.state), "state");
    const db = new Map<string, CardData>();
    for (const golden of Object.values(loadGoldenFixture().cases)) {
      for (const [id, card] of Object.entries(JSON.parse(golden.cardDbJson))) db.set(id, card as CardData);
    }
    if (name === "both-trigger-windows") {
      for (const player of [0, 1] as const) expect(coordinator.executeAction(state, [], player, { type: "REVEAL_TRIGGER", reveal: false }, db).kind).toBe("reject");
      return;
    }
    if (!state.pendingPrompt) {
      state = resumePromptLifecycle(state, { type: "PASS" }, db, services).state;
      state = coordinator.surfaceRevealTrigger(state, db);
    }
    const end = drain(state, db, name === "end-phase-below-effect-window");
    expect(end.turn.pendingTriggerFromEffect == null).toBe(true);
    if (name === "stuck-damage-step" || name === "battle-ko-replacement-fields") {
      expect(end.turn.pendingBattleDamageContinuation?.stage).toBe("CHARACTER_KO_REPLACEMENT");
    } else expect(end.turn.pendingBattleDamageContinuation == null).toBe(true);
  });
});
