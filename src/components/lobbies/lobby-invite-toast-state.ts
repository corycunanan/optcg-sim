/**
 * Pure reducer for the recipient-side `<LobbyInviteToast>` state machine.
 *
 * Mirrors the `apply-friend-event.ts` / `apply-message-event.ts` shape:
 * a list, a few discriminated event types, idempotent in/out — nothing in
 * here knows about React.
 */

import type { SerializedLobbyInvite } from "@/types/realtime";

export interface InviteToastEntry extends SerializedLobbyInvite {
  /** Cached `Date.parse(expiresAt)` for cheap timer comparisons. */
  expiresAtMs: number;
}

export const EMPTY_INVITES: InviteToastEntry[] = [];

export function addInvite(
  state: InviteToastEntry[],
  invite: SerializedLobbyInvite,
): InviteToastEntry[] {
  if (state.some((existing) => existing.id === invite.id)) return state;
  const expiresAtMs = Date.parse(invite.expiresAt);
  return [
    { ...invite, expiresAtMs: Number.isNaN(expiresAtMs) ? 0 : expiresAtMs },
    ...state,
  ];
}

export function removeInvite(
  state: InviteToastEntry[],
  inviteId: string,
): InviteToastEntry[] {
  const next = state.filter((entry) => entry.id !== inviteId);
  return next.length === state.length ? state : next;
}

/**
 * Drop entries whose `expiresAt` is at-or-before `now`. Returns the same
 * reference when nothing changes so React skips downstream re-renders.
 */
export function expireInvites(
  state: InviteToastEntry[],
  now: number,
): InviteToastEntry[] {
  const next = state.filter((entry) => entry.expiresAtMs > now);
  return next.length === state.length ? state : next;
}

export function seedInvites(
  state: InviteToastEntry[],
  fromServer: SerializedLobbyInvite[],
): InviteToastEntry[] {
  const known = new Set(state.map((e) => e.id));
  const fresh: InviteToastEntry[] = [];
  for (const invite of fromServer) {
    if (known.has(invite.id)) continue;
    const expiresAtMs = Date.parse(invite.expiresAt);
    fresh.push({
      ...invite,
      expiresAtMs: Number.isNaN(expiresAtMs) ? 0 : expiresAtMs,
    });
  }
  if (fresh.length === 0) return state;
  return [...fresh, ...state];
}
