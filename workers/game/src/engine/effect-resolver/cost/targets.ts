/** Candidate computation for player-selected costs. */
import type { Cost, SimpleCost, TargetFilter } from "../../effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../../../types.js";
import { matchesFilter } from "../../conditions.js";
import { isProhibitedForCard } from "../../prohibitions.js";
import { isPresent } from "../../type-guards.js";

/** Resolve a simple cost's numeric amount with a deterministic fallback. */
export function resolveAmount(cost: SimpleCost, fallback = 1): number {
  return typeof cost.amount === "number" ? cost.amount : fallback;
}

/** Return active field cards that can be offered for a rest cost. */
function getRestCostCandidates(player: PlayerState, filter?: TargetFilter): CardInstance[] {
  const explicitType = filter?.card_type;
  const cardTypes = explicitType
    ? new Set((Array.isArray(explicitType) ? explicitType : [explicitType]).map((t) => t.toUpperCase()))
    : null;
  const includeCharacters = !cardTypes || cardTypes.has("CHARACTER");
  const includeLeader = cardTypes?.has("LEADER") ?? false;
  const includeStage = cardTypes?.has("STAGE") ?? false;

  return [
    ...(includeLeader ? [player.leader] : []),
    ...(includeCharacters ? player.characters.filter((c): c is CardInstance => c !== null) : []),
    ...(includeStage && player.stage ? [player.stage] : []),
  ];
}

/** Return instance IDs that can satisfy a player-selected cost. */
export function computeCostTargets(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): string[] {
  const player = state.players[controller];
  const filter = cost.type === "CHOICE" ? undefined : cost.filter;

  // OPT-432: honor filter.exclude_self on cost candidates — printed costs
  // like OP05-056's "1 of your Characters other than this Character" must
  // never offer the effect's source. matchesFilter cannot enforce this on
  // the cost path (it never receives the source), so it is applied here.
  const dropSelf = (ids: string[]): string[] =>
    filter?.exclude_self && sourceCardInstanceId
      ? ids.filter((id) => id !== sourceCardInstanceId)
      : ids;

  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "PLACE_SELF_AND_HAND_TO_DECK":
    case "REVEAL_FROM_HAND": {
      let candidates = player.hand;
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      return dropSelf(candidates.map((c) => c.instanceId));
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "ADD_OWN_CHARACTER_TO_LIFE": {
      let candidates = player.characters.filter(isPresent);
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      return dropSelf(candidates.map((c) => c.instanceId));
    }

    case "PLACE_FROM_TRASH_TO_DECK":
    // OPT-431: the selectable half of the compound cost is the trash side
    // only — the self half is fixed to the source card and never offered.
    case "PLACE_SELF_AND_TRASH_TO_DECK": {
      let candidates = player.trash;
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      return dropSelf(candidates.map((c) => c.instanceId));
    }

    case "REST_CARDS": {
      // OPT-250: characters under CANNOT_BE_RESTED cannot satisfy a rest cost
      // (qa_op13.md:85-87 — "cannot become rested by the effects of other cards").
      const candidates = getRestCostCandidates(player, cost.filter);
      return candidates
        .filter((c) => c.state === "ACTIVE")
        .filter((c) => !isProhibitedForCard(state, c.instanceId, "CANNOT_BE_RESTED", cardDb))
        .filter((c) => !cost.filter || matchesFilter(c, cost.filter, cardDb, state, undefined, undefined, controller))
        .map((c) => c.instanceId);
    }

    case "REST_NAMED_CARD": {
      const candidates: string[] = [];
      const nameFilter = cost.filter?.name;
      // Include matching active characters
      for (const c of player.characters) {
        if (!c || c.state !== "ACTIVE") continue;
        if (isProhibitedForCard(state, c.instanceId, "CANNOT_BE_RESTED", cardDb)) continue;
        if (nameFilter) {
          const data = cardDb.get(c.cardId);
          if (!data || data.name !== nameFilter) continue;
        }
        candidates.push(c.instanceId);
      }
      // Include leader if active and matches name filter
      if (player.leader.state === "ACTIVE" &&
          !isProhibitedForCard(state, player.leader.instanceId, "CANNOT_BE_RESTED", cardDb)) {
        if (nameFilter) {
          const leaderData = cardDb.get(player.leader.cardId);
          if (leaderData && leaderData.name === nameFilter) {
            candidates.push(player.leader.instanceId);
          }
        } else {
          candidates.push(player.leader.instanceId);
        }
      }
      return candidates;
    }

    case "CHOOSE_ONE_COST":
      // Targets are computed per-option after selection; no aggregate list.
      return [];

    default:
      return [];
  }
}

/** Materialize prompt-safe card records for the supplied valid target IDs. */
export function getCostCards(
  state: GameState,
  cost: Cost,
  validTargets: string[],
  controller: 0 | 1,
): CardInstance[] {
  const player = state.players[controller];
  const targetSet = new Set(validTargets);

  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "REVEAL_FROM_HAND":
      return player.hand.filter((c) => targetSet.has(c.instanceId));

    case "PLACE_FROM_TRASH_TO_DECK":
      return player.trash.filter((c) => targetSet.has(c.instanceId));

    case "PLACE_SELF_AND_TRASH_TO_DECK":
      // Selection stage offers trash candidates only; the self half is fixed.
      return player.trash.filter((c) => targetSet.has(c.instanceId));

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "ADD_OWN_CHARACTER_TO_LIFE":
    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      const cards = player.characters.filter((c): c is CardInstance => c !== null && targetSet.has(c.instanceId));
      if (targetSet.has(player.leader.instanceId)) {
        cards.push(player.leader);
      }
      if (player.stage && targetSet.has(player.stage.instanceId)) {
        cards.push(player.stage);
      }
      return cards;
    }

    default:
      return [];
  }
}
