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
 * OPT-869 / OPT-931: the state a pending cost reply's prohibition coverage is
 * read in.
 *
 * Rule 8-3-1-1: costs are paid in order, so a later cost sees what earlier
 * staged costs did — e.g. trashing the source of a permanent CANNOT_ATTACH_DON
 * aura ends that aura before a following GIVE_DON. That is the `staged`
 * payment state. The `live` state is the committed root, which still holds
 * such a prohibition, so it must not veto the reply by itself.
 *
 * With `base` — the committed root the payment was staged from (a native
 * cost frame's `costExpectedRoot`) — the prohibition list is a three-way
 * reconciliation by id, so each side contributes exactly its own changes:
 *
 *   - what the staged costs did (base → staged): a prohibition they ended
 *     (source left the field, expired, removed) stays ended; one they added
 *     or changed (consumed uses) takes its staged form;
 *   - what happened on the live root while the prompt was pending
 *     (base → live): a prohibition that appeared is carried in, one that
 *     expired or was removed stays gone, and one whose uses were consumed
 *     takes its live form;
 *   - a prohibition both sides changed (but neither ended) takes its staged
 *     form, the payment view the reply is validated in.
 *
 * Without `base` (a legacy cost frame, which records no root), the
 * prohibitions only in `live` are carried in unless the staged costs explain
 * their absence by moving their source off the field — the
 * `expireSourceLeftZone` cleanup that removed them there.
 *
 * Conditions and dynamic coverage then evaluate against the staged board.
 */
export function stagedProhibitionView(
  live: GameState,
  staged: GameState,
  base?: Pick<GameState, "prohibitions">
): GameState {
  if (base) {
    return { ...staged, prohibitions: reconcileProhibitions(base.prohibitions, staged.prohibitions, live.prohibitions) };
  }
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

type Prohibitions = GameState["prohibitions"];

/** Three-way merge of prohibition lists by id; see `stagedProhibitionView`. */
export function reconcileProhibitions(
  base: Prohibitions,
  staged: Prohibitions,
  live: Prohibitions
): Prohibitions {
  const byId = (list: Prohibitions) => new Map(list.map((p) => [p.id, p]));
  const baseById = byId(base);
  const liveById = byId(live);
  const result: Prohibitions = [];
  for (const p of staged) {
    const was = baseById.get(p.id);
    const now = liveById.get(p.id);
    if (!was) {
      result.push(p); // added by a staged cost
    } else if (!now) {
      continue; // ended on the live root after the offer
    } else {
      result.push(sameValue(p, was) ? now : p);
    }
  }
  const stagedIds = new Set(staged.map((p) => p.id));
  for (const p of live) {
    // In live and base but not staged: a staged cost ended it.
    if (!stagedIds.has(p.id) && !baseById.has(p.id)) result.push(p);
  }
  return result;
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
