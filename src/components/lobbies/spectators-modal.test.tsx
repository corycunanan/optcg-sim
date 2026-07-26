import {
  forwardRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: ({
    user,
  }: {
    user: { username: string | null; name: string | null };
  }) => <span data-avatar>{user.username ?? user.name}</span>,
}));

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
  }) =>
    open ? (
      <div data-dialog-root onClick={() => onOpenChange(false)}>
        {children}
      </div>
    ) : null;
  const DialogContent = ({
    children,
    ...props
  }: ComponentProps<"section"> & {
    onOpenAutoFocus?: (event: { preventDefault: () => void }) => void;
    onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
    size?: string;
  }) => (
    <section data-dialog-content {...props}>
      {children}
    </section>
  );
  const DialogTitle = forwardRef<HTMLHeadingElement, ComponentProps<"h2">>(
    ({ children, ...props }, ref) => (
      <h2 ref={ref} {...props}>
        {children}
      </h2>
    )
  );
  DialogTitle.displayName = "DialogTitle";
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    Dialog,
    DialogContent,
    DialogDescription: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle,
  };
});

import { ApiError } from "@/lib/api-client";
import { LobbyActionResponseSchema } from "@/lib/validators/lobbies";
import { SpectatorsModal } from "./spectators-modal";

type Spectator = LobbyRoomState["spectators"][number];

const nami: Spectator = {
  id: "spectator/nami",
  username: "cat_burglar",
  name: "Nami",
  image: null,
};
const usopp: Spectator = {
  id: "spectator-usopp",
  username: null,
  name: "Usopp",
  image: null,
};

let renderer: ReactTestRenderer | null = null;
let titleFocus: ReturnType<typeof vi.fn>;
let returnFocus: ReturnType<typeof vi.fn>;
const onOpenChange = vi.fn();
const onRefresh = vi.fn<() => Promise<LobbyRoomState | null>>();

function renderModal({
  open = true,
  spectators = [nami, usopp],
  viewerRole = "host",
}: {
  open?: boolean;
  spectators?: Spectator[];
  viewerRole?: LobbyRoomState["viewerRole"];
} = {}) {
  const returnFocusRef = {
    current: { focus: returnFocus } as unknown as HTMLButtonElement,
  } as RefObject<HTMLButtonElement>;

  const element = (
    <SpectatorsModal
      lobbyId="lobby-1"
      open={open}
      spectatorCount={spectators.length}
      spectators={spectators}
      viewerRole={viewerRole}
      returnFocusRef={returnFocusRef}
      onOpenChange={onOpenChange}
      onRefresh={onRefresh}
    />
  );

  if (renderer) {
    renderer.update(element);
  } else {
    renderer = create(element, {
      createNodeMock: (node) =>
        node.type === "h2" ? { focus: titleFocus } : null,
    });
  }
}

function removeButtons() {
  return (
    renderer?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props["aria-label"] === "string" &&
        node.props["aria-label"].startsWith("Remove ")
    ) ?? []
  );
}

beforeEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  titleFocus = vi.fn();
  returnFocus = vi.fn();
  onOpenChange.mockReset();
  onRefresh.mockReset();
  onRefresh.mockResolvedValue(null);
  mocks.apiDelete.mockReset();
  mocks.toastError.mockReset();
});

