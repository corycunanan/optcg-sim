import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useReducer, type MouseEvent } from "react";

const mocks = vi.hoisted(() => ({
  pathname: "/decks/deck-1",
  push: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  subscribe:
    vi.fn<
      (
        type: string,
        handler: (event: Record<string, unknown>) => void
      ) => () => void
    >(),
  subscribers: new Map<string, (event: Record<string, unknown>) => void>(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        id: "user-1",
        username: "luffy",
        name: "Luffy",
        email: "luffy@example.com",
        image: null,
        isAdmin: false,
        theme: "default",
      },
    },
  }),
  signOut: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status = 500,
      public body: Record<string, unknown> = {}
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: mocks.subscribe,
    notificationInbox: {
      notifications: [],
      unreadCount: 0,
      loadState: "success",
      refresh: vi.fn(),
    },
  }),
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: () => <span>Avatar</span>,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo },
}));

vi.mock("@/components/ui/navigation-menu", () => ({
  NavigationMenu: ({ children }: { children: React.ReactNode }) => children,
  NavigationMenuList: ({ children }: { children: React.ReactNode }) => children,
  NavigationMenuItem: ({ children }: { children: React.ReactNode }) => children,
  NavigationMenuTrigger: ({
    children,
    ...props
  }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
  NavigationMenuContent: ({ children }: { children: React.ReactNode }) =>
    children,
  NavigationMenuLink: ({ children }: { children: React.ReactNode }) => children,
  navigationMenuTriggerStyle: () => "",
}));

vi.mock("@/components/ui/alert-dialog", async () => {
  const React = await import("react");
  const DialogContext = React.createContext<
    ((open: boolean) => void) | undefined
  >(undefined);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    AlertDialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) =>
      open ? (
        <DialogContext.Provider value={onOpenChange}>
          <div role="alertdialog">{children}</div>
        </DialogContext.Provider>
      ) : null,
    AlertDialogContent: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
    AlertDialogCancel: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    }) => {
      const onOpenChange = React.useContext(DialogContext);
      return (
        <button
          onClick={(event) => {
            onClick?.(event);
            onOpenChange?.(false);
          }}
        >
          {children}
        </button>
      );
    },
    AlertDialogAction: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    }) => {
      const onOpenChange = React.useContext(DialogContext);
      return (
        <button
          onClick={(event) => {
            onClick?.(event);
            onOpenChange?.(false);
          }}
        >
          {children}
        </button>
      );
    },
  };
});

import {
  deckSnapshotStorageKey,
  DeckNavigationGuardLink,
  DeckNavigationGuardProvider,
  useRegisterDeckNavigationGuard,
} from "./deck-navigation-guard";
import { Navbar } from "@/components/nav/navbar";
import { LobbyInviteToasts } from "@/components/lobbies/lobby-invite-toast";
import { ApiError } from "@/lib/api-client";
import {
  createInitialState,
  deckBuilderReducer,
  serializeDeckBuilderState,
} from "@/lib/deck-builder/state";

let renderer: ReactTestRenderer | null = null;

interface MockNavigateEvent extends Event {
  canIntercept: boolean;
  destination: { key: string; url: string };
  navigationType: "push" | "reload" | "replace" | "traverse";
}

class MockNavigation extends EventTarget {
  completedTraversal: MockNavigateEvent | null = null;
  traversal = () => ({
    committed: Promise.resolve() as Promise<unknown>,
    finished: Promise.resolve() as Promise<unknown>,
  });
  traverseTo = vi.fn((key: string) => {
    this.completedTraversal = navigateEvent({ key });
    this.dispatchEvent(this.completedTraversal);
    return this.traversal();
  });
}

function navigateEvent({
  canIntercept = true,
  cancelable = true,
  key = "destination-key",
  navigationType = "traverse",
  url = "http://localhost:3000/decks",
}: {
  canIntercept?: boolean;
  cancelable?: boolean;
  key?: string;
  navigationType?: MockNavigateEvent["navigationType"];
  url?: string;
} = {}) {
  return Object.assign(new Event("navigate", { cancelable }), {
    canIntercept,
    destination: { key, url },
    navigationType,
  }) as MockNavigateEvent;
}

