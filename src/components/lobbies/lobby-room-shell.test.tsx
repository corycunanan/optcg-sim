import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { LobbyRoomState } from "@/lib/lobbies/state";
import type { RealtimeServerEvent } from "@/types/realtime";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  push: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  spectatorsModal: vi.fn(),
  kickMenuItem: vi.fn(),
  kickConfirmDialog: vi.fn(),
  trackPresence: vi.fn(),
  presence: {} as Record<string, { online: boolean; lastSeen: string | null }>,
  handlers: new Map<string, (event: RealtimeServerEvent) => void>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("sonner", () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
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
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
  apiPatch: (...args: unknown[]) => mocks.apiPatch(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    connectionStatus: "connected" as const,
    presence: mocks.presence,
    trackPresence: mocks.trackPresence,
    subscribe: (
      type: string,
      handler: (event: RealtimeServerEvent) => void
    ) => {
      mocks.handlers.set(type, handler);
      return () => mocks.handlers.delete(type);
    },
  }),
}));
vi.mock("@/components/deck-builder/deck-navigation-guard", () => ({
  useDeckNavigationGuard: () => ({ requestLeave: () => false }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/alert-dialog", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    AlertDialog: Wrapper,
    AlertDialogAction: Wrapper,
    AlertDialogCancel: Wrapper,
    AlertDialogContent: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
  };
});
vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react");
  const DialogContext = React.createContext<{
    open: boolean;
    setOpen: (open: boolean) => void;
  } | null>(null);
  const Dialog = ({ children }: { children?: ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <DialogContext.Provider value={{ open, setOpen }}>
        {children}
      </DialogContext.Provider>
    );
  };
  const DialogTrigger = ({ children }: { children?: ReactNode }) => {
    const context = React.useContext(DialogContext);
    if (!context || !React.isValidElement<ComponentProps<"button">>(children)) {
      return <>{children}</>;
    }
    return React.cloneElement(children, {
      onClick: (event) => {
        children.props.onClick?.(event);
        context.setOpen(true);
      },
    });
  };
  const DialogContent = ({
    children,
    className,
    size,
  }: {
    children?: ReactNode;
    className?: string;
    size?: string;
  }) => {
    const context = React.useContext(DialogContext);
    return context?.open ? (
      <div data-dialog-content data-dialog-size={size} className={className}>
        {children}
      </div>
    ) : null;
  };
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog,
    DialogContent,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogTrigger,
  };
});
// Seat overflow menus render their items eagerly here so the structural
// assertions below can see seat actions without driving Radix open state.
vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuItem: Wrapper,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Wrapper,
  };
});
vi.mock("@/components/ui/select", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Select: Wrapper,
    SelectContent: Wrapper,
    SelectItem: Wrapper,
    SelectTrigger: Wrapper,
    SelectValue: Wrapper,
  };
});
vi.mock("@/components/ui/tabs", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Tabs: Wrapper, TabsList: Wrapper, TabsTrigger: Wrapper };
});
vi.mock("@/components/ui/tooltip", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Tooltip: Wrapper,
    TooltipContent: Wrapper,
    TooltipProvider: Wrapper,
    TooltipRoot: Wrapper,
    TooltipTrigger: Wrapper,
  };
});
// `@/components/ui/page-header` is intentionally NOT mocked: the lobby header
// IS the shared primitive now, so the classes these tests assert on
// (`data-lobby-header`, the no-band/no-border contract, the height-gated
// padding) are the primitive's real output merged with the lobby's override.
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("./deck-preview-modal", () => ({ DeckPreviewModal: () => null }));
vi.mock("./spectators-modal", () => ({
  SpectatorsModal: (props: {
    open: boolean;
    spectators: LobbyRoomState["spectators"];
  }) => {
    mocks.spectatorsModal(props);
    return props.open ? (
      <section data-spectators-modal>
        {props.spectators.map((spectator) => (
          <span key={spectator.id}>{spectator.username ?? spectator.name}</span>
        ))}
      </section>
    ) : null;
  },
}));
vi.mock("./guest-leave-action", () => ({
  GuestLeaveMenuItem: ({
    leaving,
    disabled,
  }: {
    leaving: boolean;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled || leaving}>
      Leave lobby
    </button>
  ),
  runGuestLeave: vi.fn(),
}));
vi.mock("./host-close-action", () => ({
  HostCloseMenuItem: () => null,
  HostCloseConfirmDialog: () => null,
  runHostClose: vi.fn(),
}));
vi.mock("./invite-friend-popover", () => ({
  InviteFriendPopover: () => null,
}));
vi.mock("./kick-player-action", () => ({
  KickPlayerMenuItem: (props: { playerName: string; onSelect: () => void }) => {
    mocks.kickMenuItem(props);
    return null;
  },
  KickPlayerConfirmDialog: (props: {
    open: boolean;
    playerName: string;
    onKick: () => void;
  }) => {
    mocks.kickConfirmDialog(props);
    return null;
  },
}));

import { LobbyInviteToasts } from "./lobby-invite-toast";
import { LobbyRoomShell } from "./lobby-room-shell";

let renderer: ReactTestRenderer | null = null;

function renderedText() {
  return JSON.stringify(renderer?.toJSON());
}

