/**
 * Action handlers: GIVE_DON, ADD_DON_FROM_DECK, FORCE_OPPONENT_DON_RETURN,
 * SET_DON_ACTIVE, REST_OPPONENT_DON, RETURN_DON_TO_DECK,
 * REST_DON, DISTRIBUTE_DON, REDISTRIBUTE_DON, GIVE_OPPONENT_DON_TO_OPPONENT
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { attachDonToCard, detachOneDon, reattachDon } from "../card-mutations.js";
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
  const donState = (params.don_state as "ACTIVE" | "RESTED") ?? "ACTIVE";
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  for (const targetId of targetIds) {
    for (let i = 0; i < amount; i++) {
      const result = attachDonToCard(nextState, controller, targetId, donState);
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

// ─── REST_DON ────────────────────────────────────────────────────────────────

export function executeRestDon(
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
  newPlayers[controller] = { ...p, donCostArea: newDonCostArea };

  events.push({ type: "DON_RESTED", playerIndex: controller, payload: { count } });

  return { state: { ...state, players: newPlayers }, events, succeeded: true, result: { targetInstanceIds: [], count } };
}

// ─── DISTRIBUTE_DON ──────────────────────────────────────────────────────────

export function executeDistributeDon(
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
  const amountPerTarget = (params.amount_per_target as number) ?? (params.amount as number) ?? 1;
  const donState = (params.don_state as "ACTIVE" | "RESTED") ?? "ACTIVE";

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  let totalGiven = 0;
  for (const targetId of targetIds) {
    for (let i = 0; i < amountPerTarget; i++) {
      const result = attachDonToCard(nextState, controller, targetId, donState);
      if (!result) break;
      nextState = result;
      totalGiven++;
    }
  }

  if (totalGiven > 0) {
    events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: totalGiven } });
  }

  return { state: nextState, events, succeeded: totalGiven > 0, result: { targetInstanceIds: targetIds, count: totalGiven } };
}

// ─── REDISTRIBUTE_DON ────────────────────────────────────────────────────────

export interface RedistributeTransfer {
  fromCardInstanceId: string;
  donInstanceId: string;
  toCardInstanceId: string;
}

/**
 * Apply a list of already-validated DON transfers (detach from source,
 * reattach to target) for a redistribute effect. Invalid transfers are
 * skipped; the returned count reflects actual transfers applied.
 */
export function applyRedistributeDonTransfers(
  state: GameState,
  transfers: RedistributeTransfer[],
  controller: 0 | 1,
): ActionResult {
  const events: PendingEvent[] = [];
  let nextState = state;
  let moved = 0;

  for (const t of transfers) {
    const detached = detachOneDon(nextState, controller, t.donInstanceId, t.fromCardInstanceId);
    if (!detached) continue;
    const reattached = reattachDon(detached.state, controller, detached.detachedDon, t.toCardInstanceId);
    if (!reattached) continue;
    nextState = reattached;
    moved++;
  }

  if (moved > 0) {
    events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: moved } });
  }

  const targetInstanceIds = Array.from(new Set(transfers.map((t) => t.toCardInstanceId)));
  return { state: nextState, events, succeeded: moved > 0, result: { targetInstanceIds, count: moved } };
}

export function executeRedistributeDon(
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

  // If resume is handing us preselectedTargets, this handler should not run —
  // resume.ts applies the transfers directly via applyRedistributeDonTransfers.
  // Defensive: treat as no-op.
  if (preselectedTargets && preselectedTargets.length > 0) {
    return { state, events, succeeded: false };
  }

  // Compute valid recipient cards per the action's target filter.
  const validTargetIds = computeAllValidTargets(
    state,
    action.target,
    controller,
    cardDb,
    sourceCardInstanceId,
    resultRefs,
  );

  // Valid sources: controller's leader + characters that currently have DON attached.
  const p = state.players[controller];
  const validSourceIds: string[] = [];
  if (p.leader.attachedDon.length > 0) validSourceIds.push(p.leader.instanceId);
  for (const c of p.characters) {
    if (c && c.attachedDon.length > 0) validSourceIds.push(c.instanceId);
  }

  // Nothing to move — fail softly.
  if (validSourceIds.length === 0 || validTargetIds.length === 0) {
    return { state, events, succeeded: false };
  }

  const sourceCard = state.players[controller].characters.find((c) => c?.instanceId === sourceCardInstanceId)
    ?? (state.players[controller].leader.instanceId === sourceCardInstanceId ? state.players[controller].leader : null);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets: validTargetIds,
  };

  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "REDISTRIBUTE_DON",
      validSourceCardIds: validSourceIds,
      validTargetCardIds: validTargetIds,
      maxTransfers: amount,
      effectDescription,
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}

// ─── GIVE_OPPONENT_DON_TO_OPPONENT ───────────────────────────────────────────

export function executeGiveOpponentDonToOpponent(
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
  const opp = (controller === 0 ? 1 : 0) as 0 | 1;

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  // Take rested DON from opponent's cost area and attach to opponent's character
  let nextState = state;
  let given = 0;
  for (const targetId of targetIds) {
    for (let i = 0; i < amount; i++) {
      const oppPlayer = nextState.players[opp];
      const restedIdx = oppPlayer.donCostArea.findIndex((d) => d.state === "RESTED" && !d.attachedTo);
      if (restedIdx === -1) break;

      const donCard = oppPlayer.donCostArea[restedIdx];
      const newDonCostArea = oppPlayer.donCostArea.filter((_, idx) => idx !== restedIdx);
      const attachedDon = { ...donCard, attachedTo: targetId };

      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      const targetPlayer = newPlayers[opp];
      const charIdx = targetPlayer.characters.findIndex((c) => c?.instanceId === targetId);
      if (charIdx !== -1) {
        const char = targetPlayer.characters[charIdx]!;
        const newChars = [...targetPlayer.characters] as (typeof targetPlayer.characters);
        newChars[charIdx] = { ...char, attachedDon: [...char.attachedDon, attachedDon] };
        newPlayers[opp] = { ...targetPlayer, characters: newChars, donCostArea: newDonCostArea };
      } else if (targetPlayer.leader?.instanceId === targetId) {
        const newLeader = { ...targetPlayer.leader, attachedDon: [...targetPlayer.leader.attachedDon, attachedDon] };
        newPlayers[opp] = { ...targetPlayer, leader: newLeader, donCostArea: newDonCostArea };
      } else {
        break;
      }
      nextState = { ...nextState, players: newPlayers };
      given++;
    }
  }

  if (given > 0) {
    events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: opp, payload: { count: given } });
  }

  return { state: nextState, events, succeeded: given > 0, result: { targetInstanceIds: targetIds, count: given } };
}
