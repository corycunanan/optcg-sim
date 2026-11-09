import { hasNativeCostSemantics } from "../../native-cost-semantics.js";
import { buildDonIdentityPlans } from "../don-identity-plans.js";
/**
 * Action handlers: GIVE_DON, ADD_DON_FROM_DECK, FORCE_OPPONENT_DON_RETURN,
 * SET_DON_ACTIVE, REST_OPPONENT_DON, RETURN_DON_TO_DECK,
 * REST_DON, DISTRIBUTE_DON, REDISTRIBUTE_DON, GIVE_OPPONENT_DON_TO_OPPONENT
 */

import type { ActionOf, DynamicValue, EffectResult } from "../../effect-types.js";
import type {
  CardData,
  CardInstance,
  DonDistributionProgress,
  DonInstance,
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
import { promptEffectDescription, resolveAmount, tryResolveAmount } from "../action-utils.js";
import { donIdentityChoiceMatters } from "../cost/targets.js";
import { effectSourceIdentity } from "../../effect-source.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "../../effect-types.js";
import { isDonActivationProhibitedByEffect, isDonAttachProhibited } from "../../prohibitions.js";
import { findCardInstance } from "../../state.js";

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
  // OPT-869: a card covered by an active CANNOT_ATTACH_DON prohibition is
  // never a recipient — neither offered nor accepted from a resumed
  // (preselected) reply, which is re-checked against the current state.
  const allValidIds = (
    preselectedTargets ??
    computeAllValidTargets(
      state,
      action.target,
      controller,
      cardDb,
      sourceCardInstanceId,
      resultRefs
    )
  ).filter((id) => !isDonAttachProhibited(state, id, cardDb, controller));
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

  // OPT-868: giving 1 of the OPPONENT's DON!! (OP15-003/010/012/017/023
  // "give up to 1 ... DON!! card to its owner's Leader or 1 of their
  // Characters" aimed at the opponent's side) — the activating player chooses
  // which of the opponent's DON!! is given (faq_op15-eb04.md). Only when those
  // DON!! differ in the effects applied to them (rule 3-1-6-1) is it a real
  // choice; interchangeable DON!! and own-DON!! gives stay prompt-free.
  if (amount === 1 && targetIds.length === 1) {
    const recipient = targetIds[0];
    const owner = fieldSideOf(state, recipient);
    if (owner !== null && owner !== controller) {
      const pool = giveableDon(state, owner, donState);
      if (donIdentityChoiceMatters(state, pool)) {
        return buildGiveDonIdentityPrompt(
          state, action, owner, recipient, pool.map((d) => d.instanceId), 1,
          sourceCardInstanceId, controller, cardDb, resultRefs,
        );
      }
    }
  }

  let nextState = state;
  let given = 0;
  for (const targetId of targetIds) {
    for (let i = 0; i < amount; i++) {
      const result = attachDonToCard(nextState, controller, targetId, donState);
      if (!result) break;
      nextState = result;
      given++;
    }
  }

  // A give with no DON!! in the requested state moves nothing, so it must not
  // fire "when DON!! is given" watchers such as OP02-002 Garp.
  if (given > 0) {
    events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: given } });
  }

  return { state: nextState, events, succeeded: true };
}

/**
 * OPT-868 legacy form: a GIVE_DON identity frame persisted before OPT-861
 * bound the recipient and owner as this marker in validTargets. New prompts
 * carry `ResumeContext.giveDonIdentity` instead (a distinct continuation
 * marker, so the step is never mistaken for a re-prompt of the recipient
 * choice); the parser keeps already-saved sessions resumable.
 */
export const GIVE_DON_IDENTITY_PREFIX = "give-don-identity:";

