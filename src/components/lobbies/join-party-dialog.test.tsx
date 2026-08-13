import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react");
  const OpenContext = React.createContext(false);
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    Dialog: ({
      children,
      open,
    }: {
      children?: ReactNode;
      open?: boolean;
    }) => (
      <OpenContext.Provider value={Boolean(open)}>
        {children}
      </OpenContext.Provider>
    ),
    DialogContent: ({ children }: { children?: ReactNode }) =>
      React.useContext(OpenContext) ? (
        <div data-testid="join-dialog">{children}</div>
      ) : null,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogTrigger: Wrapper,
  };
});

vi.mock("./party-switch-confirmation", () => ({
  PartySwitchConfirmation: () => null,
  partySwitchDetailsFromError: () => null,
}));

import { JoinPartyDialog } from "./join-party-dialog";

let renderer: ReactTestRenderer | null = null;

function dialogIsOpen() {
  return Boolean(
    renderer?.root.findAll(
      (node) => node.props["data-testid"] === "join-dialog"
    ).length
  );
}

beforeEach(() => {
  mocks.apiPost.mockReset();
  mocks.push.mockReset();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("JoinPartyDialog active-match gating", () => {
  it("uses the large button size for the join action", async () => {
    await act(async () => {
      renderer = create(<JoinPartyDialog />);
    });

    const joinButton = renderer?.root.find(
      (node) => node.type === "button" && node.props.children
    );
    expect(joinButton?.props.size).toBe("lg");
    expect(joinButton?.props.className).toBeUndefined();
  });

  it("closes an open join dialog when the action becomes disabled", async () => {
    await act(async () => {
      renderer = create(
        <JoinPartyDialog initialCode="ABC123" disabled={false} />
      );
    });
    expect(dialogIsOpen()).toBe(true);

    await act(async () => {
      renderer?.update(
        <JoinPartyDialog initialCode="ABC123" disabled={true} />
      );
    });

    expect(dialogIsOpen()).toBe(false);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it("does not auto-open an initial join code while disabled", async () => {
    await act(async () => {
      renderer = create(
        <JoinPartyDialog initialCode="ABC123" disabled={true} />
      );
    });

    expect(dialogIsOpen()).toBe(false);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });
});
