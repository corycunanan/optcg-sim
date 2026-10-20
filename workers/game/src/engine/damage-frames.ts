/**
 * OPT-963 damage frames (Game Engine Consolidation Phase 1, OPT-926).
 *
 * A paused damage sequence is a frame on the effect stack: BATTLE_DAMAGE for
 * a battle's Damage Step, EFFECT_DAMAGE for a DEAL_DAMAGE instruction. The
 * frame owns the revealed Life card awaiting the defender's [Trigger] choice
 * (rule 8-6-2-1), the remaining points, and (rule 8-6-2) the ordinary
 * triggers raised during the damage processing, which wait on
 * `pendingTriggers` until the frame completes. The REVEAL_TRIGGER prompt is
 * derived from the frame by `revealTriggerPromptFor`, never stored elsewhere.
 *
 * Decision 2 per point: Life check, the attacker's "when this attack deals
 * damage" effect, the defender's Trigger choice; the defender's own
 * "when you take damage" effect after the last point (FAQ qa_op03.md:92-96,
 * qa_op13.md:13-15). `openBattleTriggerWindow` realizes the order inside one
 * battle point: it publishes the point's events, resolves the attacker's
 * `ATTACK_DEALS_DAMAGE` class with the pipeline's own executor, and queues
 * every other watcher on the frame.
 */

import { queuedSourceSnapshot } from "./trigger-ordering.js";
import type {
  CardData,
  CardInstance,
  EffectStackFrame,
  GameEvent,
  GameState,
  LifeCard,
  PendingEvent,
  PendingPromptState,
  QueuedTrigger,
} from "../types.js";
import { CONTINUATION_EFFECT_BLOCK, generateFrameId, pushFrame } from "./effect-stack.js";
import { emitPendingEvent, withEventLogEmitted, withTriggerScanned } from "./events.js";
import { takeEngineTimestamp } from "./execution-context.js";
import { matchTriggersForEvent, orderMatchedTriggers } from "./triggers.js";
import { processPlayerTriggerGroup } from "./trigger-queue.js";
import { isGameTerminated } from "./terminal.js";
import { frameKindOf } from "./frame-kinds.js";

export const REVEAL_TRIGGER_TIMEOUT_MS = 30_000;

export function isDamageFrame(frame: EffectStackFrame | null | undefined): boolean {
  if (!frame) return false;
  const kind = frameKindOf(frame);
  return kind === "BATTLE_DAMAGE" || kind === "EFFECT_DAMAGE";
}

/** A continuation frame with no schema block of its own. */
export function continuationFrame(
  fields: Partial<EffectStackFrame> &
    Pick<EffectStackFrame, "id" | "sourceCardInstanceId" | "controller" | "phase">
): EffectStackFrame {
  return {
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...fields,
  };
}

/**
 * Push `frame` and move it down to `index`, below everything pushed since
 * that depth. The depth guard and terminal check are `pushFrame`'s.
 */
export function insertFrameAt(state: GameState, index: number, frame: EffectStackFrame): GameState {
  const pushed = pushFrame(state, frame);
  if (isGameTerminated(pushed) || pushed.effectStack.length === state.effectStack.length) return pushed;
  const stack = pushed.effectStack.slice(0, -1);
  return { ...pushed, effectStack: [...stack.slice(0, index), frame, ...stack.slice(index)] };
}

export function updateFrameById(
  state: GameState,
  frameId: string,
  update: (frame: EffectStackFrame) => EffectStackFrame
): GameState {
  const index = state.effectStack.findIndex((frame) => frame.id === frameId);
  if (index < 0) return state;
  const updated = update(state.effectStack[index]);
  return {
    ...state,
    effectStack: [...state.effectStack.slice(0, index), updated, ...state.effectStack.slice(index + 1)],
  };
}

export function removeFrameById(state: GameState, frameId: string): GameState {
  return { ...state, effectStack: state.effectStack.filter((frame) => frame.id !== frameId) };
}

