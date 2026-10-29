/** Pure sequential feasibility search for cost suffixes and choice branches. */
import { hasStructuralCostSemantics } from "../../native-cost-semantics.js";
import type { Cost, SimpleCost, TargetFilter } from "../../effect-types.js";
import type { CardData, CardInstance, GameState } from "../../../types.js";
import { matchesFilter } from "../../conditions.js";
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

/** Mode8 probes native exact DON choices; earlier modes keep historical picks. */
function needsProbeSelection(state: GameState, cost: Cost): boolean {
  return costNeedsPlayerSelection(cost) || (hasStructuralCostSemantics(state) &&
    (cost.type === "DON_MINUS" || cost.type === "VARIABLE_DON_RETURN"));
}

/** True for selection costs whose payments are exactly target combinations. */
function isCombinationSelection(cost: Cost): boolean {
  if (cost.type === "PLAY_NAMED_CARD_FROM_HAND") return false;
  if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
      cost.position === "TOP_OR_BOTTOM") return false;
  return true;
}

function selectionAmounts(cost: Cost, targetCount: number): number[] {
  // Rule1-3-2-2: nonpositive numeric DON repetitions do nothing. Omitted
  // VARIABLE_DON_RETURN is distinct: its printed minimum is one.
  if ((cost.type === "DON_MINUS" || cost.type === "VARIABLE_DON_RETURN") &&
      typeof cost.amount === "number" && cost.amount <= 0) return [0];
  return (cost.type === "REST_CARDS" && cost.amount === "ANY_NUMBER") ||
    (cost.type === "VARIABLE_DON_RETURN" && cost.amount === undefined)
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
        hasStructuralCostSemantics(state) ? "PRINTED_COST_PROBE" : "ACTUAL",
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
 * OPT-986: before paying a prefix of hand removals, current hand/field candidates
 * are an upper bound for the candidates at the next payment. Hand removals
 * cannot add a hand/field card or change its printed name/type. Only these
 * static filters are admitted; dynamic filters deliberately use full search.
 *
 * Field protections are stable only without active modifiers, conditional or
 * population protections, or registrations touching a moving hand identity.
 * This also excludes hand-attached DON!! and a hand source: zone transitions
 * could otherwise release effects or change source provenance. Under these
 * guards computeCostTargets reads unchanged field state/protections, or a
 * shrinking hand. Rejecting too few candidates is therefore sound.
 *
 * Work is O(costs * (hand + field + prohibitions)), independent of C(n,k).
 * This is a necessary condition, not a search budget: unsupported prefixes,
 * dynamic filters and unstable protections retain full enumeration with no
 * bound. The complete search preserves the exact answer in those cases.
 */
export function sequenceFailsStableTargetCondition(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): boolean {
  const hand = state.players[controller].hand;
  const handIds = new Set(hand.map(card => card.instanceId));
  if (hand.some(card => card.attachedDon.length > 0)) return false;
  const stableField = !handIds.has(sourceCardInstanceId) && state.activeEffects.length === 0 &&
    state.prohibitions.every(p => !p.conditions && !p.conditionalOverride && !p.target &&
      !p.scope.filter && !p.scope.source_filter && p.duration.type !== "WHILE_CONDITION" &&
      !handIds.has(p.sourceCardInstanceId) && !p.appliesTo.some(id => handIds.has(id)));
  for (const cost of costs) {
    if (cost.type === "CHOICE" || cost.type === "CHOOSE_ONE_COST") return false;
    const handCost = cost.type === "TRASH_FROM_HAND" || cost.type === "PLACE_HAND_TO_DECK";
    const fieldCost = cost.type === "REST_CARDS" || cost.type === "REST_NAMED_CARD" ||
      cost.type === "KO_OWN_CHARACTER" || cost.type === "TRASH_OWN_CHARACTER" ||
      cost.type === "RETURN_OWN_CHARACTER_TO_HAND" || cost.type === "PLACE_OWN_CHARACTER_TO_DECK" ||
      cost.type === "ADD_OWN_CHARACTER_TO_LIFE";
    const staticFilter = Object.keys(cost.filter ?? {}).every(key =>
      ["name", "name_any_of", "name_includes", "exclude_name", "exclude_self", "card_type"].includes(key));
    if (staticFilter && (handCost || (fieldCost && stableField))) {
      const count = computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId).length;
      if (!selectionAmounts(cost, count).some(amount => count >= amount)) return true;
    }
    if (!handCost) return false;
  }
  return false;
}

