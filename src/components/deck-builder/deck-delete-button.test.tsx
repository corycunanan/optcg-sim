import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
  apiDelete: mocks.apiDelete,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

  return {
    DropdownMenu: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuGroup: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuItem: ({
      children,
      className,
      onSelect,
      variant,
    }: {
      children: ReactNode;
      className?: string;
      onSelect?: () => void;
      variant?: string;
    }) => (
      <button
        type="button"
        className={className}
        data-variant={variant}
        onClick={onSelect}
      >
        {children}
      </button>
    ),
  };
});

vi.mock("@/components/ui/alert-dialog", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

  return {
    AlertDialog: ({
      children,
      open,
    }: {
      children: ReactNode;
      open?: boolean;
    }) => (open ? <section role="alertdialog">{children}</section> : null),
    AlertDialogAction: ({
      children,
      disabled,
      onClick,
    }: {
      children: ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    AlertDialogCancel: ({
      children,
      disabled,
    }: {
      children: ReactNode;
      disabled?: boolean;
    }) => (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    ),
    AlertDialogContent: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
  };
});

import { DeckDeleteButton } from "./deck-delete-button";

let renderer: ReactTestRenderer | null = null;

function buttonWithText(text: string) {
  return renderer!.root
    .findAllByType("button")
    .find((button) => button.children.some((child) => child === text));
}

async function renderDeleteButton() {
  await act(async () => {
    renderer = create(
      <DeckDeleteButton deckId="deck-1" deckName="Straw Hat Deck" />
    );
  });
}

beforeEach(() => {
  mocks.apiDelete.mockReset();
  mocks.refresh.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("DeckDeleteButton", () => {
  it("renders 48px menu touch targets and keeps the trigger keyboard reachable", async () => {
    await renderDeleteButton();

    const trigger = renderer!.root
      .findAllByType("button")
      .find(
        (button) =>
          button.props["aria-label"] === "More actions for Straw Hat Deck"
      );

    expect(trigger).toBeDefined();
    expect(trigger?.props.type).toBe("button");
    expect(trigger?.props.tabIndex).not.toBe(-1);
    expect(trigger?.props.className).toContain("size-12");
    expect(trigger?.props.className).toContain("opacity-100");
    expect(trigger?.props.className).toContain("focus-visible:opacity-100");

    const deleteItem = buttonWithText("Delete deck");
    expect(deleteItem?.props.className).toContain("min-h-12");
    expect(deleteItem?.props.className).toContain("min-w-12");
  });

  it("surfaces a toast when deleting the deck fails", async () => {
    mocks.apiDelete.mockRejectedValueOnce(new Error("offline"));
    await renderDeleteButton();

    await act(async () => buttonWithText("Delete deck")?.props.onClick());

    const deleteAction = buttonWithText("Delete");
    expect(deleteAction).toBeDefined();

    await act(async () => deleteAction?.props.onClick());

    expect(mocks.apiDelete).toHaveBeenCalledWith("/api/decks/deck-1");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't delete that deck. Try again."
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
