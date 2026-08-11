// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
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
  // Captured from the navbar's own controlled NavigationMenu so tests can
  // drive Radix's open/close value changes.
  setMenuValue: null as ((value: string) => void) | null,
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

vi.mock("@/components/ui/navigation-menu", async () => {
  const { createContext, useContext, useState } = await import("react");
  const { createPortal } = await import("react-dom");
  const ViewportContext = createContext<{
    enabled: boolean;
    element: HTMLDivElement | null;
  }>({ enabled: false, element: null });

  return {
    NavigationMenu: ({
      children,
      className,
      viewport = true,
      onValueChange,
    }: {
      children: ReactNode;
      className?: string;
      viewport?: boolean;
      onValueChange?: (value: string) => void;
    }) => {
      const [viewportElement, setViewportElement] =
        useState<HTMLDivElement | null>(null);

      // The account menu renders an uncontrolled NavigationMenu too, so only
      // the controlled one is captured.
      if (onValueChange) mocks.setMenuValue = onValueChange;

      return (
        <div
          data-slot="navigation-menu"
          data-viewport={viewport}
          className={className}
        >
          <ViewportContext.Provider
            value={{ enabled: viewport, element: viewportElement }}
          >
            {children}
            {viewport && (
              <div
                ref={setViewportElement}
                data-slot="navigation-menu-viewport"
              />
            )}
          </ViewportContext.Provider>
        </div>
      );
    },
    NavigationMenuList: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => (
      <div data-slot="navigation-menu-list" className={className}>
        {children}
      </div>
    ),
    NavigationMenuItem: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    NavigationMenuTrigger: ({
      children,
      ...props
    }: ComponentProps<"button">) => <button {...props}>{children}</button>,
    NavigationMenuContent: ({ children }: { children: ReactNode }) => {
      const viewportContext = useContext(ViewportContext);
      const content = <div data-slot="navigation-menu-content">{children}</div>;

      if (viewportContext.enabled && viewportContext.element) {
        return createPortal(content, viewportContext.element);
      }

      return viewportContext.enabled ? null : content;
    },
    NavigationMenuLink: ({ children }: { children: ReactNode }) => children,
    navigationMenuTriggerStyle: () => "navigation-trigger",
  };
});

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
  mocks.setMenuValue = null;
});

afterEach(() => cleanup());

function setMenuValue(value: string) {
  act(() => {
    mocks.setMenuValue?.(value);
  });
}

