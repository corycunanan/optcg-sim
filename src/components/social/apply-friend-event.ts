import type {
  RealtimeServerEvent,
  SerializedFriendship,
} from "@/types/realtime";

export interface SidebarUser {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

export interface FriendEntry {
  friendshipId: string;
  user: SidebarUser;
}

type FriendEvent = Extract<
  RealtimeServerEvent,
  {
    type: "friend:request_accepted" | "friend:removed";
  }
>;

/**
 * Apply one realtime friend-list mutation. Returns the same array reference
 * when nothing changes so React can skip downstream re-renders.
 */
export function applyFriendEvent(
  friends: FriendEntry[],
  event: FriendEvent
): FriendEntry[] {
  switch (event.type) {
    case "friend:request_accepted":
      return appendFriend(friends, event.friendship);
    case "friend:removed":
      return removeFriend(friends, event.userId);
  }
}

function appendFriend(
  friends: FriendEntry[],
  friendship: SerializedFriendship
): FriendEntry[] {
  if (friends.some((friend) => friend.friendshipId === friendship.id)) {
    return friends;
  }
  return [
    ...friends,
    { friendshipId: friendship.id, user: friendship.user },
  ];
}

function removeFriend(
  friends: FriendEntry[],
  userId: string
): FriendEntry[] {
  const next = friends.filter((friend) => friend.user.id !== userId);
  return next.length === friends.length ? friends : next;
}