/** The complete two-step solver admits only removals from one shrinking zone. */
function removalZone(cost: Cost): "hand" | "trash" | "characters" | undefined {
  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK": return "hand";
    case "PLACE_FROM_TRASH_TO_DECK": return "trash";
    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "ADD_OWN_CHARACTER_TO_LIFE":
      return !("controller" in cost) || !cost.controller || cost.controller === "SELF" ? "characters" : undefined;
    default: return undefined;
  }
}

/**
 * Keep the dependency proof closed: new filter keys / value sources fall back.
 * GAME_STATE values below depend only on fixed zone cardinalities, not WHICH
 * cards moved. RESTED_CARD_COUNT is not invariant under a field removal.
 * Other accepted predicates read the surviving card's unchanged own data.
 */
function hasCountOnlyFilter(filter: TargetFilter | undefined, field: boolean): boolean {
  const local = new Set([
    "name", "name_any_of", "name_includes", "exclude_name", "exclude_self", "card_type",
    "base_cost_exact", "base_cost_min", "base_cost_max", "cost_range",
    "base_power_exact", "base_power_min", "base_power_max", "power_range",
    "color", "color_includes", "traits", "traits_any_of", "traits_contains", "traits_exclude",
    "is_rested", "is_active", "state", "controller",
  ]);
  const numeric = new Set(["cost_exact", "cost_min", "cost_max", "power_exact", "power_min", "power_max"]);
  const sources = new Set([
    "HAND_COUNT", "DECK_COUNT", "LIFE_COUNT", "OPPONENT_LIFE_COUNT", "COMBINED_LIFE_COUNT",
    "DON_FIELD_COUNT", "OPPONENT_DON_FIELD_COUNT", ...(!field ? ["RESTED_CARD_COUNT"] : []),
  ]);
  const countValue = (value: unknown): boolean => typeof value === "number" ||
    Boolean(value && typeof value === "object" && "type" in value && value.type === "GAME_STATE" &&
      "source" in value && typeof value.source === "string" && sources.has(value.source));
  return Object.entries(filter ?? {}).every(([key, value]) => local.has(key) ||
    (numeric.has(key) && countValue(value)) ||
    (key === "don_given_count" && countValue(filter?.don_given_count?.value)));
}

/**
 * OPT-992 exact overlap solver. Undefined means use the complete search.
 *
 * Let P be the first payment's candidates and S the second payment's candidates
 * BEFORE removing the chosen subset of P, but with the post-payment counts.
 * Under the guards, every k-subset of P produces those same counts and cannot
 * change any surviving card's suffix eligibility. The best first payment uses
 * P\S first, so precisely max(0, k - |P\S|) suffix candidates must disappear.
 * Thus |S| - max(0, k - |P\S|) >= m iff a complete payment exists.
 *
 * One real payment computes the counts; it is never used as a witness. This
 * avoids inventing transitions, destination ownership or mode semantics.
 * No modifiers/prohibitions may change survivor eligibility. Hand permanent
 * HAND-zone MODIFY_COST blocks are excluded: getHandZoneSelfCostModifier reads
 * exactly those blocks without requiring a registration in activeEffects.
 * No attachments may change DON counts. Unsupported shapes retain exhaustive
 * search, including replacement/choice producers and longer sequences.
 * Work is O(state copy + zone size * (filter + schema inspection)), not C(n,k).
 */
export function solveTwoRemovalCosts(
  state: GameState,
  costs: readonly Cost[],
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
): boolean | undefined {
  if (costs.length !== 2 || state.activeEffects.length || state.prohibitions.length) return undefined;
  const [first, second] = costs;
  const zone = removalZone(first);
  if (!zone || removalZone(second) !== zone || first.type === "CHOICE" || second.type === "CHOICE") return undefined;
  if (!hasCountOnlyFilter(second.filter, zone === "characters")) return undefined;
  const k = first.amount;
  const m = second.amount;
  if (typeof k !== "number" || !Number.isSafeInteger(k) || k < 1 ||
      typeof m !== "number" || !Number.isSafeInteger(m) || m < 1) return undefined;
  const cards = (state.players[controller][zone] as (CardInstance | null)[]).filter((card): card is CardInstance => card !== null);
  if (cards.some(card => card.owner !== controller || card.controller !== controller || card.attachedDon.length ||
      (zone === "hand" && cardDb.get(card.cardId)?.effectSchema?.effects.some(block =>
        block.category === "permanent" && block.zone === "HAND" &&
        block.modifiers?.some(modifier => modifier.type === "MODIFY_COST"))))) return undefined;
  const prefix = computeCostTargets(state, first, controller, cardDb, sourceCardInstanceId);
  if (prefix.length < k) return false;
  const after = applyCostSelection(state, first, prefix.slice(0, k), controller, cardDb, sourceCardInstanceId).state;
  // If a future payment implementation refuses or replaces a movement, defer
  // to the full search rather than assuming the requested cardinality.
  if (after.players[controller][zone].filter(card => card !== null).length !== cards.length - k) return undefined;
  const suffix = new Set(cards.filter(card =>
    (!second.filter?.exclude_self || card.instanceId !== sourceCardInstanceId) &&
    (!second.filter || matchesFilter(card, second.filter, cardDb, after, undefined, undefined, controller)),
  ).map(card => card.instanceId));
  const expendable = prefix.filter(id => !suffix.has(id)).length;
  return suffix.size - Math.max(0, k - expendable) >= m;
}

