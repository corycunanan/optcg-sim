/**
 * OPT-436 — duplicate/mismatched prompt responses must not wedge the match.
 *
 * Failure mode: during the OPT-371 two-stage cost flow (SELECT_TARGET →
 * ARRANGE_TOP_CARDS), a delayed duplicate of the SELECT response reached
 * `resumeFromPrompt`, which nulls `pendingPrompt` before the resolver runs;
 * the stale-guard rejected it with `resolved: false` and no replacement
 * prompt, so the session persisted `pendingPrompt: null` with the cost frame
 * still on the stack — `sendPendingPrompts` defers while the stack is
 * non-empty, permanently wedging the match.
 *
 * Two guards under test:
 *  1. handleAction rejects responses whose type doesn't match the pending
 *     prompt's promptType (PASS always allowed).
 *  2. resumeFromPrompt restores the cleared prompt when a resolver rejects a
 *     response (resolved: false, no replacement prompt, no events).
 */

import { describe, it, expect } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, CardInstance, Env, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";

// ─── Minimal GameSession harness (pattern from opt-337) ─────────────────────

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
  writeResultToDb(): Promise<void>;
};

function trashCard(cardId: string, suffix: string): CardInstance {
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

function makeBlock(costs: Cost[]): EffectBlock {
  return {
    id: "opt436-test-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs,
    actions: [{ type: "DRAW", params: { amount: 1 } }],
    flags: { optional: true },
  } as EffectBlock;
}

/** Session parked on a live SELECT_TARGET cost prompt (2 of 4 trash cards). */
function sessionWithSelectPrompt(): { session: TestAccess; ws: MockWebSocket } {
  const cardDb = createTestCardDb();
  let state = createBattleReadyState(cardDb);
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = {
    ...newPlayers[0],
    trash: [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
      trashCard(CARDS.COUNTER.id, "d"),
    ],
  };
  state = { ...state, players: newPlayers };

  const block = makeBlock([{ type: "PLACE_FROM_TRASH_TO_DECK", amount: 2 } as Cost]);
  const pay = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);
  expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as TestAccess;
  session.gameState = { ...pay.state, pendingPrompt: pay.pendingPrompt! };
  session.cardDb = cardDb;
  return { session, ws: new MockWebSocket() };
}

function sessionWithOptionalPrompt(): { session: TestAccess; ws: MockWebSocket } {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const block = makeBlock([]);
  const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as TestAccess;
  session.gameState = { ...result.state, pendingPrompt: result.pendingPrompt! };
  session.cardDb = cardDb;
  return { session, ws: new MockWebSocket() };
}

function lastError(ws: MockWebSocket): string | undefined {
  const errors = ws.sent
    .map((m) => JSON.parse(m) as { type: string; message?: string })
    .filter((m) => m.type === "game:error");
  return errors[errors.length - 1]?.message;
}

// ─── Guard 1: prompt-type gate ───────────────────────────────────────────────

describe("OPT-436: response type must match the pending prompt", () => {
  it("rejects a wrong-type response and leaves the prompt intact", async () => {
    const { session, ws } = sessionWithSelectPrompt();
    const stackBefore = session.gameState.effectStack.length;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: ["trash-a", "trash-b"],
      destination: "bottom",
    } as GameAction);

    expect(lastError(ws)).toMatch(/SELECT_TARGET/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(session.gameState.effectStack.length).toBe(stackBefore);
  });

  it("duplicate SELECT during the arrange stage is rejected; match is not wedged", async () => {
    const { session, ws } = sessionWithSelectPrompt();
    const select: GameAction = {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["trash-c", "trash-a"],
    } as GameAction;

    // First response: advances to the arrange prompt.
    await session.handleAction(ws as unknown as WebSocket, 0, select);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    // Delayed duplicate of the same SELECT response: must be rejected by the
    // type gate, leaving the arrange prompt pending (previously wedged the
    // match by persisting pendingPrompt: null with a live stack frame).
    await session.handleAction(ws as unknown as WebSocket, 0, select);
    expect(lastError(ws)).toMatch(/ARRANGE_TOP_CARDS/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    // The player can still answer the real prompt and the flow completes.
    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: ["trash-a", "trash-c"],
      destination: "bottom",
    } as GameAction);
    expect(session.gameState.pendingPrompt).toBeFalsy();
    expect(session.gameState.effectStack.length).toBe(0);
    const deck = session.gameState.players[0].deck;
    expect(deck.slice(-2).map((c) => c.instanceId)).toEqual(["trash-a", "trash-c"]);
  });
});

