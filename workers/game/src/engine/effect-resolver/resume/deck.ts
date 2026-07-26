/**
 * ARRANGE_TOP_CARDS resume handlers — response to the player's arrangement
 * after SEARCH_DECK / SEARCH_TRASH_THE_REST / SEARCH_AND_PLAY, plus the life
 * reorder response for REORDER_ALL_LIFE.
 *
 * Each handler mutates the caller's `events` accumulator and returns the
 * updated state, or null to fall through to the next branch.
 */

import type { Action, EffectResult } from "../../effect-types.js";
import { getActionParams } from "../../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  GameAction,
  PendingEvent,
} from "../../../types.js";
import { transitionCard, transitionCards } from "../../zone-transition.js";
import { shuffleWithEngineContext } from "../../execution-context.js";
import { executeReturnToDeck } from "../actions/removal.js";
import type { EffectResolverServices } from "../services.js";
import type { ActionResult } from "../types.js";
import { isPresent } from "../../type-guards.js";
import { getSearchAndPlayPickLimit } from "../action-utils.js";

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
    .filter(isPresent);
  const keptCards = keptList
    .map((id) => deck.find((c) => c.instanceId === id))
    .filter(isPresent);
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

export function handleArrangeReturnToDeck(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  validTargets: string[] | undefined,
  services: EffectResolverServices,
): ActionResult | null {
  if (action.type !== "ARRANGE_TOP_CARDS" || !pausedAction || pausedAction.type !== "RETURN_TO_DECK") {
    return null;
  }

  const valid = validTargets ?? [];
  const validSet = new Set(valid);
  const ordered = [...new Set(action.orderedInstanceIds.filter((id) => validSet.has(id)))];
  const seen = new Set(ordered);
  for (const id of valid) {
    if (!seen.has(id)) ordered.push(id);
  }

  return executeReturnToDeck(
    state,
    pausedAction,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs,
    ordered,
    services,
    true,
  );
}

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
  let nextState = state;
  if (validatedKeptId && kept) {
    events.push({
      type: "CARDS_REVEALED",
      playerIndex: controller,
      payload: {
        cards: [{ instanceId: kept.instanceId, cardId: kept.cardId }],
        source: "search",
        visibility: "BOTH",
      },
    });
    if (pickDest === "LIFE" || pickDest === "LIFE_TOP") {
      // OP16-119: picked card goes to the top of Life (face-down unless the
      // schema says otherwise).
      const face = (sp.face as "UP" | "DOWN") ?? "DOWN";
      const moved = transitionCard(nextState, kept.instanceId, "LIFE", {
        position: "TOP",
        lifeFace: face,
      });
      if (moved) nextState = moved.state;
    } else {
      const moved = transitionCard(nextState, kept.instanceId, "HAND");
      if (moved) {
        nextState = moved.state;
        events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, cardInstanceId: moved.fact.newInstanceId, source: "search" } });
      }
    }
  }

  const destination = resolveRestDestination(restDest, action.destination);
  const newDeck = placeArrangedInDeck(restOfDeck, arrangedCards, destination);

  const current = nextState.players[controller];
  const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
  newPlayers[controller] = { ...current, deck: newDeck };
  return { ...nextState, players: newPlayers };
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

  const sp = getActionParams(pausedAction, "SEARCH_TRASH_THE_REST");
  const restDest = sp.rest_destination ?? "TRASH";

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

  let nextState = state;
  if (validatedKeptId && kept) {
    events.push({
      type: "CARDS_REVEALED",
      playerIndex: controller,
      payload: {
        cards: [{ instanceId: kept.instanceId, cardId: kept.cardId }],
        source: "search",
        visibility: "BOTH",
      },
    });
    const moved = transitionCard(nextState, kept.instanceId, "HAND");
    if (moved) {
      nextState = moved.state;
      events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, cardInstanceId: moved.fact.newInstanceId, source: "search" } });
    }
  }

  let newDeck: CardInstance[];

  if (restDest.toUpperCase() === "TRASH") {
    newDeck = restOfDeck;
    const moved = transitionCards(nextState, remainingCards.map((card) => card.instanceId), "TRASH", { position: "TOP" });
    nextState = moved.state;
    for (const transition of moved.transitions) {
      events.push({
        type: "CARD_TRASHED",
        playerIndex: controller,
        payload: {
          cardInstanceId: transition.fact.oldInstanceId,
          newCardInstanceId: transition.fact.newInstanceId,
          cardId: transition.fact.cardId,
          reason: "search_trash",
        },
      });
    }
  } else {
    // Place at bottom (or top) like SEARCH_DECK
    const destination = resolveRestDestination(restDest, action.destination);
    newDeck = placeArrangedInDeck(restOfDeck, remainingCards, destination);
  }

  const current = nextState.players[controller];
  const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
  newPlayers[controller] = { ...current, deck: newDeck };
  return { ...nextState, players: newPlayers };
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
  const searchValid = validTargets ?? [];
  const pickLimit = getSearchAndPlayPickLimit(sap, searchValid.length);

  const p = state.players[controller];
  // Multi-pick ("play up to N"): the client sends keptCardInstanceIds; the
  // legacy single keptCardInstanceId remains the fallback. Enforce the
  // filter's validTargets and the pick limit server-side.
  const requestedKept = action.keptCardInstanceIds?.length
    ? action.keptCardInstanceIds
    : (action.keptCardInstanceId ? [action.keptCardInstanceId] : []);
  const keptIds = [...new Set(requestedKept)]
    .filter((id) => searchValid.includes(id))
    .slice(0, pickLimit);
  const ordered = (action.orderedInstanceIds ?? []).filter((id) => !keptIds.includes(id));

  const { restOfDeck, arrangedCards, keptCards } = computeArrangeContext(p.deck, keptIds, ordered);

  // Play each kept card through the authoritative zone-transition contract.
  let nextState = state;
  const unplayable: CardInstance[] = [];
  for (const kept of keptCards) {
    const data = cardDb.get(kept.cardId);
    if (data && data.type.toUpperCase() === "CHARACTER") {
      const charSlot = nextState.players[controller].characters.indexOf(null);
      if (charSlot === -1) {
        // Character area full — the card joins the rest pile instead of vanishing.
        unplayable.push(kept);
        continue;
      }
      const moved = transitionCard(nextState, kept.instanceId, "CHARACTER", {
        slotIndex: charSlot,
        entryState,
        turnPlayed: state.turn.number,
      });
      if (!moved) {
        unplayable.push(kept);
        continue;
      }
      nextState = moved.state;
      events.push({
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: {
          cardInstanceId: moved.fact.newInstanceId,
          cardId: kept.cardId,
          zone: "CHARACTER",
          source: "search_and_play",
          playedRested: entryState === "RESTED",
          sourceZone: "DECK",
        },
      });
    } else if (data && data.type.toUpperCase() === "STAGE") {
      // If a Stage already exists, trash it first
      const existingStage = nextState.players[controller].stage;
      if (existingStage) {
        const replaced = transitionCard(nextState, existingStage.instanceId, "TRASH", {
          position: "TOP",
          preserveSourceTriggers: true,
        });
        if (!replaced) {
          unplayable.push(kept);
          continue;
        }
        nextState = replaced.state;
        events.push({
          type: "CARD_TRASHED",
          playerIndex: controller,
          payload: {
            cardInstanceId: existingStage.instanceId,
            newCardInstanceId: replaced.fact.newInstanceId,
            cardId: existingStage.cardId,
            reason: "stage_replaced",
          },
        });
      }
      const moved = transitionCard(nextState, kept.instanceId, "STAGE", {
        turnPlayed: state.turn.number,
      });
      if (!moved) {
        unplayable.push(kept);
        continue;
      }
      nextState = moved.state;
      events.push({
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: { cardInstanceId: moved.fact.newInstanceId, cardId: kept.cardId, zone: "STAGE", source: "search_and_play", sourceZone: "DECK" },
      });
    } else {
      unplayable.push(kept);
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
    const shuffled = shuffleWithEngineContext(nextState, newDeck);
    nextState = shuffled.state;
    newDeck = shuffled.values;
  }

  const current = nextState.players[controller];
  const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
  newPlayers[controller] = { ...current, deck: newDeck };
  return { ...nextState, players: newPlayers };
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
  });

  return { ...state, players: newPlayers };
}

