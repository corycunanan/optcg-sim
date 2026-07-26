import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import { log } from "../lib/log.js";
import {
  MAX_SPECTATOR_SOCKETS,
  SessionTransport,
  type FilteredStateRecipient,
} from "../session/transport.js";
import * as visibility from "../session/visibility.js";
import type {
  CardData,
  Env,
  GameAction,
  GameState,
  PendingPromptState,
  ServerMessage,
} from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

class MockWebSocket {
  readonly sent: string[] = [];
  private attachment: unknown = null;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {}

  serializeAttachment(attachment: unknown): void {
    this.attachment = attachment;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockDurableObjectState {
  private readonly sockets: MockWebSocket[] = [];
  private readonly tags = new Map<MockWebSocket, string[]>();

  readonly storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    const socket = ws as unknown as MockWebSocket;
    this.sockets.push(socket);
    this.tags.set(socket, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    const sockets = tag
      ? this.sockets.filter((socket) => this.tags.get(socket)?.includes(tag))
      : this.sockets;
    return sockets as unknown as WebSocket[];
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws as unknown as MockWebSocket) ?? [];
  }
}

type StateMessage = Extract<ServerMessage, { type: "game:state" }>;

type GameSessionTestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  transport: SessionTransport;
  acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void;
  broadcast(msg: ServerMessage): void;
  broadcastFilteredState(
    build: (
      state: GameState,
      recipientPlayerIndex: FilteredStateRecipient
    ) => ServerMessage
  ): void;
  broadcastGameUpdate(
    action: GameAction,
    actingPlayerIndex: 0 | 1,
    canUndo?: boolean
  ): void;
  sendEffectPrompt(prompt: PendingPromptState): void;
};

type RecipientName = "player-0" | "player-1" | "spectator";

function createSession(
  order: readonly RecipientName[] = ["player-0", "player-1", "spectator"]
): {
  session: GameSessionTestAccess;
  sockets: Record<RecipientName, MockWebSocket>;
} {
  const durableState = new MockDurableObjectState();
  const session = new GameSession(
    durableState as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env
  ) as unknown as GameSessionTestAccess;
  const cardDb = createTestCardDb();
  session.gameState = createBattleReadyState(cardDb);
  session.cardDb = cardDb;

  const sockets = {
    "player-0": new MockWebSocket(),
    "player-1": new MockWebSocket(),
    spectator: new MockWebSocket(),
  };
  for (const recipient of order) {
    if (recipient === "spectator") {
      session.transport.acceptSpectator(
        "spectator-user",
        sockets.spectator as unknown as WebSocket
      );
    } else {
      const playerIndex = recipient === "player-0" ? 0 : 1;
      session.acceptAuthoritativePlayerSocket(
        playerIndex,
        sockets[recipient] as unknown as WebSocket
      );
    }
  }
  return { session, sockets };
}

function stateMessage(state: GameState): StateMessage {
  return { type: "game:state", state };
}

function parsedMessages(socket: MockWebSocket): ServerMessage[] {
  return socket.sent.map((payload) => JSON.parse(payload) as ServerMessage);
}

function fullBoardState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player, playerIndex) => {
      const source = player.characters.find((card) => card !== null);
      if (!source) throw new Error("Full-board fixture requires a Character");
      return {
        ...player,
        characters: Array.from({ length: 5 }, (_, index) => ({
          ...source,
          instanceId: `full-character-${playerIndex}-${index}`,
        })),
        stage: {
          ...source,
          instanceId: `full-stage-${playerIndex}`,
          zone: "STAGE",
        },
        donCostArea: Array.from({ length: 10 }, (_, index) => ({
          instanceId: `full-don-${playerIndex}-${index}`,
          state: "ACTIVE" as const,
          attachedTo: null,
        })),
        donDeck: [],
      };
    }) as unknown as GameState["players"],
  };
}

