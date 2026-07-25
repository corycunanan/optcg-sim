/**
 * State store helpers
 *
 * All mutations produce a new GameState snapshot — nothing is mutated in place.
 * Helpers here keep mutation logic DRY and consistent with zone-transition rules.
 */

import type {
  CardInstance,
  DonInstance,
  GameState,
  LifeCard,
  PendingEvent,
  PlayerState,
  Zone,
} from "../types.js";
import { filterEventForPlayer, filterPromptForPlayer } from "./visibility.js";
import { transitionCard } from "./zone-transition.js";
import { isPresent } from "./type-guards.js";
export { moveCard } from "./zone-transition.js";

// ─── Player accessors ─────────────────────────────────────────────────────────

export function getPlayer(state: GameState, index: 0 | 1): PlayerState {
  return state.players[index];
}

export function getActivePlayer(state: GameState): PlayerState {
  return state.players[state.turn.activePlayerIndex];
}

export function getInactivePlayer(state: GameState): PlayerState {
  return state.players[state.turn.activePlayerIndex === 0 ? 1 : 0];
}

export function getActivePlayerIndex(state: GameState): 0 | 1 {
  return state.turn.activePlayerIndex;
}

export function getInactivePlayerIndex(state: GameState): 0 | 1 {
  return state.turn.activePlayerIndex === 0 ? 1 : 0;
}

// ─── Card lookup ──────────────────────────────────────────────────────────────

export function findCardInState(
  state: GameState,
  instanceId: string,
): { card: CardInstance; playerIndex: 0 | 1 } | null {
  for (const [pi, player] of state.players.entries()) {
    const idx = pi as 0 | 1;
    const allCards = [
      player.leader,
      ...player.characters.filter(isPresent),
      ...(player.stage ? [player.stage] : []),
      ...player.hand,
      ...player.deck,
      ...player.trash,
      ...player.removedFromGame,
    ];
    const found = allCards.find((c) => c.instanceId === instanceId);
    if (found) return { card: found, playerIndex: idx };

    // Life cards
    const lifeCard = player.life.find((l) => l.instanceId === instanceId);
    if (lifeCard) {
      // Return a minimal CardInstance for life cards (zone is LIFE)
      return {
        card: {
          instanceId: lifeCard.instanceId,
          cardId: lifeCard.cardId,
          zone: "LIFE",
          state: "ACTIVE",
          attachedDon: [],
          turnPlayed: null,
          controller: idx,
          owner: idx,
        },
        playerIndex: idx,
      };
    }
  }
  return null;
}

// ─── Life area ────────────────────────────────────────────────────────────────

/**
 * Remove the top life card from a player's life zone.
 * Returns the removed LifeCard and new state, or null if life is empty.
 */
export function removeTopLifeCard(
  state: GameState,
  playerIndex: 0 | 1,
): { lifeCard: LifeCard; state: GameState } | null {
  const player = state.players[playerIndex];
  if (player.life.length === 0) return null;

  const [topLife, ...remainingLife] = player.life;
  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = { ...player, life: remainingLife };

  return {
    lifeCard: topLife,
    state: { ...state, players: newPlayers },
  };
}

// ─── Trigger staging (OPT-257 / F4) ──────────────────────────────────────────

/**
 * Push a Life-card instanceId onto the trigger-staging set. The card has
 * physically been placed in trash for the [Trigger]'s effect resolution, but
 * per Bandai rulings it is NOT yet "in trash" for trash-targeting effects
 * sourced from this same Trigger (e.g. OP14-082's "Play X from trash" must
 * not pick the OP14-082 instance that just opened the window).
 */
export function pushTriggerStaging(state: GameState, instanceId: string): GameState {
  const current = state.turn.triggerStagingInstanceIds ?? [];
  return {
    ...state,
    turn: {
      ...state.turn,
      triggerStagingInstanceIds: [...current, instanceId],
    },
  };
}

/**
 * Pop a staged instanceId. Called once `resolveEffect` returns — by then any
 * pending prompt's candidate list has already been built against the filtered
 * trash, so a sync clear is safe even on the prompt path.
 */
export function popTriggerStaging(state: GameState, instanceId: string): GameState {
  const current = state.turn.triggerStagingInstanceIds ?? [];
  if (!current.includes(instanceId)) return state;
  return {
    ...state,
    turn: {
      ...state.turn,
      triggerStagingInstanceIds: current.filter((id) => id !== instanceId),
    },
  };
}

/** True if the given instanceId is currently in trigger-resolution staging. */
export function isInTriggerStaging(state: GameState, instanceId: string): boolean {
  return (state.turn.triggerStagingInstanceIds ?? []).includes(instanceId);
}

/**
 * Add a card to the top of a player's life zone.
 */
