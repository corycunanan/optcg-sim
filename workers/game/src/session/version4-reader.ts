/** PR 6a: validate future v4 bytes before lowering into the deployed v3 runtime.
 * No engine/writer imports this contract. See SAVED-STATE-COMPATIBILITY §9.
 */
import { z } from "zod";
import {
  PersistedGameStateV3,
  StackFrameCore,
  TurnState,
} from "./persisted-game-state.js";
import { EFFECT_STACK_FRAME_KINDS } from "../engine/frame-kinds.js";

const Seat = z.union([z.literal(0), z.literal(1)]);
const Strings = z.array(z.string());
const Count = z.number().int().nonnegative();
const Snapshot = z.strictObject({
  instanceId: z.string(),
  cardId: z.string(),
  controller: Seat,
  effectBlockId: z.string(),
});
const Trigger = z.strictObject({
  sourceCardInstanceId: z.string(),
  orderingId: z.string().optional(),
  groupSourceInstanceId: z.string().optional(),
  controller: Seat,
  effectBlock: z.unknown(),
  triggeringEvent: z.unknown(),
  sourceSnapshot: Snapshot.optional(),
});
const Capacity = z.strictObject({ ACTIVE: Count, RESTED: Count });
const Overflow = z.strictObject({
  playTargetId: z.string(),
  batch: z
    .strictObject({
      remainingTargetIds: Strings,
      remaining: Capacity,
      playedSoFar: Strings,
      forcedFirstState: z.enum(["ACTIVE", "RESTED"]).optional(),
      queuedTriggers: z.array(Trigger).optional(),
    })
    .optional(),
});
const Distribution = z.strictObject({
  pendingTargetId: z.string(),
  remainingTargetIds: Strings,
  remaining: Capacity,
  playedSoFar: Strings,
  queuedTriggers: z.array(Trigger).optional(),
});
const Battle = TurnState.shape.battle.unwrap().extend({
  step: z.enum([
    "ATTACK_STEP",
    "BLOCK_STEP",
    "COUNTER_STEP",
    "DAMAGE_STEP",
    "END_OF_BATTLE",
  ]),
  redirectWindow: z.boolean(),
  blockerLocked: z.boolean(),
  targetLocked: z.boolean(),
});
const Turn = TurnState.extend({ battle: Battle.nullable() });
const Scheduled = z.strictObject({
  id: z.string(),
  timing: z.enum([
    "END_OF_THIS_TURN",
    "END_OF_THIS_BATTLE",
    "START_OF_NEXT_MAIN_PHASE",
    "START_OF_OPPONENT_NEXT_MAIN_PHASE",
  ]),
  action: z.unknown(),
  boundToInstanceId: z.string().nullable(),
  sourceEffectId: z.string(),
  controller: Seat,
});
const Activation = z.strictObject({
  publication: z.enum(["AFTER_STACK", "AFTER_EFFECT"]),
  sourceZone: z.enum(["HAND", "TRASH"]),
  sourceClass: z.literal("EVENT"),
  events: z.array(z.unknown()).min(1),
});
const Pregame = z.strictObject({
  phase: z.literal("START_OF_GAME_FX"),
  effectFrameId: z.string(),
  controller: Seat,
});
const Frame = StackFrameCore.omit({
  ruleTrashForPlay: true,
  eventActivationCompletion: true,
}).extend({
  kind: z.enum([
    ...EFFECT_STACK_FRAME_KINDS,
    "EVENT_ACTIVATION",
    "PLAY_OVERFLOW",
    "PREGAME",
  ]),
  eventActivation: Activation.optional(),
  playOverflow: Overflow.optional(),
  pregameContinuation: Pregame.optional(),
  pendingTriggers: z.array(Trigger),
  simultaneousTriggers: z.array(Trigger),
  triggerOrderingGroup: z
    .strictObject({ triggers: z.array(Trigger), resolvedTriggerIds: Strings })
    .optional(),
  stateDistributionForPlay: Distribution.optional(),
  costTransactionState: z
    .strictObject({
      players: PersistedGameStateV3.shape.players,
      turn: Turn,
      activeEffects: PersistedGameStateV3.shape.activeEffects,
      prohibitions: PersistedGameStateV3.shape.prohibitions,
      scheduledActions: z.array(Scheduled),
      oneTimeModifiers: PersistedGameStateV3.shape.oneTimeModifiers,
      triggerRegistry: PersistedGameStateV3.shape.triggerRegistry,
    })
    .optional(),
});
const State = PersistedGameStateV3.omit({
  pendingEventActivationEvents: true,
}).extend({
  turn: Turn,
  effectStack: z.array(Frame),
  scheduledActions: z.array(Scheduled),
});
type Raw = Record<string, unknown>;
type Fail = (message: string) => never;
export type Version4Degradation =
  | "lowered.v4_source_snapshot"
  | "lowered.v4_battle_locks";
