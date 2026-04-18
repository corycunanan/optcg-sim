/**
 * Action handlers: PLAY_CARD, PLAY_SELF, SET_ACTIVE, SET_REST,
 * ACTIVATE_EVENT_FROM_HAND, ACTIVATE_EVENT_FROM_TRASH
 */

import type { Action, EffectBlock, EffectResult, EffectSchema } from "../../effect-types.js";
import type { BatchResumeMarker, CardData, CardInstance, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult, EffectResolverResult } from "../types.js";
import { setCardState } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { findCardInstance } from "../../state.js";
import { nanoid } from "../../../util/nanoid.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { processBatchReplacements } from "../../replacements.js";
import { isProhibitedForCard, isCardPlayProhibitedByEffect } from "../../prohibitions.js";

// Injected by the resolver module to break the circular dependency so
// ACTIVATE_EVENT_FROM_TRASH can resolve the selected Event's [Main] block.
let _resolveEffect: (
  state: GameState,
  block: EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
) => EffectResolverResult;

export function setPlayDependencies(deps: { resolveEffect: typeof _resolveEffect }) {
  _resolveEffect = deps.resolveEffect;
}

function findMainEventBlock(cardData: CardData): EffectBlock | undefined {
  const schema = cardData.effectSchema as EffectSchema | null;
  if (!schema) return undefined;
  return schema.effects.find(
    (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "MAIN_EVENT",
  );
}

// ─── Single-target play frames (OPT-114 macro expansion) ────────────────────
// A multi-target PLAY_CARD conceptually expands to N single-target frames that
// resolve in order. Each frame is self-contained: it removes the card from its
// source zone and places it into the field, or (for CHARACTER on a full board)
// returns a rule 3-7-6-1 overflow prompt.
//
// Commit 1 scope: extract the frame helpers; executePlayCard iterates them.
// Overflow prompt still gated to single-target batches — commits 2/3 extend
// the resume path to continue remaining frames after a prompt resolves.

type FrameResult = {
  state: GameState;
  events: PendingEvent[];
  playedId?: string;
  pendingPrompt?: PendingPromptState;
  failed?: boolean;
};

function removeFromSourceZone(
  player: GameState["players"][0],
  card: CardInstance,
): GameState["players"][0] {
  if (card.zone === "HAND") return { ...player, hand: player.hand.filter((c) => c.instanceId !== card.instanceId) };
  if (card.zone === "TRASH") return { ...player, trash: player.trash.filter((c) => c.instanceId !== card.instanceId) };
  if (card.zone === "DECK") return { ...player, deck: player.deck.filter((c) => c.instanceId !== card.instanceId) };
  return { ...player, hand: player.hand.filter((c) => c.instanceId !== card.instanceId) };
}

function playOneCharacter(
  state: GameState,
  action: Action,
  card: CardInstance,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  entryState: "ACTIVE" | "RESTED",
  resultRefs: Map<string, EffectResult>,
  batchContinuation?: {
    remainingTargetIds: string[];
    remaining: { ACTIVE: number; RESTED: number };
    playedSoFar: string[];
    forcedFirstState?: "ACTIVE" | "RESTED";
  },
): FrameResult {
  const events: PendingEvent[] = [];
  const p0 = state.players[controller];
  const slotIdx = p0.characters.indexOf(null);

  if (slotIdx === -1) {
    // Rule 3-7-6-1: board full — prompt controller to pick one of their own
    // Characters to rule-trash, then resume the play.
    const ownCharIds = p0.characters.filter((c): c is CardInstance => c !== null).map((c) => c.instanceId);
    if (ownCharIds.length === 0) {
      return { state, events, failed: true };
    }
    const cards: CardInstance[] = [];
    for (const cid of ownCharIds) {
      const ci = findCardInstance(state, cid);
      if (ci) cards.push(ci);
    }
    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: sourceCardInstanceId,
      controller,
      pausedAction: action,
      remainingActions: [],
      resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
      validTargets: ownCharIds,
      ruleTrashForPlay: {
        playTargetId: card.instanceId,
        ...(batchContinuation ? { batch: batchContinuation } : {}),
      },
    };
    const pendingPrompt: PendingPromptState = {
      options: {
        promptType: "SELECT_TARGET",
        cards,
        validTargets: ownCharIds,
        effectDescription: "Character area is full. Choose one of your Characters to trash (rule 3-7-6-1).",
        countMin: 1,
        countMax: 1,
        ctaLabel: "Confirm",
      },
      respondingPlayer: controller,
      resumeContext: resumeCtx,
    };
    return { state, events, pendingPrompt };
  }

  const p = removeFromSourceZone(p0, card);
  const newChar: CardInstance = {
    ...card,
    instanceId: nanoid(),
    zone: "CHARACTER",
    state: entryState,
    attachedDon: [],
    turnPlayed: state.turn.number,
    controller,
    owner: controller,
  };
  const newPlayers = [...state.players] as [GameState["players"][0], GameState["players"][1]];
  const newChars = [...p.characters] as (typeof p.characters);
  newChars[slotIdx] = newChar;
  newPlayers[controller] = { ...p, characters: newChars };
  const nextState = { ...state, players: newPlayers };
  events.push({
    type: "CARD_PLAYED",
    playerIndex: controller,
    payload: {
      cardInstanceId: newChar.instanceId,
      cardId: card.cardId,
      zone: "CHARACTER",
      source: "BY_EFFECT",
      playedRested: entryState === "RESTED",
    },
  });
  return { state: nextState, events, playedId: newChar.instanceId };
}