export function addToLife(
  state: GameState,
  playerIndex: 0 | 1,
  lifeCard: LifeCard,
): GameState {
  const player = state.players[playerIndex];
  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = { ...player, life: [lifeCard, ...player.life] };
  return { ...state, players: newPlayers };
}

// ─── DON!! mutations ──────────────────────────────────────────────────────────

/**
 * Move N DON!! cards from the DON!! deck to the cost area (active).
 * Called during DON!! Phase.
 */
export function placeDonFromDeck(
  state: GameState,
  playerIndex: 0 | 1,
  count: number,
): GameState {
  const player = state.players[playerIndex];
  const available = Math.min(count, player.donDeck.length);
  if (available === 0) return state;

  const toPlace = player.donDeck.slice(0, available);
  const remainingDeck = player.donDeck.slice(available);
  const newDon: DonInstance[] = toPlace.map((d) => ({
    ...d,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...player,
    donDeck: remainingDeck,
    donCostArea: [...player.donCostArea, ...newDon],
  };
  return { ...state, players: newPlayers };
}

/**
 * Rest N active DON!! cards in the cost area (cost payment).
 * Returns new state or null if not enough active DON!!.
 */
export function restDonForCost(
  state: GameState,
  playerIndex: 0 | 1,
  count: number,
): GameState | null {
  const player = state.players[playerIndex];
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo);

  if (activeDon.length < count) return null;

  const toRest = new Set(activeDon.slice(0, count).map((d) => d.instanceId));
  const newDonCostArea = player.donCostArea.map((d) =>
    toRest.has(d.instanceId) ? { ...d, state: "RESTED" as const } : d,
  );

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = { ...player, donCostArea: newDonCostArea };
  return { ...state, players: newPlayers };
}

/**
 * Attach one active DON!! from cost area to a target card.
 * Returns null if no active DON!! available.
 */
export function attachDon(
  state: GameState,
  playerIndex: 0 | 1,
  targetInstanceId: string,
): GameState | null {
  const player = state.players[playerIndex];
  const activeDonIdx = player.donCostArea.findIndex(
    (d) => d.state === "ACTIVE" && !d.attachedTo,
  );
  if (activeDonIdx === -1) return null;

  const don = player.donCostArea[activeDonIdx];
  const attachedDon: DonInstance = { ...don, attachedTo: targetInstanceId };

  // Remove from cost area
  const newCostArea = player.donCostArea.filter((_, i) => i !== activeDonIdx);

  // Add to target card's attachedDon
  const updatedPlayer = attachDonToCard(
    { ...player, donCostArea: newCostArea },
    targetInstanceId,
    attachedDon,
  );

  if (!updatedPlayer) return null;

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = updatedPlayer;
  return { ...state, players: newPlayers };
}

function attachDonToCard(
  player: PlayerState,
  targetInstanceId: string,
  don: DonInstance,
): PlayerState | null {
  if (player.leader.instanceId === targetInstanceId) {
    return { ...player, leader: { ...player.leader, attachedDon: [...player.leader.attachedDon, don] } };
  }
  const charIdx = player.characters.findIndex((c) => c?.instanceId === targetInstanceId);
  if (charIdx !== -1) {
    const updated = [...player.characters] as (typeof player.characters);
    updated[charIdx] = { ...updated[charIdx]!, attachedDon: [...updated[charIdx]!.attachedDon, don] };
    return { ...player, characters: updated };
  }
  return null;
}

/**
 * During Refresh Phase: return all DON!! attached to Leader/Characters to cost area (rested),
 * then immediately set all cost area DON!! (and rested cards) active.
 * Executed as two discrete steps so effects can fire between them.
 */
export function returnAttachedDonToCostArea(
  state: GameState,
  playerIndex: 0 | 1,
): GameState {
  const player = state.players[playerIndex];

  const returnedDon: DonInstance[] = [];

  const detachFrom = (card: CardInstance): CardInstance => {
    returnedDon.push(...card.attachedDon.map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null })));
    return { ...card, attachedDon: [] };
  };

  const newLeader = detachFrom(player.leader);
  const newCharacters = player.characters.map((c) => c ? detachFrom(c) : null);

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...player,
    leader: newLeader,
    characters: newCharacters,
    donCostArea: [...player.donCostArea, ...returnedDon],
  };
  return { ...state, players: newPlayers };
}

/**
 * During Refresh Phase step 4: set all rested cards and cost area DON!! to active.
 * Cards in `skipInstanceIds` stay rested (CANNOT_REFRESH prohibitions).
 */
