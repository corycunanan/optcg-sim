/** Prompt and display construction for cost selection. */
import type { Cost, EffectBlock, SimpleCost } from "../../effect-types.js";
import type {
  CardInstance,
  EffectStackFrame,
  GameState,
  PendingPromptState,
} from "../../../types.js";
import { isPresent } from "../../type-guards.js";

/**
 * True when the effect block shuffles the deck after its costs resolve —
 * ordering the placed cards is moot in that case (OPT-371, e.g. OP05-080).
 */
export function blockShufflesDeck(block: EffectBlock): boolean {
  return (block.actions ?? []).some((a) => a.type === "SHUFFLE_DECK");
}

/**
 * ARRANGE_TOP_CARDS prompt over the cards being placed by a
 * PLACE_FROM_TRASH_TO_DECK or PLACE_SELF_AND_TRASH_TO_DECK cost.
 * maxKeep 0 = pure reorder (no pick step). Cards may come from the trash or
 * the field (the self half of the compound cost, OPT-430).
 */
export function buildTrashToDeckArrangePrompt(
  state: GameState,
  cardIds: string[],
  controller: 0 | 1,
  frameId: string,
  position: "TOP" | "BOTTOM" = "BOTTOM",
): PendingPromptState {
  const p = state.players[controller];
  const byId = new Map([
    ...p.trash.map((c) => [c.instanceId, c] as const),
    ...p.hand.map((c) => [c.instanceId, c] as const),
    ...p.characters.filter(isPresent).map((c) => [c.instanceId, c] as const),
    ...(p.stage ? [[p.stage.instanceId, p.stage] as const] : []),
  ]);
  const cards = cardIds
    .map((id) => byId.get(id))
    .filter((c): c is CardInstance => c !== undefined);
  return {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards,
      effectDescription: `Place the cards at the ${position === "TOP" ? "top" : "bottom"} of your deck in any order`,
      // Drives the modal's single destination button: "Place at Bottom" when
      // true, "Place on Top" when false.
      canSendToBottom: position !== "TOP",
      validTargets: [],
      maxKeep: 0,
    },
    respondingPlayer: controller,
    resumeContext: frameId,
  };
}

/** Build the player-facing instruction for a cost-selection prompt. */
export function getCostLabel(cost: Cost): string {
  const amount = typeof (cost as SimpleCost).amount === "number" ? ((cost as SimpleCost).amount as number) : 1;
  switch (cost.type) {
    case "TRASH_FROM_HAND": return `Choose ${amount} card(s) from hand to trash as cost`;
    case "KO_OWN_CHARACTER": return `Choose ${amount} character(s) to KO as cost`;
    case "RETURN_OWN_CHARACTER_TO_HAND": return `Choose ${amount} character(s) to return to hand as cost`;
    case "PLACE_OWN_CHARACTER_TO_DECK": return `Choose ${amount} character(s) to place on deck as cost`;
    case "ADD_OWN_CHARACTER_TO_LIFE": return `Choose ${amount} character(s) to add to your Life cards as cost`;
    case "TRASH_FROM_LIFE": return `Choose ${amount} life card(s) to trash as cost`;
    case "PLACE_HAND_TO_DECK": return `Choose ${amount} card(s) to place on deck as cost`;
    case "PLACE_FROM_TRASH_TO_DECK": return `Choose ${amount} card(s) from your trash to place in your deck as cost`;
    case "PLACE_SELF_AND_TRASH_TO_DECK": return `Choose ${amount} card(s) from your trash to place in your deck with this Character as cost`;
    case "PLACE_SELF_AND_HAND_TO_DECK": return "Choose 1 card from your hand to place in your deck with this Stage as cost";
    case "REST_CARDS": return `Choose ${amount} card(s) to rest as cost`;
    case "TRASH_OWN_CHARACTER": return `Choose ${amount} character(s) to trash as cost`;
    case "REVEAL_FROM_HAND": return `Choose ${amount} card(s) from hand to reveal as cost`;
    case "CHOOSE_ONE_COST": return "Choose a cost to pay";
    default: return "Select card(s) as cost";
  }
}

/** Summarize every cost in a choice branch for its option label. */
export function deriveBranchLabel(branch: Cost[]): string {
  return branch.map((c) => getCostLabel(c)).join(" + ");
}

/** Return the action verb used by the cost prompt's confirmation button. */
export function getCostCtaLabel(cost: Cost): string {
  switch (cost.type) {
    case "TRASH_FROM_HAND":
    case "TRASH_OWN_CHARACTER":
    case "TRASH_FROM_LIFE": return "Trash";
    case "KO_OWN_CHARACTER": return "KO";
    case "RETURN_OWN_CHARACTER_TO_HAND": return "Return";
    case "PLACE_OWN_CHARACTER_TO_DECK":
    case "PLACE_HAND_TO_DECK":
    case "PLACE_FROM_TRASH_TO_DECK":
    case "PLACE_SELF_AND_TRASH_TO_DECK": return "Place on Deck";
    case "PLACE_SELF_AND_HAND_TO_DECK": return "Place on Deck";
    case "ADD_OWN_CHARACTER_TO_LIFE": return "Add to Life";
    case "REST_CARDS":
    case "REST_NAMED_CARD": return "Rest";
    case "REVEAL_FROM_HAND": return "Reveal";
    default: return "Confirm";
  }
}

/** Map a pending prompt type to the effect-stack phase that resumes it. */
export function promptTypeToPhase(promptType: string): EffectStackFrame["phase"] {
  switch (promptType) {
    case "OPTIONAL_EFFECT": return "AWAITING_OPTIONAL_RESPONSE";
    case "SELECT_TARGET": return "AWAITING_TARGET_SELECTION";
    case "REDISTRIBUTE_DON": return "AWAITING_TARGET_SELECTION";
    case "ARRANGE_TOP_CARDS": return "AWAITING_ARRANGE_CARDS";
    case "PLAYER_CHOICE": return "AWAITING_PLAYER_CHOICE";
    default: return "AWAITING_TARGET_SELECTION";
  }
}
