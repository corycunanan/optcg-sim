/**
 * ARRANGE_TOP_CARDS resume handlers — response to the player's arrangement
 * after SEARCH_DECK / SEARCH_TRASH_THE_REST / SEARCH_AND_PLAY, plus the life
 * reorder response for REORDER_ALL_LIFE.
 *
 * Each handler mutates the caller's `events` accumulator and returns the
 * updated state, or null to fall through to the next branch.
 */

import type { Action } from "../../effect-types.js";
import { getActionParams } from "../../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  GameAction,
  PendingEvent,
} from "../../../types.js";
import { shuffleArray } from "../action-utils.js";
import { nanoid } from "../../../util/nanoid.js";

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Compute the deck-rearrangement primitives shared across arrange-resume
 * branches: the leftover slice of the deck (after removing kept + ordered),
 * the arranged cards in player-specified order, and the kept card (if any).
 */
function computeArrangeContext(
  deck: CardInstance[],
  keptId: string | undefined,
  ordered: string[],
): {
  restOfDeck: CardInstance[];
  arrangedCards: CardInstance[];
  kept: CardInstance | undefined;
} {
  const removedIds = new Set<string>(ordered);
  if (keptId) removedIds.add(keptId);
  const restOfDeck = deck.filter((c) => !removedIds.has(c.instanceId));
  const arrangedCards = ordered
    .map((id) => deck.find((c) => c.instanceId === id))
    .filter(Boolean) as CardInstance[];
  const kept = keptId ? deck.find((c) => c.instanceId === keptId) : undefined;
  return { restOfDeck, arrangedCards, kept };
}

/**
 * Concatenate the remaining deck with the arranged cards based on the
 * destination placement. Shared by SEARCH_DECK, SEARCH_TRASH_THE_REST
 * (non-trash path), and SEARCH_AND_PLAY.
 */
function placeArrangedInDeck(
  restOfDeck: CardInstance[],
  arrangedCards: CardInstance[],
  destination: string,
): CardInstance[] {
  return destination === "bottom"
    ? [...restOfDeck, ...arrangedCards]
    : [...arrangedCards, ...restOfDeck];
}

// ─── Branch handlers ────────────────────────────────────────────────────────

export function handleArrangeSearchDeck(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  validTargets: string[] | undefined,
  events: PendingEvent[],
): GameState | null {
  if (action.type !== "ARRANGE_TOP_CARDS" || !pausedAction || pausedAction.type !== "SEARCH_DECK") {
    return null;
  }

  const sp = getActionParams(pausedAction, "SEARCH_DECK");
  const restDest = sp.rest_destination ?? "BOTTOM";

  const p = state.players[controller];
  const keptId = action.keptCardInstanceId;
  const ordered = action.orderedInstanceIds ?? [];

  // Validate kept card is in validTargets (if filter was applied)
  const searchValid = validTargets ?? [];
  const validatedKeptId = keptId && (searchValid.length === 0 || searchValid.includes(keptId))
    ? keptId
    : undefined;

  const { restOfDeck, arrangedCards, kept } = computeArrangeContext(p.deck, validatedKeptId, ordered);

  let newHand = [...p.hand];
  if (validatedKeptId && kept) {
    newHand = [...newHand, { ...kept, zone: "HAND" as const }];
    events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, source: "search" } });
  }

  const destination = action.destination ?? restDest.toLowerCase();
  const newDeck = placeArrangedInDeck(restOfDeck, arrangedCards, destination);

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, deck: newDeck, hand: newHand };
  return { ...state, players: newPlayers };
}

export function handleArrangeSearchTrashTheRest(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  events: PendingEvent[],
): GameState | null {
  if (action.type !== "ARRANGE_TOP_CARDS" || !pausedAction || pausedAction.type !== "SEARCH_TRASH_THE_REST") {
    return null;
  }

  const sp = (pausedAction.params ?? {}) as Record<string, unknown>;
  const restDest = (sp.rest_destination as string) ?? "TRASH";

  const p = state.players[controller];
  const keptId = action.keptCardInstanceId;
  const ordered = action.orderedInstanceIds ?? [];

  const { restOfDeck, arrangedCards: remainingCards, kept } = computeArrangeContext(p.deck, keptId, ordered);

  let newHand = [...p.hand];
  if (keptId && kept) {
    newHand = [...newHand, { ...kept, zone: "HAND" as const }];
    events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, source: "search" } });
  }

  let newDeck: CardInstance[];
  let newTrash = [...p.trash];

  if (restDest.toUpperCase() === "TRASH") {
    // Trash the remaining cards
    newDeck = restOfDeck;
    for (const card of remainingCards) {
      newTrash = [{ ...card, zone: "TRASH" as const } as CardInstance, ...newTrash];
      events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { cardId: card.cardId, reason: "search_trash" } });
    }
  } else {
    // Place at bottom (or top) like SEARCH_DECK
    const destination = action.destination ?? restDest.toLowerCase();
    newDeck = placeArrangedInDeck(restOfDeck, remainingCards, destination);
    newTrash = p.trash;
  }

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, deck: newDeck, hand: newHand, trash: newTrash };
  return { ...state, players: newPlayers };
}