describe("SpectatorsModal", () => {
  it("renders a semantic avatar list in server order with identifying host actions", () => {
    act(() => renderModal());

    const list = renderer?.root.findByProps({ "aria-label": "Spectators" });
    expect(list?.type).toBe("ul");
    expect(list?.findAllByType("li")).toHaveLength(2);
    expect(JSON.stringify(renderer?.toJSON())).toMatch(
      /cat_burglar.*Remove.*Usopp.*Remove/
    );
    expect(removeButtons().map((button) => button.props["aria-label"])).toEqual(
      ["Remove cat_burglar", "Remove Usopp"]
    );
    expect(
      removeButtons().every(
        (button) => button.props["data-variant"] === "destructive"
      )
    ).toBe(true);
  });

  it.each(["guest", "spectator"] as const)(
    "omits Remove from the accessible tree for a %s viewer",
    (viewerRole) => {
      act(() => renderModal({ viewerRole }));

      expect(removeButtons()).toHaveLength(0);
      expect(JSON.stringify(renderer?.toJSON())).not.toContain("Remove");
    }
  );

  it("reorders live rows without closing and transitions the last removal to empty", () => {
    act(() => renderModal());
    act(() => renderModal({ spectators: [usopp, nami] }));

    expect(JSON.stringify(renderer?.toJSON())).toMatch(
      /Usopp.*Remove.*cat_burglar.*Remove/
    );
    expect(
      renderer?.root.findByProps({ "data-dialog-root": true })
    ).toBeDefined();

    act(() => renderModal({ spectators: [] }));
    expect(JSON.stringify(renderer?.toJSON())).toContain(
      "No spectators watching yet"
    );
    expect(
      renderer?.root.findByProps({ "data-dialog-root": true })
    ).toBeDefined();
  });

  it("focuses the title on open and returns focus to the count button on close", () => {
    act(() => renderModal());
    const content = renderer?.root.findByProps({
      "data-dialog-content": true,
    });
    const openEvent = { preventDefault: vi.fn() };
    const closeEvent = { preventDefault: vi.fn() };

    act(() => content?.props.onOpenAutoFocus(openEvent));
    act(() => content?.props.onCloseAutoFocus(closeEvent));

    expect(openEvent.preventDefault).toHaveBeenCalledOnce();
    expect(titleFocus).toHaveBeenCalledOnce();
    expect(closeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(returnFocus).toHaveBeenCalledOnce();
  });

  it("forwards close changes from the dialog primitive", () => {
    act(() => renderModal());
    act(() =>
      renderer?.root.findByProps({ "data-dialog-root": true }).props.onClick()
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves focus to the title when the focused spectator leaves live", () => {
    act(() => renderModal());
    act(() => removeButtons()[0]?.props.onFocus());
    act(() => renderModal({ spectators: [usopp] }));

    expect(titleFocus).toHaveBeenCalledOnce();
  });

  it("does not move focus when an unfocused row leaves", () => {
    act(() => renderModal());
    act(() => renderModal({ spectators: [usopp] }));
    expect(titleFocus).not.toHaveBeenCalled();
  });

  it("does not move focus when the focused row survives a reorder", () => {
    act(() => renderModal());
    act(() => removeButtons()[0]?.props.onFocus());
    act(() => renderModal({ spectators: [usopp, nami] }));
    expect(titleFocus).not.toHaveBeenCalled();
  });

  it("does not move focus after the dialog closes", () => {
    act(() => renderModal());
    act(() => removeButtons()[0]?.props.onFocus());
    act(() => renderModal({ open: false, spectators: [usopp] }));
    expect(titleFocus).not.toHaveBeenCalled();
  });

  it("deduplicates a double-click and reconciles a successful or no-op removal", async () => {
    let resolveDelete: (() => void) | undefined;
    mocks.apiDelete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    act(() => renderModal());
    const removeNami = removeButtons()[0];

    act(() => {
      removeNami?.props.onClick();
      removeNami?.props.onClick();
    });
    expect(mocks.apiDelete).toHaveBeenCalledOnce();
    expect(removeButtons()[0]?.props.disabled).toBe(true);
    expect(removeButtons()[0]?.children).toEqual(["Removing..."]);
    expect(mocks.apiDelete).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1/spectators/spectator%2Fnami",
      LobbyActionResponseSchema
    );

    await act(async () => {
      resolveDelete?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("releases a successful no-op row after reconciliation is dropped and accepts a retry", async () => {
    vi.useFakeTimers();
    mocks.apiDelete.mockResolvedValue({ success: true });

    try {
      act(() => renderModal());

      await act(async () => {
        removeButtons()[0]?.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(onRefresh).toHaveBeenCalledOnce();
      expect(removeButtons()[0]?.props.disabled).toBe(false);
      expect(removeButtons()[0]?.children).toEqual(["Remove"]);

      await act(async () => {
        removeButtons()[0]?.props.onClick();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mocks.apiDelete).toHaveBeenCalledTimes(2);
      expect(mocks.toastError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows exactly one API message for an ApiError failure", async () => {
    mocks.apiDelete.mockRejectedValue(new ApiError("Forbidden", 403));
    act(() => renderModal());

    await act(async () => {
      removeButtons()[0]?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledWith("Forbidden");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("shows exactly one concise fallback for an unexpected failure", async () => {
    mocks.apiDelete.mockRejectedValue(new Error("offline"));
    act(() => renderModal());

    await act(async () => {
      removeButtons()[0]?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledWith("Could not remove spectator");
  });

  it("uses the generic fallback only when both spectator names are absent", () => {
    act(() =>
      renderModal({
        spectators: [
          { id: "anonymous", username: null, name: null, image: null },
        ],
      })
    );

    expect(JSON.stringify(renderer?.toJSON())).toContain("Spectator");
    expect(removeButtons()[0]?.props["aria-label"]).toBe("Remove Spectator");
  });
});
