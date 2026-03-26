/**
 * Action handlers: PLAY_CARD, PLAY_SELF, SET_ACTIVE, SET_REST
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, CardInstance, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { setCardState } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { findCardInstance } from "../../state.js";
import { nanoid } from "../../../util/nanoid.js";

export function executePlayCard(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  const playedIds: string[] = [];
  for (const id of targetIds) {
    const card = findCardInstance(nextState, id);
    if (!card) continue;
    const data = cardDb.get(card.cardId);
    if (!data) continue;

    const entryState = (params.entry_state as "ACTIVE" | "RESTED") ?? "ACTIVE";

    // Remove card from its source zone (hand, trash, or deck)
    const removeFromSourceZone = (p: typeof nextState.players[0]): typeof nextState.players[0] => {
      if (card.zone === "HAND") return { ...p, hand: p.hand.filter((c) => c.instanceId !== id) };
      if (card.zone === "TRASH") return { ...p, trash: p.trash.filter((c) => c.instanceId !== id) };
      if (card.zone === "DECK") return { ...p, deck: p.deck.filter((c) => c.instanceId !== id) };
      return { ...p, hand: p.hand.filter((c) => c.instanceId !== id) }; // default to hand
    };

    if (data.type.toUpperCase() === "CHARACTER") {
      const p = removeFromSourceZone(nextState.players[controller]);
      const newChar: CardInstance = {
        ...card,
        instanceId: nanoid(),
        zone: "CHARACTER",
        state: entryState,
        attachedDon: [],
        turnPlayed: nextState.turn.number,
        controller,
        owner: controller,
      };
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[controller] = { ...p, characters: [...p.characters, newChar] };
      nextState = { ...nextState, players: newPlayers };
      playedIds.push(newChar.instanceId);
      events.push({
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: { cardInstanceId: newChar.instanceId, cardId: card.cardId, zone: "CHARACTER" },
      });
    } else if (data.type.toUpperCase() === "STAGE") {
      const p = removeFromSourceZone(nextState.players[controller]);
      const newStage: CardInstance = {
        ...card,
        instanceId: nanoid(),
        zone: "STAGE",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: nextState.turn.number,
        controller,
        owner: controller,
      };
      // If there's an existing stage, trash it
      let newTrash = p.trash;
      if (p.stage) {
        newTrash = [{ ...p.stage, zone: "TRASH" as const }, ...newTrash];
      }
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[controller] = { ...p, stage: newStage, trash: newTrash };
      nextState = { ...nextState, players: newPlayers };
      playedIds.push(newStage.instanceId);
    }
  }

  return {
    state: nextState,
    events,
    succeeded: playedIds.length > 0,
    result: { targetInstanceIds: playedIds, count: playedIds.length },
  };
}

export function executePlaySelf(
  state: GameState,
  _action: Action,
  sourceCardInstanceId: string,
  _controller: 0 | 1,
  cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const card = findCardInstance(state, sourceCardInstanceId);
  if (!card) return { state, events, succeeded: false };
  const data = cardDb.get(card.cardId);
  if (!data) return { state, events, succeeded: false };

  // Only characters can be played to field via PLAY_SELF
  if (data.type.toUpperCase() !== "CHARACTER") return { state, events, succeeded: false };

  // Find which player owns this card and remove from source zone
  for (const [pi, player] of state.players.entries()) {
    const inHand = player.hand.findIndex((c) => c.instanceId === sourceCardInstanceId);
    const inTrash = player.trash.findIndex((c) => c.instanceId === sourceCardInstanceId);
    const inDeck = player.deck.findIndex((c) => c.instanceId === sourceCardInstanceId);

    let updatedPlayer = { ...player };
    let found = false;

    if (inHand !== -1) {
      updatedPlayer = { ...updatedPlayer, hand: player.hand.filter((_, i) => i !== inHand) };
      found = true;
    } else if (inTrash !== -1) {
      updatedPlayer = { ...updatedPlayer, trash: player.trash.filter((_, i) => i !== inTrash) };
      found = true;
    } else if (inDeck !== -1) {
      updatedPlayer = { ...updatedPlayer, deck: player.deck.filter((_, i) => i !== inDeck) };
      found = true;
    }

    if (!found) continue;

    const newChar: CardInstance = {
      ...card,
      instanceId: nanoid(),
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: state.turn.number,
      controller: pi as 0 | 1,
      owner: pi as 0 | 1,
    };

    updatedPlayer = { ...updatedPlayer, characters: [...updatedPlayer.characters, newChar] };

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[pi] = updatedPlayer;

    events.push({
      type: "CARD_PLAYED",
      playerIndex: pi as 0 | 1,
      payload: { cardInstanceId: newChar.instanceId, cardId: card.cardId, zone: "CHARACTER", source: "PLAY_SELF" },
    });

    return {
      state: { ...state, players: newPlayers },
      events,
      succeeded: true,
      result: { targetInstanceIds: [newChar.instanceId], count: 1 },
    };
  }

  return { state, events, succeeded: false };
}

export function executeSetActive(
  state: GameState,
  action: Action,
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
  let nextState = state;

  for (const id of targetIds) {
    nextState = setCardState(nextState, id, "ACTIVE");
  }

  return { state: nextState, events, succeeded: targetIds.length > 0 };
}

export function executeSetRest(
  state: GameState,
  action: Action,
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
  let nextState = state;

  for (const id of targetIds) {
    nextState = setCardState(nextState, id, "RESTED");
    events.push({ type: "CARD_STATE_CHANGED", playerIndex: controller, payload: { targetInstanceId: id, newState: "RESTED" } });
  }

  return { state: nextState, events, succeeded: targetIds.length > 0 };
}
