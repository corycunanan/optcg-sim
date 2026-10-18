/**
 * OPT-963 test helpers for the typed damage frames.
 *
 * A Life [Trigger] window is a BATTLE_DAMAGE or EFFECT_DAMAGE frame on the
 * effect stack that owns its REVEAL_TRIGGER prompt; the reply is a prompt
 * response routed through the prompt lifecycle, not a pipeline action.
 * These helpers give tests that used to drive `runPipeline` with
 * `REVEAL_TRIGGER` (and read `battle.pendingTriggerLifeCard`,
 * `turn.pendingTriggerFromEffect`, `turn.pendingBattleDamageContinuation`)
 * the same observations against the frames.
 */

import type {
  BattleDamageContinuation,
  CardData,
  EffectDamageContinuation,
  EffectStackFrame,
  GameAction,
  GameState,
  LifeCard,
  PendingPromptState,
  ReplacementContinuation,
} from "../types.js";
import { continuationFrame, revealTriggerPromptFor, surfaceDamageFramePrompt, triggerWindowOf } from "../engine/damage-frames.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { batchContextOf, resumeReplacementBatch, type BatchResumeResult, type ReplacementBatchResumeContext } from "../engine/replacements.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";

export interface RevealResult {
  state: GameState;
  valid: boolean;
  error?: string;
  pendingPrompt?: PendingPromptState;
  gameOver?: { winner: 0 | 1 | null; reason: string };
}

const noopServices = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};

/**
 * Answer the pending Trigger window as GameSession does (the prompt
 * lifecycle), returning a pipeline-shaped result. The window's prompt is
 * surfaced first when the caller holds a state whose damage frame has not
 * been surfaced yet.
 */
export function revealTrigger(
  state: GameState,
  reveal: boolean,
  cardDb: Map<string, CardData>,
): RevealResult {
  const surfaced = surfaceDamageFramePrompt(state, cardDb);
  const prompt = surfaced.pendingPrompt;
  if (prompt?.options.promptType !== "REVEAL_TRIGGER") {
    return { state, valid: false, error: "No Trigger window is pending" };
  }
  const action: GameAction = { type: "REVEAL_TRIGGER", reveal, promptId: prompt.promptId };
  const result = resumePromptLifecycle(surfaced, action, cardDb, noopServices);
  if (result.responseRejected) return { state, valid: false, error: "Trigger reply rejected" };
  const next = surfaceDamageFramePrompt(result.state, cardDb);
  return {
    state: next,
    valid: true,
    ...(next.pendingPrompt ? { pendingPrompt: next.pendingPrompt } : {}),
    ...(result.gameOver ? { gameOver: result.gameOver } : {}),
  };
}

/** Route a REVEAL_TRIGGER through the coordinator (prompt id and responder checks) and the lifecycle. */
export function revealTriggerThroughCoordinator(
  coordinator: SessionCoordinator,
  state: GameState,
  playerIndex: 0 | 1,
  reveal: boolean,
  cardDb: Map<string, CardData>,
): RevealResult {
  const surfaced = coordinator.surfaceRevealTrigger(state, cardDb);
  const action: GameAction = {
    type: "REVEAL_TRIGGER",
    reveal,
    promptId: surfaced.pendingPrompt?.promptId,
  };
  const routed = coordinator.executeAction(surfaced, [], playerIndex, action, cardDb);
  if (routed.kind !== "resume") {
    return { state, valid: false, error: "reason" in routed ? routed.reason : routed.kind };
  }
  const result = resumePromptLifecycle(routed.state, action, cardDb, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => coordinator.advanceStartOfTurn(s, cardDb),
  });
  if (result.responseRejected) return { state, valid: false, error: "Trigger reply rejected" };
  const next = coordinator.surfaceRevealTrigger(result.state, cardDb);
  return {
    state: next,
    valid: true,
    ...(next.pendingPrompt ? { pendingPrompt: next.pendingPrompt } : {}),
    ...(result.gameOver ? { gameOver: result.gameOver } : {}),
  };
}

