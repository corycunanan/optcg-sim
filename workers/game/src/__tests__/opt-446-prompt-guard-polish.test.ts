/**
 * OPT-446 — prompt-guard polish.
 *
 * 1. Decline vocabulary desync: the engine accepts PLAYER_CHOICE
 *    {choiceId: "skip"} as an optional-effect decline (resume/choice.ts), but
 *    the GameSession gate rejected any choiceId other than
 *    "activate"/"accept", locking out clients that decline with "skip".
 * 2. Silent rejection: an engine-level rejection (stale/duplicate/invalid
 *    same-type response) restored the prompt but answered with only a
 *    game:update echoing the rejected action — no game:error, so the sender
 *    couldn't distinguish rejection from acceptance without diffing state.
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
  ResumeContext,
} from "../types.js";
import type { Cost, EffectBlock, RuntimeActiveEffect } from "../engine/effect-types.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";

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

function errors(ws: MockWebSocket): string[] {
  return ws.sent
    .map((m) => JSON.parse(m) as { type: string; reason?: string })
    .filter((m) => m.type === "action:rejected")
    .map((m) => m.reason ?? "");
}

function makeSession(state: GameState, cardDb: Map<string, CardData>): TestAccess {
  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as TestAccess;
  session.gameState = state;
  session.cardDb = cardDb;
  return session;
}

function optionalBlock(): EffectBlock {
  return {
    id: "opt446-optional-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs: [],
    actions: [{ type: "DRAW", params: { amount: 1 } }],
    flags: { optional: true },
  } as EffectBlock;
}

/** Session parked on a live OPTIONAL_EFFECT prompt. */
function sessionWithOptionalPrompt(): { session: TestAccess; ws: MockWebSocket } {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const result = resolveEffect(state, optionalBlock(), "char-0-v1", 0, cardDb);
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

  const session = makeSession(
    { ...result.state, pendingPrompt: result.pendingPrompt! },
    cardDb,
  );
  return { session, ws: new MockWebSocket() };
}

