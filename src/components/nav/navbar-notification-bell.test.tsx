// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavbarNotificationBell } from "./navbar-notification-bell";

afterEach(() => cleanup());

describe("NavbarNotificationBell", () => {
  it("is keyboard operable through its controlled panel seam", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <NavbarNotificationBell
        unreadCount={3}
        open={false}
        onOpenChange={onOpenChange}
      />
    );

    const bell = screen.getByRole("button", { name: /notifications/i });
    bell.focus();
    await user.keyboard(" ");

    expect(document.activeElement).toBe(bell);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("3 unread notifications")).toBeDefined();
  });

  it("caps the visible badge at 9+ and omits it at zero", () => {
    const { rerender } = render(
      <NavbarNotificationBell
        unreadCount={12}
        open={false}
        onOpenChange={() => undefined}
      />
    );

    expect(screen.getByText("9+")).toBeDefined();

    rerender(
      <NavbarNotificationBell
        unreadCount={0}
        open={false}
        onOpenChange={() => undefined}
      />
    );

    expect(
      document.querySelector('[data-slot="notification-unread-badge"]')
    ).toBeNull();
    expect(screen.getByText("No unread notifications")).toBeDefined();
  });
});
