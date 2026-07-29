// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeServerEvent } from "@/types/realtime";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  handlers: new Map<string, (event: never) => void>(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiGet: (...args: unknown[]) => mocks.apiGet(...args),
    apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  };
});

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: (type: string, handler: (event: never) => void) => {
      mocks.handlers.set(type, handler);
      return () => mocks.handlers.delete(type);
    },
  }),
}));

vi.mock("@/components/deck-builder/deck-navigation-guard", () => ({
  useDeckNavigationGuard: () => ({
    requestLeave: () => false,
  }),
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: () => <span aria-hidden="true">L</span>,
}));

vi.mock("./party-switch-confirmation", () => ({
  PartySwitchConfirmation: () => null,
  partySwitchDetailsFromError: () => null,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));

import { LobbyInviteToasts } from "./lobby-invite-toast";

beforeEach(() => {
  mocks.apiGet.mockReset().mockResolvedValue({ data: [] });
  mocks.apiPost.mockReset().mockResolvedValue({});
  mocks.handlers.clear();
  mocks.push.mockReset();
});

afterEach(() => cleanup());

describe("LobbyInviteToasts", () => {
  it("renders a realtime lobby invite and lets the recipient decline it", async () => {
    const user = userEvent.setup();
    render(<LobbyInviteToasts />);
    await waitFor(() =>
      expect(mocks.handlers.has("lobby:invite_received")).toBe(true)
    );

    const event: Extract<
      RealtimeServerEvent,
      { type: "lobby:invite_received" }
    > = {
      type: "lobby:invite_received",
      invite: {
        id: "invite-1",
        lobbyId: "lobby-1",
        fromUserId: "luffy",
        toUserId: "current-user",
        expiresAt: "2099-07-28T00:05:00.000Z",
        createdAt: "2099-07-28T00:00:00.000Z",
        fromUser: {
          id: "luffy",
          username: "luffy",
          name: "Luffy",
          image: null,
        },
        lobby: {
          format: "Standard",
          mode: "PVP",
          hostUsername: "luffy",
          joinCode: "SUNNY1",
        },
      },
    };
    act(() => mocks.handlers.get("lobby:invite_received")?.(event as never));

    expect(
      await screen.findByRole("alertdialog", {
        name: "luffy invited you to a lobby",
      })
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        "/api/lobby-invites/invite-1/decline"
      )
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "luffy invited you to a lobby",
        })
      ).toBeNull()
    );
  });
});