export function parseGiveDonIdentityMarker(
  validTargets: readonly string[],
): { marker: string; owner: 0 | 1; recipient: string } | null {
  const marker = validTargets.find((id) => id.startsWith(GIVE_DON_IDENTITY_PREFIX));
  if (!marker) return null;
  const rest = marker.slice(GIVE_DON_IDENTITY_PREFIX.length);
  const owner = rest[0] === "0" ? 0 : rest[0] === "1" ? 1 : null;
  if (owner === null || rest[1] !== ":" || rest.length < 3) return null;
  return { marker, owner, recipient: rest.slice(2) };
}

/** Player index whose Leader/Character area holds `instanceId`, else null. */
export function fieldSideOf(state: GameState, instanceId: string): 0 | 1 | null {
  for (const pi of [0, 1] as const) {
    const p = state.players[pi];
    if (p.leader.instanceId === instanceId) return pi;
    if (p.characters.some((c) => c?.instanceId === instanceId)) return pi;
  }
  return null;
}

/** Unattached cost-area DON!! of `owner` in `donState` — what a give may use. */
export function giveableDon(state: GameState, owner: 0 | 1, donState: "ACTIVE" | "RESTED") {
  return state.players[owner].donCostArea.filter((d) => d.state === donState && !d.attachedTo);
}

/**
 * OPT-931: the recipients a DON!!-giving effect may use — `candidates` minus
 * any card covered by CANNOT_ATTACH_DON for the giving player. Rule 1-3-3: the
 * prohibition takes precedence over the effect, so the give is not carried
 * out for that card. One predicate (`isDonAttachProhibited`, shared with
 * manual attach) for GIVE_DON, DISTRIBUTE_DON, REDISTRIBUTE_DON and
 * GIVE_OPPONENT_DON_TO_OPPONENT, on both the offer and the resumed reply.
 */
export function donGiveRecipients(
  state: GameState,
  candidates: readonly string[],
  cardDb: Map<string, CardData>,
  givingPlayer: 0 | 1,
): string[] {
  return candidates.filter((id) => !isDonAttachProhibited(state, id, cardDb, givingPlayer));
}

/**
 * The identity step of a give of the OPPONENT's DON!!: the activating player
 * chooses exactly `count` of `donIds` (the eligible pool at offer time) for
 * the recipient bound in `giveDonIdentity`. GIVE_DON (OPT-868) always gives
 * 1; GIVE_OPPONENT_DON_TO_OPPONENT (OPT-932) gives up to its printed amount,
 * so the resume re-derives `count` as min(amount, offered pool).
 */
function buildGiveDonIdentityPrompt(
  state: GameState,
  action: ActionOf<"GIVE_DON"> | ActionOf<"GIVE_OPPONENT_DON_TO_OPPONENT">,
  owner: 0 | 1,
  recipient: string,
  donIds: string[],
  count: number,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const resumeContext: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [], // filled in by executeActionChain / the resume frame
    resultRefs: [...resultRefs.entries()],
    validTargets: donIds,
    giveDonIdentity: { owner, recipient },
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "SELECT_TARGET",
      cards: [],
      validTargets: donIds,
      effectDescription: promptEffectDescription(state, cardDb, sourceCardInstanceId) || "",
      instruction: count === 1
        ? "Choose 1 of your opponent's DON!! cards to give"
        : `Choose ${count} of your opponent's DON!! cards to give`,
      countMin: count,
      countMax: count,
      ctaLabel: "Give DON!!",
    },
    respondingPlayer: controller,
    resumeContext,
  };
  return { state, events: [], succeeded: false, pendingPrompt };
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

/** OPT-969 reader-first identity choice. Existing bucket plans keep their
 * historical meaning; this separate grammar preserves DON-specific effects. */
export function decodeDonReturnIds(choiceId: string): string[] | null {
  if (!choiceId.startsWith("don-return-ids:")) return null;
  try {
    const ids: unknown = JSON.parse(choiceId.slice("don-return-ids:".length));
    return Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === "string") &&
      new Set(ids).size === ids.length ? ids : null;
  } catch { return null; }
}

/** Exact identities, shared by action-choice and cost readers. No prompting,
 * advancement or publication: the existing caller owns those boundaries. */
