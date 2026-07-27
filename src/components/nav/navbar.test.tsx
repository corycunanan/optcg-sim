// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/decks",
  unreadCount: 0,
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
            user: {
              id: "user-1",
              username: "luffy",
              name: "Luffy",
              email: "luffy@example.com",
              image: null,
              isAdmin: false,
              theme: "default",
            },
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
  mocks.sessionStatus = "authenticated";
});

afterEach(() => cleanup());

describe("Navbar", () => {
  it("renders the authed account cluster on a non-game route", () => {
    render(<Navbar />);

    expect(screen.getByRole("button", { name: "Notifications" })).toBeDefined();
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

  it("operates the notification trigger from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const bell = screen.getByRole("button", { name: "Notifications" });

    bell.focus();
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not render account actions before authentication", () => {
    mocks.sessionStatus = "unauthenticated";
    render(<Navbar />);

    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("button", { name: /account menu/i })).toBeNull();
  });
});
