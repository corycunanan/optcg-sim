// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// The nav row no longer opens anything (OPT-680), so the mock only has to
// render the primitives' structure: the one remaining menu in the bar is the
// account menu, which runs in `viewport={false}` mode and renders its content
// inline.
vi.mock("@/components/ui/navigation-menu", () => ({
  NavigationMenu: ({
    children,
    className,
    viewport = true,
  }: {
    children: ReactNode;
    className?: string;
    viewport?: boolean;
  }) => (
    <div
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={className}
    >
      {children}
      {viewport && <div data-slot="navigation-menu-viewport" />}
    </div>
  ),
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
  NavigationMenuItem: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div data-slot="navigation-menu-item" className={className}>
      {children}
    </div>
  ),
  NavigationMenuTrigger: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  NavigationMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-slot="navigation-menu-content">{children}</div>
  ),
  NavigationMenuLink: ({ children }: { children: ReactNode }) => children,
  navigationMenuTriggerStyle: () => "navigation-trigger",
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { Navbar } from "./navbar";

// The bar's friends toggle reads the drawer's open state from
// `SidebarProvider`, which the root layout mounts around both (OPT-663).
// `render`/`rerender` go through this wrapper so the tests compose the bar the
// way production does.
function renderNavbar() {
  return render(<Navbar />, { wrapper: SidebarProvider });
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

beforeEach(() => {
  setViewportWidth(false);
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
    renderNavbar();

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
    const { container } = renderNavbar();

    // The provider wrapper always renders, so the bar's absence is the
    // absence of a <nav>, not an empty container.
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders Home, Play, Decks, Cards as four plain links with matching styles", () => {
    const { container } = renderNavbar();
    const navText = container.querySelector("nav")?.textContent ?? "";
    const home = screen.getByRole("link", { name: "Home" });
    const play = screen.getByRole("link", { name: "Play" });
    const decks = screen.getByRole("link", { name: "Decks" });
    const cards = screen.getByRole("link", { name: "Cards" });

    expect(navText.indexOf("Home")).toBeLessThan(navText.indexOf("Play"));
    expect(navText.indexOf("Play")).toBeLessThan(navText.indexOf("Decks"));
    expect(navText.indexOf("Decks")).toBeLessThan(navText.indexOf("Cards"));
    expect(home.getAttribute("href")).toBe("/");
    expect(play.getAttribute("href")).toBe("/lobbies");
    expect(decks.getAttribute("href")).toBe("/decks");
    expect(cards.getAttribute("href")).toBe("/cards");
    // Decks is active on this pathname, so only the three inactive links share
    // a class string.
    expect(play.className).toBe(home.className);
    expect(cards.className).toBe(home.className);
    expect(play.className).not.toContain("bg-gold-500");
  });

  it("leaves no dropdown trigger or menu panel in the link row (OPT-680)", () => {
    renderNavbar();

    const linksScroller = document.querySelector(
      '[data-slot="navbar-links-scroller"]'
    );

    // Decks and Cards used to be `NavigationMenuTrigger` buttons with a
    // chevron and a panel; the row is links only now.
    expect(linksScroller?.querySelectorAll("button")).toHaveLength(0);
    expect(
      linksScroller?.querySelectorAll(
        '[data-slot="navigation-menu-content"], svg'
      )
    ).toHaveLength(0);
    expect(linksScroller?.querySelectorAll("a")).toHaveLength(4);
    // Nothing in the bar anchors a menu any more, so the dead CSS anchor class
    // must not survive on a link either.
    for (const link of linksScroller?.querySelectorAll("a") ?? []) {
      expect(link.className.split(/\s+/)).not.toContain(
        "navbar-dropdown-anchor"
      );
    }
  });

  it.each([
    ["/lobbies", "Play"],
    ["/game", "Play"],
    ["/", "Home"],
    ["/cards", "Cards"],
    ["/sets", "Cards"],
    ["/decks", "Decks"],
    ["/decks/new", "Decks"],
  ])(
    "renders the sole active section and aria-current for %s",
    (pathname, accessibleName) => {
      mocks.pathname = pathname;
      renderNavbar();

      const activeControl = screen.getByRole("link", { name: accessibleName });

      expect(activeControl.getAttribute("aria-current")).toBe("page");
      expect(activeControl.className).toContain("bg-surface-2");
      expect(activeControl.className).toContain("text-gold-600");

      const inactiveControls = [
        screen.getByRole("link", { name: "Play" }),
        screen.getByRole("link", { name: "Home" }),
        screen.getByRole("link", { name: "Decks" }),
        screen.getByRole("link", { name: "Cards" }),
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
    renderNavbar();

    const play = screen.getByRole("link", { name: "Play" });

    expect(play.className).not.toContain("bg-gold-500");
    expect(play.className).toContain("bg-surface-2");
    expect(play.className).toContain("text-gold-600");
  });

  it("uses the reserved gold border token for the nav divider", () => {
    const { container } = renderNavbar();

    expect(container.querySelector("nav")?.className).toContain(
      "border-border-accent"
    );
  });

  it("mounts no navigation-menu viewport now that the link row opens nothing", () => {
    renderNavbar();

    const linksScroller = document.querySelector(
      '[data-slot="navbar-links-scroller"]'
    );

    expect(linksScroller).not.toBeNull();
    // The bar's own NavigationMenu runs in `viewport={false}` mode, so there is
    // no absolutely positioned measuring box left to keep out of the
    // overflow-clipping scroller — and nothing to anchor to a trigger.
    expect(
      document.querySelector('[data-slot="navigation-menu-viewport"]')
    ).toBeNull();
  });

  it("renders the one remaining navbar menu through the shared rectangular surface", () => {
    renderNavbar();

    // Only the account menu hangs off the bar now (OPT-680 removed Decks and
    // Cards), and it must still route through NavbarDropdownSurface rather than
    // painting its own panel.
    const surfaces = document.querySelectorAll(
      '[data-slot="navbar-dropdown-surface"]'
    );
    expect(surfaces).toHaveLength(1);
    for (const surface of surfaces) {
      const classes = (surface.getAttribute("class") ?? "").split(/\s+/);
      // Square corners: menu chrome takes no chamfer and no radius.
      expect(surface.getAttribute("data-cut")).toBeNull();
      expect(classes).toContain("border");
      expect(classes.some((c) => c.startsWith("rounded"))).toBe(false);
    }
  });

  it("gives dropdown rows the body type role rather than the navbar link treatment", () => {
    renderNavbar();

    // `.font-nav` (uppercase Erode 700) is reserved for the global navbar link
    // row; menu items take the `body` role per TYPOGRAPHY.md §5.
    const item = screen.getByRole("link", { name: "Profile" });
    const classes = item.className.split(/\s+/);

    expect(classes).toContain("text-sm");
    expect(classes).not.toContain("font-nav");
    expect(classes).not.toContain("text-base");
    expect(classes).toContain("focus-visible:outline-2");
    expect(classes).not.toContain("focus-visible:ring-2");
  });

  it("renders nav links as full-height square sections that meet both bar edges", () => {
    renderNavbar();

    const scroller = document.querySelector(
      '[data-slot="navbar-links-scroller"]'
    );
    const list = document.querySelector('[data-slot="navigation-menu-list"]');
    const item = document.querySelector('[data-slot="navigation-menu-item"]');
    const link = screen.getByRole("link", { name: "Home" });
    const linkClasses = link.className.split(/\s+/);

    // OPT-681: the height chain has to be unbroken from the bar down to the
    // link, or the hover/active fill floats inside the bar as a pill again.
    for (const element of [scroller, list, item]) {
      expect(element?.className.split(/\s+/)).toContain("h-full");
    }
    // Radix wraps the list's <ul> in an inline-styled indicator-track <div>
    // that accepts no className; without this the chain breaks there and every
    // h-full below resolves to auto.
    expect(scroller?.className.split(/\s+/)).toContain("[&>div]:h-full");
    expect(linkClasses).toContain("h-full");
    expect(linkClasses).not.toContain("h-9");

    // Square: a section that meets both edges has no corner left to round.
    expect(linkClasses).toContain("rounded-none");
    expect(linkClasses.some((c) => /^rounded-(?!none)/.test(c))).toBe(false);

    // Exact vertical centering of the label inside the full-height block.
    expect(linkClasses).toContain("flex");
    expect(linkClasses).toContain("items-center");

    // No gap between sections — the nav background must not show through as a
    // seam between two adjacent blocks.
    const listClasses = list?.className.split(/\s+/) ?? [];
    expect(listClasses.some((c) => /^gap-(?!0$)/.test(c))).toBe(false);
  });

  it("keeps a focus indicator that survives inside a full-height section", () => {
    renderNavbar();

    const classes = screen
      .getByRole("link", { name: "Home" })
      .className.split(/\s+/);

    // The inset outline from the shared trigger style draws inside the block,
    // so it stays visible even where the section meets the bar's edges.
    expect(classes).toContain("navigation-trigger");
    // Tailwind v4: `outline-none` sets `--tw-outline-style: none` and would
    // defeat every `focus-visible:outline-*` utility for good.
    expect(classes).not.toContain("outline-none");
    expect(classes).not.toContain("focus-visible:outline-none");
  });

  it("spans the nav content edge to edge so the actions pin to the viewport", () => {
    const { container } = renderNavbar();
    const nav = container.querySelector("nav");
    const navContent = document.querySelector('[data-slot="navbar-content"]');

    // Links hug the left edge and the account cluster hugs the right edge —
    // no content cap and no column reservation may pull them back in.
    expect(navContent?.className.split(/\s+/)).not.toContain("max-w-7xl");
    expect(navContent?.className.split(/\s+/)).not.toContain("mx-auto");
    expect(navContent?.parentElement).toBe(nav);
  });

  it("takes its height from the shared navbar token the friends rail offsets from", () => {
    const { container } = renderNavbar();
    const classes = container.querySelector("nav")?.className.split(/\s+/);

    // `--spacing-navbar` is the single source for the bar height and the
    // rail's `top-navbar` offset; a literal `h-16` would let them drift.
    expect(classes).toContain("h-navbar");
    expect(classes).not.toContain("h-16");
  });

  it("never reserves the friends rail column — the actions sit above the rail", () => {
    const { container, rerender } = renderNavbar();
    const railReserved = () =>
      container
        .querySelector("nav")
        ?.className.split(/\s+/)
        .includes("pr-social-rail") ?? false;

    // The rail starts below the bar (`top-navbar`), so even with the rail
    // mounted the account cluster keeps the viewport's right edge.
    expect(railReserved()).toBe(false);

    mocks.sessionStatus = "loading";
    rerender(<Navbar />);
    expect(railReserved()).toBe(false);

    mocks.sessionStatus = "unauthenticated";
    rerender(<Navbar />);
    expect(railReserved()).toBe(false);
  });

  it("carries a friends toggle that only exists below the md breakpoint", async () => {
    renderNavbar();

    const toggle = screen.getByRole("button", { name: "Friends" });

    // `md:hidden`, not a JS branch: at and above 768px the rail is docked in
    // its own column, so a control that opens it would duplicate what is
    // already on screen (OPT-663).
    expect(toggle.className.split(/\s+/)).toContain("md:hidden");
    expect(toggle.getAttribute("aria-haspopup")).toBe("dialog");
    expect(toggle.getAttribute("aria-controls")).toBe("friends-drawer");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("omits the friends toggle for signed-out visitors", () => {
    mocks.sessionStatus = "unauthenticated";
    renderNavbar();

    expect(screen.queryByRole("button", { name: "Friends" })).toBeNull();
  });

  it("reflects realtime unread counts, caps at 9+, and omits a zero badge", () => {
    mocks.unreadCount = 4;
    const { rerender } = renderNavbar();
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
    renderNavbar();

    expect(screen.getByRole("link", { name: "Profile" })).toBeDefined();
    expect(screen.getByText("Theme")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeDefined();
  });

  it("renders the production bell as a popup trigger", () => {
    renderNavbar();
    const bell = screen.getByRole("button", {
      name: "Notifications, No unread notifications",
    });

    expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    expect(bell.hasAttribute("aria-controls")).toBe(true);
  });

  it("keeps the same reserved action slot across auth resolution", () => {
    mocks.sessionStatus = "loading";
    const { rerender } = renderNavbar();
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
    renderNavbar();

    expect(
      screen.getByRole("button", { name: "Account menu for Pirate" })
    ).toBeDefined();
    expect(screen.getByLabelText("Theme: Default")).toBeDefined();
  });

  it("removes actions safely when an authenticated session expires", () => {
    const { rerender } = renderNavbar();
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
    renderNavbar();

    expect(screen.queryByRole("button", { name: /notifications/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /account menu/i })).toBeNull();
  });
});
