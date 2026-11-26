// Pure reducer that applies a GameEvent to a PartialGameState. Mirrors only
// the *visible* deltas BoardLayout needs to render — not a re-implementation
// of the engine. Adding cases as scenarios demand them is fine; pre-handling
// speculative events is not.

import type {
  CardInstance,
  DonInstance,
  GameEvent,
} from "@shared/game-types";
import type {
  PartialGameState,
  PartialPlayerState,
} from "./scenarios/types";

export function applyEvent(
  state: PartialGameState,
  event: GameEvent,
): PartialGameState {
  switch (event.type) {
    case "CARD_DRAWN":
      return mapPlayer(state, event.playerIndex, drawTopOfDeck);
    case "CARD_PLAYED":
      return mapPlayer(state, event.playerIndex, (p) =>
        playFromHand(p, event.payload, state.turn.number),
      );
    case "CARD_TRASHED":
      return mapPlayer(state, event.playerIndex, (p) =>
        event.payload.cards && event.payload.from === "DECK"
          ? millNamedCards(p, event.payload.cards)
          : trashFromAnyZone(p, event.payload, event.playerIndex),
      );
    case "CARD_ADDED_TO_LIFE":
      return mapPlayer(state, event.playerIndex, (p) =>
        addCardToLife(p, event.payload),
      );
    case "LIFE_CARD_FACE_CHANGED":
      return mapPlayer(state, event.playerIndex, (p) =>
        turnTopLifeCard(p, event.payload.face),
      );
    case "DON_GIVEN_TO_CARD":
      return mapPlayer(state, event.playerIndex, (p) =>
        giveDonToCard(p, event.payload),
      );
    case "CARD_STATE_CHANGED":
      return mapPlayer(state, event.playerIndex, (p) =>
        changeFieldCardState(p, event.payload),
      );
    case "CARD_KO":
      return mapPlayer(state, event.playerIndex, (p) =>
        koFieldCard(p, event.payload.cardInstanceId),
      );
    case "CARD_RETURNED_TO_HAND":
      return mapPlayer(state, event.playerIndex, (p) =>
        returnFieldCardToHand(
          p,
          event.payload.cardInstanceId,
          event.payload.newCardInstanceId,
        ),
      );
    case "CARD_ADDED_TO_HAND_FROM_LIFE":
      return mapPlayer(state, event.playerIndex, (p) =>
        addLifeCardToHand(p, event.payload, event.playerIndex),
      );
    default:
      return state;
  }
}

// ─── per-event handlers ─────────────────────────────────────────────────

function drawTopOfDeck(p: PartialPlayerState): PartialPlayerState {
  const top = p.deck[0];
  if (!top) return p;
  return {
    ...p,
    deck: p.deck.slice(1),
    hand: [...p.hand, { ...top, zone: "HAND" }],
  };
}

function playFromHand(
  p: PartialPlayerState,
  payload: {
    cardId: string;
    cardInstanceId: string;
    zone: CardInstance["zone"];
    playedRested?: boolean;
  },
  turnNumber: number,
): PartialPlayerState {
  const idx = p.hand.findIndex((c) => c.instanceId === payload.cardInstanceId);
  if (idx === -1) return p;
  const card = p.hand[idx];
  const newHand = [...p.hand.slice(0, idx), ...p.hand.slice(idx + 1)];
  const placed: CardInstance = {
    ...card,
    // Playing a card reveals it: a redacted hand card takes the public
    // identity the event carries.
    cardId: card.cardId === "hidden" ? payload.cardId : card.cardId,
    zone: payload.zone,
    state: payload.playedRested ? "RESTED" : "ACTIVE",
    turnPlayed: turnNumber,
  };
  if (payload.zone === "CHARACTER") {
    const slotIdx = p.characters.findIndex((c) => c === null);
    if (slotIdx === -1) return p;
    const newChars = [...p.characters];
    newChars[slotIdx] = placed;
    return { ...p, hand: newHand, characters: newChars };
  }
  if (payload.zone === "STAGE") {
    return { ...p, hand: newHand, stage: placed };
  }
  return p;
}

function trashFromAnyZone(
  p: PartialPlayerState,
  payload: {
    cardInstanceId?: string;
    cardId?: string;
    from?: string;
  },
  controller: 0 | 1,
): PartialPlayerState {
  if (!payload.cardInstanceId) return p;

  if (payload.from === "LIFE") {
    const lifeIdx = p.life.findIndex(
      (l) => l.instanceId === payload.cardInstanceId,
    );
    if (lifeIdx !== -1) {
      const lc = p.life[lifeIdx];
      const trashed: CardInstance = {
        instanceId: lc.instanceId,
        cardId: payload.cardId ?? lc.cardId,
        zone: "TRASH",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller,
        owner: controller,
      };
      return {
        ...p,
        life: [...p.life.slice(0, lifeIdx), ...p.life.slice(lifeIdx + 1)],
        trash: [trashed, ...p.trash],
      };
    }
  }

  const located = locateAndRemove(p, payload.cardInstanceId);
  if (!located) return p;
  return {
    ...located.player,
    trash: [
      { ...located.card, zone: "TRASH", state: "ACTIVE", turnPlayed: null, attachedDon: [] },
      ...located.player.trash,
    ],
    donCostArea: returnAttachedDon(
      located.player.donCostArea,
      located.card.attachedDon,
    ),
  };
}

