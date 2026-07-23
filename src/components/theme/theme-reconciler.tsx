"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { resolveThemeName } from "@/lib/theme";

/**
 * Reconciles the SSR fast-path cookie after Auth.js establishes a session.
 *
 * The session theme comes from the existing JWT refresh DB lookup. A fetch is
 * made only when that authoritative value differs from the theme stamped into
 * the current document, so normal navigations and matching hard loads do not
 * add database work. The sync response lands the DB value in the cookie before
 * reloading once, making the next SSR response authoritative and FOUC-free.
 */
export function ThemeReconciler() {
  const { data: session, status } = useSession();
  const authoritativeTheme = resolveThemeName(session?.user.theme);

  useEffect(() => {
    if (status !== "authenticated") return;

    const renderedTheme = resolveThemeName(
      document.documentElement.dataset.theme
    );
    if (renderedTheme === authoritativeTheme) return;

    const controller = new AbortController();

    void fetch("/api/user/theme", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Theme reconciliation failed (${response.status})`);
        }
        if (!controller.signal.aborted) window.location.reload();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("[theme:reconcile] failed", error);
      });

    return () => controller.abort();
  }, [authoritativeTheme, status]);

  return null;
}
