/** Candidate computation for player-selected costs. */
import type { Cost, SimpleCost, TargetFilter } from "../../effect-types.js";
import type { CardData, CardInstance, DonInstance, GameState, PlayerState } from "../../../types.js";
import { matchesFilter } from "../../conditions.js";
import { isDonAttachProhibited, isProhibitedForCard, isRemovalProhibited } from "../../prohibitions.js";
import { namedPlayCandidates } from "./named-play.js";
import { isPresent } from "../../type-guards.js";
import { computeAllValidTargets } from "../target-resolver.js";

/**
 * OPT-798: true for "place 1 Character ... at the bottom of the owner's deck"
 * costs that may select either player's Character (OP04-055, OP06-043).
 */
export function isEitherPlayerDeckPlacement(cost: Cost): boolean {
  return cost.type === "PLACE_OWN_CHARACTER_TO_DECK" && cost.controller === "EITHER";
}

/**
 * OPT-828: true for "place 1 of your opponent's Characters ... at the top or
 * bottom of your opponent's Life cards" costs (OP09-101). Only the opponent's
 * Characters are offered, and each moves to its owner's (the opponent's) Life.
 */
export function isOpponentLifePlacement(cost: Cost): boolean {
  return cost.type === "ADD_OWN_CHARACTER_TO_LIFE" && cost.controller === "OPPONENT";
}

/** Resolve a simple cost's numeric amount with a deterministic fallback. */
export function resolveAmount(cost: SimpleCost, fallback = 1): number {
  return typeof cost.amount === "number" ? cost.amount : fallback;
}

/**
 * Number of cards the player selects to pay a selection cost. For most costs
 * this is the printed amount; a GIVE_DON cost's amount counts DON!!, while the
 * player selects exactly one recipient (OPT-824).
 */
export function costSelectionCount(cost: SimpleCost): number {
  return cost.type === "GIVE_DON" || cost.type === "GIVE_OPPONENT_DON_TO_OPPONENT"
    ? 1
    : resolveAmount(cost);
}

/**
 * OPT-868: the opponent's RESTED, unattached cost-area DON!! — the only DON!!
 * a GIVE_OPPONENT_DON_TO_OPPONENT cost may give ("1 of your opponent's rested
 * DON!! cards", OP15-003/017/023). Active DON!! never qualify.
 */
export function opponentRestedCostDon(state: GameState, controller: 0 | 1): DonInstance[] {
  return state.players[controller === 0 ? 1 : 0].donCostArea
    .filter((don) => don.state === "RESTED" && !don.attachedTo);
}

/**
 * OPT-868: DON!! are interchangeable except for the effects applied to them
 * by id (e.g. an OP07-026 / OP15-023 "will not become active" hold). Two
 * DON!! with the same set of referencing prohibitions and active effects are
 * the same choice; rule 3-1-6-1 removes those effects when the DON!! moves.
 */
export function donEffectSignature(state: GameState, donId: string): string {
  return [
    ...state.prohibitions.filter((p) => p.appliesTo.includes(donId)).map((p) => `p:${p.id}`),
    ...state.activeEffects.filter((e) => e.appliesTo.includes(donId)).map((e) => `e:${e.id}`),
  ].sort().join("|");
}

/**
 * OPT-868: true when the given DON!! differ in the effects applied to them,
 * so which one is moved is a real choice (rule 3-1-6-1; faq_op15-eb04.md:
 * "The player who activated the effect chooses a ... DON!! card from their
 * opponent's cost area"). Interchangeable DON!! (all the same signature) are
 * the same payment and never need a prompt.
 */
export function donIdentityChoiceMatters(state: GameState, dons: readonly DonInstance[]): boolean {
  return new Set(dons.map((don) => donEffectSignature(state, don.instanceId))).size > 1;
}

