// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { NavbarDropdownSurface } from "./navbar-dropdown-surface";

afterEach(cleanup);

/**
 * A controlled navigation menu shaped like the real Decks/Cards dropdowns:
 * viewport mode, one trigger, one linked row inside a NavbarDropdownSurface.
 * Controlled so Radix's own close timer is observable — it calls the value
 * setter, which this wrapper applies.
 */
function MenuHarness({ viewport = true }: { viewport?: boolean }) {
  const [value, setValue] = useState("decks");

  return (
    <NavigationMenu value={value} onValueChange={setValue} viewport={viewport}>
      <NavigationMenuList>
        <NavigationMenuItem value="decks">
          <NavigationMenuTrigger>Decks</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavbarDropdownSurface>
              <ul className="flex w-48 flex-col p-1">
                <li>
                  <NavigationMenuLink href="/decks">
                    Decks
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavbarDropdownSurface>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

const classesOf = (element: Element | null) =>
  (element?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("NavbarDropdownSurface", () => {
  it("paints the square-cornered, neutral-edged panel the material language specifies", () => {
    render(
      <NavbarDropdownSurface>
        <span>Row</span>
      </NavbarDropdownSurface>
    );

    const root = document.querySelector(
      '[data-slot="navbar-dropdown-surface"]'
    );
    expect(root).not.toBeNull();
    // A plain rectangle with one neutral hairline — the chamfered silhouette
    // is reserved for cards on page surfaces, never menu chrome. Declared once
    // here so the four navbar panels cannot drift apart.
    expect(root?.getAttribute("data-cut")).toBeNull();
    expect(root?.querySelector('[data-slot="chamfer-surface"]')).toBeNull();

    const surface = classesOf(root);
    // Flat, opaque overlay interior. No ring, no shadow, no blur, no radius.
    expect(surface).toContain("bg-popover");
    expect(surface).toContain("border");
    expect(surface).toContain("border-border");
    expect(
      surface.some((c) => /^(ring|shadow|backdrop-blur|rounded)/.test(c))
    ).toBe(false);
  });

  it("bridges the gap below the navbar with padding so hover menus survive the crossing", () => {
    render(<MenuHarness />);

    const content = document.querySelector(
      '[data-slot="navigation-menu-content"]'
    );
    const viewport = document.querySelector(
      '[data-slot="navigation-menu-viewport"]'
    );
    const contentClasses = classesOf(content);

    // The offset below the navbar must live INSIDE the content's own box.
    // A margin would leave dead space between the trigger and the element that
    // cancels Radix's 150ms close timer, so a pointer crossing it at ordinary
    // speed would close the menu before reaching the rows.
    expect(contentClasses).toContain("pt-4");
    expect(contentClasses.some((c) => /^m[tby]?-/.test(c))).toBe(false);
    expect(classesOf(viewport).some((c) => /^m[tby]?-/.test(c))).toBe(false);
  });

  it("keeps a hover-opened menu open when the pointer moves onto the panel", () => {
    vi.useFakeTimers();
    try {
      render(<MenuHarness />);

      const trigger = screen.getByRole("button", { name: "Decks" });
      const viewport = document.querySelector(
        '[data-slot="navigation-menu-viewport"]'
      ) as HTMLElement;

      // Leaving the trigger arms Radix's close timer...
      fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
      // ...and entering the panel's own box has to cancel it.
      fireEvent.pointerEnter(viewport, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByRole("link", { name: "Decks" })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still closes when the pointer leaves without reaching the panel", () => {
    vi.useFakeTimers();
    try {
      render(<MenuHarness />);

      const trigger = screen.getByRole("button", { name: "Decks" });
      fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.queryByRole("link", { name: "Decks" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets dropdown rows draw the inset focus outline the navbar standardized on", () => {
    render(<MenuHarness viewport={false} />);

    const content = document.querySelector(
      '[data-slot="navigation-menu-content"]'
    );
    const contentClasses = classesOf(content);

    // These two suppressors used to kill the outline on every descendant link,
    // which is why the ring idiom was load-bearing in the dropdowns.
    expect(
      contentClasses.some((c) =>
        c.includes("navigation-menu-link]:focus:ring-0")
      )
    ).toBe(false);
    expect(
      contentClasses.some((c) =>
        c.includes("navigation-menu-link]:focus:outline-none")
      )
    ).toBe(false);

    const link = classesOf(screen.getByRole("link", { name: "Decks" }));
    expect(link).toContain("focus-visible:outline-2");
    expect(link).toContain("focus-visible:-outline-offset-2");
    expect(link).toContain("focus-visible:outline-border-focus");
    // Tailwind v4: `outline-none` sets --tw-outline-style:none and would defeat
    // the outline utilities above for good.
    expect(link).not.toContain("outline-none");
    // Rows square off inside the panel — ornament sits on the panel's
    // perimeter, never on the rows within it.
    expect(link).toContain(
      "in-data-[slot=navigation-menu-content]:rounded-none"
    );
  });

  it("leaves the content and viewport as transparent shells that paint nothing", () => {
    render(<MenuHarness />);

    for (const slot of [
      "navigation-menu-content",
      "navigation-menu-viewport",
    ]) {
      const classes = classesOf(
        document.querySelector(`[data-slot="${slot}"]`)
      );
      for (const painted of [
        "bg-popover",
        "rounded-lg",
        "shadow",
        "ring-1",
        "ring-foreground/10",
      ]) {
        expect(classes).not.toContain(painted);
      }
    }
  });
});