export function activateAllRested(
  state: GameState,
  playerIndex: 0 | 1,
  skipInstanceIds?: ReadonlySet<string>,
): GameState {
  const player = state.players[playerIndex];

  const activate = (card: CardInstance): CardInstance =>
    card.state === "RESTED" && !skipInstanceIds?.has(card.instanceId)
      ? { ...card, state: "ACTIVE" }
      : card;

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...player,
    leader: activate(player.leader),
    characters: player.characters.map((c) => c ? activate(c) : null),
    stage: player.stage ? activate(player.stage) : null,
    donCostArea: player.donCostArea.map((d) => ({ ...d, state: "ACTIVE" as const })),
  };
  return { ...state, players: newPlayers };
}

// ─── M4 foundation utilities ──────────────────────────────────────────────────

/**
 * Return DON!! cards from cost area back to the DON!! deck (§8-3-1-6, §10-2-10).
 * Prefers rested DON!! first. If count exceeds available, returns as many as possible.
 */
export function returnDonToDeck(
  state: GameState,
  playerIndex: 0 | 1,
  count: number,
): GameState {
  const player = state.players[playerIndex];
  const unattached = player.donCostArea.filter((d) => !d.attachedTo);
  if (unattached.length === 0 || count <= 0) return state;

  // Prefer rested DON!! first
  const sorted = [...unattached].sort((a, b) => {
    if (a.state === "RESTED" && b.state !== "RESTED") return -1;
    if (a.state !== "RESTED" && b.state === "RESTED") return 1;
    return 0;
  });

  const toReturn = sorted.slice(0, Math.min(count, sorted.length));
  const toReturnIds = new Set(toReturn.map((d) => d.instanceId));

  const remaining = player.donCostArea.filter((d) => !toReturnIds.has(d.instanceId));
  const returned: DonInstance[] = toReturn.map((d) => ({
    ...d,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...player,
    donCostArea: remaining,
    donDeck: [...player.donDeck, ...returned],
  };
  return { ...state, players: newPlayers };
}

/**
 * Draw N cards from deck to hand, producing CARD_DRAWN events (§4-5-3).
 * Stops early if deck runs out — remaining draws are lost (§4-5-3-1).
 */
export function drawCards(
  state: GameState,
  playerIndex: 0 | 1,
  count: number,
): { state: GameState; events: PendingEvent[] } {
  const events: PendingEvent[] = [];
  let current = state;

  for (let i = 0; i < count; i++) {
    const player = current.players[playerIndex];
    if (player.deck.length === 0) break;

    const drawn = player.deck[0];
    const moved = transitionCard(current, drawn.instanceId, "HAND");
    if (!moved) break;
    current = moved.state;

    events.push({
      type: "CARD_DRAWN",
      playerIndex,
      payload: { cardId: drawn.cardId, cardInstanceId: moved.fact.newInstanceId },
    });
  }

  return { state: current, events };
}

// ─── Zone classification helpers (§3-1-2, §3-1-5) ────────────────────────────

/** True for zones that are "on the field" (§3-1-2). */
export function isOnField(zone: Zone): boolean {
  return zone === "LEADER" || zone === "CHARACTER" || zone === "STAGE" || zone === "COST_AREA";
}

/** True for zones visible to all players (§3-1-5). */
export function isOpenArea(zone: Zone): boolean {
  return (
    zone === "LEADER" ||
    zone === "CHARACTER" ||
    zone === "STAGE" ||
    zone === "COST_AREA" ||
    zone === "DON_DECK" ||
    zone === "TRASH"
  );
}

/** True for zones hidden from opponents (§8-4-5). */
export function isSecretArea(zone: Zone): boolean {
  return zone === "HAND" || zone === "DECK" || zone === "LIFE";
}

// ─── Card instance lookup (flat) ─────────────────────────────────────────────

/**
 * Find a CardInstance by instanceId across field, hand, and trash zones.
 * Returns null if not found. For a richer result that includes playerIndex
 * and also searches deck/life/removedFromGame, use findCardInState().
 */
export function findCardInstance(
  state: GameState,
  instanceId: string,
): CardInstance | null {
  return findCardInState(state, instanceId)?.card ?? null;
}

// ─── Visibility filtering (§8-4-5) ───────────────────────────────────────────

function obfuscateCard(
  card: CardInstance,
  playerIndex: 0 | 1,
  zone: "hand" | "deck",
  zoneIndex: number,
): CardInstance {
  return {
    ...card,
    instanceId: `hidden-${playerIndex}-${zone}-${zoneIndex}`,
    cardId: "hidden",
    attachedDon: [],
  };
}

/**
 * Obfuscate cards in one player's hidden zone while preserving placeholder
 * metadata. Zone indices and synthetic IDs are derived by this helper rather
 * than supplied individually by callers.
 */
export function obfuscateCards(
  cards: readonly CardInstance[],
  playerIndex: 0 | 1,
  zone: "hand" | "deck",
): CardInstance[] {
  return cards.map((card, index) =>
    obfuscateCard(card, playerIndex, zone, index));
}

/**
 * Obfuscate one player's deck order and face-down Life identities.
 *
 * The player-specific path applies this only to the opponent: each receiving
 * player legitimately receives their own deck and face-down Life identities
 * in full. Callers of this lower-level helper own matching `playerIndex` to
 * the supplied player. Use obfuscatePlayersDecksAndFaceDownLife when applying
 * the policy to both players so their indices are derived positionally.
 */
export function obfuscatePlayerDeckAndFaceDownLife(
  player: PlayerState,
  playerIndex: 0 | 1,
): PlayerState {
  return {
    ...player,
    deck: obfuscateCards(player.deck, playerIndex, "deck"),
    life: player.life.map((lc, index) =>
      lc.face === "DOWN"
        ? { ...lc, instanceId: `hidden-${playerIndex}-life-${index}`, cardId: "hidden" }
        : lc,
    ),
  };
}

/**
 * Obfuscate both players' deck order and face-down Life identities, deriving
 * each synthetic-ID namespace from the player's tuple position.
 *
 * Spectator visibility is union-for-revealed, intersection-for-secret: hands
 * and peeks remain visible through the union of the two player views, then
 * this helper re-obfuscates deck order and face-down Life for BOTH players.
 * Without that final step, a colluding spectator could relay each player's
 * own deck order and Life identities to the opponent. Consequently, a
 * spectator board must never assume a deck card has `cardId !== "hidden"`.
 */
export function obfuscatePlayersDecksAndFaceDownLife(
  players: readonly [PlayerState, PlayerState],
): [PlayerState, PlayerState] {
  return [
    obfuscatePlayerDeckAndFaceDownLife(players[0], 0),
    obfuscatePlayerDeckAndFaceDownLife(players[1], 1),
  ];
}

/**
 * Create a player-specific view of the game state that hides secret zone data
 * from the opponent. The receiving player sees their own zones in full; the
 * opponent's hand, deck, and face-down life cards are obfuscated.
 *
 * Also filters the event log and pending prompt through exhaustive visibility
 * policies. Engine-only continuation frames are never sent to either client.
 *
 * Obfuscated cards keep their zone/controller/owner metadata for placeholder
 * rendering, but both card identity and engine instance identity are replaced.
 * Zone-local placeholder IDs cannot correlate a hidden card across movements.
 */
export function filterStateForPlayer(
  state: GameState,
  receivingPlayer: 0 | 1,
): GameState {
  const opponentIndex = receivingPlayer === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];

  const filteredOpponent = obfuscatePlayerDeckAndFaceDownLife(
    {
      ...opponent,
      hand: obfuscateCards(opponent.hand, opponentIndex, "hand"),
    },
    opponentIndex,
  );

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[opponentIndex] = filteredOpponent;

  const filteredEventLog = state.eventLog.map((event) =>
    filterEventForPlayer(event, receivingPlayer));
  const filteredPrompt = filterPromptForPlayer(state.pendingPrompt, receivingPlayer);
  const battleTriggerOwner = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const filteredTurn = {
    ...state.turn,
    battle:
      state.turn.battle?.pendingTriggerLifeCard && receivingPlayer !== battleTriggerOwner
        ? { ...state.turn.battle, pendingTriggerLifeCard: undefined }
        : state.turn.battle,
    pendingTriggerFromEffect:
      state.turn.pendingTriggerFromEffect &&
      receivingPlayer !== state.turn.pendingTriggerFromEffect.damagedPlayerIndex
        ? null
        : state.turn.pendingTriggerFromEffect,
    pendingBattleDamageContinuation:
      state.turn.pendingBattleDamageContinuation &&
      receivingPlayer !== state.turn.pendingBattleDamageContinuation.damagedPlayerIndex
        ? null
        : state.turn.pendingBattleDamageContinuation,
  };

  return {
    ...state,
    executionContext: {
      version: state.executionContext.version,
      seed: "redacted",
      rngState: 0,
      idCounter: 0,
      clockEpochMs: 0,
      clockCounter: 0,
      actionBudget: { limit: 0, consumed: 0 },
      trace: { gameId: state.id, traceId: "redacted" },
    },
    players: newPlayers,
    eventLog: filteredEventLog,
    pendingPrompt: filteredPrompt,
    promptRespondingPlayer: state.pendingPrompt?.respondingPlayer ?? null,
    effectStack: [],
    turn: filteredTurn,
  };
}

// ─── Player state helpers ─────────────────────────────────────────────────────

export function setPlayerConnected(
  state: GameState,
  playerIndex: 0 | 1,
  connected: boolean,
): GameState {
  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = { ...newPlayers[playerIndex], connected };
  return { ...state, players: newPlayers };
}
