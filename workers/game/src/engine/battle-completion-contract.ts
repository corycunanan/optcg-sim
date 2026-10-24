import type { EffectStackFrame, GameState } from "../types.js";

const boundaryKeys = new Set([
  "id",
  "sourceCardInstanceId",
  "controller",
  "kind",
  "battleCompletion",
  "effectBlock",
  "phase",
  "pausedAction",
  "remainingActions",
  "resultRefs",
  "validTargets",
  "costs",
  "currentCostIndex",
  "costsPaid",
  "oncePerTurnMarked",
  "costResultRefs",
  "pendingTriggers",
  "simultaneousTriggers",
  "accumulatedEvents",
]);

/** One exact obligation; no choices, executable suffix or publication debt. */
export function battleCompletionOwnerViolation(
  frame: EffectStackFrame,
  state: GameState
): string | null {
  const completion = frame.battleCompletion;
  if (!completion) return "missing battle completion identity";
  if (
    state.turn.battle ||
    state.turn.battleSubPhase !== null ||
    state.turn.phase !== "MAIN"
  )
    return "battle completion requires a cleared battle in MAIN";
  if (
    completion.turnPlayerIndex !== state.turn.activePlayerIndex ||
    completion.turnNumber !== state.turn.number ||
    frame.controller !== completion.turnPlayerIndex ||
    frame.sourceCardInstanceId !== completion.attackerInstanceId
  )
    return "battle completion identity disagrees with turn or source";
  if (
    state.effectStack.filter((f) => f.battleCompletion).length !== 1 ||
    state.effectStack[0] !== frame
  )
    return "battle completion must be the unique root boundary";
  if (
    Object.keys(frame).some((key) => !boundaryKeys.has(key)) ||
    frame.phase !== "INTERRUPTED_BY_TRIGGERS" ||
    frame.pausedAction !== null ||
    frame.currentCostIndex !== 0 ||
    !frame.costsPaid ||
    !frame.oncePerTurnMarked ||
    frame.effectBlock.id !== "__engine_continuation__" ||
    frame.effectBlock.category !== "auto" ||
    Object.keys(frame.effectBlock).some(
      (key) => key !== "id" && key !== "category"
    ) ||
    [
      frame.remainingActions,
      frame.resultRefs,
      frame.validTargets,
      frame.costs,
      frame.costResultRefs,
      frame.pendingTriggers,
      frame.simultaneousTriggers,
      frame.accumulatedEvents,
    ].some((entries) => entries.length > 0)
  )
    return "battle completion carries unrelated executable work";
  return null;
}
