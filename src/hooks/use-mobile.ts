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
 * `useSyncExternalStore` is a subscription rather than an effect that copies
 * the match into state: no stale value, no tearing, no second source of the
 * breakpoint. It does not make the answer arrive earlier. React serves
 * `getServerSnapshot` on the server AND through the hydration render, then
 * flips to the live match right after hydration — so on a phone the desktop
 * shape still mounts for one commit. Anything that must be right on the first
 * paint splits on CSS (`hidden md:block`) instead of on this hook.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
