// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavbarNotificationBell } from "./navbar-notification-bell";

afterEach(() => cleanup());

describe("NavbarNotificationBell", () => {
  it("is a non-interactive count indicator without an activation handler", () => {
    render(<NavbarNotificationBell unreadCount={3} />);

    const indicator = screen.getByRole("status", {
      name: "Notifications, 3 unread notifications",
    });
    expect(indicator.tabIndex).toBe(-1);
    expect(screen.queryByRole("button", { name: /notifications/i })).toBeNull();
  });

  it("is keyboard operable through the OPT-528 activation seam", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <NavbarNotificationBell
        unreadCount={3}
        onActivate={onActivate}
        popupOpen
        popupControls="notifications-panel"
      />
    );

    const bell = screen.getByRole("button", {
      name: "Notifications, 3 unread notifications",
    });
    bell.focus();
    await user.keyboard(" ");

    expect(document.activeElement).toBe(bell);
    expect(onActivate).toHaveBeenCalledOnce();
    expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(bell.getAttribute("aria-controls")).toBe("notifications-panel");
  });

  it("is a full-height square slab that holds its paint while the panel is open", () => {
    const { rerender } = render(
      <NavbarNotificationBell unreadCount={0} onActivate={vi.fn()} />
    );

    const restClasses = screen
      .getByRole("button", { name: /notifications/i })
      .className.split(/\s+/);

    // The links' geometry and interaction, verbatim (OPT-712).
    for (const shared of [
      "h-full",
      "rounded-none",
      "px-3",
      "sm:px-4",
      "transition-all",
      "hover:bg-surface-2",
      "hover:text-content-inverse",
      "focus:bg-surface-2",
      "focus:text-content-inverse",
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
    ]) {
      expect(restClasses).toContain(shared);
    }
    // Icons rest dimmer than the links and converge on hover, focus, and open.
    expect(restClasses).toContain("text-content-secondary");
    expect(restClasses).not.toContain("bg-surface-2");
    // The old compact-pill recipe is gone rather than overridden.
    expect(restClasses).not.toContain("size-10");
    expect(restClasses).not.toContain("rounded-md");

    rerender(
      <NavbarNotificationBell unreadCount={0} onActivate={vi.fn()} popupOpen />
    );

    const openClasses = screen
      .getByRole("button", { name: /notifications/i })
      .className.split(/\s+/);
    expect(openClasses).toContain("bg-surface-2");
    expect(openClasses).toContain("text-content-inverse");
    expect(openClasses).not.toContain("text-content-secondary");
  });

  it("keeps the badge pinned to the icon rather than the slab's corner", () => {
    render(
      <NavbarNotificationBell unreadCount={3} onActivate={vi.fn()} popupOpen />
    );

    const badge = document.querySelector(
      '[data-slot="notification-unread-badge"]'
    );
    const anchor = badge?.parentElement;

    // The badge's containing block is the icon's own 40px box inside the slab,
    // so widening or heightening the slab never drags the badge away from it.
    expect(anchor?.tagName).toBe("SPAN");
    expect(anchor?.className.split(/\s+/)).toContain("relative");
    expect(anchor?.className.split(/\s+/)).toContain("size-10");
    expect(anchor?.parentElement?.tagName).toBe("BUTTON");
  });

  it("leaves the non-interactive status variant hover-free", () => {
    render(<NavbarNotificationBell unreadCount={3} />);

    const classes = screen
      .getByRole("status", { name: /notifications/i })
      .className.split(/\s+/);

    expect(classes.some((c) => c.startsWith("hover:"))).toBe(false);
    expect(classes.some((c) => c.startsWith("focus:"))).toBe(false);
    expect(classes).not.toContain("cursor-pointer");
    expect(classes).not.toContain("h-full");
  });

  it("caps the visible badge at 9+ and omits it at zero", () => {
    const { rerender } = render(<NavbarNotificationBell unreadCount={12} />);

    expect(screen.getByText("9+")).toBeDefined();

    rerender(<NavbarNotificationBell unreadCount={0} />);

    expect(
      document.querySelector('[data-slot="notification-unread-badge"]')
    ).toBeNull();
    expect(
      screen.getByRole("status", {
        name: "Notifications, No unread notifications",
      })
    ).toBeDefined();
  });
});
