/** Pure cost payability predicates. */
import type { ChoiceCost, Cost, SimpleCost } from "../../effect-types.js";
import type { CardData, GameState } from "../../../types.js";
import { matchesFilter } from "../../conditions.js";
import { isProhibitedForCard } from "../../prohibitions.js";
import { computeCostTargets, resolveAmount } from "./targets.js";

const SELECTION_COST_TYPES: Set<string> = new Set([
  "TRASH_FROM_HAND",
  "KO_OWN_CHARACTER",
  "RETURN_OWN_CHARACTER_TO_HAND",
  "PLACE_OWN_CHARACTER_TO_DECK",
  "PLACE_HAND_TO_DECK",
  "REST_CARDS",
  "REST_NAMED_CARD",
  "TRASH_OWN_CHARACTER",
  "REVEAL_FROM_HAND",
  "CHOOSE_ONE_COST",
  "PLACE_FROM_TRASH_TO_DECK",
  "PLACE_SELF_AND_TRASH_TO_DECK",
  "PLACE_SELF_AND_HAND_TO_DECK",
  "ADD_OWN_CHARACTER_TO_LIFE",
]);

/** True when paying the cost requires a player prompt. */
export function costNeedsPlayerSelection(cost: Cost): boolean {
  if (cost.type === "LIFE_TO_HAND" && (cost as SimpleCost).position === "TOP_OR_BOTTOM") return true;
  // Life is an ordered hidden zone — the only choice a life cost can offer is
  // top-vs-bottom (OP03-109). Fixed positions auto-pay in payCosts.
  if (cost.type === "TRASH_FROM_LIFE") return (cost as SimpleCost).position === "TOP_OR_BOTTOM";
  return SELECTION_COST_TYPES.has(cost.type);
}

/**
 * Determine whether a single cost is payable in the current state.
 * Pure predicate — no state mutation.
 */