function lobbyState(overrides: Partial<LobbyRoomState> = {}): LobbyRoomState {
  return {
    id: "lobby-1",
    version: 7,
    status: "READY",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: true,
    hostUserId: "host-user",
    host: { username: "strawhat", name: "Luffy", image: null },
    hostDeck: null,
    allowSpectators: false,
    spectators: [],
    spectatorCount: 0,
    viewerRole: "host",
    guest: {
      guestReady: true,
      user: {
        id: "guest-user",
        username: "zoro",
        name: "Zoro",
        image: null,
      },
      deck: null,
    },
    gameId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.apiDelete.mockReset();
  mocks.apiPatch.mockReset();
  mocks.apiPost.mockReset();
  mocks.push.mockReset();
  mocks.toastInfo.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.spectatorsModal.mockReset();
  mocks.kickMenuItem.mockReset();
  mocks.kickConfirmDialog.mockReset();
  mocks.handlers.clear();
  mocks.apiGet.mockImplementation(async (url: string) =>
    url === "/api/decks" ? { data: [] } : { data: lobbyState() }
  );
  vi.stubGlobal("document", {
    visibilityState: "visible",
    getElementById: vi.fn(() => null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("LobbyRoomShell redesign scenarios", () => {
  it("renders the empty host room with persistent code, invite, and start guidance", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "WAITING",
              format: "Unlimited",
              guest: null,
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = renderedText();
    expect(text).toContain("Game mode");
    expect(text).toContain("Unlimited");
    expect(text).not.toContain("strawhat's party");
    expect(text).not.toContain("Party code");
    expect(text).toContain("ABCD");
    expect(text).toContain("Join lobby");
    const roomHeadings = renderer!.root.findAllByType("h1");
    expect(roomHeadings).toHaveLength(1);
    expect(roomHeadings[0].children).toEqual(["Unlimited"]);
    // OPT-686: the open seat is the invite affordance and nothing else — no
    // heading, no overline, no panel chrome. The invite popover is mocked out
    // in this suite, so the slot renders empty here; it still has to render to
    // hold the seat width the row and the footer are centered against.
    expect(
      renderer!.root
        .findAllByType("h2")
        .some((heading) => heading.children.join("") === "Open seat")
    ).toBe(false);
    const openSeat = renderer!.root.findByProps({
      "aria-label": "Guest seat — open",
    });
    expect(openSeat.props.className).toContain("lg:w-72");
    expect(openSeat.props.className).toContain("shrink-0");
    expect(openSeat.props.className).not.toContain("border");
    expect(openSeat.props.className).not.toContain("bg-surface-1");

    const modeButtons = renderer!.root
      .findAllByType("button")
      .filter((button) =>
        button.children.some(
          (child) => child === "Versus" || child === "Solitaire"
        )
      );
    expect(modeButtons).toHaveLength(2);
    expect(
      renderer!.root.findByProps({
        role: "group",
        "aria-label": "Game mode",
      }).props.className
    ).toContain("bg-surface-3");
    expect(modeButtons[0]?.props["aria-pressed"]).toBe(true);
    expect(modeButtons[0]?.props.className).toContain(
      "bg-accent text-accent-foreground"
    );
    expect(modeButtons[1]?.props["aria-pressed"]).toBe(false);
    expect(modeButtons.map((button) => button.children)).toEqual([
      ["Versus"],
      ["Solitaire"],
    ]);

    const joinButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Join lobby"));
    // The page's standard outlined-navy control (Button default variant) —
    // gold stays reserved for the focal Start Match action.
    expect(joinButton?.props.variant).toBeUndefined();

    const frame = renderer!.root.findByProps({ "data-lobby-frame": true });
    expect(frame.props.className).toContain("overflow-hidden");
    expect(frame.props.className).not.toContain("overflow-y-auto");

    const pageHeader = renderer!.root.findByProps({
      "data-lobby-header": true,
    });
    expect(pageHeader.props.className).not.toContain("bg-surface-1");
    expect(pageHeader.props.className).not.toContain("border-b");

    const pageContent = renderer!.root.findByProps({
      "data-lobby-content": true,
    });
    expect(pageContent.props.className).toContain("flex-1");
    expect(pageContent.props.className).toContain("min-h-0");
    expect(pageContent.props.className).toContain("overflow-hidden");

    const actionBar = renderer!.root.findByProps({
      "data-lobby-action-bar": true,
    });
    expect(actionBar.props.className).toContain("shrink-0");
    expect(actionBar.props.className).toContain("sticky");
    expect(actionBar.props.className).toContain("bottom-0");

    const modeControl = renderer!.root.findByProps({
      role: "group",
      "aria-label": "Game mode",
    });
    const partyCodeControl = renderer!.root.findByProps({
      "aria-label": "Copy party link",
    });
    for (const control of [modeControl, partyCodeControl]) {
      expect(control?.props.className).toContain("h-12");
    }
    expect(joinButton?.props.size).toBe("lg");

    const headerLayout = renderer!.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("max-w-7xl") &&
        node.props.className.includes("lg:flex-row")
    );
    expect(headerLayout.props.className).toContain("flex-col");
    expect(
      renderer!.root.find(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("flex-wrap") &&
          node.props.className.includes("lg:w-auto")
      )
    ).toBeDefined();
    expect(renderedText()).not.toContain("Open seat");
    expect(renderedText()).not.toContain("Waiting for a challenger");
    expect(renderedText()).toContain("Start Match");
    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.disabled).toBe(true);
    expect(startButton?.props.title).toBe("You need an opponent first");
    expect(startButton?.props.className).toContain("disabled:bg-surface-3");
    expect(startButton?.props.className).toContain("disabled:opacity-100");
  });

  it("spends vertical rhythm only where the viewport can afford it", async () => {
    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // The frame is fixed to the viewport, so the header and content bands run
    // compressed by default and only pay full padding when the viewport is
    // both wide and tall. Height, not width, is the binding constraint here.
    const headerLayout = renderer!.root.findByProps({
      "data-lobby-header": true,
    });
    // Top padding only. The header contributes nothing below its own content,
    // so the content well's top padding IS the whole header→content gap.
    expect(headerLayout.props.className).toContain("pt-4");
    expect(headerLayout.props.className).toContain(
      "lg:[@media(min-height:50rem)]:pt-8"
    );
    expect(headerLayout.props.className).not.toMatch(/(?:^|\s|:)pb-/);
    expect(headerLayout.props.className).not.toMatch(/(?:^|\s|:)py-/);

    const pageContent = renderer!.root.findByProps({
      "data-lobby-content": true,
    });
    // Equal-rhythm invariant: the well's top padding matches the header's top
    // padding at every height gate, so the gap reads as one step, not two.
    expect(pageContent.props.className).toContain("pt-4");
    expect(pageContent.props.className).toContain(
      "lg:[@media(min-height:50rem)]:pt-8"
    );
    // Below `lg` the content well gives up a spacing step at the bottom before
    // the seats have to give up a row.
    expect(pageContent.props.className).toContain("pb-3");
    expect(pageContent.props.className).toContain("lg:pb-4");
    expect(pageContent.props.className).toContain(
      "lg:[@media(min-height:50rem)]:pb-8"
    );
    expect(pageContent.props.className).toContain(
      "lg:[@media(min-height:50rem)]:gap-6"
    );

    // One column stacks at natural heights; from `lg` the seats become a
    // centered pair of fixed-width columns whose stretch height is the space
    // left over, so neither seat can grow the frame.
    const seats = renderer!.root.findByProps({ "data-lobby-seats": true });
    expect(seats.props.className).toContain("min-h-0");
    expect(seats.props.className).toContain("flex-col");
    expect(seats.props.className).toContain("lg:flex-row");
    expect(seats.props.className).toContain("lg:justify-center");
    expect(seats.props.className).not.toContain("min-h-96");
  });

  it.each(["PVP", "SOLITAIRE"] as const)(
    "scrolls the %s seats region rather than letting a panel overrun its neighbour",
    async (mode) => {
      mocks.apiGet.mockImplementation(async (url: string) =>
        url === "/api/decks" ? { data: [] } : { data: lobbyState({ mode }) }
      );

      await act(async () => {
        renderer = create(
          <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      // The page and the frame stay locked. Below `lg` the fixed chrome can
      // leave less room than the stacked panels need, and the release valve is
      // this region alone — the panels themselves refuse to be compressed,
      // because a compressed panel paints its controls over the next one.
      const frame = renderer!.root.findByProps({ "data-lobby-frame": true });
      expect(frame.props.className).toContain("overflow-hidden");
      expect(frame.props.className).not.toContain("overflow-y-auto");

      const seats = renderer!.root.findByProps({ "data-lobby-seats": true });
      expect(seats.props.className).toContain("overflow-y-auto");
      expect(seats.props.className).toContain("lg:overflow-visible");

      const panels = renderer!.root.findAll(
        (node) =>
          node.type === "section" &&
          typeof node.props.className === "string" &&
          typeof node.props["aria-label"] === "string" &&
          /seat|Solitaire second deck/.test(node.props["aria-label"] as string)
      );
      expect(panels.length).toBeGreaterThan(0);
      for (const panel of panels) {
        expect(panel.props.className).toContain("shrink-0");
      }
    }
  );

  it("seats solitaire as two identical sides of the same player", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              mode: "SOLITAIRE",
              guest: {
                guestReady: false,
                user: {
                  id: "host-user",
                  username: "strawhat",
                  name: "Luffy",
                  image: null,
                },
                deck: null,
              },
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // One player at both ends of the table: the same seat twice, labelled by
    // the side it plays rather than by Host/Guest.
    const seats = renderer!.root.findAll(
      (node) =>
        node.type === "section" &&
        typeof node.props["aria-label"] === "string" &&
        node.props["aria-label"].includes(" seat — ")
    );
    expect(seats.map((seat) => seat.props["aria-label"])).toEqual([
      "Side 1 seat — strawhat",
      "Side 2 seat — strawhat",
    ]);
    expect(seats[0].props.className).toBe(seats[1].props.className);
    // The bespoke solitaire panel is gone along with its chrome.
    const text = renderedText();
    expect(text).not.toContain("Your second deck");
    expect(text).not.toContain("Play both sides");
    expect(text).not.toContain("Host");
    expect(text).not.toContain("Guest");

    // No ready-up on either side, and no read-only status line standing in
    // for one either.
    expect(text).not.toContain("Ready up");
    expect(text).not.toContain("Not ready");
    expect(
      renderer!.root.findAll((node) => node.props["data-seat-ready-status"])
    ).toHaveLength(0);
  });

  it("mounts real match settings and persists the host selection", async () => {
    mocks.apiPatch.mockResolvedValue({ success: true });

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const settingsButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.props["aria-label"] === "Match settings");
    expect(settingsButton?.props.variant).toBe("ghost");
    expect(settingsButton?.props.size).toBe("icon");
    expect(settingsButton?.props.disabled).toBe(false);
    const actionBarLayout = renderer!.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("lg:grid-cols-[1fr_auto_1fr]")
    );
    expect(actionBarLayout.props.className).toContain("grid-cols-1");
    expect(
      renderer!.root.findByProps({ "data-lobby-match-actions": true }).props
        .className
    ).toContain("lg:justify-center");

    await act(async () => {
      settingsButton?.props.onClick();
    });

    const settingsDialog = renderer!.root.findByProps({
      "data-dialog-content": true,
    });
    expect(settingsDialog.props["data-dialog-size"]).toBe("lg");
    expect(settingsDialog.props.className).toBeUndefined();

    const radioGroup = renderer!.root.findByProps({
      "data-slot": "radio-group",
    });
    const pregameRadios = renderer!.root.findAll(
      (node) => node.type === "button" && node.props.role === "radio"
    );
    expect(pregameRadios).toHaveLength(4);
    expect(radioGroup.props.value).toBe("PRIORITY_ROLL");
    expect(radioGroup.props.disabled).toBe(false);

    await act(async () => {
      radioGroup.props.onValueChange("GUEST_FIRST");
      await Promise.resolve();
    });

    expect(mocks.apiPatch).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1",
      { pregameMode: "GUEST_FIRST" },
      expect.anything()
    );
  });

  it("keeps the selected mode legible when guests cannot change it", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : { data: lobbyState({ viewerRole: "guest" }) }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="guest-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const modeButtons = renderer!.root
      .findAllByType("button")
      .filter((button) =>
        button.children.some(
          (child) => child === "Versus" || child === "Solitaire"
        )
      );
    const [versusButton, solitaireButton] = modeButtons;

    expect(versusButton?.props.disabled).toBe(true);
    expect(versusButton?.props["aria-pressed"]).toBe(true);
    expect(versusButton?.props.className).toContain(
      "bg-accent text-accent-foreground disabled:opacity-100"
    );
    expect(versusButton?.props.className).not.toContain("disabled:opacity-50");
    expect(solitaireButton?.props.disabled).toBe(true);
    expect(solitaireButton?.props.className).toContain("disabled:opacity-50");
    expect(solitaireButton?.props["aria-describedby"]).toBe(
      "solitaire-mode-blocked-reason"
    );
    expect(
      renderer!.root.findByProps({ id: "solitaire-mode-blocked-reason" })
        .children
    ).toEqual(["Leave the party to play solitaire"]);
    expect(
      renderer!.root.findByProps({ id: "solitaire-mode-blocked-reason" }).props
        .className
    ).not.toContain("sr-only");
    await act(async () => {
      renderer!.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Match settings")
        ?.props.onClick();
    });
    expect(renderedText()).toContain("Host controlled");
    const radioGroup = renderer!.root.findByProps({
      "data-slot": "radio-group",
    });
    const pregameRadios = renderer!.root.findAll(
      (node) => node.type === "button" && node.props.role === "radio"
    );
    expect(pregameRadios).toHaveLength(4);
    expect(radioGroup.props.disabled).toBe(true);

    await act(async () => {
      radioGroup.props.onValueChange("GUEST_FIRST");
      await Promise.resolve();
    });

    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it("keeps the selected pregame mode after a failed host update", async () => {
    mocks.apiPatch.mockRejectedValue(new Error("offline"));

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      renderer!.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Match settings")
        ?.props.onClick();
    });

    const radioGroup = renderer!.root.findByProps({
      "data-slot": "radio-group",
    });

    await act(async () => {
      radioGroup.props.onValueChange("GUEST_FIRST");
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Lobby update failed");
    expect(
      renderer!.root.findByProps({ "data-slot": "radio-group" }).props.value
    ).toBe("PRIORITY_ROLL");
  });

  it("renders an interactive host spectator toggle and keeps the empty count available", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              allowSpectators: false,
              spectatorCount: 0,
              viewerRole: "host",
            }),
          }
    );
    mocks.apiPatch.mockResolvedValue({ success: true });

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="someone-else" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const toggle = renderer?.root.findByProps({
      role: "switch",
      "aria-label": "Allow spectators",
    });
    const count = renderer?.root.findByProps({
      "aria-label": "View spectators (0)",
    });

    expect(toggle?.props["aria-checked"]).toBe(false);
    expect(toggle?.props.className).toContain("bg-content-tertiary");
    expect(count?.props.disabled).toBeUndefined();

    await act(async () => {
      toggle?.props.onClick();
      await Promise.resolve();
    });

    expect(mocks.apiPatch).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1",
      { allowSpectators: true },
      expect.anything()
    );
    expect(
      renderer?.root.findByProps({ "aria-label": "Allow spectators" }).props[
        "aria-checked"
      ]
    ).toBe(true);
  });

  it("keeps the guest spectator state in the footer", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              allowSpectators: true,
              spectatorCount: 3,
              viewerRole: "guest",
              guest: {
                guestReady: false,
                user: {
                  id: "guest-user",
                  username: "zoro",
                  name: "Zoro",
                  image: null,
                },
                deck: null,
              },
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderer?.root
        .findAllByType("span")
        .some(
          (span) =>
            span.children
              .filter((child): child is string => typeof child === "string")
              .join("") === "Spectators on · 3 watching"
        )
    ).toBe(true);
    expect(
      renderer?.root.findAllByProps({ "aria-label": "Allow spectators" })
    ).toHaveLength(0);

    const guestSeat = renderer?.root.findByProps({
      "aria-label": "Guest seat — zoro",
    });
    expect(
      guestSeat?.findAllByProps({ "data-spectator-control": true })
    ).toHaveLength(0);
    expect(
      renderer?.root
        .findByProps({ "data-lobby-action-bar": true })
        .findAllByProps({ "data-spectator-control": true })
    ).toHaveLength(1);
  });

  it("warns hosts that turning spectators off removes current watchers", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              allowSpectators: true,
              spectatorCount: 3,
              viewerRole: "host",
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const enabledToggle = renderer?.root.findByProps({
      role: "switch",
      "aria-label": "Allow spectators. Turning this off removes 3 watchers.",
    });
    expect(enabledToggle).toBeDefined();
    expect(enabledToggle?.props.className).toContain("bg-gold-500");
  });

  it("opens the spectator surface and reconciles live membership without closing", async () => {
    const firstSpectator = {
      id: "spectator-1",
      username: "nami",
      name: "Nami",
      image: null,
    };
    const secondSpectator = {
      id: "spectator-2",
      username: "usopp",
      name: "Usopp",
      image: null,
    };
    const initial = lobbyState({
      allowSpectators: true,
      spectators: [firstSpectator],
      spectatorCount: 1,
      viewerRole: "host",
    });
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks" ? { data: [] } : { data: initial }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      renderer?.root
        .findByProps({ "aria-label": "View spectators (1)" })
        .props.onClick();
    });
    expect(renderedText()).toContain("nami");

    await act(async () => {
      mocks.handlers.get("lobby:state_changed")?.({
        type: "lobby:state_changed",
        lobby: {
          ...initial,
          version: 8,
          spectators: [secondSpectator, firstSpectator],
          spectatorCount: 2,
        },
      });
    });

    const latestModalProps = mocks.spectatorsModal.mock.calls.at(-1)?.[0] as {
      open: boolean;
      spectators: LobbyRoomState["spectators"];
    };
    expect(latestModalProps.open).toBe(true);
    expect(
      latestModalProps.spectators.map((spectator) => spectator.id)
    ).toEqual(["spectator-2", "spectator-1"]);
    expect(renderedText()).toMatch(/usopp.*nami/);
  });

  it("rolls back a failed spectator toggle with one error toast", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              allowSpectators: false,
              viewerRole: "host",
            }),
          }
    );
    mocks.apiPatch.mockRejectedValue(new Error("offline"));

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      renderer?.root
        .findByProps({ "aria-label": "Allow spectators" })
        .props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(
      renderer?.root.findByProps({ "aria-label": "Allow spectators" }).props[
        "aria-checked"
      ]
    ).toBe(false);
  });

  it("renders the viewer-scoped invited seat and expiry countdown", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "WAITING",
              guest: null,
              pendingInvite: {
                id: "invite-1",
                expiresAt: "2099-07-24T20:01:00.000Z",
                user: {
                  id: "friend-1",
                  username: "nami",
                  name: "Nami",
                  image: null,
                },
              },
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Invite sent to ");
    expect(renderedText()).toContain("nami");
    expect(renderedText()).toContain("Expires in ");
    expect(renderedText()).toContain("Cancel invite");
    expect(renderedText()).toContain(
      "Cancel the invite before switching to solitaire"
    );
    expect(
      renderer!.root.findByProps({
        "aria-label": "Guest seat — invite pending",
      }).type
    ).toBe("section");
    expect(
      renderer!.root
        .findAllByType("h2")
        .some((heading) => heading.children.join("") === "Invite pending")
    ).toBe(true);
    expect(
      renderer!.root
        .findAllByType("h3")
        .some((heading) =>
          heading.children.join("").startsWith("Invite sent to ")
        )
    ).toBe(true);
  });

  it("renders occupied host and guest seats with self-scoped controls", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : { data: lobbyState({ viewerRole: "guest" }) }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="guest-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("strawhat");
    expect(renderedText()).toContain("zoro");
    expect(renderedText()).toContain("Host");
    expect(renderedText()).toContain("Guest");
    expect(renderedText()).toContain("Leave lobby");
    expect(renderedText()).toContain("Leave the party to play solitaire");
    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.title).toBe("The host starts the match");
  });

  it("renders both selected decks and the ready state", async () => {
    const deck = {
      id: "deck-1",
      name: "Straw Hat Rush",
      leaderId: "OP01-001",
      leaderName: "Monkey.D.Luffy",
      leaderImageUrl: null,
      contents: {
        characters: [
          {
            id: "OP01-024",
            name: "Monkey.D.Luffy",
            quantity: 4,
            imageUrl: "/card.png",
          },
        ],
        events: [],
        stages: [],
      },
    };
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/decks") {
        return {
          data: [
            {
              ...deck,
              format: "Standard",
              totalCards: 50,
              colors: ["Red"],
            },
          ],
        };
      }
      return {
        data: lobbyState({
          hostDeck: deck,
          guest: {
            guestReady: true,
            user: {
              id: "guest-user",
              username: "zoro",
              name: "Zoro",
              image: null,
            },
            deck: { ...deck, id: "deck-2", name: "Three Sword Style" },
          },
        }),
      };
    });

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Straw Hat Rush");
    expect(renderedText()).toContain("Three Sword Style");
    // The seat is a leader summary now — the deck list moved behind the
    // leader card (change-deck modal / deck preview).
    expect(renderedText()).not.toContain("Deck list");
    expect(renderedText()).not.toContain("Characters");
    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.title).toBeUndefined();
    const seats = renderer!.root.findAll(
      (node) =>
        node.type === "section" &&
        typeof node.props["aria-label"] === "string" &&
        node.props["aria-label"].includes(" seat — ")
    );
    expect(seats).toHaveLength(2);
    for (const seat of seats) {
      // Bare column on the page surface: no panel fill, border, or radius.
      expect(seat.props.className).not.toMatch(/(^|\s)(border|rounded|bg-)/);
    }
    expect(
      mocks.apiGet.mock.calls.some(
        ([url]) => typeof url === "string" && url.startsWith("/api/decks/")
      )
    ).toBe(false);
  });

  it("renders the solitaire state with a normalized cross-mode selection", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "WAITING",
              mode: "SOLITAIRE",
              pregameMode: "HOST_FIRST",
              guest: {
                guestReady: false,
                user: {
                  id: "host-user",
                  username: "strawhat",
                  name: "Luffy",
                  image: null,
                },
                deck: null,
              },
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Solitaire");
    expect(renderedText()).toContain("Side 1");
    expect(renderedText()).toContain("Side 2");
    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.title).toBe("Both sides need a deck");
    await act(async () => {
      renderer!.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Match settings")
        ?.props.onClick();
    });
    const radioGroup = renderer!.root.findByProps({
      "data-slot": "radio-group",
    });
    const pregameRadios = renderer!.root.findAll(
      (node) => node.type === "button" && node.props.role === "radio"
    );
    expect(pregameRadios).toHaveLength(3);
    expect(radioGroup.props.value).toBe("SOLITAIRE_RANDOM");
  });

  it("enables solitaire Start Match on two decks alone, with no ready state", async () => {
    const sideDeck = (id: string, name: string) => ({
      id,
      name,
      leaderId: "OP01-001",
      leaderName: "Monkey.D.Luffy",
      leaderImageUrl: null,
    });
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              mode: "SOLITAIRE",
              pregameMode: "SOLITAIRE_RANDOM",
              // Switching into solitaire clears `hostReady` and nothing can set
              // it again, so the start gate cannot depend on it.
              hostReady: false,
              hostDeck: sideDeck("deck-1", "Straw Hat Rush"),
              guest: {
                guestReady: false,
                user: {
                  id: "host-user",
                  username: "strawhat",
                  name: "Luffy",
                  image: null,
                },
                deck: sideDeck("deck-2", "Three Sword Style"),
              },
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.disabled).toBe(false);
    expect(startButton?.props.title).toBeUndefined();
  });

  it("holds solitaire Start Match until the second side has a deck", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              mode: "SOLITAIRE",
              pregameMode: "SOLITAIRE_RANDOM",
              hostReady: false,
              hostDeck: {
                id: "deck-1",
                name: "Straw Hat Rush",
                leaderId: "OP01-001",
                leaderName: "Monkey.D.Luffy",
                leaderImageUrl: null,
              },
              guest: {
                guestReady: false,
                user: {
                  id: "host-user",
                  username: "strawhat",
                  name: "Luffy",
                  image: null,
                },
                deck: null,
              },
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.disabled).toBe(true);
    expect(startButton?.props.title).toBe("Both sides need a deck");
  });

  it("replaces Start Match with Rejoin Game while a match is active", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "IN_GAME",
              gameId: "game-1",
              gameStatus: "IN_PROGRESS",
              viewerRole: "guest",
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Rejoin Game");
    expect(renderedText()).not.toContain("Start Match");
    expect(renderedText()).not.toContain("Your match is already in progress");
    expect(
      renderer!.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Match settings")?.props
        .disabled
    ).toBe(true);

    const joinButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Join lobby"));
    expect(joinButton?.props.disabled).toBe(true);
  });

  it("routes an in-game spectator through the matching Spectate Match CTA", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "IN_GAME",
              viewerRole: "spectator",
              gameId: "game-1",
              gameStatus: "IN_PROGRESS",
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="spectator-1" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Spectate Match");
    expect(renderedText()).not.toContain("Rejoin Game");
    expect(renderedText()).toContain("Match in progress");
    expect(renderedText()).not.toContain("Waiting for the match to start");

    const spectateButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Spectate Match"));
    act(() => spectateButton?.props.onClick());

    expect(mocks.push).toHaveBeenCalledWith("/game/game-1");
  });

  it("renders a minimal pre-game spectator branch with names but no private or seated-player controls", async () => {
    const hostDeck = {
      id: "deck-host",
      name: "Straw Hat Rush",
      leaderId: "OP01-001",
      leaderName: "Monkey.D.Luffy",
      leaderImageUrl: "/leader.png",
      contents: {
        characters: [
          {
            id: "OP01-024",
            name: "Private Gum-Gum Card",
            quantity: 4,
            imageUrl: "/card.png",
          },
        ],
        events: [],
        stages: [],
      },
    };
    const guestDeck = {
      ...hostDeck,
      id: "deck-guest",
      name: "Three Sword Style",
      leaderName: "Roronoa Zoro",
      contents: {
        characters: [
          {
            id: "OP01-025",
            name: "Private Three Sword Card",
            quantity: 4,
            imageUrl: "/card.png",
          },
        ],
        events: [],
        stages: [],
      },
    };
    mocks.apiGet.mockImplementation(async (url: string) => ({
      data:
        url === "/api/decks"
          ? []
          : lobbyState({
              viewerRole: "spectator",
              hostDeck,
              guest: {
                guestReady: true,
                user: {
                  id: "guest-user",
                  username: "zoro",
                  name: "Zoro",
                  image: null,
                },
                deck: guestDeck,
              },
            }),
    }));

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="spectator-1" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = renderedText();
    expect(text).toContain("Waiting for the match to start");
    expect(text).toContain("strawhat");
    expect(text).toContain("zoro");
    expect(text).toContain("Straw Hat Rush");
    expect(text).toContain("Three Sword Style");
    expect(text).not.toContain("Private Gum-Gum Card");
    expect(text).not.toContain("Private Three Sword Card");
    expect(text).not.toContain("Monkey.D.Luffy");
    expect(text).not.toContain("Roronoa Zoro");
    expect(text).not.toContain("Deck list");
    expect(text).not.toContain("Ready");
    expect(text).not.toContain("Party code");
    expect(text).not.toContain("Game mode");
    expect(text).not.toContain("Join lobby");
    expect(text).not.toContain("Start Match");
    expect(text).not.toContain("Invite");
    expect(text).not.toContain("Solitaire");
    expect(text).not.toContain("Spectate Match");
    const frame = renderer!.root.findByProps({ "data-lobby-frame": true });
    expect(frame.props.className).toContain("overflow-hidden");
    expect(frame.props.className).not.toContain("overflow-y-auto");
    expect(
      renderer!.root.findByProps({ "data-lobby-header": true }).props.className
    ).not.toContain("border-b");
    const actionBar = renderer!.root.findByProps({
      "data-lobby-action-bar": true,
    });
    expect(actionBar.props.className).toContain("shrink-0");
    expect(actionBar.props.className).toContain("sticky");
    expect(actionBar.props.className).toContain("bottom-0");
    expect(
      renderer!.root.findAllByType("button").map((button) => button.children)
    ).toEqual([["Stop spectating"]]);
    expect(mocks.apiGet.mock.calls.some(([url]) => url === "/api/decks")).toBe(
      false
    );
  });

  it("truncates a spectated host's name instead of widening the fixed frame", async () => {
    // Usernames are user-controlled, and the spectator frame never scrolls, so
    // an unbroken name has to be clipped rather than allowed to set the width.
    const longName = "A".repeat(200);
    mocks.apiGet.mockImplementation(async (url: string) => ({
      data:
        url === "/api/decks"
          ? []
          : lobbyState({
              viewerRole: "spectator",
              host: { username: longName, name: null, image: null },
            }),
    }));

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="spectator-1" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain(longName);

    const title = renderer!.root.findByType("h1");
    expect(title.props.className).toContain("truncate");

    // `truncate` only clips against a definite width, so the column the title
    // sits in has to fill the header and be allowed to shrink below content.
    let content = title.parent!;
    while (typeof content.type !== "string") content = content.parent!;
    expect(content.props.className).toContain("w-full");
    expect(content.props.className).toContain("min-w-0");
  });

  it.each([
    ["host", "Start Match"],
    ["guest", "Leave lobby"],
  ] as const)(
    "keeps the %s seated-player branch",
    async (viewerRole, action) => {
      mocks.apiGet.mockImplementation(async (url: string) =>
        url === "/api/decks"
          ? { data: [] }
          : { data: lobbyState({ viewerRole }) }
      );

      await act(async () => {
        renderer = create(
          <LobbyRoomShell
            lobbyId="lobby-1"
            currentUserId={`${viewerRole}-user`}
          />
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(renderedText()).toContain(action);
      expect(renderedText()).not.toContain("Waiting for the match to start");
    }
  );

  it("stops spectating through self-leave and returns to the personal lobby", async () => {
    mocks.apiGet.mockResolvedValue({
      data: lobbyState({ viewerRole: "spectator" }),
    });
    mocks.apiDelete.mockResolvedValue({ data: { success: true } });

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="spectator-1" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const stopButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Stop spectating"));
    await act(async () => {
      stopButton?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.apiDelete).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1/spectators",
      expect.anything()
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("You stopped spectating");
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");
  });

  it("keeps a spectator in place when self-leave fails exceptionally", async () => {
    mocks.apiGet.mockResolvedValue({
      data: lobbyState({ viewerRole: "spectator" }),
    });
    mocks.apiDelete.mockRejectedValue(new Error("offline"));

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="spectator-1" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const stopButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Stop spectating"));
    await act(async () => {
      stopButton?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Could not stop spectating");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(renderedText()).toContain("Stop spectating");
  });

  it("removes guest leave from keyboard access while a match is active", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "IN_GAME",
              gameId: "game-1",
              gameStatus: "IN_PROGRESS",
              viewerRole: "guest",
            }),
          }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="guest-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const leaveButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Leave lobby"));
    expect(leaveButton?.props.disabled).toBe(true);
  });
});

