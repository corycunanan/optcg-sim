import type { ReactNode } from "react";
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
  Button: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
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
vi.mock("./guest-leave-action", () => ({
  GuestLeaveAction: ({ isGuest }: { isGuest: boolean }) =>
    isGuest ? <span>Leave lobby</span> : null,
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
      if (url.startsWith("/api/decks/")) {
        return {
          data: {
            cards: [
              {
                cardId: "OP01-024",
                quantity: 4,
                selectedArtUrl: null,
                card: {
                  id: "OP01-024",
                  name: "Monkey.D.Luffy",
                  type: "Character",
                  imageUrl: "/card.png",
                },
              },
            ],
          },
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
