/**
 * Action handlers: GIVE_DON, ADD_DON_FROM_DECK, FORCE_OPPONENT_DON_RETURN,
 * SET_DON_ACTIVE, REST_OPPONENT_DON, RETURN_DON_TO_DECK,
 * REST_DON, DISTRIBUTE_DON, REDISTRIBUTE_DON, GIVE_OPPONENT_DON_TO_OPPONENT
 */

import type { ActionOf, EffectResult } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  PendingEvent,
  PendingPromptState,
  ResumeContext,
} from "../../../types.js";
import type { ActionResult } from "../types.js";
import {
  attachDonToCard,
  detachOneDon,
  reattachDon,
} from "../card-mutations.js";
import {
  computeAllValidTargets,
  autoSelectTargets,
  needsPlayerTargetSelection,
  buildSelectTargetPrompt,
} from "../target-resolver.js";
import { resolveAmount } from "../action-utils.js";

export function executeGiveDon(
  state: GameState,
  action: ActionOf<"GIVE_DON">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const donState = params.don_state ?? "ACTIVE";
  const allValidIds =
    preselectedTargets ??
    computeAllValidTargets(
      state,
      action.target,
      controller,
      cardDb,
      sourceCardInstanceId,
      resultRefs
    );
  if (
    !preselectedTargets &&
    needsPlayerTargetSelection(action.target, allValidIds)
  ) {
    return buildSelectTargetPrompt(
      state,
      action,
      allValidIds,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs
    );
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
  action: ActionOf<"ADD_DON_FROM_DECK">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = resolveAmount(params.amount ?? 1, _resultRefs, state, controller, _cardDb);
  const targetState = params.target_state ?? "ACTIVE";

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

/**
 * A concrete plan for a forced DON!! return: how many active/rested DON!! come
 * from the cost area, plus how many attached DON!! detach from each named card.
 * The three sources are the whole field per Comprehensive Rules 3-1-2 / 8-3-1-6.
 */
export interface FieldDonReturnPlan {
  costActive: number;
  costRested: number;
  attached: { cardInstanceId: string; count: number }[];
}

/**
 * Encode a plan as a PLAYER_CHOICE id. Cost-area-only plans keep the historical
 * three-part `don-return:<costActive>:<count>` shape (nanoid instance ids never
 * contain `:`, `,` or `=`, so the extra segments below stay unambiguous). Plans
 * that detach attached DON!! append a fourth `card=n,card=n` segment.
 */
export function encodeFieldDonReturnChoice(plan: FieldDonReturnPlan, count: number): string {
  const attached = plan.attached.filter((a) => a.count > 0);
  if (attached.length === 0) return `don-return:${plan.costActive}:${count}`;
  const spec = attached.map((a) => `${a.cardInstanceId}=${a.count}`).join(",");
  return `don-return:${plan.costActive}:${count}:${spec}`;
}

/**
 * Parse a `don-return:` choice id back into a plan + total count. Returns null
 * for malformed ids (stale-modal / tampering defense). `costRested` is derived:
 * count − costActive − attachedTotal.
 */
export function decodeFieldDonReturnChoice(
  id: string,
): { plan: FieldDonReturnPlan; count: number } | null {
  const parts = id.split(":");
  if (parts[0] !== "don-return") return null;

  const costActive = parseInt(parts[1], 10);
  const count = parseInt(parts[2], 10);
  if (!Number.isFinite(costActive) || !Number.isFinite(count) || costActive < 0 || count < 0) {
    return null;
  }

  let attached: { cardInstanceId: string; count: number }[] = [];
  if (parts.length === 4) {
    for (const entry of parts[3].split(",")) {
      const [cardInstanceId, nRaw] = entry.split("=");
      const n = parseInt(nRaw, 10);
      if (!cardInstanceId || !Number.isFinite(n) || n <= 0) return null;
      attached.push({ cardInstanceId, count: n });
    }
  } else if (parts.length !== 3) {
    return null;
  }

  const attachedTotal = attached.reduce((s, a) => s + a.count, 0);
  const costRested = count - costActive - attachedTotal;
  if (costRested < 0) return null;

  return { plan: { costActive, costRested, attached }, count };
}

/**
 * Apply a validated forced-DON!! return for `playerIndex`: pull the chosen
 * active/rested DON!! from the cost area and detach the chosen attached DON!!
 * from the named Leader/Character. Every returned DON!! goes back to the DON!!
 * deck ACTIVE and unattached, matching how DON_MINUS returns field DON!!.
 */
export function applyFieldDonReturn(
  state: GameState,
  playerIndex: 0 | 1,
  plan: FieldDonReturnPlan,
): { state: GameState; events: PendingEvent[]; returned: number } {
  const events: PendingEvent[] = [];
  const p = state.players[playerIndex];

  const fromCostActive = p.donCostArea.filter((d) => d.state === "ACTIVE").slice(0, plan.costActive);
  const fromCostRested = p.donCostArea.filter((d) => d.state === "RESTED").slice(0, plan.costRested);
  const returnedCostIds = new Set([...fromCostActive, ...fromCostRested].map((d) => d.instanceId));
  const newDonCostArea = p.donCostArea.filter((d) => !returnedCostIds.has(d.instanceId));

  const returned = [...fromCostActive, ...fromCostRested].map(
    (d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }),
  );

  // Detach the chosen attached DON!! from each named card.
  let newLeader = p.leader;
  const newCharacters = [...p.characters] as typeof p.characters;
  for (const { cardInstanceId, count } of plan.attached) {
    if (count <= 0) continue;
    if (newLeader.instanceId === cardInstanceId) {
      const take = newLeader.attachedDon.slice(0, count);
      returned.push(...take.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null })));
      newLeader = { ...newLeader, attachedDon: newLeader.attachedDon.slice(take.length) };
      continue;
    }
    const charIdx = newCharacters.findIndex((c) => c?.instanceId === cardInstanceId);
    if (charIdx !== -1 && newCharacters[charIdx]) {
      const char = newCharacters[charIdx]!;
      const take = char.attachedDon.slice(0, count);
      returned.push(...take.map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null })));
      newCharacters[charIdx] = { ...char, attachedDon: char.attachedDon.slice(take.length) };
    }
  }

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[playerIndex] = {
    ...p,
    leader: newLeader,
    characters: newCharacters,
    donCostArea: newDonCostArea,
    donDeck: [...p.donDeck, ...returned],
  };

  events.push({ type: "DON_DETACHED", playerIndex, payload: { count: returned.length } });
  return { state: { ...state, players: newPlayers }, events, returned: returned.length };
}