describe("LobbyRoomShell kick targeting", () => {
  const replacementGuest = {
    guestReady: false,
    user: {
      id: "guest-user-2",
      username: "sanji",
      name: "Sanji",
      image: null,
    },
    deck: null,
  };

  function latestDialogProps() {
    return mocks.kickConfirmDialog.mock.calls.at(-1)?.[0] as {
      open: boolean;
      playerName: string;
      onKick: () => void;
    };
  }

  async function renderHostWithGuest() {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks" ? { data: [] } : { data: lobbyState() }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mocks.kickMenuItem.mock.calls.at(-1)?.[0].onSelect();
    });
  }

  it("pins the confirmation to the guest it was opened against", async () => {
    await renderHostWithGuest();

    const dialog = latestDialogProps();
    expect(dialog.open).toBe(true);
    expect(dialog.playerName).toBe("zoro");
  });

  it("retracts the confirmation when the seat changes hands while it is open", async () => {
    await renderHostWithGuest();
    expect(latestDialogProps().open).toBe(true);

    await act(async () => {
      mocks.handlers.get("lobby:state_changed")?.({
        type: "lobby:state_changed",
        lobby: { ...lobbyState(), version: 8, guest: replacementGuest },
      });
    });

    expect(latestDialogProps().open).toBe(false);
  });

  it("retracts the confirmation when the guest seat empties", async () => {
    await renderHostWithGuest();

    await act(async () => {
      mocks.handlers.get("lobby:state_changed")?.({
        type: "lobby:state_changed",
        lobby: { ...lobbyState(), version: 8, guest: null },
      });
    });

    expect(latestDialogProps().open).toBe(false);
  });

  it("aborts the kick when the captured guest is no longer seated", async () => {
    await renderHostWithGuest();
    const confirm = latestDialogProps().onKick;

    // The seat turns over between opening the confirmation and confirming it.
    await act(async () => {
      mocks.handlers.get("lobby:state_changed")?.({
        type: "lobby:state_changed",
        lobby: { ...lobbyState(), version: 8, guest: replacementGuest },
      });
    });

    await act(async () => {
      confirm();
      await Promise.resolve();
    });

    expect(mocks.apiDelete).not.toHaveBeenCalled();
    expect(mocks.toastInfo).toHaveBeenCalledWith("zoro already left the party");
  });

  it("kicks the captured guest while they are still seated", async () => {
    mocks.apiDelete.mockResolvedValue({ data: { success: true } });
    await renderHostWithGuest();

    await act(async () => {
      latestDialogProps().onKick();
      await Promise.resolve();
    });

    expect(mocks.apiDelete).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1/guest",
      expect.anything()
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "zoro was removed from the party"
    );
  });
});

