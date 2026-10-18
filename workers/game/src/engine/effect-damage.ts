import type {
  CardData,
  EffectDamageContinuation,
  EffectStackFrame,
  ExecuteResult,
  GameState,
  LifeCard,
  PendingEvent,
} from "../types.js";
import { removeTopLifeCard, pushTriggerStaging } from "./state.js";
import { hasTrigger } from "./keywords.js";
import { isCostSequencePayable } from "./effect-resolver/cost-handler.js";
import { lifeToHandDestination } from "./life-destination.js";
import { transitionDetachedCard } from "./zone-transition.js";
import { generateFrameId, popFrame, pushFrame } from "./effect-stack.js";
import { continuationFrame, revealTriggerPromptFor, updateFrameById } from "./damage-frames.js";
import { emitPendingEvent, withEventLogEmitted } from "./events.js";
import { resolveEffect } from "./effect-resolver/index.js";
import { isGameTerminated } from "./terminal.js";
import { retainEventsOnFrame } from "./effect-resolver/resume/events.js";
import type { EffectResult } from "./effect-types.js";

export function popLifeForDamage(
  state: GameState,
  damagedPlayerIndex: 0 | 1
): {
  state: GameState;
  lifeCard: LifeCard | null;
  lethal: boolean;
  events: PendingEvent[];
} {
  const events: PendingEvent[] = [];
  if (state.players[damagedPlayerIndex].life.length === 0) {
    return { state, lifeCard: null, lethal: true, events };
  }
  const result = removeTopLifeCard(state, damagedPlayerIndex);
  if (!result) return { state, lifeCard: null, lethal: false, events };
  const { lifeCard, state: nextState } = result;
  if (nextState.players[damagedPlayerIndex].life.length === 0) {
    events.push({
      type: "LIFE_COUNT_BECOMES_ZERO",
      playerIndex: damagedPlayerIndex,
      payload: {},
    });
  }
  return { state: nextState, lifeCard, lethal: false, events };
}

export function moveLifeCardToHand(
  state: GameState,
  lifeCard: LifeCard,
  damagedPlayerIndex: 0 | 1
): { state: GameState; events: PendingEvent[] } {
  const events: PendingEvent[] = [];
  const moved = transitionDetachedCard(
    state,
    {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      owner: damagedPlayerIndex,
      source: "LIFE",
      lifeFace: lifeCard.face,
    },
    "HAND"
  );
  if (!moved) return { state, events };
  events.push({
    type: "CARD_ADDED_TO_HAND_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: {
      cardId: lifeCard.cardId,
      cardInstanceId: moved.fact.newInstanceId,
    },
  });
  events.push({
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: {
      cardInstanceId: lifeCard.instanceId,
      newCardInstanceId: moved.fact.newInstanceId,
    },
  });
  return { state: moved.state, events };
}

/** Apply the Leader's replacement before the damage Trigger window. */
export function redirectDamageLifeCard(
  state: GameState,
  lifeCard: LifeCard,
  owner: 0 | 1,
  cardDb: Map<string, CardData>
): { state: GameState; events: PendingEvent[] } | null {
  const destination = lifeToHandDestination(state, owner, lifeCard, cardDb);
  if (destination === "HAND") return null;
  const moved = transitionDetachedCard(
    state,
    {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      owner,
      source: "LIFE",
      lifeFace: lifeCard.face,
    },
    destination === "DECK_BOTTOM" ? "DECK" : "TRASH",
    {
      position: destination === "DECK_BOTTOM" ? "BOTTOM" : "TOP",
    }
  );
  if (!moved) return { state, events: [] };
  return {
    state: moved.state,
    events: [
      {
        type: "CARD_REMOVED_FROM_LIFE",
        playerIndex: owner,
        payload: {
          cardInstanceId: moved.fact.oldInstanceId,
          newCardInstanceId: moved.fact.newInstanceId,
        },
      },
    ],
  };
}

