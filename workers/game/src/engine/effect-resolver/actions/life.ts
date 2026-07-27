/**
 * Action handlers: All 14 life actions
 */

import type { ActionOf, EffectResult } from "../../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PendingEvent,
} from "../../../types.js";
import type { ActionResult } from "../types.js";
import {
  autoSelectTargets,
  buildSelectTargetPrompt,
  computeAllValidTargets,
  lifeCardToTargetCandidate,
  needsPlayerTargetSelection,
} from "../target-resolver.js";
import { findCardInstance } from "../../state.js";
import { isRemovalProhibited } from "../../prohibitions.js";
import { transitionCard, transitionCards } from "../../zone-transition.js";
import { terminateForEngineContract } from "../../engine-limits.js";

export function executeAddToLifeFromDeck(
  state: GameState,
  action: ActionOf<"ADD_TO_LIFE_FROM_DECK">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const face = params.face ?? "DOWN";
  const position = params.position ?? "TOP";

  const p = state.players[controller];
  const count = Math.min(amount, p.deck.length);
  if (count === 0) return { state, events, succeeded: false };

  const cards = p.deck.slice(0, count);
  const moved = transitionCards(state, cards.map((card) => card.instanceId), "LIFE", {
    position,
    lifeFace: face,
  });

  return {
    state: moved.state,
    events,
    succeeded: true,
  };
}

// OPT-259 (F6): trashing a Life card is not damage — never fire [Trigger].
export function executeTrashFromLife(
  state: GameState,
  action: ActionOf<"TRASH_FROM_LIFE">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const position = params.position ?? "TOP";

  const pi: 0 | 1 =
    params.controller === "OPPONENT" ? (controller === 0 ? 1 : 0) : controller;
  const p = state.players[pi];
  const count = Math.min(amount, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const removed = position === "TOP"
    ? p.life.slice(0, count)
    : p.life.slice(-count);
  const moved = transitionCards(
    state,
    removed.map((card) => card.instanceId),
    "TRASH",
    { position: "TOP" },
  );

  events.push({
    type: "CARD_TRASHED",
    playerIndex: pi,
    payload: { count, reason: "life_trash", from: "LIFE" },
  });
  // OPT-240: any life exit publishes CARD_REMOVED_FROM_LIFE so
  // Kalgara/Bonney-style watchers fire on effect-driven life trashes too.
  for (const transition of moved.transitions) {
    events.push({
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: pi,
      payload: {
        cardInstanceId: transition.fact.oldInstanceId,
        newCardInstanceId: transition.fact.newInstanceId,
      },
    });
  }

  return {
    state: moved.state,
    events,
    succeeded: true,
  };
}

// OPT-259 (F6): flipping a Life face-up is not damage — never fire [Trigger].
export function executeTurnLifeFaceUp(
  state: GameState,
  action: ActionOf<"TURN_LIFE_FACE_UP">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const position = params.position ?? "TOP";
  const p = state.players[controller];
  if (p.life.length === 0) return { state, events, succeeded: false };

  let newLife = [...p.life];
  if (position === "ALL") {
    newLife = newLife.map((l) => ({ ...l, face: "UP" as const }));
  } else if (position === "TOP") {
    const count = Math.min(amount, newLife.length);
    for (let i = 0; i < count; i++) {
      newLife[i] = { ...newLife[i], face: "UP" as const };
    }
  } else {
    const count = Math.min(amount, newLife.length);
    for (let i = newLife.length - count; i < newLife.length; i++) {
      newLife[i] = { ...newLife[i], face: "UP" as const };
    }
  }

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, life: newLife };

  events.push({ type: "LIFE_CARD_FACE_CHANGED", playerIndex: controller, payload: { face: "UP" } });

  return { state: { ...state, players: newPlayers }, events, succeeded: true };
}

export function executeTurnLifeFaceDown(
  state: GameState,
  action: ActionOf<"TURN_LIFE_FACE_DOWN">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const p = state.players[controller];
  if (p.life.length === 0) return { state, events, succeeded: false };

  const newLife = [...p.life];
  const count = Math.min(amount, newLife.length);
  for (let i = 0; i < count; i++) {
    newLife[i] = { ...newLife[i], face: "DOWN" as const };
  }

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, life: newLife };

  events.push({ type: "LIFE_CARD_FACE_CHANGED", playerIndex: controller, payload: { face: "DOWN" } });

  return { state: { ...state, players: newPlayers }, events, succeeded: true };
}

