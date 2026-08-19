import * as React from "react";

export const MOBILE_BREAKPOINT = 768;

const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

// The server has no viewport, so it renders the desktop shape — the same
// assumption the `md:` CSS variants make before hydration.
function getServerSnapshot() {
  return false;
}

/**
 * True below the `md` breakpoint (768px), the same width Tailwind's `md:`
 * variants switch at.
 *
 * `useSyncExternalStore` — not `useState` + `useEffect` — so the first client
 * render already knows the real width. Consumers that swap a whole subtree on
 * this value (the friends rail becomes a drawer) would otherwise mount the
 * desktop subtree, then throw it away one commit later.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
