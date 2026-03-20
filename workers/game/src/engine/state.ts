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
  PlayerState,
  Zone,
} from "../types.js";
import { nanoid } from "../util/nanoid.js";

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
      ...player.characters,
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

// ─── Zone transition ──────────────────────────────────────────────────────────

/**
 * Move a card from one zone to another.
 * Per rules §3-1-6: zone transitions strip all modifiers and assign a new instanceId.
 * DON!! attached to the card are returned to the cost area, rested (rules §6-5-5-4).
 *
 * This is the core mutation — all card movements go through here.
 */
export function moveCard(
  state: GameState,
  instanceId: string,
  destination: Zone,
  options: { toFront?: boolean } = {},
): GameState {
  const found = findCardInState(state, instanceId);
  if (!found) return state; // impossible action → silent no-op (rules §1-3-2)

  const { card, playerIndex } = found;
  const player = state.players[playerIndex];

  // Return attached DON!! to cost area, rested
  const detachedDon: DonInstance[] = card.attachedDon.map((d) => ({
    ...d,
    state: "RESTED" as const,
    attachedTo: null,
  }));

  // New instanceId for the destination card (rules §3-1-6)
  const newInstanceId = nanoid();
  const movedCard: CardInstance = {
    ...card,
    instanceId: newInstanceId,
    zone: destination,
    state: "ACTIVE",   // cards enter new zones active by default (rules §3-7-5, §3-8-4, §3-9-3)
    attachedDon: [],   // DON!! stripped on zone transition
    turnPlayed: destination === "CHARACTER" || destination === "LEADER" ? card.turnPlayed : null,
  };

  // Remove card from its current zone
  let updatedPlayer = removeCardFromZone(player, card);

  // Add detached DON!! to cost area
  if (detachedDon.length > 0) {
    updatedPlayer = {
      ...updatedPlayer,
      donCostArea: [...updatedPlayer.donCostArea, ...detachedDon],
    };
  }

  // Add card to destination zone
  updatedPlayer = addCardToZone(updatedPlayer, movedCard, options);

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = updatedPlayer;

  return { ...state, players: newPlayers };
}

function removeCardFromZone(player: PlayerState, card: CardInstance): PlayerState {
  const remove = (arr: CardInstance[]) => arr.filter((c) => c.instanceId !== card.instanceId);

  switch (card.zone) {
    case "LEADER":
      return player; // Leader cannot be removed (rules §3-6-3)
    case "CHARACTER":
      return { ...player, characters: remove(player.characters) };
    case "STAGE":
      return { ...player, stage: null };
    case "HAND":
      return { ...player, hand: remove(player.hand) };
    case "DECK":
      return { ...player, deck: remove(player.deck) };
    case "TRASH":
      return { ...player, trash: remove(player.trash) };
    case "REMOVED_FROM_GAME":
      return { ...player, removedFromGame: remove(player.removedFromGame) };
    case "LIFE":
      return { ...player, life: player.life.filter((l) => l.instanceId !== card.instanceId) };
    case "COST_AREA":
    case "DON_DECK":
      return player; // DON!! movement handled separately
  }
}

function addCardToZone(
  player: PlayerState,
  card: CardInstance,
  options: { toFront?: boolean },
): PlayerState {
  switch (card.zone) {
    case "CHARACTER":
      return { ...player, characters: [...player.characters, card] };
    case "STAGE":
      return { ...player, stage: card };
    case "HAND":
      return { ...player, hand: [...player.hand, card] };
    case "DECK":
      return options.toFront
        ? { ...player, deck: [card, ...player.deck] }
        : { ...player, deck: [...player.deck, card] };
    case "TRASH":
      return { ...player, trash: [card, ...player.trash] }; // top of trash = most recent
    case "REMOVED_FROM_GAME":
      return { ...player, removedFromGame: [...player.removedFromGame, card] };
    case "LEADER":
    case "LIFE":
    case "COST_AREA":
    case "DON_DECK":
      return player; // not reached via standard card movement
  }
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
  const charIdx = player.characters.findIndex((c) => c.instanceId === targetInstanceId);
  if (charIdx !== -1) {
    const updated = [...player.characters];
    updated[charIdx] = { ...updated[charIdx], attachedDon: [...updated[charIdx].attachedDon, don] };
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
  const newCharacters = player.characters.map(detachFrom);

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
 */
export function activateAllRested(
  state: GameState,
  playerIndex: 0 | 1,
): GameState {
  const player = state.players[playerIndex];

  const activate = (card: CardInstance): CardInstance =>
    card.state === "RESTED" ? { ...card, state: "ACTIVE" } : card;

  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIndex] = {
    ...player,
    leader: activate(player.leader),
    characters: player.characters.map(activate),
    stage: player.stage ? activate(player.stage) : null,
    donCostArea: player.donCostArea.map((d) => ({ ...d, state: "ACTIVE" as const })),
  };
  return { ...state, players: newPlayers };
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
