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
  keptIds: string | string[] | undefined,
  ordered: string[],
): {
  restOfDeck: CardInstance[];
  arrangedCards: CardInstance[];
  kept: CardInstance | undefined;
  keptCards: CardInstance[];
} {
  const keptList = (keptIds === undefined ? [] : Array.isArray(keptIds) ? keptIds : [keptIds]).filter(Boolean);
  const removedIds = new Set<string>([...ordered, ...keptList]);
  const restOfDeck = deck.filter((c) => !removedIds.has(c.instanceId));
  const arrangedCards = ordered
    .map((id) => deck.find((c) => c.instanceId === id))
    .filter(Boolean) as CardInstance[];
  const keptCards = keptList
    .map((id) => deck.find((c) => c.instanceId === id))
    .filter(Boolean) as CardInstance[];
  return { restOfDeck, arrangedCards, kept: keptCards[0], keptCards };
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

function resolveRestDestination(
  schemaDestination: string,
  requestedDestination: "top" | "bottom",
): "top" | "bottom" {
  const normalized = schemaDestination.toUpperCase();
  if (normalized === "TOP_OR_BOTTOM") return requestedDestination;
  return normalized === "TOP" ? "top" : "bottom";
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

  // An explicit empty validTargets means the search matched nothing.
  const searchValid = validTargets ?? [];
  const validatedKeptId = keptId && searchValid.includes(keptId)
    ? keptId
    : undefined;

  const { restOfDeck, arrangedCards, kept } = computeArrangeContext(p.deck, validatedKeptId, ordered);

  const pickDest = (sp.pick_destination ?? "HAND").toUpperCase();
  let newHand = [...p.hand];
  let newLife = p.life;
  if (validatedKeptId && kept) {
    if (pickDest === "LIFE" || pickDest === "LIFE_TOP") {
      // OP16-119: picked card goes to the top of Life (face-down unless the
      // schema says otherwise).
      const face = (sp.face as "UP" | "DOWN") ?? "DOWN";
      newLife = [{ instanceId: kept.instanceId, cardId: kept.cardId, face }, ...p.life];
    } else {
      newHand = [...newHand, { ...kept, zone: "HAND" as const }];
      events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, source: "search" } });
    }
  }

  const destination = resolveRestDestination(restDest, action.destination);
  const newDeck = placeArrangedInDeck(restOfDeck, arrangedCards, destination);

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, deck: newDeck, hand: newHand, life: newLife };
  return { ...state, players: newPlayers };
}

export function handleArrangeSearchTrashTheRest(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  validTargets: string[] | undefined,
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
  const searchValid = validTargets ?? [];
  const validatedKeptId = keptId && searchValid.includes(keptId)
    ? keptId
    : undefined;

  const { restOfDeck, arrangedCards: remainingCards, kept } = computeArrangeContext(
    p.deck,
    validatedKeptId,
    ordered,
  );

  let newHand = [...p.hand];
  if (validatedKeptId && kept) {
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
    const destination = resolveRestDestination(restDest, action.destination);
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
  validTargets?: string[],
): GameState | null {
  if (action.type !== "ARRANGE_TOP_CARDS" || !pausedAction || pausedAction.type !== "SEARCH_AND_PLAY") {
    return null;
  }

  const sap = getActionParams(pausedAction, "SEARCH_AND_PLAY");
  const restDest = sap.rest_destination ?? "BOTTOM";
  const shuffleAfter = sap.shuffle_after ?? false;
  const searchFullDeck = sap.search_full_deck ?? false;
  const entryState = sap.entry_state ?? "ACTIVE";
  const pickLimit = sap.pick?.up_to ?? 1;

  const p = state.players[controller];
  // Multi-pick ("play up to N"): the client sends keptCardInstanceIds; the
  // legacy single keptCardInstanceId remains the fallback. Enforce the
  // filter's validTargets and the pick limit server-side.
  const requestedKept = action.keptCardInstanceIds?.length
    ? action.keptCardInstanceIds
    : (action.keptCardInstanceId ? [action.keptCardInstanceId] : []);
  const searchValid = validTargets ?? [];
  const keptIds = [...new Set(requestedKept)]
    .filter((id) => searchValid.includes(id))
    .slice(0, pickLimit);
  const ordered = (action.orderedInstanceIds ?? []).filter((id) => !keptIds.includes(id));

  const { restOfDeck, arrangedCards, keptCards } = computeArrangeContext(p.deck, keptIds, ordered);

  // Play each kept card to the field (CHARACTER or STAGE zone)
  const newCharacters = [...p.characters] as (typeof p.characters);
  let newStage = p.stage;
  let newTrash = [...p.trash];
  const unplayable: CardInstance[] = [];
  for (const kept of keptCards) {
    const data = cardDb.get(kept.cardId);
    if (data && data.type.toUpperCase() === "CHARACTER") {
      const charSlot = newCharacters.indexOf(null);
      if (charSlot === -1) {
        // Character area full — the card joins the rest pile instead of vanishing.
        unplayable.push(kept);
        continue;
      }
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
      newCharacters[charSlot] = newChar;
      events.push({
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: {
          cardInstanceId: newChar.instanceId,
          cardId: kept.cardId,
          zone: "CHARACTER",
          source: "search_and_play",
          playedRested: entryState === "RESTED",
          sourceZone: "DECK",
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
        payload: { cardInstanceId: newStage.instanceId, cardId: kept.cardId, zone: "STAGE", source: "search_and_play", sourceZone: "DECK" },
      });
    }
  }

  let newDeck: CardInstance[];
  if (searchFullDeck) {
    // restOfDeck excludes every orderedInstanceId, so arranged-but-unkept
    // cards must rejoin the deck here or they vanish from the game.
    newDeck = [...restOfDeck, ...arrangedCards, ...unplayable];
  } else {
    const destination = resolveRestDestination(restDest, action.destination);
    newDeck = placeArrangedInDeck(restOfDeck, [...arrangedCards, ...unplayable], destination);
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
