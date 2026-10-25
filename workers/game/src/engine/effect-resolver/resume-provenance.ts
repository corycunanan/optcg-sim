import type { Action, EffectResult } from "../effect-types.js";
import { EFFECT_SOURCE_SNAPSHOT_REF, getNestedActions } from "../effect-types.js";
import type { GameState } from "../../types.js";
import { findCardInstance } from "../state.js";
import { isGameTerminated } from "../terminal.js";
import type { HandlerResult } from "./types.js";

export function actionsCanSchedule(actions: readonly Action[] | undefined): boolean {
  return actions?.some(action => action.type === "SCHEDULE_ACTION" || actionsCanSchedule(getNestedActions(action))) ?? false;
}

/** Reader10 resumes already activated work. The future writer activates10 at
 * this same producer boundary; ordinary8/9 readers never enrich their refs.
 */
export function prepareResumeProvenance(
  state: GameState,
  ownerInstanceId: string,
  refs: [string, EffectResult][],
  _actions: readonly Action[],
): { state: GameState; refs: [string, EffectResult][] } {
  if (isGameTerminated(state) || !actionsCanSchedule(_actions) || state.schemaVersion !== 10) return { state, refs };
  const original = refs.find(([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF)?.[1];
  if (!original || original.sourceCardSnapshot) return { state, refs };
  const identity = original.sourceIdentity;
  if (!identity || identity.instanceId !== ownerInstanceId) return { state, refs };
  const source = findCardInstance(state, identity.instanceId);
  // A changed controller cannot supply a historical full card. Keep the
  // proven identity alone rather than manufacturing a matching snapshot.
  if (!source || source.cardId !== identity.cardId || source.controller !== identity.controller) return { state, refs };
  return { state, refs: refs.map(([key, value]) => key === EFFECT_SOURCE_SNAPSHOT_REF
    ? [key, { ...value, sourceCardSnapshot: structuredClone(source) }]
    : [key, value]) };
}

export function abandonedResume(result: HandlerResult): HandlerResult {
  return { ...result, resumeBodyAbandoned: true };
}

/** A preparation is unpublished until a continuation actually advances. Cost
 * dispatch can return waiting/no-op without rejected=true; optional abandonment
 * can remove its frame without executing the body. Neither publishes metadata.
 */
export function settleResumeProvenance(
  before: GameState,
  prepared: GameState,
  result: HandlerResult,
): HandlerResult {
  if (before === prepared) return result;
  const owner = prepared.effectStack.at(-1);
  const retained = owner && result.state.effectStack.find(frame => frame.id === owner.id);
  const ownerAdvanced = retained && JSON.stringify(retained) !== JSON.stringify(owner);
  // Retained prior-payment events also publish on abandonment. Events alone
  // never prove that this continuation advanced. A queued child may advance
  // its retained COST owner without resolving the body or opening a prompt.
  const oldScheduled = new Set(before.scheduledActions.map(entry => entry.id));
  const committedSchedule = result.state.scheduledActions.some(entry => !oldScheduled.has(entry.id));
  if (!result.rejected && (committedSchedule || !result.resumeBodyAbandoned && result.kind !== "terminal" &&
      (result.resolved || result.pendingPrompt || ownerAdvanced))) return result;
  const originalFrames = new Map(before.effectStack.map(frame => [frame.id, frame]));
  const preparedFrames = new Map(prepared.effectStack.map(frame => [frame.id, frame]));
  const restored = { ...result.state, schemaVersion: before.schemaVersion, effectStack: result.state.effectStack.map(frame => {
    const original = originalFrames.get(frame.id); const staged = preparedFrames.get(frame.id);
    if (!original || !staged) return frame;
    return { ...frame,
      ...(staged.resultRefs !== original.resultRefs ? { resultRefs: original.resultRefs } : {}),
      ...(staged.simultaneousGroup && original.simultaneousGroup && staged.simultaneousGroup.resultRefs !== original.simultaneousGroup.resultRefs
        ? { simultaneousGroup: { ...frame.simultaneousGroup!, resultRefs: original.simultaneousGroup.resultRefs } } : {}),
    };
  }) };
  const fieldAdvanced = prepared.fieldTrashSemanticsVersion === 8 && result.state.fieldTrashSemanticsVersion === 9;
  if (fieldAdvanced) {
    if (before.schemaVersion === 10) restored.fieldTrashSemanticsVersion = 9;
    else { restored.schemaVersion = 9; delete restored.fieldTrashSemanticsVersion; }
  } else if (before.fieldTrashSemanticsVersion === undefined) delete restored.fieldTrashSemanticsVersion;
  else restored.fieldTrashSemanticsVersion = before.fieldTrashSemanticsVersion;
  return { ...result, state: restored };
}
