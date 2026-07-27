// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/decks",
  unreadCount: 0,
  sessionUser: {
    id: "user-1",
    username: "luffy",
    name: "Luffy",
    email: "luffy@example.com",
    image: null,
    isAdmin: false,
    theme: "default",
  } as Record<string, unknown>,
  sessionStatus: "authenticated" as
    | "authenticated"
    | "loading"
    | "unauthenticated",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: mocks.sessionStatus,
    data:
      mocks.sessionStatus === "authenticated"
        ? {
            user: mocks.sessionUser,
          }
        : null,
  }),
  signOut: vi.fn(),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    notificationInbox: {
      notifications: [],
      unreadCount: mocks.unreadCount,
      loadState: "success",
      refresh: vi.fn(),
    },
  }),
}));

vi.mock("@/components/deck-builder/deck-navigation-guard", () => ({
  DeckNavigationGuardLink: ({
    href,
    children,
    ...props
  }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/navigation-menu", () => ({
  NavigationMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  NavigationMenuList: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  NavigationMenuItem: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  NavigationMenuTrigger: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  NavigationMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  NavigationMenuLink: ({ children }: { children: ReactNode }) => children,
  navigationMenuTriggerStyle: () => "navigation-trigger",
}));

import { Navbar } from "./navbar";

beforeEach(() => {
  mocks.pathname = "/decks";
  mocks.unreadCount = 0;
  mocks.sessionUser = {
    id: "user-1",
    username: "luffy",
    name: "Luffy",
    email: "luffy@example.com",
    image: null,
    isAdmin: false,
    theme: "default",
  };
  mocks.sessionStatus = "authenticated";
});

afterEach(() => cleanup());

describe("Navbar", () => {
  it("renders the authed account cluster on a non-game route", () => {
    render(<Navbar />);

    expect(
      screen.getByRole("status", {
        name: "Notifications, No unread notifications",
      })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Account menu for luffy" })
    ).toBeDefined();
  });

  it("returns null on game routes", () => {
    mocks.pathname = "/game/match-1";
    const { container } = render(<Navbar />);

    expect(container.firstChild).toBeNull();
  });

  it("renders PLAY first with emphasis and keeps all four links", () => {
    const { container } = render(<Navbar />);
    const navText = container.querySelector("nav")?.textContent ?? "";
    const play = screen.getByRole("link", { name: "Play" });

    expect(navText.indexOf("Play")).toBeLessThan(navText.indexOf("Home"));
    expect(navText.indexOf("Home")).toBeLessThan(navText.indexOf("Cards"));
    expect(navText.indexOf("Cards")).toBeLessThan(navText.indexOf("Decks"));
    expect(play.className).toContain("bg-gold-500");
    expect(screen.getByRole("link", { name: "Home" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cards" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Decks" })).toBeDefined();
  });

  it.each([
    ["/lobbies", "link", "Play", "play"],
    ["/", "link", "Home", "standard"],
    ["/cards", "button", "Cards", "standard"],
    ["/decks", "button", "Decks", "standard"],
  ])(
    "renders the distinct current-route indicator for %s",
    (pathname, role, accessibleName, indicatorVariant) => {
      mocks.pathname = pathname;
      render(<Navbar />);

      const activeControl = screen.getByRole(role, { name: accessibleName });
      const indicator = activeControl.querySelector(
        '[data-slot="navbar-current-indicator"]'
      );

      expect(indicator?.getAttribute("data-variant")).toBe(indicatorVariant);
      expect(
        document.querySelectorAll('[data-slot="navbar-current-indicator"]')
      ).toHaveLength(1);
    }
  );

  it("reflects realtime unread counts, caps at 9+, and omits a zero badge", () => {
    mocks.unreadCount = 4;
    const { rerender } = render(<Navbar />);
    expect(screen.getByText("4")).toBeDefined();

    mocks.unreadCount = 15;
    rerender(<Navbar />);
    expect(screen.getByText("9+")).toBeDefined();

    mocks.unreadCount = 0;
    rerender(<Navbar />);
    expect(
      document.querySelector('[data-slot="notification-unread-badge"]')
    ).toBeNull();
  });

  it("contains profile, theme, and sign-out account entries", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "Profile" })).toBeDefined();
    expect(screen.getByText("Theme")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeDefined();
  });

  it("renders the production bell as a non-interactive count status", () => {
    render(<Navbar />);
    const indicator = screen.getByRole("status", {
      name: "Notifications, No unread notifications",
    });

    expect(indicator.tabIndex).toBe(-1);
    expect(screen.queryByRole("button", { name: /notifications/i })).toBeNull();
  });

  it("keeps the same reserved action slot across auth resolution", () => {
    mocks.sessionStatus = "loading";
    const { rerender } = render(<Navbar />);
    const loadingSlot = document.querySelector('[data-slot="navbar-actions"]');

    expect(loadingSlot?.getAttribute("data-state")).toBe("loading");

    mocks.sessionStatus = "authenticated";
    rerender(<Navbar />);
    const readySlot = document.querySelector('[data-slot="navbar-actions"]');

    expect(readySlot).toBe(loadingSlot);
    expect(readySlot?.getAttribute("data-state")).toBe("ready");
    expect(
      screen.getByRole("button", { name: "Account menu for luffy" })
    ).toBeDefined();
  });

  it("handles partial authenticated user data with a default theme", () => {
    mocks.sessionUser = { id: "user-1", isAdmin: false };
    render(<Navbar />);

    expect(
      screen.getByRole("button", { name: "Account menu for Pirate" })
    ).toBeDefined();
    expect(screen.getByLabelText("Theme: Default")).toBeDefined();
  });

  it("removes actions safely when an authenticated session expires", () => {
    const { rerender } = render(<Navbar />);
    expect(
      document.querySelector('[data-slot="navbar-actions"]')
    ).not.toBeNull();

    mocks.sessionStatus = "loading";
    rerender(<Navbar />);
    expect(
      document
        .querySelector('[data-slot="navbar-actions"]')
        ?.getAttribute("data-state")
    ).toBe("loading");

    mocks.sessionStatus = "unauthenticated";
    rerender(<Navbar />);
    expect(document.querySelector('[data-slot="navbar-actions"]')).toBeNull();
  });

  it("does not render account actions before authentication", () => {
    mocks.sessionStatus = "unauthenticated";
    render(<Navbar />);

    expect(screen.queryByRole("status", { name: /notifications/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /account menu/i })).toBeNull();
  });
});