describe("OPT-552 spectator filtered-state broadcast", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds two filtered states without spectators and never builds the merged view", () => {
    const { session } = createSession(["player-0", "player-1"]);
    const spectatorBuilder = vi.spyOn(visibility, "visibleStateForSpectator");
    const build =
      vi.fn<
        (state: GameState, recipient: FilteredStateRecipient) => ServerMessage
      >(stateMessage);

    session.broadcastFilteredState(build);

    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls.map(([, recipient]) => recipient)).toEqual([0, 1]);
    expect(spectatorBuilder).not.toHaveBeenCalled();
  });

  it("builds one merged state and shares one serialized payload at the spectator cap", () => {
    const { session, sockets } = createSession();
    const spectators = [sockets.spectator];
    for (let index = 1; index < MAX_SPECTATOR_SOCKETS; index += 1) {
      const spectator = new MockWebSocket();
      spectators.push(spectator);
      session.transport.acceptSpectator(
        `spectator-${index}`,
        spectator as unknown as WebSocket
      );
    }
    const spectatorBuilder = vi.spyOn(visibility, "visibleStateForSpectator");
    const build =
      vi.fn<
        (state: GameState, recipient: FilteredStateRecipient) => ServerMessage
      >(stateMessage);

    session.broadcastFilteredState(build);

    expect(build).toHaveBeenCalledTimes(3);
    expect(build.mock.calls.map(([, recipient]) => recipient)).toEqual([
      0,
      1,
      null,
    ]);
    expect(spectatorBuilder).toHaveBeenCalledTimes(1);
    expect(spectators.every((socket) => socket.sent.length === 1)).toBe(true);
    expect(new Set(spectators.map((socket) => socket.sent[0])).size).toBe(1);
  });

  it("uses the reusable recipient builder for steady-state fan-out", () => {
    const { session } = createSession();
    const builder = vi.spyOn(
      session.transport,
      "buildFilteredStateForRecipient"
    );

    session.broadcastFilteredState(stateMessage);

    expect(builder.mock.calls.map(([, , recipient]) => recipient)).toEqual([
      0,
      1,
      null,
    ]);
  });

  it("delivers filtered state only to the authoritative socket for a spectator", () => {
    const { session, sockets } = createSession();
    const replacement = new MockWebSocket();
    session.transport.acceptSpectator(
      "spectator-user",
      replacement as unknown as WebSocket
    );

    session.broadcastFilteredState(stateMessage);

    expect(sockets.spectator.sent).toEqual([]);
    expect(replacement.sent).toHaveLength(1);
  });

  it("never includes the action echo in a spectator game:update frame", () => {
    const { session, sockets } = createSession();
    const action = {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "opaque-kept-id",
      orderedInstanceIds: ["opaque-second-id", "opaque-first-id"],
      destination: "top",
      promptId: "opaque-prompt-id",
    } satisfies GameAction;

    session.broadcastGameUpdate(action, 0, true);

    expect(parsedMessages(sockets["player-0"])[0]).toHaveProperty(
      "action",
      action
    );
    expect(parsedMessages(sockets["player-1"])[0]).not.toHaveProperty("action");
    const spectatorFrames = parsedMessages(sockets.spectator);
    expect(spectatorFrames).toHaveLength(1);
    expect(spectatorFrames.every((frame) => !("action" in frame))).toBe(true);
  });

  it("never delivers an addressed or plain-broadcast game:prompt to a spectator", () => {
    const { session, sockets } = createSession();
    const prompt = {
      promptId: "prompt-id",
      respondingPlayer: 0,
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose privately",
        choices: [{ id: "opaque-choice", label: "Choice" }],
      },
      resumeContext: null,
    } satisfies PendingPromptState;

    session.sendEffectPrompt(prompt);
    session.broadcast({
      type: "game:prompt",
      promptId: prompt.promptId,
      options: prompt.options,
    });

    expect(
      parsedMessages(sockets["player-0"]).map((frame) => frame.type)
    ).toEqual(["game:prompt", "game:prompt"]);
    expect(sockets.spectator.sent).toEqual([]);
  });

  it.each([
    ["spectator first", ["spectator", "player-0", "player-1"]],
    ["spectator between players", ["player-0", "spectator", "player-1"]],
    ["spectator last", ["player-0", "player-1", "spectator"]],
  ] as const)(
    "contains a merged-view invariant failure with the %s",
    (_label, order) => {
      const { session, sockets } = createSession(order);
      vi.spyOn(visibility, "visibleStateForSpectator").mockImplementation(
        () => {
          throw new Error("synthetic spectator invariant failure");
        }
      );

      expect(() => session.broadcastFilteredState(stateMessage)).not.toThrow();

      expect(sockets["player-0"].sent).toHaveLength(1);
      expect(sockets["player-1"].sent).toHaveLength(1);
      expect(sockets.spectator.sent).toEqual([]);
      expect(log).toHaveBeenCalledWith("ws.spectator_state_build_failed", {
        gameId: session.gameState.id,
        error: "synthetic spectator invariant failure",
      });
    }
  );

  it("contains a spectator availability invariant failure without dropping players", () => {
    const { session, sockets } = createSession([
      "spectator",
      "player-0",
      "player-1",
    ]);
    const playerZeroSource = session.gameState.players[0].characters[0]!;
    const playerOneSource = session.gameState.players[1].characters[0]!;
    const sourceData = session.cardDb.get(playerZeroSource.cardId)!;
    session.cardDb.set(playerZeroSource.cardId, {
      ...sourceData,
      effectSchema: {
        effects: [
          {
            id: "duplicate-instance-effect",
            category: "permanent",
            actions: [],
          },
        ],
      },
    });
    session.gameState = {
      ...session.gameState,
      players: [
        session.gameState.players[0],
        {
          ...session.gameState.players[1],
          characters: session.gameState.players[1].characters.map((card) =>
            card === playerOneSource
              ? { ...card, instanceId: playerZeroSource.instanceId }
              : card
          ),
        },
      ],
    };

    expect(() => session.broadcastFilteredState(stateMessage)).not.toThrow();

    expect(sockets["player-0"].sent).toHaveLength(1);
    expect(sockets["player-1"].sent).toHaveLength(1);
    expect(sockets.spectator.sent).toEqual([]);
    expect(log).toHaveBeenCalledWith("ws.spectator_state_build_failed", {
      gameId: session.gameState.id,
      error: expect.stringContaining("Effect availability invariant violated"),
    });
  });

  it("measures one full-board spectator serialization and cap fan-out bytes", () => {
    const { session, sockets } = createSession();
    session.gameState = fullBoardState(session.gameState);
    const spectators = [sockets.spectator];
    for (let index = 1; index < MAX_SPECTATOR_SOCKETS; index += 1) {
      const spectator = new MockWebSocket();
      spectators.push(spectator);
      session.transport.acceptSpectator(
        `cost-spectator-${index}`,
        spectator as unknown as WebSocket
      );
    }

    session.broadcastFilteredState(stateMessage);

    const encoder = new TextEncoder();
    const frameBytes = encoder.encode(spectators[0]!.sent[0]!).byteLength;
    const capBytes = spectators.reduce(
      (total, socket) => total + encoder.encode(socket.sent[0]!).byteLength,
      0
    );
    expect(frameBytes).toBeGreaterThan(0);
    expect(capBytes).toBe(frameBytes * MAX_SPECTATOR_SOCKETS);
  });
});