export function isCostPayable(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): boolean {
  if (cost.type === "CHOICE") {
    return (cost as ChoiceCost).options.some((branch) =>
      branch.every((c) => isCostPayable(state, c, controller, cardDb, sourceCardInstanceId)),
    );
  }

  if (cost.type === "CHOOSE_ONE_COST") {
    const opts = (cost as SimpleCost).options ?? [];
    return opts.some((o) => isCostPayable(state, o, controller, cardDb, sourceCardInstanceId));
  }

  // OPT-431: the self half of the compound cost is fixed to the source card —
  // payable only when the source is on the field AND enough matching trash
  // cards exist for the other half.
  if (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK") {
    if (!sourceCardInstanceId) return false;
    const onField = state.players[controller].characters
      .some((c) => c?.instanceId === sourceCardInstanceId);
    if (!onField) return false;
    const targets = computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId);
    return targets.length >= resolveAmount(cost as SimpleCost);
  }

  if (cost.type === "PLACE_SELF_AND_HAND_TO_DECK") {
    if (!sourceCardInstanceId || state.players[controller].stage?.instanceId !== sourceCardInstanceId) return false;
    return computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId).length >= 1;
  }

  if (costNeedsPlayerSelection(cost)) {
    if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
        (cost as SimpleCost).position === "TOP_OR_BOTTOM") {
      return state.players[controller].life.length >= resolveAmount(cost as SimpleCost);
    }
    const targets = computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId);
    const amt = cost.type === "REST_CARDS" && (cost as SimpleCost).amount === "ANY_NUMBER"
      ? 1
      : resolveAmount(cost as SimpleCost);
    return targets.length >= amt;
  }

  const player = state.players[controller];
  const simple = cost as SimpleCost;

  switch (cost.type) {
    case "DON_MINUS": {
      const amt = resolveAmount(simple, 0);
      if (simple.filter?.is_active === true || simple.filter?.state === "ACTIVE") {
        return player.donCostArea.filter((d) => d.state === "ACTIVE").length >= amt;
      }
      const allFieldDon = [
        ...player.donCostArea,
        ...player.leader.attachedDon,
        ...player.characters.filter(Boolean).flatMap((c) => c!.attachedDon),
      ];
      return allFieldDon.length >= amt;
    }

    case "DON_REST":
    case "REST_DON": {
      if (simple.amount === "ANY_NUMBER") return true;
      const amt = resolveAmount(simple);
      if (amt === 0) return false;
      return player.donCostArea.filter((d) => d.state === "ACTIVE").length >= amt;
    }

    case "VARIABLE_DON_RETURN": {
      const amt = resolveAmount(simple, 0);
      if (amt === 0) return true;
      return player.donCostArea.filter((d) => !d.attachedTo).length >= amt;
    }

    case "REST_SELF": {
      // A target-bearing REST_SELF rests the targeted card, not the source —
      // the schema convention for "rest your Leader" costs (OP04-081/094 etc.).
      // Payable iff that card is active and not prohibited from resting.
      if (simple.target?.type === "YOUR_LEADER") {
        const leader = player.leader;
        if (leader.state !== "ACTIVE") return false;
        return !isProhibitedForCard(state, leader.instanceId, "CANNOT_BE_RESTED", cardDb);
      }
      // OPT-250: a source under CANNOT_BE_RESTED can't pay this cost
      // (qa_op13.md:77-79 — [Activate: Main] rest-self effects are gated).
      if (!sourceCardInstanceId) return false;
      const source = player.leader.instanceId === sourceCardInstanceId
        ? player.leader
        : player.characters.find((card) => card?.instanceId === sourceCardInstanceId)
          ?? (player.stage?.instanceId === sourceCardInstanceId ? player.stage : null);
      if (!source || source.state !== "ACTIVE") return false;
      if (isProhibitedForCard(state, sourceCardInstanceId, "CANNOT_BE_RESTED", cardDb)) return false;
      return true;
    }

    case "TRASH_SELF": {
      if (!sourceCardInstanceId) return false;
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const p = state.players[pIdx as 0 | 1];
        if (p.characters.some((c) => c?.instanceId === sourceCardInstanceId)) return true;
        if (p.stage?.instanceId === sourceCardInstanceId) return true;
      }
      return false;
    }

    case "PLACE_SELF_TO_DECK": {
      // OPT-454: payable only while the source Character is on the field.
      if (!sourceCardInstanceId) return false;
      return player.characters.some((c) => c?.instanceId === sourceCardInstanceId);
    }

    case "LIFE_TO_HAND":
    case "TRASH_FROM_LIFE": {
      const amt = resolveAmount(simple);
      return player.life.length >= amt;
    }

    case "TURN_LIFE_FACE_UP": {
      const amt = resolveAmount(simple);
      return player.life.filter((l) => l.face === "DOWN").length >= amt;
    }

    case "TURN_LIFE_FACE_DOWN": {
      const amt = resolveAmount(simple);
      return player.life.filter((l) => l.face === "UP").length >= amt;
    }

    case "LEADER_POWER_REDUCTION":
      return !!player.leader;

    case "GIVE_OPPONENT_DON": {
      const amt = resolveAmount(simple);
      return player.donCostArea.filter((d) => !d.attachedTo).length >= amt;
    }

    case "PLACE_STAGE_TO_DECK": {
      if (!player.stage) return false;
      if (!simple.filter) return true;
      return matchesFilter(player.stage, simple.filter, cardDb, state, undefined, undefined, controller);
    }

    case "TRASH_OWN_STAGE": {
      if (!player.stage) return false;
      if (!simple.filter) return true;
      return matchesFilter(player.stage, simple.filter, cardDb, state, undefined, undefined, controller);
    }

    case "RETURN_ATTACHED_DON_TO_COST": {
      if (!sourceCardInstanceId) return false;
      const amt = resolveAmount(simple);
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const p = state.players[pIdx as 0 | 1];
        const charIdx = p.characters.findIndex((c) => c?.instanceId === sourceCardInstanceId);
        if (charIdx !== -1) return p.characters[charIdx]!.attachedDon.length >= amt;
        if (p.leader?.instanceId === sourceCardInstanceId) return p.leader.attachedDon.length >= amt;
      }
      return false;
    }

    case "PLAY_NAMED_CARD_FROM_HAND": {
      const cardName = simple.card_name;
      if (!cardName) return false;
      return player.hand.some((c) => {
        const data = cardDb.get(c.cardId);
        return data && data.name === cardName;
      });
    }

    default:
      return true;
  }
}