/** Cards whose attached DON!! can be returned, in a stable order (Leader first). */
function attachedDonSources(
  p: GameState["players"][0],
): { cardInstanceId: string; cap: number }[] {
  const sources: { cardInstanceId: string; cap: number }[] = [];
  if (p.leader.attachedDon.length > 0) {
    sources.push({ cardInstanceId: p.leader.instanceId, cap: p.leader.attachedDon.length });
  }
  for (const c of p.characters) {
    if (c && c.attachedDon.length > 0) {
      sources.push({ cardInstanceId: c.instanceId, cap: c.attachedDon.length });
    }
  }
  return sources;
}

/**
 * Enumerate every distinct way to draw exactly `count` DON!! across the ordered
 * buckets (cost-area active, cost-area rested, then one bucket per card with
 * attached DON!!), respecting each bucket's capacity. Each result is one
 * genuinely different game outcome and becomes one PLAYER_CHOICE option.
 */
function enumerateDonReturnPlans(
  activeAvail: number,
  restedAvail: number,
  attachedSources: { cardInstanceId: string; cap: number }[],
  count: number,
): FieldDonReturnPlan[] {
  const caps = [activeAvail, restedAvail, ...attachedSources.map((s) => s.cap)];
  const suffixCap: number[] = new Array(caps.length + 1).fill(0);
  for (let i = caps.length - 1; i >= 0; i--) suffixCap[i] = suffixCap[i + 1] + caps[i];

  const plans: FieldDonReturnPlan[] = [];
  const picks: number[] = new Array(caps.length).fill(0);

  const recurse = (i: number, remaining: number): void => {
    if (i === caps.length) {
      if (remaining === 0) {
        plans.push({
          costActive: picks[0],
          costRested: picks[1],
          attached: attachedSources.map((s, j) => ({ cardInstanceId: s.cardInstanceId, count: picks[2 + j] })),
        });
      }
      return;
    }
    const lo = Math.max(0, remaining - suffixCap[i + 1]);
    const hi = Math.min(caps[i], remaining);
    for (let n = lo; n <= hi; n++) {
      picks[i] = n;
      recurse(i + 1, remaining - n);
    }
  };
  recurse(0, count);
  return plans;
}

