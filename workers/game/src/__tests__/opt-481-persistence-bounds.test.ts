import { describe, expect, it, vi } from "vitest";
import type { GameEvent } from "../../../../shared/game-types.js";
import { GameSession } from "../GameSession.js";
import type {
  CardData,
  Env,
  GameAction,
  GameState,
  ServerMessage,
} from "../types.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  EVENT_LOG_ANCHOR_LIMIT,
  RECENT_EVENT_LOG_LIMIT,
  UNDO_HISTORY_LIMIT,
} from "../session/history.js";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_VALUE_HARD_LIMIT_BYTES,
  SESSION_VALUE_SOFT_LIMIT_BYTES,
  SessionPersistenceLimitError,
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { SessionTransport } from "../session/transport.js";
import { setupGame } from "./factories.js";

class AtomicMemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  readonly writes: string[][] = [];
  failNextPut = false;

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown,
  ): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("simulated storage failure");
    }
    if (typeof keyOrEntries === "string") {
      this.data.set(keyOrEntries, structuredClone(value));
      this.writes.push([keyOrEntries]);
      return;
    }
    const committed = new Map(this.data);
    for (const [key, entry] of Object.entries(keyOrEntries)) {
      committed.set(key, structuredClone(entry));
    }
    this.data.clear();
    for (const [key, entry] of committed) this.data.set(key, entry);
    this.writes.push(Object.keys(keyOrEntries));
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

class TestSocket {
  readonly sent: string[] = [];
  private attachment: unknown;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {}

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class TestSocketState {
  private socket: TestSocket | null = null;

  acceptWebSocket(ws: WebSocket): void {
    this.socket = ws as unknown as TestSocket;
  }

  getWebSockets(): WebSocket[] {
    return this.socket ? [this.socket as unknown as WebSocket] : [];
  }

  getTags(): string[] {
    return this.socket ? ["player-0"] : [];
  }
}

class TestDurableObjectState extends TestSocketState {
  constructor(readonly storage: AtomicMemoryStorage) {
    super();
  }
}

type TestGameSession = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  undoHistory: GameState[];
  handleAction(
    ws: WebSocket,
    playerIndex: 0 | 1,
    action: GameAction,
  ): Promise<void>;
};

function turnEvents(count: number, startTimestamp = 1): GameEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "TURN_STARTED",
    playerIndex: (index % 2) as 0 | 1,
    payload: {},
    timestamp: startTimestamp + index,
  }));
}

function repository(storage: SessionStorage): SessionRepository {
  return new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  });
}

