/**
 * Action handlers: PLAYER_CHOICE, OPPONENT_CHOICE, OPPONENT_ACTION, REUSE_EFFECT
 */

import type { Action, DynamicValue, EffectResult, EffectSchema, NumericRange } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { describeActionBranch, resolveAmount } from "../action-utils.js";
import { getActionParams } from "../../effect-types.js";
import { findCardInstance } from "../../state.js";

// These are set by the resolver module to break the circular dependency
let _executeActionChain: (
  state: GameState,
  actions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  initialResultRefs?: Map<string, EffectResult>,
) => { state: GameState; events: PendingEvent[]; pendingPrompt?: import("../../../types.js").PendingPromptState };

let _executeEffectAction: (
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
) => ActionResult;

let _resolveEffect: (
  state: GameState,
  block: import("../../effect-types.js").EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
) => import("../types.js").EffectResolverResult;

export function setChoiceDependencies(deps: {
  executeActionChain: typeof _executeActionChain;
  executeEffectAction: typeof _executeEffectAction;
  resolveEffect: typeof _resolveEffect;
}) {
  _executeActionChain = deps.executeActionChain;
  _executeEffectAction = deps.executeEffectAction;
  _resolveEffect = deps.resolveEffect;
}

export function executePlayerChoice(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const options = params.options as Action[][];
  if (!options || options.length === 0) return { state, events, succeeded: false };

  // Determine who chooses: PLAYER_CHOICE = controller, OPPONENT_CHOICE = opponent
  const chooser = action.type === "OPPONENT_CHOICE"
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;

  // If only one option, auto-select it (no prompt needed)
  if (options.length === 1) {
    const result = _executeActionChain(state, options[0], sourceCardInstanceId, controller, cardDb);
    return {
      state: result.state,
      events: [...events, ...result.events],
      succeeded: true,
    };
  }

  // Build choice labels from action types or explicit labels
  const explicitLabels = params.labels as string[] | undefined;
  const choices = options.map((branch, i) => ({
    id: String(i),
    label: explicitLabels?.[i] ?? describeActionBranch(branch),
  }));

  const choiceSourceCard = findCardInstance(state, sourceCardInstanceId);
  const choiceSourceData = choiceSourceCard ? cardDb.get(choiceSourceCard.cardId) : undefined;
  const effectDescription = choiceSourceData?.effectText ?? "Choose one";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets: [],
  };

  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "PLAYER_CHOICE",
      effectDescription,
      choices,
    },
    respondingPlayer: chooser,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}

function compareNumeric(left: number, operator: string, right: number): boolean {
  switch (operator) {
    case "==": return left === right;
    case "!=": return left !== right;
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    case ">=": return left >= right;
    default: return false;
  }
}

function rangeMatches(
  candidate: number,
  range: NumericRange,
  state: GameState,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): boolean {
  if ("any_of" in range) {
    return range.any_of.some((part) =>
      rangeMatches(candidate, part, state, controller, cardDb, resultRefs));
  }
  if ("min" in range) return candidate >= range.min && candidate <= range.max;
  const expected = resolveAmount(
    range.value as number | DynamicValue,
    resultRefs,
    state,
    controller,
    cardDb,
  );
  return compareNumeric(candidate, range.operator, expected);
}

export function executeChooseValue(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const params = getActionParams(action, "CHOOSE_VALUE");
  const defaults = params.domain === "POWER"
    ? { min: 0, max: 12000, step: 1000 }
    : { min: 0, max: 10, step: 1 };
  const explicitBounds = params.constraints && "min" in params.constraints
    ? params.constraints
    : null;
  const min = explicitBounds?.min ?? defaults.min;
  const max = explicitBounds?.max ?? defaults.max;
  const step = params.step ?? defaults.step;
  if (!Number.isInteger(min) || !Number.isInteger(max) || !Number.isInteger(step) || step <= 0 || min > max) {
    return { state, events: [], succeeded: false };
  }

  const values: number[] = [];
  for (let value = min; value <= max && values.length <= 100; value += step) {
    if (!params.constraints || rangeMatches(value, params.constraints, state, controller, cardDb, resultRefs)) {
      values.push(value);
    }
  }
  if (values.length === 0 || values.length > 100) {
    return { state, events: [], succeeded: false };
  }

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const validTargets = values.map((value) => `choose-value:${value}`);
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "PLAYER_CHOICE",
      choices: values.map((value) => ({ id: `choose-value:${value}`, label: String(value) })),
      effectDescription: sourceData?.effectText ?? "Choose a value.",
      source: "EFFECT",
    },
    respondingPlayer: controller,
    resumeContext: {
      effectSourceInstanceId: sourceCardInstanceId,
      controller,
      pausedAction: action,
      remainingActions: [],
      resultRefs: [...resultRefs.entries()].map(([key, result]) => [key, result as unknown]),
      validTargets,
    } satisfies ResumeContext,
  };

  return { state, events: [], succeeded: false, pendingPrompt };
}

export function executeOpponentAction(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const wrappedAction = params.action as Action;
  if (!wrappedAction) return { state, events, succeeded: false };

  const oppController = controller === 0 ? 1 : 0;
  const result = _executeEffectAction(
    state,
    wrappedAction,
    sourceCardInstanceId,
    oppController as 0 | 1,
    cardDb,
    resultRefs,
  );

  return result;
}

export function executeReuseEffect(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const targetEffect = params.target_effect as string;
  const card = findCardInstance(state, sourceCardInstanceId);
  if (!card) return { state, events, succeeded: false };

  const data = cardDb.get(card.cardId);
  if (!data) return { state, events, succeeded: false };

  const schema = data.effectSchema as EffectSchema | null;
  if (!schema) return { state, events, succeeded: false };

  const targetBlock = schema.effects.find((b) => {
    if (!b.trigger) return false;
    if ("keyword" in b.trigger) return b.trigger.keyword === targetEffect;
    return false;
  });

  if (!targetBlock) return { state, events, succeeded: false };

  // OP16-103 Van Augur FAQ: the reused block's turn_restriction still applies —
  // reusing an OPPONENT_TURN-only [On K.O.] during your own turn does nothing.
  // matchTriggersForEvent enforces this for real trigger firings, but reuse
  // calls resolveEffect directly and bypasses trigger matching.
  const restriction =
    targetBlock.trigger && "turn_restriction" in targetBlock.trigger
      ? targetBlock.trigger.turn_restriction
      : undefined;
  if (restriction) {
    const isOwnersTurn = state.turn.activePlayerIndex === card.controller;
    if (restriction === "YOUR_TURN" && !isOwnersTurn) return { state, events, succeeded: false };
    if (restriction === "OPPONENT_TURN" && isOwnersTurn) return { state, events, succeeded: false };
  }

  const resolveResult = _resolveEffect(state, targetBlock, sourceCardInstanceId, controller, cardDb);
  return {
    state: resolveResult.state,
    events: [...events, ...resolveResult.events],
    succeeded: resolveResult.resolved,
  };
}
