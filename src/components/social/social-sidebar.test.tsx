// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { RealtimeServerEvent } from "@/types/realtime";
import type { FriendEntry } from "./apply-friend-event";

type EventType = RealtimeServerEvent["type"];
type EventFor<T extends EventType> = Extract<RealtimeServerEvent, { type: T }>;
type EventHandler<T extends EventType = EventType> = (
  event: EventFor<T>
) => void;

const nami = {
  id: "friend-1",
  username: "nami",
  name: "Nami",
  image: null,
};
const namiFriend: FriendEntry = {
  friendshipId: "friendship-1",
  user: nami,
};

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  handlers: new Map<string, (event: never) => void>(),
  presence: {} as Record<string, { online: boolean; lastSeen: string | null }>,
  trackPresence: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        id: "current-user",
        username: "tester",
        name: "Tester",
        email: "tester@example.com",
      },
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/api-client", () => ({
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: (type: string, handler: (event: never) => void) => {
      mocks.handlers.set(type, handler);
      return () => mocks.handlers.delete(type);
    },
    connectionStatus: "connected",
    presence: mocks.presence,
    trackPresence: mocks.trackPresence,
  }),
}));

vi.mock("./user-avatar", () => ({
  UserAvatar: ({ user }: { user: { username: string | null } }) => (
    <span aria-hidden="true">{user.username?.slice(0, 1) ?? "?"}</span>
  ),
}));

import { SocialSidebar } from "./social-sidebar";

