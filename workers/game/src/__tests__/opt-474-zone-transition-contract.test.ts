import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardInstance, GameState, PlayerState } from "../types.js";
import type { CardZone, TransitionDestination } from "../engine/zone-transition.js";
import { transitionCard } from "../engine/zone-transition.js";
import { findCardInstance } from "../engine/state.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const SOURCES: CardZone[] = [
  "CHARACTER",
  "STAGE",
  "HAND",
  "DECK",
  "TRASH",
  "LIFE",
  "REMOVED_FROM_GAME",
];
const DESTINATIONS: TransitionDestination[] = [
  "CHARACTER",
  "STAGE",
  "HAND",
  "DECK",
  "TRASH",
  "LIFE",
  "REMOVED_FROM_GAME",
];

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../engine");

function productionTypescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "schemas" ? [] : productionTypescriptFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function sourceState(source: CardZone): { state: GameState; oldId: string } {
  const cardDb = createTestCardDb();
  const base = createBattleReadyState(cardDb);
  const oldId = `old-${source.toLowerCase()}`;
  const card: CardInstance = {
    instanceId: oldId,
    cardId: CARDS.VANILLA.id,
    zone: source,
    state: "RESTED",
    attachedDon: source === "CHARACTER" || source === "STAGE"
      ? [{ instanceId: "attached-don", state: "RESTED", attachedTo: oldId }]
      : [],
    turnPlayed: 7,
    controller: 0,
    owner: 0,
  };
  const player: PlayerState = {
    ...base.players[0],
    characters: source === "CHARACTER" ? padChars([card]) : padChars([]),
    stage: source === "STAGE" ? card : null,
    hand: source === "HAND" ? [card] : [],
    deck: source === "DECK" ? [card] : [],
    trash: source === "TRASH" ? [card] : [],
    life: source === "LIFE"
      ? [{ instanceId: oldId, cardId: card.cardId, face: "UP" }]
      : [],
    removedFromGame: source === "REMOVED_FROM_GAME" ? [card] : [],
    donCostArea: [],
  };
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = player;
  return { state: { ...base, players }, oldId };
}

describe("OPT-474 authoritative zone-transition matrix", () => {
  for (const source of SOURCES) {
    for (const destination of DESTINATIONS) {
      if (source === destination) continue;
      it(`${source} -> ${destination} establishes a fresh, stripped identity`, () => {
        const { state, oldId } = sourceState(source);
        const moved = transitionCard(state, oldId, destination, {
          position: "TOP",
          lifeFace: "DOWN",
        });

        expect(moved).not.toBeNull();
        expect(moved!.fact).toMatchObject({ source, destination, oldInstanceId: oldId });
        expect(moved!.fact.newInstanceId).not.toBe(oldId);
        expect(findCardInstance(moved!.state, oldId)).toBeNull();
        const fresh = findCardInstance(moved!.state, moved!.fact.newInstanceId);
        expect(fresh?.zone).toBe(destination);
        expect(fresh?.state).toBe("ACTIVE");
        expect(fresh?.attachedDon).toEqual([]);
        expect(fresh?.turnPlayed).toBeNull();
        if (source === "CHARACTER" || source === "STAGE") {
          expect(moved!.state.players[0].donCostArea).toContainEqual({
            instanceId: "attached-don",
            state: "RESTED",
            attachedTo: null,
          });
        }
      });
    }
  }

  it("atomically refuses a full field destination without losing the source", () => {
    const { state, oldId } = sourceState("HAND");
    const full = {
      ...state,
      players: [
        {
          ...state.players[0],
          characters: padChars(Array.from({ length: 5 }, (_, index) => ({
            ...state.players[0].leader,
            instanceId: `occupant-${index}`,
            cardId: CARDS.VANILLA.id,
            zone: "CHARACTER" as const,
          }))),
        },
        state.players[1],
      ] as [PlayerState, PlayerState],
    };
    expect(full.players[0].characters.every(Boolean)).toBe(true);
    expect(transitionCard(full, oldId, "CHARACTER")).toBeNull();
    expect(findCardInstance(full, oldId)?.zone).toBe("HAND");
  });

  it("cleans source/target registrations against the old identity", () => {
    const { state, oldId } = sourceState("CHARACTER");
    const registered = {
      ...state,
      activeEffects: [
        {
          id: "source-effect",
          sourceCardInstanceId: oldId,
          sourceEffectBlockId: "source",
          category: "permanent",
          modifiers: [],
          duration: { type: "PERMANENT" },
          expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
          controller: 0,
          appliesTo: [oldId],
          timestamp: 1,
        },
      ] as unknown as GameState["activeEffects"],
      prohibitions: [
        {
          id: "target-prohibition",
          sourceCardInstanceId: "other",
          sourceEffectBlockId: "target",
          prohibitionType: "CANNOT_ATTACK",
          scope: {},
          duration: { type: "THIS_TURN" },
          controller: 0,
          appliesTo: [oldId],
          usesRemaining: null,
        },
      ] as unknown as GameState["prohibitions"],
    };
    const moved = transitionCard(registered, oldId, "TRASH");
    expect(moved?.state.activeEffects).toEqual([]);
    expect(moved?.state.prohibitions).toEqual([]);
  });

  it("guards production code against new manual cross-zone reconstruction", () => {
    const allowedAdapters = new Set([
      "setup.ts", // setup runs before a complete GameState exists
      "state.ts", // read-only LifeCard adapter
      "triggers.ts", // read-only deck snapshot adapter
      "effect-resolver/target-resolver.ts", // read-only LifeCard adapter
      "effect-resolver/actions/life.ts", // read-only reorder prompt adapter
      "zone-transition.ts",
    ]);
    const reconstruction = /\{(?=[^{}]{0,600}\bzone\s*:\s*"(?:CHARACTER|STAGE|HAND|DECK|TRASH|LIFE|REMOVED_FROM_GAME)")(?=[^{}]{0,600}\battachedDon\s*:)[^{}]{0,600}\}/gs;
    const violations: string[] = [];

    for (const file of productionTypescriptFiles(ENGINE_DIR)) {
      const name = relative(ENGINE_DIR, file);
      if (allowedAdapters.has(name)) continue;
      const source = readFileSync(file, "utf8");
      if (reconstruction.test(source)) violations.push(name);
      reconstruction.lastIndex = 0;
    }

    expect(violations).toEqual([]);
  });
});