export function canOfferTrigger(
  state: GameState,
  cardId: string,
  cardDb: Map<string, CardData>,
  ownerIndex: 0 | 1,
  sourceCardInstanceId?: string
): boolean {
  const cardData = cardDb.get(cardId);
  if (!cardData || !hasTrigger(cardData)) return false;
  const block = cardData.effectSchema?.effects?.find(
    (effect) =>
      effect.trigger &&
      "keyword" in effect.trigger &&
      effect.trigger.keyword === "TRIGGER"
  );
  // Fail closed when canonical Trigger text has no authored block. Offering
  // such a card would let the player accept, trash it from Life, and resolve
  // nothing. Until its schema is authored, use the normal add-to-hand outcome.
  if (!block) return false;
  if (!block.costs?.length) return true;
  // OPT-864: the whole cost in printed order (rules 8-3-1-1, 8-3-1-3), not
  // each cost alone against the pre-cost state. Without a source id no
  // source-bound cost (TRASH_SELF, REST_SELF) can match, as before.
  return isCostSequencePayable(
    state,
    block.costs,
    ownerIndex,
    cardDb,
    sourceCardInstanceId ?? ""
  );
}

// ─── EFFECT_DAMAGE frame (OPT-963 / OPT-926) ─────────────────────────────────

export interface EffectDamageResult extends ExecuteResult {
  /** Points dealt so far by the instruction (its result count). */
  dealt: number;
}

