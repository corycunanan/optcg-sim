/** Pure sequential feasibility search for cost suffixes and choice branches. */
import type { Cost, SimpleCost } from "../../effect-types.js";
import type { CardData, GameState } from "../../../types.js";
import { namedPlayCandidates, payNamedPlay } from "./named-play.js";
import { trashCharacter } from "../card-mutations.js";
import { payCosts } from "./payment.js";
import { costNeedsPlayerSelection } from "./payability.js";
import { applyCostSelection } from "./resume.js";
import { computeCostTargets, costSelectionCount, opponentRestedCostDon } from "./targets.js";

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
      // OPT-868: the paid DON!! is always bound explicitly. Which rested
      // DON!! pays never changes payability (every candidate is an
      // unattached rested DON!! of the same cost area), so one suffices.
      const donForGive = cost.type === "GIVE_OPPONENT_DON_TO_OPPONENT"
        ? opponentRestedCostDon(state, controller)[0]?.instanceId
        : undefined;
      if (cost.type === "GIVE_OPPONENT_DON_TO_OPPONENT" && !donForGive) continue;
      const paymentTargets =
        cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" ||
        cost.type === "PLACE_SELF_AND_HAND_TO_DECK"
          ? [sourceCardInstanceId, ...selected]
          : donForGive
            ? [...selected, donForGive]
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

/** Resources the sequence prune reasons about. */
type PruneResource = "HAND" | "DECK" | "ACTIVE_DON" | "ACTIVE_SOURCE";
const ALL_RESOURCES: readonly PruneResource[] = ["HAND", "DECK", "ACTIVE_DON", "ACTIVE_SOURCE"];

/**
 * OPT-961: which prune resources each cost type can INCREASE when
 * `payCosts` / `applyCostSelection` pay it. Exhaustive by type, so a new cost
 * type must be classified. CHOICE and CHOOSE_ONE_COST hide their branches, so
 * they count as producing everything.
 */
const COST_PRODUCES: Record<Cost["type"], readonly PruneResource[]> = {
  // Adds cards to hand.
  RETURN_OWN_CHARACTER_TO_HAND: ["HAND"],
  LIFE_TO_HAND: ["HAND"],
  // Adds cards to a deck.
  PLACE_HAND_TO_DECK: ["DECK"],
  PLACE_OWN_CHARACTER_TO_DECK: ["DECK"],
  PLACE_SELF_TO_DECK: ["DECK"],
  PLACE_STAGE_TO_DECK: ["DECK"],
  PLACE_FROM_TRASH_TO_DECK: ["DECK"],
  PLACE_SELF_AND_TRASH_TO_DECK: ["DECK"],
  PLACE_SELF_AND_HAND_TO_DECK: ["DECK"],
  // Branches are unknown here.
  CHOICE: ALL_RESOURCES,
  CHOOSE_ONE_COST: ALL_RESOURCES,
  // Never add to hand or deck, never make a DON!! or a card active
  // (RETURN_ATTACHED_DON_TO_COST returns the DON!! rested, card-mutations.ts).
  TRASH_FROM_HAND: [],
  TRASH_NAMED_CARD_FROM_HAND_OR_STAGE: [],
  KO_OWN_CHARACTER: [],
  TRASH_OWN_CHARACTER: [],
  ADD_OWN_CHARACTER_TO_LIFE: [],
  REST_CARDS: [],
  REST_NAMED_CARD: [],
  REVEAL_FROM_HAND: [],
  PLAY_NAMED_CARD_FROM_HAND: [],
  GIVE_DON: [],
  GIVE_OPPONENT_DON_TO_OPPONENT: [],
  MILL: [],
  DON_MINUS: [],
  DON_REST: [],
  REST_DON: [],
  VARIABLE_DON_RETURN: [],
  REST_SELF: [],
  TRASH_SELF: [],
  TRASH_OWN_STAGE: [],
  LEADER_POWER_REDUCTION: [],
  GIVE_OPPONENT_DON: [],
  RETURN_ATTACHED_DON_TO_COST: [],
  TRASH_FROM_LIFE: [],
  TURN_LIFE_FACE_UP: [],
  TURN_LIFE_FACE_DOWN: [],
};