// ─── Guard 2: restore the prompt on resolver rejection ───────────────────────

describe("OPT-436: rejected responses restore the pending prompt", () => {
  it("an invalid same-type selection is rejected and the prompt is restored", async () => {
    const { session, ws } = sessionWithSelectPrompt();
    const stackBefore = session.gameState.effectStack;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["not-in-trash-1", "not-in-trash-2"],
    } as GameAction);

    // Resolver rejected (resolved: false, no replacement prompt) — the prompt
    // must be restored rather than persisted as null.
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(session.gameState.effectStack).toEqual(stackBefore);
  });

  it("PASS on a mandatory cost selection does not wedge the match", async () => {
    const { session, ws } = sessionWithSelectPrompt();

    await session.handleAction(ws as unknown as WebSocket, 0, { type: "PASS" } as GameAction);

    expect(lastError(ws)).toMatch(/SELECT_TARGET/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  });

  it("rejects a stale wrong-type response during an optional effect", async () => {
    const { session, ws } = sessionWithOptionalPrompt();
    const stackBefore = session.gameState.effectStack;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["stale-target"],
    } as GameAction);

    expect(lastError(ws)).toMatch(/OPTIONAL_EFFECT/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(session.gameState.effectStack).toEqual(stackBefore);
  });

  it("rejects an invalid optional-effect choice id", async () => {
    const { session, ws } = sessionWithOptionalPrompt();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "stale-choice",
    } as GameAction);

    expect(lastError(ws)).toMatch(/no longer available/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  });

  it("rejects an unoffered PLAYER_CHOICE id before it can consume a frame", async () => {
    const { session, ws } = sessionWithOptionalPrompt();
    const resumeContext = session.gameState.pendingPrompt!.resumeContext;
    session.gameState = {
      ...session.gameState,
      pendingPrompt: {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Choose one",
          choices: [{ id: "current-choice", label: "Current choice" }],
        },
        respondingPlayer: 0,
        resumeContext,
      },
    };
    const stackBefore = session.gameState.effectStack;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "stale-choice",
    } as GameAction);

    expect(lastError(ws)).toMatch(/no longer available/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(session.gameState.effectStack).toEqual(stackBefore);
  });

  it("rejects PASS on a durable reveal-trigger prompt", async () => {
    const { session, ws } = sessionWithOptionalPrompt();
    session.gameState = {
      ...session.gameState,
      effectStack: [],
      pendingPrompt: {
        options: {
          promptType: "REVEAL_TRIGGER",
          cards: [],
          effectDescription: "Reveal Trigger?",
          optional: false,
          timeoutMs: 30_000,
        },
        respondingPlayer: 0,
        resumeContext: null as never,
      },
    };

    await session.handleAction(ws as unknown as WebSocket, 0, { type: "PASS" } as GameAction);

    expect(lastError(ws)).toMatch(/REVEAL_TRIGGER/);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
  });

  it("PASS still declines a legitimate optional-effect prompt", async () => {
    const { session, ws } = sessionWithOptionalPrompt();

    await session.handleAction(ws as unknown as WebSocket, 0, { type: "PASS" } as GameAction);

    expect(session.gameState.pendingPrompt).toBeNull();
    expect(session.gameState.effectStack).toHaveLength(0);
  });

  it.each([0, 1] as const)("player %i can concede while an optional prompt is pending", async (playerIndex) => {
    const { session, ws } = sessionWithOptionalPrompt();
    session.writeResultToDb = async () => undefined;

    await session.handleAction(ws as unknown as WebSocket, playerIndex, { type: "CONCEDE" } as GameAction);

    expect(session.gameState.status).toBe("FINISHED");
    expect(session.gameState.winner).toBe(playerIndex === 0 ? 1 : 0);
  });
});
