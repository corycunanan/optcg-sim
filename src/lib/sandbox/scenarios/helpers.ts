// Authoring helpers for sandbox scenarios. Return well-typed fragments with
// sensible defaults so scenario files stay focused on what's interesting
// (the events, the targets) instead of restating empty zones.

import type {
  CardInstance,
  DonInstance,
  LifeCard,
  Zone,
} from "@shared/game-types";
import type { PartialPlayerState } from "./types";

export interface MakeCardInput {
  instanceId: string;
  cardId: string;
  zone: Zone;
  controller: 0 | 1;
  owner?: 0 | 1;
  state?: CardInstance["state"];
  attachedDon?: DonInstance[];
  turnPlayed?: number | null;
}

export function makeCard(input: MakeCardInput): CardInstance {
  return {
    instanceId: input.instanceId,
    cardId: input.cardId,
    zone: input.zone,
    state: input.state ?? "ACTIVE",
    attachedDon: input.attachedDon ?? [],
    turnPlayed: input.turnPlayed ?? null,
    controller: input.controller,
    owner: input.owner ?? input.controller,
  };
}

export interface MakeLifeStackInput {
  count: number;
  cardId: string;
  prefix?: string;
  face?: LifeCard["face"];
}

export function makeLifeStack(input: MakeLifeStackInput): LifeCard[] {
  const prefix = input.prefix ?? "life";
  const face = input.face ?? "DOWN";
  return Array.from({ length: input.count }, (_, i) => ({
    instanceId: `${prefix}-${i + 1}`,
    cardId: input.cardId,
    face,
  }));
}

export interface MakeDonStackInput {
  count: number;
  prefix?: string;
  state?: DonInstance["state"];
  attachedTo?: string | null;
}

export function makeDonStack(input: MakeDonStackInput): DonInstance[] {
  const prefix = input.prefix ?? "don";
  const state = input.state ?? "ACTIVE";
  const attachedTo = input.attachedTo ?? null;
  return Array.from({ length: input.count }, (_, i) => ({
    instanceId: `${prefix}-${i + 1}`,
    state,
    attachedTo,
  }));
}

export interface PlayerSlotInput {
  playerId: string;
  leader: CardInstance;
  characters?: (CardInstance | null)[];
  stage?: CardInstance | null;
  hand?: CardInstance[];
  deck?: CardInstance[];
  trash?: CardInstance[];
  life?: LifeCard[];
  donCostArea?: DonInstance[];
  donDeck?: DonInstance[];
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
}

export function playerSlot(input: PlayerSlotInput): PartialPlayerState {
  return {
    playerId: input.playerId,
    leader: input.leader,
    characters: input.characters ?? [null, null, null, null, null],
    stage: input.stage ?? null,
    hand: input.hand ?? [],
    deck: input.deck ?? [],
    trash: input.trash ?? [],
    life: input.life ?? [],
    donCostArea: input.donCostArea ?? [],
    donDeck: input.donDeck ?? [],
    sleeveUrl: input.sleeveUrl ?? null,
    donArtUrl: input.donArtUrl ?? null,
  };
}
