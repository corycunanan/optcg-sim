/**
 * OPT-431 / OPT-430 — OP10-026/027's compound cost "place this Character and
 * 1 [Kin'emon] from your trash at the bottom of your deck in any order".
 *
 * Pre-fix encoding used two sequential costs:
 *  - OPT-431: PLACE_OWN_CHARACTER_TO_DECK had no self constraint — any other
 *    Character could pay the "this Character" half while the source stayed.
 *  - OPT-430: the arrange gate keyed on a single cost's amount (1), so the
 *    order prompt never opened and the trash card was always bottom-most,
 *    violating Comprehensive Rule 3-1-7 ("the owner decides the order").
 *
 * Fix under test: the PLACE_SELF_AND_TRASH_TO_DECK compound cost — the self
 * half is fixed to the source card (selection offers trash candidates only),
 * and one arrange prompt orders the whole self+trash group.
 */

import { describe, it, expect } from "vitest";
import { GameSession } from "../GameSession.js";
import type {
  CardData,
  CardInstance,
  Env,
  GameAction,
  GameState,
  PlayerState,
} from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { payCostsWithSelection, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP10_026_KINEMON, OP10_027_KINEMON } from "../engine/schemas/op10.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void {
    this.sent.push(payload);
  }
  close(): void {}
  serializeAttachment(_attachment: unknown): void {}
  deserializeAttachment(): unknown {
    return null;
  }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] {
    return [];
  }
  getTags(): string[] {
    return [];
  }
}

type TestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

const SOURCE_ID = "char-0-kinemon";
const KINEMON_FIELD = "OP10-026";
const KINEMON_TRASH = "TRASH-KINEMON";

function kinemonCards(): { field: CardData; trash: CardData } {
  return {
    field: {
      ...CARDS.VANILLA,
      id: KINEMON_FIELD,
      name: "Kin'emon",
      effectSchema: OP10_026_KINEMON,
    },
    trash: {
      ...CARDS.VANILLA,
      id: KINEMON_TRASH,
      name: "Kin'emon",
      power: 0,
    },
  };
}

