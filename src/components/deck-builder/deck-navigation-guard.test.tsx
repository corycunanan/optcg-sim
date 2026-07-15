import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useReducer, type MouseEvent } from "react";

const mocks = vi.hoisted(() => ({
  pathname: "/decks/deck-1",
  push: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: () => <span>Avatar</span>,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/ui/navigation-menu", () => ({
  NavigationMenu: ({ children }: { children: React.ReactNode }) => children,
  NavigationMenuList: ({ children }: { children: React.ReactNode }) => children,
  NavigationMenuItem: ({ children }: { children: React.ReactNode }) => children,
  NavigationMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
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
    AlertDialogCancel: ({ children }: { children: React.ReactNode }) => {
      const onOpenChange = React.useContext(DialogContext);
      return <button onClick={() => onOpenChange?.(false)}>{children}</button>;
    },
    AlertDialogAction: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
    }) => {
      const onOpenChange = React.useContext(DialogContext);
      return (
        <button
          onClick={() => {
            onClick?.();
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
  DeckNavigationGuardLink,
  DeckNavigationGuardProvider,
  useRegisterDeckNavigationGuard,
} from "./deck-navigation-guard";
import { Navbar } from "@/components/nav/navbar";
import { LobbyInviteToasts } from "@/components/lobbies/lobby-invite-toast";
import {
  createInitialState,
  deckBuilderReducer,
} from "@/lib/deck-builder/state";

let renderer: ReactTestRenderer | null = null;

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
  mocks.pathname = "/decks/deck-1";
  mocks.push.mockReset();
  mocks.apiGet.mockReset();
  mocks.apiPost.mockReset();
  mocks.subscribe.mockClear();
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
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
  }
  vi.unstubAllGlobals();
});

describe("deck builder navigation guard", () => {
  it("guards every global Navbar destination while the editor is dirty", async () => {
    await renderGuard(<Navbar />);

    const links = renderer!.root.findAllByType("a");
    expect(links.map((link) => link.props.href)).toEqual([
      "/",
      "/",
      "/admin/cards",
      "/admin/sets",
      "/lobbies",
      "/sandbox",
      "/decks",
      "/decks/new",
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
      "/api/lobby-invites/invite-1/accept"
    );
    expect(mocks.push).toHaveBeenCalledWith("/lobbies/lobby-1");
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