/**
 * OPT-961: a sound, cheap rejection for a multi-cost sequence.
 *
 * For each resource below, if NO cost in the remaining sequence can increase
 * it (COST_PRODUCES), the resource can only stay or fall while the sequence
 * is paid. Then a necessary condition read on the current state is also
 * necessary on every intermediate state:
 * - HAND: the numeric TRASH_FROM_HAND / PLACE_HAND_TO_DECK amounts together
 *   need that many hand cards (each payment removes exactly that many).
 * - DECK: the numeric MILL amounts together need that many deck cards.
 * - ACTIVE_DON: the numeric REST_DON / DON_REST amounts together need that
 *   many active DON!! in the cost area.
 * - ACTIVE_SOURCE: an untargeted REST_SELF needs the source on the field and
 *   active; a YOUR_LEADER REST_SELF needs an active Leader. No cost makes a
 *   card active, and a card that re-enters the field is a new instance
 *   (rule 3-1-6), so a rested or absent source stays unpayable.
 * Only counts and states are read, never prohibitions or filters, because
 * an earlier cost can end a prohibition (OPT-931) or change what a filter
 * matches. Omitting a consumer from a sum only weakens the condition, so a
 * true result always means `isCostSequencePayable` would return false.
 */
export function sequenceFailsNecessaryCondition(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  sourceCardInstanceId: string,
): boolean {
  const produced = new Set<PruneResource>();
  for (const cost of costs) for (const r of COST_PRODUCES[cost.type]) produced.add(r);
  if (produced.size === ALL_RESOURCES.length) return false;

  const player = state.players[controller];
  const numeric = (cost: Cost): number =>
    cost.type !== "CHOICE" && typeof cost.amount === "number" ? cost.amount : 0;
  let hand = 0;
  let deck = 0;
  let activeDon = 0;
  for (const cost of costs) {
    if (cost.type === "TRASH_FROM_HAND" || cost.type === "PLACE_HAND_TO_DECK") hand += numeric(cost);
    else if (cost.type === "MILL") deck += numeric(cost);
    else if (cost.type === "REST_DON" || cost.type === "DON_REST") activeDon += numeric(cost);
    else if (cost.type === "REST_SELF" && !produced.has("ACTIVE_SOURCE")) {
      const card = cost.target?.type === "YOUR_LEADER"
        ? player.leader
        : player.leader.instanceId === sourceCardInstanceId
          ? player.leader
          : player.characters.find((c) => c?.instanceId === sourceCardInstanceId)
            ?? (player.stage?.instanceId === sourceCardInstanceId ? player.stage : null);
      if (!card || card.state !== "ACTIVE") return true;
    }
  }
  if (!produced.has("HAND") && hand > player.hand.length) return true;
  if (!produced.has("DECK") && deck > player.deck.length) return true;
  if (!produced.has("ACTIVE_DON") &&
      activeDon > player.donCostArea.filter((d) => d.state === "ACTIVE").length) return true;
  return false;
}

/**
 * Explore costs in order, advancing each hypothetical state before testing the
 * next cost. Selection and choice costs branch over every valid payment.
 *
 * OPT-864: this is the one payability contract for availability,
 * validation, the optional-effect prompt, the Life Trigger gate and payment
 * (rules 8-3-1-1, 8-3-1-3). It is pure: every payment runs on a copied
 * state, so the caller's state, RNG and ID counters never change.
 * Hypothetical payment is replacement-unaware (OPT-948 owns that).
 *
 * Failure policy: expected infeasibility returns false. An engine error
 * (an unknown cost type, a broken identity assertion) is not infeasibility,
 * so it propagates to the caller instead of reading as "cannot pay".
 * Callers split on it (OPT-961): validation, the optional-prompt gate, the
 * Life Trigger gate and payment let it propagate; availability
 * (`computeEffectAvailability`) is presentation only, so it catches it per
 * block, logs `[EFFECT_AVAILABILITY]`, and reports that block blocked.
 */
export function isCostSequencePayable(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): boolean {
  return searchCostSequence(state, costs, controller, cardDb, sourceCardInstanceId, true);
}

/**
 * Test oracle only: the same search without `sequenceFailsNecessaryCondition`,
 * used to prove the prune never rejects a payable sequence.
 */
export function isCostSequencePayableWithoutPrune(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): boolean {
  return searchCostSequence(state, costs, controller, cardDb, sourceCardInstanceId, false);
}

function searchCostSequence(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  prune: boolean,
): boolean {
  if (costs.length === 0) return true;
  // OPT-961: reject before branching when a necessary condition already
  // fails (see sequenceFailsNecessaryCondition for the soundness argument).
  if (prune && costs.length > 1 &&
      sequenceFailsNecessaryCondition(state, costs, controller, sourceCardInstanceId)) {
    return false;
  }
  const [cost, ...suffix] = costs;
  const isCostSequencePayable = (
    nextState: GameState,
    nextCosts: readonly Cost[],
    nextController: 0 | 1,
    nextDb: Map<string, CardData>,
    nextSource: string,
  ): boolean => searchCostSequence(nextState, nextCosts, nextController, nextDb, nextSource, prune);

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
