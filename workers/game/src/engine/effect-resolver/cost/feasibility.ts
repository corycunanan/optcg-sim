/** Pure sequential feasibility search for cost suffixes and choice branches. */
import type { Cost, SimpleCost } from "../../effect-types.js";
import type { CardData, GameState } from "../../../types.js";
import { namedPlayCandidates, payNamedPlay } from "./named-play.js";
import { trashCharacter } from "../card-mutations.js";
import { payCosts } from "./payment.js";
import { costNeedsPlayerSelection } from "./payability.js";
import { applyCostSelection } from "./resume.js";
import { computeCostTargets, costSelectionCount } from "./targets.js";

/** Lazily yield every `count`-sized combination of `values` in index order. */
function* combinations(values: string[], count: number): Generator<string[]> {
  if (count === 0) {
    yield [];
    return;
  }
  if (values.length < count) return;
  const chosen: string[] = [];
  function* visit(start: number): Generator<string[]> {
    if (chosen.length === count) {
      yield [...chosen];
      return;
    }
    for (let index = start; index <= values.length - (count - chosen.length); index++) {
      chosen.push(values[index]);
      yield* visit(index + 1);
      chosen.pop();
    }
  }
  yield* visit(0);
}

/** True for selection costs whose payments are exactly the target combinations. */
function isCombinationSelection(cost: Cost): boolean {
  if (cost.type === "PLAY_NAMED_CARD_FROM_HAND") return false;
  if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
      cost.position === "TOP_OR_BOTTOM") return false;
  return true;
}

function selectionAmounts(cost: Cost, targetCount: number): number[] {
  return cost.type === "REST_CARDS" && cost.amount === "ANY_NUMBER"
    ? Array.from({ length: targetCount }, (_, index) => index + 1)
    : [costSelectionCount(cost as SimpleCost)];
}

/**
 * Lazily yield the state after each valid payment of a selection cost.
 * OPT-798 review: callers short-circuit on the first payable path, so a
 * large candidate pool (e.g. OP05-080's 20-of-N trash cost) is never
 * materialized in full.
 */
function* selectionPayments(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): Generator<GameState> {
  if (cost.type === "PLAY_NAMED_CARD_FROM_HAND") {
    const candidates = namedPlayCandidates(state, cost, controller, cardDb);
    const capacityStates = state.players[controller].characters.includes(null)
      ? [state]
      : state.players[controller].characters.flatMap(card => {
          const trashed = card && trashCharacter(state, card.instanceId, controller, "rule");
          return trashed ? [trashed.state] : [];
        });
    for (const capacityState of capacityStates) {
      for (const id of candidates) {
        const paid = payNamedPlay(capacityState, cost, id, controller, cardDb);
        if (paid) yield paid.state;
      }
    }
    return;
  }

  if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
      cost.position === "TOP_OR_BOTTOM") {
    for (const position of ["TOP", "BOTTOM"] as const) {
      const paid = payCosts(
        state,
        [{ ...cost, position }],
        controller,
        cardDb,
        sourceCardInstanceId,
      );
      if (paid) yield paid.state;
    }
    return;
  }

  const targets = computeCostTargets(
    state,
    cost,
    controller,
    cardDb,
    sourceCardInstanceId,
  );
  for (const amount of selectionAmounts(cost, targets.length)) {
    for (const selected of combinations(targets, amount)) {
      const paymentTargets =
        cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" ||
        cost.type === "PLACE_SELF_AND_HAND_TO_DECK"
          ? [sourceCardInstanceId, ...selected]
          : selected;
      yield applyCostSelection(state, cost, paymentTargets, controller, cardDb, sourceCardInstanceId).state;
    }
  }
}

function anyState(states: Iterable<GameState>, predicate: (state: GameState) => boolean): boolean {
  for (const state of states) {
    if (predicate(state)) return true;
  }
  return false;
}

/**
 * Explore costs in order, advancing each hypothetical state before testing the
 * next cost. Selection and choice costs branch over every valid payment.
 */
export function isCostSequencePayable(
  state: GameState,
  costs: Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): boolean {
  if (costs.length === 0) return true;
  const [cost, ...suffix] = costs;

  if (cost.type === "CHOICE") {
    return cost.options.some((branch) =>
      isCostSequencePayable(
        state,
        [...branch, ...suffix],
        controller,
        cardDb,
        sourceCardInstanceId,
      ),
    );
  }

  if (cost.type === "CHOOSE_ONE_COST") {
    return (cost.options ?? []).some((option) =>
      isCostSequencePayable(
        state,
        [option, ...suffix],
        controller,
        cardDb,
        sourceCardInstanceId,
      ),
    );
  }

  if ((cost.type === "REST_DON" || cost.type === "DON_REST") &&
      cost.amount === "ANY_NUMBER") {
    const active = state.players[controller].donCostArea.filter(
      (don) => don.state === "ACTIVE",
    ).length;
    return Array.from({ length: active }, (_, index) => index + 1).some((amount) => {
      const paid = payCosts(
        state,
        [{ ...cost, amount }],
        controller,
        cardDb,
        sourceCardInstanceId,
      );
      return Boolean(paid && isCostSequencePayable(
        paid.state,
        suffix,
        controller,
        cardDb,
        sourceCardInstanceId,
      ));
    });
  }

  if (costNeedsPlayerSelection(cost) && isCombinationSelection(cost) && suffix.length === 0) {
    // OPT-798 review: a terminal combination cost needs no search — every
    // combination of valid targets is a payment (applyCostSelection never
    // refuses a validated selection), so payability is a count check.
    const targetCount = computeCostTargets(
      state,
      cost,
      controller,
      cardDb,
      sourceCardInstanceId,
    ).length;
    return selectionAmounts(cost, targetCount).some((amount) => targetCount >= amount);
  }

  const nextStates: Iterable<GameState> = costNeedsPlayerSelection(cost)
    ? selectionPayments(state, cost, controller, cardDb, sourceCardInstanceId)
    : (() => {
        const paid = payCosts(
          state,
          [cost],
          controller,
          cardDb,
          sourceCardInstanceId,
        );
        return paid ? [paid.state] : [];
      })();

  return anyState(nextStates, (nextState) =>
    isCostSequencePayable(
      nextState,
      suffix,
      controller,
      cardDb,
      sourceCardInstanceId,
    ),
  );
}
