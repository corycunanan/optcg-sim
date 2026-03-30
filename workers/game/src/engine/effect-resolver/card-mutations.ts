/**
 * State mutation helpers for card movement.
 */

import type { GameState, PendingEvent } from "../../types.js";

export function koCharacter(
  state: GameState,
  instanceId: string,
  causingController: 0 | 1,
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx];
    const newChars = player.characters.filter((_, i) => i !== charIdx);

    // Return attached DON!! to cost area
    const returnedDon = char.attachedDon.map((d) => ({
      ...d,
      state: "RESTED" as const,
      attachedTo: null,
    }));

    const newTrash = [{ ...char, zone: "TRASH" as const, attachedDon: [], state: "ACTIVE" as const }, ...player.trash];

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[pi] = {
      ...player,
      characters: newChars,
      trash: newTrash,
      donCostArea: [...player.donCostArea, ...returnedDon],
    };

    const isOpponentEffect = causingController !== pi;

    return {
      state: { ...state, players: newPlayers },
      events: [{
        type: "CARD_KO",
        playerIndex: pi as 0 | 1,
        payload: {
          cardInstanceId: instanceId,
          cardId: char.cardId,
          cause: isOpponentEffect ? "OPPONENT_EFFECT" : "EFFECT",
          causingController,
        },
      }],
    };
  }
  return null;
}

export function returnToHand(
  state: GameState,
  instanceId: string,
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    // Check characters first
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx !== -1) {
      const char = player.characters[charIdx];
      const newChars = player.characters.filter((_, i) => i !== charIdx);

      // Return attached DON!! to cost area
      const returnedDon = char.attachedDon.map((d) => ({
        ...d,
        state: "RESTED" as const,
        attachedTo: null,
      }));

      const newHand = [...player.hand, { ...char, zone: "HAND" as const, attachedDon: [], state: "ACTIVE" as const }];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = {
        ...player,
        characters: newChars,
        hand: newHand,
        donCostArea: [...player.donCostArea, ...returnedDon],
      };

      return {
        state: { ...state, players: newPlayers },
        events: [{
          type: "CARD_RETURNED_TO_HAND",
          playerIndex: pi as 0 | 1,
          payload: { cardInstanceId: instanceId, cardId: char.cardId },
        }],
      };
    }

    // Check trash (for "add from trash to hand" effects)
    const trashIdx = player.trash.findIndex((c) => c.instanceId === instanceId);
    if (trashIdx !== -1) {
      const card = player.trash[trashIdx];
      const newTrash = player.trash.filter((_, i) => i !== trashIdx);
      const newHand = [...player.hand, { ...card, zone: "HAND" as const, state: "ACTIVE" as const }];

      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = {
        ...player,
        trash: newTrash,
        hand: newHand,
      };

      return {
        state: { ...state, players: newPlayers },
        events: [{
          type: "CARD_RETURNED_TO_HAND",
          playerIndex: pi as 0 | 1,
          payload: { cardInstanceId: instanceId, cardId: card.cardId, source: "TRASH" },
        }],
      };
    }
  }
  return null;
}

export function setCardState(state: GameState, instanceId: string, newState: "ACTIVE" | "RESTED"): GameState {
  for (const [pi, player] of state.players.entries()) {
    if (player.leader.instanceId === instanceId) {
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = { ...player, leader: { ...player.leader, state: newState } };
      return { ...state, players: newPlayers };
    }
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx !== -1) {
      const newChars = [...player.characters];
      newChars[charIdx] = { ...newChars[charIdx], state: newState };
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = { ...player, characters: newChars };
      return { ...state, players: newPlayers };
    }
  }
  return state;
}

export function attachDonToCard(
  state: GameState,
  controller: 0 | 1,
  targetInstanceId: string,
): GameState | null {
  const p = state.players[controller];
  const activeDon = p.donCostArea.find((d) => d.state === "ACTIVE");
  if (!activeDon) return null;

  const newDonCostArea = p.donCostArea.filter((d) => d.instanceId !== activeDon.instanceId);
  const attachedDon = { ...activeDon, attachedTo: targetInstanceId };

  // Find the target card and attach
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  let pp = { ...p, donCostArea: newDonCostArea };

  if (pp.leader.instanceId === targetInstanceId) {
    pp = { ...pp, leader: { ...pp.leader, attachedDon: [...pp.leader.attachedDon, attachedDon] } };
  } else {
    const charIdx = pp.characters.findIndex((c) => c.instanceId === targetInstanceId);
    if (charIdx !== -1) {
      const newChars = [...pp.characters];
      newChars[charIdx] = { ...newChars[charIdx], attachedDon: [...newChars[charIdx].attachedDon, attachedDon] };
      pp = { ...pp, characters: newChars };
    }
  }

  newPlayers[controller] = pp;
  return { ...state, players: newPlayers };
}

export function returnToDeck(
  state: GameState,
  instanceId: string,
  position: "TOP" | "BOTTOM" = "BOTTOM",
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx];
    const newChars = player.characters.filter((_, i) => i !== charIdx);

    // Return attached DON!! to cost area
    const returnedDon = char.attachedDon.map((d) => ({
      ...d,
      state: "RESTED" as const,
      attachedTo: null,
    }));

    const deckCard = { ...char, zone: "DECK" as const, attachedDon: [], state: "ACTIVE" as const };
    const newDeck = position === "BOTTOM"
      ? [...player.deck, deckCard]
      : [deckCard, ...player.deck];

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[pi] = {
      ...player,
      characters: newChars,
      deck: newDeck,
      donCostArea: [...player.donCostArea, ...returnedDon],
    };

    return {
      state: { ...state, players: newPlayers },
      events: [{
        type: "CARD_RETURNED_TO_DECK",
        playerIndex: pi as 0 | 1,
        payload: { cardInstanceId: instanceId, cardId: char.cardId, position },
      }],
    };
  }
  return null;
}
