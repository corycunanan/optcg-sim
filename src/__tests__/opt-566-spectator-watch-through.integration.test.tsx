// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CardData,
  GameAction,
  GameState,
  ServerMessage,
} from "@shared/game-types";
import { CARDS, createTestPayload } from "@engine/__tests__/factories.js";
import { BoardLayout } from "@/components/game/board-layout/board-layout";
import { mintGameToken } from "@/lib/game/token";

class WatchThroughSocket {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class WatchThroughDurableObjectState {
  private readonly data = new Map<string, unknown>();
  private readonly sockets: WebSocket[] = [];
  private readonly tags = new Map<WebSocket, string[]>();

  readonly storage = {
    get: async <T,>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (
      keyOrEntries: string | Record<string, unknown>,
      value?: unknown
    ): Promise<void> => {
      if (typeof keyOrEntries === "string") {
        this.data.set(keyOrEntries, value);
        return;
      }
      for (const [key, entry] of Object.entries(keyOrEntries)) {
        this.data.set(key, entry);
      }
    },
    setAlarm: vi.fn(async (): Promise<void> => undefined),
    deleteAlarm: vi.fn(async (): Promise<void> => undefined),
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    this.sockets.push(ws);
    this.tags.set(ws, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    return tag
      ? this.sockets.filter((socket) => this.tags.get(socket)?.includes(tag))
      : this.sockets;
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws) ?? [];
  }
}

class WatchThroughResponse {
  readonly status: number;
  readonly webSocket: unknown;
  private readonly body: BodyInit | null;

  constructor(
    body: BodyInit | null = null,
    init: ResponseInit & { webSocket?: unknown } = {}
  ) {
    this.body = body;
    this.status = init.status ?? 200;
    this.webSocket = init.webSocket;
  }

  async text(): Promise<string> {
    return this.body === null ? "" : String(this.body);
  }
}

type WatchThroughTransport = {
  accept(playerIndex: 0 | 1, ws: WebSocket): void;
  broadcast(message: ServerMessage): void;
  scheduleDisconnect(playerIndex: 0 | 1): void;
};

type WatchThroughSession = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  transport: WatchThroughTransport;
  fetch(request: Request): Promise<Response>;
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
  webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>;
};

type SpectatorWatch = {
  socket: WatchThroughSocket;
  cursor: number;
  currentState: GameState | null;
};

function parseWatchMessages(socket: WatchThroughSocket): ServerMessage[] {
  return socket.sent.map((payload) => JSON.parse(payload) as ServerMessage);
}

