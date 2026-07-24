import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuItem: ({
      children,
      onSelect,
      variant,
    }: {
      children: ReactNode;
      onSelect?: () => void;
      variant?: string;
    }) => (
      <button type="button" data-variant={variant} onClick={onSelect}>
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
      variant,
    }: {
      children: ReactNode;
      disabled?: boolean;
      onClick?: (event: { preventDefault: () => void }) => void;
      variant?: string;
    }) => (
      <button
        type="button"
        data-variant={variant}
        disabled={disabled}
        onClick={() => onClick?.({ preventDefault: vi.fn() })}
      >
        {children}
      </button>
    ),
    AlertDialogCancel: Wrapper,
    AlertDialogContent: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
  };
});

import { KickPlayerAction } from "./kick-player-action";

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("KickPlayerAction", () => {
  it("opens a destructive confirmation from the occupied-seat menu", async () => {
    await act(async () => {
      renderer = create(
        <KickPlayerAction playerName="Zoro" kicking={false} onKick={vi.fn()} />
      );
    });

    const menuItem = renderer!.root
      .findAllByType("button")
      .find((button) => button.props["data-variant"] === "destructive");
    await act(async () => menuItem?.props.onClick());

    const dialog = renderer!.root.findByProps({ role: "alertdialog" });
    expect(dialog).toBeDefined();
    expect(JSON.stringify(renderer!.toJSON())).toContain("reopen the guest seat");
  });

  it("runs the kick action from the destructive confirmation", async () => {
    const onKick = vi.fn();
    await act(async () => {
      renderer = create(
        <KickPlayerAction playerName="Zoro" kicking={false} onKick={onKick} />
      );
    });

    const buttons = () => renderer!.root.findAllByType("button");
    const menuItem = buttons().find(
      (button) => button.props["data-variant"] === "destructive"
    );
    await act(async () => menuItem?.props.onClick());

    const destructiveButtons = buttons().filter(
      (button) => button.props["data-variant"] === "destructive"
    );
    const confirm = destructiveButtons.at(-1);
    await act(async () => confirm?.props.onClick());

    expect(onKick).toHaveBeenCalledOnce();
  });
});
