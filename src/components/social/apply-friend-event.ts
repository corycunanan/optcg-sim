import type {
  RealtimeServerEvent,
  SerializedFriendRequest,
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

export interface FriendRequestEntry {
  id: string;
  fromUser?: SidebarUser;
}

export interface FriendsState {
  friends: FriendEntry[];
  incoming: FriendRequestEntry[];
}

type FriendEvent = Extract<
  RealtimeServerEvent,
  {
    type:
      | "friend:request_received"
      | "friend:request_accepted"
      | "friend:request_declined"
      | "friend:removed";
  }
>;

/**
 * Reducer for the four friend events on the social sidebar's local state.
 * Pure: returns the same array reference when nothing changes so React can
 * skip re-renders downstream.
 */
export function applyFriendEvent(
  state: FriendsState,
  event: FriendEvent,
): FriendsState {
  switch (event.type) {
    case "friend:request_received":
      return prependIncoming(state, event.request);
    case "friend:request_accepted":
      return appendFriend(state, event.friendship);
    case "friend:request_declined":
      // Recipient sidebar has no outgoing-requests UI today; no-op.
      return state;
    case "friend:removed":
      return removeFriend(state, event.userId);
  }
}

function prependIncoming(
  state: FriendsState,
  request: SerializedFriendRequest,
): FriendsState {
  if (state.incoming.some((r) => r.id === request.id)) return state;
  return {
    ...state,
    incoming: [
      { id: request.id, fromUser: request.fromUser },
      ...state.incoming,
    ],
  };
}

function appendFriend(
  state: FriendsState,
  friendship: SerializedFriendship,
): FriendsState {
  if (state.friends.some((f) => f.friendshipId === friendship.id)) return state;
  return {
    ...state,
    friends: [
      ...state.friends,
      { friendshipId: friendship.id, user: friendship.user },
    ],
  };
}

function removeFriend(state: FriendsState, userId: string): FriendsState {
  const next = state.friends.filter((f) => f.user.id !== userId);
  if (next.length === state.friends.length) return state;
  return { ...state, friends: next };
}
