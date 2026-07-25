/**
 * Fanout helper for lobby state updates.
 *
 * Resolves the host + guest + spectator userIds from a `LobbyRoomState` and calls
 * `notifyUser` for each member with `{ type: "lobby:state_changed", lobby }`.
 * The actor (the user whose request triggered the mutation) is skipped — their
 * UI updates from the route response.
 *
 * Solitaire mode collapses to a single member because the host occupies the
 * guest slot too.
 *
 * Single-recipient overrides (CLOSED on host-close, EVICTED on guest-eject,
 * and spectator removal) are sent via `notifyUser` directly, not through the
 * current-state audience resolved by this helper.
 */

import type { LobbyRoomState } from "@/lib/lobbies/state";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import type { RealtimeServerEvent } from "@/types/realtime";
import { notifyUser, type NotifyUserDeps } from "./fan-out";

type SpectatorRemovedEvent = Extract<
  RealtimeServerEvent,
  { type: "lobby:spectator_removed" }
>;

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
      if (!viewerState) return;
      return notifyUser(
        userId,
        { type: "lobby:state_changed", lobby: viewerState },
        options.deps
      );
    })
  );
}

/**
 * Notifies a spectator after mutation removed them from the current lobby
 * audience. Endpoint callers must invoke this directly with the captured userId.
 */
export async function notifySpectatorRemoved(
  targetUserId: string,
  lobbyId: string,
  reason: SpectatorRemovedEvent["reason"],
  deps?: NotifyUserDeps
): Promise<void> {
  return notifyUser(
    targetUserId,
    { type: "lobby:spectator_removed", lobbyId, reason },
    deps
  );
}

function collectLobbyMemberIds(lobby: LobbyRoomState): string[] {
  // Set dedupes the host-as-guest case (solitaire), so the host gets at most
  // one fanout per state change.
  const ids = new Set<string>([lobby.hostUserId]);
  if (lobby.guest) ids.add(lobby.guest.user.id);
  for (const spectator of lobby.spectators) ids.add(spectator.id);
  return Array.from(ids);
}
