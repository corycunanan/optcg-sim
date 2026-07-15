"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface DeckNavigationGuardContextValue {
  requestNavigation: (href: string) => boolean;
  setEditorState: (editor: DirtyDeckEditor | null) => void;
}

const DeckNavigationGuardContext =
  createContext<DeckNavigationGuardContextValue | null>(null);

function useDeckNavigationGuard() {
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
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const requestNavigation = useCallback(
    (href: string) => {
      if (!editor?.isDirty) return false;
      setPendingHref(href);
      return true;
    },
    [editor]
  );

  const context = useMemo(
    () => ({ requestNavigation, setEditorState }),
    [requestNavigation]
  );

  const confirmNavigation = () => {
    if (!pendingHref) return;
    const destination = pendingHref;
    setPendingHref(null);
    router.push(destination);
  };

  return (
    <DeckNavigationGuardContext.Provider value={context}>
      {children}
      <AlertDialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
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
            <AlertDialogAction
              variant="destructive"
              onClick={confirmNavigation}
            >
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
