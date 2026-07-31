// @vitest-environment jsdom

import type { ComponentProps } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/decks",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "unauthenticated",
    data: null,
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

vi.mock("@/components/nav/navbar-account-menu", () => ({
  NavbarAccountMenu: () => null,
}));

vi.mock("@/components/nav/navbar-notification-panel", () => ({
  NavbarNotificationPanel: () => null,
}));

import { Navbar } from "./navbar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function classTokens(element: Element): string[] {
  return element.className.split(/\s+/).filter(Boolean);
}

function clippingAncestors(element: Element, boundary: Element): Element[] {
  const overflowPattern = /^overflow(?:-[xy])?-(?:auto|clip|hidden|scroll)$/;
  const matches: Element[] = [];
  let ancestor = element.parentElement;

  while (ancestor && ancestor !== boundary) {
    if (classTokens(ancestor).some((token) => overflowPattern.test(token))) {
      matches.push(ancestor);
    }
    ancestor = ancestor.parentElement;
  }

  return matches;
}

describe("Navbar layout structure", () => {
  it("keeps the real shared viewport outside every clipping ancestor", async () => {
    class ResizeObserverMock {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        this.callback(
          [{ target } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }

      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "Decks" }));

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="navigation-menu-viewport"]')
      ).not.toBeNull();
    });

    const navContent = document.querySelector('[data-slot="navbar-content"]');
    const nav = navContent?.parentElement;
    const viewport = document.querySelector(
      '[data-slot="navigation-menu-viewport"]'
    );
    const content = document.querySelector(
      '[data-slot="navigation-menu-content"]'
    );
    const linksScroller = document.querySelector(
      "[data-navbar-links-scroller]"
    );

    expect(nav).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(content).not.toBeNull();
    expect(linksScroller).not.toBeNull();
    expect(linksScroller?.contains(viewport)).toBe(false);
    expect(viewport?.contains(content)).toBe(true);
    expect(clippingAncestors(viewport!, nav!)).toEqual([]);
  });

  it("declares the centered max-width contract on the inner container", () => {
    render(<Navbar />);

    const navContent = document.querySelector('[data-slot="navbar-content"]');
    const nav = navContent?.parentElement;

    expect(navContent?.parentElement).toBe(nav);
    expect(classTokens(navContent!)).toEqual(
      expect.arrayContaining(["mx-auto", "w-full", "max-w-7xl"])
    );
    expect(classTokens(nav!)).not.toContain("max-w-7xl");
  });
});
