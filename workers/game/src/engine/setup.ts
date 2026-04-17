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
import type { EffectSchema } from "./effect-types.js";
import { nanoid } from "../util/nanoid.js";
import { injectSchemasIntoCardDb } from "./schema-registry.js";
import { registerTriggersForCard, registerReplacementsForCard, registerPermanentEffectsForCard } from "./triggers.js";

const DEFAULT_DON_DECK_SIZE = 10;

/**
 * OPT-228: Leaders may override the starting DON!! deck size via a
 * DON_DECK_SIZE_OVERRIDE rule_modification (e.g. OP15-058 Enel starts with 6).
 * The value is resolved once at setup and frozen into the state — runtime
 * negation of the Leader effect does not restore the default.
 */
function resolveDonDeckSize(leaderData: CardData | undefined): number {
  const schema = (leaderData?.effectSchema ?? null) as EffectSchema | null;
  const override = schema?.rule_modifications?.find(
    (m): m is { rule_type: "DON_DECK_SIZE_OVERRIDE"; size: number } =>
      m.rule_type === "DON_DECK_SIZE_OVERRIDE",
  );
  return override?.size ?? DEFAULT_DON_DECK_SIZE;
}

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

  // Resolve leader life values
  const leader0Data = cardDb.get(payload.player1.leader.cardId);
  const leader1Data = cardDb.get(payload.player2.leader.cardId);
  const leaderLife0 = leader0Data?.life ?? leader0Data?.cost ?? 5;
  const leaderLife1 = leader1Data?.life ?? leader1Data?.cost ?? 5;

  // Deal cards: use test order if configured, otherwise shuffle normally
  const deal0 = dealCards(p0Deck, leaderLife0, payload.player1.testOrder);
  const deal1 = dealCards(p1Deck, leaderLife1, payload.player2.testOrder);

  // Build DON!! deck per player (default 10, overridable per Leader — OPT-228).
  const donDeck0 = buildDonDeck(0 as const, resolveDonDeckSize(leader0Data));
  const donDeck1 = buildDonDeck(1 as const, resolveDonDeckSize(leader1Data));

  const player0 = {
    ...p0State,
    hand: deal0.hand,
    deck: deal0.deck,
    life: deal0.life,
    donDeck: donDeck0,
  };

  const player1 = {
    ...p1State,
    hand: deal1.hand,
    deck: deal1.deck,
    life: deal1.life,
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
    effectStack: [],
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
      state = registerReplacementsForCard(state, player.leader, leaderData);
      state = registerPermanentEffectsForCard(state, player.leader, leaderData);
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

  const deckList = playerData.deck.map((entry) => ({
    cardId: entry.cardId,
    count: entry.quantity,
  }));

  const partialState: PartialPlayerState = {
    playerId: playerData.userId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    deckList,
    connected: false,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: playerData.sleeveUrl ?? null,
    donArtUrl: playerData.donArtUrl ?? null,
  };

  return [partialState, deckCards];
}

function buildDonDeck(owner: 0 | 1, size: number = DEFAULT_DON_DECK_SIZE): DonInstance[] {
  return Array.from({ length: size }, () => ({
    instanceId: nanoid(),
    state: "ACTIVE" as const,
    attachedTo: null,
  }));
  void owner;
}

/**
 * Deal cards for a player: either apply a test order (fixed life + hand) or shuffle normally.
 * Falls back to normal shuffle if testOrder is invalid.
 */
function dealCards(
  expandedDeck: CardInstance[],
  leaderLife: number,
  testOrder?: { life: string[]; hand: string[] } | null,
): { hand: CardInstance[]; life: LifeCard[]; deck: CardInstance[] } {
  if (testOrder) {
    const result = applyTestOrder(expandedDeck, testOrder, leaderLife);
    if (result) return result;
    // Invalid test order — fall back to normal shuffle
    console.warn("Invalid testOrder, falling back to normal shuffle");
  }
  return normalDeal(expandedDeck, leaderLife);
}

/** Standard shuffle → hand → life pipeline. */
function normalDeal(
  expandedDeck: CardInstance[],
  leaderLife: number,
): { hand: CardInstance[]; life: LifeCard[]; deck: CardInstance[] } {
  const shuffled = shuffleDeck(expandedDeck);
  const [hand, remaining] = drawN(shuffled, 5);
  const [lifeCards, deck] = drawN(remaining, leaderLife);
  const life: LifeCard[] = lifeCards
    .map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const }))
    .reverse();
  return { hand, life, deck };
}

/**
 * Apply a fixed test order: consume specified cards for life and hand from the expanded deck.
 * Remaining cards are shuffled. Returns null if the order is invalid.
 */
function applyTestOrder(
  expandedDeck: CardInstance[],
  testOrder: { life: string[]; hand: string[] },
  leaderLife: number,
): { hand: CardInstance[]; life: LifeCard[]; deck: CardInstance[] } | null {
  if (testOrder.life.length !== leaderLife || testOrder.hand.length !== 5) return null;

  // Build consumption pool: Map<cardId, CardInstance[]>
  const pool = new Map<string, CardInstance[]>();
  for (const card of expandedDeck) {
    const arr = pool.get(card.cardId) ?? [];
    arr.push(card);
    pool.set(card.cardId, arr);
  }

  const consume = (cardId: string): CardInstance | null => {
    const arr = pool.get(cardId);
    if (!arr || arr.length === 0) return null;
    return arr.pop()!;
  };

  // Consume life cards
  const lifeInstances: CardInstance[] = [];
  for (const cardId of testOrder.life) {
    const instance = consume(cardId);
    if (!instance) return null;
    lifeInstances.push(instance);
  }

  // Consume hand cards
  const handInstances: CardInstance[] = [];
  for (const cardId of testOrder.hand) {
    const instance = consume(cardId);
    if (!instance) return null;
    handInstances.push({ ...instance, zone: "HAND" as const });
  }

  // Remaining cards → shuffle for deck
  const remaining: CardInstance[] = [];
  for (const arr of pool.values()) remaining.push(...arr);
  const deck = shuffleDeck(remaining);

  // Life area: reverse per §5-2-1-7 (same as normal deal)
  const life: LifeCard[] = lifeInstances
    .map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const }))
    .reverse();

  return { hand: handInstances, life, deck };
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