/**
 * Explore costs in order, advancing each hypothetical state before testing the
 * next cost. Selection and choice costs branch over every valid payment.
 *
 * OPT-864: this is the one payability contract for availability,
 * validation, the optional-effect prompt, the Life Trigger gate and payment
 * (rules 8-3-1-1, 8-3-1-3). It is pure: every payment runs on a copied
 * state, so the caller's state, RNG and ID counters never change.
 * Mode8 initial permission models the full printed sequence (8-3-1-3), including
 * printed Life-to-hand resources. Actual replacement completion is unpaid
 * and terminal for COST execution; it never supplies this probe's suffix.
 * The Life multicost interpretation is explicitly retained, not a ruling.
 * Modes6/7 retain the delivered deterministic DON/actual Life probe.
 * Structural pruning concerns only original payments: LIFE_TO_HAND already
 * produces HAND; DON returns add to DON deck, not main DECK, and never
 * activate DON or the source. Terminal substitute states never feed suffixes.
 *
 * Failure policy: expected infeasibility returns false. An engine error
 * (an unknown cost type, a broken identity assertion) is not infeasibility,
 * so it propagates to the caller instead of reading as "cannot pay".
 * A necessary-condition prune can reject before simulating payment and thus
 * skip an integrity assertion the full search would hit on corrupt state.
 * This also applies to the original resource prune. Engine states maintain
 * the ID invariant; load repairs it via restoreIdCounterInvariant /
 * reconcileExecutionContextIdCounter. Feasibility is not an integrity audit.
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
 * Test oracle only: the same search without pruning or the two-removal solver,
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

/**
 * OPT-961: PLACE_SELF_AND_TRASH_TO_DECK needs the source Character on the
 * field; PLACE_SELF_AND_HAND_TO_DECK needs the source to be the Stage
 * (the same checks as `isCostPayable`, payability.ts OPT-431).
 */
function isCompoundSelfSourceInPlace(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  sourceCardInstanceId: string,
): boolean {
  const player = state.players[controller];
  if (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK") {
    return player.characters.some((c) => c?.instanceId === sourceCardInstanceId);
  }
  if (cost.type === "PLACE_SELF_AND_HAND_TO_DECK") {
    return player.stage?.instanceId === sourceCardInstanceId;
  }
  return true;
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
  if (prune) {
    const solved = solveTwoRemovalCosts(state, costs, controller, cardDb, sourceCardInstanceId);
    if (solved !== undefined) return solved;
  }
  // OPT-961/986: reject before branching when a necessary condition fails;
  // each predicate documents its soundness argument above.
  if (prune && costs.length > 1 &&
      (sequenceFailsNecessaryCondition(state, costs, controller, sourceCardInstanceId) ||
       sequenceFailsStableTargetCondition(state, costs, controller, cardDb, sourceCardInstanceId))) {
    return false;
  }
  // OPT-961 (OPT-431 source checks): the self half of a compound cost is
  // fixed to the source, so it is payable only while the source is where the
  // cost moves it from. The terminal fast path below counts only the
  // selectable half, so check it here, on every path, before any branching.
  if (!isCompoundSelfSourceInPlace(state, costs[0], controller, sourceCardInstanceId)) return false;
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

  if (needsProbeSelection(state, cost) && isCombinationSelection(cost) && suffix.length === 0) {
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

  const nextStates: Iterable<GameState> = needsProbeSelection(state, cost)
    ? selectionPayments(state, cost, controller, cardDb, sourceCardInstanceId)
    : (() => {
        const paid = payCosts(
          state,
          [cost],
          controller,
          cardDb,
          sourceCardInstanceId,
          hasStructuralCostSemantics(state) ? "PRINTED_COST_PROBE" : "ACTUAL",
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