function giveDonToCard(
  p: PartialPlayerState,
  payload: { targetInstanceId?: string; count: number },
): PartialPlayerState {
  if (!payload.targetInstanceId || payload.count <= 0) return p;
  if (!findFieldCard(p, payload.targetInstanceId)) return p;
  const available = p.donCostArea.filter((d) => d.attachedTo === null);
  const taken = available.slice(0, payload.count);
  if (taken.length === 0) return p;
  const takenIds = new Set(taken.map((d) => d.instanceId));
  const newCostArea = p.donCostArea.filter((d) => !takenIds.has(d.instanceId));
  const newAttached: DonInstance[] = taken.map((d) => ({
    ...d,
    attachedTo: payload.targetInstanceId!,
    state: "ACTIVE",
  }));
  return updateFieldCard(
    p,
    payload.targetInstanceId,
    (c) => ({ ...c, attachedDon: [...c.attachedDon, ...newAttached] }),
    { donCostArea: newCostArea },
  );
}

function changeFieldCardState(
  p: PartialPlayerState,
  payload: {
    cardInstanceId?: string;
    targetInstanceId?: string;
    newState?: string;
  },
): PartialPlayerState {
  const id = payload.cardInstanceId ?? payload.targetInstanceId;
  if (!id) return p;
  if (payload.newState !== "ACTIVE" && payload.newState !== "RESTED") return p;
  const newState = payload.newState;
  return updateFieldCard(p, id, (c) => ({ ...c, state: newState }));
}

function koFieldCard(
  p: PartialPlayerState,
  cardInstanceId: string,
): PartialPlayerState {
  const located = locateAndRemove(p, cardInstanceId);
  if (!located) return p;
  return {
    ...located.player,
    trash: [
      { ...located.card, zone: "TRASH", state: "ACTIVE", turnPlayed: null, attachedDon: [] },
      ...located.player.trash,
    ],
    donCostArea: returnAttachedDon(
      located.player.donCostArea,
      located.card.attachedDon,
    ),
  };
}

function returnFieldCardToHand(
  p: PartialPlayerState,
  cardInstanceId: string,
  newCardInstanceId?: string,
): PartialPlayerState {
  const located = locateAndRemove(p, cardInstanceId);
  if (!located) return p;
  // A hand the viewer only sees redacted stays redacted: the returned card
  // joins it as a sleeve, as the server projection would send it.
  const hiddenHand =
    p.hand.length > 0 && p.hand.every((card) => card.cardId === "hidden");
  return {
    ...located.player,
    hand: [
      ...located.player.hand,
      {
        ...located.card,
        ...(hiddenHand
          ? {
              cardId: "hidden",
              instanceId:
                newCardInstanceId && newCardInstanceId !== "hidden"
                  ? newCardInstanceId
                  : `${located.card.instanceId}-hand`,
            }
          : {}),
        zone: "HAND",
        state: "ACTIVE",
        turnPlayed: null,
        attachedDon: [],
      },
    ],
    donCostArea: returnAttachedDon(
      located.player.donCostArea,
      located.card.attachedDon,
    ),
  };
}

function addLifeCardToHand(
  p: PartialPlayerState,
  payload: { cardInstanceId?: string; count?: number; cardId?: string },
  controller: 0 | 1,
): PartialPlayerState {
  let removeIndices: number[];
  if (payload.cardInstanceId) {
    const idx = p.life.findIndex((l) => l.instanceId === payload.cardInstanceId);
    if (idx === -1) return p;
    removeIndices = [idx];
  } else {
    const c = Math.min(payload.count ?? 1, p.life.length);
    if (c <= 0) return p;
    removeIndices = Array.from({ length: c }, (_, i) => i);
  }
  const removeSet = new Set(removeIndices);
  const taken = removeIndices.map((i) => p.life[i]);
  const newLife = p.life.filter((_, i) => !removeSet.has(i));
  const newCards: CardInstance[] = taken.map((l) => ({
    instanceId: l.instanceId,
    cardId: l.cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
  }));
  return { ...p, life: newLife, hand: [...p.hand, ...newCards] };
}

function millNamedCards(
  p: PartialPlayerState,
  cards: ReadonlyArray<{ instanceId: string; cardId: string }>,
): PartialPlayerState {
  const count = Math.min(cards.length, p.deck.length);
  if (count === 0) return p;
  // The top card lands first, so it ends up under the later ones.
  const trashed: CardInstance[] = cards.slice(0, count).map((card, i) => ({
    ...p.deck[i],
    instanceId: card.instanceId,
    cardId: card.cardId,
    zone: "TRASH",
    state: "ACTIVE",
    turnPlayed: null,
    attachedDon: [],
  }));
  return {
    ...p,
    deck: p.deck.slice(count),
    trash: [...trashed.reverse(), ...p.trash],
  };
}