export function executeTurnAllLifeFaceDown(
  state: GameState,
  _action: ActionOf<"TURN_ALL_LIFE_FACE_DOWN">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p = state.players[controller];
  const newLife = p.life.map((l) => ({ ...l, face: "DOWN" as const }));
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, life: newLife };

  return { state: { ...state, players: newPlayers }, events, succeeded: true };
}

// OPT-259 (F6): non-damage Life→hand adds (e.g. OP05-107) do NOT fire [Trigger].
// Damage-driven Life→hand goes through executeDealDamage / battle damage.
export function executeLifeToHand(
  state: GameState,
  action: ActionOf<"LIFE_TO_HAND">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const position = params.position ?? "TOP";
  // The OPPONENT_LIFE target type implies the opponent even without an
  // explicit controller (same convention as executeReorderAllLife).
  const targetController: 0 | 1 =
    action.target?.type === "OPPONENT_LIFE" ||
    action.target?.controller === "OPPONENT"
      ? controller === 0
        ? 1
        : 0
      : controller;
  const p = state.players[targetController];
  const count = Math.min(amount, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const removed = position === "TOP" ? p.life.slice(0, count) : p.life.slice(-count);
  const moved = transitionCards(
    state,
    removed.map((card) => card.instanceId),
    "HAND",
  );

  for (const transition of moved.transitions) {
    events.push({
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: targetController,
      payload: {
        cardId: transition.fact.cardId,
        cardInstanceId: transition.fact.newInstanceId,
      },
    });
    events.push({
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: targetController,
      payload: {
        cardInstanceId: transition.fact.oldInstanceId,
        newCardInstanceId: transition.fact.newInstanceId,
      },
    });
  }

  return {
    state: moved.state,
    events,
    succeeded: true,
    result: {
      targetInstanceIds: moved.transitions.map((transition) => transition.fact.newInstanceId),
      count: moved.transitions.length,
    },
  };
}

// OPT-363: generic ADD_TO_LIFE dispatcher. Currently the only authored use is
// OP14-104 Gecko Moria's CHOICE branch ("add a Character from your trash to the
// top of your Life cards face-up"), targeted by `CARD_IN_TRASH`. The existing
// `_FROM_DECK` / `_FROM_HAND` / `_FROM_FIELD` variants stay because they're
// referenced directly by a number of card schemas. A different target indicates
// schema/runtime drift, so it terminates through the same typed contract outcome
// as a missing action handler.
export function executeAddToLife(
  state: GameState,
  action: ActionOf<"ADD_TO_LIFE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const targetType = action.target?.type;
  if (targetType === "CARD_IN_TRASH") {
    return executeAddToLifeFromTrash(state, action, sourceCardInstanceId, controller, cardDb, resultRefs, preselectedTargets);
  }
  const terminated = terminateForEngineContract(state, {
    kind: "ENGINE_CONTRACT",
    contract: "ACTION_HANDLER",
    actionType: action.type,
    sourceCardInstanceId,
    message: `ADD_TO_LIFE does not support target type '${targetType ?? "(missing)"}'`,
  });
  return { state: terminated, events: [], succeeded: false };
}

function executeAddToLifeFromTrash(
  state: GameState,
  action: ActionOf<"ADD_TO_LIFE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const face = params.face ?? "DOWN";
  const position = params.position ?? "TOP";

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (allValidIds.length === 0) return { state, events, succeeded: false };

  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const moved = transitionCards(state, targetIds, "LIFE", {
    position,
    lifeFace: face,
  });
  if (moved.transitions.length === 0) return { state, events, succeeded: false };

  return {
    state: moved.state,
    events,
    succeeded: true,
    result: {
      targetInstanceIds: moved.transitions.map((transition) => transition.fact.newInstanceId),
      count: moved.transitions.length,
    },
  };
}

export function executeAddToLifeFromHand(
  state: GameState,
  action: ActionOf<"ADD_TO_LIFE_FROM_HAND">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const face = params.face ?? "DOWN";
  const position = params.position ?? "TOP";

  const p = state.players[controller];

  // Use target resolution for player selection when target is specified
  let targetIds: string[];
  if (action.target) {
    const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
    if (allValidIds.length === 0) return { state, events, succeeded: false };

    if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
      return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
    }
    targetIds = autoSelectTargets(action.target, allValidIds);
  } else {
    // No target specified — auto-select from hand
    const amount = params.amount ?? 1;
    targetIds = p.hand
      .slice(0, Math.min(amount, p.hand.length))
      .map((c) => c.instanceId);
  }
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const moved = transitionCards(state, targetIds, "LIFE", {
    position,
    lifeFace: face,
  });

  return {
    state: moved.state,
    events,
    succeeded: true,
  };
}

