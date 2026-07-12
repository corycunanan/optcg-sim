/**
 * Authoritative card zone-transition service (OPT-474).
 *
 * Every cross-zone card move establishes a fresh instance identity, strips
 * transient card state, returns attached DON!!, and removes registrations
 * that still point at the old identity. Same-zone ordering/state changes are
 * not transitions and remain the responsibility of their zone module.
 */

import type {
  CardInstance,
  DonInstance,
  GameState,
  LifeCard,
  PlayerState,
  Zone,
} from "../types.js";
import type { RuntimeActiveEffect, RuntimeProhibition } from "./effect-types.js";
import { nanoid } from "../util/nanoid.js";

export type CardZone = Exclude<Zone, "COST_AREA" | "DON_DECK">;
export type TransitionDestination = Exclude<CardZone, "LEADER">;

export interface ZoneTransitionOptions {
  position?: "TOP" | "BOTTOM";
  /** Compatibility alias: true = TOP, false = BOTTOM. */
  toFront?: boolean;
  slotIndex?: number;
  entryState?: "ACTIVE" | "RESTED";
  turnPlayed?: number | null;
  lifeFace?: "UP" | "DOWN";
  /** Keep the old trigger registration until the emitted leave event is scanned. */
  preserveSourceTriggers?: boolean;
}

export interface ZoneTransitionFact {
  cardId: string;
  owner: 0 | 1;
  controller: 0 | 1;
  source: CardZone;
  destination: TransitionDestination;
  oldInstanceId: string;
  newInstanceId: string;
  detachedDonInstanceIds: string[];
}

export interface ZoneTransitionResult {
  state: GameState;
  card: CardInstance | LifeCard;
  fact: ZoneTransitionFact;
}

export interface DetachedCardSource {
  instanceId: string;
  cardId: string;
  source: CardZone;
  owner: 0 | 1;
  controller?: 0 | 1;
  state?: "ACTIVE" | "RESTED";
  attachedDon?: DonInstance[];
  turnPlayed?: number | null;
  lifeFace?: "UP" | "DOWN";
}

interface LocatedCard {
  card: CardInstance;
  source: CardZone;
  playerIndex: 0 | 1;
  lifeFace?: "UP" | "DOWN";
}

function locateCard(state: GameState, instanceId: string): LocatedCard | null {
  for (const playerIndex of [0, 1] as const) {
    const player = state.players[playerIndex];
    const zones: Array<[CardZone, CardInstance | null]> = [
      ["LEADER", player.leader],
      ["STAGE", player.stage],
    ];
    for (const [source, card] of zones) {
      if (card?.instanceId === instanceId) return { card, source, playerIndex };
    }
    for (const card of player.characters) {
      if (card?.instanceId === instanceId) {
        return { card, source: "CHARACTER", playerIndex };
      }
    }
    for (const [source, cards] of [
      ["HAND", player.hand],
      ["DECK", player.deck],
      ["TRASH", player.trash],
      ["REMOVED_FROM_GAME", player.removedFromGame],
    ] as const) {
      const card = cards.find((candidate) => candidate.instanceId === instanceId);
      if (card) return { card, source, playerIndex };
    }
    const life = player.life.find((candidate) => candidate.instanceId === instanceId);
    if (life) {
      return {
        card: {
          instanceId: life.instanceId,
          cardId: life.cardId,
          zone: "LIFE",
          state: "ACTIVE",
          attachedDon: [],
          turnPlayed: null,
          controller: playerIndex,
          owner: playerIndex,
        },
        source: "LIFE",
        playerIndex,
        lifeFace: life.face,
      };
    }
  }
  return null;
}

function removeFromSource(player: PlayerState, located: LocatedCard): PlayerState {
  const oldId = located.card.instanceId;
  switch (located.source) {
    case "CHARACTER": {
      const characters = [...player.characters];
      const index = characters.findIndex((card) => card?.instanceId === oldId);
      if (index >= 0) characters[index] = null;
      return { ...player, characters };
    }
    case "STAGE": return { ...player, stage: null };
    case "HAND": return { ...player, hand: player.hand.filter((card) => card.instanceId !== oldId) };
    case "DECK": return { ...player, deck: player.deck.filter((card) => card.instanceId !== oldId) };
    case "TRASH": return { ...player, trash: player.trash.filter((card) => card.instanceId !== oldId) };
    case "LIFE": return { ...player, life: player.life.filter((card) => card.instanceId !== oldId) };
    case "REMOVED_FROM_GAME": return {
      ...player,
      removedFromGame: player.removedFromGame.filter((card) => card.instanceId !== oldId),
    };
    case "LEADER": return player;
  }
}

