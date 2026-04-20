/**
 * State mutation helpers for card movement.
 */

import type { GameState, PendingEvent, DonInstance } from "../../types.js";

export function koCharacter(
  state: GameState,
  instanceId: string,
  causingController: 0 | 1,
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c?.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx]!;
    const newChars = [...player.characters] as (typeof player.characters);
    newChars[charIdx] = null;

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
          preKO_donCount: char.attachedDon.length,
        },
      }],
    };
  }
  return null;
}

/**
 * Trash a character from the field (NOT a KO — does not trigger [On K.O.] per Rule 10-2-1-3).
 * Returns attached DON!! to cost area, emits CARD_TRASHED.
 */
export function trashCharacter(
  state: GameState,
  instanceId: string,
  causingController: 0 | 1,
  reason: "effect" | "cost" = "effect",
): { state: GameState; events: PendingEvent[] } | null {
  void causingController;
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c?.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx]!;
    const newChars = [...player.characters] as (typeof player.characters);
    newChars[charIdx] = null;

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

    return {
      state: { ...state, players: newPlayers },
      events: [{
        type: "CARD_TRASHED",
        playerIndex: pi as 0 | 1,
        payload: {
          cardInstanceId: instanceId,
          cardId: char.cardId,
          reason,
        },
      }],
    };
  }
  return null;
}

/**
 * Trash the stage card at `instanceId`. Returns attached DON!! to cost area
 * (rested) and emits CARD_TRASHED. Per OPT-256, the trashed card is reset to
 * a fresh ACTIVE instance on zone exit.
 */
export function trashStage(
  state: GameState,
  instanceId: string,
  reason: "effect" | "cost" = "effect",
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    if (player.stage?.instanceId !== instanceId) continue;

    const stage = player.stage;
    const returnedDon = stage.attachedDon.map((d) => ({
      ...d,
      state: "RESTED" as const,
      attachedTo: null,
    }));
    const newTrash = [{ ...stage, zone: "TRASH" as const, attachedDon: [], state: "ACTIVE" as const }, ...player.trash];

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[pi] = {
      ...player,
      stage: null,
      trash: newTrash,
      donCostArea: [...player.donCostArea, ...returnedDon],
    };

    return {
      state: { ...state, players: newPlayers },
      events: [{
        type: "CARD_TRASHED",
        playerIndex: pi as 0 | 1,
        payload: {
          cardInstanceId: stage.instanceId,
          cardId: stage.cardId,
          reason,
        },
      }],
    };
  }
  return null;
}

/**
 * Detach up to `amount` DON!! from the card at `cardInstanceId` (leader or character)
 * and return them to that player's cost area in the RESTED state. Returns null if
 * the card is not found or has zero attached DON!!.
 */
export function detachDonToCostArea(
  state: GameState,
  cardInstanceId: string,
  amount: number,
): GameState | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c?.instanceId === cardInstanceId);
    if (charIdx !== -1) {
      const char = player.characters[charIdx]!;
      const detachCount = Math.min(amount, char.attachedDon.length);
      if (detachCount === 0) return null;
      const detached = char.attachedDon.slice(0, detachCount).map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null }));
      const remainingDon = char.attachedDon.slice(detachCount);
      const newChars = [...player.characters] as (typeof player.characters);
      newChars[charIdx] = { ...char, attachedDon: remainingDon };
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = {
        ...player,
        characters: newChars,
        donCostArea: [...player.donCostArea, ...detached],
      };
      return { ...state, players: newPlayers };
    }
    if (player.leader?.instanceId === cardInstanceId) {
      const leader = player.leader;
      const detachCount = Math.min(amount, leader.attachedDon.length);
      if (detachCount === 0) return null;
      const detached = leader.attachedDon.slice(0, detachCount).map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null }));
      const remainingDon = leader.attachedDon.slice(detachCount);
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = {
        ...player,
        leader: { ...leader, attachedDon: remainingDon },
        donCostArea: [...player.donCostArea, ...detached],
      };
      return { ...state, players: newPlayers };
    }
  }
  return null;
}

export function returnToHand(
  state: GameState,
  instanceId: string,
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    // Check characters first
    const charIdx = player.characters.findIndex((c) => c?.instanceId === instanceId);
    if (charIdx !== -1) {
      const char = player.characters[charIdx]!;
      const newChars = [...player.characters] as (typeof player.characters);
      newChars[charIdx] = null;

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
    const charIdx = player.characters.findIndex((c) => c?.instanceId === instanceId);
    if (charIdx !== -1) {
      const newChars = [...player.characters] as (typeof player.characters);
      newChars[charIdx] = { ...newChars[charIdx]!, state: newState };
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[pi] = { ...player, characters: newChars };
      return { ...state, players: newPlayers };
    }
  }
  return state;
}

/**
 * Attach a DON!! to a Leader or Character.
 *
 * OPT-226: the DON is pulled from — and attached within — the PLAYER WHO OWNS
 * THE TARGET. OP-15 "give opp's rested DON to their Character" effects pass
 * an opp-side target; this helper finds the target on whichever side it
 * lives and pulls the DON from that same side's cost area. The old
 * `controller` argument is ignored except as a fallback when the target
 * cannot be located on either side.
 */
