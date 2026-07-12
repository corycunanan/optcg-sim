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
import type { Cost, EffectBlock, RuntimeActiveEffect } from "../engine/effect-types.js";
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
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);
    expect(session.gameState.pendingPrompt).toBeFalsy();
    expect(session.gameState.effectStack.length).toBe(0);
    const deck = session.gameState.players[0].deck;
    expect(deck.slice(-2).map((c) => c.cardId)).toEqual([CARDS.VANILLA.id, CARDS.BLOCKER.id]);
    expect(deck.slice(-2).map((c) => c.instanceId)).not.toContain("trash-a");
    expect(deck.slice(-2).map((c) => c.instanceId)).not.toContain("trash-c");
  });
});

describe("OPT-438: prompt identity and ARRANGE payload validation", () => {
  it("rejects a stale same-type response without consuming the current prompt", async () => {
    const { session, ws } = sessionWithSelectPrompt();
    session.gameState = {
      ...session.gameState,
      pendingPrompt: {
        ...session.gameState.pendingPrompt!,
        promptId: "current-prompt",
      },
    };
    const stateBefore = session.gameState;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["trash-c", "trash-a"],
      promptId: "previous-prompt",
    });

    expect(lastError(ws)).toMatch(/stale/);
    expect(session.gameState).toBe(stateBefore);
    expect(session.gameState.pendingPrompt?.promptId).toBe("current-prompt");
  });

  it("accepts the matching identity and stamps the next prompt with a new identity", async () => {
    const { session, ws } = sessionWithSelectPrompt();
    session.gameState = {
      ...session.gameState,
      pendingPrompt: {
        ...session.gameState.pendingPrompt!,
        promptId: "select-prompt",
      },
    };

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["trash-c", "trash-a"],
      promptId: "select-prompt",
    });

    expect(session.gameState.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(session.gameState.pendingPrompt?.promptId).toBeTruthy();
    expect(session.gameState.pendingPrompt?.promptId).not.toBe("select-prompt");
  });

  it.each([
    {
      name: "an unrevealed card",
      keptCardInstanceId: "",
      orderedInstanceIds: ["trash-a", "forged-id"],
    },
    {
      name: "a duplicate card",
      keptCardInstanceId: "",
      orderedInstanceIds: ["trash-a", "trash-a"],
    },
    {
      name: "an omitted card",
      keptCardInstanceId: "",
      orderedInstanceIds: ["trash-a"],
    },
    {
      name: "a kept card when validTargets is empty",
      keptCardInstanceId: "trash-a",
      orderedInstanceIds: ["trash-c"],
    },
  ])(
    "rejects $name and preserves the ARRANGE prompt",
    async ({ keptCardInstanceId, orderedInstanceIds }) => {
      const { session, ws } = sessionWithSelectPrompt();
      await session.handleAction(ws as unknown as WebSocket, 0, {
        type: "SELECT_TARGET",
        selectedInstanceIds: ["trash-c", "trash-a"],
      });
      const promptBefore = session.gameState.pendingPrompt!;
      const stackBefore = session.gameState.effectStack;

      await session.handleAction(ws as unknown as WebSocket, 0, {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId,
        orderedInstanceIds,
        destination: "top",
        promptId: promptBefore.promptId,
      });

      expect(lastError(ws)).toBeTruthy();
      expect(session.gameState.pendingPrompt).toBe(promptBefore);
      expect(session.gameState.effectStack).toBe(stackBefore);
    },
  );
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

