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

  const [p0State, p0Deck] = buildPlayerDeck(payload.player1, 0 as const, cardDb);
  const [p1State, p1Deck] = buildPlayerDeck(payload.player2, 1 as const, cardDb);

  // Shuffle decks
  const shuffled0 = shuffleDeck(p0Deck);
  const shuffled1 = shuffleDeck(p1Deck);

  // Deal opening hands (5 cards each)
  const [hand0, remainingDeck0] = drawN(shuffled0, 5);
  const [hand1, remainingDeck1] = drawN(shuffled1, 5);

  // Place life cards (from top of deck, placed bottom-up per rules §5-2-1-7)
  const leaderLife0 = cardDb.get(payload.player1.leader.cardId)?.life ?? 5;
  const leaderLife1 = cardDb.get(payload.player2.leader.cardId)?.life ?? 5;

  const [lifeCards0, deckAfterLife0] = drawN(remainingDeck0, leaderLife0);
  const [lifeCards1, deckAfterLife1] = drawN(remainingDeck1, leaderLife1);

  // Life area: cards placed from top of deck → bottom of life area
  // So the first card drawn from life was the LAST card placed.
  const lifeArea0: LifeCard[] = lifeCards0.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const }));
  const lifeArea1: LifeCard[] = lifeCards1.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const }));

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

  const state: GameState = {
    id: payload.gameId,
    players: [player0, player1],
    turn,
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
  };

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
  _cardDb: Map<string, CardData>,
): [PartialPlayerState, CardInstance[]] {
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
