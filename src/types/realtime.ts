import type { LobbyRoomState } from "@/lib/lobbies/state";

/**
 * UserChannel server → client event vocabulary.
 *
 * Discriminated union extended one variant at a time as polling loops are
 * replaced with push events.
 *
 * Adding an event:
 *   1. Add a new member: `{ type: "feature:event_name"; ...payload }`
 *   2. Send from a server route via `notifyUser(targetUserId, event)`.
 *   3. Subscribe on the client via `useUserChannelEvents().subscribe("feature:event_name", handler)`.
 *
 * The discriminator is always `type`. Keep names `<feature>:<verb>`.
 */
export type RealtimeServerEvent =
  | { type: "message:new"; message: SerializedMessage }
  | { type: "friend:request_received"; request: SerializedFriendRequest }
  | {
      type: "friend:request_accepted";
      request: SerializedFriendRequest;
      friendship: SerializedFriendship;
    }
  | { type: "friend:request_declined"; requestId: string; toUserId: string }
  | { type: "friend:removed"; userId: string }
  | { type: "lobby:state_changed"; lobby: LobbyRoomState };

export interface SerializedMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: string;
  fromUser: SerializedUser;
}

export interface SerializedFriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
  fromUser: SerializedUser;
}

export interface SerializedFriendship {
  id: string;
  createdAt: string;
  /** The "other" user, from the recipient's perspective. */
  user: SerializedUser;
}

export interface SerializedUser {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

export { type ConnectionStatus } from "@/hooks/use-authed-websocket";
