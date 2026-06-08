import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setShowReconnecting: vi.fn(),
  cleanup: null as (() => void) | null,
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      mocks.cleanup = typeof cleanup === "function" ? cleanup : null;
    },
    useState: (initial: unknown) => [initial, mocks.setShowReconnecting],
  };
});

import {
  DelayedReconnectingStatus,
  RECONNECTING_STATUS_DELAY_MS,
  UserChannelConnectionStatus,
} from "./user-channel-connection-status";

describe("UserChannelConnectionStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.setShowReconnecting.mockReset();
    mocks.cleanup = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows reconnecting only after a disconnected socket stays down for 3s", () => {
    DelayedReconnectingStatus();

    vi.advanceTimersByTime(RECONNECTING_STATUS_DELAY_MS - 1);
    expect(mocks.setShowReconnecting).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mocks.setShowReconnecting).toHaveBeenCalledWith(true);
  });

  it("clears the pending timer if the status changes before the delay", () => {
    DelayedReconnectingStatus();
    mocks.cleanup?.();

    vi.advanceTimersByTime(RECONNECTING_STATUS_DELAY_MS);

    expect(mocks.setShowReconnecting).not.toHaveBeenCalledWith(true);
  });

  it("does not schedule a banner when the channel is connected", () => {
    UserChannelConnectionStatus({ connectionStatus: "connected" });

    vi.advanceTimersByTime(RECONNECTING_STATUS_DELAY_MS);

    expect(mocks.setShowReconnecting).not.toHaveBeenCalled();
  });
});
