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
  }: {
    children?: ReactNode;
    className?: string;
  }) => {
    const context = React.useContext(DialogContext);
    return context?.open ? (
      <div data-dialog-content className={className}>
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
  return { Tooltip: Wrapper, TooltipProvider: Wrapper };
});
vi.mock("@/components/ui/page-header", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    PageHeader: Wrapper,
    PageHeaderActions: Wrapper,
    PageHeaderContent: Wrapper,
    PageHeaderDescription: Wrapper,
    PageHeaderTitle: Wrapper,
  };
});
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
  KickPlayerMenuItem: () => null,
  KickPlayerConfirmDialog: () => null,
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
    expect(joinButton?.props.variant).toBe("outline");

    const frame = renderer!.root.findByProps({ "data-lobby-frame": true });
    expect(frame.props.className).toContain("overflow-y-auto");
    expect(frame.props.className).toContain(
      "xl:[@media(min-height:50rem)]:overflow-hidden"
    );

    const pageHeader = renderer!.root.findByProps({
      "data-lobby-header": true,
    });
    expect(pageHeader.props.className).not.toContain("bg-surface-1");
    expect(pageHeader.props.className).not.toContain("border-b");

    const pageContent = renderer!.root.findByProps({
      "data-lobby-content": true,
    });
    expect(pageContent.props.className).toContain("flex-1");
    expect(pageContent.props.className).toContain(
      "xl:[@media(min-height:50rem)]:min-h-0"
    );

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
    for (const control of [modeControl, partyCodeControl, joinButton]) {
      expect(control?.props.className).toContain("h-12");
    }

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
    expect(renderedText()).toContain("Open seat");
    expect(renderedText()).toContain("Waiting for a challenger");
    expect(renderedText()).toContain("You need an opponent first");
    expect(renderedText()).toContain("Start Match");
    const startButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Start Match"));
    expect(startButton?.props.disabled).toBe(true);
    expect(startButton?.props.className).toContain("disabled:bg-surface-3");
    expect(startButton?.props.className).toContain("disabled:opacity-100");
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
      .find((button) => button.children.includes("Match settings"));
    expect(settingsButton?.props.variant).toBe("outline");
    expect(settingsButton?.props.disabled).toBe(false);
    expect(
      renderer!.root.findByProps({ "data-lobby-match-actions": true }).props
        .className
    ).toContain("flex-col");
    expect(
      renderer!.root.findByProps({ "data-lobby-match-actions": true }).props
        .className
    ).toContain("lg:flex-row");

    await act(async () => {
      settingsButton?.props.onClick();
    });

    const settingsDialog = renderer!.root.findByProps({
      "data-dialog-content": true,
    });
    expect(settingsDialog.props.className).toContain(
      "max-h-[calc(100dvh-2rem)]"
    );
    expect(settingsDialog.props.className).toContain("overflow-y-auto");

    const pregameRadios = renderer!.root
      .findAllByType("input")
      .filter((input) => input.props.name === "pregame-mode");
    expect(pregameRadios).toHaveLength(4);
    expect(
      pregameRadios.find((radio) => radio.props.value === "PRIORITY_ROLL")
        ?.props.checked
    ).toBe(true);
    expect(pregameRadios.every((radio) => radio.props.disabled === false)).toBe(
      true
    );

    await act(async () => {
      pregameRadios
        .find((radio) => radio.props.value === "GUEST_FIRST")
        ?.props.onChange();
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
        .find((button) => button.children.includes("Match settings"))
        ?.props.onClick();
    });
    expect(renderedText()).toContain("Host controlled");
    const pregameRadios = renderer!.root
      .findAllByType("input")
      .filter((input) => input.props.name === "pregame-mode");
    expect(pregameRadios).toHaveLength(4);
    expect(pregameRadios.every((input) => input.props.disabled)).toBe(true);

    await act(async () => {
      pregameRadios
        .find((radio) => radio.props.value === "GUEST_FIRST")
        ?.props.onChange();
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
        .find((button) => button.children.includes("Match settings"))
        ?.props.onClick();
    });

    const pregameRadios = renderer!.root
      .findAllByType("input")
      .filter((input) => input.props.name === "pregame-mode");

    await act(async () => {
      pregameRadios
        .find((radio) => radio.props.value === "GUEST_FIRST")
        ?.props.onChange();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Lobby update failed");
    expect(
      renderer!.root
        .findAllByType("input")
        .find((radio) => radio.props.value === "PRIORITY_ROLL")?.props.checked
    ).toBe(true);
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
    expect(renderedText()).toContain("The host starts the match");
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
    expect(renderedText()).toContain("Deck list");
    expect(renderedText()).toContain("Characters");
    expect(renderedText()).toContain("Everything is set");
    const deckLists = renderer!.root.findAll(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("overflow-y-auto") &&
        node.props.className.includes("bg-surface-3")
    );
    expect(deckLists).toHaveLength(2);
    for (const deckList of deckLists) {
      expect(deckList.props.className).toContain("min-h-0");
      expect(deckList.props.className).toContain("flex-1");
      expect(deckList.props.className).not.toContain("h-64");
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
    expect(renderedText()).toContain("Your second deck");
    expect(renderedText()).toContain("Play both sides");
    expect(renderedText()).toContain("Both players need a deck");
    await act(async () => {
      renderer!.root
        .findAllByType("button")
        .find((button) => button.children.includes("Match settings"))
        ?.props.onClick();
    });
    const pregameRadios = renderer!.root
      .findAllByType("input")
      .filter((input) => input.props.name === "pregame-mode");
    expect(pregameRadios).toHaveLength(3);
    expect(
      pregameRadios.find((radio) => radio.props.value === "SOLITAIRE_RANDOM")
        ?.props.checked
    ).toBe(true);
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
    expect(renderedText()).toContain("Your match is already in progress");
    expect(
      renderer!.root
        .findAllByType("button")
        .find((button) => button.children.includes("Match settings"))?.props
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
    expect(frame.props.className).toContain(
      "xl:[@media(min-height:50rem)]:overflow-hidden"
    );
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