/** Session parked on a live SELECT_TARGET cost prompt (2 of 4 trash cards). */
function sessionWithSelectPrompt(): { session: TestAccess; ws: MockWebSocket } {
  const cardDb = createTestCardDb();
  let state = createBattleReadyState(cardDb);
  const trashCard = (cardId: string, suffix: string): CardInstance => ({
    instanceId: `trash-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  });
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

  const block = {
    ...optionalBlock(),
    id: "opt446-select-block",
    costs: [{ type: "PLACE_FROM_TRASH_TO_DECK", amount: 2 } as Cost],
  } as EffectBlock;
  const pay = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);
  expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

  const session = makeSession(
    { ...pay.state, pendingPrompt: pay.pendingPrompt! },
    cardDb,
  );
  return { session, ws: new MockWebSocket() };
}

describe("OPT-446: gate accepts the engine's 'skip' decline vocabulary", () => {
  it("declines the optional effect on PLAYER_CHOICE skip", async () => {
    const { session, ws } = sessionWithOptionalPrompt();
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "skip",
    } as GameAction);

    expect(errors(ws)).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
    expect(session.gameState.effectStack).toHaveLength(0);
    // Declined — the optional DRAW must not run.
    expect(session.gameState.players[0].hand).toHaveLength(handBefore);
  });

  it("still activates on PLAYER_CHOICE activate", async () => {
    const { session, ws } = sessionWithOptionalPrompt();
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "activate",
    } as GameAction);

    expect(errors(ws)).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
    expect(session.gameState.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("still rejects an unknown optional-effect choice id", async () => {
    const { session, ws } = sessionWithOptionalPrompt();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "banana",
    } as GameAction);

    expect(errors(ws)).toContain("That choice is no longer available");
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  });
});

describe("OPT-446: engine-level rejections surface action feedback", () => {
  it("emits action:rejected when a same-type response is rejected and the prompt restored", async () => {
    const { session, ws } = sessionWithSelectPrompt();
    const stateBefore = session.gameState;

    // Passes the gate (correct type, no promptId on the injected prompt) but
    // the resolver rejects the unknown instance ids.
    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["nonexistent-x", "nonexistent-y"],
    } as GameAction);

    expect(errors(ws)).toContain(
      "That prompt response was rejected; the pending prompt is unchanged",
    );
    // Prompt and stack restored exactly as before.
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(session.gameState.effectStack).toHaveLength(stateBefore.effectStack.length);
  });

  it("does not emit the rejection error on a successful selection", async () => {
    const { session, ws } = sessionWithSelectPrompt();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["trash-c", "trash-a"],
    } as GameAction);

    expect(errors(ws)).toHaveLength(0);
    // Flow advanced to the arrange stage — not a rejection.
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  });

  it("does not emit the rejection error on a legitimate PASS decline", async () => {
    const { session, ws } = sessionWithOptionalPrompt();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PASS",
    } as GameAction);

    expect(errors(ws)).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
  });

  it("emits action:rejected when a selection is re-prompted (OPT-439 restore path)", async () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const block: EffectBlock = {
      id: "opt446-ko-block",
      category: "auto",
      actions: [{
        type: "KO",
        target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      }],
    } as EffectBlock;
    const first = resolveEffect(base, block, base.players[0].leader.instanceId, 0, cardDb);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const session = makeSession(
      { ...first.state, pendingPrompt: first.pendingPrompt! },
      cardDb,
    );
    const ws = new MockWebSocket();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["stale-target"],
    } as GameAction);

    expect(errors(ws)).toContain(
      "That prompt response was rejected; the pending prompt is unchanged",
    );
    // The prompt was re-issued and the frame restored — the match continues.
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const followUp = new MockWebSocket();
    await session.handleAction(followUp as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId],
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);
    expect(errors(followUp)).toHaveLength(0);
    expect(session.gameState.players[1].characters.some((c) => c?.instanceId === target.instanceId)).toBe(false);
  });

  it("emits action:rejected on a rejected legacy (frame-less) DON-return choice", async () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: base.players[1].leader.instanceId,
      controller: 1,
      pausedAction: { type: "FORCE_OPPONENT_DON_RETURN", params: { amount: 2 } },
      remainingActions: [],
      resultRefs: [],
      validTargets: ["don-return:1:2"],
    };
    const session = makeSession(
      {
        ...base,
        effectStack: [],
        pendingPrompt: {
          options: {
            promptType: "PLAYER_CHOICE",
            effectDescription: "Choose which DON!! to return",
            choices: [
              { id: "don-return:1:2", label: "Return 1 active + 1 rested" },
              { id: "don-return:0:2", label: "Return 2 rested" },
            ],
          },
          respondingPlayer: 0,
          resumeContext: resumeCtx as never,
        },
      },
      cardDb,
    );
    const ws = new MockWebSocket();

    // Offered by the (stale) prompt options, but not in the authoritative
    // validTargets — the legacy resume handler rejects it.
    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "don-return:0:2",
    } as GameAction);

    expect(errors(ws)).toContain(
      "That prompt response was rejected; the pending prompt is unchanged",
    );
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  });
});

describe("OPT-446: skip declines replacement prompts instead of accepting them", () => {
  function koWithOptionalReplacement(): {
    session: TestAccess;
    target: CardInstance;
  } {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const replacement: RuntimeActiveEffect = {
      id: "opt446-replacement",
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: "opt446-replacement-block",
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
      id: "opt446-ko-vs-replacement",
      category: "auto",
      actions: [{
        type: "KO",
        target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      }],
    } as EffectBlock;
    const first = resolveEffect(state, block, state.players[0].leader.instanceId, 0, cardDb);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const session = makeSession(
      { ...first.state, pendingPrompt: first.pendingPrompt! },
      cardDb,
    );
    return { session, target };
  }

  it("skip declines the replacement — the K.O. proceeds", async () => {
    const { session, target } = koWithOptionalReplacement();
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();

    await session.handleAction(player0 as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId],
    } as GameAction);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect((session.gameState.pendingPrompt?.resumeContext as { type?: string }).type)
      .toBe("REPLACEMENT_BATCH");

    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "skip",
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);

    expect(errors(player1)).toHaveLength(0);
    // Declined: the character is K.O.'d, not rested-and-saved.
    expect(session.gameState.players[1].characters.some((c) => c?.instanceId === target.instanceId)).toBe(false);
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
  });

  it("accept still applies the replacement — the character survives rested", async () => {
    const { session, target } = koWithOptionalReplacement();
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();

    await session.handleAction(player0 as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [target.instanceId],
    } as GameAction);

    await session.handleAction(player1 as unknown as WebSocket, 1, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);

    const saved = session.gameState.players[1].characters.find(
      (c) => c?.instanceId === target.instanceId,
    );
    expect(saved).toBeTruthy();
    expect(saved?.state).toBe("RESTED");
  });
});