export function attachDonToCard(
  state: GameState,
  controller: 0 | 1,
  targetInstanceId: string,
  donState: "ACTIVE" | "RESTED" = "ACTIVE",
): GameState | null {
  // Infer owner side from the target — DON flows from its owner's cost area.
  let ownerIdx: 0 | 1 = controller;
  for (const pi of [0, 1] as const) {
    const pp = state.players[pi];
    if (pp.leader.instanceId === targetInstanceId) { ownerIdx = pi; break; }
    if (pp.characters.some((c) => c?.instanceId === targetInstanceId)) { ownerIdx = pi; break; }
  }

  const p = state.players[ownerIdx];
  const don = p.donCostArea.find((d) => d.state === donState && !d.attachedTo);
  if (!don) return null;

  const newDonCostArea = p.donCostArea.filter((d) => d.instanceId !== don.instanceId);
  const attachedDon = { ...don, attachedTo: targetInstanceId };

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  let pp = { ...p, donCostArea: newDonCostArea };

  if (pp.leader.instanceId === targetInstanceId) {
    pp = { ...pp, leader: { ...pp.leader, attachedDon: [...pp.leader.attachedDon, attachedDon] } };
  } else {
    const charIdx = pp.characters.findIndex((c) => c?.instanceId === targetInstanceId);
    if (charIdx !== -1) {
      const newChars = [...pp.characters] as (typeof pp.characters);
      newChars[charIdx] = { ...newChars[charIdx]!, attachedDon: [...newChars[charIdx]!.attachedDon, attachedDon] };
      pp = { ...pp, characters: newChars };
    } else {
      // Target not found on inferred owner's field — bail.
      return null;
    }
  }

  newPlayers[ownerIdx] = pp;
  return { ...state, players: newPlayers };
}

/**
 * Detach a specific DON!! from a specific card (leader or character) owned by `controller`.
 * Unlike koCharacter/trashCharacter, this does NOT return the DON to the cost area — the
 * caller decides where it goes (typically reattached to a different card via reattachDon).
 * Returns null if the card or DON is not found.
 */
export function detachOneDon(
  state: GameState,
  controller: 0 | 1,
  donInstanceId: string,
  fromCardInstanceId: string,
): { state: GameState; detachedDon: DonInstance } | null {
  const p = state.players[controller];
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];

  if (p.leader.instanceId === fromCardInstanceId) {
    const donIdx = p.leader.attachedDon.findIndex((d) => d.instanceId === donInstanceId);
    if (donIdx === -1) return null;
    const don = p.leader.attachedDon[donIdx]!;
    const newAttached = p.leader.attachedDon.filter((_, i) => i !== donIdx);
    newPlayers[controller] = { ...p, leader: { ...p.leader, attachedDon: newAttached } };
    return {
      state: { ...state, players: newPlayers },
      detachedDon: { ...don, attachedTo: null },
    };
  }

  const charIdx = p.characters.findIndex((c) => c?.instanceId === fromCardInstanceId);
  if (charIdx === -1) return null;
  const char = p.characters[charIdx]!;
  const donIdx = char.attachedDon.findIndex((d) => d.instanceId === donInstanceId);
  if (donIdx === -1) return null;
  const don = char.attachedDon[donIdx]!;
  const newChars = [...p.characters] as (typeof p.characters);
  newChars[charIdx] = { ...char, attachedDon: char.attachedDon.filter((_, i) => i !== donIdx) };
  newPlayers[controller] = { ...p, characters: newChars };
  return {
    state: { ...state, players: newPlayers },
    detachedDon: { ...don, attachedTo: null },
  };
}

/**
 * Reattach a previously-detached DON!! to a target card (leader or character) owned by
 * `controller`. Does NOT touch donCostArea — caller supplies the DonInstance directly.
 * Returns null if the target card is not found.
 */
export function reattachDon(
  state: GameState,
  controller: 0 | 1,
  don: DonInstance,
  targetInstanceId: string,
): GameState | null {
  const p = state.players[controller];
  const attached: DonInstance = { ...don, attachedTo: targetInstanceId };
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];

  if (p.leader.instanceId === targetInstanceId) {
    newPlayers[controller] = {
      ...p,
      leader: { ...p.leader, attachedDon: [...p.leader.attachedDon, attached] },
    };
    return { ...state, players: newPlayers };
  }

  const charIdx = p.characters.findIndex((c) => c?.instanceId === targetInstanceId);
  if (charIdx === -1) return null;
  const newChars = [...p.characters] as (typeof p.characters);
  newChars[charIdx] = { ...newChars[charIdx]!, attachedDon: [...newChars[charIdx]!.attachedDon, attached] };
  newPlayers[controller] = { ...p, characters: newChars };
  return { ...state, players: newPlayers };
}

export function returnToDeck(
  state: GameState,
  instanceId: string,
  position: "TOP" | "BOTTOM" = "BOTTOM",
): { state: GameState; events: PendingEvent[] } | null {
  for (const [pi, player] of state.players.entries()) {
    const charIdx = player.characters.findIndex((c) => c?.instanceId === instanceId);
    if (charIdx === -1) continue;

    const char = player.characters[charIdx]!;
    const newChars = [...player.characters] as (typeof player.characters);
    newChars[charIdx] = null;

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
