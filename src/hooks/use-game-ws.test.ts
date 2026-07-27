import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@shared/game-types";

const mocks = vi.hoisted(() => ({
  onMessage: null as ((message: unknown) => void) | null,
  send: vi.fn(),
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  toastInfo: vi.fn(),
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => effect(),
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const setter = vi.fn();
      mocks.stateSetters.push(setter);
      return [
        typeof initial === "function" ? (initial as () => unknown)() : initial,
        setter,
      ];
    },
  };
});

vi.mock("@/hooks/use-authed-websocket", () => ({
  useAuthedWebSocket: (options: { onMessage: (message: unknown) => void }) => {
    mocks.onMessage = options.onMessage;
    return {
      connectionStatus: "connected",
      lastError: null,
      send: mocks.send,
      retry: vi.fn(),
      close: vi.fn(),
    };
  },
}));

vi.mock("sonner", () => ({ toast: { info: mocks.toastInfo } }));

import { useGameWs } from "@/hooks/use-game-ws";

describe("useGameWs prompt identity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.onMessage = null;
    mocks.send.mockReset();
    mocks.toastInfo.mockReset();
    mocks.stateSetters.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps join, departure, and ejection outcomes distinct", () => {
    useGameWs("game-1", "https://worker.test", async () => "token");

    mocks.onMessage?.({
      type: "game:spectator_joined",
      spectator: { id: "watcher-1", displayName: "Vivi" },
    });
    mocks.onMessage?.({
      type: "game:spectator_left",
      spectator: { id: "legacy", displayName: "Spectator" },
      cause: "DEPARTED",
    });
    mocks.onMessage?.({
      type: "game:spectator_left",
      spectator: { id: "watcher-2", displayName: "Usopp" },
      cause: "EJECTED",
    });

    vi.advanceTimersByTime(500);

    expect(mocks.toastInfo.mock.calls).toEqual([
      ["Vivi started spectating"],
      ["Spectator stopped spectating"],
      ["Usopp was removed from spectating"],
    ]);
  });

  it("coalesces a burst of spectator joins into one announcement", () => {
    useGameWs("game-1", "https://worker.test", async () => "token");

    for (const [id, displayName] of [
      ["watcher-1", "Vivi"],
      ["watcher-2", "Usopp"],
      ["watcher-3", "Chopper"],
    ]) {
      mocks.onMessage?.({
        type: "game:spectator_joined",
        spectator: { id, displayName },
      });
    }

    expect(mocks.toastInfo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(mocks.toastInfo).toHaveBeenCalledOnce();
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "3 spectators started spectating"
    );
  });

  it("bounds repeated departure and reconnect churn for one spectator", () => {
    useGameWs("game-1", "https://worker.test", async () => "token");
    const spectator = { id: "watcher-1", displayName: "Vivi" };

    mocks.onMessage?.({ type: "game:spectator_joined", spectator });
    vi.advanceTimersByTime(500);
    mocks.onMessage?.({
      type: "game:spectator_left",
      spectator,
      cause: "DEPARTED",
    });
    vi.advanceTimersByTime(500);
    mocks.onMessage?.({ type: "game:spectator_joined", spectator });

    for (let flap = 0; flap < 5; flap += 1) {
      mocks.onMessage?.({
        type: "game:spectator_left",
        spectator,
        cause: "DEPARTED",
      });
      mocks.onMessage?.({ type: "game:spectator_joined", spectator });
      vi.advanceTimersByTime(500);
    }

    expect(mocks.toastInfo.mock.calls).toEqual([
      ["Vivi started spectating"],
      ["Vivi stopped spectating"],
    ]);
  });

  it("does not toast an unvalidated spectator frame", () => {
    useGameWs("game-1", "https://worker.test", async () => "token");

    mocks.onMessage?.({
      type: "game:spectator_joined",
      spectator: { id: "watcher-1" },
    });

    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it("stores a typed rejection and does not clear it when the next action is sent", () => {
    const game = useGameWs(
      "game-1",
      "https://worker.test",
      async () => "token"
    );
    const rejectionSetter = mocks.stateSetters[5];

    mocks.onMessage?.({
      type: "action:rejected",
      action: { type: "PLAY_CARD", cardInstanceId: "hand-1" },
      reason: "Need 1 more DON!!",
    });

    expect(rejectionSetter).toHaveBeenLastCalledWith({
      action: { type: "PLAY_CARD", cardInstanceId: "hand-1" },
      reason: "Need 1 more DON!!",
      sequence: 1,
    });

    rejectionSetter.mockClear();
    game.sendAction({ type: "PLAY_CARD", cardInstanceId: "hand-1" });
    expect(rejectionSetter).not.toHaveBeenCalled();
  });

  it("echoes the active server prompt ID on prompt responses", () => {
    const game = useGameWs(
      "game-1",
      "https://worker.test",
      async () => "token"
    );
    const activePromptIdSetter = mocks.stateSetters[7];
    mocks.onMessage?.({
      type: "game:prompt",
      promptId: "prompt-2",
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose",
        choices: [{ id: "yes", label: "Yes" }],
      },
    });

    expect(activePromptIdSetter).toHaveBeenCalledWith("prompt-2");

    game.sendAction({ type: "PLAYER_CHOICE", choiceId: "yes" });

    expect(mocks.send).toHaveBeenCalledWith({
      type: "game:action",
      action: { type: "PLAYER_CHOICE", choiceId: "yes", promptId: "prompt-2" },
    });
  });

  it("does not attach prompt IDs to ordinary game actions", () => {
    const game = useGameWs(
      "game-1",
      "https://worker.test",
      async () => "token"
    );
    mocks.onMessage?.({
      type: "game:prompt",
      promptId: "prompt-2",
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose",
        choices: [{ id: "yes", label: "Yes" }],
      },
    });

    game.sendAction({ type: "ADVANCE_PHASE" });

    expect(mocks.send).toHaveBeenCalledWith({
      type: "game:action",
      action: { type: "ADVANCE_PHASE" },
    });
  });

  it("publishes a monotonic sequence for accepted game updates", () => {
    useGameWs("game-1", "https://worker.test", async () => "token");
    const acceptedUpdateSetter = mocks.stateSetters[6];
    const state = {
      status: "IN_PROGRESS",
      pendingPrompt: null,
      players: [],
    } as unknown as GameState;

    mocks.onMessage?.({
      type: "game:update",
      action: { type: "ADVANCE_PHASE" },
      state,
    });
    mocks.onMessage?.({
      type: "game:update",
      action: { type: "CONCEDE" },
      state,
    });

    expect(acceptedUpdateSetter).toHaveBeenNthCalledWith(1, {
      action: { type: "ADVANCE_PHASE" },
      sequence: 1,
    });
    expect(acceptedUpdateSetter).toHaveBeenNthCalledWith(2, {
      action: { type: "CONCEDE" },
      sequence: 2,
    });
  });

  it("preserves the unchanged player reference across a one-player update", () => {
    useGameWs("game-1", "https://worker.test", async () => "token");
    const gameStateSetter = mocks.stateSetters[0];
    const previousState = {
      status: "IN_PROGRESS",
      pendingPrompt: null,
      players: [
        { playerId: "player-0", hand: [{ instanceId: "card-0" }] },
        { playerId: "player-1", hand: [{ instanceId: "card-1" }] },
      ],
    } as unknown as GameState;
    const nextState = {
      ...previousState,
      players: [
        { playerId: "player-0", hand: [] },
        { playerId: "player-1", hand: [{ instanceId: "card-1" }] },
      ],
    } as unknown as GameState;

    mocks.onMessage?.({ type: "game:update", state: nextState });

    const installState = gameStateSetter.mock.calls[0]?.[0] as (
      previous: GameState
    ) => GameState;
    const installedState = installState(previousState);
    expect(installedState.players[0]).toBe(nextState.players[0]);
    expect(installedState.players[1]).toBe(previousState.players[1]);
    expect(installedState.players[1]).not.toBe(nextState.players[1]);
  });
});