function destinationAvailable(
  player: PlayerState,
  destination: TransitionDestination,
): boolean {
  if (destination === "CHARACTER") {
    return player.characters.includes(null);
  }
  if (destination === "STAGE") return player.stage === null;
  return true;
}

function addToDestination(
  player: PlayerState,
  card: CardInstance,
  destination: TransitionDestination,
  options: ZoneTransitionOptions,
): { player: PlayerState; card: CardInstance | LifeCard } {
  const position = options.position ?? (options.toFront ? "TOP" : "BOTTOM");
  if (destination === "LIFE") {
    const lifeCard: LifeCard = {
      instanceId: card.instanceId,
      cardId: card.cardId,
      face: options.lifeFace ?? "DOWN",
    };
    return {
      player: {
        ...player,
        life: position === "TOP" ? [lifeCard, ...player.life] : [...player.life, lifeCard],
      },
      card: lifeCard,
    };
  }

  switch (destination) {
    case "CHARACTER": {
      const characters = [...player.characters];
      const index = options.slotIndex !== undefined && characters[options.slotIndex] === null
        ? options.slotIndex
        : characters.indexOf(null);
      characters[index] = card;
      return { player: { ...player, characters }, card };
    }
    case "STAGE": return { player: { ...player, stage: card }, card };
    case "HAND": return { player: { ...player, hand: [...player.hand, card] }, card };
    case "DECK": return {
      player: {
        ...player,
        deck: position === "TOP" ? [card, ...player.deck] : [...player.deck, card],
      },
      card,
    };
    case "TRASH": return { player: { ...player, trash: [card, ...player.trash] }, card };
    case "REMOVED_FROM_GAME": return {
      player: { ...player, removedFromGame: [...player.removedFromGame, card] },
      card,
    };
  }
}

function stripOldIdentity(
  state: GameState,
  oldId: string,
  preserveSourceTriggers: boolean,
): GameState {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const activeEffects = effects.flatMap((effect) => {
    if (
      effect.sourceCardInstanceId === oldId &&
      (effect.expiresAt.wave === "SOURCE_LEAVES_ZONE" || effect.category === "permanent" || effect.category === "replacement")
    ) return [];
    if (!effect.appliesTo.includes(oldId)) return [effect];
    const appliesTo = effect.appliesTo.filter((id) => id !== oldId);
    const dynamic = effect.modifiers.some((modifier) => modifier.target?.type !== undefined && modifier.target.type !== "SELF");
    return appliesTo.length > 0 || dynamic ? [{ ...effect, appliesTo }] : [];
  });
  const prohibitions = state.prohibitions as RuntimeProhibition[];
  const nextProhibitions = prohibitions.flatMap((prohibition) => {
    if (prohibition.sourceCardInstanceId === oldId && prohibition.duration.type === "PERMANENT") return [];
    if (!prohibition.appliesTo.includes(oldId)) return [prohibition];
    const appliesTo = prohibition.appliesTo.filter((id) => id !== oldId);
    return appliesTo.length > 0 || prohibition.target ? [{ ...prohibition, appliesTo }] : [];
  });
  return {
    ...state,
    activeEffects: activeEffects as GameState["activeEffects"],
    prohibitions: nextProhibitions as GameState["prohibitions"],
    triggerRegistry: preserveSourceTriggers
      ? state.triggerRegistry
      : state.triggerRegistry.filter((trigger) => trigger.sourceCardInstanceId !== oldId),
  };
}

