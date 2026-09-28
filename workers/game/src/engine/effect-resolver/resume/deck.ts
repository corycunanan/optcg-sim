import { getPlayEntryState } from "../../play-entry-state.js";
/**
 * ARRANGE_TOP_CARDS resume handlers — response to the player's arrangement
 * after SEARCH_DECK / SEARCH_TRASH_THE_REST / SEARCH_AND_PLAY / DECK_SCRY,
 * plus the life reorder response for REORDER_ALL_LIFE.
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
import { getDeckScryDestination } from "../actions/draw-search.js";

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

/**
 * Announce the searched picks. A printed search reveals its picks to both
 * players (rule 11-2-1); `reveal: false` (e.g. OP16-119, per its FAQ) keeps
 * the identities controller-only so the owner still learns what they took,
 * while the event visibility policy redacts them for the opponent and
 * spectators.
 */
function pushSearchPickReveal(
  events: PendingEvent[],
  keptCards: CardInstance[],
  controller: 0 | 1,
  reveal: boolean | undefined,
): void {
  if (keptCards.length === 0) return;
  const cards = keptCards.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId }));
  events.push({
    type: "CARDS_REVEALED",
    playerIndex: controller,
    payload: reveal === false
      ? { cards, source: "search", visibility: "CONTROLLER_ONLY", visibleTo: controller }
      : { cards, source: "search", visibility: "BOTH" },
  });
}

export const SEARCH_PICK_DESTINATIONS = [
  "HAND",
  "TRASH",
  "LIFE",
  "LIFE_TOP",
] as const;

