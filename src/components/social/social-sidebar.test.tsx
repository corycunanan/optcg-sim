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
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import type { RealtimeServerEvent } from "@/types/realtime";
import type { FriendEntry } from "./apply-friend-event";
import { FRIENDS_DRAWER_TOGGLE_ID } from "./friends-drawer-toggle";

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

// One shared listener registry across every MediaQueryList the hook creates,
// so `setMobileViewport` can move the breakpoint on a mounted tree the way a
// real resize does.
const mediaListeners = new Set<() => void>();
let matchesMobile = false;

function installMatchMedia() {
  mediaListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      get matches() {
        return matchesMobile;
      },
      addEventListener: (_type: string, listener: () => void) => {
        mediaListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        mediaListeners.delete(listener);
      },
    })),
  });
}

function setMobileViewport(isMobile: boolean) {
  matchesMobile = isMobile;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: isMobile ? 390 : 1024,
  });
  act(() => {
    mediaListeners.forEach((listener) => listener());
  });
}

/** Opens the drawer the way the navbar toggle does — through the provider. */
function DrawerOpener() {
  const { setOpenMobile } = useSidebar();
  return (
    <button
      // The real toggle carries this id so the drawer can hand focus back.
      id={FRIENDS_DRAWER_TOGGLE_ID}
      type="button"
      onClick={() => setOpenMobile(true)}
    >
      open drawer
    </button>
  );
}

/** Surfaces the shared open flag the navbar toggle also reads. */
function DrawerState() {
  const { openMobile } = useSidebar();
  return <span data-testid="drawer-open">{String(openMobile)}</span>;
}

function renderDrawer(onOpenChat = vi.fn()) {
  setMobileViewport(true);
  mocks.apiGet.mockImplementation((url: string) => {
    if (url === "/api/friends") return Promise.resolve({ data: [namiFriend] });
    throw new Error(`Unexpected GET ${url}`);
  });

  // `railMounted` stands in for SocialShell's `!isGame` gate: on /game/* the
  // rail is not rendered at all.
  const tree = (railMounted: boolean) => (
    <SidebarProvider>
      <DrawerOpener />
      <DrawerState />
      {railMounted && <SocialSidebar onOpenChat={onOpenChat} />}
    </SidebarProvider>
  );

  const view = render(tree(true));
  return {
    ...view,
    setRailMounted: (railMounted: boolean) => view.rerender(tree(railMounted)),
  };
}

function emit<T extends EventType>(type: T, event: EventFor<T>) {
  const handler = mocks.handlers.get(type) as EventHandler<T> | undefined;
  expect(handler, `subscription for ${type}`).toBeDefined();
  act(() => handler?.(event));
}

beforeEach(() => {
  installMatchMedia();
  setMobileViewport(false);
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

  it("hides the docked rail below md, where the drawer takes over", () => {
    const { container } = renderSidebar();
    const railClasses =
      container
        .querySelector('[data-slot="sidebar"]')
        ?.className.split(/\s+/) ?? [];

    // OPT-663: the CSS half of the split. It holds in the frame before any
    // hook has read the viewport, so a narrow screen never flashes a 280px
    // rail across the page.
    expect(railClasses).toContain("hidden");
    expect(railClasses).toContain("md:flex");
  });

  it("renders the rail as a drawer below md instead of a fixed column", async () => {
    const { container } = renderDrawer();

    // Nothing is docked: below md the rail exists only once opened.
    expect(container.querySelector('[data-slot="sidebar"]')).toBeNull();
    expect(document.querySelector("#friends-drawer")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "open drawer" }));

    const drawer = await screen.findByRole("dialog");
    expect(drawer.id).toBe("friends-drawer");
    // Same width token as the docked rail, and the gold left edge that
    // identifies it.
    expect(drawer.className).toContain("data-[side=right]:w-social-rail");
    expect(drawer.className).toContain("social-rail");
    // The drawer shows the same list the rail does.
    expect(await within(drawer).findByText("nami")).toBeDefined();
    // Focus lands on the panel, not on the first control inside it — Radix's
    // default would ring "Add friend" gold on open.
    await waitFor(() => expect(document.activeElement).toBe(drawer));
  });

  it("closes the drawer on Escape and hands focus back to the toggle", async () => {
    renderDrawer();
    const opener = screen.getByRole("button", { name: "open drawer" });

    await userEvent.click(opener);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Radix restores focus to its own `Dialog.Trigger`; the drawer has none,
    // so it restores by id instead — otherwise focus lands on <body>.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes the drawer when the viewport grows past md, and leaves it closed coming back", async () => {
    renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "open drawer" }));
    await screen.findByRole("dialog");

    setMobileViewport(false);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("drawer-open").textContent).toBe("false");
    // The docked rail takes the column back.
    expect(document.querySelector('[data-slot="sidebar"]')).not.toBeNull();

    setMobileViewport(true);

    // Nothing reopens on the way back down: the flag lives in the provider and
    // would otherwise still read true.
    await waitFor(() =>
      expect(document.querySelector('[data-slot="sidebar"]')).toBeNull()
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("drawer-open").textContent).toBe("false");
  });

  it("clears the drawer when the rail unmounts, as it does on /game/*", async () => {
    const { setRailMounted } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "open drawer" }));
    await screen.findByRole("dialog");
    expect(screen.getByTestId("drawer-open").textContent).toBe("true");

    setRailMounted(false);

    await waitFor(() =>
      expect(screen.getByTestId("drawer-open").textContent).toBe("false")
    );

    setRailMounted(true);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives the drawer its own close control, which the docked rail omits", async () => {
    renderDrawer();
    expect(screen.queryByRole("button", { name: "Close friends" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "open drawer" }));
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(
      within(drawer).getByRole("button", { name: "Close friends" })
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