function installNavigationApi() {
  const navigation = new MockNavigation();
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: navigation,
  });
  return navigation;
}

function EditorRegistration({
  isDirty,
  name = "Straw Hat Deck",
}: {
  isDirty: boolean;
  name?: string;
}) {
  useRegisterDeckNavigationGuard(isDirty, name);
  return null;
}

function SaveRevisionHarness() {
  const [state, dispatch] = useReducer(
    deckBuilderReducer,
    undefined,
    createInitialState
  );
  useRegisterDeckNavigationGuard(state.isDirty, state.name);

  return (
    <>
      <button
        onClick={() => dispatch({ type: "SET_NAME", name: "Saving name" })}
      >
        Edit before save
      </button>
      <button onClick={() => dispatch({ type: "SAVE_START" })}>
        Start save
      </button>
      <button
        onClick={() => dispatch({ type: "SET_NAME", name: "Newer name" })}
      >
        Edit during save
      </button>
      <button onClick={() => dispatch({ type: "SAVE_SUCCESS", id: "deck-1" })}>
        Finish save
      </button>
      <DeckNavigationGuardLink href="/">Leave</DeckNavigationGuardLink>
    </>
  );
}

const SAVED_AT = new Date("2026-07-18T12:00:00.000Z");

function SnapshotHarness({
  deckId = "deck-1",
  lastSavedAt = SAVED_AT,
}: {
  deckId?: string | null;
  lastSavedAt?: Date | null;
} = {}) {
  const [state, dispatch] = useReducer(deckBuilderReducer, undefined, () => ({
    ...createInitialState(),
    id: deckId,
    name: "Saved deck",
    lastSavedAt,
  }));
  useRegisterDeckNavigationGuard(state.isDirty, state.name, {
    state,
    dispatch,
    deckId,
  });

  return (
    <>
      <span>{state.name}</span>
      <button
        onClick={() => dispatch({ type: "SET_NAME", name: "Unsaved snapshot" })}
      >
        Edit deck
      </button>
      <button onClick={() => dispatch({ type: "SAVE_START" })}>
        Start snapshot save
      </button>
      <button onClick={() => dispatch({ type: "SAVE_SUCCESS", id: "deck-1" })}>
        Finish snapshot save
      </button>
      <DeckNavigationGuardLink href="/decks">
        Leave snapshot
      </DeckNavigationGuardLink>
    </>
  );
}

async function renderGuard(children: React.ReactNode, isDirty = true) {
  await act(async () => {
    renderer = create(
      <DeckNavigationGuardProvider>
        <EditorRegistration isDirty={isDirty} />
        {children}
      </DeckNavigationGuardProvider>
    );
  });
}

async function renderSnapshotHarness(
  props: Parameters<typeof SnapshotHarness>[0] = {}
) {
  await act(async () => {
    renderer = create(
      <DeckNavigationGuardProvider>
        <SnapshotHarness {...props} />
      </DeckNavigationGuardProvider>
    );
  });
}

function seedSnapshot({
  deckId = "deck-1",
  lastSavedAt = SAVED_AT,
}: {
  deckId?: string | null;
  lastSavedAt?: Date | null;
} = {}) {
  const clean = {
    ...createInitialState(),
    id: deckId,
    name: "Saved deck",
    lastSavedAt,
  };
  const dirty = deckBuilderReducer(clean, {
    type: "SET_NAME",
    name: "Unsaved snapshot",
  });
  window.sessionStorage.setItem(
    deckSnapshotStorageKey(deckId),
    serializeDeckBuilderState(dirty)
  );
}

function clickEvent(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const event = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
  return event as unknown as MouseEvent<HTMLAnchorElement>;
}

function button(label: string) {
  return renderer!.root
    .findAllByType("button")
    .find((candidate) => candidate.props.children === label);
}

