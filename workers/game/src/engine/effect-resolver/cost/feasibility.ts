/** Pure sequential feasibility search for cost suffixes and choice branches. */
import type { Cost, SimpleCost } from "../../effect-types.js";
import type { CardData, GameState } from "../../../types.js";
import { payCosts } from "./payment.js";
import { costNeedsPlayerSelection } from "./payability.js";
import { applyCostSelection } from "./resume.js";
import { computeCostTargets, resolveAmount } from "./targets.js";

function combinations(values: string[], count: number): string[][] {
  if (count === 0) return [[]];
  if (values.length < count) return [];
  const result: string[][] = [];
  const visit = (start: number, chosen: string[]) => {
    if (chosen.length === count) {
      result.push(chosen);
      return;
    }
    for (let index = start; index <= values.length - (count - chosen.length); index++) {
      visit(index + 1, [...chosen, values[index]]);
    }
  };
  visit(0, []);
  return result;
}

function selectionPayments(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): GameState[] {
  if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
      cost.position === "TOP_OR_BOTTOM") {
    return (["TOP", "BOTTOM"] as const).flatMap((position) => {
      const paid = payCosts(
        state,
        [{ ...cost, position }],
        controller,
        cardDb,
        sourceCardInstanceId,
      );
      return paid ? [paid.state] : [];
    });
  }

  const targets = computeCostTargets(
    state,
    cost,
    controller,
    cardDb,
    sourceCardInstanceId,
  );
  const amounts = cost.type === "REST_CARDS" && cost.amount === "ANY_NUMBER"
    ? Array.from({ length: targets.length }, (_, index) => index + 1)
    : [resolveAmount(cost as SimpleCost)];

  return amounts.flatMap((amount) =>
    combinations(targets, amount).map((selected) => {
      const paymentTargets =
        cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" ||
        cost.type === "PLACE_SELF_AND_HAND_TO_DECK"
          ? [sourceCardInstanceId, ...selected]
          : selected;
      return applyCostSelection(state, cost, paymentTargets, controller).state;
    }),
  );
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

  const nextStates = costNeedsPlayerSelection(cost)
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

  return nextStates.some((nextState) =>
    isCostSequencePayable(
      nextState,
      suffix,
      controller,
      cardDb,
      sourceCardInstanceId,
    ),
  );
}