export function applyDonReturnIds(
  state: GameState,
  owner: 0 | 1,
  ids: readonly string[],
): { state: GameState; events: PendingEvent[]; returned: number } | null {
  const p = state.players[owner];
  const selected = new Set(ids);
  const hosts = [p.leader, ...p.characters.filter((c): c is NonNullable<typeof c> => c !== null)];
  const pool = [...p.donCostArea, ...hosts.flatMap(c => c.attachedDon)];
  if (ids.length === 0 || selected.size !== ids.length || ids.some(id => !pool.some(d => d.instanceId === id))) return null;
  const returned = pool.filter(d => selected.has(d.instanceId)).map(d => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));
  const detach = (card: typeof p.leader) => ({ ...card, attachedDon: card.attachedDon.filter(d => !selected.has(d.instanceId)) });
  const players = [...state.players] as GameState["players"];
  players[owner] = {
    ...p, leader: detach(p.leader), characters: p.characters.map(c => c ? detach(c) : null),
    donCostArea: p.donCostArea.filter(d => !selected.has(d.instanceId)),
    donDeck: [...p.donDeck, ...returned],
  };
  return { state: { ...state, players }, events: [{ type: "DON_DETACHED", playerIndex: owner, payload: { count: ids.length } }], returned: ids.length };
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

  return {
    state,
    events,
    succeeded: false,
    pendingPrompt: buildFieldDonReturnPrompt(
      p, opp, count, plans, activeAvail, restedAvail, attachedSources,
      action, sourceCardInstanceId, controller, cardDb, resultRefs,
    ),
  };
}

/**
 * PLAYER_CHOICE prompt for a field DON!! return with a genuine choice: one
 * option per distinct plan, answered by the DON!! owner (`owner`). Resumed by
 * `handlePlayerChoiceDonReturn` (resume/choice.ts).
 */
function buildFieldDonReturnPrompt(
  p: GameState["players"][0],
  owner: 0 | 1,
  count: number,
  plans: FieldDonReturnPlan[],
  activeAvail: number,
  restedAvail: number,
  attachedSources: { cardInstanceId: string; cap: number }[],
  action: ActionOf<"FORCE_OPPONENT_DON_RETURN"> | ActionOf<"RETURN_DON_TO_DECK">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): PendingPromptState {
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
  return {
    options: {
      promptType: "PLAYER_CHOICE",
      effectDescription: `Choose which DON!! to return to your DON!! deck (${count})`,
      choices,
      donReturn: { count, sources: donReturnSources },
    },
    respondingPlayer: owner,
    resumeContext: resumeCtx,
  };
}

export function executeSetDonActive(
  state: GameState,
  action: ActionOf<"SET_DON_ACTIVE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const source = effectSourceIdentity(state, sourceCardInstanceId, cardDb,
    resultRefs.get(EFFECT_SOURCE_SNAPSHOT_REF)?.sourceIdentity ??
      resultRefs.get(EFFECT_SOURCE_SNAPSHOT_REF)?.sourceCardSnapshot);
  if (isDonActivationProhibitedByEffect(state, controller, source, cardDb)) {
    return { state, events: [], succeeded: false };
  }
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = resolveAmount(params.amount ?? 1, resultRefs, state, controller, cardDb);
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

/**
 * "Return DON!! cards from your field to your DON!! deck until you have N"
 * (OP08-074 Black Maria). N is resolved when the action resolves — for a
 * scheduled end-of-turn return that is the end of turn, not activation. The
 * returnable pool is the controller's whole field (cost area + DON!! attached
 * to the Leader/Characters, Rules 3-1-2 / 8-3-1-6), and the controller picks
 * which DON!! go back when more than one distribution exists. At or below N,
 * nothing is returned. An unresolvable N returns nothing (fails closed).
 */