describe("OPT-481 bounded session persistence", () => {
  it("compacts detailed events, preserves causal anchors, and restores the checkpoint", async () => {
    const storage = new AtomicMemoryStorage();
    const repo = repository(storage);
    const { state, cardDb } = setupGame();
    const anchor: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: {
        cardId: state.players[0].leader.cardId,
        cardInstanceId: state.players[0].leader.instanceId,
        zone: "LEADER",
        source: "FROM_HAND",
      },
      timestamp: 0,
    };
    const longState = {
      ...state,
      eventLog: [anchor, ...turnEvents(400)],
    };

    const saved = await repo.save({
      state: longState,
      cardDb,
      mode: "PVP",
      testPriorityRolls: null,
      undoHistory: [longState, longState, longState],
    });

    expect(saved.state.eventLog).toHaveLength(RECENT_EVENT_LOG_LIMIT + 1);
    expect(saved.state.eventLog[0]).toEqual(anchor);
    expect(saved.state.eventLog.length).toBeLessThanOrEqual(
      RECENT_EVENT_LOG_LIMIT + EVENT_LOG_ANCHOR_LIMIT,
    );
    expect(saved.undoHistory).toHaveLength(UNDO_HISTORY_LIMIT);
    expect(storage.data.get(SESSION_CARD_DB_STORAGE_KEY)).toBeDefined();
    const rawSession = storage.data.get(SESSION_STORAGE_KEY);
    expect(rawSession).not.toHaveProperty("cardDb");

    const summary = repo.getHistorySummary();
    expect(summary.compactedEventCount).toBe(144);
    expect(summary.byType.TURN_STARTED).toBe(144);
    expect(repo.getLastMetrics()).toMatchObject({
      recentEventCount: RECENT_EVENT_LOG_LIMIT + 1,
      compactedEventCount: 144,
      undoSnapshotCount: UNDO_HISTORY_LIMIT,
      softLimitExceeded: false,
    });

    const restored = await repository(storage).load();
    expect(restored).toEqual(saved);

    const appended = {
      ...saved.state,
      eventLog: [
        ...saved.state.eventLog,
        ...turnEvents(10, 1_000),
      ],
    };
    const resaved = await repo.save({ ...saved, state: appended });
    expect(resaved.state.eventLog).toHaveLength(RECENT_EVENT_LOG_LIMIT + 1);
    expect(repo.getHistorySummary().compactedEventCount).toBe(154);
    expect(storage.writes).toEqual([
      [SESSION_CARD_DB_STORAGE_KEY, SESSION_STORAGE_KEY],
      [SESSION_STORAGE_KEY],
    ]);
  });

  it("compacts legacy history and undo snapshots before returning a restore", async () => {
    const storage = new AtomicMemoryStorage();
    const { state, cardDb } = setupGame();
    const legacyState = {
      ...state,
      eventLog: turnEvents(1_000),
    };
    storage.data.set(SESSION_STORAGE_KEY, {
      state: legacyState,
      cardDb: Object.fromEntries(cardDb),
      mode: "PVP",
      undoHistory: [legacyState, legacyState],
    });

    const repo = repository(storage);
    const restored = await repo.load();

    expect(restored?.state.eventLog).toHaveLength(RECENT_EVENT_LOG_LIMIT);
    expect(restored?.undoHistory).toHaveLength(UNDO_HISTORY_LIMIT);
    expect(restored?.undoHistory[0].eventLog).toHaveLength(
      RECENT_EVENT_LOG_LIMIT,
    );
    expect(repo.getHistorySummary().compactedEventCount).toBe(744);
  });

  it.each([
    ["a missing player hand zone", (state: GameState) => {
      Reflect.deleteProperty(state.players[0], "hand");
    }, "players.0.hand"],
    ["an invalid turn phase", (state: GameState) => {
      Reflect.set(state.turn, "phase", "BATTLE");
    }, "turn.phase"],
  ] as const)("rejects persisted state with %s during repository load", async (
    _label,
    mutate,
    path,
  ) => {
    const storage = new AtomicMemoryStorage();
    const { state, cardDb } = setupGame();
    const malformedState = structuredClone(state);
    mutate(malformedState);
    storage.data.set(SESSION_STORAGE_KEY, {
      formatVersion: 2,
      state: malformedState,
      cardDb: Object.fromEntries(cardDb),
      mode: "PVP",
      testPriorityRolls: null,
      undoHistory: [],
    });

    await expect(repository(storage).load()).rejects.toThrow(path);
  });

  it("broadcasts only the bounded detailed history", async () => {
    const storage = new AtomicMemoryStorage();
    const repo = repository(storage);
    const { state, cardDb } = setupGame();
    const saved = await repo.save({
      state: { ...state, eventLog: turnEvents(1_000) },
      cardDb,
      mode: "PVP",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const sockets = new TestSocketState();
    const transport = new SessionTransport(sockets, () => undefined);
    const socket = new TestSocket();
    transport.accept(0, socket as unknown as WebSocket);

    transport.broadcastFilteredState(saved.state, cardDb, (visible) => ({
      type: "game:state",
      state: visible,
    }));

    const message = JSON.parse(socket.sent[0]) as Extract<
      ServerMessage,
      { type: "game:state" }
    >;
    expect(message.state.eventLog).toHaveLength(RECENT_EVENT_LOG_LIMIT);
  });

  it("makes the undo window explicitly one checkpoint", () => {
    const coordinator = new SessionCoordinator();
    const { state, cardDb } = setupGame();
    const snapshots = [1, 2, 3].map(
      (number): GameState => ({
        ...state,
        turn: { ...state.turn, number },
      }),
    );

    const result = coordinator.executeAction(
      state,
      snapshots,
      state.turn.activePlayerIndex,
      { type: "UNDO" },
      cardDb,
    );

    expect(result.kind).toBe("undo");
    expect(result.state.turn.number).toBe(3);
    expect(result.undoHistory).toEqual([]);
  });

  it("leaves storage and summary unchanged when compaction persistence fails", async () => {
    const storage = new AtomicMemoryStorage();
    const repo = repository(storage);
    const { state, cardDb } = setupGame();
    const baseline = await repo.save({
      state,
      cardDb,
      mode: "PVP",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const storedBefore = structuredClone(storage.data.get(SESSION_STORAGE_KEY));
    storage.failNextPut = true;

    await expect(
      repo.save({
        ...baseline,
        state: { ...state, eventLog: turnEvents(1_000) },
      }),
    ).rejects.toThrow("simulated storage failure");

    expect(storage.data.get(SESSION_STORAGE_KEY)).toEqual(storedBefore);
    expect(repo.getHistorySummary().compactedEventCount).toBe(0);
    await expect(repository(storage).load()).resolves.toEqual(baseline);
  });

  it("leaves repository state unchanged when restore validation fails", async () => {
    const storage = new AtomicMemoryStorage();
    const repo = repository(storage);
    const { state, cardDb } = setupGame();
    await repo.save({
      state,
      cardDb,
      mode: "PVP",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const metricsBefore = repo.getLastMetrics();
    storage.data.set(SESSION_STORAGE_KEY, {
      ...storage.data.get(SESSION_STORAGE_KEY) as object,
      historySummary: {
        version: 1,
        compactedEventCount: 1,
        firstCompactedTimestamp: null,
        lastCompactedTimestamp: null,
        byType: { TURN_STARTED: 1 },
        byPlayer: [1, 0],
      },
    });

    await expect(repo.load()).rejects.toThrow(
      "Stored session historySummary is invalid",
    );
    expect(repo.getHistorySummary().compactedEventCount).toBe(0);
    expect(repo.getLastMetrics()).toEqual(metricsBefore);
  });

  it("rolls back an in-memory action when durable persistence fails", async () => {
    const storage = new AtomicMemoryStorage();
    const durableState = new TestDurableObjectState(storage);
    const { state, cardDb } = setupGame();
    const session = new GameSession(
      durableState as unknown as DurableObjectState,
      {
        GAME_WORKER_SECRET: "secret",
        NEXTJS_URL: "https://app.example.test",
      } as Env,
    ) as unknown as TestGameSession;
    session.gameState = state;
    session.cardDb = cardDb;
    session.undoHistory = [];
    const socket = new TestSocket();
    storage.failNextPut = true;

    await session.handleAction(
      socket as unknown as WebSocket,
      state.turn.activePlayerIndex,
      { type: "ADVANCE_PHASE" },
    );

    expect(session.gameState).toEqual(state);
    expect(session.undoHistory).toEqual([]);
    expect(socket.sent.map((payload) => JSON.parse(payload))).toContainEqual({
      type: "action:rejected",
      action: { type: "ADVANCE_PHASE" },
      reason: "The action could not be saved; game state was not changed",
    });
  });

  it("reports the soft budget and rejects values before the platform hard limit", async () => {
    const { state, cardDb } = setupGame();
    const softStorage = new AtomicMemoryStorage();
    const softRepo = repository(softStorage);
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      await softRepo.save({
        state: {
          ...state,
          winReason: "x".repeat(SESSION_VALUE_SOFT_LIMIT_BYTES),
        },
        cardDb,
        mode: "PVP",
        testPriorityRolls: null,
        undoHistory: [],
      });
      expect(softRepo.getLastMetrics()?.softLimitExceeded).toBe(true);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }

    const hardStorage = new AtomicMemoryStorage();
    await expect(
      repository(hardStorage).save({
        state: {
          ...state,
          winReason: "x".repeat(SESSION_VALUE_HARD_LIMIT_BYTES),
        },
        cardDb,
        mode: "PVP",
        testPriorityRolls: null,
        undoHistory: [],
      }),
    ).rejects.toBeInstanceOf(SessionPersistenceLimitError);
    expect(hardStorage.data.size).toBe(0);
  });
});
