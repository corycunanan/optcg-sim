/**
 * Fanout helper for lobby state updates.
 *
 * Resolves the host + guest userIds from a `LobbyRoomState` and calls
 * `notifyUser` for each member with `{ type: "lobby:state_changed", lobby }`.
 * The actor (the user whose request triggered the mutation) is skipped — their
 * UI updates from the route response.
 *
 * Solitaire mode collapses to a single member because the host occupies the
 * guest slot too.
 *
 * Single-recipient overrides (CLOSED on host-close, EVICTED on guest-eject)
 * are sent via `notifyUser` directly, not through this helper.
 */

import type { LobbyRoomState } from "@/lib/lobbies/state";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { notifyUser, type NotifyUserDeps } from "./fan-out";

export interface NotifyLobbyOptions {
  /** UserId whose UI is updating from the route response — skipped from the fanout. */
  actorUserId?: string;
  /** Test seam — production callers leave this undefined. */
  deps?: NotifyUserDeps;
  /** Test seam for participant-scoped state serialization. */
  stateBuilder?: (
    lobbyId: string,
    viewerUserId: string
  ) => Promise<LobbyRoomState | null>;
}

export async function notifyLobby(
  lobby: LobbyRoomState,
  options: NotifyLobbyOptions = {}
): Promise<void> {
  const memberIds = collectLobbyMemberIds(lobby);
  const targets = options.actorUserId
    ? memberIds.filter((id) => id !== options.actorUserId)
    : memberIds;

  if (targets.length === 0) return;

  const stateBuilder = options.stateBuilder ?? buildLobbyRoomState;
  await Promise.all(
    targets.map(async (userId) => {
      const viewerState = await stateBuilder(lobby.id, userId);
      return notifyUser(
        userId,
        { type: "lobby:state_changed", lobby: viewerState ?? lobby },
        options.deps
      );
    })
  );
}

function collectLobbyMemberIds(lobby: LobbyRoomState): string[] {
  // Set dedupes the host-as-guest case (solitaire), so the host gets at most
  // one fanout per state change.
  const ids = new Set<string>([lobby.hostUserId]);
  if (lobby.guest) ids.add(lobby.guest.user.id);
  return Array.from(ids);
}