export function handleArrangeSearchAndPlay(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
): GameState | null {
  if (action.type !== "ARRANGE_TOP_CARDS" || !pausedAction || pausedAction.type !== "SEARCH_AND_PLAY") {
    return null;
  }

  const sap = getActionParams(pausedAction, "SEARCH_AND_PLAY");
  const restDest = sap.rest_destination ?? "BOTTOM";
  const shuffleAfter = sap.shuffle_after ?? false;
  const searchFullDeck = sap.search_full_deck ?? false;
  const entryState = sap.entry_state ?? "ACTIVE";

  const p = state.players[controller];
  const keptId = action.keptCardInstanceId;
  const ordered = action.orderedInstanceIds ?? [];

  const { restOfDeck, arrangedCards, kept } = computeArrangeContext(p.deck, keptId, ordered);

  // Play kept card to field (CHARACTER or STAGE zone)
  let newCharacters = [...p.characters] as (typeof p.characters);
  let newStage = p.stage;
  let newTrash = [...p.trash];
  if (keptId && kept) {
    const data = cardDb.get(kept.cardId);
    if (data && data.type.toUpperCase() === "CHARACTER") {
      const newChar: CardInstance = {
        ...kept,
        instanceId: nanoid(),
        zone: "CHARACTER",
        state: entryState,
        attachedDon: [],
        turnPlayed: state.turn.number,
        controller,
        owner: controller,
      };
      const charSlot = newCharacters.indexOf(null);
      if (charSlot !== -1) newCharacters[charSlot] = newChar;
      events.push({
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: {
          cardInstanceId: newChar.instanceId,
          cardId: kept.cardId,
          zone: "CHARACTER",
          source: "search_and_play",
          playedRested: entryState === "RESTED",
        },
      });
    } else if (data && data.type.toUpperCase() === "STAGE") {
      // If a Stage already exists, trash it first
      if (newStage) {
        newTrash = [{ ...newStage, zone: "TRASH" as const } as CardInstance, ...newTrash];
      }
      newStage = {
        ...kept,
        instanceId: nanoid(),
        zone: "STAGE" as const,
        state: "ACTIVE" as const,
        attachedDon: [],
        turnPlayed: state.turn.number,
        controller,
        owner: controller,
      } as CardInstance;
      events.push({
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: { cardInstanceId: newStage.instanceId, cardId: kept.cardId, zone: "STAGE", source: "search_and_play" },
      });
    }
  }

  let newDeck: CardInstance[];
  if (searchFullDeck) {
    newDeck = restOfDeck;
  } else {
    const destination = action.destination ?? restDest.toLowerCase();
    newDeck = placeArrangedInDeck(restOfDeck, arrangedCards, destination);
  }

  if (shuffleAfter) {
    newDeck = shuffleArray(newDeck);
  }

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, deck: newDeck, characters: newCharacters, stage: newStage, trash: newTrash };
  return { ...state, players: newPlayers };
}

export function handleArrangeReorderLife(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  events: PendingEvent[],
): GameState | null {
  if (action.type !== "ARRANGE_TOP_CARDS" || !pausedAction || pausedAction.type !== "REORDER_ALL_LIFE") {
    return null;
  }

  // Determine target player from the original action's target
  const targetController = (pausedAction.target?.type === "OPPONENT_LIFE" || pausedAction.target?.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;

  const p = state.players[targetController];
  const ordered = action.orderedInstanceIds ?? [];

  // Build new life array in the player's specified order
  const lifeById = new Map(p.life.map((l) => [l.instanceId, l]));
  const newLife = ordered
    .map((id) => lifeById.get(id))
    .filter(Boolean) as typeof p.life;

  // Append any life cards not included in the ordered list (shouldn't happen, but safety)
  for (const l of p.life) {
    if (!ordered.includes(l.instanceId)) newLife.push(l);
  }

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = { ...p, life: newLife };

  events.push({
    type: "LIFE_REORDERED",
    playerIndex: targetController,
    payload: { orderedInstanceIds: ordered },
  } as unknown as PendingEvent);

  return { ...state, players: newPlayers };
}