export function executeAddToLifeFromField(
  state: GameState,
  action: ActionOf<"ADD_TO_LIFE_FROM_FIELD">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const params = action.params ?? {};
  const face = params.face ?? "DOWN";
  let nextState = state;

  for (const id of targetIds) {
    const card = findCardInstance(nextState, id);
    if (!card || card.zone !== "CHARACTER") continue;
    if (isRemovalProhibited(nextState, id, {
      action: "TO_LIFE",
      cause: "EFFECT",
      causingController: controller,
      sourceCardInstanceId,
    }, cardDb)) continue;

    const moved = transitionCard(nextState, id, "LIFE", {
      position: "TOP",
      lifeFace: face,
      preserveSourceTriggers: true,
    });
    if (moved) nextState = moved.state;
  }

  return { state: nextState, events, succeeded: true };
}

export function executePlayFromLife(
  state: GameState,
  action: ActionOf<"PLAY_FROM_LIFE">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const position = params.position ?? "TOP";
  const p = state.players[controller];
  if (p.life.length === 0) return { state, events, succeeded: false };

  const lifeCard = position === "TOP" ? p.life[0] : p.life[p.life.length - 1];
  const data = cardDb.get(lifeCard.cardId);
  if (!data) return { state, events, succeeded: false };

  const entryState = params.entry_state ?? "ACTIVE";

  if (data.type.toUpperCase() === "CHARACTER") {
    const moved = transitionCard(state, lifeCard.instanceId, "CHARACTER", {
      entryState,
      turnPlayed: state.turn.number,
    });
    if (!moved) return { state, events, succeeded: false };

    events.push({
      type: "CARD_PLAYED",
      playerIndex: controller,
      payload: {
        cardInstanceId: moved.fact.newInstanceId,
        cardId: lifeCard.cardId,
        zone: "CHARACTER",
        source: "LIFE",
        playedRested: entryState === "RESTED",
        sourceZone: "LIFE",
      },
    });

    return {
      state: moved.state,
      events,
      succeeded: true,
      result: { targetInstanceIds: [moved.fact.newInstanceId], count: 1 },
    };
  }

  return { state, events, succeeded: false };
}

// OPT-259 (F6): Life → bottom of deck is not damage — never fire [Trigger].
export function executeLifeCardToDeck(
  state: GameState,
  action: ActionOf<"LIFE_CARD_TO_DECK">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const position = params.position ?? "BOTTOM";
  const targetController: 0 | 1 =
    action.target?.controller === "OPPONENT"
      ? controller === 0
        ? 1
        : 0
      : controller;
  const p = state.players[targetController];
  const count = Math.min(amount, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const removed = p.life.slice(0, count);
  const moved = transitionCards(
    state,
    removed.map((card) => card.instanceId),
    "DECK",
    { position },
  );

  events.push({ type: "LIFE_CARD_TO_DECK", playerIndex: targetController, payload: { count } });

  return {
    state: moved.state,
    events,
    succeeded: true,
  };
}

export function executeTrashFaceUpLife(
  state: GameState,
  _action: ActionOf<"TRASH_FACE_UP_LIFE">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p = state.players[controller];
  const faceUp = p.life.filter((l) => l.face === "UP");
  if (faceUp.length === 0) return { state, events, succeeded: false };

  const moved = transitionCards(
    state,
    faceUp.map((card) => card.instanceId),
    "TRASH",
    { position: "TOP" },
  );

  events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: faceUp.length, reason: "face_up_life", from: "LIFE" } });

  return {
    state: moved.state,
    events,
    succeeded: true,
  };
}

