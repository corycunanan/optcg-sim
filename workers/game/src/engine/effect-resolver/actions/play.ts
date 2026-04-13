/**
 * Action handlers: PLAY_CARD, PLAY_SELF, SET_ACTIVE, SET_REST,
 * ACTIVATE_EVENT_FROM_HAND, ACTIVATE_EVENT_FROM_TRASH
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, CardInstance, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { setCardState } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { findCardInstance } from "../../state.js";
import { nanoid } from "../../../util/nanoid.js";

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
  allowOverflowPrompt: boolean,
): FrameResult {
  const events: PendingEvent[] = [];
  const p0 = state.players[controller];
  const slotIdx = p0.characters.indexOf(null);

  if (slotIdx === -1) {
    if (!allowOverflowPrompt) {
      return { state, events, failed: true };
    }
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
      ruleTrashForPlay: { playTargetId: card.instanceId },
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
    payload: { cardInstanceId: newChar.instanceId, cardId: card.cardId, zone: "CHARACTER", source: "BY_EFFECT" },
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
    if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
      return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
    }
    targetIds = autoSelectTargets(action.target, allValidIds);
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

  const isSingletonBatch = targetIds.length === 1 && (resumeFrame?.playedSoFar.length ?? 0) === 0;

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

      const allowOverflowPrompt = isSingletonBatch && playedIds.length === (resumeFrame?.playedSoFar.length ?? 0);
      frame = playOneCharacter(nextState, action, card, sourceCardInstanceId, controller, frameEntryState, resultRefs, allowOverflowPrompt);

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

  events.push({ type: "EVENT_ACTIVATED", playerIndex: controller, payload: { cardId: eventCard.cardId, cardInstanceId: eventCard.instanceId } });

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

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const eventInstanceId = targetIds[0];
  events.push({ type: "EVENT_ACTIVATED", playerIndex: controller, payload: { cardInstanceId: eventInstanceId, source: "TRASH" } });

  return {
    state,
    events,
    succeeded: true,
    result: { targetInstanceIds: [eventInstanceId], count: 1 },
  };
}