function playOneStage(
  state: GameState,
  card: CardInstance,
  controller: 0 | 1,
): FrameResult {
  const events: PendingEvent[] = [];
  const p = removeFromSourceZone(state.players[controller], card);
  const newStage: CardInstance = {
    ...card,
    instanceId: nanoid(),
    zone: "STAGE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: state.turn.number,
    controller,
    owner: controller,
  };
  let newTrash = p.trash;
  if (p.stage) {
    newTrash = [{ ...p.stage, zone: "TRASH" as const }, ...newTrash];
  }
  const newPlayers = [...state.players] as [GameState["players"][0], GameState["players"][1]];
  newPlayers[controller] = { ...p, stage: newStage, trash: newTrash };
  const nextState = { ...state, players: newPlayers };
  events.push({
    type: "CARD_PLAYED",
    playerIndex: controller,
    payload: { cardInstanceId: newStage.instanceId, cardId: card.cardId, zone: "STAGE", source: "BY_EFFECT" },
  });
  return { state: nextState, events, playedId: newStage.instanceId };
}

export type PlayCardResumeFrame = {
  remainingTargetIds: string[];
  remaining: { ACTIVE: number; RESTED: number };
  playedSoFar: string[];
  // Optional override for the first frame (the PLAYER_CHOICE response).
  // If omitted, the distribution counters pick the state.
  forcedFirstState?: "ACTIVE" | "RESTED";
};

