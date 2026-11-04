/** Lift already validated historical runtime state into the v4 ownership model. */
import type { GameState, QueuedTrigger } from "../types.js";
import { continuationBoundary } from "../engine/effect-stack.js";
import { frameKindOf } from "../engine/frame-kinds.js";
import { findCardInstance } from "../engine/state.js";

export function liftVersion3(state: GameState): GameState {
  const queue = (entries: QueuedTrigger[]): QueuedTrigger[] =>
    entries.map((entry) => {
      const { sourceSnapshot: _unwrittenV3Snapshot, ...legacy } = entry;
      const source = findCardInstance(state, entry.sourceCardInstanceId);
      return source
        ? {
            ...legacy,
            sourceSnapshot: {
              instanceId: source.instanceId,
              cardId: source.cardId,
              controller: entry.controller,
              effectBlockId: entry.effectBlock.id,
            },
          }
        : legacy;
    });
  const turn = (value: GameState["turn"]): GameState["turn"] =>
    value.battle
      ? {
          ...value,
          battle: {
            ...value.battle,
            step: value.battle.step ?? value.battleSubPhase ?? "DAMAGE_STEP",
            redirectWindow: value.battle.redirectWindow ?? false,
            blockerLocked:
              value.battle.blockerLocked ??
              (value.battle.blockerActivated ||
                (value.battleSubPhase !== "BLOCK_STEP" &&
                  value.battleSubPhase !== "ATTACK_STEP")),
            targetLocked:
              value.battle.targetLocked ??
              (value.battle.blockerActivated ||
                value.battleSubPhase === "COUNTER_STEP" ||
                value.battleSubPhase === "DAMAGE_STEP"),
          },
        }
      : value;
  let next: GameState = {
    ...state,
    turn: turn(state.turn),
    effectStack: state.effectStack.map((frame) => {
      const { ruleTrashForPlay, eventActivationCompletion, ...kept } = frame;
      const mapped = {
        ...kept,
        pendingTriggers: queue(frame.pendingTriggers),
        simultaneousTriggers: queue(frame.simultaneousTriggers),
        ...(frame.triggerOrderingGroup
          ? {
              triggerOrderingGroup: {
                ...frame.triggerOrderingGroup,
                triggers: queue(frame.triggerOrderingGroup.triggers),
              },
            }
          : {}),
        ...(frame.costTransactionState
          ? {
              costTransactionState: {
                ...frame.costTransactionState,
                turn: turn(frame.costTransactionState.turn),
              },
            }
          : {}),
        ...(ruleTrashForPlay ? { playOverflow: ruleTrashForPlay } : {}),
        ...(eventActivationCompletion
          ? {
              eventActivation: {
                publication: "AFTER_EFFECT" as const,
                sourceZone:
                  eventActivationCompletion.type ===
                  "EVENT_MAIN_RESOLVED_FROM_TRASH"
                    ? ("TRASH" as const)
                    : ("HAND" as const),
                sourceClass: "EVENT" as const,
                events: [eventActivationCompletion],
              },
            }
          : {}),
      };
      if (mapped.playOverflow?.batch?.queuedTriggers)
        mapped.playOverflow = {
          ...mapped.playOverflow,
          batch: {
            ...mapped.playOverflow.batch,
            queuedTriggers: queue(mapped.playOverflow.batch.queuedTriggers),
          },
        };
      if (mapped.stateDistributionForPlay?.queuedTriggers)
        mapped.stateDistributionForPlay = {
          ...mapped.stateDistributionForPlay,
          queuedTriggers: queue(mapped.stateDistributionForPlay.queuedTriggers),
        };
      return mapped.eventActivation ||
        mapped.playOverflow ||
        mapped.pregameContinuation
        ? { ...mapped, kind: frameKindOf(mapped) }
        : mapped;
    }),
  };
  const debt = next.pendingEventActivationEvents;
  delete next.pendingEventActivationEvents;
  if (debt?.length && next.status === "IN_PROGRESS") {
    const activation = debt.find(
      (event) => event.type === "EVENT_ACTIVATED_FROM_HAND"
    );
    if (!activation?.payload?.cardInstanceId)
      throw new Error("Legacy activation debt lacks its hand notification");
    const boundary = continuationBoundary(
      next,
      activation.payload.cardInstanceId,
      activation.playerIndex ?? next.turn.activePlayerIndex
    );
    next = {
      ...boundary.state,
      effectStack: [
        {
          ...boundary.frame,
          kind: "EVENT_ACTIVATION",
          eventActivation: {
            publication: "AFTER_STACK",
            sourceZone: "HAND",
            sourceClass: "EVENT",
            events: debt,
          },
        },
        ...next.effectStack,
      ],
    };
  }
  if (
    next.status === "IN_PROGRESS" &&
    next.pregame?.phase === "START_OF_GAME_FX" &&
    next.pendingPrompt &&
    next.effectStack.length &&
    !next.effectStack[0].pregameContinuation
  ) {
    const child = next.effectStack[0];
    const boundary = continuationBoundary(
      next,
      child.sourceCardInstanceId,
      child.controller
    );
    next = {
      ...boundary.state,
      effectStack: [
        {
          ...boundary.frame,
          kind: "PREGAME",
          pregameContinuation: {
            phase: "START_OF_GAME_FX",
            effectFrameId: child.id,
            controller: child.controller,
          },
        },
        ...next.effectStack,
      ],
    };
  }
  return next;
}
