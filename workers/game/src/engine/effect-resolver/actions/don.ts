/**
 * Action handlers: GIVE_DON, ADD_DON_FROM_DECK, FORCE_OPPONENT_DON_RETURN,
 * SET_DON_ACTIVE, REST_OPPONENT_DON, RETURN_DON_TO_DECK
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { attachDonToCard } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";

export function executeGiveDon(
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
  const amount = (params.amount as number) ?? 1;
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  for (const targetId of targetIds) {
    for (let i = 0; i < amount; i++) {
      const result = attachDonToCard(nextState, controller, targetId);
      if (!result) break;
      nextState = result;
    }
  }

  events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: amount } });

  return { state: nextState, events, succeeded: true };
}

export function executeAddDonFromDeck(
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
  const targetState = (params.target_state as "ACTIVE" | "RESTED") ?? "ACTIVE";

  const p = state.players[controller];
  const count = Math.min(amount, p.donDeck.length);
  if (count === 0) return { state, events, succeeded: false };

  const added = p.donDeck.slice(0, count).map((d) => ({
    ...d,
    state: targetState,
    attachedTo: null,
  }));
  const newDonDeck = p.donDeck.slice(count);
  const newDonCostArea = [...p.donCostArea, ...added];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, donDeck: newDonDeck, donCostArea: newDonCostArea };

  events.push({ type: "DON_PLACED_ON_FIELD", playerIndex: controller, payload: { count } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeForceOpponentDonReturn(
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
  const opp = controller === 0 ? 1 : 0;
  const p = state.players[opp];
  const count = Math.min(amount, p.donCostArea.length);
  if (count === 0) return { state, events, succeeded: false };

  const toReturn = p.donCostArea.slice(0, count);
  const newDonCostArea = p.donCostArea.slice(count);
  const newDonDeck = [...p.donDeck, ...toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }))];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[opp] = { ...p, donCostArea: newDonCostArea, donDeck: newDonDeck };

  events.push({ type: "DON_DETACHED", playerIndex: opp as 0 | 1, payload: { count } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeSetDonActive(
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
  const restedDon = p.donCostArea.filter((d) => d.state === "RESTED");
  const count = Math.min(amount, restedDon.length);
  if (count === 0) return { state, events, succeeded: false };

  let activated = 0;
  const newDonCostArea = p.donCostArea.map((d) => {
    if (d.state === "RESTED" && activated < count) {
      activated++;
      return { ...d, state: "ACTIVE" as const };
    }
    return d;
  });

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, donCostArea: newDonCostArea };

  events.push({ type: "DON_SET_ACTIVE", playerIndex: controller, payload: { count: activated } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: [], count: activated },
  };
}

export function executeRestOpponentDon(
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
  const opp = controller === 0 ? 1 : 0;
  const p = state.players[opp];
  const activeDon = p.donCostArea.filter((d) => d.state === "ACTIVE");
  const count = Math.min(amount, activeDon.length);
  if (count === 0) return { state, events, succeeded: false };

  let rested = 0;
  const newDonCostArea = p.donCostArea.map((d) => {
    if (d.state === "ACTIVE" && rested < count) {
      rested++;
      return { ...d, state: "RESTED" as const };
    }
    return d;
  });

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[opp] = { ...p, donCostArea: newDonCostArea };

  events.push({ type: "DON_RESTED", playerIndex: opp as 0 | 1, payload: { count } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeReturnDonToDeck(
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
  const unattached = p.donCostArea.filter((d) => !d.attachedTo);
  const count = Math.min(amount, unattached.length);
  if (count === 0) return { state, events, succeeded: false };

  // Prefer rested DON!! first
  const sorted = [...unattached].sort((a, b) => {
    if (a.state === "RESTED" && b.state !== "RESTED") return -1;
    if (a.state !== "RESTED" && b.state === "RESTED") return 1;
    return 0;
  });
  const toReturn = sorted.slice(0, count);
  const toReturnIds = new Set(toReturn.map((d) => d.instanceId));

  const remaining = p.donCostArea.filter((d) => !toReturnIds.has(d.instanceId));
  const returned = toReturn.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, donCostArea: remaining, donDeck: [...p.donDeck, ...returned] };

  events.push({ type: "DON_DETACHED", playerIndex: controller, payload: { count } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}