function commitTransition(
  state: GameState,
  located: LocatedCard,
  destination: TransitionDestination,
  options: ZoneTransitionOptions,
  detached: boolean,
): ZoneTransitionResult | null {
  if (located.source === "LEADER" || located.source === destination) return null;
  const ownerIndex = located.card.owner;
  const destinationPlayer = state.players[ownerIndex];
  if (!destinationAvailable(destinationPlayer, destination)) return null;

  const detachedDon = located.card.attachedDon.map((don) => ({
    ...don,
    state: "RESTED" as const,
    attachedTo: null,
  }));
  const newInstanceId = nanoid();
  const movedCard: CardInstance = {
    ...located.card,
    instanceId: newInstanceId,
    zone: destination,
    state: options.entryState ?? "ACTIVE",
    attachedDon: [],
    turnPlayed: options.turnPlayed ?? null,
    controller: ownerIndex,
    owner: ownerIndex,
  };

  const players = [...state.players] as [PlayerState, PlayerState];
  if (!detached) players[located.playerIndex] = removeFromSource(players[located.playerIndex], located);
  const ownerPlayer = players[ownerIndex];
  const withDon = detachedDon.length > 0
    ? { ...ownerPlayer, donCostArea: [...ownerPlayer.donCostArea, ...detachedDon] }
    : ownerPlayer;
  const added = addToDestination(withDon, movedCard, destination, options);
  players[ownerIndex] = added.player;

  let nextState = stripOldIdentity(
    { ...state, players },
    located.card.instanceId,
    options.preserveSourceTriggers ?? false,
  );
  const staging = nextState.turn.triggerStagingInstanceIds ?? [];
  if (staging.includes(located.card.instanceId)) {
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        triggerStagingInstanceIds: staging.map((id) =>
          id === located.card.instanceId ? newInstanceId : id
        ),
      },
    };
  }

  return {
    state: nextState,
    card: added.card,
    fact: {
      cardId: located.card.cardId,
      owner: ownerIndex,
      controller: located.card.controller,
      source: located.source,
      destination,
      oldInstanceId: located.card.instanceId,
      newInstanceId,
      detachedDonInstanceIds: detachedDon.map((don) => don.instanceId),
    },
  };
}

export function transitionCard(
  state: GameState,
  instanceId: string,
  destination: TransitionDestination,
  options: ZoneTransitionOptions = {},
): ZoneTransitionResult | null {
  const located = locateCard(state, instanceId);
  return located ? commitTransition(state, located, destination, options, false) : null;
}

export function transitionDetachedCard(
  state: GameState,
  source: DetachedCardSource,
  destination: TransitionDestination,
  options: ZoneTransitionOptions = {},
): ZoneTransitionResult | null {
  const located: LocatedCard = {
    card: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      zone: source.source,
      state: source.state ?? "ACTIVE",
      attachedDon: source.attachedDon ?? [],
      turnPlayed: source.turnPlayed ?? null,
      controller: source.controller ?? source.owner,
      owner: source.owner,
    },
    source: source.source,
    playerIndex: source.owner,
    lifeFace: source.lifeFace,
  };
  return commitTransition(state, located, destination, options, true);
}

export function transitionCards(
  state: GameState,
  instanceIds: readonly string[],
  destination: TransitionDestination,
  options: ZoneTransitionOptions = {},
): { state: GameState; transitions: ZoneTransitionResult[] } {
  let nextState = state;
  const transitions: ZoneTransitionResult[] = [];
  const placeAtTop = destination === "TRASH" ||
    ((destination === "DECK" || destination === "LIFE") &&
      (options.position === "TOP" || options.toFront === true));
  const orderedIds = placeAtTop ? [...instanceIds].reverse() : instanceIds;
  for (const instanceId of orderedIds) {
    const moved = transitionCard(nextState, instanceId, destination, options);
    if (!moved) continue;
    nextState = moved.state;
    transitions.push(moved);
  }
  const byOldId = new Map(
    transitions.map((transition) => [transition.fact.oldInstanceId, transition]),
  );
  return {
    state: nextState,
    transitions: instanceIds.flatMap((instanceId) => {
      const transition = byOldId.get(instanceId);
      return transition ? [transition] : [];
    }),
  };
}

/** Backward-compatible state-only wrapper. Prefer transitionCard for facts. */
export function moveCard(
  state: GameState,
  instanceId: string,
  destination: Zone,
  options: ZoneTransitionOptions = {},
): GameState {
  if (destination === "LEADER" || destination === "COST_AREA" || destination === "DON_DECK") {
    return state;
  }
  return transitionCard(state, instanceId, destination, {
    ...options,
    preserveSourceTriggers: options.preserveSourceTriggers ?? true,
  })?.state ?? state;
}
