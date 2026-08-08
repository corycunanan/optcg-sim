import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    variant,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
    variant?: string;
  }) => (
    <button
      type="button"
      role="menuitem"
      data-variant={variant}
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/alert-dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    AlertDialog: ({
      children,
      open,
    }: {
      children?: ReactNode;
      open?: boolean;
    }) => (open ? <section role="alertdialog">{children}</section> : null),
    AlertDialogAction: Wrapper,
    AlertDialogCancel: Wrapper,
    AlertDialogContent: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
  };
});

import {
  closeLobbyImpactCopy,
  HostCloseConfirmDialog,
  HostCloseMenuItem,
  runHostClose,
} from "./host-close-action";

describe("HostCloseAction", () => {
  it("contributes a destructive disband entry to the seat overflow menu", () => {
    const markup = renderToStaticMarkup(
      <HostCloseMenuItem closing={false} onSelect={vi.fn()} />
    );

    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain('data-variant="destructive"');
    expect(markup).toContain("Disband party");
  });

  it("keeps the confirmation closed until the menu entry asks for it", () => {
    const markup = renderToStaticMarkup(
      <HostCloseConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        guestName={null}
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(markup).toBe("");
  });

  it("renders the confirmation outside the menu once opened", () => {
    const markup = renderToStaticMarkup(
      <HostCloseConfirmDialog
        open
        onOpenChange={vi.fn()}
        guestName="Guest Player"
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain("Guest Player");
    expect(markup).not.toContain('role="menuitem"');
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
