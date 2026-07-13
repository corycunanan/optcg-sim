/**
 * OPT-363 — `ADD_TO_LIFE` handler with `CARD_IN_TRASH` targeting.
 *
 * Surfaced by Codex review on PR #216: OP14-104 Gecko Moria's [On Play] CHOICE
 * branch ("add up to 1 {Thriller Bark Pirates} from your trash to the top of
 * your Life cards face-up") dispatched `type: "ADD_TO_LIFE"` with no handler
 * registered, so the branch silently no-op'd at runtime.
 *
 * These tests lock in:
 *   1. Direct invocation moves the trash card to the top of Life with the
 *      requested face/position.
 *   2. With multiple valid trash candidates and `up_to: 1`, the handler emits
 *      a SELECT_TARGET prompt rather than auto-resolving.
 *   3. Unsupported `target.type` values fail loudly (no crash, no silent
 *      no-op) so future authoring lands here visibly.
 *   4. End-to-end via the OP14-104 schema: PLAYER_CHOICE → SELECT_TARGET →
 *      trash card lands face-up on top of Life.
 */

import { describe, it, expect, vi } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { executeAddToLife } from "../engine/effect-resolver/actions/life.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { OP14_104_GECKO_MORIA } from "../engine/schemas/op14.js";

const THRILLER_BARK_ID = "TEST-TBP-CHAR";

function thrillerBarkCharData(): CardData {
  return {
    id: THRILLER_BARK_ID,
    name: "Test Thriller Bark Pirate",
    type: "Character",
    color: ["Black"],
    cost: 3,
    power: 4000,
    counter: 1000,
    life: null,
    attribute: [],
    types: ["Thriller Bark Pirates"],
    effectText: "",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: null,
    imageUrl: null,
  };
}

function geckoMoriaCardData(): CardData {
  return {
    id: "OP14-104",
    name: "Gecko Moria",
    type: "Character",
    color: ["Black"],
    cost: 5,
    power: 6000,
    counter: null,
    life: null,
    attribute: [],
    types: ["Thriller Bark Pirates"],
    effectText: "On Play: Select up to 1 Thriller Bark Pirates Character with cost ≤ 4 from your trash and play it or add it to the top of your Life cards face-up.",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: OP14_104_GECKO_MORIA,
    imageUrl: null,
  };
}

function withTrash(state: GameState, cards: CardInstance[]): GameState {
  const next = [...state.players] as [PlayerState, PlayerState];
  next[0] = { ...next[0], trash: cards };
  return { ...state, players: next };
}

// ─── 1. Direct handler with CARD_IN_TRASH + preselected target ──────────────