/**
 * OPT-868: recipients a GIVE_OPPONENT_DON_TO_OPPONENT cost may select — the
 * opponent's Characters matching the cost's target. Empty when the opponent
 * has no rested cost-area DON!!, so every returned recipient is a complete
 * payment (rule 8-3-1-3; faq_op15-eb04.md OP15-017/023: no opponent
 * Character or no opponent rested DON!! → cannot activate).
 */
function opponentDonRecipients(
  state: GameState,
  cost: Extract<SimpleCost, { type: "GIVE_OPPONENT_DON_TO_OPPONENT" }>,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): string[] {
  if (opponentRestedCostDon(state, controller).length === 0) return [];
  const opponentCharacters = new Set(
    state.players[controller === 0 ? 1 : 0].characters
      .filter(isPresent)
      .map((card) => card.instanceId),
  );
  return computeAllValidTargets(
    state,
    cost.target,
    controller,
    cardDb,
    sourceCardInstanceId ?? "",
    new Map(),
  ).filter((id) => opponentCharacters.has(id));
}

/** OPT-824: unattached ACTIVE DON!! in the cost area — the only DON!! a give can use (rule 6-5-5-1). */
export function activeCostAreaDonCount(player: PlayerState): number {
  return player.donCostArea.filter((don) => don.state === "ACTIVE" && !don.attachedTo).length;
}

/**
 * OPT-824: recipients a GIVE_DON cost may select — the payer's Leader or
 * Characters matching the cost's target, resolved exactly as the GIVE_DON
 * action resolves its target. Empty when fewer than `amount` active DON!!
 * remain, so every returned recipient is a complete payment (rule 8-3-1-3).
 * OPT-869: a card covered by an active CANNOT_ATTACH_DON prohibition is
 * excluded with the manual-attach predicate. Feasibility, the prompt, the
 * resume checks and `applyCostSelection` all read this list, so none of them
 * can offer or accept a prohibited recipient. The resume reads prohibition
 * coverage in the staged payment state (rule 8-3-1-1; see
 * `stagedProhibitionView`) and the live state for presence only.
 */