/** The revealed Life card as the prompt shows it to its owner. */
export function promptCardForLifeCard(lifeCard: LifeCard, owner: 0 | 1): CardInstance {
  return {
    instanceId: lifeCard.instanceId,
    cardId: lifeCard.cardId,
    zone: "LIFE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

/** The window a damage frame at AWAITING_TRIGGER_REVEAL is waiting on, or null. */
export function triggerWindowOf(
  frame: EffectStackFrame
): { lifeCard: LifeCard; damagedPlayerIndex: 0 | 1 } | null {
  if (frame.phase !== "AWAITING_TRIGGER_REVEAL") return null;
  const battle = frame.battleDamage;
  if (battle?.stage === "TRIGGER_WINDOW") {
    return { lifeCard: battle.lifeCard, damagedPlayerIndex: battle.damagedPlayerIndex };
  }
  const effect = frame.effectDamage;
  if (effect?.stage === "TRIGGER_WINDOW") {
    return { lifeCard: effect.lifeCard, damagedPlayerIndex: effect.damagedPlayerIndex };
  }
  return null;
}

/**
 * The player-facing content of a Trigger window's REVEAL_TRIGGER prompt: the
 * window's own Life card, shown to its owner, and the card's Trigger text
 * (the generic line when no card data is at hand). The one builder for the
 * engine (`revealTriggerPromptFor`) and the version 2 → 3 lift, so a prompt
 * never shows a player another player's Life card.
 */
export function revealTriggerPromptOptions(
  lifeCard: LifeCard,
  responder: 0 | 1,
  cardDb?: Map<string, CardData>
): Extract<PendingPromptState["options"], { promptType: "REVEAL_TRIGGER" }> {
  const cardData = cardDb?.get(lifeCard.cardId);
  return {
    promptType: "REVEAL_TRIGGER",
    cards: [promptCardForLifeCard(lifeCard, responder)],
    effectDescription:
      cardData?.triggerText ??
      cardData?.effectText ??
      "You may reveal this Trigger card to activate its effect",
    optional: false,
    timeoutMs: REVEAL_TRIGGER_TIMEOUT_MS,
  };
}

/** The REVEAL_TRIGGER prompt of a damage frame at its Trigger window (derived, never stored). */
export function revealTriggerPromptFor(
  frame: EffectStackFrame,
  cardDb: Map<string, CardData>
): PendingPromptState | null {
  const window = triggerWindowOf(frame);
  if (!window) return null;
  return {
    options: revealTriggerPromptOptions(window.lifeCard, window.damagedPlayerIndex, cardDb),
    respondingPlayer: window.damagedPlayerIndex,
    resumeContext: frame.id,
  };
}

/**
 * Attach the top damage frame's REVEAL_TRIGGER prompt when it is waiting at
 * its window with no prompt (the attacker's per-point effect, which ran in
 * frames above it, has just unwound). Returns the state unchanged otherwise.
 */
export function surfaceDamageFramePrompt(state: GameState, cardDb: Map<string, CardData>): GameState {
  if (state.pendingPrompt || state.status !== "IN_PROGRESS") return state;
  const top = state.effectStack.at(-1);
  if (!top) return state;
  const prompt = revealTriggerPromptFor(top, cardDb);
  return prompt ? { ...state, pendingPrompt: prompt } : state;
}

/** The attacker's per-point class (Decision 2 step 2): "when this attack deals damage" effects. */
function isAttackDamageClass(trigger: QueuedTrigger): boolean {
  const authored = trigger.effectBlock.trigger;
  return !!authored && "event" in authored && authored.event === "ATTACK_DEALS_DAMAGE";
}

export interface BattleTriggerWindowResult {
  state: GameState;
  /** The prompt to surface: the attacker effect's nested prompt, or the frame's REVEAL_TRIGGER. */
  pendingPrompt?: PendingPromptState;
}

/**
 * Open the defender's Trigger window for one battle damage point (rule
 * 7-1-4-1-1-2, 8-6-2-1). `events` is the Damage Step's accumulator so far:
 * it is published here (a prompting execution's events are otherwise dropped
 * by the pipeline) and marked in place. Watchers of those events are matched
 * now: the attacker's `ATTACK_DEALS_DAMAGE` class resolves before the choice
 * (FAQ qa_op03.md:92-96), every other class waits on the frame (rule 8-6-2).
 * `frameId` names the battle's existing frame when a later point reopens the
 * window; otherwise a new frame is pushed.
 */
export function openBattleTriggerWindow(
  state: GameState,
  lifeCard: LifeCard,
  events: PendingEvent[],
  cardDb: Map<string, CardData>,
  frameId?: string
): BattleTriggerWindowResult {
  const battle = state.turn.battle!;
  const damagedPlayerIndex: 0 | 1 = state.turn.activePlayerIndex === 0 ? 1 : 0;
  let nextState = state;

  // Publish the point (and anything the Damage Step accumulated before it).
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.propagation?.eventLogEmitted) continue;
    nextState = emitPendingEvent(nextState, event, nextState.turn.activePlayerIndex);
    events[index] = withEventLogEmitted(event);
  }

  // Match the watchers, split by class.
  const attackerClass: QueuedTrigger[] = [];
  const deferred: QueuedTrigger[] = [];
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (!event.propagation?.triggerScanned) {
      const timed = takeEngineTimestamp(nextState);
      nextState = timed.state;
      const gameEvent = {
        type: event.type,
        playerIndex: event.playerIndex ?? nextState.turn.activePlayerIndex,
        payload: event.payload ?? {},
        timestamp: timed.timestamp,
      } as GameEvent;
      const ordered = orderMatchedTriggers(
        matchTriggersForEvent(nextState, gameEvent, cardDb),
        nextState.turn.activePlayerIndex
      );
      for (const match of ordered) {
        const queued: QueuedTrigger = {
          sourceCardInstanceId: match.trigger.sourceCardInstanceId,
          controller: match.trigger.controller,
          effectBlock: match.effectBlock,
          triggeringEvent: event,
          sourceSnapshot: queuedSourceSnapshot(
            nextState,
            match.trigger.sourceCardInstanceId,
            match.trigger.controller,
            match.effectBlock.id
          ),
        };
        (isAttackDamageClass(queued) ? attackerClass : deferred).push(queued);
      }
      events[index] = withTriggerScanned(events[index]);
    }
  }

  // The frame: reused when this battle already has one (a later point).
  const window = {
    stage: "TRIGGER_WINDOW" as const,
    battleId: battle.battleId,
    damagedPlayerIndex,
    lifeCard,
  };
  let id = frameId;
  if (id && nextState.effectStack.some((frame) => frame.id === id)) {
    nextState = updateFrameById(nextState, id, (frame) => ({
      ...frame,
      phase: "AWAITING_TRIGGER_REVEAL",
      battleDamage: window,
      accumulatedEvents: [],
      pendingTriggers: [...frame.pendingTriggers, ...deferred],
    }));
  } else {
    const generated = generateFrameId(nextState);
    id = generated.id;
    nextState = pushFrame(
      generated.state,
      continuationFrame({
        id,
        sourceCardInstanceId: battle.attackerInstanceId,
        controller: nextState.turn.activePlayerIndex,
        phase: "AWAITING_TRIGGER_REVEAL",
        battleDamage: window,
        pendingTriggers: deferred,
      })
    );
    if (isGameTerminated(nextState)) return { state: nextState };
  }

  // Step 2: the attacker's own effect, before the defender's choice.
  if (attackerClass.length > 0) {
    const active = nextState.turn.activePlayerIndex;
    const result = processPlayerTriggerGroup(
      nextState,
      attackerClass.filter((trigger) => trigger.controller === active),
      attackerClass.filter((trigger) => trigger.controller !== active),
      cardDb
    );
    nextState = result.state;
    if (isGameTerminated(nextState)) return { state: nextState };
    if (result.pendingPrompt) return { state: nextState, pendingPrompt: result.pendingPrompt };
  }

  const frame = nextState.effectStack.find((candidate) => candidate.id === id)!;
  return { state: nextState, pendingPrompt: revealTriggerPromptFor(frame, cardDb)! };
}
