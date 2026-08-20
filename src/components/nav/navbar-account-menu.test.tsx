// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mocks.signOut(...args),
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

import { NavbarAccountMenu } from "./navbar-account-menu";

afterEach(() => {
  cleanup();
  mocks.signOut.mockReset();
});

describe("NavbarAccountMenu", () => {
  it("opens from the keyboard and exposes every account action", async () => {
    const user = userEvent.setup();
    render(
      <NavbarAccountMenu
        user={{ username: "luffy", name: "Luffy", image: null }}
        theme="default"
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Account menu for luffy",
    });
    expect(trigger.textContent).toContain("luffy");
    trigger.focus();
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Profile" })).toBeDefined();
    expect(screen.getByLabelText("Theme: Default")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("defaults partial user and theme data without crashing", async () => {
    const user = userEvent.setup();
    render(<NavbarAccountMenu user={{}} />);

    const trigger = screen.getByRole("button", {
      name: "Account menu for Pirate",
    });
    expect(trigger.textContent).toContain("Pirate");
    trigger.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Theme: Default")).toBeDefined();
  });

  it("constrains and responsively hides the longest permitted username", () => {
    const longestUsername = "WWWWWWWWWWWWWWWWWWWW";
    render(<NavbarAccountMenu user={{ username: longestUsername }} />);

    const label = screen.getByText(longestUsername);

    expect(label.getAttribute("data-slot")).toBe("navbar-account-name");
    expect(label.className).toContain("hidden");
    expect(label.className).toContain("sm:block");
    expect(label.className).toContain("max-w-16");
    expect(label.className).toContain("sm:max-w-24");
    expect(label.className).toContain("lg:max-w-40");
    expect(label.className).toContain("truncate");
    expect(
      screen.getByRole("button", {
        name: `Account menu for ${longestUsername}`,
      })
    ).toBeDefined();
  });

  it("right-aligns the menu panel to its account trigger", async () => {
    const user = userEvent.setup();
    render(<NavbarAccountMenu user={{ username: "luffy" }} />);

    const trigger = screen.getByRole("button", {
      name: "Account menu for luffy",
    });
    expect(trigger.className.split(/\s+/)).not.toContain(
      "focus-visible:ring-2"
    );
    trigger.focus();
    await user.keyboard("{Enter}");

    const content = document.querySelector(
      '[data-slot="navigation-menu-content"]'
    );
    expect(content?.className).toContain("right-0");
    expect(content?.className).toContain("left-auto");
  });

  it("paints the open slab through a selector Radix actually matches (OPT-712)", async () => {
    const user = userEvent.setup();
    render(<NavbarAccountMenu user={{ username: "luffy" }} />);

    const trigger = screen.getByRole("button", {
      name: "Account menu for luffy",
    });

    expect(trigger.getAttribute("data-state")).toBe("closed");

    trigger.focus();
    await user.keyboard("{Enter}");

    // The attribute half of the contract. `@radix-ui/react-navigation-menu`
    // writes `data-state="open"` and nothing else — no `data-open`, no
    // `data-popup-open` — so asserting the class string alone would pass with a
    // selector that never matches.
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(trigger.matches('[data-state="open"]')).toBe(true);
    expect(trigger.hasAttribute("data-open")).toBe(false);
    expect(trigger.hasAttribute("data-popup-open")).toBe(false);

    // The class half. Tailwind v4 compiles `data-open:` to `[data-open]`, an
    // attribute-presence selector, so the short form is dead on this element;
    // only the explicit `data-[state=open]:` form paints.
    const classes = trigger.className.split(/\s+/);
    for (const live of [
      "data-[state=open]:bg-surface-2",
      "data-[state=open]:text-content-inverse",
      "data-[state=open]:hover:bg-surface-2",
      "data-[state=open]:focus:bg-surface-2",
    ]) {
      expect(classes).toContain(live);
    }
    // Nothing this component contributes may rely on the dead short form.
    const ownVariants = classes.filter(
      (c) => c.startsWith("data-open:") || c.startsWith("data-popup-open:")
    );
    for (const dead of ownVariants) {
      expect(dead).toContain("bg-muted");
    }
  });

  it("renders through the shared rectangular surface with body-role rows", async () => {
    const user = userEvent.setup();
    render(<NavbarAccountMenu user={{ username: "luffy" }} />);

    const trigger = screen.getByRole("button", {
      name: "Account menu for luffy",
    });
    trigger.focus();
    await user.keyboard("{Enter}");

    const surface = document.querySelector(
      '[data-slot="navbar-dropdown-surface"]'
    );
    expect(surface).not.toBeNull();
    // Square corners: menu chrome takes no chamfer and no radius.
    expect(surface?.getAttribute("data-cut")).toBeNull();
    const surfaceClasses = (surface?.getAttribute("class") ?? "").split(/\s+/);
    expect(surfaceClasses).toContain("border");
    expect(surfaceClasses.some((c) => c.startsWith("rounded"))).toBe(false);

    // The content is a bare positioning shell — it paints no panel of its own.
    const content = document.querySelector(
      '[data-slot="navigation-menu-content"]'
    );
    const contentClasses = (content?.className ?? "").split(/\s+/);
    for (const painted of [
      "border",
      "border-border",
      "bg-surface-nav",
      "ring-0",
    ]) {
      expect(contentClasses).not.toContain(painted);
    }

    const item = screen
      .getByRole("link", { name: "Profile" })
      .className.split(/\s+/);
    expect(item).toContain("text-sm");
    expect(item).toContain("focus-visible:outline-2");
    expect(item).toContain("focus-visible:-outline-offset-2");
    expect(item).not.toContain("focus-visible:ring-2");
    expect(item).not.toContain("rounded-md");
  });
});
