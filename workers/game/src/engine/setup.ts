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
  EngineExecutionContext,
} from "../types.js";
import type { EffectSchema } from "./effect-types.js";
import { injectSchemasIntoCardDb } from "./schema-registry.js";
import { registerTriggersForCard, registerReplacementsForCard, registerPermanentEffectsForCard } from "./triggers.js";
import {
  allocateContextId,
  createDeterministicExecutionContext,
  shuffleWithContext,
} from "./execution-context.js";

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
export function prepareDecksAndLeaders(
  payload: GameInitPayload,
  initialExecutionContext: EngineExecutionContext = createDeterministicExecutionContext(payload.gameId),
): {
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

  let executionContext = initialExecutionContext;
  const p0Built = buildPlayerDeck(payload.player1, 0 as const, cardDb, executionContext);
  executionContext = p0Built.executionContext;
  const p1Built = buildPlayerDeck(payload.player2, 1 as const, cardDb, executionContext);
  executionContext = p1Built.executionContext;

  const leader0Data = cardDb.get(payload.player1.leader.cardId);
  const leader1Data = cardDb.get(payload.player2.leader.cardId);
  const leaderLife0 = leader0Data?.life ?? leader0Data?.cost ?? 5;
  const leaderLife1 = leader1Data?.life ?? leader1Data?.cost ?? 5;

  const arranged0 = arrangeDeck(p0Built.deck, leaderLife0, payload.player1.testOrder, executionContext);
  executionContext = arranged0.executionContext;
  const arranged1 = arrangeDeck(p1Built.deck, leaderLife1, payload.player2.testOrder, executionContext);
  executionContext = arranged1.executionContext;

  const don0 = buildDonDeck(executionContext, resolveDonDeckSize(leader0Data));
  executionContext = don0.executionContext;
  const don1 = buildDonDeck(executionContext, resolveDonDeckSize(leader1Data));
  executionContext = don1.executionContext;

  const player0 = {
    ...p0Built.player,
    hand: [] as CardInstance[],
    deck: arranged0.deck,
    life: [] as LifeCard[],
    donDeck: don0.deck,
  };

  const player1 = {
    ...p1Built.player,
    hand: [] as CardInstance[],
    deck: arranged1.deck,
    life: [] as LifeCard[],
    donDeck: don1.deck,
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
    executionContext,
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
  const drawn = drawN(player.deck, OPENING_HAND_SIZE, state.executionContext);
  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = { ...player, hand: drawn.cards, deck: drawn.remaining };
  return { ...state, players: newPlayers, executionContext: drawn.executionContext };
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
  let executionContext = state.executionContext;
  for (const playerIndex of [0, 1] as const) {
    const player = newPlayers[playerIndex];
    const leaderData = cardDb.get(player.leader.cardId);
    const leaderLife = leaderData?.life ?? leaderData?.cost ?? 5;
    const drawn = drawN(player.deck, leaderLife, executionContext);
    executionContext = drawn.executionContext;
    const life: LifeCard[] = drawn.cards
      .map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, face: "DOWN" as const }))
      .reverse();
    newPlayers[playerIndex] = { ...player, life, deck: drawn.remaining };
  }
  return { ...state, players: newPlayers, executionContext };
}

/**
 * Bypass-pregame helper: run shuffle → deal-hand → place-life in one pass and
 * return a state that is ready for the first turn's REFRESH phase. Used by
 * tests and non-PVP entry points that don't exercise the priority / mulligan
 * UX. PVP games drive the FSM in `engine/pregame.ts` instead.
 */
