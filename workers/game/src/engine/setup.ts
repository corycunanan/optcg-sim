/**
 * Game Setup
 *
 * Builds the initial GameState from a GameInitPayload:
 * shuffle decks, place leaders, set life, deal opening hands, handle mulligan.
 */

import type {
  CardData,
  CardInstance,
  DonInstance,
  GameInitPayload,
  GameState,
  LifeCard,
  PlayerInitData,
  TurnState,
} from "../types.js";
import { nanoid } from "../util/nanoid.js";
import { injectSchemasIntoCardDb } from "./schema-registry.js";
import { registerTriggersForCard } from "./triggers.js";

export function buildInitialState(payload: GameInitPayload): {
  state: GameState;
  cardDb: Map<string, CardData>;
} {
  const cardDb = new Map<string, CardData>();

  // Populate cardDb from both players' deck data
  for (const player of [payload.player1, payload.player2]) {
    cardDb.set(player.leader.cardData.id, player.leader.cardData);
    for (const entry of player.deck) {
      cardDb.set(entry.cardData.id, entry.cardData);
    }
  }

  // Inject authored effect schemas into cardDb
  injectSchemasIntoCardDb(cardDb);

  const [p0State, p0Deck] = buildPlayerDeck(payload.player1, 0 as const, cardDb);
  const [p1State, p1Deck] = buildPlayerDeck(payload.player2, 1 as const, cardDb);

  // Shuffle decks; in dev (searchersFirst) move SEARCH_DECK cards to the front
  const searcherIds0 = payload.player1.debug?.searchersFirst ? getSearchDeckCardIds(cardDb) : undefined;
  const searcherIds1 = payload.player2.debug?.searchersFirst ? getSearchDeckCardIds(cardDb) : undefined;
  const shuffled0 = prioritizeDeck(shuffleDeck(p0Deck), searcherIds0);
  const shuffled1 = prioritizeDeck(shuffleDeck(p1Deck), searcherIds1);

  // Deal opening hands (5 cards each)
  const [hand0, remainingDeck0] = drawN(shuffled0, 5);
  const [hand1, remainingDeck1] = drawN(shuffled1, 5);

  // Place life cards (from top of deck, placed bottom-up per rules §5-2-1-7)
  // Fallback chain: life → cost (vegapull stores leader life in cost) → 5
  const leader0Data = cardDb.get(payload.player1.leader.cardId);
  const leader1Data = cardDb.get(payload.player2.leader.cardId);
  const leaderLife0 = leader0Data?.life ?? leader0Data?.cost ?? 5;
  const leaderLife1 = leader1Data?.life ?? leader1Data?.cost ?? 5;

  const [lifeCards0, deckAfterLife0] = drawN(remainingDeck0, leaderLife0);
  const [lifeCards1, deckAfterLife1] = drawN(remainingDeck1, leaderLife1);

  // §5-2-1-7: Top-of-deck card placed at bottom of Life area (removed last).
  // drawN takes from deck[0] (top), so reverse so deck-top ends up at the end of the array.
  // removeTopLifeCard() takes life[0], so life[0] = deepest card = last drawn = removed first.
  const lifeArea0: LifeCard[] = lifeCards0.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const })).reverse();
  const lifeArea1: LifeCard[] = lifeCards1.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const })).reverse();

  // Build 10 DON!! cards per player
  const donDeck0 = buildDonDeck(0 as const);
  const donDeck1 = buildDonDeck(1 as const);

  const player0 = {
    ...p0State,
    hand: hand0,
    deck: deckAfterLife0,
    life: lifeArea0,
    donDeck: donDeck0,
  };

  const player1 = {
    ...p1State,
    hand: hand1,
    deck: deckAfterLife1,
    life: lifeArea1,
    donDeck: donDeck1,
  };

  const turn: TurnState = {
    number: 1,
    activePlayerIndex: 0,
    phase: "REFRESH",
    battleSubPhase: null,
    battle: null,
    oncePerTurnUsed: {},
    actionsPerformedThisTurn: [],
  };

  let state: GameState = {
    id: payload.gameId,
    players: [player0, player1],
    turn,
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pendingPrompt: null,
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
  };

  // Register leader triggers — leaders enter the LEADER zone at setup, not via PLAY_CARD,
  // so we must manually seed the trigger registry for both players' leaders here.
  for (const player of state.players) {
    const leaderData = cardDb.get(player.leader.cardId);
    if (leaderData) {
      state = registerTriggersForCard(state, player.leader, leaderData);
    }
  }

  return { state, cardDb };
}