export function executePlayCard(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
  resumeFrame?: PlayCardResumeFrame,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};

  let targetIds: string[];
  if (resumeFrame) {
    targetIds = resumeFrame.remainingTargetIds;
  } else {
    const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
    // OPT-252 (E6): cards with intrinsic CANNOT_BE_PLAYED_BY_EFFECTS (e.g., OP12-036
    // Zoro) are unselectable when an effect tries to play them, regardless of
    // source zone. Filter at target gate so the player isn't prompted with
    // ineligible cards. Manual hand-play (cost-paid PLAY_CARD via execute.ts)
    // bypasses this code path entirely.
    const eligibleIds = allValidIds.filter((id) => !isCardPlayProhibitedByEffect(state, id, cardDb));
    if (!preselectedTargets && needsPlayerTargetSelection(action.target, eligibleIds)) {
      return buildSelectTargetPrompt(state, action, eligibleIds, sourceCardInstanceId, controller, cardDb, resultRefs);
    }
    targetIds = autoSelectTargets(action.target, eligibleIds);
  }
  if (targetIds.length === 0) {
    if (resumeFrame) {
      return {
        state,
        events,
        succeeded: resumeFrame.playedSoFar.length > 0,
        result: { targetInstanceIds: resumeFrame.playedSoFar, count: resumeFrame.playedSoFar.length },
      };
    }
    return { state, events, succeeded: false };
  }

  const entryStateMode = (params.entry_state as "ACTIVE" | "RESTED" | "PLAYER_CHOICE" | undefined) ?? "ACTIVE";
  const isDistributed = entryStateMode === "PLAYER_CHOICE";
  let remaining = resumeFrame?.remaining ?? (() => {
    const sd = (params.state_distribution as { ACTIVE?: number; RESTED?: number } | undefined) ?? {};
    return { ACTIVE: sd.ACTIVE ?? 0, RESTED: sd.RESTED ?? 0 };
  })();

  let nextState = state;
  const playedIds: string[] = [...(resumeFrame?.playedSoFar ?? [])];

  for (let i = 0; i < targetIds.length; i++) {
    const id = targetIds[i];
    const card = findCardInstance(nextState, id);
    if (!card) continue;
    const data = cardDb.get(card.cardId);
    if (!data) continue;

    const cardType = data.type.toUpperCase();
    let frame: FrameResult;
    if (cardType === "CHARACTER") {
      let frameEntryState: "ACTIVE" | "RESTED";
      if (isDistributed) {
        const forced = i === 0 ? resumeFrame?.forcedFirstState : undefined;
        if (forced) {
          frameEntryState = forced;
        } else {
          const activeLeft = remaining.ACTIVE > 0;
          const restedLeft = remaining.RESTED > 0;
          if (activeLeft && restedLeft) {
            // Pause for PLAYER_CHOICE on this frame.
            const pendingPrompt: PendingPromptState = {
              options: {
                promptType: "PLAYER_CHOICE",
                choices: [
                  { id: `play-state:${id}:ACTIVE`, label: "Active" },
                  { id: `play-state:${id}:RESTED`, label: "Rested" },
                ],
                effectDescription: `Play ${data.name} as Active or Rested?`,
              },
              respondingPlayer: controller,
              resumeContext: {
                effectSourceInstanceId: sourceCardInstanceId,
                controller,
                pausedAction: action,
                remainingActions: [],
                resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
                validTargets: [],
                stateDistributionForPlay: {
                  pendingTargetId: id,
                  remainingTargetIds: targetIds.slice(i),
                  remaining,
                  playedSoFar: playedIds,
                },
              },
            };
            return { state: nextState, events, succeeded: false, pendingPrompt };
          }
          frameEntryState = activeLeft ? "ACTIVE" : restedLeft ? "RESTED" : "ACTIVE";
        }
      } else {
        frameEntryState = (entryStateMode === "RESTED") ? "RESTED" : "ACTIVE";
      }

      // Build batch continuation so that if this frame hits full-board (rule
      // 3-7-6-1), resume can continue remaining frames after the victim is
      // rule-trashed and the current card is placed.
      const batchContinuation = {
        remainingTargetIds: targetIds.slice(i),
        remaining,
        playedSoFar: playedIds,
        // Pin the entry_state we'd already resolved for this frame so the
        // state-choice prompt doesn't re-fire for the same card after overflow.
        ...(isDistributed ? { forcedFirstState: frameEntryState } : {}),
      };
      frame = playOneCharacter(nextState, action, card, sourceCardInstanceId, controller, frameEntryState, resultRefs, batchContinuation);

      if (frame.playedId && isDistributed) {
        remaining = {
          ACTIVE: remaining.ACTIVE - (frameEntryState === "ACTIVE" ? 1 : 0),
          RESTED: remaining.RESTED - (frameEntryState === "RESTED" ? 1 : 0),
        };
      }
    } else if (cardType === "STAGE") {
      frame = playOneStage(nextState, card, controller);
    } else {
      continue;
    }

    nextState = frame.state;
    events.push(...frame.events);
    if (frame.pendingPrompt) {
      return { state: nextState, events, succeeded: false, pendingPrompt: frame.pendingPrompt };
    }
    if (frame.failed) break;
    if (frame.playedId) playedIds.push(frame.playedId);

    // OPT-172: rule 6-2 — drain ON_PLAY triggers between frames. If this
    // frame queued any triggers and more frames remain, pause the batch and
    // surface a resume marker so the resolver can drain triggers first and
    // then re-invoke us with the remaining-batch state.
    if (frame.playedId && i + 1 < targetIds.length && frame.events.length > 0) {
      const scan = scanEventsForTriggers(nextState, frame.events, controller, cardDb);
      nextState = scan.state;
      if (scan.triggers.length > 0) {
        const marker: BatchResumeMarker = {
          kind: "PLAY_CARD",
          pausedAction: action,
          resumeFrame: {
            remainingTargetIds: targetIds.slice(i + 1),
            remaining,
            playedSoFar: playedIds,
          },
        };
        return {
          state: nextState,
          events,
          succeeded: playedIds.length > 0,
          result: { targetInstanceIds: playedIds, count: playedIds.length },
          pendingBatchTriggers: { triggers: scan.triggers, marker },
        };
      }
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

    const slotIdx = updatedPlayer.characters.indexOf(null);
    if (slotIdx !== -1) {
      const newChars = [...updatedPlayer.characters] as (typeof updatedPlayer.characters);
      newChars[slotIdx] = newChar;
      updatedPlayer = { ...updatedPlayer, characters: newChars };
    }

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
  const rawValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  // OPT-250: strip targets under CANNOT_BE_RESTED before prompting or
  // auto-selecting. Rest-as-consequence is a silent no-op on protected
  // cards (qa_op13.md:85-87) — the effect proceeds for the remainder.
  const allValidIds = rawValidIds.filter(
    (id) => !isProhibitedForCard(state, id, "CANNOT_BE_RESTED", cardDb),
  );
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  // OPT-222: scan for WOULD_BE_RESTED replacements (e.g. PRB02-006 Zoro)
  // across the batch of targets. One prompt per matching replacement; cost
  // paid once. Protected targets drop out of the rest loop; unprotected ones
  // proceed through the per-frame ON_REST drain below.
  const batch = processBatchReplacements(state, targetIds, "SET_REST", "WOULD_BE_RESTED", "effect", controller, cardDb);
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }

  let nextState = batch.state;
  const unprotectedIds = batch.unprotectedIds;
  const restedIds: string[] = [];

  for (let i = 0; i < unprotectedIds.length; i++) {
    const id = unprotectedIds[i];

    // OPT-224: resting a Character that is already RESTED is a no-op —
    // no state change, no CHARACTER_BECOMES_RESTED event, no ON_REST drain.
    const preRest = findCardInstance(nextState, id);
    if (preRest && preRest.state !== "ACTIVE") continue;

    const frameEvents: PendingEvent[] = [];

    nextState = setCardState(nextState, id, "RESTED");
    const evt: PendingEvent = { type: "CARD_STATE_CHANGED", playerIndex: controller, payload: { targetInstanceId: id, newState: "RESTED" } };
    events.push(evt);
    frameEvents.push(evt);
    restedIds.push(id);

    // OPT-172: rule 6-2 — drain ON_REST triggers between SET_REST frames.
    if (i + 1 < unprotectedIds.length && frameEvents.length > 0) {
      const scan = scanEventsForTriggers(nextState, frameEvents, controller, cardDb);
      nextState = scan.state;
      if (scan.triggers.length > 0) {
        const marker: BatchResumeMarker = {
          kind: "SET_REST",
          pausedAction: action,
          remainingTargetIds: unprotectedIds.slice(i + 1),
          restedSoFar: restedIds,
        };
        return {
          state: nextState,
          events,
          succeeded: restedIds.length > 0,
          result: { targetInstanceIds: restedIds, count: restedIds.length },
          pendingBatchTriggers: { triggers: scan.triggers, marker },
        };
      }
    }
  }

  return {
    state: nextState,
    events,
    succeeded: restedIds.length > 0,
    result: { targetInstanceIds: restedIds, count: restedIds.length },
  };
}

