import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => children;
  const Button = ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  );
  return {
    AlertDialog: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="concede-dialog-root">{children}</div>
    ),
    AlertDialogAction: Button,
    AlertDialogCancel: Button,
    AlertDialogContent: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
    DropdownMenu: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuItem: Button,
  };
});

import { NavMenu } from "./nav-menu";

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("NavMenu spectator-safe actions", () => {
  it("keeps leave available without rendering a concede affordance", () => {
    act(() => {
      renderer = create(<NavMenu onLeave={vi.fn()} matchClosed={false} />);
    });

    const buttonText = renderer!.root
      .findAllByType("button")
      .map((button) => button.children.join(""));
    expect(buttonText).toContain("← Back to Lobbies");
    expect(buttonText).not.toContain("Concede");
    expect(
      renderer!.root.findAllByProps({
        "data-testid": "concede-dialog-root",
      })
    ).toHaveLength(0);
  });

  it("labels the spectator action as Stop spectating", () => {
    act(() => {
      renderer = create(
        <NavMenu onLeave={vi.fn()} matchClosed={false} spectator />
      );
    });

    const buttonText = renderer!.root
      .findAllByType("button")
      .map((button) => button.children.join(""));
    expect(buttonText).toContain("Stop spectating");
    expect(buttonText).not.toContain("← Back to Lobbies");
  });

  it("mounts the concede dialog policy only when concession is available", () => {
    act(() => {
      renderer = create(
        <NavMenu onLeave={vi.fn()} onConcede={vi.fn()} matchClosed={false} />
      );
    });

    expect(
      renderer!.root.findAllByProps({
        "data-testid": "concede-dialog-root",
      })
    ).toHaveLength(1);
  });
});
