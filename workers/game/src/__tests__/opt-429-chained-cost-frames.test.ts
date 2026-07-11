/**
 * OPT-429 — chaining two selectable costs must not orphan an effect-stack
 * frame.
 *
 * Failure mode: resolving the first cost's selection re-entered
 * payCostsWithSelection for the next cost with the consumed frame still on
 * the stack; the second cost's prompt pushed a new frame on top ([0,1]).
 * Resolving the second selection popped only the top frame, leaving the
 * first orphaned ([0]) after the effect reported resolved: true.
 * GameSession defers all prompt draining while effectStack.length > 0, so
 * the stale frame stalled normal flow and could misroute a later response.
 *
 * Fix under test: handleAwaitingCostSelection retires the consumed frame
 * before paying the next cost (symmetric with resumeAfterBranchPick), and
 * carries costResultRefs + pendingTriggers into the successor frame.
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
  QueuedTrigger,
} from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { updateTopFrame } from "../engine/effect-stack.js";
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

/** OP10-026-shaped block: bottom-deck a Character, then a trash card, then draw. */
function chainedCostBlock(): EffectBlock {
  return {
    id: "opt429-test-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs: [
      { type: "PLACE_OWN_CHARACTER_TO_DECK", amount: 1, position: "BOTTOM" },
      { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1, position: "BOTTOM" },
    ] as Cost[],
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  } as EffectBlock;
}

/** State where both costs offer a genuine choice (2 characters, 2 trash cards). */
function stateWithChoices(cardDb: Map<string, CardData>): GameState {
  const state = createBattleReadyState(cardDb);
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = {
    ...newPlayers[0],
    trash: [trashCard(CARDS.VANILLA.id, "a"), trashCard(CARDS.RUSH.id, "b")],
  };
  return { ...state, players: newPlayers };
}

describe("OPT-429: chained selectable costs keep frame push/pop symmetric", () => {
  it("stack holds exactly one frame at the second prompt and none after resolution", () => {
    const cardDb = createTestCardDb();
    const state = stateWithChoices(cardDb);
    const block = chainedCostBlock();

    const pay = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);
    expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(pay.state.effectStack).toHaveLength(1);

    // First selection: bottom-deck char-0-b1. The consumed frame must be
    // replaced by the second cost's frame, not buried under it.
    const second = resumeFromStack(
      pay.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["char-0-b1"] } as GameAction,
      cardDb,
    );
    expect(second.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(second.state.effectStack).toHaveLength(1);
    expect(second.state.effectStack[0].currentCostIndex).toBe(1);

    // Second selection: bottom-deck trash-a. Chain resolves; no stale frame.
    const handBefore = second.state.players[0].hand.length;
    const done = resumeFromStack(
      second.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a"] } as GameAction,
      cardDb,
    );
    expect(done.resolved).toBe(true);
    expect(done.state.effectStack).toHaveLength(0);

    const deck = done.state.players[0].deck;
    const bottom = deck.slice(-2);
    const bottomIds = bottom.map((c) => c.instanceId);
    expect(bottomIds).toContain("trash-a");
    // The bottom-decked field character re-enters the deck as a fresh
    // instance (OPT-453, rules §3-1-6) — its old field id is gone.
    expect(bottom.map((c) => c.cardId)).toContain(CARDS.BLOCKER.id);
    expect(bottomIds).not.toContain("char-0-b1");
    expect(done.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("carries triggers queued behind the cost chain into the successor frame", () => {
    const cardDb = createTestCardDb();
    const state = stateWithChoices(cardDb);
    const block = chainedCostBlock();

    const pay = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);
    const queuedTrigger: QueuedTrigger = {
      sourceCardInstanceId: pay.state.players[0].leader.instanceId,
      controller: 0,
      effectBlock: {
        id: "opt429-queued-draw",
        category: "auto",
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      } as EffectBlock,
      triggeringEvent: {
        type: "CARD_PLAYED",
        playerIndex: 0,
        payload: { cardInstanceId: "queued-source" },
      } as never,
    };
    const stacked = updateTopFrame(pay.state, { pendingTriggers: [queuedTrigger] });

    const second = resumeFromStack(
      stacked,
      { type: "SELECT_TARGET", selectedInstanceIds: ["char-0-b1"] } as GameAction,
      cardDb,
    );
    expect(second.state.effectStack).toHaveLength(1);
    expect(second.state.effectStack[0].pendingTriggers).toEqual([queuedTrigger]);

    // Effect draw + queued trigger draw both land once the chain resolves.
    const handBefore = second.state.players[0].hand.length;
    const done = resumeFromStack(
      second.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a"] } as GameAction,
      cardDb,
    );
    expect(done.resolved).toBe(true);
    expect(done.state.effectStack).toHaveLength(0);
    expect(done.state.players[0].hand).toHaveLength(handBefore + 2);
  });

  it("cleans up the stack and still drains queued triggers when a later cost is unpayable", () => {
    const cardDb = createTestCardDb();
    // Empty trash: the second cost (PLACE_FROM_TRASH_TO_DECK) becomes
    // unpayable once the first selection resolves (rule 8-3-1-3-1 territory —
    // this test pins the OPT-429 invariants only: no orphaned frame, queued
    // triggers still processed, effect actions skipped).
    const state = createBattleReadyState(cardDb);
    const block = chainedCostBlock();

    const pay = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);
    expect(pay.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const queuedTrigger: QueuedTrigger = {
      sourceCardInstanceId: pay.state.players[0].leader.instanceId,
      controller: 0,
      effectBlock: {
        id: "opt429-queued-draw-unpayable",
        category: "auto",
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      } as EffectBlock,
      triggeringEvent: {
        type: "CARD_PLAYED",
        playerIndex: 0,
        payload: { cardInstanceId: "queued-source" },
      } as never,
    };
    const stacked = updateTopFrame(pay.state, { pendingTriggers: [queuedTrigger] });
    const handBefore = stacked.players[0].hand.length;

    const done = resumeFromStack(
      stacked,
      { type: "SELECT_TARGET", selectedInstanceIds: ["char-0-b1"] } as GameAction,
      cardDb,
    );

    expect(done.state.effectStack).toHaveLength(0);
    expect(done.pendingPrompt).toBeUndefined();
    // The effect's own DRAW is skipped (cost unpaid), but the queued trigger
    // behind the chain still resolves — exactly one card drawn.
    expect(done.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("completes the two-cost chain through GameSession without wedging prompt flow", async () => {
    const cardDb = createTestCardDb();
    const state = stateWithChoices(cardDb);
    const block = chainedCostBlock();
    const pay = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);

    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = {
      ...pay.state,
      pendingPrompt: { ...pay.pendingPrompt!, promptId: "prompt-1" },
    };
    session.cardDb = cardDb;
    const ws = new MockWebSocket();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["char-0-b1"],
      promptId: "prompt-1",
    } as GameAction);

    const prompt2 = session.gameState.pendingPrompt;
    expect(prompt2?.options.promptType).toBe("SELECT_TARGET");
    expect(session.gameState.effectStack).toHaveLength(1);

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["trash-a"],
      promptId: prompt2!.promptId,
    } as GameAction);

    // Pre-fix: the orphaned frame kept effectStack.length > 0 forever, which
    // blocks GameSession prompt draining and stalls the match.
    expect(session.gameState.pendingPrompt).toBeFalsy();
    expect(session.gameState.effectStack).toHaveLength(0);
  });
});