function moveSearchPicksToDestination(
  state: GameState,
  keptCards: CardInstance[],
  controller: 0 | 1,
  pickDestination: string | undefined,
  face: "UP" | "DOWN" | undefined,
  events: PendingEvent[],
): GameState {
  const normalizedDestination = (pickDestination ?? "HAND").toUpperCase();
  const pickDest = SEARCH_PICK_DESTINATIONS.find(
    (destination) => destination === normalizedDestination,
  ) ?? "HAND";
  let nextState = state;

  switch (pickDest) {
    case "TRASH": {
      const trashedEvents: PendingEvent[] = [];
      for (const kept of [...keptCards].reverse()) {
        const moved = transitionCard(nextState, kept.instanceId, "TRASH", {
          position: "TOP",
        });
        if (moved) {
          nextState = moved.state;
          trashedEvents.unshift({
            type: "CARD_TRASHED",
            playerIndex: controller,
            payload: {
              cardInstanceId: moved.fact.oldInstanceId,
              newCardInstanceId: moved.fact.newInstanceId,
              cardId: moved.fact.cardId,
              reason: "search_trash",
            },
          });
        }
      }
      events.push(...trashedEvents);
      return nextState;
    }
    case "LIFE":
    case "LIFE_TOP": {
      for (const kept of keptCards) {
        // OP16-119: picked card goes to the top of Life (face-down unless the
        // schema says otherwise).
        const lifeFace = face ?? "DOWN";
        const moved = transitionCard(nextState, kept.instanceId, "LIFE", {
          position: "TOP",
          lifeFace,
        });
        if (moved) nextState = moved.state;
      }
      return nextState;
    }
    default:
      for (const kept of keptCards) {
        const moved = transitionCard(nextState, kept.instanceId, "HAND");
        if (moved) {
          nextState = moved.state;
          events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: kept.cardId, cardInstanceId: moved.fact.newInstanceId, source: "search" } });
        }
      }
      return nextState;
    }
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
  arrangement: import("../../../types.js").ReturnToDeckArrangement | undefined,
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

  const pendingOwner = arrangement?.remainingOwners[0];
  const nextArrangement = arrangement && pendingOwner !== undefined
    ? {
        ...arrangement,
        orderedOwnerGroups: [
          ...arrangement.orderedOwnerGroups,
          { owner: pendingOwner, targetIds: ordered },
        ],
        remainingOwners: arrangement.remainingOwners.slice(1),
      }
    : {
        targetIds: ordered,
        orderedOwnerGroups: [],
        remainingOwners: [],
      };

  return executeReturnToDeck(
    state,
    pausedAction,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs,
    nextArrangement.targetIds,
    services,
    nextArrangement,
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
  const searchValid = validTargets ?? [];
  const requestedKept = action.keptCardInstanceIds?.length
    ? action.keptCardInstanceIds
    : (action.keptCardInstanceId ? [action.keptCardInstanceId] : []);
  const pickLimit = getSearchAndPlayPickLimit(sp, searchValid.length);
  const keptIds = [...new Set(requestedKept)]
    .filter((id) => searchValid.includes(id))
    .slice(0, pickLimit);
  const ordered = (action.orderedInstanceIds ?? []).filter((id) => !keptIds.includes(id));

  const { restOfDeck, arrangedCards, keptCards } = computeArrangeContext(p.deck, keptIds, ordered);

  let nextState = state;
  pushSearchPickReveal(events, keptCards, controller, sp.reveal);
  nextState = moveSearchPicksToDestination(
    nextState,
    keptCards,
    controller,
    sp.pick_destination,
    sp.face as "UP" | "DOWN" | undefined,
    events,
  );

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
  const searchValid = validTargets ?? [];
  const requestedKept = action.keptCardInstanceIds?.length
    ? action.keptCardInstanceIds
    : (action.keptCardInstanceId ? [action.keptCardInstanceId] : []);
  const pickLimit = getSearchAndPlayPickLimit(sp, searchValid.length);
  const keptIds = [...new Set(requestedKept)]
    .filter((id) => searchValid.includes(id))
    .slice(0, pickLimit);
  const ordered = (action.orderedInstanceIds ?? []).filter((id) => !keptIds.includes(id));

  const { restOfDeck, arrangedCards: remainingCards, keptCards } = computeArrangeContext(
    p.deck,
    keptIds,
    ordered,
  );

  let nextState = state;
  pushSearchPickReveal(events, keptCards, controller, sp.reveal);
  nextState = moveSearchPicksToDestination(
    nextState,
    keptCards,
    controller,
    sp.pick_destination,
    undefined,
    events,
  );

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
      const entryState = getPlayEntryState(nextState, controller, data, cardDb, sap.entry_state);
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

export type DeckScryResumeResult =
  | { rejected: true }
  | { rejected: false; state: GameState };

/**
 * DECK_SCRY resume: place the looked-at group, whole and in the chosen order,
 * at the chosen end of the deck (OP17-050 FAQ: the group is never split).
 *
 * The response must be exactly the looked-at group — same cards, each once,
 * nothing kept — and those cards must still be the top of the deck. Anything
 * else is rejected without mutating state, following the established resume
 * rejection contract (handleFieldToLifePosition in ./choice.ts): the stack
 * dispatcher restores the paused frame and resumePromptLifecycle restores the
 * pre-response state and reports responseRejected, so the prompt stays
 * pending. The wire action carries one destination for the whole group, so a
 * per-card split is not representable.
 *
 * `validTargets` holds the looked-at instance ids (executeDeckScry). Frames
 * persisted before OPT-839 recorded none; the deck cannot change while the
 * prompt is pending, so their group is re-derived with the size the base
 * engine actually showed: `look_at ?? 5`, deliberately ignoring the `count`
 * alias. Base ignored `count` (OP02-056 showed 5 cards), and the session gate
 * (validateArrangeResponse) demands every card the saved prompt showed, so
 * any other size would leave such a prompt unanswerable.
 *
 * Reordering cards inside the deck is not a zone transition
 * (ZONE-TRANSITION-CONTRACT): instances keep their identities.
 */
export function handleArrangeDeckScry(
  state: GameState,
  action: GameAction,
  pausedAction: Action | null,
  controller: 0 | 1,
  validTargets: string[] | undefined,
): DeckScryResumeResult | null {
  if (!pausedAction || pausedAction.type !== "DECK_SCRY") return null;
  if (action.type !== "ARRANGE_TOP_CARDS") return { rejected: true };

  const params = getActionParams(pausedAction, "DECK_SCRY");
  const deck = state.players[controller].deck;
  const group = validTargets && validTargets.length > 0
    ? validTargets
    : deck.slice(0, legacyDeckScryGroupSize(params, deck.length)).map((card) => card.instanceId);
  const groupSet = new Set(group);

  const kept = [
    ...(action.keptCardInstanceIds ?? []),
    ...(action.keptCardInstanceId ? [action.keptCardInstanceId] : []),
  ];
  const ordered = action.orderedInstanceIds ?? [];
  if (
    kept.length > 0 ||
    ordered.length !== group.length ||
    new Set(ordered).size !== ordered.length ||
    ordered.some((id) => !groupSet.has(id))
  ) {
    return { rejected: true };
  }

  const top = deck.slice(0, group.length);
  if (top.length !== group.length || top.some((card) => !groupSet.has(card.instanceId))) {
    return { rejected: true };
  }

  const allowed = getDeckScryDestination(params);
  if (
    (allowed === "TOP" && action.destination !== "top") ||
    (allowed === "BOTTOM" && action.destination !== "bottom")
  ) {
    return { rejected: true };
  }

  const byId = new Map(top.map((card) => [card.instanceId, card]));
  const arranged = ordered.map((id) => byId.get(id)).filter(isPresent);
  const newDeck = placeArrangedInDeck(deck.slice(group.length), arranged, action.destination);

  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[controller] = { ...state.players[controller], deck: newDeck };
  return { rejected: false, state: { ...state, players } };
}

/** Pre-OPT-839 group size (executeDeckScry on base): `count` was ignored. */
function legacyDeckScryGroupSize(
  params: { look_at?: number },
  deckSize: number,
): number {
  return Math.max(0, Math.min(params.look_at ?? 5, deckSize));
}