/** The one BATTLE_DAMAGE frame of a state (one battle at a time), if any. */
export function battleDamageFrame(state: GameState): EffectStackFrame | undefined {
  return state.effectStack.find((frame) => frame.battleDamage !== undefined);
}

/** The battle's paused Damage Step record (the frame's continuation), if any. */
export function battleContinuation(state: GameState): BattleDamageContinuation | undefined {
  return battleDamageFrame(state)?.battleDamage;
}

/** The Life card the battle's Trigger window is waiting on, if the battle is paused there. */
export function battleTriggerLifeCard(state: GameState): LifeCard | undefined {
  const continuation = battleContinuation(state);
  return continuation?.stage === "TRIGGER_WINDOW" ? continuation.lifeCard : undefined;
}

/** The top-most EFFECT_DAMAGE frame's continuation, if any. */
export function effectDamageContinuation(state: GameState): EffectDamageContinuation | undefined {
  return [...state.effectStack].reverse().find((frame) => frame.effectDamage !== undefined)?.effectDamage;
}

/** The effect damage window (the EFFECT_DAMAGE frame at TRIGGER_WINDOW), if any. */
export function effectTriggerWindow(
  state: GameState,
): Extract<EffectDamageContinuation, { stage: "TRIGGER_WINDOW" }> | undefined {
  const continuation = effectDamageContinuation(state);
  return continuation?.stage === "TRIGGER_WINDOW" ? continuation : undefined;
}

/** Whatever Trigger window the top damage frame is waiting on (either kind), if any. */
export function topTriggerWindow(state: GameState): { lifeCard: LifeCard; damagedPlayerIndex: 0 | 1 } | null {
  const top = state.effectStack.at(-1);
  return top ? triggerWindowOf(top) : null;
}

// ─── Builders for constructed states ─────────────────────────────────────────

/** The window frame and its prompt a battle at the Damage Step pauses on. */
export function withBattleTriggerWindow(
  state: GameState,
  lifeCard: LifeCard,
  cardDb: Map<string, CardData>,
  frameId = "test-battle-damage",
): GameState {
  const battle = state.turn.battle!;
  const damagedPlayerIndex: 0 | 1 = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const frame = continuationFrame({
    id: frameId,
    sourceCardInstanceId: battle.attackerInstanceId,
    controller: state.turn.activePlayerIndex,
    phase: "AWAITING_TRIGGER_REVEAL",
    battleDamage: { stage: "TRIGGER_WINDOW", battleId: battle.battleId, damagedPlayerIndex, lifeCard },
  });
  const next = { ...state, effectStack: [...state.effectStack, frame] };
  return { ...next, pendingPrompt: revealTriggerPromptFor(frame, cardDb) };
}

/** The window frame and its prompt a DEAL_DAMAGE instruction pauses on. */
export function withEffectTriggerWindow(
  state: GameState,
  window: Omit<Extract<EffectDamageContinuation, { stage: "TRIGGER_WINDOW" }>, "stage" | "dealt"> & { dealt?: number },
  cardDb: Map<string, CardData>,
  frameId = "test-effect-damage",
): GameState {
  const frame = continuationFrame({
    id: frameId,
    sourceCardInstanceId: window.sourceCardInstanceId,
    controller: window.controllerIndex,
    phase: "AWAITING_TRIGGER_REVEAL",
    effectDamage: { stage: "TRIGGER_WINDOW", dealt: 0, ...window },
  });
  const next = { ...state, effectStack: [...state.effectStack, frame] };
  return { ...next, pendingPrompt: revealTriggerPromptFor(frame, cardDb) };
}

