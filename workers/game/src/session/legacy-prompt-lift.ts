/** Historical prompt payloads become ordinary frames at the storage boundary. */
import type { GameState, ResumeContext } from "../types.js";
import { continuationFrame } from "../engine/damage-frames.js";
import { generateFrameId } from "../engine/effect-stack.js";
import { promptTypeToPhase } from "../engine/effect-resolver/cost/prompts.js";
import { frameKindOf } from "../engine/frame-kinds.js";
import { SessionLoadError } from "./game-state-schema.js";

export function liftLegacyPrompt(state: GameState, location: string): GameState {
  const prompt = state.pendingPrompt;
  const context = prompt?.resumeContext;
  if (!prompt || !context || typeof context !== "object" || !("effectSourceInstanceId" in context)) return state;
  const allowed = new Set([
    "effectSourceInstanceId", "controller", "effectDescription", "remainingActionsController",
    "pausedAction", "remainingActions", "resultRefs", "validTargets", "returnToDeckArrangement",
    "fieldToLifeTargetIds", "giveDonIdentity", "ruleTrashForPlay", "stateDistributionForPlay", "batchResumeMarker",
  ]);
  const unknown = Object.keys(context).find(key => !allowed.has(key));
  if (unknown) throw new SessionLoadError(location, `structural resume context contains unknown field ${unknown}`);
  // The legacy lifecycle ignored the object whenever a frame already existed.
  // Preserve that authoritative frame instead of creating a second executor.
  const top = state.effectStack.at(-1);
  if (top) return { ...state, pendingPrompt: { ...prompt, resumeContext: top.id } };
  if (!["SELECT_TARGET", "REDISTRIBUTE_DON", "ARRANGE_TOP_CARDS", "PLAYER_CHOICE"].includes(prompt.options.promptType)) {
    throw new SessionLoadError(location, "structural resume context has no supported action-choice frame phase");
  }
  const ctx: ResumeContext = context;
  const generated = generateFrameId(state);
  const frame = continuationFrame({
    id: generated.id,
    sourceCardInstanceId: ctx.effectSourceInstanceId,
    controller: ctx.controller,
    effectDescription: ctx.effectDescription,
    remainingActionsController: ctx.remainingActionsController,
    phase: promptTypeToPhase(prompt.options.promptType),
    pausedAction: ctx.pausedAction,
    remainingActions: ctx.remainingActions,
    resultRefs: ctx.resultRefs,
    validTargets: ctx.validTargets,
    returnToDeckArrangement: ctx.returnToDeckArrangement,
    fieldToLifeTargetIds: ctx.fieldToLifeTargetIds,
    giveDonIdentity: ctx.giveDonIdentity,
    playOverflow: ctx.ruleTrashForPlay,
    stateDistributionForPlay: ctx.stateDistributionForPlay,
    batchResumeMarker: ctx.batchResumeMarker,
  });
  frame.kind = frameKindOf(frame);
  return { ...generated.state, effectStack: [frame], pendingPrompt: { ...prompt, resumeContext: frame.id } };
}
