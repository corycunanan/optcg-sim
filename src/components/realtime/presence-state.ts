/**
 * Pure presence-map reducer.
 *
 * Lifted out of the provider so the merge semantics are testable without
 * React. Three inputs: a server-side seed, a `presence:friend_online` event,
 * and a `presence:friend_offline` event. Returns the same map reference when
 * nothing changes so React skips re-renders downstream.
 */

export interface PresenceEntry {
  online: boolean;
  /** ISO timestamp; null if the user has never been seen. */
  lastSeen: string | null;
}

export type PresenceMap = Readonly<Record<string, PresenceEntry>>;

export const EMPTY_PRESENCE: PresenceMap = Object.freeze({});

export function applyPresenceSeed(
  current: PresenceMap,
  seed: Record<string, PresenceEntry>,
): PresenceMap {
  let changed = false;
  const next: Record<string, PresenceEntry> = { ...current };
  for (const [id, entry] of Object.entries(seed)) {
    const existing = current[id];
    if (
      existing
      && existing.online === entry.online
      && existing.lastSeen === entry.lastSeen
    ) continue;
    // Clone — caller may keep mutating `seed` after the merge; storing the
    // raw reference would alias reducer state to caller-owned objects.
    next[id] = { online: entry.online, lastSeen: entry.lastSeen };
    changed = true;
  }
  return changed ? next : current;
}

export function applyOnlineEvent(
  current: PresenceMap,
  userId: string,
): PresenceMap {
  const existing = current[userId];
  if (existing && existing.online) return current;
  return {
    ...current,
    [userId]: { online: true, lastSeen: existing?.lastSeen ?? null },
  };
}

export function applyOfflineEvent(
  current: PresenceMap,
  userId: string,
  lastSeen: string,
): PresenceMap {
  const existing = current[userId];
  if (existing && !existing.online && existing.lastSeen === lastSeen) {
    return current;
  }
  return { ...current, [userId]: { online: false, lastSeen } };
}
