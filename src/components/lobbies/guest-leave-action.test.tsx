import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

  it("reports failure and still returns to the lobby browser", async () => {
    const error = new Error("stale lobby");
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
    expect(returnToBrowser).toHaveBeenCalledOnce();
  });
});
