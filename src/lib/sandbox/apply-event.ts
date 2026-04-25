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
        trashFromAnyZone(p, event.payload, event.playerIndex),
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
        returnFieldCardToHand(p, event.payload.cardInstanceId),
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
): PartialPlayerState {
  const located = locateAndRemove(p, cardInstanceId);
  if (!located) return p;
  return {
    ...located.player,
    hand: [
      ...located.player.hand,
      {
        ...located.card,
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
