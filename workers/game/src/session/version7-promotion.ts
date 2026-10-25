/** Atomic writer boundary: prove legacy replay semantics before emitting native7. */
import type { GameState, EffectStackFrame } from "../types.js";
import { SessionLoadError, toPersistedGameState } from "./game-state-schema.js";
import { canonicalCostReplacementReplay, costReplacementReplayViolation, fixedCostExitTarget, parseLifeDestinationChoiceId } from "../engine/effect-resolver/cost/replacement-replay.js";
import { replacementEventsFor } from "../engine/replacement-events.js";

type ValidateState = (raw: unknown, location: string) => GameState;
function unansweredOfferMatches(state: GameState, frame: EffectStackFrame, index: number): boolean {
  const offer = state.effectStack[index + 1];
  const prompt = state.pendingPrompt;
  if (frame.costReplacementResolution !== undefined || offer?.kind !== "REPLACEMENT" || !offer.replacement ||
      prompt?.resumeContext !== offer.id || (prompt.options.promptType !== "OPTIONAL_EFFECT" && prompt.options.promptType !== "PLAYER_CHOICE")) return false;
  const cost = frame.costs[frame.currentCostIndex];
  const action = frame.costReplacementAction;
  if (!cost || !action) return false;
  const staged = frame.costTransactionState ? { ...state, ...frame.costTransactionState } : state;
  const compound = cost.type === "PLACE_SELF_AND_HAND_TO_DECK" || cost.type === "PLACE_SELF_AND_TRASH_TO_DECK";
  const target = compound || action.type === "ARRANGE_TOP_CARDS" ? frame.sourceCardInstanceId
    : action.type === "SELECT_TARGET" ? action.selectedInstanceIds[0]
    : action.type === "PLAYER_CHOICE" && action.choiceId === "__PAY_FIXED_COST__" ? fixedCostExitTarget(staged, cost, frame.controller, frame.sourceCardInstanceId)
    : action.type === "PLAYER_CHOICE" ? parseLifeDestinationChoiceId(action.choiceId)?.ids[0] : undefined;
  return target !== undefined && offer.replacement.targetInstanceId === target &&
    replacementEventsFor(cost.type === "KO_OWN_CHARACTER" ? "KO" : "RETURN_TO_HAND").includes(offer.replacement.event);
}

export function promoteStateToVersion7(original: GameState, location: string, validate: ValidateState): GameState {
  if (original.schemaVersion === 7 || original.schemaVersion === 8 || original.schemaVersion === 9 || original.schemaVersion === 10) return validate(original, location);
  const state = structuredClone(original);
  for (const [index, frame] of state.effectStack.entries()) {
    if (frame.costReplacementAction === undefined && frame.costReplacementChecked !== true && frame.costReplacementResolution === undefined) continue;
    if (unansweredOfferMatches(state, frame, index)) {
      try { frame.costReplacementAction = canonicalCostReplacementReplay(frame, frame.costReplacementAction!); }
      catch (error) { throw new SessionLoadError(location, `legacy-debt: unprovable unanswered COST replay (${String(error)})`); }
    }
    const violation = costReplacementReplayViolation(state, frame);
    if (violation) throw new SessionLoadError(location, `legacy-debt: unprovable COST replay (${violation}); preserve original reader6 storage`);
    // Valid accepted/orphan debt stays unresolved. No outcome is inferred.
  }
  try { return validate(toPersistedGameState({ ...state, schemaVersion: 7 }), location); }
  catch (error) { throw new SessionLoadError(location, `legacy-debt: unprovable native7 continuation (${String(error)}); preserve original reader6 storage`); }
}

export function promoteSessionToVersion7<T extends { state: GameState; undoHistory: GameState[] }>(session: T, validate: ValidateState): T {
  // Evaluate all entries before any return, storage write or retention compaction.
  const state = promoteStateToVersion7(session.state, "state", validate);
  const undoHistory = session.undoHistory.map((snapshot, index) => promoteStateToVersion7(snapshot, `undoHistory[${index}]`, validate));
  return { ...session, state, undoHistory };
}
