/**
 * Action handlers: PLAYER_CHOICE, OPPONENT_CHOICE, OPPONENT_ACTION, REUSE_EFFECT
 */

import type { Action, EffectResult, EffectSchema } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { describeActionBranch } from "../action-utils.js";
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

  const resolveResult = _resolveEffect(state, targetBlock, sourceCardInstanceId, controller, cardDb);
  return {
    state: resolveResult.state,
    events: [...events, ...resolveResult.events],
    succeeded: resolveResult.resolved,
  };
}
