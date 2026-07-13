import type { CardData, GameState, LobbyMode } from "../types.js";
import {
  allocateEngineId,
  ensureExecutionContext,
} from "../engine/execution-context.js";
import { buildGameResultCallbackPayload } from "../util/result.js";
import {
  CONSUMED_TOKEN_JTIS_STORAGE_KEY,
  type TokenJtiStorage,
} from "../util/token-replay.js";

export interface SessionStorage extends TokenJtiStorage {
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface SessionSnapshot {
  state: GameState;
  cardDb: Map<string, CardData>;
  mode: LobbyMode;
  testPriorityRolls: number[] | null;
  undoHistory: GameState[];
}

interface StoredSession {
  state: GameState;
  cardDb: Record<string, CardData>;
  /** Legacy OPT-366 field retained for structured-clone compatibility. */
  mulliganDone?: [boolean, boolean];
  mode?: LobbyMode;
  testPriorityRolls?: number[] | null;
  undoHistory?: GameState[];
}

export interface ResultCallbackConfig {
  nextJsUrl: string;
  workerSecret: string;
}

/** Durable storage and result-callback boundary for a GameSession. */
export class SessionRepository {
  constructor(
    private readonly storage: SessionStorage,
    private readonly resultCallback: ResultCallbackConfig,
    private readonly fetchResult?: typeof fetch
  ) {}

  async initializeTokenLedger(): Promise<void> {
    await this.storage.put(CONSUMED_TOKEN_JTIS_STORAGE_KEY, {});
  }

  async save(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
    const state = ensurePromptId(snapshot.state);
    const stored: StoredSession = {
      state,
      cardDb: Object.fromEntries(snapshot.cardDb),
      mode: snapshot.mode,
      testPriorityRolls: snapshot.testPriorityRolls,
      undoHistory: snapshot.undoHistory,
    };
    await this.storage.put("session", stored);
    return { ...snapshot, state };
  }

  async load(): Promise<SessionSnapshot | null> {
    const stored = await this.storage.get<StoredSession>("session");
    if (!stored) return null;
    return {
      state: ensureExecutionContext(stored.state),
      cardDb: new Map(Object.entries(stored.cardDb)),
      mode: stored.mode ?? "PVP",
      testPriorityRolls: stored.testPriorityRolls ?? null,
      undoHistory: stored.undoHistory ?? [],
    };
  }

  async writeResult(state: GameState): Promise<void> {
    const body = buildGameResultCallbackPayload(state);
    const url = `${this.resultCallback.nextJsUrl}/api/game/result`;
    const response = await (this.fetchResult ?? fetch)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resultCallback.workerSecret}`,
      },
      body: JSON.stringify(body),
    }).catch((error: unknown) => {
      console.error("[GameSession] writeResultToDb fetch failed:", url, error);
      return null;
    });
    if (!response?.ok) {
      const text = (await response?.text().catch(() => "")) ?? "";
      if (response) {
        console.error(
          "[GameSession] writeResultToDb HTTP",
          response.status,
          text.slice(0, 300)
        );
      }
    }
  }

  async syncAlarm(state: GameState): Promise<void> {
    const nextDeadline = state.players.reduce<number | null>(
      (current, player) => {
        if (player.connected || player.rejoinDeadlineAt === null)
          return current;
        if (current === null) return player.rejoinDeadlineAt;
        return Math.min(current, player.rejoinDeadlineAt);
      },
      null
    );

    if (nextDeadline === null) {
      await this.storage.deleteAlarm();
      return;
    }
    await this.storage.setAlarm(nextDeadline);
  }
}

function ensurePromptId(state: GameState): GameState {
  if (!state.pendingPrompt || state.pendingPrompt.promptId) return state;
  const allocated = allocateEngineId(state, "prompt");
  return {
    ...allocated.state,
    pendingPrompt: {
      ...state.pendingPrompt,
      promptId: allocated.id,
    },
  };
}