export function executeForceOpponentDonReturn(
  state: GameState,
  action: ActionOf<"FORCE_OPPONENT_DON_RETURN">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const opp: 0 | 1 = controller === 0 ? 1 : 0;
  const p = state.players[opp];

  // OPT-426: the returnable pool is the whole field — cost area + DON!! attached
  // to the Leader and Characters (Comprehensive Rules 3-1-2 / 8-3-1-6). Ignoring
  // attached DON!! made mandatory effects like OP16-074 Magellan silently no-op
  // when the opponent's cost area was empty.
  const activeAvail = p.donCostArea.filter((d) => d.state === "ACTIVE").length;
  const restedAvail = p.donCostArea.length - activeAvail;
  const attachedSources = attachedDonSources(p);
  const attachedTotal = attachedSources.reduce((s, a) => s + a.cap, 0);
  const fieldTotal = p.donCostArea.length + attachedTotal;

  const count = Math.min(amount, fieldTotal);
  if (count === 0) return { state, events, succeeded: false };

  const plans = enumerateDonReturnPlans(activeAvail, restedAvail, attachedSources, count);

  // No genuine choice (single distribution) — apply directly. OP16-074 Magellan
  // FAQ: the DON!! owner chooses which DON!! return, so any real choice prompts.
  if (plans.length <= 1) {
    const applied = applyFieldDonReturn(state, opp, plans[0]);
    return { state: applied.state, events: [...events, ...applied.events], succeeded: true };
  }

  const cardLabel = (instanceId: string): string => {
    if (p.leader.instanceId === instanceId) {
      const name = cardDb.get(p.leader.cardId)?.name || "Leader";
      return `${name} (Leader)`;
    }
    const characterIndex = p.characters.findIndex((c) => c?.instanceId === instanceId);
    const character = characterIndex >= 0 ? p.characters[characterIndex] : null;
    const name = (character && cardDb.get(character.cardId)?.name) || "Character";
    return `${name} (Character ${characterIndex + 1})`;
  };

  const choices = plans.map((plan) => {
    const parts: string[] = [];
    if (plan.costActive > 0) parts.push(`${plan.costActive} active`);
    if (plan.costRested > 0) parts.push(`${plan.costRested} rested`);
    for (const a of plan.attached) {
      if (a.count > 0) parts.push(`${a.count} from ${cardLabel(a.cardInstanceId)}`);
    }
    return { id: encodeFieldDonReturnChoice(plan, count), label: `Return ${parts.join(" + ")} DON!!` };
  });

  const donReturnSources = [
    ...(activeAvail > 0
      ? [{ id: "cost-active", label: "Active DON!! in cost area", max: activeAvail, kind: "COST_ACTIVE" as const }]
      : []),
    ...(restedAvail > 0
      ? [{ id: "cost-rested", label: "Rested DON!! in cost area", max: restedAvail, kind: "COST_RESTED" as const }]
      : []),
    ...attachedSources.map((source) => ({
      id: source.cardInstanceId,
      label: cardLabel(source.cardInstanceId),
      max: source.cap,
      kind: "ATTACHED" as const,
    })),
  ];

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()],
    validTargets: choices.map((c) => c.id),
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "PLAYER_CHOICE",
      effectDescription: `Choose which DON!! to return to your DON!! deck (${count})`,
      choices,
      donReturn: { count, sources: donReturnSources },
    },
    respondingPlayer: opp,
    resumeContext: resumeCtx,
  };
  return { state, events, succeeded: false, pendingPrompt };
}

export function executeSetDonActive(
  state: GameState,
  action: ActionOf<"SET_DON_ACTIVE">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = resolveAmount(params.amount ?? 1, _resultRefs, state, controller, _cardDb);
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
  action: ActionOf<"REST_OPPONENT_DON">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const opp: 0 | 1 = controller === 0 ? 1 : 0;
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

  events.push({ type: "DON_RESTED", playerIndex: opp, payload: { count } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeReturnDonToDeck(
  state: GameState,
  action: ActionOf<"RETURN_DON_TO_DECK">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = resolveAmount(
    params.amount ?? 1,
    resultRefs,
    state,
    controller,
    cardDb,
  );
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
  action: ActionOf<"REST_DON">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
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
  action: ActionOf<"DISTRIBUTE_DON">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amountPerTarget = params.amount_per_target ?? params.amount ?? 1;
  const donState = params.don_state ?? "ACTIVE";

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
  action: ActionOf<"REDISTRIBUTE_DON">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;

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
    resultRefs: [...resultRefs.entries()],
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

/**
 * OPT-226: pull DON from opponent's cost area and attach it to an
 * opponent's Leader/Character — OP-15 Enel/God archetype "give 1 of
 * your opponent's DON!! to their Character" flow.
 *
 * Honors `params.source_filter.is_rested` / `.is_active` so cards like
 * OP15-023 Arlong and OP15-028 Meowban Brothers — which the FAQ says
 * may pull ACTIVE or RESTED DON alike — can encode the permissive variant.
 * When no source filter is present the default is RESTED (matching the
 * most common OP-15 text "give up to 1 rested DON!!").
 */
export function executeGiveOpponentDonToOpponent(
  state: GameState,
  action: ActionOf<"GIVE_OPPONENT_DON_TO_OPPONENT">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const opp: 0 | 1 = controller === 0 ? 1 : 0;

  const sourceFilter = params.source_filter;
  const matchesSource = (d: {
    state: "ACTIVE" | "RESTED";
    attachedTo: string | null;
  }): boolean => {
    if (d.attachedTo) return false;
    if (!sourceFilter) return d.state === "RESTED"; // historical default
    if (sourceFilter.is_rested === true && d.state !== "RESTED") return false;
    if (sourceFilter.is_rested === false && d.state === "RESTED") return false;
    if (sourceFilter.is_active === true && d.state !== "ACTIVE") return false;
    if (sourceFilter.is_active === false && d.state === "ACTIVE") return false;
    return true;
  };

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  let given = 0;
  for (const targetId of targetIds) {
    for (let i = 0; i < amount; i++) {
      const oppPlayer = nextState.players[opp];
      const donIdx = oppPlayer.donCostArea.findIndex(matchesSource);
      if (donIdx === -1) break;

      const donCard = oppPlayer.donCostArea[donIdx];
      const newDonCostArea = oppPlayer.donCostArea.filter((_, idx) => idx !== donIdx);
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
