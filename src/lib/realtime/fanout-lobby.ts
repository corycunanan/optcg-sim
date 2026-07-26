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
import {
  projectLobbyRoomState,
  readLobbyRoomState,
  type LobbyRoomStateRead,
} from "@/lib/lobbies/build-state";
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
  /** Test seam for the single viewer-invariant database read. */
  stateReader?: (lobbyId: string) => Promise<LobbyRoomStateRead | null>;
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

  const stateReader = options.stateReader ?? readLobbyRoomState;
  const sharedRead = await stateReader(lobby.id);
  if (!sharedRead) return;

  await Promise.all(
    targets.map((userId) =>
      notifyUser(
        userId,
        {
          type: "lobby:state_changed",
          lobby: projectLobbyRoomState(sharedRead, userId),
        },
        options.deps
      )
    )
  );
}

export interface RemovedSpectatorAudience {
  lobbyId: string;
  reason: SpectatorRemovedEvent["reason"];
  removedSpectatorUserIds: readonly string[];
}

/**
 * Notifies spectators after mutation removes them from the current audience.
 *
 * Callers MUST capture `removedSpectatorUserIds` inside or before the transaction
 * that deletes the spectator rows. Reading the spectator list after deletion
 * yields an empty set and silently sends no terminal events.
 */
export async function notifySpectatorsRemoved(
  audience: RemovedSpectatorAudience,
  deps?: NotifyUserDeps
): Promise<void> {
  const targetUserIds = new Set(audience.removedSpectatorUserIds);
  await Promise.all(
    Array.from(targetUserIds, (targetUserId) =>
      notifyUser(
        targetUserId,
        {
          type: "lobby:spectator_removed",
          lobbyId: audience.lobbyId,
          reason: audience.reason,
        },
        deps
      )
    )
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