function returnDonUntilCount(
  state: GameState,
  action: ActionOf<"RETURN_DON_TO_DECK">,
  untilCount: number | DynamicValue,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const target = tryResolveAmount(untilCount, resultRefs, state, controller, cardDb);
  if (target === null) return { state, events, succeeded: false };

  const p = state.players[controller];
  const activeAvail = p.donCostArea.filter((d) => d.state === "ACTIVE").length;
  const restedAvail = p.donCostArea.length - activeAvail;
  const attachedSources = attachedDonSources(p);
  const fieldTotal = p.donCostArea.length + attachedSources.reduce((s, a) => s + a.cap, 0);

  const count = Math.max(0, fieldTotal - target);
  if (count === 0) return { state, events, succeeded: false };

  const plans = enumerateDonReturnPlans(activeAvail, restedAvail, attachedSources, count);
  if (plans.length <= 1) {
    const applied = applyFieldDonReturn(state, controller, plans[0]);
    return {
      state: applied.state,
      events: applied.events,
      succeeded: true,
      result: { targetInstanceIds: [], count: applied.returned },
    };
  }

  return {
    state,
    events,
    succeeded: false,
    pendingPrompt: buildFieldDonReturnPrompt(
      p, controller, count, plans, activeAvail, restedAvail, attachedSources,
      action, sourceCardInstanceId, controller, cardDb, resultRefs,
    ),
  };
}

export function executeReturnDonToDeck(
  state: GameState,
  action: ActionOf<"RETURN_DON_TO_DECK">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  if (params.until_count !== undefined) {
    return returnDonUntilCount(state, action, params.until_count, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  if (hasNativeCostSemantics(state)) {
    const amount = resolveAmount(params.amount ?? 1, resultRefs, state, controller, cardDb);
    const owner: 0 | 1 = action.target?.controller === "OPPONENT" ? controller === 0 ? 1 : 0 : controller;
    const p = state.players[owner];
    const filter = action.target?.filter;
    // Match the shared target-state contract: positive flags and exact state
    // intersect; false flags add no restriction. State-restricted returns use
    // unattached cost-area DON!!, as the active-only domain already did.
    const stateRestricted = filter?.is_active === true || filter?.is_rested === true || !!filter?.state;
    const pool = [...p.donCostArea.filter(d => !d.attachedTo
      && (filter?.is_active !== true || d.state === "ACTIVE")
      && (filter?.is_rested !== true || d.state === "RESTED")
      && (!filter?.state || d.state === filter.state)), ...(action.target?.type === "DON_IN_COST_AREA" || stateRestricted ? [] : [p.leader, ...p.characters.filter(c => c !== null)].flatMap(c => c.attachedDon))];
    const count = Math.min(amount, pool.length);
    if (count <= 0) return { state, events, succeeded: false, fullyExecuted: false };
    const plan = buildDonIdentityPlans(state, owner, pool.map(d => d.instanceId), count, count, cardDb);
    if (plan.choices.length === 1) {
      const applied = applyDonReturnIds(state, owner, decodeDonReturnIds(plan.choices[0].id)!)!;
      return { ...applied, succeeded: true, fullyExecuted: count === amount, result: { targetInstanceIds: [], count } };
    }
    return { state, events, succeeded: false, pendingPrompt: {
      options: { promptType: "PLAYER_CHOICE", effectDescription: `Choose which ${count} DON!! to return`, ...plan },
      respondingPlayer: owner,
      resumeContext: { effectSourceInstanceId: sourceCardInstanceId, controller, pausedAction: action, remainingActions: [], resultRefs: [...resultRefs], validTargets: plan.choices.map(c => c.id) },
    } };
  }
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

  return { state: { ...state, players: newPlayers }, events, fullyExecuted: count === amount, succeeded: true, result: { targetInstanceIds: [], count } };
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

  // OPT-931: rule 1-3-3 — a CANNOT_ATTACH_DON prohibition takes precedence
  // over "give DON!! to each", exactly as for GIVE_DON: a prohibited card is
  // neither offered nor accepted from a resumed (preselected) reply.
  // OPT-955: a split with nothing to give asks nothing, not even recipients.
  if (
    params.max_per_target !== undefined &&
    donSplitRemaining(state, action, controller, { round: 1, allocation: [] }) === 0
  ) {
    return { state, events, succeeded: false };
  }
  const allValidIds = donGiveRecipients(
    state,
    preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs),
    cardDb,
    controller,
  );
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  // OPT-955: "up to N to each" — the controller chooses the split.
  if (params.max_per_target !== undefined) {
    return continueDonSplit(
      state, action, { round: 1, allocation: targetIds.map((id) => [id, 0]) },
      sourceCardInstanceId, controller, cardDb, resultRefs,
    );
  }

  let nextState = state;
  let totalGiven = 0;
  const recipients: string[] = [];
  for (const targetId of targetIds) {
    let given = 0;
    for (let i = 0; i < amountPerTarget; i++) {
      const result = attachDonToCard(nextState, controller, targetId, donState);
      if (!result) break;
      nextState = result;
      given++;
    }
    // OPT-955: the result names only recipients that received DON!!.
    if (given > 0) recipients.push(targetId);
    totalGiven += given;
  }

  if (totalGiven > 0) {
    events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: totalGiven } });
  }

  return { state: nextState, events, succeeded: totalGiven > 0, result: { targetInstanceIds: recipients, count: totalGiven } };
}

