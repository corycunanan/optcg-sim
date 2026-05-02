import type {
  SerializedFriendRequest,
  SerializedFriendship,
  SerializedUser,
} from "@/types/realtime";

/**
 * Wire shapes for friend-event payloads. `createdAt` is an ISO string; the
 * channel sends JSON, so the recipient never sees a `Date` instance.
 */
export interface FriendRequestRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: Date;
  fromUser: SerializedUser;
}

export interface FriendshipRow {
  id: string;
  createdAt: Date;
}

export function serializeFriendRequestForEvent(
  request: FriendRequestRow,
): SerializedFriendRequest {
  return {
    id: request.id,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    createdAt: request.createdAt.toISOString(),
    fromUser: {
      id: request.fromUser.id,
      username: request.fromUser.username,
      name: request.fromUser.name,
      image: request.fromUser.image,
    },
  };
}

export function serializeFriendshipForEvent(
  friendship: FriendshipRow,
  otherUser: SerializedUser,
): SerializedFriendship {
  return {
    id: friendship.id,
    createdAt: friendship.createdAt.toISOString(),
    user: {
      id: otherUser.id,
      username: otherUser.username,
      name: otherUser.name,
      image: otherUser.image,
    },
  };
}
