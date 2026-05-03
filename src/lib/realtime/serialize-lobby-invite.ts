import type {
  SerializedLobbyInvite,
  SerializedUser,
} from "@/types/realtime";

/**
 * Wire shape for `lobby:invite_received` payloads. The DB row has Prisma
 * `Date` instances; the channel sends JSON, so the recipient sees ISO strings.
 *
 * Extracted to a serializer (matching `serialize-friend.ts` / `serialize-message.ts`)
 * so the route handler stays focused on the create + fanout choreography.
 */
export interface LobbyInviteRow {
  id: string;
  lobbyId: string;
  fromUserId: string;
  toUserId: string;
  createdAt: Date;
  expiresAt: Date;
  fromUser: SerializedUser;
  lobby: {
    joinCode: string;
    format: string;
    mode: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
    host: { username: string | null } | null;
  };
}

export function serializeLobbyInviteForEvent(
  invite: LobbyInviteRow,
): SerializedLobbyInvite {
  return {
    id: invite.id,
    lobbyId: invite.lobbyId,
    fromUserId: invite.fromUserId,
    toUserId: invite.toUserId,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    fromUser: {
      id: invite.fromUser.id,
      username: invite.fromUser.username,
      name: invite.fromUser.name,
      image: invite.fromUser.image,
    },
    lobby: {
      joinCode: invite.lobby.joinCode,
      format: invite.lobby.format,
      mode: invite.lobby.mode,
      hostUsername: invite.lobby.host?.username ?? null,
    },
  };
}
