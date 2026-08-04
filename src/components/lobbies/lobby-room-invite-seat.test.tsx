import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: ({ user }: { user: { username: string | null } }) => (
    <span>{user.username}</span>
  ),
}));

vi.mock("./invite-friend-popover", () => ({
  InviteFriendPopover: ({ triggerVariant }: { triggerVariant?: string }) => (
    <button type="button" data-trigger-variant={triggerVariant}>
      Invite a friend
    </button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const { InvitePanel } = await import("./lobby-room-shell");

let renderer: ReactTestRenderer | null = null;

function renderedText() {
  return JSON.stringify(renderer?.toJSON());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-24T20:00:00.000Z"));
});

afterEach(() => {
  if (renderer) {
    act(() => renderer?.unmount());
    renderer = null;
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("InvitePanel countdown lifecycle", () => {
  it("self-reverts at zero, shows the expiry note, and cleans its interval", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    act(() => {
      renderer = create(
        <InvitePanel
          lobbyId="lobby-1"
          joinCode="ABCD"
          copied={false}
          onCopy={() => undefined}
          showInviteFriend
          pendingInvite={{
            id: "invite-1",
            expiresAt: "2026-07-24T20:00:02.000Z",
            user: {
              id: "friend-1",
              username: "nami",
              name: "Nami",
              image: null,
            },
          }}
          cancelingInvite={false}
          onInviteSent={() => undefined}
          onCancelInvite={() => undefined}
        />
      );
    });

    expect(renderedText()).toContain("Invite sent to ");
    expect(renderedText()).toContain("nami");
    expect(renderedText()).toContain("Expires in ");
    expect(renderedText()).toContain("0:02");

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(renderedText()).toContain("Open seat");
    expect(renderedText()).toContain("Waiting for a challenger");
    expect(renderedText()).toContain("Invite to nami expired");
    expect(
      renderer?.root.findByProps({ "data-trigger-variant": "open-seat" })
    ).toBeDefined();

    act(() => renderer?.unmount());
    renderer = null;
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
