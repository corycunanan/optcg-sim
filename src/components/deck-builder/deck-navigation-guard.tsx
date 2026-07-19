"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DirtyDeckEditor {
  isDirty: boolean;
  name: string;
}

interface DeckNavigationDestination {
  key: string;
  url: string;
}

interface DeckNavigateEvent extends Event {
  canIntercept: boolean;
  destination: DeckNavigationDestination;
  navigationType: "push" | "reload" | "replace" | "traverse";
}

interface DeckNavigation extends EventTarget {
  traverseTo: (key: string) => {
    committed: Promise<unknown>;
    finished: Promise<unknown>;
  };
}

interface DeckNavigationGuardContextValue {
  requestNavigation: (href: string) => boolean;
  requestLeave: (proceed: () => void) => boolean;
  setEditorState: (editor: DirtyDeckEditor | null) => void;
}

const DeckNavigationGuardContext =
  createContext<DeckNavigationGuardContextValue | null>(null);

export function useDeckNavigationGuard() {
  const context = useContext(DeckNavigationGuardContext);
  if (!context) {
    throw new Error(
      "useDeckNavigationGuard must be used within DeckNavigationGuardProvider"
    );
  }
  return context;
}

export function DeckNavigationGuardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [editor, setEditorState] = useState<DirtyDeckEditor | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const allowedTraversalKey = useRef<string | null>(null);

  const requestLeave = useCallback(
    (proceed: () => void) => {
      if (!editor?.isDirty) return false;
      setPendingLeave(() => proceed);
      return true;
    },
    [editor]
  );

  const requestNavigation = useCallback(
    (href: string) => {
      return requestLeave(() => router.push(href));
    },
    [requestLeave, router]
  );

  useEffect(() => {
    if (!editor?.isDirty || !("navigation" in window)) return;

    const navigation = window.navigation as unknown as DeckNavigation;
    const handleNavigate = (event: Event) => {
      const navigateEvent = event as DeckNavigateEvent;
      if (
        navigateEvent.navigationType !== "traverse" ||
        !navigateEvent.cancelable ||
        !navigateEvent.canIntercept ||
        new URL(navigateEvent.destination.url).origin !== window.location.origin
      ) {
        return;
      }

      const destinationKey = navigateEvent.destination.key;
      if (allowedTraversalKey.current === destinationKey) {
        allowedTraversalKey.current = null;
        return;
      }

      const blocked = requestLeave(() => {
        allowedTraversalKey.current = destinationKey;
        const { finished } = navigation.traverseTo(destinationKey);
        void finished.catch(() => {
          if (allowedTraversalKey.current === destinationKey) {
            allowedTraversalKey.current = null;
          }
        });
      });

      if (blocked) navigateEvent.preventDefault();
    };

    navigation.addEventListener("navigate", handleNavigate);
    return () => {
      allowedTraversalKey.current = null;
      navigation.removeEventListener("navigate", handleNavigate);
    };
  }, [editor?.isDirty, requestLeave]);

  const context = useMemo(
    () => ({ requestLeave, requestNavigation, setEditorState }),
    [requestLeave, requestNavigation]
  );

  const confirmLeave = () => {
    if (!pendingLeave) return;
    const proceed = pendingLeave;
    setPendingLeave(null);
    proceed();
  };

  return (
    <DeckNavigationGuardContext.Provider value={context}>
      {children}
      <AlertDialog
        open={pendingLeave !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLeave(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{editor?.name}&rdquo; has unsaved changes. Leave anyway and
              discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmLeave}>
              Discard &amp; Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeckNavigationGuardContext.Provider>
  );
}

export function useRegisterDeckNavigationGuard(isDirty: boolean, name: string) {
  const { setEditorState } = useDeckNavigationGuard();

  useEffect(() => {
    setEditorState({ isDirty, name });
  }, [isDirty, name, setEditorState]);

  useEffect(
    () => () => {
      setEditorState(null);
    },
    [setEditorState]
  );
}

type DeckNavigationGuardLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href"
> & {
  href: string;
};

export function DeckNavigationGuardLink({
  href,
  onClick,
  ...props
}: DeckNavigationGuardLinkProps) {
  const pathname = usePathname();
  const { requestNavigation } = useDeckNavigationGuard();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === href
    ) {
      return;
    }

    if (requestNavigation(href)) event.preventDefault();
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