beforeEach(() => {
  const sessionValues = new Map<string, string>();
  mocks.pathname = "/decks/deck-1";
  mocks.push.mockReset();
  mocks.apiGet.mockReset();
  mocks.apiPost.mockReset();
  mocks.subscribers.clear();
  mocks.subscribe.mockReset();
  mocks.subscribe.mockImplementation(
    (type: string, handler: (event: Record<string, unknown>) => void) => {
      mocks.subscribers.set(type, handler);
      return () => {
        mocks.subscribers.delete(type);
      };
    }
  );
  mocks.toastError.mockReset();
  mocks.toastInfo.mockReset();
  mocks.apiGet.mockResolvedValue({
    data: [
      {
        id: "invite-1",
        lobbyId: "lobby-1",
        fromUserId: "host-1",
        toUserId: "user-1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        fromUser: {
          id: "host-1",
          username: "luffy",
          name: "Luffy",
          image: null,
        },
        lobby: {
          joinCode: "ABCD",
          format: "Standard",
          mode: "PVP",
          hostUsername: "luffy",
        },
      },
    ],
  });
  mocks.apiPost.mockResolvedValue({ data: {} });
  renderer = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    history: { state: null },
    location: {
      href: "http://localhost:3000/decks/deck-1",
      origin: "http://localhost:3000",
    },
    sessionStorage: {
      clear: () => {
        sessionValues.clear();
      },
      getItem: (key: string) => sessionValues.get(key) ?? null,
      removeItem: (key: string) => {
        sessionValues.delete(key);
      },
      setItem: (key: string, value: string) => {
        sessionValues.set(key, value);
      },
    },
  } as unknown as Window);
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
  }
  Reflect.deleteProperty(window, "navigation");
  vi.unstubAllGlobals();
});