describe("LobbyRoomShell spectator ejection recovery", () => {
  it.each([
    [
      "SPECTATING_DISABLED",
      "The host turned off spectating. You've been returned to your own lobby.",
    ],
    [
      "REMOVED_BY_HOST",
      "The host removed you. You've been returned to your own lobby.",
    ],
    [
      "LOBBY_CLOSED",
      "The party closed. You've been returned to your own lobby.",
    ],
  ] as const)(
    "routes %s with one explanatory toast",
    async (reason, message) => {
      const lobbyId = `spectator-ejection-${reason.toLowerCase()}`;
      mocks.apiGet.mockResolvedValue({
        data: lobbyState({ id: lobbyId, viewerRole: "spectator" }),
      });

      await act(async () => {
        renderer = create(
          <LobbyRoomShell lobbyId={lobbyId} currentUserId="spectator-1" />
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      const handler = mocks.handlers.get("lobby:spectator_removed");
      expect(handler).toBeTypeOf("function");
      await act(async () => {
        handler?.({
          type: "lobby:spectator_removed",
          lobbyId: "some-other-lobby",
          reason,
        });
      });
      expect(mocks.toastInfo).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();

      await act(async () => {
        handler?.({ type: "lobby:spectator_removed", lobbyId, reason });
      });

      expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
      expect(mocks.toastInfo).toHaveBeenCalledWith(message);
      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/lobbies");
      expect(renderer!.toJSON()).toBeNull();
    }
  );
});

describe("LobbyRoomShell guest removal recovery", () => {
  it("turns one directed event into one toast and one redirect without rendering stale room state", async () => {
    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="guest-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const handler = mocks.handlers.get("lobby:guest_removed");
    expect(handler).toBeTypeOf("function");

    await act(async () => {
      handler?.({
        type: "lobby:guest_removed",
        lobbyId: "lobby-1",
        hostName: "strawhat",
      });
    });

    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "You were removed from strawhat's party"
    );
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");
    expect(renderer!.toJSON()).toBeNull();
  });
});

describe("LobbyRoomShell party disband recovery", () => {
  it("renders a recovery panel when the router re-enters an already-claimed lobby", async () => {
    const lobbyId = "reentered-closed-lobby";
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : { data: lobbyState({ id: lobbyId, status: "CLOSED" }) }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId={lobbyId} currentUserId="guest-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer!.toJSON()).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");

    act(() => renderer?.unmount());
    renderer = null;
    mocks.push.mockReset();

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId={lobbyId} currentUserId="guest-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("This party is no longer available");
    const backButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Back to Play"));
    expect(backButton).toBeDefined();

    act(() => backButton?.props.onClick());
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");
  });

  it("handles a CLOSED snapshot followed by the directed event exactly once", async () => {
    const lobbyId = "closed-first-lobby";
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/decks" || url === "/api/lobby-invites/pending") {
        return { data: [] };
      }
      return { data: lobbyState({ id: lobbyId, status: "CLOSED" }) };
    });

    await act(async () => {
      renderer = create(
        <>
          <LobbyInviteToasts />
          <LobbyRoomShell lobbyId={lobbyId} currentUserId="guest-user" />
        </>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "You're no longer in this party"
    );
    const handler = mocks.handlers.get("lobby:party_disbanded");
    expect(handler).toBeTypeOf("function");

    await act(async () => {
      handler?.({
        type: "lobby:party_disbanded",
        lobbyId,
        hostName: "strawhat",
      });
    });

    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");
  });

  it("handles the directed event followed by a CLOSED snapshot exactly once", async () => {
    const lobbyId = "event-first-lobby";
    let resolveLobby: ((value: { data: LobbyRoomState }) => void) | null = null;
    const lobbyResponse = new Promise<{ data: LobbyRoomState }>((resolve) => {
      resolveLobby = resolve;
    });
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/decks" || url === "/api/lobby-invites/pending") {
        return { data: [] };
      }
      return lobbyResponse;
    });

    await act(async () => {
      renderer = create(
        <>
          <LobbyInviteToasts />
          <LobbyRoomShell lobbyId={lobbyId} currentUserId="guest-user" />
        </>
      );
      await Promise.resolve();
    });

    const handler = mocks.handlers.get("lobby:party_disbanded");
    expect(handler).toBeTypeOf("function");
    await act(async () => {
      handler?.({
        type: "lobby:party_disbanded",
        lobbyId,
        hostName: "strawhat",
      });
    });

    await act(async () => {
      resolveLobby?.({
        data: lobbyState({ id: lobbyId, status: "CLOSED" }),
      });
      await lobbyResponse;
      await Promise.resolve();
    });

    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "strawhat disbanded the party. You've been returned to your own lobby."
    );
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");
  });
});
