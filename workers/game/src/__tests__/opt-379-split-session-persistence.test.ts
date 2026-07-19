import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type {
  Env,
  GameState,
  LobbyMode,
  PregameMode,
} from "../types.js";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_FORMAT_VERSION,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SESSION_VALUE_HARD_LIMIT_BYTES,
  SessionPersistenceLimitError,
  SessionRepository,
  parseStoredSession,
  type SessionStorage,
} from "../session/persistence.js";
import { setupGame } from "./factories.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  readonly writes: string[][] = [];

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown
  ): Promise<void> {
    const entries =
      typeof keyOrEntries === "string"
        ? { [keyOrEntries]: value }
        : keyOrEntries;
    for (const [key, entry] of Object.entries(entries)) {
      this.data.set(key, structuredClone(entry));
    }
    this.writes.push(Object.keys(entries));
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

function repository(storage: SessionStorage): SessionRepository {
  return new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  });
}

function checkpoint(state: GameState, turnNumber: number): GameState {
  return {
    ...state,
    turn: { ...state.turn, number: turnNumber },
  };
}

type TestGameSession = {
  gameState: GameState | null;
  cardDb: Map<string, unknown> | null;
  gameMode: LobbyMode;
  pregameMode: PregameMode;
  testPriorityRolls: number[] | null;
  undoHistory: GameState[];
  loadFromStorage(): Promise<boolean>;
  persist(): Promise<void>;
};

function gameSession(storage: SessionStorage): TestGameSession {
  return new GameSession(
    { storage } as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env
  ) as unknown as TestGameSession;
}

