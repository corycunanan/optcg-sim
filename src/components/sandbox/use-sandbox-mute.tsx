"use client";

// Global mute preference for the Animation Sandbox (OPT-297). Default is
// muted; the value persists across page reloads via `localStorage`. The
// stub button in `playback-control-bar.tsx` (OPT-291) was the seed for
// this — moved here so any future audio-emitting component (effect cues,
// counter pulses, victory stings) can read the same value through context
// instead of re-reading localStorage themselves.
//
// Two pieces, mirroring the OPT-286 / OPT-289 split:
//
//   - `readSandboxMutePreference` / `writeSandboxMutePreference`: pure
//     helpers over `localStorage`. Safe to call from anywhere; tested
//     directly under vitest's `environment: "node"` by stubbing
//     `globalThis.localStorage`.
//   - `SandboxMuteProvider` + `useSandboxMute`: React surface. The
//     provider hydrates from storage on mount (SSR cannot read storage,
//     so the first paint is always the muted default) and writes back on
//     every change.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const SANDBOX_MUTE_STORAGE_KEY = "sandbox:muted";
export const SANDBOX_MUTE_DEFAULT = true;

export interface SandboxMuteContextValue {
  muted: boolean;
  setMuted: (next: boolean) => void;
  toggle: () => void;
}

const SandboxMuteContext = createContext<SandboxMuteContextValue | null>(null);

// ─── Pure helpers ──────────────────────────────────────────────────────

function getStorage(): Storage | null {
  if (typeof globalThis === "undefined") return null;
  const candidate = (globalThis as { localStorage?: Storage }).localStorage;
  return candidate ?? null;
}

/** Reads the persisted preference. Returns `SANDBOX_MUTE_DEFAULT` when
 *  storage is unavailable (SSR, sandboxed iframe, disabled cookies) or
 *  when the stored value isn't one of the two recognized strings. */
export function readSandboxMutePreference(): boolean {
  const storage = getStorage();
  if (!storage) return SANDBOX_MUTE_DEFAULT;
  try {
    const raw = storage.getItem(SANDBOX_MUTE_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return SANDBOX_MUTE_DEFAULT;
  } catch {
    return SANDBOX_MUTE_DEFAULT;
  }
}

/** Persists the preference. Silent no-op when storage is unavailable or
 *  rejects the write — the in-memory state still updates, so the toggle
 *  remains responsive even when persistence is blocked. */
export function writeSandboxMutePreference(muted: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SANDBOX_MUTE_STORAGE_KEY, muted ? "true" : "false");
  } catch {
    // Storage quota or privacy-mode rejection — keep the UI working.
  }
}

// ─── React surface ─────────────────────────────────────────────────────

export function SandboxMuteProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState<boolean>(SANDBOX_MUTE_DEFAULT);

  // Hydrate from storage after mount. SSR cannot read localStorage, so the
  // first server-rendered paint is always the muted default; this brings the
  // stored preference back on the client.
  useEffect(() => {
    const stored = readSandboxMutePreference();
    setMutedState((prev) => (prev === stored ? prev : stored));
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeSandboxMutePreference(next);
  }, []);

  const toggle = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      writeSandboxMutePreference(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ muted, setMuted, toggle }),
    [muted, setMuted, toggle],
  );

  return (
    <SandboxMuteContext.Provider value={value}>
      {children}
    </SandboxMuteContext.Provider>
  );
}

export function useSandboxMute(): SandboxMuteContextValue {
  const ctx = useContext(SandboxMuteContext);
  if (!ctx) {
    throw new Error(
      "useSandboxMute must be used inside a <SandboxMuteProvider>",
    );
  }
  return ctx;
}