describe("OPT-363 — executeAddToLife (CARD_IN_TRASH)", () => {
  it("moves the preselected trash card to the top of Life face-up", () => {
    const cardDb = createTestCardDb();
    cardDb.set(THRILLER_BARK_ID, thrillerBarkCharData());
    const base = createBattleReadyState(cardDb);
    const trashCard: CardInstance = {
      instanceId: "trash-tbp-1",
      cardId: THRILLER_BARK_ID,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const state = withTrash(base, [trashCard]);
    const lifeBefore = state.players[0].life.length;

    const result = executeAddToLife(
      state,
      {
        type: "ADD_TO_LIFE",
        target: {
          type: "CARD_IN_TRASH",
          controller: "SELF",
          count: { up_to: 1 },
          filter: { card_type: "CHARACTER" },
        },
        params: { face: "UP", position: "TOP" },
      },
      "char-0-v1",
      0,
      cardDb,
      new Map(),
      ["trash-tbp-1"],
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].trash.find((c) => c.instanceId === "trash-tbp-1")).toBeUndefined();
    expect(result.state.players[0].life.length).toBe(lifeBefore + 1);
    expect(result.state.players[0].life[0]).toMatchObject({
      cardId: THRILLER_BARK_ID,
      face: "UP",
    });
    expect(result.state.players[0].life[0].instanceId).not.toBe("trash-tbp-1");
  });

  it("respects position: BOTTOM and face: DOWN", () => {
    const cardDb = createTestCardDb();
    cardDb.set(THRILLER_BARK_ID, thrillerBarkCharData());
    const base = createBattleReadyState(cardDb);
    const trashCard: CardInstance = {
      instanceId: "trash-tbp-2",
      cardId: THRILLER_BARK_ID,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const state = withTrash(base, [trashCard]);

    const result = executeAddToLife(
      state,
      {
        type: "ADD_TO_LIFE",
        target: { type: "CARD_IN_TRASH", count: { up_to: 1 } },
        params: { face: "DOWN", position: "BOTTOM" },
      },
      "char-0-v1",
      0,
      cardDb,
      new Map(),
      ["trash-tbp-2"],
    );

    expect(result.succeeded).toBe(true);
    const life = result.state.players[0].life;
    expect(life[life.length - 1]).toMatchObject({ cardId: THRILLER_BARK_ID, face: "DOWN" });
    expect(life[life.length - 1].instanceId).not.toBe("trash-tbp-2");
  });

  it("emits a SELECT_TARGET prompt when multiple candidates and no preselected ids", () => {
    const cardDb = createTestCardDb();
    cardDb.set(THRILLER_BARK_ID, thrillerBarkCharData());
    const base = createBattleReadyState(cardDb);
    const trash: CardInstance[] = ["a", "b", "c"].map((tag) => ({
      instanceId: `trash-tbp-${tag}`,
      cardId: THRILLER_BARK_ID,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    }));
    const state = withTrash(base, trash);

    const result = executeAddToLife(
      state,
      {
        type: "ADD_TO_LIFE",
        target: {
          type: "CARD_IN_TRASH",
          controller: "SELF",
          count: { up_to: 1 },
          filter: { card_type: "CHARACTER" },
        },
        params: { face: "UP", position: "TOP" },
      },
      "char-0-v1",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(false);
    expect(result.pendingPrompt).toBeTruthy();
    expect(result.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt!.options.promptType === "SELECT_TARGET") {
      expect(result.pendingPrompt!.options.validTargets).toEqual(
        expect.arrayContaining(trash.map((c) => c.instanceId)),
      );
    }
  });

  it("returns succeeded:false when there are no valid trash candidates", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    const result = executeAddToLife(
      state,
      {
        type: "ADD_TO_LIFE",
        target: { type: "CARD_IN_TRASH", count: { up_to: 1 } },
        params: { face: "UP", position: "TOP" },
      },
      "char-0-v1",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(false);
    expect(result.pendingPrompt).toBeUndefined();
  });

  it("warns and fails on unsupported target.type instead of silently no-op'ing", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = executeAddToLife(
      state,
      {
        type: "ADD_TO_LIFE",
        target: { type: "CARD_IN_DECK", count: { up_to: 1 } },
        params: { face: "UP", position: "TOP" },
      },
      "char-0-v1",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ADD_TO_LIFE with unsupported target.type"),
    );
    warnSpy.mockRestore();
  });
});

// ─── 2. End-to-end via OP14-104 schema ──────────────────────────────────────

describe("OPT-363 — OP14-104 Gecko Moria CHOICE branches", () => {
  function setupGeckoMoriaState(): { state: GameState; cardDb: Map<string, CardData>; trashId: string } {
    const cardDb = createTestCardDb();
    cardDb.set(THRILLER_BARK_ID, thrillerBarkCharData());
    cardDb.set("OP14-104", geckoMoriaCardData());

    const base = createBattleReadyState(cardDb);
    const trashId = "trash-tbp-gecko";
    const trashCard: CardInstance = {
      instanceId: trashId,
      cardId: THRILLER_BARK_ID,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };

    // Place Gecko Moria on the field as the effect source.
    const moriaInstance: CardInstance = {
      instanceId: "char-0-moria",
      cardId: "OP14-104",
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 3,
      controller: 0,
      owner: 0,
    };

    const next = [...base.players] as [PlayerState, PlayerState];
    next[0] = {
      ...next[0],
      trash: [trashCard],
      characters: padChars([moriaInstance]),
    };
    return { state: { ...base, players: next }, cardDb, trashId };
  }

  it("ON_PLAY surfaces a PLAYER_CHOICE prompt with two branches", () => {
    const { state, cardDb } = setupGeckoMoriaState();
    const block = OP14_104_GECKO_MORIA.effects[0] as EffectBlock;

    const result = resolveEffect(state, block, "char-0-moria", 0, cardDb);
    expect(result.resolved).toBe(false);
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (result.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      expect(result.pendingPrompt.options.choices).toHaveLength(2);
    }
  });

  it("choosing the ADD_TO_LIFE branch moves the trash card to the top of Life face-up", () => {
    const { state, cardDb, trashId } = setupGeckoMoriaState();
    const block = OP14_104_GECKO_MORIA.effects[0] as EffectBlock;
    const lifeBefore = state.players[0].life.length;

    // Step 1 — surface the PLAYER_CHOICE prompt.
    const choicePrompt = resolveEffect(state, block, "char-0-moria", 0, cardDb);
    expect(choicePrompt.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    // Step 2 — pick branch "1" (ADD_TO_LIFE).
    const afterChoice = resumeFromStack(
      choicePrompt.state,
      { type: "PLAYER_CHOICE", choiceId: "1" },
      cardDb,
    );
    expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (afterChoice.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(afterChoice.pendingPrompt.options.validTargets).toContain(trashId);
    }

    // Step 3 — select the trash card.
    const final = resumeFromStack(
      afterChoice.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [trashId] },
      cardDb,
    );

    const p0 = final.state.players[0];
    expect(p0.trash.find((c) => c.instanceId === trashId)).toBeUndefined();
    expect(p0.life.length).toBe(lifeBefore + 1);
    expect(p0.life[0]).toMatchObject({
      cardId: THRILLER_BARK_ID,
      face: "UP",
    });
    expect(p0.life[0].instanceId).not.toBe(trashId);
  });

  it("choosing the PLAY_CARD branch still works (regression guard for branch 0)", () => {
    const { state, cardDb, trashId } = setupGeckoMoriaState();
    const block = OP14_104_GECKO_MORIA.effects[0] as EffectBlock;

    const choicePrompt = resolveEffect(state, block, "char-0-moria", 0, cardDb);
    const afterChoice = resumeFromStack(
      choicePrompt.state,
      { type: "PLAYER_CHOICE", choiceId: "0" },
      cardDb,
    );
    expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const final = resumeFromStack(
      afterChoice.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [trashId] },
      cardDb,
    );

    const p0 = final.state.players[0];
    // Card no longer in trash, now on the field as a Character.
    expect(p0.trash.find((c) => c.instanceId === trashId)).toBeUndefined();
    expect(p0.characters.some((c) => c?.cardId === THRILLER_BARK_ID)).toBe(true);
  });
});