function giveDonRecipients(
  state: GameState,
  cost: Extract<SimpleCost, { type: "GIVE_DON" }>,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): string[] {
  const player = state.players[controller];
  if (activeCostAreaDonCount(player) < resolveAmount(cost)) return [];
  const ownField = new Set([
    player.leader.instanceId,
    ...player.characters.filter(isPresent).map((card) => card.instanceId),
  ]);
  return computeAllValidTargets(
    state,
    cost.target,
    controller,
    cardDb,
    sourceCardInstanceId ?? "",
    new Map(),
  ).filter((id) => ownField.has(id) && !isDonAttachProhibited(state, id, cardDb, controller));
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
    case "PLAY_NAMED_CARD_FROM_HAND":
      return namedPlayCandidates(state, cost, controller, cardDb);
    case "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE": {
      const candidates = [
        ...player.hand,
        ...(player.stage ? [player.stage] : []),
      ].filter((card) => {
        const data = cardDb.get(card.cardId);
        if (!data || data.name !== cost.card_name) return false;
        return !cost.filter || matchesFilter(
          card,
          cost.filter,
          cardDb,
          state,
          undefined,
          undefined,
          controller,
        );
      });
      return dropSelf(candidates.map((card) => card.instanceId));
    }

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
      const eitherPlayer = isEitherPlayerDeckPlacement(cost);
      const opponentLife = isOpponentLifePlacement(cost);
      const opponentCharacters = state.players[controller === 0 ? 1 : 0].characters;
      let candidates = (eitherPlayer
        ? [...player.characters, ...opponentCharacters]
        : opponentLife
          ? opponentCharacters
          : player.characters
      ).filter(isPresent);
      if (cost.filter) {
        candidates = candidates.filter((c) =>
          matchesFilter(c, cost.filter!, cardDb, state, undefined, undefined, controller),
        );
      }
      if (eitherPlayer) {
        // OPT-798: moving another player's Character is an effect-caused
        // return to deck — honor its removal protections (e.g. "cannot be
        // removed from the field by your opponent's effects").
        candidates = candidates.filter((c) => !isRemovalProhibited(
          state,
          c.instanceId,
          { action: "RETURN_TO_DECK", cause: "EFFECT", causingController: controller, sourceCardInstanceId },
          cardDb,
        ));
      }
      if (opponentLife) {
        // OPT-828: placing the opponent's Character in their Life is an
        // effect-caused removal from the field — honor "cannot be removed"
        // protections exactly as executeAddToLifeFromField does.
        candidates = candidates.filter((c) => !isRemovalProhibited(
          state,
          c.instanceId,
          { action: "TO_LIFE", cause: "EFFECT", causingController: controller, sourceCardInstanceId },
          cardDb,
        ));
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
        .filter((c) => !isProhibitedForCard(state, c.instanceId, "CANNOT_BE_RESTED", cardDb, { cause: "COST", causingController: controller, sourceCardInstanceId }))
        .filter((c) => !cost.filter || matchesFilter(c, cost.filter, cardDb, state, undefined, undefined, controller))
        .map((c) => c.instanceId);
    }

    case "REST_NAMED_CARD": {
      const candidates: string[] = [];
      const nameFilter = cost.filter?.name;
      // Include matching active characters
      for (const c of player.characters) {
        if (!c || c.state !== "ACTIVE") continue;
        if (isProhibitedForCard(state, c.instanceId, "CANNOT_BE_RESTED", cardDb, { cause: "COST", causingController: controller, sourceCardInstanceId })) continue;
        if (nameFilter) {
          const data = cardDb.get(c.cardId);
          if (!data || data.name !== nameFilter) continue;
        }
        candidates.push(c.instanceId);
      }
      // Include leader if active and matches name filter
      if (player.leader.state === "ACTIVE" &&
          !isProhibitedForCard(state, player.leader.instanceId, "CANNOT_BE_RESTED", cardDb, { cause: "COST", causingController: controller, sourceCardInstanceId })) {
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

    case "GIVE_DON":
      return giveDonRecipients(state, cost, controller, cardDb, sourceCardInstanceId);

    case "GIVE_OPPONENT_DON_TO_OPPONENT":
      return opponentDonRecipients(state, cost, controller, cardDb, sourceCardInstanceId);

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
    case "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE":
      return [
        ...player.hand.filter((c) => targetSet.has(c.instanceId)),
        ...(player.stage && targetSet.has(player.stage.instanceId) ? [player.stage] : []),
      ];

    case "PLAY_NAMED_CARD_FROM_HAND":
    case "TRASH_FROM_HAND":
    case "PLACE_HAND_TO_DECK":
    case "REVEAL_FROM_HAND":
      return player.hand.filter((c) => targetSet.has(c.instanceId));

    case "PLACE_FROM_TRASH_TO_DECK":
      return player.trash.filter((c) => targetSet.has(c.instanceId));

    case "GIVE_OPPONENT_DON_TO_OPPONENT":
      // OPT-868: the recipients are the opponent's Characters.
      return state.players[controller === 0 ? 1 : 0].characters
        .filter((c): c is CardInstance => c !== null && targetSet.has(c.instanceId));

    case "PLACE_SELF_AND_TRASH_TO_DECK":
      // Selection stage offers trash candidates only; the self half is fixed.
      return player.trash.filter((c) => targetSet.has(c.instanceId));

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER":
    case "RETURN_OWN_CHARACTER_TO_HAND":
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "ADD_OWN_CHARACTER_TO_LIFE":
    case "REST_CARDS":
    case "REST_NAMED_CARD":
    case "GIVE_DON": {
      const cards = (isEitherPlayerDeckPlacement(cost)
        ? state.players.flatMap((fieldPlayer) => fieldPlayer.characters)
        : isOpponentLifePlacement(cost)
          ? state.players[controller === 0 ? 1 : 0].characters
          : player.characters
      ).filter((c): c is CardInstance => c !== null && targetSet.has(c.instanceId));
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
