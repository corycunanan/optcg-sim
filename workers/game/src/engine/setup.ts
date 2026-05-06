/**
 * Game Setup
 *
 * Builds the initial GameState from a GameInitPayload:
 * shuffle decks, place leaders, set life, deal opening hands, handle mulligan.
 *
 * OPT-366 split this into primitives so the pre-game state machine can drive
 * each step independently (priority decision → start-of-game effects →
 * hand deal → mulligan → life placement). `buildInitialState` is preserved as
 * a one-shot helper that bypasses the pre-game flow — used by tests / non-PVP
 * code paths that don't need the priority/mulligan UX.
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
const OPENING_HAND_SIZE = 5;

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

/**
 * OPT-366 §5-2-1-2 / §5-2-1-3: shuffle decks, place leaders, build DON!! decks.
 *
 * Returns a state with hand and life empty — the pregame state machine deals
 * those after the priority decision and any start-of-game leader effects fire.
 * Test orders, when provided, pre-arrange the top of the deck so a subsequent
 * `dealOpeningHand` slice and `placeLifeCards` slice yield deterministic
 * hand and life. The remainder of the deck is shuffled normally.
 *
 * Leader trigger/replacement/permanent-effect registration runs here so leader
 * START_OF_GAME_EFFECT rule_modifications are available the moment the FSM
 * enters the START_OF_GAME_FX phase (before the hand is dealt).
 */
export function prepareDecksAndLeaders(payload: GameInitPayload): {
  state: GameState;
  cardDb: Map<string, CardData>;
} {
  const cardDb = new Map<string, CardData>();

  for (const player of [payload.player1, payload.player2]) {
    cardDb.set(player.leader.cardData.id, player.leader.cardData);
    for (const entry of player.deck) {
      cardDb.set(entry.cardData.id, entry.cardData);
    }
  }

  injectSchemasIntoCardDb(cardDb);

  const [p0State, p0Deck] = buildPlayerDeck(payload.player1, 0 as const, cardDb);
  const [p1State, p1Deck] = buildPlayerDeck(payload.player2, 1 as const, cardDb);

  const leader0Data = cardDb.get(payload.player1.leader.cardId);
  const leader1Data = cardDb.get(payload.player2.leader.cardId);
  const leaderLife0 = leader0Data?.life ?? leader0Data?.cost ?? 5;
  const leaderLife1 = leader1Data?.life ?? leader1Data?.cost ?? 5;

  const arrangedDeck0 = arrangeDeck(p0Deck, leaderLife0, payload.player1.testOrder);
  const arrangedDeck1 = arrangeDeck(p1Deck, leaderLife1, payload.player2.testOrder);

  const donDeck0 = buildDonDeck(0 as const, resolveDonDeckSize(leader0Data));
  const donDeck1 = buildDonDeck(1 as const, resolveDonDeckSize(leader1Data));

  const player0 = {
    ...p0State,
    hand: [] as CardInstance[],
    deck: arrangedDeck0,
    life: [] as LifeCard[],
    donDeck: donDeck0,
  };

  const player1 = {
    ...p1State,
    hand: [] as CardInstance[],
    deck: arrangedDeck1,
    life: [] as LifeCard[],
    donDeck: donDeck1,
  };

  const turn: TurnState = {
    number: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    phase: "REFRESH",
    battleSubPhase: null,
    battle: null,
    oncePerTurnUsed: {},
    actionsPerformedThisTurn: [],
    deckHitZeroThisTurn: [false, false],
  };

  let state: GameState = {
    id: payload.gameId,
    players: [player0, player1],
    turn,
    pregame: null,
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

/**
 * OPT-366 §5-2-1-6: draw 5 cards from the top of the deck into the hand for
 * one player. Idempotent only when called once per player per game / per
 * mulligan cycle — caller is responsible for sequencing.
 */
export function dealOpeningHand(state: GameState, playerIndex: 0 | 1): GameState {
  const player = state.players[playerIndex];
  const [hand, remaining] = drawN(player.deck, OPENING_HAND_SIZE);
  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = { ...player, hand, deck: remaining };
  return { ...state, players: newPlayers };
}

/**
 * OPT-366 §5-2-1-7: place life cards for both players using each leader's
 * life value. Mirrors the legacy `normalDeal` semantics — top of life is the
 * last card consumed (life array is reversed) so damage pops the most-recently
 * placed card first.
 */
export function placeLifeCards(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const newPlayers = [...state.players] as typeof state.players;
  for (const playerIndex of [0, 1] as const) {
    const player = newPlayers[playerIndex];
    const leaderData = cardDb.get(player.leader.cardId);
    const leaderLife = leaderData?.life ?? leaderData?.cost ?? 5;
    const [lifeCards, remainingDeck] = drawN(player.deck, leaderLife);
    const life: LifeCard[] = lifeCards
      .map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const }))
      .reverse();
    newPlayers[playerIndex] = { ...player, life, deck: remainingDeck };
  }
  return { ...state, players: newPlayers };
}

/**
 * Bypass-pregame helper: run shuffle → deal-hand → place-life in one pass and
 * return a state that is ready for the first turn's REFRESH phase. Used by
 * tests and non-PVP entry points that don't exercise the priority / mulligan
 * UX. PVP games drive the FSM in `engine/pregame.ts` instead.
 */
export function buildInitialState(payload: GameInitPayload): {
  state: GameState;
  cardDb: Map<string, CardData>;
} {
  const { state: prepared, cardDb } = prepareDecksAndLeaders(payload);
  let state = dealOpeningHand(prepared, 0);
  state = dealOpeningHand(state, 1);
  state = placeLifeCards(state, cardDb);
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
 * OPT-366: arrange the top of the deck so subsequent `dealOpeningHand` and
 * `placeLifeCards` slices yield deterministic hand and life when testOrder is
 * provided, or a fully shuffled deck otherwise. Top-of-deck layout:
 *
 *   [hand[0..4], life[0..N-1], shuffled-rest]
 *
 * `placeLifeCards` reverses the sliced life portion (legacy semantics — top of
 * life is the last consumed). Falls back to a normal shuffle if testOrder is
 * malformed (e.g. wrong sizes or names not present in the deck).
 */
function arrangeDeck(
  expandedDeck: CardInstance[],
  leaderLife: number,
  testOrder?: { life: string[]; hand: string[] } | null,
): CardInstance[] {
  if (!testOrder) return shuffleDeck(expandedDeck);

  if (testOrder.life.length !== leaderLife || testOrder.hand.length !== OPENING_HAND_SIZE) {
    console.warn("Invalid testOrder size, falling back to shuffle");
    return shuffleDeck(expandedDeck);
  }

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

  const handInstances: CardInstance[] = [];
  for (const cardId of testOrder.hand) {
    const instance = consume(cardId);
    if (!instance) {
      console.warn("Invalid testOrder.hand card, falling back to shuffle");
      return shuffleDeck(expandedDeck);
    }
    handInstances.push(instance);
  }

  const lifeInstances: CardInstance[] = [];
  for (const cardId of testOrder.life) {
    const instance = consume(cardId);
    if (!instance) {
      console.warn("Invalid testOrder.life card, falling back to shuffle");
      return shuffleDeck(expandedDeck);
    }
    lifeInstances.push(instance);
  }

  const rest: CardInstance[] = [];
  for (const arr of pool.values()) rest.push(...arr);
  return [...handInstances, ...lifeInstances, ...shuffleDeck(rest)];
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
