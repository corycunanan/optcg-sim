/** Serializable staged state for an in-progress multi-cost transaction. */
import type { EffectStackFrame, GameState } from "../../../types.js";
import { hasNativeCostSemantics } from "../../native-cost-semantics.js";
import { expireSourceLeftZone } from "../../duration-tracker.js";

export type CostTransactionState = Pick<
  GameState,
  | "players"
  | "turn"
  | "activeEffects"
  | "prohibitions"
  | "scheduledActions"
  | "oneTimeModifiers"
  | "triggerRegistry"
>;

export function captureCostTransactionState(
  state: GameState
): CostTransactionState {
  return {
    players: state.players,
    turn: state.turn,
    activeEffects: state.activeEffects,
    prohibitions: state.prohibitions,
    scheduledActions: state.scheduledActions,
    oneTimeModifiers: state.oneTimeModifiers,
    triggerRegistry: state.triggerRegistry,
  };
}

/** Exact projection overlay for baseline rollback and historical cost views. */
export function applyCostTransactionState(
  state: GameState,
  staged: CostTransactionState
): GameState {
  return { ...state, ...staged };
}

type History = GameState["turn"]["actionsPerformedThisTurn"];

function historyPrefix(prefix: History, history: History): boolean {
  return prefix.length <= history.length &&
    prefix.every((entry, index) => sameValue(entry, history[index]));
}

/** Enter a validated owner's payment view. Rollback deliberately uses the exact
 * overlay above instead: transaction-only history must not escape on abandon. */
export function enterCostTransactionState(
  state: GameState,
  owner: EffectStackFrame
): GameState | undefined {
  const staged = owner.costTransactionState;
  if (!staged) return state;
  if (!hasNativeCostSemantics(state) || !owner.costExpectedRoot)
    return applyCostTransactionState(state, staged);
  const live = state.turn.actionsPerformedThisTurn;
  const pending = staged.turn.actionsPerformedThisTurn;
  const history = historyPrefix(pending, live) ? live
    : historyPrefix(live, pending) ? pending : undefined;
  if (!history) return undefined;
  return applyCostTransactionState(state, {
    ...staged, turn: { ...staged.turn, actionsPerformedThisTurn: history },
  });
}

/** Sanctioned publication retains B before replacing the expected root with L.
 * Only the proven append-only B→L history delta crosses into staged resources.
 * Undefined means ambiguous evidence; callers preserve their pre-action input. */
export function publishCostOwnerRoots(
  state: GameState,
  owns: (owner: EffectStackFrame) => boolean = () => true
): GameState | undefined {
  if (!hasNativeCostSemantics(state)) return state;
  if (!state.effectStack.some(owner => owns(owner) && owner.costExpectedRoot))
    return state;
  const live = state.turn.actionsPerformedThisTurn;
  const expected = captureCostExpectedRoot(state);
  const frames: EffectStackFrame[] = [];
  for (const owner of state.effectStack) {
    if (!owns(owner) || !owner.costExpectedRoot) {
      frames.push(owner);
      continue;
    }
    const staged = owner.costTransactionState;
    if (!staged) return undefined;
    const baseline = owner.costExpectedRoot.turn.actionsPerformedThisTurn;
    const pending = staged.turn.actionsPerformedThisTurn;
    if (!historyPrefix(baseline, live)) return undefined;
    let history: History;
    if (historyPrefix(pending, live)) history = live;
    else if (historyPrefix(live, pending)) history = pending;
    else {
      if (!historyPrefix(baseline, pending)) return undefined;
      // Committed publication precedes transaction-only facts. Both original
      // streams retain their exact records and relative order. The live-prefix
      // branch above is the explicit already-carried/idempotence check.
      history = [...live, ...pending.slice(baseline.length)];
    }
    frames.push({ ...owner, costExpectedRoot: expected,
      costTransactionState: { ...staged,
        turn: { ...staged.turn, actionsPerformedThisTurn: history } } });
  }
  return { ...state, effectStack: frames };
}

function fieldInstanceIds(state: GameState): string[] {
  return state.players.flatMap((player) => [
    player.leader.instanceId,
    ...player.characters.flatMap((card) => (card ? [card.instanceId] : [])),
    ...(player.stage ? [player.stage.instanceId] : []),
  ]);
}

/**
 * OPT-869: the state a pending cost reply's prohibition coverage is read in.
 *
 * Rule 8-3-1-1: costs are paid in order, so a later cost sees what earlier
 * staged costs did — e.g. trashing the source of a permanent CANNOT_ATTACH_DON
 * aura ends that aura before a following GIVE_DON. That is the `staged`
 * payment state. The `live` (pre-cost) state still holds such a prohibition,
 * so it must not veto the reply by itself.
 *
 * A prohibition present only in `live` (it appeared after the offer, through
 * a change the staged costs did not make) is still carried in, unless the
 * staged costs explain its absence: its source left the field in the staged
 * payment, which is exactly the `expireSourceLeftZone` cleanup that removed
 * it there. Conditions and dynamic coverage then evaluate against the staged
 * board.
 */
export function stagedProhibitionView(
  live: GameState,
  staged: GameState
): GameState {
  const stagedIds = new Set(staged.prohibitions.map((p) => p.id));
  const liveOnly = live.prohibitions.filter((p) => !stagedIds.has(p.id));
  if (liveOnly.length === 0) return staged;
  let merged: GameState = {
    ...staged,
    prohibitions: [...staged.prohibitions, ...liveOnly],
  };
  const stagedField = new Set(fieldInstanceIds(staged));
  for (const id of fieldInstanceIds(live)) {
    if (!stagedField.has(id)) merged = expireSourceLeftZone(merged, id);
  }
  // Only the prohibition list is reconciled; everything else stays staged.
  return { ...staged, prohibitions: merged.prohibitions };
}

/** JSON structural equality: object insertion order is incidental; array order is gameplay. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  const a = Object.entries(left).filter(([, value]) => value !== undefined);
  const b = Object.entries(right).filter(([, value]) => value !== undefined);
  return (
    a.length === b.length &&
    a.every(
      ([key, value]) =>
        Object.hasOwn(right, key) && sameValue(value, Reflect.get(right, key))
    )
  );
}

export function costRootMatches(
  state: GameState,
  expected: CostTransactionState
): boolean {
  return sameValue(captureCostTransactionState(state), expected);
}

/** Only sanctioned native7 suspension/continuation boundaries call this helper.
 * Clone even in memory: evidence must never alias the mutable published board. */
export function captureCostExpectedRoot(
  state: GameState
): CostTransactionState {
  return structuredClone(captureCostTransactionState(state));
}