describe("Navbar", () => {
  it("renders the authed account cluster on a non-game route", () => {
    render(<Navbar />);

    expect(
      screen.getByRole("button", {
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

  it("renders Home, Play, Decks, Cards with matching plain-link styles", () => {
    const { container } = render(<Navbar />);
    const navText = container.querySelector("nav")?.textContent ?? "";
    const play = screen.getByRole("link", { name: "Play" });
    const home = screen.getByRole("link", { name: "Home" });

    expect(navText.indexOf("Home")).toBeLessThan(navText.indexOf("Play"));
    expect(navText.indexOf("Play")).toBeLessThan(navText.indexOf("Decks"));
    expect(navText.indexOf("Decks")).toBeLessThan(navText.indexOf("Cards"));
    expect(play.className).toBe(home.className);
    expect(play.className).not.toContain("bg-gold-500");
    expect(home).toBeDefined();
    expect(screen.getByRole("button", { name: "Decks" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cards" })).toBeDefined();
  });

  it.each([
    ["/lobbies", "link", "Play"],
    ["/game", "link", "Play"],
    ["/", "link", "Home"],
    ["/cards", "button", "Cards"],
    ["/decks", "button", "Decks"],
  ])(
    "renders the sole active pill and aria-current for %s",
    (pathname, role, accessibleName) => {
      mocks.pathname = pathname;
      render(<Navbar />);

      const activeControl = screen.getByRole(role, { name: accessibleName });

      expect(activeControl.getAttribute("aria-current")).toBe("page");
      expect(activeControl.className).toContain("bg-surface-2");
      expect(activeControl.className).toContain("text-gold-600");

      const inactiveControls = [
        screen.getByRole("link", { name: "Play" }),
        screen.getByRole("link", { name: "Home" }),
        screen.getByRole("button", { name: "Decks" }),
        screen.getByRole("button", { name: "Cards" }),
      ].filter((control) => control !== activeControl);

      for (const inactiveControl of inactiveControls) {
        const inactiveClassTokens = inactiveControl.className.split(/\s+/);

        expect(inactiveClassTokens).not.toContain("bg-surface-2");
        expect(inactiveClassTokens).not.toContain("text-gold-600");
      }

      expect(
        document.querySelector('[data-slot="navbar-current-indicator"]')
      ).toBeNull();
    }
  );

  it("removes the gold CTA fill from Play while Play is active", () => {
    mocks.pathname = "/lobbies";
    render(<Navbar />);

    const play = screen.getByRole("link", { name: "Play" });

    expect(play.className).not.toContain("bg-gold-500");
    expect(play.className).toContain("bg-surface-2");
    expect(play.className).toContain("text-gold-600");
  });

  it("uses the reserved gold border token for the nav divider", () => {
    const { container } = render(<Navbar />);

    expect(container.querySelector("nav")?.className).toContain(
      "border-border-accent"
    );
  });

  it("keeps dropdown content outside the overflow-clipping links scroller", () => {
    render(<Navbar />);

    const linksScroller = document.querySelector(
      '[data-slot="navbar-links-scroller"]'
    );
    const viewport = document.querySelector(
      '[data-slot="navigation-menu-viewport"]'
    );
    const dropdownContent = screen
      .getByText("My Decks")
      .closest('[data-slot="navigation-menu-content"]');

    expect(linksScroller).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(viewport?.contains(dropdownContent)).toBe(true);
    expect(linksScroller?.contains(dropdownContent)).toBe(false);
    expect(linksScroller?.contains(viewport)).toBe(false);
  });

  it("keeps the dropdown anchor on the closing trigger and moves it when switching menus", () => {
    render(<Navbar />);

    const decks = screen.getByRole("button", { name: "Decks" });
    const cards = screen.getByRole("button", { name: "Cards" });
    const hasAnchor = (control: HTMLElement) =>
      control.className.split(/\s+/).includes("navbar-dropdown-anchor");

    expect(hasAnchor(decks)).toBe(false);
    expect(hasAnchor(cards)).toBe(false);

    setMenuValue("decks");
    expect(hasAnchor(decks)).toBe(true);
    expect(hasAnchor(cards)).toBe(false);

    // Radix clears the value before its exit animation finishes; the closing
    // panel has to stay anchored to the trigger it belongs to.
    setMenuValue("");
    expect(hasAnchor(decks)).toBe(true);
    expect(hasAnchor(cards)).toBe(false);

    setMenuValue("cards");
    expect(hasAnchor(cards)).toBe(true);
    expect(hasAnchor(decks)).toBe(false);
  });

  it("caps the inner nav content while keeping the full-width bar separate", () => {
    const { container } = render(<Navbar />);
    const nav = container.querySelector("nav");
    const navContent = document.querySelector('[data-slot="navbar-content"]');

    expect(navContent?.className.split(/\s+/)).toContain("max-w-7xl");
    expect(navContent?.parentElement).toBe(nav);
    expect(nav?.className.split(/\s+/)).not.toContain("max-w-7xl");
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

  it("renders the production bell as a popup trigger", () => {
    render(<Navbar />);
    const bell = screen.getByRole("button", {
      name: "Notifications, No unread notifications",
    });

    expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    expect(bell.hasAttribute("aria-controls")).toBe(true);
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

    expect(screen.queryByRole("button", { name: /notifications/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /account menu/i })).toBeNull();
  });
});
