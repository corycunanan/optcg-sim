/**
 * Action handlers: All 14 life actions
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, CardInstance, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { findCardInstance } from "../../state.js";
import { nanoid } from "../../../util/nanoid.js";

export function executeAddToLifeFromDeck(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const face = (params.face as "UP" | "DOWN") ?? "DOWN";
  const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";

  const p = state.players[controller];
  const count = Math.min(amount, p.deck.length);
  if (count === 0) return { state, events, succeeded: false };

  const cards = p.deck.slice(0, count);
  const newDeck = p.deck.slice(count);
  const lifeCards = cards.map((c) => ({
    instanceId: c.instanceId,
    cardId: c.cardId,
    face,
  }));
  const newLife = position === "TOP"
    ? [...lifeCards, ...p.life]
    : [...p.life, ...lifeCards];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, deck: newDeck, life: newLife };

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeTrashFromLife(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";

  const pi = (params.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0)
    : controller;
  const p = state.players[pi];
  const count = Math.min(amount, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const removed = position === "TOP"
    ? p.life.slice(0, count)
    : p.life.slice(-count);
  const newLife = position === "TOP"
    ? p.life.slice(count)
    : p.life.slice(0, -count);

  const trashedCards = removed.map((l) => ({
    instanceId: l.instanceId,
    cardId: l.cardId,
    zone: "TRASH" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller: pi as 0 | 1,
    owner: pi as 0 | 1,
  }));

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[pi] = {
    ...p,
    life: newLife,
    trash: [...trashedCards, ...p.trash],
  };

  events.push({ type: "CARD_TRASHED", playerIndex: pi as 0 | 1, payload: { count, reason: "life_trash" } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeTurnLifeFaceUp(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const position = (params.position as "TOP" | "BOTTOM" | "ALL") ?? "TOP";
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
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
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
  _action: Action,
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

export function executeLifeToHand(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";
  const targetController = (action.target?.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;
  const p = state.players[targetController];
  const count = Math.min(amount, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const removed = position === "TOP" ? p.life.slice(0, count) : p.life.slice(-count);
  const newLife = position === "TOP" ? p.life.slice(count) : p.life.slice(0, -count);

  const handCards: CardInstance[] = removed.map((l) => ({
    instanceId: l.instanceId,
    cardId: l.cardId,
    zone: "HAND" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller: targetController,
    owner: targetController,
  }));

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = {
    ...p,
    life: newLife,
    hand: [...p.hand, ...handCards],
  };

  for (const lc of removed) {
    events.push({
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: targetController,
      payload: { cardId: lc.cardId },
    });
  }

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: handCards.map((c) => c.instanceId), count },
  };
}

export function executeAddToLifeFromHand(
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
  const face = (params.face as "UP" | "DOWN") ?? "DOWN";
  const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";

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
    const amount = (params.amount as number) ?? 1;
    targetIds = p.hand.slice(0, Math.min(amount, p.hand.length)).map((c) => c.instanceId);
  }
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const toLife = p.hand.filter((c) => targetIds.includes(c.instanceId));
  const toLifeIds = new Set(toLife.map((c) => c.instanceId));
  const newHand = p.hand.filter((c) => !toLifeIds.has(c.instanceId));
  const lifeCards = toLife.map((c) => ({
    instanceId: c.instanceId,
    cardId: c.cardId,
    face,
  }));
  const newLife = position === "TOP"
    ? [...lifeCards, ...p.life]
    : [...p.life, ...lifeCards];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, hand: newHand, life: newLife };

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeAddToLifeFromField(
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
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const params = action.params ?? {};
  const face = (params.face as "UP" | "DOWN") ?? "DOWN";
  let nextState = state;

  for (const id of targetIds) {
    const card = findCardInstance(nextState, id);
    if (!card || card.zone !== "CHARACTER") continue;

    for (const [pi, player] of nextState.players.entries()) {
      const charIdx = player.characters.findIndex((c) => c.instanceId === id);
      if (charIdx === -1) continue;

      const char = player.characters[charIdx];
      const newChars = player.characters.filter((_, i) => i !== charIdx);
      const returnedDon = char.attachedDon.map((d) => ({
        ...d, state: "RESTED" as const, attachedTo: null,
      }));
      const lifeCard = { instanceId: nanoid(), cardId: char.cardId, face };

      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[pi] = {
        ...player,
        characters: newChars,
        life: [lifeCard, ...player.life],
        donCostArea: [...player.donCostArea, ...returnedDon],
      };
      nextState = { ...nextState, players: newPlayers };
      break;
    }
  }

  return { state: nextState, events, succeeded: true };
}

export function executePlayFromLife(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const position = (params.position as "TOP" | "BOTTOM") ?? "TOP";
  const p = state.players[controller];
  if (p.life.length === 0) return { state, events, succeeded: false };

  const lifeCard = position === "TOP" ? p.life[0] : p.life[p.life.length - 1];
  const newLife = position === "TOP" ? p.life.slice(1) : p.life.slice(0, -1);
  const data = cardDb.get(lifeCard.cardId);
  if (!data) return { state, events, succeeded: false };

  const entryState = (params.entry_state as "ACTIVE" | "RESTED") ?? "ACTIVE";

  if (data.type.toUpperCase() === "CHARACTER") {
    const newChar: CardInstance = {
      instanceId: nanoid(),
      cardId: lifeCard.cardId,
      zone: "CHARACTER",
      state: entryState,
      attachedDon: [],
      turnPlayed: state.turn.number,
      controller,
      owner: controller,
    };

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[controller] = {
      ...p,
      life: newLife,
      characters: [...p.characters, newChar],
    };

    events.push({
      type: "CARD_PLAYED",
      playerIndex: controller,
      payload: { cardInstanceId: newChar.instanceId, cardId: lifeCard.cardId, zone: "CHARACTER", source: "LIFE" },
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

export function executeLifeCardToDeck(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const position = (params.position as "TOP" | "BOTTOM") ?? "BOTTOM";
  const targetController = (action.target?.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;
  const p = state.players[targetController];
  const count = Math.min(amount, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const removed = p.life.slice(0, count);
  const newLife = p.life.slice(count);

  const deckCards: CardInstance[] = removed.map((l) => ({
    instanceId: nanoid(),
    cardId: l.cardId,
    zone: "DECK" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller: targetController,
    owner: targetController,
  }));

  const newDeck = position === "BOTTOM"
    ? [...p.deck, ...deckCards]
    : [...deckCards, ...p.deck];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = { ...p, life: newLife, deck: newDeck };

  events.push({ type: "LIFE_CARD_TO_DECK", playerIndex: targetController, payload: { count } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeTrashFaceUpLife(
  state: GameState,
  _action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p = state.players[controller];
  const faceUp = p.life.filter((l) => l.face === "UP");
  if (faceUp.length === 0) return { state, events, succeeded: false };

  const newLife = p.life.filter((l) => l.face !== "UP");
  const trashedCards: CardInstance[] = faceUp.map((l) => ({
    instanceId: l.instanceId,
    cardId: l.cardId,
    zone: "TRASH" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
  }));

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = {
    ...p,
    life: newLife,
    trash: [...trashedCards, ...p.trash],
  };

  events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: faceUp.length, reason: "face_up_life" } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeLifeScry(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const lookAt = (params.look_at as number) ?? 1;
  const p = state.players[controller];
  const count = Math.min(lookAt, p.life.length);
  if (count === 0) return { state, events, succeeded: false };

  const lifeCards = p.life.slice(0, count);
  events.push({
    type: "LIFE_SCRIED",
    playerIndex: controller,
    payload: { cards: lifeCards.map((l) => ({ instanceId: l.instanceId, cardId: l.cardId })), count },
  });

  return { state, events, succeeded: true };
}

export function executeDrainLifeToThreshold(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const threshold = (params.threshold as number) ?? 0;
  const p = state.players[controller];
  const excess = p.life.length - threshold;
  if (excess <= 0) return { state, events, succeeded: false };

  const removed = p.life.slice(0, excess);
  const newLife = p.life.slice(excess);
  const trashedCards: CardInstance[] = removed.map((l) => ({
    instanceId: l.instanceId,
    cardId: l.cardId,
    zone: "TRASH" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
  }));

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = {
    ...p,
    life: newLife,
    trash: [...trashedCards, ...p.trash],
  };

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeReorderAllLife(
  state: GameState,
  _action: Action,
  _sourceCardInstanceId: string,
  _controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  // This requires player input to reorder — for now, just acknowledge
  return { state, events: [], succeeded: true };
}
