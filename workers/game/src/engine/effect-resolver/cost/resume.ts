/** Mutations applied after a player answers a cost-selection prompt. */
import { releaseMovedDonEffects } from "../../don-area-effects.js";
import type { Cost } from "../../effect-types.js";
import type { CardData, CardInstance, GameState, PendingEvent } from "../../../types.js";
import { transitionCards } from "../../zone-transition.js";
import { getEffectiveBasePower } from "../../modifiers.js";
import { attachDonToCard, reattachDon, trashStage } from "../card-mutations.js";
import { computeCostTargets, isOpponentLifePlacement, opponentRestedCostDon } from "./targets.js";

export interface AppliedCostSelection {
  state: GameState;
  events: PendingEvent[];
}

/** Apply a validated cost-selection response and return its movement events. */
/**
 * Apply a selection-based cost, then release rule-3-1-6-1 effects from any
 * DON!! the payment moved (e.g. a GIVE_DON cost paid on resume).
 */
export function applyCostSelection(
  state: GameState,
  cost: Cost,
  selectedIds: string[],
  controller: 0 | 1,
  cardDb?: Map<string, CardData>,
  sourceCardInstanceId?: string,
): AppliedCostSelection {
  const applied = applyCostSelectionUnreleased(
    state,
    cost,
    selectedIds,
    controller,
    cardDb,
    sourceCardInstanceId,
  );
  const released = releaseMovedDonEffects(state, applied.state);
  return released === applied.state ? applied : { ...applied, state: released };
}

