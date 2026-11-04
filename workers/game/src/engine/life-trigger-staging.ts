/** Invocation-only Life staging ownership; never stored in GameState/frames.
 * Zone transitions replace a staging slot in place and pushes append. Only
 * this cleanup removes owned slots, adjusting any surviving nested cursor.
 */
import type { GameState } from "../types.js";
import { pushTriggerStaging } from "./state.js";
import { terminateForEngineContract } from "./engine-limits.js";
import { isGameTerminated } from "./terminal.js";

export interface LifeTriggerStagingScope {
  damageOwnerId: string;
  slot: number;
}
export interface LifeTriggerStagingWork {
  /** Transient handoff across this invocation's work-only return, not a save. */
  lifeTriggerStaging?: readonly LifeTriggerStagingScope[];
}
function invalidOwner(state: GameState, message: string): GameState {
  return terminateForEngineContract(state, {
    kind: "ENGINE_CONTRACT",
    contract: "ACTION_HANDLER",
    message,
  });
}
export function beginLifeTriggerStaging(
  state: GameState,
  damageOwnerId: string,
  instanceId: string
) {
  const owner = state.effectStack.find((frame) => frame.id === damageOwnerId);
  if (!owner?.battleDamage && !owner?.effectDamage)
    return {
      state: invalidOwner(
        state,
        `Life staging lost damage owner ${damageOwnerId}`
      ),
      scopes: [],
    };
  const scope = {
    damageOwnerId,
    slot: (state.turn.triggerStagingInstanceIds ?? []).length,
  };
  return { state: pushTriggerStaging(state, instanceId), scopes: [scope] };
}
/** Validate before touching any marker. Unknown historical markers are not
 * owned by this invocation and are never inferred from cardId or frame facts. */
export function validateLifeTriggerStaging(
  state: GameState,
  scopes: readonly LifeTriggerStagingScope[]
): GameState {
  if (isGameTerminated(state)) return state;
  const slots = new Set<number>();
  const owners = new Set<string>();
  for (const scope of scopes) {
    const owner = state.effectStack.find(
      (frame) => frame.id === scope.damageOwnerId
    );
    if (
      (!owner?.battleDamage && !owner?.effectDamage) ||
      slots.has(scope.slot) ||
      owners.has(scope.damageOwnerId) ||
      !Number.isInteger(scope.slot) ||
      scope.slot < 0 ||
      typeof state.turn.triggerStagingInstanceIds?.[scope.slot] !== "string"
    )
      return invalidOwner(
        state,
        `Life staging lost owner/slot ${scope.damageOwnerId}:${scope.slot}`
      );
    slots.add(scope.slot);
    owners.add(scope.damageOwnerId);
  }
  return state;
}
export function finishLifeTriggerStaging(
  state: GameState,
  scopes: readonly LifeTriggerStagingScope[],
  damageOwnerId?: string
) {
  state = validateLifeTriggerStaging(state, scopes);
  if (isGameTerminated(state)) return { state, scopes: [] };
  const removed = scopes
    .filter(
      (scope) =>
        damageOwnerId === undefined || scope.damageOwnerId === damageOwnerId
    )
    .map((scope) => scope.slot);
  if (!removed.length) return { state, scopes };
  const slots = new Set(removed);
  return {
    state: {
      ...state,
      turn: {
        ...state.turn,
        triggerStagingInstanceIds: (
          state.turn.triggerStagingInstanceIds ?? []
        ).filter((_id, index) => !slots.has(index)),
      },
    },
    scopes: scopes
      .filter((scope) => !slots.has(scope.slot))
      .map((scope) => ({
        ...scope,
        slot: scope.slot - removed.filter((index) => index < scope.slot).length,
      })),
  };
}
