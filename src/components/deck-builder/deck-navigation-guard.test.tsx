import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { MouseEvent } from "react";

const mocks = vi.hoisted(() => ({
  pathname: "/decks/deck-1",
  push: vi.fn(),
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
});
