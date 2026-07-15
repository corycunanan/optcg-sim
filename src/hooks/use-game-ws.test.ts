import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, ServerMessage } from "@shared/game-types";

const mocks = vi.hoisted(() => ({
  onMessage: null as ((message: ServerMessage) => void) | null,
  send: vi.fn(),
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
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
  useAuthedWebSocket: (options: {
    onMessage: (message: ServerMessage) => void;
  }) => {
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

import { useGameWs } from "@/hooks/use-game-ws";

describe("useGameWs prompt identity", () => {
  beforeEach(() => {
    mocks.onMessage = null;
    mocks.send.mockReset();
    mocks.stateSetters.length = 0;
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
    mocks.onMessage?.({
      type: "game:prompt",
      promptId: "prompt-2",
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose",
        choices: [{ id: "yes", label: "Yes" }],
      },
    });

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
});