// OPT-259 (F6): "look at top Life" (Katakuri) is not damage — never fire [Trigger].
export function executeLifeScry(
  state: GameState,
  action: ActionOf<"LIFE_SCRY">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const lookAt = params.look_at ?? 1;

  // Legacy target-less LIFE_SCRY remains scoped to the acting player's top
  // Life cards. Authored Katakuri-family schemas use LIFE_CARD + EITHER and
  // take the private select -> reveal -> place flow below.
  if (!action.target && preselectedTargets === undefined) {
    const lifeCards = state.players[controller].life.slice(0, lookAt);
    if (lifeCards.length === 0) return { state, events, succeeded: false };
    events.push({
      type: "LIFE_SCRIED",
      playerIndex: controller,
      payload: {
        cards: lifeCards.map((card) => ({
          instanceId: card.instanceId,
          cardId: card.cardId,
        })),
        count: lifeCards.length,
      },
    });
    return { state, events, succeeded: true };
  }

  const allValidIds = preselectedTargets ?? (action.target
    ? computeAllValidTargets(
        state,
        action.target,
        controller,
        cardDb,
        sourceCardInstanceId,
        resultRefs,
      )
    : []);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(
      state,
      action,
      allValidIds,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
    );
  }

  const selectedIds = preselectedTargets ?? autoSelectTargets(action.target, allValidIds);
  // "Up to 1" permits declining the look while allowing chained actions to
  // continue normally.
  if (selectedIds.length === 0) return { state, events, succeeded: true };

  // Pool computation is defense in depth. References and preselected targets
  // bypass it, so enforce the printed top-of-Life invariant at the action
  // boundary after every target source has resolved. Match neighboring
  // removal actions by dropping ineligible ids; fail if none remain rather
  // than silently substituting a different top card.
  const eligibleSelectedIds = selectedIds.filter((id) =>
    state.players.some((player) => player.life[0]?.instanceId === id));
  if (eligibleSelectedIds.length === 0) {
    return { state, events, succeeded: false };
  }

  const selectedId = eligibleSelectedIds[0];
  const owner = state.players[0].life[0]?.instanceId === selectedId
    ? 0
    : state.players[1].life[0]?.instanceId === selectedId
      ? 1
      : null;
  if (owner === null) return { state, events, succeeded: false };
  const selectedLifeCard = state.players[owner].life.find(
    (card) => card.instanceId === selectedId,
  );
  if (!selectedLifeCard) return { state, events, succeeded: false };

  events.push({
    type: "LIFE_SCRIED",
    playerIndex: controller,
    payload: {
      cards: [{
        instanceId: selectedLifeCard.instanceId,
        cardId: selectedLifeCard.cardId,
      }],
      count: 1,
    },
  });

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const resumeCtx: import("../../../types.js").ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()],
    validTargets: [selectedId],
  };
  const pendingPrompt: import("../../../types.js").PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: [lifeCardToTargetCandidate(selectedLifeCard, {
        owner,
        visibility: "ENGINE_INTERNAL",
      })],
      effectDescription: sourceData?.effectText ?? "Place the Life card at the top or bottom.",
      canSendToBottom: true,
      validTargets: [selectedId],
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}

export function executeDrainLifeToThreshold(
  state: GameState,
  action: ActionOf<"DRAIN_LIFE_TO_THRESHOLD">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const threshold = params.threshold ?? 0;
  const p = state.players[controller];
  const excess = p.life.length - threshold;
  if (excess <= 0) return { state, events, succeeded: false };

  const removed = p.life.slice(0, excess);
  const moved = transitionCards(
    state,
    removed.map((card) => card.instanceId),
    "TRASH",
    { position: "TOP" },
  );

  return {
    state: moved.state,
    events,
    succeeded: true,
  };
}

// OPT-259 (F6): reordering Life cards (Viola) is not damage — never fire [Trigger].
export function executeReorderAllLife(
  state: GameState,
  action: ActionOf<"REORDER_ALL_LIFE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];

  // Determine target player — OPPONENT_LIFE target means opponent
  const targetController: 0 | 1 =
    action.target?.type === "OPPONENT_LIFE" ||
    action.target?.controller === "OPPONENT"
      ? controller === 0
        ? 1
        : 0
      : controller;

  const p = state.players[targetController];
  if (p.life.length <= 1) {
    // Nothing to reorder with 0 or 1 life cards
    return { state, events, succeeded: true };
  }

  // Build life cards as CardInstance objects for the prompt
  const lifeCards: CardInstance[] = p.life.map((l) => ({
    instanceId: l.instanceId,
    cardId: l.cardId,
    zone: "LIFE" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller: targetController,
    owner: targetController,
  }));

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceData?.effectText ?? "Rearrange your Life cards in any order.";

  const resumeCtx: import("../../../types.js").ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()],
    validTargets: lifeCards.map((c) => c.instanceId),
  };

  const pendingPrompt: import("../../../types.js").PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: lifeCards,
      effectDescription,
      canSendToBottom: false,
      validTargets: lifeCards.map((c) => c.instanceId),
    },
    respondingPlayer: controller, // The effect controller chooses the order
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}