// ─── Mulligan ─────────────────────────────────────────────────────────────────

/**
 * Apply a mulligan for a player: return hand to deck, reshuffle, draw 5 new cards.
 * Only valid during setup (before game starts).
 */
export function applyMulligan(
  state: GameState,
  playerIndex: 0 | 1,
): GameState {
  const player = state.players[playerIndex];

  // Return hand to deck and reshuffle
  const combined = [...player.hand, ...player.deck];
  const reshuffled = shuffleDeck(combined);

  // Draw 5 new cards
  const [newHand, newDeck] = drawN(reshuffled, 5);

  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = { ...player, hand: newHand, deck: newDeck };

  return { ...state, players: newPlayers };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type PartialPlayerState = Omit<import("../types.js").PlayerState, "hand" | "deck" | "life" | "donDeck">;

function buildPlayerDeck(
  playerData: PlayerInitData,
  playerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
): [PartialPlayerState, CardInstance[]] {
  void cardDb;

  const leader: CardInstance = {
    instanceId: nanoid(),
    cardId: playerData.leader.cardId,
    zone: "LEADER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: playerIndex,
    owner: playerIndex,
  };

  // Build deck cards — expand quantities
  const deckCards: CardInstance[] = [];
  for (const entry of playerData.deck) {
    for (let i = 0; i < entry.quantity; i++) {
      deckCards.push({
        instanceId: nanoid(),
        cardId: entry.cardId,
        zone: "DECK",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller: playerIndex,
        owner: playerIndex,
      });
    }
  }

  const partialState: PartialPlayerState = {
    playerId: playerData.userId,
    leader,
    characters: [],
    stage: null,
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    connected: false,
    awayReason: null,
    rejoinDeadlineAt: null,
  };

  return [partialState, deckCards];
}

function buildDonDeck(owner: 0 | 1): DonInstance[] {
  return Array.from({ length: 10 }, () => ({
    instanceId: nanoid(),
    state: "ACTIVE" as const,
    attachedTo: null,
  }));
  void owner;
}

/**
 * Returns the set of cardIds in the given cardDb that have at least one SEARCH_DECK action.
 * Used in dev mode to put searcher cards at the top of the deck.
 */
function getSearchDeckCardIds(cardDb: Map<string, CardData>): Set<string> {
  const ids = new Set<string>();
  for (const [cardId, data] of cardDb.entries()) {
    const schema = data.effectSchema as import("./effect-types.js").EffectSchema | null;
    if (schema?.effects.some((b) => b.actions?.some((a) => a.type === "SEARCH_DECK"))) {
      ids.add(cardId);
    }
  }
  return ids;
}

/**
 * Move cards whose cardId is in priorityIds to the front of the deck (one copy each),
 * leaving all other cards in their shuffled positions after them.
 * Used in dev mode to guarantee searcher cards appear in the opening hand.
 */
function prioritizeDeck(deck: CardInstance[], priorityIds?: Set<string>): CardInstance[] {
  if (!priorityIds || priorityIds.size === 0) return deck;

  const priority: CardInstance[] = [];
  const rest: CardInstance[] = [];
  const seen = new Set<string>(); // track which cardIds we've already placed (one copy each)

  for (const card of deck) {
    if (priorityIds.has(card.cardId) && !seen.has(card.cardId)) {
      seen.add(card.cardId);
      priority.push(card);
    } else {
      rest.push(card);
    }
  }

  return [...priority, ...rest];
}

function shuffleDeck(cards: CardInstance[]): CardInstance[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawN(deck: CardInstance[], n: number): [CardInstance[], CardInstance[]] {
  const hand = deck.slice(0, n).map((c) => ({ ...c, zone: "HAND" as const }));
  const remaining = deck.slice(n);
  return [hand, remaining];
}