// ─── DISTRIBUTE_DON split (OPT-955) ──────────────────────────────────────────

/**
 * DON!! the split may still hand out: the unattached cost-area DON!! in the
 * action's state, capped by `max_total`, minus what is already planned.
 */
function donSplitRemaining(
  state: GameState,
  action: ActionOf<"DISTRIBUTE_DON">,
  controller: 0 | 1,
  progress: DonDistributionProgress,
): number {
  const params = action.params ?? {};
  const pool = giveableDon(state, controller, params.don_state ?? "ACTIVE").length;
  const budget = Math.min(pool, params.max_total ?? Infinity);
  const planned = progress.allocation.reduce((sum, [, n]) => sum + n, 0);
  return Math.max(0, budget - planned);
}

/**
 * The recipients round `progress.round` offers: those holding round-1 DON!!
 * from this split, still on the field and not under CANNOT_ATTACH_DON.
 */
function donSplitEligible(
  state: GameState,
  progress: DonDistributionProgress,
  cardDb: Map<string, CardData>,
  controller: 0 | 1,
): string[] {
  const candidates = progress.allocation
    .filter(([id, n]) => n === progress.round - 1 && fieldSideOf(state, id) !== null)
    .map(([id]) => id);
  return donGiveRecipients(state, candidates, cardDb, controller);
}

/**
 * Ask the next round of a split, or apply it when no round is left: the cap is
 * reached, the pool is spent, or nobody is eligible. Applying attaches every
 * planned DON!! in recipient order and fires one DON_GIVEN_TO_CARD for the
 * batch (BATCH-CONTRACT.md §3, §5).
 */
export function continueDonSplit(
  state: GameState,
  action: ActionOf<"DISTRIBUTE_DON">,
  progress: DonDistributionProgress,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const params = action.params ?? {};
  const maxPerTarget = params.max_per_target ?? 1;
  const remaining = donSplitRemaining(state, action, controller, progress);
  const eligible = progress.round <= maxPerTarget
    ? donSplitEligible(state, progress, cardDb, controller)
    : [];
  const countMax = Math.min(remaining, eligible.length);
  if (countMax > 0) {
    return buildDonSplitPrompt(
      state, action, progress, eligible, countMax, sourceCardInstanceId, controller, cardDb, resultRefs,
    );
  }
  return applyDonSplit(state, action, progress, controller, cardDb);
}

