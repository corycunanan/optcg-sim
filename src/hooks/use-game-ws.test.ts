import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@shared/game-types";

const mocks = vi.hoisted(() => ({
  onMessage: null as ((message: ServerMessage) => void) | null,
  send: vi.fn(),
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
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
});