function renderSidebar(
  onOpenChat = vi.fn(),
  friends: FriendEntry[] = [namiFriend]
) {
  mocks.apiGet.mockImplementation((url: string) => {
    if (url === "/api/friends") return Promise.resolve({ data: friends });
    if (url.startsWith("/api/users/search")) {
      return Promise.resolve({ data: [nami] });
    }
    if (url === "/api/friends/requests") {
      return Promise.resolve({
        data: {
          incoming: [
            {
              id: "request-1",
              fromUser: {
                id: "requester-1",
                username: "robin",
                name: "Robin",
                image: null,
              },
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  const view = render(
    <SidebarProvider>
      <SocialSidebar onOpenChat={onOpenChat} />
    </SidebarProvider>
  );
  return { ...view, onOpenChat };
}

function emit<T extends EventType>(type: T, event: EventFor<T>) {
  const handler = mocks.handlers.get(type) as EventHandler<T> | undefined;
  expect(handler, `subscription for ${type}`).toBeDefined();
  act(() => handler?.(event));
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  mocks.apiDelete.mockReset().mockResolvedValue({});
  mocks.apiGet.mockReset();
  mocks.apiPost.mockReset().mockResolvedValue({});
  mocks.handlers.clear();
  mocks.presence = {};
  mocks.trackPresence.mockReset();
});

afterEach(() => cleanup());

describe("SocialSidebar", () => {
  it("uses the gold divider and omits the duplicate account footer", () => {
    const { container } = renderSidebar();

    expect(
      container.querySelector('[data-slot="sidebar-header"]')?.className
    ).toContain("border-border-accent");
    expect(screen.queryByText("tester")).toBeNull();
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
  });

  it("pins the rail from below the navbar down to the viewport floor", () => {
    const { container } = renderSidebar();
    const rail = container.querySelector('[data-slot="sidebar"]');
    const railClasses = rail?.className.split(/\s+/) ?? [];
    const content = container.querySelector('[data-slot="sidebar-content"]');

    expect(railClasses).toContain("fixed");
    // The full-width navbar owns the top of the app (OPT-649), so the rail
    // starts at the shared `--spacing-navbar` height rather than at the top
    // of the viewport. A literal `top-16` would drift from the navbar.
    expect(railClasses).toContain("top-navbar");
    expect(railClasses).toContain("bottom-0");
    expect(railClasses).not.toContain("inset-y-0");
    expect(railClasses).not.toContain("top-16");
    expect(railClasses).not.toContain("top-0");
    // `h-auto` is load-bearing: it drops the primitive's `h-full` so the
    // top/bottom insets size the rail instead of a 100vh height overhanging
    // the viewport by the navbar's height.
    expect(railClasses).toContain("h-auto");
    expect(railClasses).not.toContain("h-full");
    // The rail stays under the navbar (z-40) and above page content.
    expect(railClasses).toContain("z-30");
    // Width comes from the same token as the in-flow spacer in SocialShell.
    expect(railClasses).toContain("w-social-rail");
    expect(content?.className).toContain("min-h-0");
    expect(content?.className).toContain("flex-1");
    expect(content?.className).toContain("overflow-auto");
  });

  it("does not fetch or render incoming friend requests", async () => {
    renderSidebar();

    await screen.findByRole("button", { name: "Chat with nami" });

    expect(
      mocks.apiGet.mock.calls.some(([url]) => url === "/api/friends/requests")
    ).toBe(false);
    expect(screen.queryByText(/^Requests/)).toBeNull();
    expect(screen.queryByText("robin")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Accept friend request" })
    ).toBeNull();
  });

  it("adds an accepted request to the friends list in realtime", async () => {
    renderSidebar(vi.fn(), []);
    await waitFor(() =>
      expect(mocks.handlers.has("friend:request_accepted")).toBe(true)
    );

    emit("friend:request_accepted", {
      type: "friend:request_accepted",
      request: {
        id: "request-1",
        fromUserId: "current-user",
        toUserId: nami.id,
        createdAt: "2026-07-28T00:00:00.000Z",
        fromUser: {
          id: "current-user",
          username: "tester",
          name: "Tester",
          image: null,
        },
      },
      friendship: {
        id: namiFriend.friendshipId,
        createdAt: "2026-07-28T00:00:01.000Z",
        user: nami,
      },
    });

    expect(
      await screen.findByRole("button", { name: "Chat with nami" })
    ).toBeDefined();
  });

  it("keeps presence-driven online and offline lists current", async () => {
    const view = renderSidebar();
    await screen.findByRole("button", { name: "Chat with nami" });
    expect(screen.getByText("Offline (1)")).toBeDefined();

    mocks.presence = {
      [nami.id]: { online: true, lastSeen: null },
    };
    view.rerender(
      <SidebarProvider>
        <SocialSidebar onOpenChat={view.onOpenChat} />
      </SidebarProvider>
    );

    expect(screen.getByText("Online (1)")).toBeDefined();
    expect(screen.getByText("Offline (0)")).toBeDefined();
    const onlineGroup = screen
      .getByText("Online (1)")
      .closest('[data-sidebar="group"]');
    expect(onlineGroup).not.toBeNull();
    expect(
      within(onlineGroup as HTMLElement).getByRole("button", {
        name: "Chat with nami",
      })
    ).toBeDefined();
  });

  it("opens chat from a friend row", async () => {
    const user = userEvent.setup();
    const onOpenChat = vi.fn();
    renderSidebar(onOpenChat);

    await user.click(
      await screen.findByRole("button", { name: "Chat with nami" })
    );

    expect(onOpenChat).toHaveBeenCalledWith(nami);
  });

  it("shows Request sent in the add-friend flow", async () => {
    const user = userEvent.setup();
    renderSidebar(vi.fn(), []);
    await screen.findByText("Add friends to start a conversation.");

    await user.click(screen.getByRole("button", { name: "Add friend" }));
    const search = await screen.findByPlaceholderText(
      "Search 3+ username characters..."
    );
    await user.type(search, "nam");
    await user.click(
      await screen.findByRole("button", {
        name: "Send friend request to nami",
      })
    );

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith("/api/friends/requests", {
        toUserId: nami.id,
      })
    );
    expect(await screen.findByText("Request sent")).toBeDefined();
  });

  it("keeps declined events subscribed to clear outgoing Request sent state", async () => {
    const user = userEvent.setup();
    renderSidebar(vi.fn(), []);
    await user.click(screen.getByRole("button", { name: "Add friend" }));
    await user.type(
      await screen.findByPlaceholderText("Search 3+ username characters..."),
      "nam"
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Send friend request to nami",
      })
    );
    await screen.findByText("Request sent");

    emit("friend:request_declined", {
      type: "friend:request_declined",
      requestId: "request-1",
      toUserId: nami.id,
    });

    expect(
      await screen.findByRole("button", {
        name: "Send friend request to nami",
      })
    ).toBeDefined();
    expect(screen.queryByText("Request sent")).toBeNull();
  });
});