export function applyDonSplit(
  state: GameState,
  action: ActionOf<"DISTRIBUTE_DON">,
  progress: DonDistributionProgress,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): ActionResult {
  const donState = action.params?.don_state ?? "ACTIVE";
  let nextState = state;
  let totalGiven = 0;
  const recipients: string[] = [];
  for (const [id, n] of progress.allocation) {
    // Rule 1-3-3: a prohibition that appeared while the split was asked wins.
    if (n === 0 || isDonAttachProhibited(nextState, id, cardDb, controller)) continue;
    let given = 0;
    for (let i = 0; i < n; i++) {
      const result = attachDonToCard(nextState, controller, id, donState);
      if (!result) break;
      nextState = result;
      given++;
    }
    if (given > 0) recipients.push(id);
    totalGiven += given;
  }
  const events: PendingEvent[] = totalGiven > 0
    ? [{ type: "DON_GIVEN_TO_CARD", playerIndex: controller, payload: { count: totalGiven } }]
    : [];
  return {
    state: nextState,
    events,
    succeeded: totalGiven > 0,
    result: { targetInstanceIds: recipients, count: totalGiven },
  };
}

function buildDonSplitPrompt(
  state: GameState,
  action: ActionOf<"DISTRIBUTE_DON">,
  progress: DonDistributionProgress,
  eligible: string[],
  countMax: number,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const donState = action.params?.don_state ?? "ACTIVE";
  const donLabel = donState === "RESTED" ? "rested DON!!" : "active DON!!";
  const more = progress.round > 1 ? " more" : "";
  const cards: CardInstance[] = [];
  for (const id of eligible) {
    const card = findCardInstance(state, id);
    if (card) cards.push(card);
  }
  const resumeContext: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [], // filled in by executeActionChain / the resume frame
    resultRefs: [...resultRefs.entries()],
    validTargets: eligible,
    donDistribution: progress,
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "SELECT_TARGET",
      cards,
      validTargets: eligible,
      effectDescription: promptEffectDescription(state, cardDb, sourceCardInstanceId) || "",
      instruction: `Choose up to ${countMax} card${countMax === 1 ? "" : "s"} to give 1${more} ${donLabel} each`,
      countMin: 0,
      countMax,
      ctaLabel: "Give DON!!",
    },
    respondingPlayer: controller,
    resumeContext,
  };
  return { state, events: [], succeeded: false, pendingPrompt };
}

/**
 * Apply one round's reply: every pick gains one planned DON!!. An empty reply
 * ends the split. Returns null for a reply the round did not offer.
 */
export function advanceDonSplit(
  progress: DonDistributionProgress,
  offered: readonly string[],
  countMax: number,
  selected: readonly string[],
): DonDistributionProgress | "done" | null {
  if (
    selected.length > countMax ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !offered.includes(id))
  ) {
    return null;
  }
  const picked = new Set(selected);
  const allocation = progress.allocation.map(
    ([id, n]): [string, number] => [id, picked.has(id) ? n + 1 : n],
  );
  return selected.length === 0
    ? "done"
    : { round: progress.round + 1, allocation };
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

  // Compute valid recipient cards per the action's target filter. OPT-931:
  // a card under CANNOT_ATTACH_DON is never a redistribution recipient (rule
  // 1-3-3); the resume re-checks each transfer against the current state.
  const validTargetIds = donGiveRecipients(
    state,
    computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs),
    cardDb,
    controller,
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

  const effectDescription = promptEffectDescription(
    state,
    cardDb,
    sourceCardInstanceId,
  ) || "";

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

type GiveOpponentDonParams = NonNullable<ActionOf<"GIVE_OPPONENT_DON_TO_OPPONENT">["params"]>;

/**
 * The opponent cost-area DON!! a GIVE_OPPONENT_DON_TO_OPPONENT action may give:
 * unattached, honoring `params.source_filter.is_rested` / `.is_active` so cards
 * like OP15-023 Arlong and OP15-028 Meowban Brothers — which the FAQ says may
 * pull ACTIVE or RESTED DON alike — can encode the permissive variant. With no
 * source filter the default is RESTED (the common OP-15 text "give up to 1
 * rested DON!!").
 */
