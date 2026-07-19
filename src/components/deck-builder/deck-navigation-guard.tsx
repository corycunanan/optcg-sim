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
  type Dispatch,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  deserializeDeckBuilderState,
  serializeDeckBuilderState,
  type DeckBuilderAction,
  type DeckBuilderState,
} from "@/lib/deck-builder/state";

interface DirtyDeckEditor {
  isDirty: boolean;
  name: string;
  clearSnapshot: () => void;
  snapshotDirtyState: () => void;
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
  requestSnapshotRecovery: (recovery: SnapshotRecoveryChoice) => void;
  setEditorState: (editor: DirtyDeckEditor | null) => void;
}

interface SnapshotRecoveryChoice {
  name: string;
  keepNewerSavedVersion: () => void;
  restoreUnsavedChanges: () => void;
}

const DeckNavigationGuardContext =
  createContext<DeckNavigationGuardContextValue | null>(null);

const DECK_SNAPSHOT_PREFIX = "optcg:deck-builder:snapshot:";

export function deckSnapshotStorageKey(deckId: string | null) {
  return `${DECK_SNAPSHOT_PREFIX}${deckId ?? "new"}`;
}

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
  const [pendingSnapshotRecovery, setPendingSnapshotRecovery] =
    useState<SnapshotRecoveryChoice | null>(null);
  const allowedTraversalKey = useRef<string | null>(null);

  const requestSnapshotRecovery = useCallback(
    (recovery: SnapshotRecoveryChoice) => {
      setPendingSnapshotRecovery(recovery);
    },
    []
  );

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
      if (navigateEvent.navigationType !== "traverse") {
        return;
      }

      if (!navigateEvent.cancelable || !navigateEvent.canIntercept) {
        // The HTML anti-history-trapping rule makes an immediate second Back
        // non-cancelable. The platform must navigate, so preserve the dirty
        // deck for restoration and release the now-obsolete guard cleanly.
        editor.snapshotDirtyState();
        setPendingLeave(null);
        allowedTraversalKey.current = null;
        navigation.removeEventListener("navigate", handleNavigate);
        setEditorState(null);
        return;
      }

      if (
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
        let traversal;
        try {
          traversal = navigation.traverseTo(destinationKey);
        } catch {
          allowedTraversalKey.current = null;
          toast.error(
            "Couldn't complete navigation. You're still on this deck."
          );
          return;
        }

        void Promise.allSettled([traversal.committed, traversal.finished]).then(
          (results) => {
            if (results.some((result) => result.status === "rejected")) {
              toast.error(
                "Couldn't complete navigation. You're still on this deck."
              );
            }
            if (allowedTraversalKey.current === destinationKey) {
              allowedTraversalKey.current = null;
            }
          }
        );
      });

      if (blocked) navigateEvent.preventDefault();
    };

    navigation.addEventListener("navigate", handleNavigate);
    return () => {
      allowedTraversalKey.current = null;
      navigation.removeEventListener("navigate", handleNavigate);
    };
  }, [editor, requestLeave]);

  const context = useMemo(
    () => ({
      requestLeave,
      requestNavigation,
      requestSnapshotRecovery,
      setEditorState,
    }),
    [requestLeave, requestNavigation, requestSnapshotRecovery]
  );

  const confirmLeave = () => {
    if (!pendingLeave) return;
    const proceed = pendingLeave;
    editor?.clearSnapshot();
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
      <AlertDialog
        open={pendingSnapshotRecovery !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSnapshotRecovery(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Newer saved version exists</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingSnapshotRecovery?.name}&rdquo; was saved elsewhere
              after these unsaved changes were captured. Choose which version to
              keep editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              autoFocus
              onClick={() => pendingSnapshotRecovery?.keepNewerSavedVersion()}
            >
              Keep newer saved version
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingSnapshotRecovery?.restoreUnsavedChanges()}
            >
              Restore unsaved changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeckNavigationGuardContext.Provider>
  );
}

interface DeckNavigationRecovery {
  deckId: string | null;
  dispatch: Dispatch<DeckBuilderAction>;
  state: DeckBuilderState;
}

export function useRegisterDeckNavigationGuard(
  isDirty: boolean,
  name: string,
  recovery?: DeckNavigationRecovery
) {
  const { requestSnapshotRecovery, setEditorState } = useDeckNavigationGuard();
  const deckId = recovery?.deckId ?? null;
  const dispatch = recovery?.dispatch;
  const state = recovery?.state;
  const storageKey = deckSnapshotStorageKey(deckId);
  const attemptedRestoreKey = useRef<string | null>(null);
  const wasDirty = useRef(isDirty);

  const clearSnapshot = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }, [storageKey]);

  const snapshotDirtyState = useCallback(() => {
    if (!state?.isDirty) return;
    try {
      window.sessionStorage.setItem(
        storageKey,
        serializeDeckBuilderState(state)
      );
    } catch {
      // Best effort only: the traversal cannot be canceled by platform rule.
    }
  }, [state, storageKey]);

  useEffect(() => {
    setEditorState({
      isDirty,
      name,
      clearSnapshot,
      snapshotDirtyState,
    });
  }, [clearSnapshot, isDirty, name, setEditorState, snapshotDirtyState]);

  useEffect(() => {
    if (
      !state ||
      !dispatch ||
      attemptedRestoreKey.current === storageKey ||
      state.id !== deckId ||
      state.isDirty
    ) {
      return;
    }
    attemptedRestoreKey.current = storageKey;

    let serialized: string | null = null;
    try {
      serialized = window.sessionStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!serialized) return;

    const snapshot = deserializeDeckBuilderState(serialized);
    if (!snapshot || snapshot.id !== deckId) {
      clearSnapshot();
      return;
    }

    const baseline = state;
    const restoreSnapshot = () => {
      dispatch({ type: "RESTORE_SNAPSHOT", state: snapshot });
      toast.info("Restored unsaved changes", {
        action: {
          label: "Discard",
          onClick: () => {
            clearSnapshot();
            dispatch({
              type: "LOAD_DECK",
              state: {
                id: baseline.id,
                name: baseline.name,
                format: baseline.format,
                leader: baseline.leader,
                cards: baseline.cards,
                sleeveUrl: baseline.sleeveUrl,
                donArtUrl: baseline.donArtUrl,
                testOrder: baseline.testOrder,
                lastSavedAt: baseline.lastSavedAt,
              },
            });
          },
        },
      });
    };

    const snapshotSavedAt = snapshot.lastSavedAt?.getTime();
    const serverSavedAt = baseline.lastSavedAt?.getTime();
    if (
      deckId !== null &&
      serverSavedAt !== undefined &&
      snapshotSavedAt !== undefined &&
      serverSavedAt > snapshotSavedAt
    ) {
      requestSnapshotRecovery({
        name: baseline.name,
        keepNewerSavedVersion: clearSnapshot,
        restoreUnsavedChanges: restoreSnapshot,
      });
      return;
    }

    restoreSnapshot();
  }, [
    clearSnapshot,
    deckId,
    dispatch,
    requestSnapshotRecovery,
    state,
    storageKey,
  ]);

  useEffect(() => {
    if (wasDirty.current && !isDirty) clearSnapshot();
    wasDirty.current = isDirty;
  }, [clearSnapshot, isDirty]);

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