function applyCostSelectionUnreleased(
  state: GameState,
  cost: Cost,
  selectedIds: string[],
  controller: 0 | 1,
  cardDb?: Map<string, CardData>,
  sourceCardInstanceId?: string,
): AppliedCostSelection {
  const p = state.players[controller];
  const selectedSet = new Set(selectedIds);

  switch (cost.type) {
    case "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE": {
      const selectedStage = p.stage && selectedSet.has(p.stage.instanceId)
        ? p.stage
        : null;
      if (selectedStage) {
        const trashed = trashStage(state, selectedStage.instanceId, "cost");
        return trashed
          ? { state: trashed.state, events: trashed.events }
          : { state, events: [] };
      }
      const moved = transitionCards(state, selectedIds, "TRASH", { position: "TOP" });
      return { state: moved.state, events: [] };
    }

    case "TRASH_FROM_HAND": {
      const toTrash = p.hand.filter((c) => selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toTrash.map((c) => c.instanceId), "TRASH", { position: "TOP" });
      return { state: moved.state, events: [] };
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER": {
      const toRemove = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toRemove.map((c) => c.instanceId), "TRASH", { position: "TOP", preserveSourceTriggers: true });
      const events: PendingEvent[] = moved.transitions.map(({ fact }) => {
        const provenance = { cardInstanceId: fact.oldInstanceId, newCardInstanceId: fact.newInstanceId, cardId: fact.cardId, sourceZone: fact.source, sourceController: fact.controller, causingController: controller, movementCause: "COST" as const };
        const source = toRemove.find(card => card.instanceId === fact.oldInstanceId)!;
        const data = cardDb?.get(source.cardId);
        const preKO_basePower = data && cardDb ? getEffectiveBasePower(source, data, state, cardDb) : undefined;
        return cost.type === "KO_OWN_CHARACTER"
          ? { type: "CARD_KO", playerIndex: fact.owner, payload: { ...provenance, cause: "EFFECT", preKO_donCount: fact.detachedDonInstanceIds.length, ...(preKO_basePower !== undefined ? { preKO_basePower } : {}) } }
          : { type: "CARD_TRASHED", playerIndex: fact.owner, payload: { ...provenance, reason: "cost", count: 1, from: "CHARACTER" } };
      });
      return { state: moved.state, events };
    }

    case "RETURN_OWN_CHARACTER_TO_HAND": {
      const toReturn = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toReturn.map((c) => c.instanceId), "HAND", { preserveSourceTriggers: true });
      const events: PendingEvent[] = moved.transitions.map(({ fact }) => ({
        type: "CARD_RETURNED_TO_HAND", playerIndex: fact.owner,
        payload: { cardInstanceId: fact.oldInstanceId, newCardInstanceId: fact.newInstanceId, cardId: fact.cardId, sourceZone: fact.source, sourceController: fact.controller, causingController: controller, movementCause: "COST" },
      }));
      return { state: moved.state, events };
    }

    case "PLACE_HAND_TO_DECK":
    case "PLACE_OWN_CHARACTER_TO_DECK": {
      if (cost.type === "PLACE_HAND_TO_DECK") {
        const toPlace = p.hand.filter((c) => selectedSet.has(c.instanceId));
        const position = cost.position === "TOP" ? "TOP" : "BOTTOM";
        const moved = transitionCards(state, toPlace.map((c) => c.instanceId), "DECK", { position });
        return { state: moved.state, events: [] };
      } else {
        // OPT-798: an EITHER cost may select the opponent's Character; the
        // transition places every card in its OWNER's deck (rule 4-2-1-1).
        const fieldCharacters = cost.controller === "EITHER"
          ? state.players.flatMap((fieldPlayer) => fieldPlayer.characters)
          : p.characters;
        const toPlace = fieldCharacters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
        const position = cost.position === "TOP" ? "TOP" : "BOTTOM";
        const moved = transitionCards(state, toPlace.map((c) => c.instanceId), "DECK", { position });
        const events: PendingEvent[] = moved.transitions.map((transition) => ({
            type: "CARD_RETURNED_TO_DECK",
            // The deck that received the card. Identical to `controller` for
            // own-Character payments (field cards sit in their owner's area).
            playerIndex: transition.fact.owner,
            payload: { cardInstanceId: transition.fact.oldInstanceId, newCardInstanceId: transition.fact.newInstanceId, cardId: transition.fact.cardId, position, sourceZone: transition.fact.source, sourceController: transition.fact.controller, causingController: controller, movementCause: "COST" },
          }));
        return { state: moved.state, events };
      }
    }

    case "PLACE_FROM_TRASH_TO_DECK": {
      // selectedIds arrive in final order (arranged top→bottom of the placed
      // group when the arrange step ran; selection order otherwise).
      // OPT-372: honor cost.position (deck index 0 = top); TOP_OR_BOTTOM is
      // resolved to a concrete position before payment reaches this point.
      const moved = transitionCards(state, selectedIds, "DECK", {
        position: cost.position === "TOP" ? "TOP" : "BOTTOM",
      });
      return { state: moved.state, events: [] };
    }

    case "PLACE_SELF_AND_TRASH_TO_DECK": {
      // OPT-430/431: selectedIds arrive in final arranged top→bottom order
      // and mix zones — the source Character (field) plus trash cards. Move
      // each from its own zone, preserving the interleaved order.
      const fieldIds = new Set(
        p.characters.flatMap((c) => c && selectedSet.has(c.instanceId) ? [c.instanceId] : []),
      );
      const moved = transitionCards(state, selectedIds, "DECK", {
        position: cost.position === "TOP" ? "TOP" : "BOTTOM",
      });
      const events: PendingEvent[] = moved.transitions
        .filter((transition) => fieldIds.has(transition.fact.oldInstanceId))
        .map((transition) => ({
          type: "CARD_RETURNED_TO_DECK",
          playerIndex: controller,
          payload: {
            cardInstanceId: transition.fact.oldInstanceId,
            newCardInstanceId: transition.fact.newInstanceId,
            cardId: transition.fact.cardId,
            sourceZone: transition.fact.source,
            sourceController: transition.fact.controller,
            causingController: controller,
            movementCause: "COST",
            position: cost.position === "TOP" ? "TOP" : "BOTTOM",
          },
        }));
      return { state: moved.state, events };
    }

    case "PLACE_SELF_AND_HAND_TO_DECK": {
      const stage = p.stage && selectedSet.has(p.stage.instanceId) ? p.stage : null;
      if (!stage) return { state, events: [] };
      const moved = transitionCards(state, selectedIds, "DECK", { position: "BOTTOM" });
      const stageTransition = moved.transitions.find((transition) => transition.fact.oldInstanceId === stage.instanceId);
      return {
        state: moved.state,
        events: stageTransition ? [{
          type: "CARD_RETURNED_TO_DECK",
          playerIndex: controller,
          payload: { cardInstanceId: stage.instanceId, newCardInstanceId: stageTransition.fact.newInstanceId, cardId: stage.cardId, position: "BOTTOM", sourceZone: "STAGE", sourceController: stage.controller, causingController: controller, movementCause: "COST" },
        }] : [],
      };
    }

    case "ADD_OWN_CHARACTER_TO_LIFE": {
      if (isOpponentLifePlacement(cost)) {
        // OPT-828: "place 1 of your opponent's Characters ... at the top or
        // bottom of your opponent's Life cards face-up" (OP09-101). All or
        // nothing: every selected card must still be a current candidate (an
        // opponent Character matching the filter and not protected from
        // removal), so direct callers cannot bypass the candidate rules. The
        // card goes to its OWNER's Life as a new instance (rule 3-1-6), with
        // attached DON!! returned per the zone-transition contract.
        const amount = typeof cost.amount === "number" ? cost.amount : 1;
        const unique = [...selectedSet];
        if (!cardDb || unique.length !== amount) return { state, events: [] };
        const candidates = computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId);
        if (!unique.every((id) => candidates.includes(id))) return { state, events: [] };
        const moved = transitionCards(state, unique, "LIFE", {
          // An unresolved TOP_OR_BOTTOM only reaches here from the pure
          // feasibility search, where the end chosen cannot change payability.
          position: cost.position === "BOTTOM" ? "BOTTOM" : "TOP",
          lifeFace: cost.face ?? "UP",
          preserveSourceTriggers: true,
        });
        if (moved.transitions.length !== amount) return { state, events: [] };
        const events: PendingEvent[] = moved.transitions.map(({ fact }) => ({
          type: "CARD_ADDED_TO_LIFE", playerIndex: fact.owner,
          payload: { cardInstanceId: fact.oldInstanceId, newCardInstanceId: fact.newInstanceId, cardId: fact.cardId, sourceZone: fact.source, sourceController: fact.controller, causingController: controller, movementCause: "COST" },
        }));
        return { state: moved.state, events };
      }
      // OPT-455: "add 1 of your Characters ... to the top of your Life cards
      // face-up" (ST13-001). Canonical field exit: the Life card is a NEW
      // instance (rules 3-1-6, matching executeAddToLifeFromField), attached
      // DON returns rested, and the old field instance's registrations are
      // cleaned up inline.
      const toMove = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const face = cost.face ?? "UP";
      const position = cost.position ?? "TOP";
      const moved = transitionCards(state, toMove.map((c) => c.instanceId), "LIFE", {
        position: position === "BOTTOM" ? "BOTTOM" : "TOP",
        lifeFace: face,
      });
      const events: PendingEvent[] = moved.transitions.map(({ fact }) => ({
        type: "CARD_ADDED_TO_LIFE", playerIndex: fact.owner,
        payload: { cardInstanceId: fact.oldInstanceId, newCardInstanceId: fact.newInstanceId, cardId: fact.cardId, sourceZone: fact.source, sourceController: fact.controller, causingController: controller, movementCause: "COST" },
      }));
      return { state: moved.state, events };
    }

    case "REST_CARDS":
    case "REST_NAMED_CARD": {
      const newChars = p.characters.map((c) =>
        c !== null && selectedSet.has(c.instanceId) ? { ...c, state: "RESTED" as const } : c,
      );
      const newLeader = selectedSet.has(p.leader.instanceId)
        ? { ...p.leader, state: "RESTED" as const }
        : p.leader;
      const newStage = p.stage && selectedSet.has(p.stage.instanceId)
        ? { ...p.stage, state: "RESTED" as const }
        : p.stage;
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, leader: newLeader, characters: newChars, stage: newStage };
      return { state: { ...state, players: newPlayers }, events: [] };
    }

    case "GIVE_DON": {
      // OPT-824: place `amount` of the payer's active, unattached cost-area
      // DON!! under the one selected recipient — the same attachment the
      // GIVE_DON action performs (rule 6-5-5-1). All or nothing: a recipient
      // that is gone or a DON!! shortfall moves nothing (rule 8-3-1-3).
      const recipient = selectedIds.length === 1 ? selectedIds[0] : undefined;
      const amount = typeof cost.amount === "number" ? cost.amount : 1;
      if (!recipient || amount < 1) return { state, events: [] };
      // The recipient must be a current candidate: one of the payer's own
      // Leader or Characters (attachDonToCard draws DON!! from the target's
      // side), matching the printed filter, with `amount` active DON!! left.
      // Direct callers cannot bypass any of these.
      if (!cardDb || !computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId).includes(recipient)) {
        return { state, events: [] };
      }
      let given = state;
      for (let i = 0; i < amount; i++) {
        const attached = attachDonToCard(given, controller, recipient, "ACTIVE");
        if (!attached) return { state, events: [] };
        given = attached;
      }
      return {
        state: given,
        events: [{
          type: "DON_GIVEN_TO_CARD",
          playerIndex: controller,
          payload: { targetInstanceId: recipient, count: amount },
        }],
      };
    }

    case "GIVE_OPPONENT_DON_TO_OPPONENT": {
      // OPT-868: move 1 of the opponent's RESTED, unattached cost-area DON!!
      // under the selected opponent Character. `selectedIds` is
      // [recipient, chosenDonId] — the DON!! is always bound explicitly by
      // the resume path (chosen by the payer, or the first DON!! eligible in
      // both the live and staged states when all are interchangeable). The
      // DON!! stays its owner's (the
      // opponent's) and keeps its stored state; given DON!! are neither
      // active nor rested (rule 4-4-2). All or nothing (rule 8-3-1-3).
      const [recipient, chosenDonId, ...extra] = selectedIds;
      if (!recipient || !chosenDonId || extra.length > 0) return { state, events: [] };
      if (!cardDb || !computeCostTargets(state, cost, controller, cardDb, sourceCardInstanceId).includes(recipient)) {
        return { state, events: [] };
      }
      const eligible = opponentRestedCostDon(state, controller);
      const don = eligible.find((d) => d.instanceId === chosenDonId);
      if (!don) return { state, events: [] };
      const opp: 0 | 1 = controller === 0 ? 1 : 0;
      const oppPlayer = state.players[opp];
      const withoutDon: GameState = {
        ...state,
        players: state.players.map((player, index) => index === opp
          ? { ...oppPlayer, donCostArea: oppPlayer.donCostArea.filter((d) => d.instanceId !== don.instanceId) }
          : player) as GameState["players"],
      };
      const given = reattachDon(withoutDon, opp, don, recipient);
      if (!given) return { state, events: [] };
      return {
        state: given,
        events: [{
          type: "DON_GIVEN_TO_CARD",
          playerIndex: opp,
          payload: { targetInstanceId: recipient, count: 1 },
        }],
      };
    }

    default:
      return { state, events: [] };
  }
}