export function giveOpponentDonPool(
  state: GameState,
  owner: 0 | 1,
  params: GiveOpponentDonParams | undefined,
): DonInstance[] {
  const sourceFilter = params?.source_filter;
  return state.players[owner].donCostArea.filter((d) => {
    if (d.attachedTo) return false;
    if (!sourceFilter) return d.state === "RESTED"; // historical default
    if (sourceFilter.is_rested === true && d.state !== "RESTED") return false;
    if (sourceFilter.is_rested === false && d.state === "RESTED") return false;
    if (sourceFilter.is_active === true && d.state !== "ACTIVE") return false;
    if (sourceFilter.is_active === false && d.state === "ACTIVE") return false;
    return true;
  });
}

/**
 * OPT-932: which `count` DON!! of `pool` are given is a real choice only when
 * some are left behind and the pool's DON!! differ — in their state (a
 * permissive source filter may mix ACTIVE and RESTED) or in the effects
 * applied to them (rule 3-1-6-1, `donIdentityChoiceMatters`).
 */
export function giveOpponentDonChoiceMatters(
  state: GameState,
  pool: readonly DonInstance[],
  count: number,
): boolean {
  if (count <= 0 || count >= pool.length) return false;
  if (new Set(pool.map((d) => d.state)).size > 1) return true;
  return donIdentityChoiceMatters(state, pool);
}

/**
 * Attach the given opponent DON!! (by identity, in order) to `recipient` on
 * `owner`'s field, keeping each DON!!'s state. Stops at the first DON!! that
 * is no longer an unattached cost-area DON!! of `owner`.
 */
export function attachOpponentDonById(
  state: GameState,
  owner: 0 | 1,
  recipient: string,
  donIds: readonly string[],
): { state: GameState; given: number } {
  let nextState = state;
  let given = 0;
  for (const donId of donIds) {
    const don = nextState.players[owner].donCostArea.find((d) => d.instanceId === donId && !d.attachedTo);
    if (!don) break;
    const result = attachDonToCard(nextState, owner, recipient, don.state, donId);
    if (!result) break;
    nextState = result;
    given++;
  }
  return { state: nextState, given };
}

/**
 * OPT-226: pull DON from opponent's cost area and attach it to an
 * opponent's Leader/Character — OP-15 Enel/God archetype "give 1 of
 * your opponent's DON!! to their Character" flow.
 *
 * OPT-932: the activating player chooses which of the opponent's DON!! are
 * given (faq_op15-eb04.md), up to the printed amount, whenever that choice
 * matters (`giveOpponentDonChoiceMatters`); interchangeable DON!! stay
 * prompt-free and give in cost-area order.
 *
 * OPT-931: a recipient under CANNOT_ATTACH_DON is never offered or given to
 * (rule 1-3-3), read relative to the activating player as for GIVE_DON.
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

  const allValidIds = donGiveRecipients(
    state,
    preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs),
    cardDb,
    controller,
  );
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  if (targetIds.length === 1 && fieldSideOf(state, targetIds[0]) === opp) {
    const pool = giveOpponentDonPool(state, opp, params);
    const count = Math.min(amount, pool.length);
    if (giveOpponentDonChoiceMatters(state, pool, count)) {
      return buildGiveDonIdentityPrompt(
        state, action, opp, targetIds[0], pool.map((d) => d.instanceId), count,
        sourceCardInstanceId, controller, cardDb, resultRefs,
      );
    }
  }

  let nextState = state;
  let given = 0;
  for (const targetId of targetIds) {
    if (fieldSideOf(nextState, targetId) !== opp) continue;
    const pool = giveOpponentDonPool(nextState, opp, params).slice(0, amount);
    const applied = attachOpponentDonById(nextState, opp, targetId, pool.map((d) => d.instanceId));
    nextState = applied.state;
    given += applied.given;
  }

  if (given > 0) {
    events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: opp, payload: { count: given } });
  }

  return { state: nextState, events, succeeded: given > 0, result: { targetInstanceIds: targetIds, count: given } };
}
