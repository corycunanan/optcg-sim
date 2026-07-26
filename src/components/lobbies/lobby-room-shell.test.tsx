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
  GuestLeaveAction: ({
    isGuest,
    disabled,
  }: {
    isGuest: boolean;
    disabled?: boolean;
  }) =>
    isGuest ? (
      <button type="button" disabled={disabled}>
        Leave lobby
      </button>
    ) : null,
  runGuestLeave: vi.fn(),
}));
vi.mock("./host-close-action", () => ({
  HostCloseAction: () => null,
  runHostClose: vi.fn(),
}));
vi.mock("./invite-friend-popover", () => ({
  InviteFriendPopover: () => null,
}));
vi.mock("./pregame-settings", () => ({ PregameSettings: () => null }));
vi.mock("./kick-player-action", () => ({ KickPlayerAction: () => null }));

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
        : { data: lobbyState({ status: "WAITING", guest: null }) }
    );

    await act(async () => {
      renderer = create(
        <LobbyRoomShell lobbyId="lobby-1" currentUserId="host-user" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Game mode");
    expect(renderedText()).toContain("Versus");
    expect(renderedText()).toContain("Party code");
    expect(renderedText()).toContain("ABCD");
    expect(renderedText()).toContain("Join lobby");
    expect(renderedText()).toContain("Open seat");
    expect(renderedText()).toContain("Waiting for a challenger");
    expect(renderedText()).toContain("You need an opponent first");
    expect(renderedText()).toContain("Start Match");
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

  it("gives the guest a clear spectator consent state before readying", async () => {
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
    const guestTraversal = guestSeat?.findAll(() => true) ?? [];
    const consentIndex = guestTraversal.findIndex(
      (node) => node.props["data-spectator-consent"] !== undefined
    );
    const readyIndex = guestTraversal.findIndex(
      (node) => node.type === "button" && node.props["aria-pressed"] === false
    );
    expect(consentIndex).toBeGreaterThanOrEqual(0);
    expect(readyIndex).toBeGreaterThan(consentIndex);
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

    expect(
      renderer?.root.findByProps({
        role: "switch",
        "aria-label":
          "Allow spectators. Turning this off removes 3 watchers.",
      })
    ).toBeDefined();
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
    expect(
      mocks.apiGet.mock.calls.some(
        ([url]) => typeof url === "string" && url.startsWith("/api/decks/"),
      ),
    ).toBe(false);
  });

  it("renders the solitaire second-deck state", async () => {
    mocks.apiGet.mockImplementation(async (url: string) =>
      url === "/api/decks"
        ? { data: [] }
        : {
            data: lobbyState({
              status: "WAITING",
              mode: "SOLITAIRE",
              pregameMode: "SOLITAIRE_RANDOM",
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

    const spectateButton = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Spectate Match"));
    act(() => spectateButton?.props.onClick());

    expect(mocks.push).toHaveBeenCalledWith("/game/game-1");
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
