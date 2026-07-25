import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  closeLobbyImpactCopy,
  HostCloseAction,
  runHostClose,
} from "./host-close-action";

describe("HostCloseAction", () => {
  it("shows an explicit host close action for an eligible PVP lobby", () => {
    const markup = renderToStaticMarkup(
      <HostCloseAction
        canClose
        guestName={null}
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Disband party");
  });

  it("renders no action for excluded lobby lifecycles", () => {
    const markup = renderToStaticMarkup(
      <HostCloseAction
        canClose={false}
        guestName={null}
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(markup).toBe("");
  });

  it("names the impact on a seated guest in confirmation copy", () => {
    expect(closeLobbyImpactCopy("Guest Player")).toBe(
      "This will disband your party, cancel outstanding invites, and return Guest Player to the lobby browser. This cannot be undone."
    );
  });

  it("reports success and returns the host to the lobby browser", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const returnToBrowser = vi.fn();

    await runHostClose({
      close: vi.fn().mockResolvedValue(undefined),
      onSuccess,
      onError,
      returnToBrowser,
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(returnToBrowser).toHaveBeenCalledOnce();
  });

  it("treats an already-closed 404 as the desired terminal outcome", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const returnToBrowser = vi.fn();

    await runHostClose({
      close: vi.fn().mockRejectedValue(new ApiError("Lobby not found", 404)),
      onSuccess,
      onError,
      returnToBrowser,
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(returnToBrowser).toHaveBeenCalledOnce();
  });

  it("keeps the host in the room when close loses the start race", async () => {
    const error = new ApiError("Lobby already started", 409);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const returnToBrowser = vi.fn();

    await runHostClose({
      close: vi.fn().mockRejectedValue(error),
      onSuccess,
      onError,
      returnToBrowser,
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);
    expect(returnToBrowser).not.toHaveBeenCalled();
  });
});