describe("deck builder navigation guard", () => {
  it("blocks a cancelable same-origin traversal while the editor is dirty", async () => {
    const navigation = installNavigationApi();
    await renderGuard(null);
    const event = navigateEvent();

    await act(async () => {
      navigation.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(navigation.traverseTo).not.toHaveBeenCalled();
    expect(button("Stay")).toBeDefined();
  });

  it("re-performs the blocked traversal after discard is confirmed", async () => {
    const navigation = installNavigationApi();
    await renderGuard(null);
    const event = navigateEvent({ key: "back-entry" });

    await act(async () => {
      navigation.dispatchEvent(event);
    });
    await act(async () => button("Discard & Leave")?.props.onClick());

    expect(navigation.traverseTo).toHaveBeenCalledOnce();
    expect(navigation.traverseTo).toHaveBeenCalledWith("back-entry");
    expect(navigation.completedTraversal?.defaultPrevented).toBe(false);
  });

  it("snapshots a dirty deck and closes the dialog when a second traversal cannot be canceled", async () => {
    const navigation = installNavigationApi();
    await renderSnapshotHarness();
    await act(async () => button("Edit deck")?.props.onClick());

    await act(async () => {
      navigation.dispatchEvent(navigateEvent({ key: "first-back" }));
    });
    expect(button("Stay")).toBeDefined();

    await act(async () => {
      navigation.dispatchEvent(
        navigateEvent({ cancelable: false, key: "second-back" })
      );
    });

    expect(button("Stay")).toBeUndefined();
    const snapshot = window.sessionStorage.getItem(
      deckSnapshotStorageKey("deck-1")
    );
    expect(snapshot).toContain("Unsaved snapshot");

    await act(async () => renderer?.unmount());
    renderer = null;
    await renderSnapshotHarness();

    expect(renderer!.root.findByType("span").props.children).toBe(
      "Unsaved snapshot"
    );
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "Restored unsaved changes",
      expect.objectContaining({ action: expect.any(Object) })
    );
  });

  it("restores a matching snapshot and offers to discard the recovered changes", async () => {
    seedSnapshot();
    await renderSnapshotHarness();

    expect(renderer!.root.findByType("span").props.children).toBe(
      "Unsaved snapshot"
    );
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "Restored unsaved changes",
      expect.objectContaining({ action: expect.any(Object) })
    );

    const restoreToast = mocks.toastInfo.mock.calls.at(-1)?.[1] as {
      action: { onClick: () => void };
    };
    await act(async () => restoreToast.action.onClick());

    expect(renderer!.root.findByType("span").props.children).toBe("Saved deck");
    expect(
      window.sessionStorage.getItem(deckSnapshotStorageKey("deck-1"))
    ).toBeNull();
  });

  it("keeps a newer saved deck intact and discards the stale snapshot", async () => {
    seedSnapshot();
    await renderSnapshotHarness({
      lastSavedAt: new Date("2026-07-18T13:00:00.000Z"),
    });

    expect(button("Keep newer saved version")).toBeDefined();
    expect(renderer!.root.findByType("span").props.children).toBe("Saved deck");
    expect(mocks.toastInfo).not.toHaveBeenCalled();

    await act(async () => button("Keep newer saved version")?.props.onClick());

    expect(renderer!.root.findByType("span").props.children).toBe("Saved deck");
    expect(
      window.sessionStorage.getItem(deckSnapshotStorageKey("deck-1"))
    ).toBeNull();
  });

  it("restores a stale snapshot only after explicit confirmation", async () => {
    seedSnapshot();
    await renderSnapshotHarness({
      lastSavedAt: new Date("2026-07-18T13:00:00.000Z"),
    });

    expect(renderer!.root.findByType("span").props.children).toBe("Saved deck");
    await act(async () => button("Restore unsaved changes")?.props.onClick());

    expect(renderer!.root.findByType("span").props.children).toBe(
      "Unsaved snapshot"
    );
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "Restored unsaved changes",
      expect.objectContaining({ action: expect.any(Object) })
    );
    expect(
      window.sessionStorage.getItem(deckSnapshotStorageKey("deck-1"))
    ).not.toBeNull();
  });

  it("auto-restores a new-deck snapshot without a server version", async () => {
    seedSnapshot({ deckId: null, lastSavedAt: null });
    await renderSnapshotHarness({ deckId: null, lastSavedAt: null });

    expect(button("Keep newer saved version")).toBeUndefined();
    expect(renderer!.root.findByType("span").props.children).toBe(
      "Unsaved snapshot"
    );
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "Restored unsaved changes",
      expect.objectContaining({ action: expect.any(Object) })
    );
  });

  it("clears a restored snapshot after save or confirmed discard", async () => {
    seedSnapshot();
    await renderSnapshotHarness();
    await act(async () => button("Start snapshot save")?.props.onClick());
    await act(async () => button("Finish snapshot save")?.props.onClick());
    expect(
      window.sessionStorage.getItem(deckSnapshotStorageKey("deck-1"))
    ).toBeNull();

    await act(async () => renderer?.unmount());
    renderer = null;
    seedSnapshot();
    await renderSnapshotHarness();
    await act(async () =>
      renderer!.root.findByType("a").props.onClick(clickEvent())
    );
    await act(async () => button("Discard & Leave")?.props.onClick());

    expect(
      window.sessionStorage.getItem(deckSnapshotStorageKey("deck-1"))
    ).toBeNull();
  });

  it("handles both rejected traversal promises when the destination was disposed", async () => {
    const navigation = installNavigationApi();
    navigation.traversal = () => ({
      committed: Promise.reject(new Error("disposed")),
      finished: Promise.reject(new Error("disposed")),
    });
    await renderGuard(null);

    await act(async () => {
      navigation.dispatchEvent(navigateEvent({ key: "disposed-entry" }));
    });
    await act(async () => button("Discard & Leave")?.props.onClick());
    await act(async () => Promise.resolve());

    expect(button("Stay")).toBeUndefined();
    expect(mocks.toastError).toHaveBeenCalledOnce();

    const retry = navigateEvent({ key: "disposed-entry" });
    await act(async () => {
      navigation.dispatchEvent(retry);
    });
    expect(retry.defaultPrevented).toBe(true);
  });

  it("keeps the URL and history state unchanged when traversal is canceled", async () => {
    const navigation = installNavigationApi();
    const originalUrl = window.location.href;
    const originalState = window.history.state;
    await renderGuard(null);

    await act(async () => {
      navigation.dispatchEvent(navigateEvent());
    });
    await act(async () => button("Stay")?.props.onClick());

    expect(navigation.traverseTo).not.toHaveBeenCalled();
    expect(window.location.href).toBe(originalUrl);
    expect(window.history.state).toBe(originalState);
  });

  it("passes traversals through when the editor is clean", async () => {
    const navigation = installNavigationApi();
    await renderGuard(null, false);
    const event = navigateEvent();

    await act(async () => {
      navigation.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(button("Stay")).toBeUndefined();
  });

  it("removes the traversal guard when dirty state clears or the editor unmounts", async () => {
    const navigation = installNavigationApi();
    await renderGuard(null);

    await act(async () => {
      renderer?.update(
        <DeckNavigationGuardProvider>
          <EditorRegistration isDirty={false} />
        </DeckNavigationGuardProvider>
      );
    });
    const afterSave = navigateEvent({ key: "after-save" });
    navigation.dispatchEvent(afterSave);
    expect(afterSave.defaultPrevented).toBe(false);

    await act(async () => renderer?.unmount());
    renderer = null;
    const afterUnmount = navigateEvent({ key: "after-unmount" });
    navigation.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });

  it("ignores non-traversal and non-interceptable navigation events", async () => {
    const navigation = installNavigationApi();
    await renderGuard(null);
    const events = [
      navigateEvent({ navigationType: "push" }),
      navigateEvent({ cancelable: false }),
      navigateEvent({ canIntercept: false }),
      navigateEvent({ url: "https://example.com/decks" }),
    ];

    for (const event of events) navigation.dispatchEvent(event);

    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
    expect(button("Stay")).toBeUndefined();
  });

  it("keeps OPT-490 behavior when the Navigation API is unavailable", async () => {
    expect("navigation" in window).toBe(false);
    await renderGuard(
      <DeckNavigationGuardLink href="/decks">Back</DeckNavigationGuardLink>
    );
    const event = clickEvent();

    await act(async () => renderer!.root.findByType("a").props.onClick(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(button("Stay")).toBeDefined();
  });

  it("guards every global Navbar destination while the editor is dirty", async () => {
    await renderGuard(<Navbar />);

    const links = renderer!.root.findAllByType("a");
    expect(links.map((link) => link.props.href)).toEqual([
      "/lobbies",
      "/",
      "/decks",
      "/decks/new",
      "/cards",
      "/sets",
      "/onboarding",
    ]);

    for (const link of links) {
      const event = clickEvent();
      await act(async () => link.props.onClick(event));

      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(button("Stay")).toBeDefined();

      await act(async () => button("Stay")?.props.onClick());
      expect(
        renderer!.root.findAllByProps({ role: "alertdialog" })
      ).toHaveLength(0);
    }
  });

  it("renders the complete navbar unconditionally", async () => {
    await renderGuard(<Navbar />, false);

    const links = renderer!.root.findAllByType("a");
    expect(links.map((link) => link.props.href)).toEqual([
      "/lobbies",
      "/",
      "/decks",
      "/decks/new",
      "/cards",
      "/sets",
      "/onboarding",
    ]);
  });

  it.each([
    ["/", "Home", "aria-current"],
    ["/cards/OP01-001", "Cards", "data-active"],
    ["/sets/OP01", "Cards", "data-active"],
    ["/admin/cards/new", "Cards", "data-active"],
    ["/admin/sets", "Cards", "data-active"],
    ["/lobbies/lobby-1", "Play", "aria-current"],
    ["/game", "Play", "aria-current"],
    ["/decks/deck-1", "Decks", "data-active"],
  ])(
    "marks the matching nav item active for %s",
    async (pathname, label, activeProp) => {
      mocks.pathname = pathname;
      await renderGuard(<Navbar />, false);

      const item = [
        ...renderer!.root.findAllByType("a"),
        ...renderer!.root.findAllByType("button"),
      ].find((candidate) => candidate.children.includes(label));

      expect(item?.props[activeProp]).toBeTruthy();
    }
  );

  it("keeps dirty editor state on cancel and navigates only after confirmation", async () => {
    await renderGuard(
      <DeckNavigationGuardLink href="/decks">Back</DeckNavigationGuardLink>
    );
    const link = renderer!.root.findByType("a");

    await act(async () => link.props.onClick(clickEvent()));
    await act(async () => button("Stay")?.props.onClick());
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => link.props.onClick(clickEvent()));
    await act(async () => button("Discard & Leave")?.props.onClick());
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/decks");
  });

  it("does not prompt for clean editors, modified clicks, or the current route", async () => {
    await renderGuard(
      <DeckNavigationGuardLink href="/">Home</DeckNavigationGuardLink>,
      false
    );
    const cleanLink = renderer!.root.findByType("a");
    const cleanEvent = clickEvent();

    await act(async () => cleanLink.props.onClick(cleanEvent));
    expect(cleanEvent.preventDefault).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByProps({ role: "alertdialog" })).toHaveLength(
      0
    );

    await act(async () => {
      renderer?.update(
        <DeckNavigationGuardProvider>
          <EditorRegistration isDirty />
          <DeckNavigationGuardLink href="/decks/deck-1">
            Current editor
          </DeckNavigationGuardLink>
        </DeckNavigationGuardProvider>
      );
    });
    const currentLink = renderer!.root.findByType("a");
    const currentEvent = clickEvent();
    await act(async () => currentLink.props.onClick(currentEvent));
    expect(currentEvent.preventDefault).not.toHaveBeenCalled();

    mocks.pathname = "/decks/deck-1";
    await act(async () => {
      renderer?.update(
        <DeckNavigationGuardProvider>
          <EditorRegistration isDirty />
          <DeckNavigationGuardLink href="/">Home</DeckNavigationGuardLink>
        </DeckNavigationGuardProvider>
      );
    });
    const modifiedEvent = clickEvent({ metaKey: true });
    await act(async () =>
      renderer!.root.findByType("a").props.onClick(modifiedEvent)
    );
    expect(modifiedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("defers dirty lobby invite acceptance until discard is confirmed", async () => {
    await renderGuard(<LobbyInviteToasts />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => button("Join")?.props.onClick());
    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(button("Stay")).toBeDefined();

    await act(async () => button("Discard & Leave")?.props.onClick());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.apiPost).toHaveBeenCalledOnce();
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/lobby-invites/invite-1/accept",
      {}
    );
    expect(mocks.push).toHaveBeenCalledWith("/lobbies/lobby-1");
  });

  it("uses the party-switch confirmation before accepting a hosted invite", async () => {
    mocks.apiPost
      .mockRejectedValueOnce(
        new ApiError("Switching parties requires confirmation", 409, {
          code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
          details: {
            currentLobbyId: "current-lobby",
            targetCode: "ABC123",
            guestName: "Nami",
            hasPendingInvite: false,
          },
        })
      )
      .mockResolvedValueOnce({ data: { lobbyId: "lobby-1" } });
    await renderGuard(<LobbyInviteToasts />, false);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => button("Join")?.props.onClick());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button("Disband & join")).toBeDefined();
    expect(JSON.stringify(renderer?.toJSON())).toContain("Nami");

    await act(async () =>
      button("Disband & join")?.props.onClick({ preventDefault: vi.fn() })
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      2,
      "/api/lobby-invites/invite-1/accept",
      { confirmDisbandLobbyId: "current-lobby" }
    );
    expect(mocks.push).toHaveBeenCalledWith("/lobbies/lobby-1");
  });

  it("explains a party disband and resolves the ex-guest to Play", async () => {
    await renderGuard(<LobbyInviteToasts />, false);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mocks.subscribers.get("lobby:party_disbanded")?.({
        type: "lobby:party_disbanded",
        lobbyId: "current-lobby",
        hostName: "Luffy",
      });
    });

    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "Luffy disbanded the party. You've been returned to your own lobby."
    );
    expect(mocks.push).toHaveBeenCalledWith("/lobbies");
  });

  it("still prompts after an edit made while a save request was pending", async () => {
    await act(async () => {
      renderer = create(
        <DeckNavigationGuardProvider>
          <SaveRevisionHarness />
        </DeckNavigationGuardProvider>
      );
    });

    for (const label of [
      "Edit before save",
      "Start save",
      "Edit during save",
      "Finish save",
    ]) {
      await act(async () => button(label)?.props.onClick());
    }

    const leave = renderer!.root.findByType("a");
    const event = clickEvent();
    await act(async () => leave.props.onClick(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(button("Stay")).toBeDefined();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
