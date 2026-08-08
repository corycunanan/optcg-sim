import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
    </button>
  ),
}));

import { GuestLeaveMenuItem, runGuestLeave } from "./guest-leave-action";

describe("GuestLeaveMenuItem", () => {
  it("offers the guest a leave entry for the seat overflow menu", () => {
    const markup = renderToStaticMarkup(
      <GuestLeaveMenuItem leaving={false} onLeave={vi.fn()} />
    );

    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain("Leave lobby");
  });

  it("disables the entry while a leave request is pending", () => {
    const markup = renderToStaticMarkup(
      <GuestLeaveMenuItem leaving onLeave={vi.fn()} />
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("Leaving...");
  });

  it("reports success and returns to the lobby browser", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const returnToBrowser = vi.fn();

    await runGuestLeave({
      leave: vi.fn().mockResolvedValue(undefined),
      onSuccess,
      onError,
      returnToBrowser,
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(returnToBrowser).toHaveBeenCalledOnce();
  });

  it.each([
    ["rate-limited", new ApiError("Too many requests", 429)],
    ["already-started", new ApiError("Lobby already started", 409)],
    ["server", new ApiError("Failed to leave lobby", 500)],
  ])("reports a %s failure and stays in the lobby", async (_label, error) => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const returnToBrowser = vi.fn();

    await runGuestLeave({
      leave: vi.fn().mockRejectedValue(error),
      onSuccess,
      onError,
      returnToBrowser,
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);
    expect(returnToBrowser).not.toHaveBeenCalled();
  });

  it("returns to the browser when the lobby or seat is already gone", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const returnToBrowser = vi.fn();

    await runGuestLeave({
      leave: vi.fn().mockRejectedValue(new ApiError("Lobby not found", 404)),
      onSuccess,
      onError,
      returnToBrowser,
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(returnToBrowser).toHaveBeenCalledOnce();
  });
});