function triggerBlockOf(cardDb: Map<string, CardData>, cardId: string) {
  const cardData = cardDb.get(cardId);
  return {
    cardData,
    block: cardData?.effectSchema?.effects?.find(
      (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "TRIGGER"
    ),
  };
}

function restoreTriggerStaging(state: GameState, baseline: readonly string[]): GameState {
  const keep = new Set(baseline);
  return {
    ...state,
    turn: {
      ...state.turn,
      triggerStagingInstanceIds: (state.turn.triggerStagingInstanceIds ?? []).filter((id) => keep.has(id)),
    },
  };
}

/**
 * Deal effect damage one point at a time (4-6-2). `damageTaken` is true when
 * this call starts the damage instruction and false when it resumes the
 * remaining points after a [Trigger] window.
 *
 * A revealed [Trigger] card pauses the instruction on an EFFECT_DAMAGE frame
 * (OPT-963): a new frame when the instruction starts, the existing `frame`
 * when a later point reopens the window. The frame owns the remaining points
 * and the card; the chain that issued the instruction is parked directly
 * below it by `executeActionChain` (`parentFrameId`), so OP03-118's second
 * point is dealt after the Trigger resolves (OPT-926) and OP06-116's
 * LIFE_TO_HAND runs after the window (Decision 2). The returned
 * `pendingPrompt` is the frame's REVEAL_TRIGGER.
 *
 * Lethal determination (OPT-925): rule 9-2-1-1 defeats a player whose Leader
 * "takes damage when that player has 0 Life cards", and 4-6-2 says the Leader
 * takes the damage first and then repeats the Life-to-hand procedure per
 * point. So the damage is lethal exactly when the player has 0 Life as the
 * instruction deals it (the first point). A later point of the same
 * instruction that finds 0 Life only repeats the empty procedure; it is not
 * a new determination. Reported in `lethalDamagePlayerIndex` for the
 * rule-processing checkpoint.
 */
export function continueEffectDamageSequence(
  state: GameState,
  cardDb: Map<string, CardData>,
  damagedPlayerIndex: 0 | 1,
  remainingDamages: number,
  sourceCardInstanceId: string,
  controllerIndex: 0 | 1,
  damageTaken = false,
  frame?: { id: string; dealt: number }
): EffectDamageResult {
  const events: PendingEvent[] = [];
  let nextState = state;
  let dealt = frame?.dealt ?? 0;
  for (let i = 0; i < remainingDamages; i++) {
    const popResult = popLifeForDamage(nextState, damagedPlayerIndex);
    if (popResult.lethal) {
      if (damageTaken && i === 0) {
        return { state: nextState, events, lethalDamagePlayerIndex: damagedPlayerIndex, dealt };
      }
      break;
    }
    if (!popResult.lifeCard) break;
    nextState = popResult.state;
    dealt += 1;
    events.push(...popResult.events);
    const lifeCard = popResult.lifeCard;
    const redirected = redirectDamageLifeCard(
      nextState,
      lifeCard,
      damagedPlayerIndex,
      cardDb
    );
    if (redirected) {
      nextState = redirected.state;
      events.push(...redirected.events);
      continue;
    }
    if (
      canOfferTrigger(
        nextState,
        lifeCard.cardId,
        cardDb,
        damagedPlayerIndex,
        lifeCard.instanceId
      )
    ) {
      events.push({
        type: "TRIGGER_ACTIVATED",
        playerIndex: damagedPlayerIndex,
        payload: { cardId: lifeCard.cardId },
      });
      // Publish the point now, log only, as the battle path does
      // (openBattleTriggerWindow): the log shows the damage while the window
      // is open and before the reply's own events. The watchers still wait
      // for the instruction to complete (rule 8-6-2): the events stay
      // unscanned and the parent chain scans them at its end (PR #758 F2).
      for (let index = 0; index < events.length; index++) {
        const pending = events[index];
        if (pending.propagation?.eventLogEmitted) continue;
        nextState = emitPendingEvent(nextState, pending, nextState.turn.activePlayerIndex);
        events[index] = withEventLogEmitted(pending);
      }
      const window: EffectDamageContinuation = {
        stage: "TRIGGER_WINDOW",
        damagedPlayerIndex,
        remainingDamages: remainingDamages - i - 1,
        dealt,
        sourceCardInstanceId,
        controllerIndex,
        lifeCard,
      };
      let frameId = frame?.id;
      if (frameId && nextState.effectStack.some((candidate) => candidate.id === frameId)) {
        nextState = updateFrameById(nextState, frameId, (current) => ({
          ...current,
          phase: "AWAITING_TRIGGER_REVEAL",
          effectDamage: {
            ...window,
            ...(current.effectDamage?.parentFrameId !== undefined
              ? { parentFrameId: current.effectDamage.parentFrameId }
              : {}),
          },
          accumulatedEvents: [],
        }));
      } else {
        const generated = generateFrameId(nextState);
        frameId = generated.id;
        nextState = pushFrame(
          generated.state,
          continuationFrame({
            id: frameId,
            sourceCardInstanceId,
            controller: controllerIndex,
            phase: "AWAITING_TRIGGER_REVEAL",
            effectDamage: window,
          })
        );
        if (isGameTerminated(nextState)) return { state: nextState, events, dealt };
      }
      const owner = nextState.effectStack.find((candidate) => candidate.id === frameId)!;
      return { state: nextState, events, dealt, pendingPrompt: revealTriggerPromptFor(owner, cardDb)! };
    }
    const handResult = moveLifeCardToHand(
      nextState,
      lifeCard,
      damagedPlayerIndex
    );
    nextState = handResult.state;
    events.push(...handResult.events);
  }
  return { state: nextState, events, dealt };
}

/**
 * Resume the top EFFECT_DAMAGE frame at its Trigger window with the damaged
 * player's REVEAL_TRIGGER choice. Accept trashes the card (rules §10-1-5-3)
 * and resolves its [Trigger] block; when the block prompts, the frame moves
 * to TRIGGER_EFFECT below the block's frames with the Life removal retained
 * for the continuation, and the remaining points are dealt once those frames
 * unwind (`continueEffectDamageFrame`). Decline adds the card to hand. The
 * remaining points continue from the same frame; when none is left the frame
 * completes (`completeEffectDamageFrame`).
 */
export function resumeEffectDamageFrame(
  state: GameState,
  reveal: boolean,
  cardDb: Map<string, CardData>
): EffectDamageResult {
  const events: PendingEvent[] = [];
  const frame = state.effectStack.at(-1);
  const window = frame?.effectDamage;
  if (!frame || window?.stage !== "TRIGGER_WINDOW") return { state, events, dealt: 0 };
  const { lifeCard, damagedPlayerIndex, remainingDamages, controllerIndex, sourceCardInstanceId, dealt } = window;
  let nextState = state;

  if (!reveal) {
    const handResult = moveLifeCardToHand(nextState, lifeCard, damagedPlayerIndex);
    nextState = handResult.state;
    events.push(...handResult.events);
    return finishEffectDamagePoints(nextState, events, frame, remainingDamages, cardDb);
  }

  // Trash the revealed Life card (rules §10-1-5-3) before resolving the
  // trigger block. The trigger block runs from the trash.
  const moved = transitionDetachedCard(
    nextState,
    {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      owner: damagedPlayerIndex,
      source: "LIFE",
      lifeFace: lifeCard.face,
    },
    "TRASH",
    { position: "TOP" }
  );
  if (!moved) return { state: nextState, events, dealt };
  nextState = moved.state;
  const triggerInstanceId = moved.fact.newInstanceId;
  // OPT-257 (F4): the staging marker keeps the just-trashed Life card
  // invisible to trash-targeting effects during the Trigger's resolution.
  const stagingBaseline = nextState.turn.triggerStagingInstanceIds ?? [];
  nextState = pushTriggerStaging(nextState, triggerInstanceId);
  events.push({
    type: "TRIGGER_ACTIVATED",
    playerIndex: damagedPlayerIndex,
    payload: { cardId: lifeCard.cardId, activated: true },
  });
  const { cardData, block } = triggerBlockOf(cardDb, lifeCard.cardId);
  if (cardData?.type === "Event") {
    events.push({
      type: "EVENT_TRIGGER_RESOLVED",
      playerIndex: damagedPlayerIndex,
      payload: { cardId: lifeCard.cardId, cardInstanceId: triggerInstanceId },
    });
  }
  const removed: PendingEvent = {
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: { cardInstanceId: lifeCard.instanceId, newCardInstanceId: triggerInstanceId },
  };
  if (block) {
    const effectResult = resolveEffect(nextState, block, triggerInstanceId, damagedPlayerIndex, cardDb);
    nextState = effectResult.state;
    events.push(...effectResult.events);
    nextState = restoreTriggerStaging(nextState, stagingBaseline);
    // OPT-960: the Trigger ended the game (9-1-2). Publish the Life removal
    // that already happened, then stop: no further damage.
    if (isGameTerminated(nextState)) {
      events.push(removed);
      return { state: nextState, events, dealt };
    }
    if (effectResult.pendingPrompt) {
      // The Trigger's effect needs input: it resolves in the frames it pushed
      // above this one. The remaining points and the Life removal wait here
      // (OPT-926: nothing is abandoned).
      nextState = updateFrameById(nextState, frame.id, (current) => ({
        ...current,
        phase: "INTERRUPTED_BY_TRIGGERS",
        effectDamage: {
          stage: "TRIGGER_EFFECT",
          damagedPlayerIndex,
          remainingDamages,
          dealt,
          sourceCardInstanceId,
          controllerIndex,
          ...(window.parentFrameId !== undefined ? { parentFrameId: window.parentFrameId } : {}),
          lifeCardInstanceId: lifeCard.instanceId,
        },
        accumulatedEvents: [...events, removed],
      }));
      return { state: nextState, events: [], dealt, pendingPrompt: effectResult.pendingPrompt };
    }
  } else {
    nextState = restoreTriggerStaging(nextState, stagingBaseline);
  }
  // Accept path: emit REMOVED_FROM_LIFE after the trigger block resolves, per
  // OPT-240. Then resume the remaining damages.
  events.push(removed);
  return finishEffectDamagePoints(nextState, events, frame, remainingDamages, cardDb);
}

/**
 * Continue the top EFFECT_DAMAGE frame at TRIGGER_EFFECT once the Trigger's
 * frames have unwound: release the retained events and deal the remaining
 * points from the same frame.
 */
export function continueEffectDamageFrame(
  state: GameState,
  cardDb: Map<string, CardData>
): EffectDamageResult {
  const frame = state.effectStack.at(-1);
  const pending = frame?.effectDamage;
  if (!frame || pending?.stage !== "TRIGGER_EFFECT" || state.pendingPrompt) {
    return { state, events: [], dealt: pending?.dealt ?? 0 };
  }
  if (state.status !== "IN_PROGRESS") return { state: popFrame(state), events: [], dealt: pending.dealt };
  const retained = [...frame.accumulatedEvents];
  const cleared = updateFrameById(state, frame.id, (current) => ({ ...current, accumulatedEvents: [] }));
  return finishEffectDamagePoints(cleared, retained, frame, pending.remainingDamages, cardDb);
}

function finishEffectDamagePoints(
  state: GameState,
  events: PendingEvent[],
  frame: EffectStackFrame,
  remainingDamages: number,
  cardDb: Map<string, CardData>
): EffectDamageResult {
  const current = state.effectStack.find((candidate) => candidate.id === frame.id)?.effectDamage ?? frame.effectDamage!;
  const cont = continueEffectDamageSequence(
    state,
    cardDb,
    current.damagedPlayerIndex,
    remainingDamages,
    current.sourceCardInstanceId,
    current.controllerIndex,
    false,
    { id: frame.id, dealt: current.dealt }
  );
  const merged = [...events, ...cont.events];
  if (cont.pendingPrompt || isGameTerminated(cont.state)) {
    return { ...cont, events: merged };
  }
  return completeEffectDamageFrame(cont.state, merged, frame.id, cont.dealt, cont.lethalDamagePlayerIndex);
}

/**
 * The instruction is done: pop the frame and hand its result to the parent
 * chain frame directly below (`parentFrameId`): the DEAL_DAMAGE's
 * `result_ref` count, `priorActionSucceeded`, and the events, retained on
 * the parent so the chain's own end publishes and scans them with the rest
 * of the effect (the resolver's convention for a resumed action). Without a
 * parent (a lifted version 2 record), the events are returned for the
 * pipeline.
 */
export function completeEffectDamageFrame(
  state: GameState,
  events: PendingEvent[],
  frameId: string,
  dealt: number,
  lethalDamagePlayerIndex?: 0 | 1
): EffectDamageResult {
  const frame = state.effectStack.find((candidate) => candidate.id === frameId);
  if (!frame) return { state, events, dealt };
  const parentId = frame.effectDamage?.parentFrameId;
  let nextState = { ...state, effectStack: state.effectStack.filter((candidate) => candidate.id !== frameId) };
  const parentIndex = parentId !== undefined ? nextState.effectStack.findIndex((candidate) => candidate.id === parentId) : -1;
  const lethal = lethalDamagePlayerIndex !== undefined ? { lethalDamagePlayerIndex } : {};
  if (parentIndex < 0) return { state: nextState, events, dealt, ...lethal };
  const parent = nextState.effectStack[parentIndex];
  const succeeded = dealt > 0 || lethalDamagePlayerIndex !== undefined;
  const resultRefs: [string, EffectResult][] = [...parent.resultRefs];
  const ref = parent.pausedAction?.result_ref;
  if (ref) {
    const existing = resultRefs.findIndex(([key]) => key === ref);
    const value: [string, EffectResult] = [ref, { targetInstanceIds: [], count: dealt }];
    if (existing >= 0) resultRefs[existing] = value;
    else resultRefs.push(value);
  }
  nextState = {
    ...nextState,
    effectStack: [
      ...nextState.effectStack.slice(0, parentIndex),
      { ...parent, priorActionSucceeded: succeeded, resultRefs },
      ...nextState.effectStack.slice(parentIndex + 1),
    ],
  };
  nextState = retainEventsOnFrame(nextState, parentIndex, events);
  return { state: nextState, events: [], dealt, ...lethal };
}