describe("OPT-439: replacement prompts preserve effect continuations", () => {
  it("routes a selected KO replacement through GameSession and resumes the suffix", async () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const replacement: RuntimeActiveEffect = {
      id: "opt439-replacement",
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: "opt439-replacement-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER" },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [],
      timestamp: Date.now(),
    };
    const state: GameState = { ...base, activeEffects: [replacement as never] };
    const block: EffectBlock = {
      id: "opt439-ko-then-draw",
      category: "auto",
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
        },
        { type: "DRAW", params: { amount: 1 } },
      ],
    };
    const first = resolveEffect(state, block, state.players[0].leader.instanceId, 0, cardDb);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = { ...first.state, pendingPrompt: first.pendingPrompt! };
    session.cardDb = cardDb;
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(player0 as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId],
    });

    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect((session.gameState.pendingPrompt?.resumeContext as { type?: string }).type).toBe("REPLACEMENT_BATCH");
    expect(session.gameState.effectStack.at(-1)?.phase).toBe("INTERRUPTED_BY_TRIGGERS");

    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    expect(session.gameState.pendingPrompt).toBeNull();
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.players[1].characters.some((card) => card?.instanceId === target.instanceId)).toBe(true);
    expect(session.gameState.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("preserves IF_DO semantics when the selected KO is replaced", async () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const replacement: RuntimeActiveEffect = {
      id: "opt439-if-do-replacement",
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: "opt439-if-do-replacement-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER" },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [],
      timestamp: Date.now(),
    };
    const block: EffectBlock = {
      id: "opt439-ko-if-do-then",
      category: "auto",
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
        },
        { type: "DRAW", params: { amount: 1 }, chain: "IF_DO" },
        { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
      ],
    };
    const first = resolveEffect(
      { ...base, activeEffects: [replacement as never] },
      block,
      base.players[0].leader.instanceId,
      0,
      cardDb,
    );
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = { ...first.state, pendingPrompt: first.pendingPrompt! };
    session.cardDb = cardDb;
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(player0 as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId],
    });
    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("resumes the outer suffix after a nested replacement choice", async () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const [target, unmatchedTarget] = base.players[1].characters.filter(
      (card): card is CardInstance => card !== null,
    );
    const replacement: RuntimeActiveEffect = {
      id: "opt439-nested-replacement",
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: "opt439-nested-replacement-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: null,
          replacement_actions: [{
            type: "PLAYER_CHOICE",
            params: {
              labels: ["Rest this card", "Do nothing"],
              options: [
                [{ type: "SET_REST", target: { type: "SELF" } }],
                [],
              ],
            },
          }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [target.instanceId],
      timestamp: Date.now(),
    };
    const block: EffectBlock = {
      id: "opt439-ko-nested-choice-then-draw",
      category: "auto",
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } },
        },
        { type: "DRAW", params: { amount: 1 } },
      ],
    };
    const promptedOnRest: EffectBlock = {
      id: "opt439-prompted-on-rest",
      category: "auto",
      trigger: { event: "CHARACTER_BECOMES_RESTED" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { optional: true },
    };
    const first = resolveEffect(
      {
        ...base,
        activeEffects: [replacement as never],
        triggerRegistry: [{
          id: "opt439-prompted-on-rest-registration",
          sourceCardInstanceId: target.instanceId,
          effectBlockId: promptedOnRest.id,
          trigger: promptedOnRest.trigger,
          effectBlock: promptedOnRest,
          zone: "FIELD",
          controller: 1,
        } as never],
      },
      block,
      base.players[0].leader.instanceId,
      0,
      cardDb,
    );
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = { ...first.state, pendingPrompt: first.pendingPrompt! };
    session.cardDb = cardDb;
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(player0 as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId, unmatchedTarget.instanceId],
    });
    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    expect(session.gameState.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(session.gameState.effectStack.at(-1)?.phase).toBe("AWAITING_PLAYER_CHOICE");

    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "0",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect((session.gameState.effectStack.at(-1) as unknown as {
      replacementBatchContinuation?: unknown;
    }).replacementBatchContinuation).toBeDefined();

    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    const preservedTarget = session.gameState.players[1].characters.find(
      (card) => card?.instanceId === target.instanceId,
    );
    expect(preservedTarget?.state).toBe("RESTED");
    expect(session.gameState.players[1].characters.some(
      (card) => card?.instanceId === unmatchedTarget.instanceId,
    )).toBe(false);
    expect(session.gameState.eventLog.some(
      (event) => event.type === "CARD_KO" && event.payload.cardInstanceId === unmatchedTarget.instanceId,
    )).toBe(true);
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("preserves typed contexts when a substitute action is itself replaced", async () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const makeReplacement = (
      id: string,
      replacementActions: EffectBlock["actions"],
      causeBy: "OPPONENT_EFFECT" | "ANY" = "OPPONENT_EFFECT",
    ): RuntimeActiveEffect => ({
      id,
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: `${id}-block`,
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: causeBy },
          target_filter: null,
          replacement_actions: replacementActions,
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [target.instanceId],
      timestamp: Date.now(),
    });
    const outerReplacement = makeReplacement(
      "opt439-outer-replacement",
      [{ type: "KO", target: { type: "SELF" } }],
    );
    const nestedReplacement = makeReplacement(
      "opt439-nested-ko-replacement",
      [{ type: "SET_REST", target: { type: "SELF" } }],
      "ANY",
    );
    const block: EffectBlock = {
      id: "opt439-nested-replacement-context",
      category: "auto",
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
        },
        { type: "DRAW", params: { amount: 1 } },
      ],
    };
    const first = resolveEffect(
      { ...base, activeEffects: [outerReplacement as never, nestedReplacement as never] },
      block,
      base.players[0].leader.instanceId,
      0,
      cardDb,
    );
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = { ...first.state, pendingPrompt: first.pendingPrompt! };
    session.cardDb = cardDb;
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(player0 as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId],
    });
    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect((session.gameState.pendingPrompt?.resumeContext as { type?: string }).type).toBe(
      "REPLACEMENT_BATCH",
    );

    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    });

    const preservedTarget = session.gameState.players[1].characters.find(
      (card) => card?.instanceId === target.instanceId,
    );
    expect(preservedTarget?.state).toBe("RESTED");
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.players[0].hand).toHaveLength(handBefore + 1);
  });
});