describe("OPT-379 split session persistence", () => {
  it("persists and restores state, cardDb, pregame mode, and undo history under separate keys", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    const { state, cardDb } = setupGame();
    const saved = await repo.save({
      state,
      cardDb,
      mode: "PVP",
      pregameMode: "RANDOM_FIXED",
      testPriorityRolls: null,
      undoHistory: [checkpoint(state, 99)],
    });

    expect(storage.data.get(SESSION_STORAGE_KEY)).toMatchObject({
      formatVersion: SESSION_STORAGE_FORMAT_VERSION,
      state: saved.state,
      pregameMode: "RANDOM_FIXED",
    });
    expect(storage.data.get(SESSION_STORAGE_KEY)).not.toHaveProperty("cardDb");
    expect(storage.data.get(SESSION_STORAGE_KEY)).not.toHaveProperty(
      "undoHistory"
    );
    expect(storage.data.get(SESSION_CARD_DB_STORAGE_KEY)).toEqual(
      Object.fromEntries(cardDb)
    );
    expect(storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY)).toEqual(
      saved.undoHistory
    );
    await expect(repository(storage).load()).resolves.toEqual(saved);

    const cardDbAfterInit = structuredClone(
      storage.data.get(SESSION_CARD_DB_STORAGE_KEY)
    );
    await repo.save({
      ...saved,
      state: checkpoint(saved.state, 100),
      undoHistory: [saved.state],
    });

    expect(storage.data.get(SESSION_CARD_DB_STORAGE_KEY)).toEqual(
      cardDbAfterInit
    );
    expect(storage.writes).toEqual([
      [
        SESSION_CARD_DB_STORAGE_KEY,
        SESSION_STORAGE_KEY,
        SESSION_UNDO_HISTORY_STORAGE_KEY,
      ],
      [SESSION_STORAGE_KEY, SESSION_UNDO_HISTORY_STORAGE_KEY],
    ]);
  });

  it("keeps new writer output readable by the format 2 rollback parser", async () => {
    const storage = new MemoryStorage();
    const { state, cardDb } = setupGame();
    const saved = await repository(storage).save({
      state,
      cardDb,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [checkpoint(state, 99)],
    });
    const rawSession = storage.data.get(SESSION_STORAGE_KEY);

    expect(rawSession).toMatchObject({ formatVersion: 2 });
    expect(rawSession).not.toHaveProperty("undoHistory");

    // origin/main calls parseStoredSession with only the session value and the
    // split cardDb. Omitting the new third argument models that rollback path.
    const rollbackRestored = parseStoredSession(
      rawSession,
      storage.data.get(SESSION_CARD_DB_STORAGE_KEY)
    );

    expect(rollbackRestored).toMatchObject({
      formatVersion: 2,
      state: saved.state,
      cardDb: Object.fromEntries(cardDb),
      undoHistory: [],
    });
    expect(storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY)).toEqual(
      saved.undoHistory
    );
  });

  it("restores and migrates the legacy combined session blob", async () => {
    const storage = new MemoryStorage();
    const { state, cardDb } = setupGame();
    const legacyUndo = checkpoint(state, 99);
    storage.data.set(SESSION_STORAGE_KEY, {
      state,
      cardDb: Object.fromEntries(cardDb),
      mode: "SOLITAIRE",
      pregameMode: "HOST_FIRST",
      testPriorityRolls: [6, 1],
      undoHistory: [legacyUndo],
    });

    const session = gameSession(storage);
    await expect(session.loadFromStorage()).resolves.toBe(true);

    expect(session.gameState).toEqual(state);
    expect(session.cardDb).toEqual(cardDb);
    expect(session.gameMode).toBe("SOLITAIRE");
    expect(session.pregameMode).toBe("HOST_FIRST");
    expect(session.testPriorityRolls).toEqual([6, 1]);
    expect(session.undoHistory).toEqual([legacyUndo]);

    await session.persist();
    expect(storage.data.get(SESSION_STORAGE_KEY)).toMatchObject({
      formatVersion: SESSION_STORAGE_FORMAT_VERSION,
      state,
    });
    expect(storage.data.get(SESSION_STORAGE_KEY)).not.toHaveProperty("cardDb");
    expect(storage.data.get(SESSION_STORAGE_KEY)).not.toHaveProperty(
      "undoHistory"
    );
    expect(storage.data.get(SESSION_CARD_DB_STORAGE_KEY)).toEqual(
      Object.fromEntries(cardDb)
    );
    expect(storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY)).toEqual(
      session.undoHistory
    );
    await expect(repository(storage).load()).resolves.toEqual({
      state,
      cardDb,
      mode: "SOLITAIRE",
      pregameMode: "HOST_FIRST",
      testPriorityRolls: [6, 1],
      undoHistory: [legacyUndo],
    });
  });

  it("migrates format 2 sessions with an embedded undo and split cardDb", async () => {
    const storage = new MemoryStorage();
    const { state, cardDb } = setupGame();
    const undoHistory = [checkpoint(state, 99)];
    storage.data.set(SESSION_CARD_DB_STORAGE_KEY, Object.fromEntries(cardDb));
    storage.data.set(SESSION_STORAGE_KEY, {
      formatVersion: 2,
      state,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory,
    });

    const repo = repository(storage);
    const restored = await repo.load();
    expect(restored?.undoHistory).toEqual(undoHistory);

    await repo.save(restored!);
    expect(storage.data.get(SESSION_STORAGE_KEY)).not.toHaveProperty(
      "undoHistory"
    );
    expect(storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY)).toEqual(
      undoHistory
    );
    expect(storage.writes).toEqual([
      [SESSION_STORAGE_KEY, SESSION_UNDO_HISTORY_STORAGE_KEY],
    ]);
  });

  it("rejects an oversized undo value before writing any session keys", async () => {
    const storage = new MemoryStorage();
    const { state, cardDb } = setupGame();

    await expect(
      repository(storage).save({
        state,
        cardDb,
        mode: "PVP",
        pregameMode: "PRIORITY_ROLL",
        testPriorityRolls: null,
        undoHistory: [
          {
            ...state,
            winReason: "x".repeat(SESSION_VALUE_HARD_LIMIT_BYTES),
          },
        ],
      })
    ).rejects.toMatchObject({
      name: SessionPersistenceLimitError.name,
      valueName: "undoHistory",
    });
    expect(storage.data.size).toBe(0);
  });
});