function assertSpectatorInformationAndAffordanceInvariants(
  state: GameState,
  cardDb: Map<string, CardData>
): void {
  for (const [playerIndex, player] of state.players.entries()) {
    expect(player.hand.every((card) => card.cardId !== "hidden")).toBe(true);
    expect(
      player.hand.every((card) => !card.instanceId.startsWith("hidden-"))
    ).toBe(true);
    expect(player.deck.every((card) => card.cardId === "hidden")).toBe(true);
    expect(player.deck.map((card) => card.instanceId)).toEqual(
      player.deck.map((_, index) => `hidden-${playerIndex}-deck-${index}`)
    );
    for (const [lifeIndex, card] of player.life.entries()) {
      if (card.face !== "DOWN") continue;
      expect(card).toMatchObject({
        cardId: "hidden",
        instanceId: `hidden-${playerIndex}-life-${lifeIndex}`,
      });
    }
  }

  const deckIds = state.players.flatMap((player) =>
    player.deck.map((card) => card.instanceId)
  );
  expect(new Set(deckIds).size).toBe(deckIds.length);

  const onAction = vi.fn();
  const view = render(
    <BoardLayout
      me={state.players[0]}
      opp={state.players[1]}
      myIndex={null}
      bottomPlayerIndex={0}
      turn={state.turn}
      cardDb={Object.fromEntries(cardDb)}
      isMyTurn={false}
      battlePhase={state.turn.battleSubPhase}
      connectionStatus="connected"
      eventLog={state.eventLog}
      activeEffects={state.activeEffects}
      effectAvailability={state.effectAvailability}
      activePrompt={state.pendingPrompt?.options ?? null}
      activePromptId={state.pendingPrompt?.promptId ?? null}
      promptRespondingPlayer={
        state.promptRespondingPlayer ??
        state.pendingPrompt?.respondingPlayer ??
        null
      }
      onAction={onAction}
      onLeave={() => undefined}
      matchClosed={state.status !== "IN_PROGRESS"}
      canUndo
      interactionMode="spectator"
      viewportSize={{ width: 1920, height: 1080 }}
      outerScale={1}
    />
  );

  expect(view.getByLabelText("Spectator mode: viewing only")).toBeTruthy();
  expect(view.queryByRole("dialog")).toBeNull();
  const reachableButtons = view.queryAllByRole("button");
  expect(
    reachableButtons
      .map((button) => button.getAttribute("aria-label") ?? button.textContent)
      .filter(
        (label) =>
          !/^(Game menu|Inspect deck|Inspect trash|Opponent's life area|Your life area)/.test(
            label ?? ""
          )
      )
  ).toEqual([]);
  fireEvent.pointerDown(view.getByRole("button", { name: "Game menu" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(view.getByText("Stop spectating")).toBeTruthy();
  expect(view.queryByText("Concede")).toBeNull();
  expect(view.queryByRole("link")).toBeNull();
  expect(view.container.querySelector('[draggable="true"]')).toBeNull();
  expect(onAction).not.toHaveBeenCalled();

  // OPT-575 deliberately tracks target-selection keyboard handlers and ARIA
  // semantics that bypass today's suppression contract; do not assert them here.
  view.unmount();
}

function consumeAndAssertSpectatorStates(
  watch: SpectatorWatch,
  cardDb: Map<string, CardData>,
  expectState = true
): GameState | null {
  const messages = parseWatchMessages(watch.socket).slice(watch.cursor);
  watch.cursor += messages.length;
  const states = messages.flatMap((message) =>
    message.type === "game:state" || message.type === "game:update"
      ? [message.state]
      : []
  );
  if (expectState) expect(states.length).toBeGreaterThan(0);
  for (const state of states) {
    assertSpectatorInformationAndAffordanceInvariants(state, cardDb);
    watch.currentState = state;
  }
  return watch.currentState;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OPT-566 full spectated-game watch-through", () => {
  it("watches pregame through game over with production admission, exact bootstrap parity, and invariant-safe real UI states", async () => {
    const sessionPath = "../../workers/game/src/GameSession.ts";
    const transportPath = "../../workers/game/src/session/transport.ts";
    const { GameSession } = (await import(/* @vite-ignore */ sessionPath)) as {
      GameSession: new (state: unknown, env: unknown) => unknown;
    };
    const {
      SPECTATOR_GAME_ENDED_CLOSE_CODE,
      SPECTATOR_GAME_ENDED_CLOSE_REASON,
    } = (await import(/* @vite-ignore */ transportPath)) as {
      SPECTATOR_GAME_ENDED_CLOSE_CODE: number;
      SPECTATOR_GAME_ENDED_CLOSE_REASON: string;
    };

    const NativeResponse = globalThis.Response;
    let latestPair: [WatchThroughSocket, WatchThroughSocket] | null = null;
    vi.stubGlobal("Response", WatchThroughResponse);
    vi.stubGlobal(
      "WebSocketPair",
      function Pair(this: Record<number, WatchThroughSocket>) {
        latestPair = [new WatchThroughSocket(), new WatchThroughSocket()];
        this[0] = latestPair[0];
        this[1] = latestPair[1];
      }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new NativeResponse(null, { status: 200 }))
    );

    const durableState = new WatchThroughDurableObjectState();
    const session = new GameSession(durableState, {
      GAME_WORKER_SECRET: "watch-through-secret",
      NEXTJS_URL: "https://app.example.test",
    }) as WatchThroughSession;
    const payload = createTestPayload();
    payload.testPriorityRolls = [6, 1];
    payload.player2.testOrder = {
      ...payload.player2.testOrder!,
      life: [
        CARDS.VANILLA.id,
        CARDS.VANILLA.id,
        CARDS.VANILLA.id,
        CARDS.VANILLA.id,
        CARDS.TRIGGER.id,
      ],
    };

    const initResponse = await session.fetch(
      new Request(`https://worker.example.test/game/${payload.gameId}/init`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    expect(initResponse.status).toBe(200);
    expect(session.gameState.pregame?.phase).toBe("PRIORITY_CHOICE");

    const playerSockets = [
      new WatchThroughSocket(),
      new WatchThroughSocket(),
    ] as const;
    session.transport.accept(0, playerSockets[0] as unknown as WebSocket);
    session.transport.accept(1, playerSockets[1] as unknown as WebSocket);

    let spectatorJti = 0;
    const productionUpgrade = async (
      userId: string,
      displayName: string
    ): Promise<WatchThroughSocket> => {
      const token = await mintGameToken(userId, "watch-through-secret", {
        gameId: session.gameState.id,
        jti: `watch-through-${spectatorJti++}`,
        role: "spectator",
        spectatorDisplayName: displayName,
      });
      latestPair = null;
      const response = await session.fetch(
        new Request(
          `https://worker.example.test/game/${session.gameState.id}/ws?token=${encodeURIComponent(token)}`,
          { headers: { Upgrade: "websocket" } }
        )
      );
      expect(response.status).toBe(101);
      expect(latestPair).not.toBeNull();
      return latestPair![1];
    };

    let firstWatch: SpectatorWatch = {
      socket: await productionUpgrade("spectator-one", "Nami"),
      cursor: 0,
      currentState: null,
    };
    consumeAndAssertSpectatorStates(firstWatch, session.cardDb);

    const activeWatches: SpectatorWatch[] = [firstWatch];
    const drive = async (
      playerIndex: 0 | 1,
      action: GameAction
    ): Promise<GameState> => {
      const playerCursor = playerSockets[playerIndex].sent.length;
      await session.webSocketMessage(
        playerSockets[playerIndex] as unknown as WebSocket,
        JSON.stringify({ type: "game:action", action })
      );
      const playerReplies = parseWatchMessages(
        playerSockets[playerIndex]
      ).slice(playerCursor);
      expect(
        playerReplies.some(
          (message) =>
            message.type === "action:rejected" || message.type === "game:error"
        )
      ).toBe(false);
      for (const watch of activeWatches) {
        consumeAndAssertSpectatorStates(watch, session.cardDb);
      }
      const current = activeWatches[0].currentState;
      expect(current).not.toBeNull();
      for (const watch of activeWatches.slice(1)) {
        expect(watch.currentState).toEqual(current);
      }
      return current!;
    };

    await drive(0, {
      type: "PLAYER_CHOICE",
      choiceId: "FIRST",
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    await drive(0, {
      type: "PLAYER_CHOICE",
      choiceId: "REDRAW",
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    let current = await drive(1, {
      type: "PLAYER_CHOICE",
      choiceId: "KEEP",
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    expect(current.pregame).toBeNull();
    expect(current.turn).toMatchObject({
      number: 1,
      activePlayerIndex: 0,
      phase: "MAIN",
    });

    current = await drive(0, { type: "ADVANCE_PHASE" });
    expect(current.turn).toMatchObject({
      number: 1,
      activePlayerIndex: 1,
      phase: "MAIN",
    });
    current = await drive(1, { type: "ADVANCE_PHASE" });
    expect(current.turn).toMatchObject({
      number: 2,
      activePlayerIndex: 0,
      phase: "MAIN",
    });

    const secondWatch: SpectatorWatch = {
      socket: await productionUpgrade("spectator-two", "Robin"),
      cursor: 0,
      currentState: null,
    };
    consumeAndAssertSpectatorStates(secondWatch, session.cardDb);
    expect(secondWatch.currentState).toEqual(firstWatch.currentState);
    activeWatches.push(secondWatch);

    const presenceBeforeReconnect = structuredClone(session.gameState.players);
    const scheduleDisconnect = vi.spyOn(
      session.transport,
      "scheduleDisconnect"
    );
    firstWatch.socket.close(1006, "network lost");
    await session.webSocketClose(
      firstWatch.socket as unknown as WebSocket,
      1006,
      "network lost"
    );
    const reconnectedFirstWatch: SpectatorWatch = {
      socket: await productionUpgrade("spectator-one", "Nami"),
      cursor: 0,
      currentState: null,
    };
    consumeAndAssertSpectatorStates(reconnectedFirstWatch, session.cardDb);
    expect(reconnectedFirstWatch.currentState).toEqual(
      secondWatch.currentState
    );
    expect(session.gameState.players).toEqual(presenceBeforeReconnect);
    expect(scheduleDisconnect).not.toHaveBeenCalled();
    expect(
      session.gameState.players.map((player) => ({
        connected: player.connected,
        awayReason: player.awayReason,
        rejoinDeadlineAt: player.rejoinDeadlineAt,
      }))
    ).toEqual(
      presenceBeforeReconnect.map((player) => ({
        connected: player.connected,
        awayReason: player.awayReason,
        rejoinDeadlineAt: player.rejoinDeadlineAt,
      }))
    );
    firstWatch = reconnectedFirstWatch;
    activeWatches[0] = firstWatch;

    const deniedMessageCounts = activeWatches.map(
      (watch) => watch.socket.sent.length
    );
    session.transport.broadcast({
      type: "game:undo",
      playerIndex: 0,
      canUndo: false,
    });
    expect(activeWatches.map((watch) => watch.socket.sent.length)).toEqual(
      deniedMessageCounts
    );

    current = await drive(0, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: session.gameState.players[0].leader.instanceId,
      targetInstanceId: session.gameState.players[1].leader.instanceId,
    });
    expect(current.turn.battleSubPhase).toBe("BLOCK_STEP");
    current = await drive(1, { type: "PASS" });
    expect(current.turn.battleSubPhase).toBe("COUNTER_STEP");
    current = await drive(1, { type: "PASS" });
    expect(current.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    expect(current.turn.battle?.pendingTriggerLifeCard?.cardId).toBe(
      CARDS.TRIGGER.id
    );
    current = await drive(1, {
      type: "REVEAL_TRIGGER",
      reveal: true,
      promptId: session.gameState.pendingPrompt?.promptId,
    });
    expect(current.turn.battle).toBeNull();
    expect(
      current.eventLog.some(
        (event) =>
          event.type === "TRIGGER_ACTIVATED" &&
          event.payload.cardId === CARDS.TRIGGER.id
      )
    ).toBe(true);

    await drive(1, { type: "CONCEDE" });
    for (const watch of activeWatches) {
      const delivered = parseWatchMessages(watch.socket);
      expect(delivered).toContainEqual({
        type: "game:over",
        winner: 0,
        reason: "Player 2 conceded",
      });
      expect(watch.socket.closed).toContainEqual({
        code: SPECTATOR_GAME_ENDED_CLOSE_CODE,
        reason: SPECTATOR_GAME_ENDED_CLOSE_REASON,
      });
    }
  });
});