// ─── ACTIVATE_EVENT_FROM_HAND ────────────────────────────────────────────────

export function executeActivateEventFromHand(
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

  const eventInstanceId = targetIds[0];
  const p = state.players[controller];
  const cardIdx = p.hand.findIndex((c) => c.instanceId === eventInstanceId);
  if (cardIdx === -1) return { state, events, succeeded: false };

  const eventCard = p.hand[cardIdx];
  const newHand = p.hand.filter((_, i) => i !== cardIdx);
  const newTrash = [{ ...eventCard, zone: "TRASH" as const }, ...p.trash];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, hand: newHand, trash: newTrash };

  // Effect-driven activation bypasses the normal cost-payment step, so no
  // printed cost was "reduced" by a modifier — OPT-238 Crocodile should not
  // fire on this path.
  events.push({ type: "EVENT_ACTIVATED_FROM_HAND", playerIndex: controller, payload: { cardId: eventCard.cardId, cardInstanceId: eventCard.instanceId, costReducedAmount: 0 } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: [eventInstanceId], count: 1 },
  };
}

// ─── ACTIVATE_EVENT_FROM_TRASH ───────────────────────────────────────────────

export function executeActivateEventFromTrash(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];

  // OPT-237: restrict candidates to Events that actually have a [Main] block —
  // Counter-only / Trigger-only Events are invalid targets for this action.
  const rawValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  const allValidIds = rawValidIds.filter((id) => {
    const card = findCardInstance(state, id);
    if (!card) return false;
    const data = cardDb.get(card.cardId);
    return data ? findMainEventBlock(data) !== undefined : false;
  });

  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const eventInstanceId = targetIds[0];
  const eventCard = findCardInstance(state, eventInstanceId);
  if (!eventCard) return { state, events, succeeded: false };
  const eventData = cardDb.get(eventCard.cardId);
  if (!eventData) return { state, events, succeeded: false };
  const mainBlock = findMainEventBlock(eventData);
  if (!mainBlock) return { state, events, succeeded: false };

  // Class 2: Character activates Event [Main] from trash. FAQ: the Event's
  // printed main cost is skipped (the character already paid its inline cost),
  // and the Event stays in trash after resolution.
  events.push({
    type: "EVENT_MAIN_RESOLVED_FROM_TRASH",
    playerIndex: controller,
    payload: { cardId: eventCard.cardId, cardInstanceId: eventInstanceId },
  });

  const resolveResult = _resolveEffect(state, mainBlock, eventInstanceId, controller, cardDb);

  return {
    state: resolveResult.state,
    events: [...events, ...resolveResult.events],
    succeeded: true,
    result: { targetInstanceIds: [eventInstanceId], count: 1 },
    ...(resolveResult.pendingPrompt && { pendingPrompt: resolveResult.pendingPrompt }),
  };
}