export interface LoweredVersion4 {
  state: Raw;
  degradations: Version4Degradation[];
}

/** Strict validation precedes removal of every known v4-only field. Unknown
 * keys, including fields in new owners, cannot disappear through lowering. */
export function lowerVersion4(raw: Raw, fail: Fail): LoweredVersion4 {
  const body = { ...raw };
  delete body.schemaVersion;
  const parsed = State.safeParse(body);
  if (!parsed.success)
    fail(
      `has invalid version 4 shape at ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  // Validation has no transforms/defaults. Keep the original object graph:
  // Durable Object structured clones can retain aliases between event carriers.
  const state = body as z.infer<typeof State>;
  const degradations = new Set<Version4Degradation>();
  const lowerTurn = (turn: z.infer<typeof Turn>) => {
    if (!turn.battle) return turn;
    const battle: Raw = { ...turn.battle };
    const step = battle.step;
    delete battle.step;
    delete battle.redirectWindow;
    delete battle.blockerLocked;
    delete battle.targetLocked;
    if (step !== turn.battleSubPhase)
      fail("has version 4 battle step inconsistent with battleSubPhase");
    if (battle.blockerActivated && !turn.battle.blockerLocked)
      fail("has version 4 activated Blocker without its lock");
    degradations.add("lowered.v4_battle_locks");
    return { ...turn, battle };
  };
  const lowerTrigger = (trigger: z.infer<typeof Trigger>) => {
    const { sourceSnapshot, ...kept } = trigger;
    if (sourceSnapshot) {
      const block = trigger.effectBlock as { id?: unknown } | null;
      if (
        sourceSnapshot.instanceId !== trigger.sourceCardInstanceId ||
        sourceSnapshot.controller !== trigger.controller ||
        sourceSnapshot.effectBlockId !== block?.id
      )
        fail(
          "has version 4 sourceSnapshot inconsistent with its queued trigger owner"
        );
      degradations.add("lowered.v4_source_snapshot");
    }
    return kept;
  };
  const ids = new Set<string>();
  for (const frame of state.effectStack) {
    if (ids.has(frame.id)) fail(`version 4 has duplicate frame id ${frame.id}`);
    ids.add(frame.id);
  }
  const debtOwners = new Set<string>();
  const activationEvents: unknown[] = [];
  const removedIds = new Set<string>();
  const effectStack: Raw[] = [];
  state.effectStack.forEach((frame, index) => {
    const { eventActivation, playOverflow, pregameContinuation, ...rest } =
      frame;
    const owners = [
      eventActivation,
      playOverflow,
      pregameContinuation,
      frame.replacement,
      frame.replacementBatch,
      frame.battleDamage,
      frame.effectDamage,
      frame.phaseBoundaryContinuation,
    ].filter((x) => x !== undefined);
    if (owners.length > 1)
      fail(`effectStack[${index}] has multiple continuation owners`);
    const expected = eventActivation
      ? "EVENT_ACTIVATION"
      : playOverflow
        ? "PLAY_OVERFLOW"
        : pregameContinuation
          ? "PREGAME"
          : undefined;
    if (
      (expected && frame.kind !== expected) ||
      (!expected &&
        ["EVENT_ACTIVATION", "PLAY_OVERFLOW", "PREGAME"].includes(frame.kind))
    )
      fail(`effectStack[${index}] kind disagrees with version 4 content`);
    const mapped: Raw = {
      ...rest,
      pendingTriggers: frame.pendingTriggers.map(lowerTrigger),
      simultaneousTriggers: frame.simultaneousTriggers.map(lowerTrigger),
    };
    if (frame.triggerOrderingGroup)
      mapped.triggerOrderingGroup = {
        ...frame.triggerOrderingGroup,
        triggers: frame.triggerOrderingGroup.triggers.map(lowerTrigger),
      };
    if (frame.stateDistributionForPlay)
      mapped.stateDistributionForPlay = {
        ...frame.stateDistributionForPlay,
        ...(frame.stateDistributionForPlay.queuedTriggers
          ? {
              queuedTriggers:
                frame.stateDistributionForPlay.queuedTriggers.map(lowerTrigger),
            }
          : {}),
      };
    if (frame.costTransactionState)
      mapped.costTransactionState = {
        ...frame.costTransactionState,
        turn: lowerTurn(frame.costTransactionState.turn),
      };
    const boundary = () => {
      const block = z
        .strictObject({
          id: z.literal("__engine_continuation__"),
          category: z.literal("auto"),
        })
        .safeParse(frame.effectBlock);
      const allowed = new Set([
        "kind",
        "id",
        "sourceCardInstanceId",
        "controller",
        "effectBlock",
        "phase",
        "pausedAction",
        "remainingActions",
        "resultRefs",
        "validTargets",
        "costs",
        "currentCostIndex",
        "costsPaid",
        "oncePerTurnMarked",
        "costResultRefs",
        "pendingTriggers",
        "simultaneousTriggers",
        "accumulatedEvents",
        "eventActivation",
        "pregameContinuation",
      ]);
      if (
        !block.success ||
        Object.entries(frame).some(
          ([key, value]) => value !== undefined && !allowed.has(key)
        ) ||
        frame.currentCostIndex !== 0 ||
        !frame.costsPaid ||
        !frame.oncePerTurnMarked
      )
        fail(
          `effectStack[${index}] version 4 boundary carries non-boundary metadata`
        );
      if (
        frame.phase !== "INTERRUPTED_BY_TRIGGERS" ||
        frame.pausedAction !== null ||
        frame.remainingActions.length ||
        frame.costs.length ||
        frame.pendingTriggers.length ||
        frame.simultaneousTriggers.length ||
        frame.accumulatedEvents.length ||
        frame.triggerOrderingGroup ||
        frame.batchResumeMarker ||
        frame.costTransactionState ||
        frame.resultRefs.length ||
        frame.costResultRefs.length ||
        frame.validTargets.length
      )
        fail(
          `effectStack[${index}] version 4 boundary carries executable work`
        );
    };
    if (eventActivation) {
      boundary();
      const notifications = eventActivation.events.filter(
        (e) =>
          typeof e === "object" &&
          e !== null &&
          "type" in e &&
          [
            "EVENT_ACTIVATED_FROM_HAND",
            "EVENT_MAIN_RESOLVED_FROM_TRASH",
          ].includes(String(e.type))
      );
      if (notifications.length !== 1)
        fail(
          `effectStack[${index}] activation debt must own exactly one notification`
        );
      const event = notifications[0] as {
        type?: unknown;
        playerIndex?: unknown;
        payload?: { cardInstanceId?: unknown };
      } | null;
      const expectedType =
        eventActivation.sourceZone === "HAND"
          ? "EVENT_ACTIVATED_FROM_HAND"
          : "EVENT_MAIN_RESOLVED_FROM_TRASH";
      if (
        event?.type !== expectedType ||
        event.playerIndex !== frame.controller ||
        event.payload?.cardInstanceId !== frame.sourceCardInstanceId
      )
        fail(
          `effectStack[${index}] activation event disagrees with source zone/controller/identity`
        );
      const debtKey = `${event!.type}:${event!.payload!.cardInstanceId}`;
      if (debtOwners.has(debtKey))
        fail("version 4 has duplicate activation debt owners");
      debtOwners.add(debtKey);
      if (eventActivation.publication === "AFTER_STACK") {
        if (index !== 0 || eventActivation.sourceZone !== "HAND")
          fail(
            "version 4 AFTER_STACK activation must be the bottom hand activation boundary"
          );
        activationEvents.push(...eventActivation.events);
        removedIds.add(frame.id);
        return;
      }
      mapped.kind = "TRIGGER_DRAIN";
      if (eventActivation.events.length !== 1)
        fail("version 4 AFTER_EFFECT activation cannot carry prefix events");
      mapped.eventActivationCompletion = eventActivation.events[0];
    }
    if (playOverflow) {
      if (
        frame.phase !== "AWAITING_TARGET_SELECTION" ||
        !state.pendingPrompt ||
        state.pendingPrompt.resumeContext !== frame.id ||
        state.pendingPrompt.respondingPlayer !== frame.controller ||
        state.pendingPrompt.options.promptType !== "SELECT_TARGET"
      )
        fail(`effectStack[${index}] overflow has no owning target prompt`);
      mapped.kind = "EFFECT";
      mapped.ruleTrashForPlay = {
        ...playOverflow,
        ...(playOverflow.batch
          ? {
              batch: {
                ...playOverflow.batch,
                ...(playOverflow.batch.queuedTriggers
                  ? {
                      queuedTriggers:
                        playOverflow.batch.queuedTriggers.map(lowerTrigger),
                    }
                  : {}),
              },
            }
          : {}),
      };
    }
    if (pregameContinuation) {
      boundary();
      const child = state.effectStack[index + 1];
      if (
        index !== 0 ||
        state.pregame?.phase !== "START_OF_GAME_FX" ||
        pregameContinuation.controller !== frame.controller ||
        !state.pregame.startOfGameEffectsResolved[frame.controller] ||
        !child ||
        child.id !== pregameContinuation.effectFrameId ||
        child.controller !== frame.controller ||
        child.sourceCardInstanceId !== frame.sourceCardInstanceId ||
        frame.sourceCardInstanceId !==
          state.players[frame.controller].leader.instanceId ||
        !state.pendingPrompt ||
        !state.effectStack
          .slice(index + 1)
          .some((f) => f.id === state.pendingPrompt?.resumeContext)
      )
        fail(
          `effectStack[${index}] pregame boundary has inconsistent child, prompt or ledger`
        );
      removedIds.add(frame.id);
      return;
    }
    effectStack.push(mapped);
  });
  for (const frame of effectStack) {
    const damage = frame.effectDamage as { parentFrameId?: string } | undefined;
    if (damage?.parentFrameId && removedIds.has(damage.parentFrameId))
      fail("version 4 damage parent references a non-executable boundary");
  }
  if (
    typeof state.pendingPrompt?.resumeContext === "string" &&
    removedIds.has(state.pendingPrompt.resumeContext)
  )
    fail("version 4 prompt references a non-executable boundary");
  if (
    state.status !== "IN_PROGRESS" &&
    state.effectStack.some(
      (f) => f.eventActivation || f.playOverflow || f.pregameContinuation
    )
  )
    fail("terminal version 4 state retains pending work");
  return {
    state: {
      ...state,
      turn: lowerTurn(state.turn),
      effectStack,
      ...(activationEvents.length
        ? { pendingEventActivationEvents: activationEvents }
        : {}),
    },
    degradations: [...degradations],
  };
}

const loweringNotes = new WeakMap<object, Version4Degradation[]>();
export function rememberVersion4Lowering(result: LoweredVersion4): Raw {
  loweringNotes.set(result.state, result.degradations);
  return result.state;
}
export function version4LoweringNotes(state: object): Version4Degradation[] {
  return loweringNotes.get(state) ?? [];
}
