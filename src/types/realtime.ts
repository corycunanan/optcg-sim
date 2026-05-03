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
  | { type: "lobby:state_changed"; lobby: LobbyRoomState }
  | {
      type: "game:status";
      gameId: string;
      status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
      winnerId: string | null;
      winReason: string | null;
    }
  | { type: "presence:friend_online"; userId: string }
  | { type: "presence:friend_offline"; userId: string; lastSeen: string }
  /**
   * OPT-359 — typing indicator broadcast. `fromUserId` is the *sender* of
   * the typing event; recipients filter by matching it against the open
   * conversation's partner id. `until` is a unix-ms timestamp at which the
   * indicator should auto-clear.
   */
  | { type: "chat:typing_received"; fromUserId: string; until: number }
  /**
   * OPT-359 — read receipt. Sent to the original sender after their
   * messages were marked read by the recipient. `fromUserId` is the
   * *reader* (counterparty); `throughCreatedAt` is the cutoff timestamp
   * (ISO) — every message from the original sender to the reader created
   * at-or-before this is now considered read.
   */
  | {
      type: "chat:read_to";
      fromUserId: string;
      throughCreatedAt: string;
    };

/**
 * Client → server vocabulary. Routed by `UserChannel.webSocketMessage` on
 * the worker. Adding a variant is a three-step contract:
 *   1. Add a new member here.
 *   2. Validate + handle in `workers/game/src/UserChannel.ts`.
 *   3. Emit from a hook/component via `useUserChannelEvents().send(event)`.
 */
export type RealtimeClientEvent =
  | { type: "chat:typing"; toUserId: string; until: number };

export interface SerializedMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: string;
  /** Set when the recipient has marked this message read; null otherwise. */
  readAt: string | null;
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