function addCardToLife(
  p: PartialPlayerState,
  payload: {
    cardInstanceId: string;
    newCardInstanceId: string;
    cardId: string;
    face?: "UP" | "DOWN";
  },
): PartialPlayerState {
  const located = locateAndRemove(p, payload.cardInstanceId);
  if (!located) return p;
  return {
    ...located.player,
    life: [
      {
        instanceId: payload.newCardInstanceId,
        cardId: payload.cardId,
        face: payload.face ?? "DOWN",
      },
      ...located.player.life,
    ],
    donCostArea: returnAttachedDon(
      located.player.donCostArea,
      located.card.attachedDon,
    ),
  };
}

function turnTopLifeCard(
  p: PartialPlayerState,
  face: "UP" | "DOWN",
): PartialPlayerState {
  const top = p.life[0];
  if (!top || top.face === face) return p;
  return { ...p, life: [{ ...top, face }, ...p.life.slice(1)] };
}

// ─── lower-level helpers ────────────────────────────────────────────────

function mapPlayer(
  state: PartialGameState,
  index: 0 | 1,
  fn: (p: PartialPlayerState) => PartialPlayerState,
): PartialGameState {
  const before = state.players[index];
  const after = fn(before);
  if (after === before) return state;
  return {
    ...state,
    players:
      index === 0 ? [after, state.players[1]] : [state.players[0], after],
  };
}

interface LocateResult {
  card: CardInstance;
  player: PartialPlayerState;
}

// Search hand → characters → stage → deck → trash and return the card +
// a player snapshot with that card removed from its source zone. Leader is
// intentionally not searched: moving the leader is structurally illegal in
// the simulator's current scenario set.
function locateAndRemove(
  p: PartialPlayerState,
  instanceId: string,
): LocateResult | null {
  const handIdx = p.hand.findIndex((c) => c.instanceId === instanceId);
  if (handIdx !== -1) {
    return {
      card: p.hand[handIdx],
      player: {
        ...p,
        hand: [...p.hand.slice(0, handIdx), ...p.hand.slice(handIdx + 1)],
      },
    };
  }
  const charIdx = p.characters.findIndex((c) => c?.instanceId === instanceId);
  if (charIdx !== -1) {
    const card = p.characters[charIdx]!;
    const newChars = [...p.characters];
    newChars[charIdx] = null;
    return { card, player: { ...p, characters: newChars } };
  }
  if (p.stage?.instanceId === instanceId) {
    return { card: p.stage, player: { ...p, stage: null } };
  }
  const deckIdx = p.deck.findIndex((c) => c.instanceId === instanceId);
  if (deckIdx !== -1) {
    return {
      card: p.deck[deckIdx],
      player: {
        ...p,
        deck: [...p.deck.slice(0, deckIdx), ...p.deck.slice(deckIdx + 1)],
      },
    };
  }
  const trashIdx = p.trash.findIndex((c) => c.instanceId === instanceId);
  if (trashIdx !== -1) {
    return {
      card: p.trash[trashIdx],
      player: {
        ...p,
        trash: [...p.trash.slice(0, trashIdx), ...p.trash.slice(trashIdx + 1)],
      },
    };
  }
  return null;
}

function findFieldCard(
  p: PartialPlayerState,
  instanceId: string,
): CardInstance | null {
  if (p.leader.instanceId === instanceId) return p.leader;
  for (const c of p.characters) {
    if (c?.instanceId === instanceId) return c;
  }
  if (p.stage?.instanceId === instanceId) return p.stage;
  return null;
}

function updateFieldCard(
  p: PartialPlayerState,
  instanceId: string,
  updater: (c: CardInstance) => CardInstance,
  extra: Partial<PartialPlayerState> = {},
): PartialPlayerState {
  if (p.leader.instanceId === instanceId) {
    return { ...p, leader: updater(p.leader), ...extra };
  }
  const charIdx = p.characters.findIndex((c) => c?.instanceId === instanceId);
  if (charIdx !== -1) {
    const newChars = [...p.characters];
    newChars[charIdx] = updater(p.characters[charIdx]!);
    return { ...p, characters: newChars, ...extra };
  }
  if (p.stage?.instanceId === instanceId) {
    return { ...p, stage: updater(p.stage), ...extra };
  }
  return p;
}

// Detached DON return to the cost area in the active state, unattached.
function returnAttachedDon(
  costArea: DonInstance[],
  attached: DonInstance[],
): DonInstance[] {
  if (attached.length === 0) return costArea;
  const returned: DonInstance[] = attached.map((d) => ({
    ...d,
    attachedTo: null,
    state: "ACTIVE",
  }));
  return [...costArea, ...returned];
}