/** A BATTLE_DAMAGE frame at TRIGGER_EFFECT or CHARACTER_KO_REPLACEMENT, inserted at the bottom of the stack. */
export function withBattleContinuation(
  state: GameState,
  continuation: Exclude<BattleDamageContinuation, { stage: "TRIGGER_WINDOW" }>,
  frameId = "test-battle-damage",
): GameState {
  const frame = continuationFrame({
    id: frameId,
    sourceCardInstanceId: state.turn.battle?.attackerInstanceId ?? "",
    controller: state.turn.activePlayerIndex,
    phase: "INTERRUPTED_BY_TRIGGERS",
    battleDamage: continuation,
  });
  return { ...state, effectStack: [frame, ...state.effectStack] };
}

/** Replace the battle continuation of the state's BATTLE_DAMAGE frame. */
export function patchBattleContinuation(
  state: GameState,
  patch: Partial<Extract<BattleDamageContinuation, { stage: "CHARACTER_KO_REPLACEMENT" }>>,
): GameState {
  const frame = battleDamageFrame(state);
  if (!frame) throw new Error("no BATTLE_DAMAGE frame to patch");
  return {
    ...state,
    effectStack: state.effectStack.map((candidate) =>
      candidate.id === frame.id
        ? { ...candidate, battleDamage: { ...candidate.battleDamage!, ...patch } as BattleDamageContinuation }
        : candidate,
    ),
  };
}

/** A REPLACEMENT offer frame on top with its OPTIONAL_EFFECT prompt (constructed, e.g. an unrelated offer). */
export function withReplacementOffer(
  state: GameState,
  offer: { effectId: string; targetInstanceId: string; event: ReplacementContinuation["event"] },
  respondingPlayer: 0 | 1,
  frameId = "test-replacement-offer",
): GameState {
  const frame = continuationFrame({
    id: frameId,
    sourceCardInstanceId: offer.targetInstanceId,
    controller: respondingPlayer,
    phase: "AWAITING_OPTIONAL_RESPONSE",
    replacement: offer,
  });
  return {
    ...state,
    effectStack: [...state.effectStack, frame],
    pendingPrompt: {
      options: { promptType: "OPTIONAL_EFFECT", effectDescription: "Activate replacement effect?", cards: [] },
      respondingPlayer,
      resumeContext: frame.id,
    },
  };
}

// ─── Replacement batch offers ────────────────────────────────────────────────

/** A state, or a handler/resolver result that carries the prompt beside its state. */
type Prompted = GameState | { state: GameState; pendingPrompt?: PendingPromptState | null };

function promptedState(input: Prompted): { state: GameState; prompt: PendingPromptState | null } {
  if ("effectStack" in input) return { state: input, prompt: input.pendingPrompt };
  return { state: input.state, prompt: input.pendingPrompt ?? input.state.pendingPrompt ?? null };
}

/** The batch state machine of the REPLACEMENT_BATCH frame the pending prompt names. */
export function batchOfferOf(input: Prompted): ReplacementBatchResumeContext {
  const { state, prompt } = promptedState(input);
  const id = prompt?.resumeContext;
  const frame = state.effectStack.find((candidate) => candidate.id === id && candidate.replacementBatch);
  if (!frame) throw new Error("no REPLACEMENT_BATCH frame owns the pending prompt");
  return batchContextOf(frame);
}

/**
 * Answer the pending batch offer with the batch functions directly (unit
 * level): the offer frame is popped and the batch stepped from it, as the
 * prompt lifecycle does. Returns the batch result.
 */
export function answerBatchOffer(input: Prompted, accepted: boolean, cardDb: Map<string, CardData>): BatchResumeResult {
  const { state, prompt } = promptedState(input);
  const context = batchOfferOf(input);
  const withoutOffer = { ...state, effectStack: state.effectStack.filter((frame) => frame.id !== prompt?.resumeContext), pendingPrompt: null };
  return resumeReplacementBatch(withoutOffer, context, accepted, cardDb, resolverExecutionServices);
}
