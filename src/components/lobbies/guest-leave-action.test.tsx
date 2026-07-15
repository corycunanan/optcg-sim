import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { GuestLeaveAction, runGuestLeave } from "./guest-leave-action";

describe("GuestLeaveAction", () => {
  it("shows an explicit leave action to a guest", () => {
    const markup = renderToStaticMarkup(
      <GuestLeaveAction isGuest leaving={false} onLeave={vi.fn()} />
    );

    expect(markup).toContain("Leave Lobby");
  });

  it("renders no host action", () => {
    const markup = renderToStaticMarkup(
      <GuestLeaveAction isGuest={false} leaving={false} onLeave={vi.fn()} />
    );

    expect(markup).toBe("");
  });

  it("disables the action while a leave request is pending", () => {
    const markup = renderToStaticMarkup(
      <GuestLeaveAction isGuest leaving onLeave={vi.fn()} />
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
