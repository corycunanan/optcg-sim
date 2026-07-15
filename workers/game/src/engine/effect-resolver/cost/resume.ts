/** Mutations applied after a player answers a cost-selection prompt. */
import type { Cost } from "../../effect-types.js";
import type { CardInstance, GameState, PendingEvent } from "../../../types.js";
import { transitionCards } from "../../zone-transition.js";

export interface AppliedCostSelection {
  state: GameState;
  events: PendingEvent[];
}

/** Apply a validated cost-selection response and return its movement events. */
export function applyCostSelection(
  state: GameState,
  cost: Cost,
  selectedIds: string[],
  controller: 0 | 1,
): AppliedCostSelection {
  const p = state.players[controller];
  const selectedSet = new Set(selectedIds);

  switch (cost.type) {
    case "TRASH_FROM_HAND": {
      const toTrash = p.hand.filter((c) => selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toTrash.map((c) => c.instanceId), "TRASH", { position: "TOP" });
      return { state: moved.state, events: [] };
    }

    case "KO_OWN_CHARACTER":
    case "TRASH_OWN_CHARACTER": {
      const toRemove = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toRemove.map((c) => c.instanceId), "TRASH", { position: "TOP" });
      return { state: moved.state, events: [] };
    }

    case "RETURN_OWN_CHARACTER_TO_HAND": {
      const toReturn = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
      const moved = transitionCards(state, toReturn.map((c) => c.instanceId), "HAND");
      return { state: moved.state, events: [] };
    }

    case "PLACE_HAND_TO_DECK":
    case "PLACE_OWN_CHARACTER_TO_DECK": {
      if (cost.type === "PLACE_HAND_TO_DECK") {
        const toPlace = p.hand.filter((c) => selectedSet.has(c.instanceId));
        const position = cost.position === "TOP" ? "TOP" : "BOTTOM";
        const moved = transitionCards(state, toPlace.map((c) => c.instanceId), "DECK", { position });
        return { state: moved.state, events: [] };
      } else {
        const toPlace = p.characters.filter((c): c is CardInstance => c !== null && selectedSet.has(c.instanceId));
        const position = cost.position === "TOP" ? "TOP" : "BOTTOM";
        const moved = transitionCards(state, toPlace.map((c) => c.instanceId), "DECK", { position });
        const events: PendingEvent[] = moved.transitions.map((transition) => ({
            type: "CARD_RETURNED_TO_DECK",
            playerIndex: controller,
            payload: { cardInstanceId: transition.fact.oldInstanceId, newCardInstanceId: transition.fact.newInstanceId, cardId: transition.fact.cardId, position },
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
          payload: { cardInstanceId: stage.instanceId, newCardInstanceId: stageTransition.fact.newInstanceId, cardId: stage.cardId, position: "BOTTOM" },
        }] : [],
      };
    }

    case "ADD_OWN_CHARACTER_TO_LIFE": {
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
      return { state: moved.state, events: [] };
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

    default:
      return { state, events: [] };
  }
}
