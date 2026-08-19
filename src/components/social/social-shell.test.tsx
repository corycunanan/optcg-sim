// @vitest-environment jsdom

import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/lobbies",
  sessionUser: { id: "user-1", username: "luffy" } as Record<
    string,
    unknown
  > | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: mocks.sessionUser ? { user: mocks.sessionUser } : null,
  }),
}));

// `next/dynamic` defers each child behind a promise the test can never flush.
// Routing it through `React.lazy` keeps the code-splitting boundary honest
// while letting the mocked modules below resolve inside a Suspense boundary.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<ComponentType>) =>
    lazy(() => loader().then((Component) => ({ default: Component }))),
}));

vi.mock("./social-sidebar", () => ({
  SocialSidebar: ({
    onOpenChat,
  }: {
    onOpenChat: (user: { id: string; username: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onOpenChat({ id: "friend-1", username: "nami" })}
    >
      open chat
    </button>
  ),
}));

vi.mock("./chat-widget", () => ({
  ChatWidget: ({ sidebarCollapsed }: { sidebarCollapsed: boolean }) => (
    <div
      data-testid="chat-widget"
      data-dock={sidebarCollapsed ? "right-4" : "social-chat-dock"}
    />
  ),
}));

vi.mock("@/components/lobbies/lobby-invite-toast", () => ({
  LobbyInviteToasts: () => null,
}));

import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { SocialShell } from "./social-shell";

/** Surfaces the drawer state the shell shares with the navbar toggle. */
function DrawerProbe() {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <>
      <span data-testid="drawer-open">{String(openMobile)}</span>
      <button type="button" onClick={() => setOpenMobile(true)}>
        force open drawer
      </button>
    </>
  );
}

function setViewportWidth(matchesMobile: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: matchesMobile,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function renderShell(children?: ReactNode) {
  return render(
    <SidebarProvider>
      <Suspense fallback={null}>
        <SocialShell />
      </Suspense>
      {children}
    </SidebarProvider>
  );
}

const spacer = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slot="social-rail-spacer"]');

beforeEach(() => {
  setViewportWidth(false);
  mocks.pathname = "/lobbies";
  mocks.sessionUser = { id: "user-1", username: "luffy" };
});

afterEach(() => cleanup());

describe("SocialShell", () => {
  it("reserves the rail's column only from md up", async () => {
    const { container } = renderShell();
    await screen.findByRole("button", { name: "open chat" });

    const classes = spacer(container)?.className.split(/\s+/) ?? [];

    // OPT-663: an unconditional spacer left a 390px viewport with ~110px of
    // page. The reservation is CSS-gated so it is correct on the first paint,
    // before any hook has measured the viewport.
    expect(classes).toContain("w-social-rail");
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:block");
  });

  it("docks the chat widget beside the rail from md up", async () => {
    renderShell();
    await userEvent.click(
      await screen.findByRole("button", { name: "open chat" })
    );

    expect((await screen.findByTestId("chat-widget")).dataset.dock).toBe(
      "social-chat-dock"
    );
  });

  it("docks the chat widget at the viewport edge below md", async () => {
    setViewportWidth(true);
    renderShell();
    await userEvent.click(
      await screen.findByRole("button", { name: "open chat" })
    );

    // No rail column below md, so the rail-width offset would strand the
    // widget 280px inside the right edge.
    expect((await screen.findByTestId("chat-widget")).dataset.dock).toBe(
      "right-4"
    );
  });

  it("closes the drawer when a chat opens, so the widget is not under the scrim", async () => {
    setViewportWidth(true);
    renderShell(<DrawerProbe />);
    await userEvent.click(
      screen.getByRole("button", { name: "force open drawer" })
    );
    expect(screen.getByTestId("drawer-open").textContent).toBe("true");

    await userEvent.click(
      await screen.findByRole("button", { name: "open chat" })
    );

    expect(await screen.findByTestId("chat-widget")).toBeDefined();
    expect(screen.getByTestId("drawer-open").textContent).toBe("false");
  });

  it("renders neither rail nor spacer on a game route", async () => {
    mocks.pathname = "/game/match-1";
    const { container } = renderShell();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "open chat" })).toBeNull()
    );
    expect(spacer(container)).toBeNull();
  });

  it("renders nothing for a signed-out visitor", async () => {
    mocks.sessionUser = null;
    const { container } = renderShell();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "open chat" })).toBeNull()
    );
    expect(spacer(container)).toBeNull();
  });
});
