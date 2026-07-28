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