export function handleArrangeLifeScry(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  validTargets: string[],
  events: PendingEvent[],
): GameState | null {
  if (
    action.type !== "ARRANGE_TOP_CARDS" ||
    !pausedAction ||
    pausedAction.type !== "LIFE_SCRY"
  ) {
    return null;
  }

  const selectedId = validTargets[0];
  if (!selectedId) return state;
  const owner = state.players[0].life.some((card) => card.instanceId === selectedId)
    ? 0
    : state.players[1].life.some((card) => card.instanceId === selectedId)
      ? 1
      : null;
  if (owner === null) return state;

  const player = state.players[owner];
  const selectedCard = player.life.find((card) => card.instanceId === selectedId);
  if (!selectedCard) return state;
  const remaining = player.life.filter((card) => card.instanceId !== selectedId);
  const life = action.destination === "bottom"
    ? [...remaining, selectedCard]
    : [selectedCard, ...remaining];
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[owner] = { ...player, life };

  // The mechanical reorder is private to the chooser. In particular, when
  // the chooser inspected the opponent's Life, this event cannot disclose the
  // selected identity to that Life's owner or to observers.
  events.push({
    type: "LIFE_REORDERED",
    playerIndex: controller,
    payload: { orderedInstanceIds: [selectedId] },
  });
  return { ...state, players };
}