export function buildInitialState(
  payload: GameInitPayload,
  initialExecutionContext?: EngineExecutionContext,
): {
  state: GameState;
  cardDb: Map<string, CardData>;
} {
  const { state: prepared, cardDb } = prepareDecksAndLeaders(payload, initialExecutionContext);
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
  let executionContext = state.executionContext;

  // Return hand to deck and reshuffle
  const returned = player.hand.map((card) => {
    const allocated = allocateContextId(executionContext, "card");
    executionContext = allocated.context;
    return {
      ...card,
      instanceId: allocated.id,
      zone: "DECK" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: card.owner,
    };
  });
  const combined = [...returned, ...player.deck];
  const shuffled = shuffleWithContext(executionContext, combined);
  executionContext = shuffled.context;

  // Draw 5 new cards
  const drawn = drawN(shuffled.values, 5, executionContext);

  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = { ...player, hand: drawn.cards, deck: drawn.remaining };

  return { ...state, players: newPlayers, executionContext: drawn.executionContext };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type PartialPlayerState = Omit<import("../types.js").PlayerState, "hand" | "deck" | "life" | "donDeck">;

function buildPlayerDeck(
  playerData: PlayerInitData,
  playerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
  initialExecutionContext: EngineExecutionContext,
): { player: PartialPlayerState; deck: CardInstance[]; executionContext: EngineExecutionContext } {
  void cardDb;
  let executionContext = initialExecutionContext;
  const leaderId = allocateContextId(executionContext, "card");
  executionContext = leaderId.context;

  const leader: CardInstance = {
    instanceId: leaderId.id,
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
      const allocated = allocateContextId(executionContext, "card");
      executionContext = allocated.context;
      deckCards.push({
        instanceId: allocated.id,
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

  return { player: partialState, deck: deckCards, executionContext };
}

function buildDonDeck(
  initialExecutionContext: EngineExecutionContext,
  size: number = DEFAULT_DON_DECK_SIZE,
): { deck: DonInstance[]; executionContext: EngineExecutionContext } {
  let executionContext = initialExecutionContext;
  const deck = Array.from({ length: size }, () => {
    const allocated = allocateContextId(executionContext, "don");
    executionContext = allocated.context;
    return { instanceId: allocated.id, state: "ACTIVE" as const, attachedTo: null };
  });
  return { deck, executionContext };
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
  initialExecutionContext: EngineExecutionContext = createDeterministicExecutionContext("setup"),
): { deck: CardInstance[]; executionContext: EngineExecutionContext } {
  if (!testOrder) {
    const shuffled = shuffleWithContext(initialExecutionContext, expandedDeck);
    return { deck: shuffled.values, executionContext: shuffled.context };
  }

  if (testOrder.life.length !== leaderLife || testOrder.hand.length !== OPENING_HAND_SIZE) {
    console.warn("Invalid testOrder size, falling back to shuffle");
    const shuffled = shuffleWithContext(initialExecutionContext, expandedDeck);
    return { deck: shuffled.values, executionContext: shuffled.context };
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
      const shuffled = shuffleWithContext(initialExecutionContext, expandedDeck);
      return { deck: shuffled.values, executionContext: shuffled.context };
    }
    handInstances.push(instance);
  }

  const lifeInstances: CardInstance[] = [];
  for (const cardId of testOrder.life) {
    const instance = consume(cardId);
    if (!instance) {
      console.warn("Invalid testOrder.life card, falling back to shuffle");
      const shuffled = shuffleWithContext(initialExecutionContext, expandedDeck);
      return { deck: shuffled.values, executionContext: shuffled.context };
    }
    lifeInstances.push(instance);
  }

  const rest: CardInstance[] = [];
  for (const arr of pool.values()) rest.push(...arr);
  const shuffled = shuffleWithContext(initialExecutionContext, rest);
  return {
    deck: [...handInstances, ...lifeInstances, ...shuffled.values],
    executionContext: shuffled.context,
  };
}

function drawN(
  deck: CardInstance[],
  n: number,
  initialExecutionContext: EngineExecutionContext,
): { cards: CardInstance[]; remaining: CardInstance[]; executionContext: EngineExecutionContext } {
  let executionContext = initialExecutionContext;
  // Setup precedes a complete GameState, so it cannot call transitionCard;
  // apply the same identity boundary while dealing the opening hand.
  const hand = deck.slice(0, n).map((c) => {
    const allocated = allocateContextId(executionContext, "card");
    executionContext = allocated.context;
    return {
      ...c,
      instanceId: allocated.id,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: c.owner,
    };
  });
  const remaining = deck.slice(n);
  return { cards: hand, remaining, executionContext };
}
