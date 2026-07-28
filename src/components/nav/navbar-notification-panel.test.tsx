// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import type { SerializedNotification } from "@/types/realtime";

const mocks = vi.hoisted(() => ({
  notifications: [] as SerializedNotification[],
  unreadCount: 0,
  loadState: "success" as "idle" | "loading" | "success" | "error",
  refresh: vi.fn<() => Promise<void>>(),
  apiPut: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    notificationInbox: {
      notifications: mocks.notifications,
      unreadCount: mocks.unreadCount,
      loadState: mocks.loadState,
      refresh: mocks.refresh,
    },
  }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiPut: mocks.apiPut };
});

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: ({ user }: { user: { username: string | null } }) => (
    <span aria-hidden="true">{user.username?.slice(0, 1) ?? "?"}</span>
  ),
}));

vi.mock("@/components/game/scaled-board", () => ({
  getPortalContainer: () => null,
}));

import { NavbarNotificationPanel } from "./navbar-notification-panel";

function notification(
  id: string,
  createdAt: string,
  options: Partial<SerializedNotification> = {}
): SerializedNotification {
  return {
    id,
    userId: "recipient-1",
    type: "FRIEND_REQUEST",
    status: "READ",
    actorUserId: `actor-${id}`,
    referenceId: `request-${id}`,
    payload: null,
    createdAt,
    updatedAt: createdAt,
    actor: {
      id: `actor-${id}`,
      username: `player-${id}`,
      name: null,
      image: null,
    },
    ...options,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function openPanel() {
  const user = userEvent.setup();
  const bell = screen.getByRole("button", { name: /notifications/i });
  await user.click(bell);
  await screen.findByRole("dialog", { name: "Notifications" });
  return { user, bell };
}

beforeEach(() => {
  mocks.notifications = [];
  mocks.unreadCount = 0;
  mocks.loadState = "success";
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.apiPut.mockReset().mockResolvedValue({ success: true });
  mocks.toastError.mockReset();
});

afterEach(() => cleanup());

describe("NavbarNotificationPanel", () => {
  it("renders newest first and caps the action menu at 20 notifications", async () => {
    mocks.notifications = Array.from({ length: 24 }, (_, index) =>
      notification(
        String(index + 1),
        new Date(Date.UTC(2026, 0, index + 1)).toISOString()
      )
    );
    render(<NavbarNotificationPanel />);

    await openPanel();
    const rows = within(
      screen.getByRole("list", { name: "Recent notifications" })
    ).getAllByRole("listitem");

    expect(rows).toHaveLength(20);
    expect(rows[0]?.textContent).toContain("player-24");
    expect(rows.at(-1)?.textContent).toContain("player-5");
    expect(screen.queryByText("player-4")).toBeNull();
  });

  it("announces the reachable empty state", async () => {
    render(<NavbarNotificationPanel />);

    await openPanel();
    const emptyState = screen.getByRole("status", {
      name: "No notifications yet",
    });

    expect(document.activeElement).toBe(emptyState);
  });

  it("distinguishes unread rows and marks visible items read when opened", async () => {
    const readRequest = deferred<unknown>();
    mocks.notifications = [
      notification("unread", "2026-01-02T00:00:00.000Z", {
        status: "PENDING",
      }),
      notification("read", "2026-01-01T00:00:00.000Z"),
    ];
    mocks.unreadCount = 1;
    mocks.apiPut.mockImplementation((url: string) =>
      url === "/api/notifications/unread"
        ? readRequest.promise
        : Promise.resolve({ success: true })
    );
    render(<NavbarNotificationPanel />);

    expect(screen.getByText("1")).toBeDefined();
    const { bell } = await openPanel();

    expect(
      screen.getByRole("listitem", {
        name: /Unread\. player-unread sent you a friend request/,
      })
    ).toBeDefined();
    expect(
      screen.getByRole("listitem", {
        name: /^player-read sent you a friend request/,
      })
    ).toBeDefined();
    expect(
      screen.queryByRole("listitem", { name: /Unread\. player-read/ })
    ).toBeNull();
    const unreadRow = screen.getByRole("listitem", {
      name: /Unread\. player-unread sent you a friend request/,
    });
    const readRow = screen.getByRole("listitem", {
      name: /^player-read sent you a friend request/,
    });
    expect(
      unreadRow.querySelector('[data-slot="notification-unread-indicator"]')
    ).not.toBeNull();
    expect(
      readRow.querySelector('[data-slot="notification-unread-indicator"]')
    ).toBeNull();
    expect(bell.getAttribute("aria-label")).toBe(
      "Notifications, No unread notifications"
    );
    await waitFor(() =>
      expect(mocks.apiPut).toHaveBeenCalledWith("/api/notifications/unread", {
        action: "read",
      })
    );
    expect(mocks.apiPut).not.toHaveBeenCalledWith(
      "/api/notifications/read",
      expect.anything()
    );
    readRequest.resolve({ success: true });
  });

  it("marks all notifications read from the panel", async () => {
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "PENDING" }),
    ];
    mocks.unreadCount = 1;
    render(<NavbarNotificationPanel />);

    const { user } = await openPanel();
    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    expect(mocks.apiPut).toHaveBeenCalledWith("/api/notifications", {
      action: "mark-all-read",
    });
    expect(
      await screen.findByText("All notifications marked read")
    ).toBeDefined();
  });

  it.each([
    ["accept", "You're now friends with player-1"],
    ["decline", "Friend request from player-1 declined"],
  ] as const)(
    "resolves a request optimistically on %s",
    async (action, outcome) => {
      const actionRequest = deferred<unknown>();
      mocks.notifications = [
        notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
      ];
      mocks.apiPut.mockImplementation((url: string) =>
        url === "/api/notifications/1"
          ? actionRequest.promise
          : Promise.resolve({ success: true })
      );
      render(<NavbarNotificationPanel />);

      const { user } = await openPanel();
      await user.click(
        screen.getByRole("button", {
          name: new RegExp(`^${action}`, "i"),
        })
      );

      expect(
        screen.getByRole("listitem", { name: new RegExp(outcome) })
      ).toBeDefined();
      expect(
        screen.queryByRole("button", {
          name: `Accept friend request from player-1`,
        })
      ).toBeNull();
      expect(mocks.apiPut).toHaveBeenCalledWith("/api/notifications/1", {
        action,
      });
      actionRequest.resolve({ success: true });
    }
  );

  it.each([
    ["network failure", new TypeError("network down")],
    ["rate limiting", new ApiError("Too many requests", 429)],
  ])("rolls an optimistic resolution back on %s", async (_label, failure) => {
    const actionRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
    ];
    mocks.apiPut.mockReturnValue(actionRequest.promise);
    render(<NavbarNotificationPanel />);

    const { user } = await openPanel();
    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from player-1",
      })
    );
    expect(
      screen.getByRole("listitem", {
        name: /You're now friends with player-1/,
      })
    ).toBeDefined();

    actionRequest.reject(failure);

    expect(
      await screen.findByRole("button", {
        name: "Accept friend request from player-1",
      })
    ).toBeDefined();
    expect(mocks.toastError).toHaveBeenCalledOnce();
  });

  it.each([
    ["decline", "accepted", "You're now friends with player-1"],
    ["accept", "declined", "Friend request from player-1 declined"],
  ] as const)(
    "renders and announces the authoritative %s conflict outcome",
    async (action, actualOutcome, description) => {
      mocks.notifications = [
        notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
      ];
      mocks.apiPut.mockRejectedValue(
        new ApiError(`Notification already ${actualOutcome}`, 409, {
          error: `Notification already ${actualOutcome}`,
        })
      );
      render(<NavbarNotificationPanel />);

      const { user } = await openPanel();
      await user.click(
        screen.getByRole("button", {
          name: new RegExp(`^${action}`, "i"),
        })
      );

      expect(
        await screen.findByRole("listitem", {
          name: new RegExp(description),
        })
      ).toBeDefined();
      expect(
        screen.getByText(`${description}. Request already resolved.`)
      ).toBeDefined();
      expect(mocks.toastError).not.toHaveBeenCalled();
      expect(mocks.refresh).toHaveBeenCalled();
    }
  );

  it("removes actions while an untyped conflict reconciles", async () => {
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
    ];
    mocks.apiPut.mockRejectedValue(new ApiError("Already resolved", 410));
    render(<NavbarNotificationPanel />);

    const { user } = await openPanel();
    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from player-1",
      })
    );

    expect(
      await screen.findByRole("listitem", {
        name: /already resolved\. Updating status/,
      })
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Decline/ })).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not mark a realtime notification that arrives after opening", async () => {
    const view = render(<NavbarNotificationPanel />);

    const { bell } = await openPanel();
    mocks.notifications = [
      notification("late", "2026-01-01T00:00:00.000Z", {
        status: "PENDING",
      }),
    ];
    mocks.unreadCount = 1;
    view.rerender(<NavbarNotificationPanel />);

    expect(
      await screen.findByRole("listitem", {
        name: /Unread\. player-late sent you a friend request/,
      })
    ).toBeDefined();
    expect(mocks.apiPut).not.toHaveBeenCalledWith("/api/notifications/late", {
      action: "read",
    });
    expect(bell.getAttribute("aria-label")).toBe(
      "Notifications, 1 unread notification"
    );
  });

  it("reconciles one failed read without retrying or toasting in the open session", async () => {
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "PENDING" }),
    ];
    mocks.unreadCount = 1;
    mocks.apiPut.mockRejectedValue(new TypeError("network down"));
    const view = render(<NavbarNotificationPanel />);

    const { bell } = await openPanel();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "PENDING" }),
    ];
    view.rerender(<NavbarNotificationPanel />);

    await act(async () => undefined);
    expect(mocks.apiPut).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(bell.getAttribute("aria-label")).toBe(
      "Notifications, 1 unread notification"
    );
  });

  it("does not reread a successfully handled item when the panel reopens", async () => {
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "PENDING" }),
    ];
    mocks.unreadCount = 1;
    render(<NavbarNotificationPanel />);

    const { user, bell } = await openPanel();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    await user.keyboard("{Escape}");
    await user.click(bell);
    await screen.findByRole("dialog", { name: "Notifications" });

    expect(mocks.apiPut).toHaveBeenCalledTimes(1);
  });

  it("locks duplicate read requests while a close and reopen overlaps", async () => {
    const readRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "PENDING" }),
    ];
    mocks.unreadCount = 1;
    mocks.apiPut.mockReturnValue(readRequest.promise);
    render(<NavbarNotificationPanel />);

    const { user, bell } = await openPanel();
    await user.keyboard("{Escape}");
    await user.click(bell);
    await screen.findByRole("dialog", { name: "Notifications" });

    expect(mocks.apiPut).toHaveBeenCalledTimes(1);
    readRequest.resolve({ success: true });
  });

  it("locks rapid duplicate actions before React disables the controls", async () => {
    const actionRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
    ];
    mocks.apiPut.mockReturnValue(actionRequest.promise);
    render(<NavbarNotificationPanel />);

    await openPanel();
    const accept = screen.getByRole("button", {
      name: "Accept friend request from player-1",
    });
    act(() => {
      fireEvent.click(accept);
      fireEvent.click(accept);
    });

    expect(mocks.apiPut).toHaveBeenCalledTimes(1);
    actionRequest.resolve({ success: true });
  });

  it("connects aria-controls to the mounted dialog", async () => {
    render(<NavbarNotificationPanel />);

    const { bell } = await openPanel();
    const dialog = screen.getByRole("dialog", { name: "Notifications" });

    expect(bell.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.getElementById(dialog.id)).toBe(dialog);
  });

  it("restores the exact pending unread state when action and read fail", async () => {
    const readRequest = deferred<unknown>();
    const actionRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "PENDING" }),
    ];
    mocks.unreadCount = 1;
    mocks.apiPut.mockImplementation((_url: string, body: { action: string }) =>
      body.action === "read" ? readRequest.promise : actionRequest.promise
    );
    render(<NavbarNotificationPanel />);

    const { user, bell } = await openPanel();
    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from player-1",
      })
    );
    actionRequest.reject(new TypeError("action failed"));
    readRequest.reject(new TypeError("read failed"));

    expect(
      await screen.findByRole("button", {
        name: "Accept friend request from player-1",
      })
    ).toBeDefined();
    expect(
      screen.getByRole("listitem", {
        name: /Unread\. player-1 sent you a friend request/,
      })
    ).toBeDefined();
    await waitFor(() =>
      expect(bell.getAttribute("aria-label")).toBe(
        "Notifications, 1 unread notification"
      )
    );
    expect(mocks.toastError).toHaveBeenCalledOnce();
  });

  it("uses the actor fallback and disables a request without a reference", async () => {
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", {
        actor: null,
        actorUserId: null,
        referenceId: null,
      }),
    ];
    render(<NavbarNotificationPanel />);

    await openPanel();

    expect(screen.getByText("A player")).toBeDefined();
    expect(screen.getByText("Friend request unavailable")).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Decline/ })).toBeNull();
  });

  it("rolls back an action that fails after the panel closes", async () => {
    const actionRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
    ];
    mocks.apiPut.mockReturnValue(actionRequest.promise);
    render(<NavbarNotificationPanel />);

    const { user, bell } = await openPanel();
    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from player-1",
      })
    );
    await user.keyboard("{Escape}");
    actionRequest.reject(new TypeError("late failure"));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    await user.click(bell);

    expect(
      await screen.findByRole("button", {
        name: "Accept friend request from player-1",
      })
    ).toBeDefined();
  });

  it("ignores an action result after the panel unmounts", async () => {
    const actionRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
    ];
    mocks.apiPut.mockReturnValue(actionRequest.promise);
    const view = render(<NavbarNotificationPanel />);

    const { user } = await openPanel();
    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from player-1",
      })
    );
    view.unmount();
    await act(async () => {
      actionRequest.reject(new TypeError("late failure"));
      await actionRequest.promise.catch(() => undefined);
    });

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not roll back when realtime resolves the row during the request", async () => {
    const actionRequest = deferred<unknown>();
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", { status: "READ" }),
    ];
    mocks.apiPut.mockReturnValue(actionRequest.promise);
    const view = render(<NavbarNotificationPanel />);

    const { user } = await openPanel();
    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from player-1",
      })
    );
    mocks.notifications = [
      notification("1", "2026-01-01T00:00:00.000Z", {
        status: "ACCEPTED",
      }),
    ];
    view.rerender(<NavbarNotificationPanel />);
    await waitFor(() =>
      expect(
        screen.getByRole("listitem", {
          name: /You're now friends with player-1/,
        })
      ).toBeDefined()
    );

    actionRequest.reject(new TypeError("late network failure"));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", {
        name: "Accept friend request from player-1",
      })
    ).toBeNull();
  });

  it("supports arrow navigation, Escape dismissal, and focus restoration", async () => {
    mocks.notifications = [
      notification("2", "2026-01-02T00:00:00.000Z"),
      notification("1", "2026-01-01T00:00:00.000Z"),
    ];
    render(
      <>
        <NavbarNotificationPanel />
        <button type="button" data-outside-control>
          Outside control
        </button>
      </>
    );

    const { user, bell } = await openPanel();
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    const rows = screen.getAllByRole("listitem");
    expect(document.activeElement).toBe(rows[0]);

    for (let index = 0; index < 8; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    document
      .querySelector<HTMLButtonElement>("[data-outside-control]")
      ?.focus();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true)
    );
    rows[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[1]);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull()
    );
    expect(document.activeElement).toBe(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("false");
  });
});
