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

    // OPT-686: reverting lands on the stripped seat — the invite affordance,
    // and the expiry note beneath it. The panel chrome the countdown lived in
    // does not come back with it.
    expect(renderedText()).not.toContain("Open seat");
    expect(renderedText()).not.toContain("Waiting for a challenger");
    expect(renderedText()).toContain("Invite to nami expired");
    expect(
      renderer?.root.findByProps({ "data-trigger-variant": "open-seat" })
    ).toBeDefined();

    expect(
      renderer!.root.findByProps({ "aria-label": "Guest seat — open" })
    ).toBeDefined();
    // The affordance leads and the expiry note follows it, so the note reads as
    // a footnote to the invite rather than a caption above it. The whole render
    // is this one panel, so tree order is the seat's order.
    expect(renderedText().indexOf("Invite a friend")).toBeLessThan(
      renderedText().indexOf("Invite to nami expired")
    );

    act(() => renderer?.unmount());
    renderer = null;
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("keeps the open seat as bare negative space that still holds the slot", () => {
    act(() => {
      renderer = create(
        <InvitePanel
          lobbyId="lobby-1"
          joinCode="ABCD"
          copied={false}
          onCopy={() => undefined}
          showInviteFriend
          pendingInvite={null}
          cancelingInvite={false}
          onInviteSent={() => undefined}
          onCancelInvite={() => undefined}
        />
      );
    });

    const openSeat = renderer!.root.findByProps({
      "aria-label": "Guest seat — open",
    });
    const className: string = openSeat.props.className;
    // Geometry only: the matched seat width (OPT-666), the sub-`lg` no-shrink
    // contract, and centering against the stretched row.
    expect(className).toContain("lg:w-72");
    expect(className).toContain("shrink-0");
    expect(className).toContain("justify-center");
    // Chrome: none of it.
    expect(className).not.toContain("border");
    expect(className).not.toContain("dashed");
    expect(className).not.toContain("bg-surface-1");
    expect(className).not.toContain("rounded");

    expect(renderer!.root.findAllByType("header")).toHaveLength(0);
    expect(renderer!.root.findAllByType("h2")).toHaveLength(0);
    expect(renderedText()).toContain("Invite a friend");
  });

  it("still renders the slot for a viewer who cannot invite", () => {
    act(() => {
      renderer = create(
        <InvitePanel
          lobbyId="lobby-1"
          joinCode="ABCD"
          copied={false}
          onCopy={() => undefined}
          showInviteFriend={false}
          pendingInvite={null}
          cancelingInvite={false}
          onInviteSent={() => undefined}
          onCancelInvite={() => undefined}
        />
      );
    });

    // Nothing to offer a non-host, but the reserved seat width has to survive:
    // the seats row centers itself, so losing the slot would slide the host
    // column off the axis the footer's centered action is aligned to.
    const openSeat = renderer!.root.findByProps({
      "aria-label": "Guest seat — open",
    });
    expect(openSeat.props.className).toContain("lg:w-72");
    expect(renderedText()).not.toContain("Invite a friend");
  });
});