function trashInstance(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `trash-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

/**
 * Player 0: the source Kin'emon + one bystander Character on the field,
 * `trashKinemons` matching Kin'emon(s) (power 0) + one decoy in the trash.
 */
function setup(trashKinemons = 1): { state: GameState; cardDb: Map<string, CardData> } {
  const cardDb = createTestCardDb();
  const { field, trash } = kinemonCards();
  cardDb.set(field.id, field);
  cardDb.set(trash.id, trash);

  let state = createBattleReadyState(cardDb);
  const source: CardInstance = {
    instanceId: SOURCE_ID,
    cardId: field.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const bystander = state.players[0].characters.find((c) => c !== null)!;
  const trashCards = [
    ...Array.from({ length: trashKinemons }, (_, i) => trashInstance(trash.id, `kin-${i}`)),
    trashInstance(CARDS.RUSH.id, "decoy"),
  ];
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = {
    ...newPlayers[0],
    characters: padChars([source, bystander]),
    trash: trashCards,
  };
  return { state: { ...state, players: newPlayers }, cardDb };
}

const COST: Cost = {
  type: "PLACE_SELF_AND_TRASH_TO_DECK",
  amount: 1,
  filter: { name: "Kin'emon", power_exact: 0 },
  position: "BOTTOM",
} as Cost;

function block(): EffectBlock {
  return OP10_026_KINEMON.effects[0] as EffectBlock;
}

describe("OPT-431: the self half is fixed to the source card", () => {
  it("selection offers only matching trash cards — never field characters", () => {
    const { state, cardDb } = setup(2);
    const pay = payCostsWithSelection(state, [COST], 0, 0, cardDb, SOURCE_ID, block());

    expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const options = pay.pendingPrompt!.options;
    if (options.promptType !== "SELECT_TARGET") throw new Error("narrow");
    expect(options.validTargets).toEqual(["trash-kin-0", "trash-kin-1"]);
    expect(options.validTargets).not.toContain(SOURCE_ID);
    expect(options.validTargets).not.toContain("trash-decoy");
  });

  it("completing the cost removes the SOURCE character, not a bystander", () => {
    const { state, cardDb } = setup(1);
    const bystanderId = state.players[0].characters
      .find((c) => c !== null && c.instanceId !== SOURCE_ID)!.instanceId;

    // Single candidate → selection skipped, straight to the arrange stage.
    const pay = payCostsWithSelection(state, [COST], 0, 0, cardDb, SOURCE_ID, block());
    expect(pay.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    const done = resumeFromStack(
      pay.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: [SOURCE_ID, "trash-kin-0"],
        destination: "bottom",
      } as GameAction,
      cardDb,
    );
    const p0 = done.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === SOURCE_ID)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === bystanderId)).toBe(true);
    expect(p0.deck.slice(-2).map((c) => c.instanceId)).toEqual([SOURCE_ID, "trash-kin-0"]);
    expect(done.state.effectStack).toHaveLength(0);
    // Zone-transition reset: a stale non-null turnPlayed in the deck crashes
    // the freshly-played-instance lookup once the card is redrawn and played.
    for (const placed of p0.deck.slice(-2)) {
      expect(placed.turnPlayed).toBeNull();
      expect(placed.state).toBe("ACTIVE");
      expect(placed.attachedDon).toHaveLength(0);
    }
  });

  it("a stale selection naming the source or a non-candidate is rejected", () => {
    const { state, cardDb } = setup(2);
    const pay = payCostsWithSelection(state, [COST], 0, 0, cardDb, SOURCE_ID, block());
    expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const rejected = resumeFromStack(
      pay.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [SOURCE_ID] } as GameAction,
      cardDb,
    );
    expect(rejected.resolved).toBe(false);
    // Frame untouched — the cost is still awaiting a legal selection.
    expect(rejected.state.effectStack).toHaveLength(1);
    expect(rejected.state.players[0].characters.some((c) => c?.instanceId === SOURCE_ID)).toBe(true);
  });

  it("unpayable when the source is not on the field or trash has no match", () => {
    const { state, cardDb } = setup(0);
    // No matching trash Kin'emon.
    expect(isCostPayable(state, COST, 0, cardDb, SOURCE_ID)).toBe(false);
    // Source not on the field.
    const { state: state2, cardDb: db2 } = setup(1);
    expect(isCostPayable(state2, COST, 0, db2, "not-on-field")).toBe(false);
    // Both present → payable.
    expect(isCostPayable(state2, COST, 0, db2, SOURCE_ID)).toBe(true);
  });
});

describe("OPT-430: the self+trash group is ordered in one arrange prompt", () => {
  function reachArrange(cardDb: Map<string, CardData>, state: GameState) {
    const pay = payCostsWithSelection(state, [COST], 0, 0, cardDb, SOURCE_ID, block());
    expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const afterSelect = resumeFromStack(
      pay.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-kin-0"] } as GameAction,
      cardDb,
    );
    expect(afterSelect.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    const options = afterSelect.pendingPrompt!.options;
    if (options.promptType !== "ARRANGE_TOP_CARDS") throw new Error("narrow");
    // Both group members are offered for ordering.
    expect(options.cards.map((c) => c.instanceId).sort()).toEqual(
      [SOURCE_ID, "trash-kin-0"].sort(),
    );
    return afterSelect;
  }

  it("self-above-trash order is honored", () => {
    const { state, cardDb } = setup(2);
    const afterSelect = reachArrange(cardDb, state);
    const done = resumeFromStack(
      afterSelect.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: [SOURCE_ID, "trash-kin-0"],
        destination: "bottom",
      } as GameAction,
      cardDb,
    );
    // Top→bottom of the placed group: source above, trash card bottom-most.
    expect(done.state.players[0].deck.slice(-2).map((c) => c.instanceId))
      .toEqual([SOURCE_ID, "trash-kin-0"]);
  });

  it("trash-above-self order is honored (impossible pre-fix)", () => {
    const { state, cardDb } = setup(2);
    const afterSelect = reachArrange(cardDb, state);
    const done = resumeFromStack(
      afterSelect.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-kin-0", SOURCE_ID],
        destination: "bottom",
      } as GameAction,
      cardDb,
    );
    // Pre-fix the trash card was hardcoded bottom-most; now the source can be.
    expect(done.state.players[0].deck.slice(-2).map((c) => c.instanceId))
      .toEqual(["trash-kin-0", SOURCE_ID]);
    expect(done.state.effectStack).toHaveLength(0);
  });
});

describe("OPT-430/431: OP10-027 variant (1000-power trash filter)", () => {
  it("activates with a 1000-power trash Kin'emon and rejects a 0-power one", () => {
    const cardDb = createTestCardDb();
    const field: CardData = {
      ...CARDS.VANILLA,
      id: "OP10-027",
      name: "Kin'emon",
      effectSchema: OP10_027_KINEMON,
    };
    const kin1000: CardData = { ...CARDS.VANILLA, id: "TRASH-KIN-1000", name: "Kin'emon", power: 1000 };
    const kin0: CardData = { ...CARDS.VANILLA, id: "TRASH-KIN-0", name: "Kin'emon", power: 0 };
    cardDb.set(field.id, field);
    cardDb.set(kin1000.id, kin1000);
    cardDb.set(kin0.id, kin0);

    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      instanceId: SOURCE_ID,
      cardId: field.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([source]),
      trash: [trashInstance(kin1000.id, "k1000"), trashInstance(kin0.id, "k0")],
    };
    state = { ...state, players: newPlayers };

    // Only the 1000-power Kin'emon satisfies OP10-027's filter → selection
    // is skipped (single candidate) and the arrange stage opens over
    // self + the 1000-power card, never the 0-power one.
    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: "activate_place_and_play" },
      cardDb,
      0,
    );
    expect(activation.valid).toBe(true);
    expect(activation.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const afterAccept = resumeFromStack(
      activation.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction,
      cardDb,
    );
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    const options = afterAccept.pendingPrompt!.options;
    if (options.promptType !== "ARRANGE_TOP_CARDS") throw new Error("narrow");
    expect(options.cards.map((c) => c.instanceId).sort()).toEqual(
      [SOURCE_ID, "trash-k1000"].sort(),
    );

    const done = resumeFromStack(
      afterAccept.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-k1000", SOURCE_ID],
        destination: "bottom",
      } as GameAction,
      cardDb,
    );
    const p0 = done.state.players[0];
    expect(p0.deck.slice(-2).map((c) => c.instanceId)).toEqual(["trash-k1000", SOURCE_ID]);
    // The 0-power Kin'emon never left the trash.
    expect(p0.trash.some((c) => c.instanceId === "trash-k0")).toBe(true);
    expect(done.state.effectStack).toHaveLength(0);
  });

  it("is unpayable when the trash only holds the wrong-power Kin'emon", () => {
    const cardDb = createTestCardDb();
    const field: CardData = {
      ...CARDS.VANILLA,
      id: "OP10-027",
      name: "Kin'emon",
      effectSchema: OP10_027_KINEMON,
    };
    const kin0: CardData = { ...CARDS.VANILLA, id: "TRASH-KIN-0", name: "Kin'emon", power: 0 };
    cardDb.set(field.id, field);
    cardDb.set(kin0.id, kin0);

    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      instanceId: SOURCE_ID,
      cardId: field.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([source]),
      trash: [trashInstance(kin0.id, "k0")],
    };
    state = { ...state, players: newPlayers };

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: "activate_place_and_play" },
      cardDb,
      0,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cost cannot be paid");
  });
});

describe("OPT-430/431: full OP10-026 activation through the production path", () => {
  it("activate → optional → select → arrange → effect action runs", async () => {
    const { state, cardDb } = setup(2);
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;

    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: "activate_place_and_play" },
      cardDb,
      0,
    );
    expect(activation.valid).toBe(true);
    expect(activation.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    session.gameState = {
      ...activation.state,
      pendingPrompt: { ...activation.pendingPrompt!, promptId: "p1" },
    };
    session.cardDb = cardDb;
    const ws = new MockWebSocket();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "activate",
      promptId: "p1",
    } as GameAction);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["trash-kin-1"],
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: ["trash-kin-1", SOURCE_ID],
      destination: "bottom",
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);

    const p0 = session.gameState.players[0];
    // Cost fully paid in the chosen order; source left the field.
    expect(p0.deck.slice(-2).map((c) => c.instanceId)).toEqual(["trash-kin-1", SOURCE_ID]);
    expect(p0.characters.some((c) => c?.instanceId === SOURCE_ID)).toBe(false);
    // The effect's PLAY_CARD action ran (up to 1 from hand — none match in
    // this fixture, so it resolves without a further prompt) and the match
    // is not wedged.
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
  });
});
