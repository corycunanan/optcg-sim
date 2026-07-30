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
});
