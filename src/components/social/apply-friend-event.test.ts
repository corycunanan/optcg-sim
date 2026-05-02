import { describe, expect, it } from "vitest";
import {
  applyFriendEvent,
  type FriendEntry,
  type FriendRequestEntry,
  type FriendsState,
} from "./apply-friend-event";

const makeState = (overrides: Partial<FriendsState> = {}): FriendsState => ({
  friends: [],
  incoming: [],
  ...overrides,
});

const makeFriend = (id: string, friendshipId: string): FriendEntry => ({
  friendshipId,
  user: { id, username: id, name: id, image: null },
});

const makeIncoming = (id: string, fromId = "user-other"): FriendRequestEntry => ({
  id,
  fromUser: { id: fromId, username: fromId, name: fromId, image: null },
});

describe("applyFriendEvent — friend:request_received", () => {
  it("prepends a new request to the incoming list", () => {
    const state = makeState({ incoming: [makeIncoming("req-old")] });

    const next = applyFriendEvent(state, {
      type: "friend:request_received",
      request: {
        id: "req-new",
        fromUserId: "user-a",
        toUserId: "user-me",
        createdAt: "2026-05-02T12:00:00.000Z",
        fromUser: { id: "user-a", username: "ace", name: "Ace", image: null },
      },
    });

    expect(next.incoming.map((r) => r.id)).toEqual(["req-new", "req-old"]);
    expect(next.incoming[0].fromUser).toEqual({
      id: "user-a",
      username: "ace",
      name: "Ace",
      image: null,
    });
  });

  it("returns the same state reference when the request id already exists", () => {
    const state = makeState({ incoming: [makeIncoming("req-1")] });

    const next = applyFriendEvent(state, {
      type: "friend:request_received",
      request: {
        id: "req-1",
        fromUserId: "user-other",
        toUserId: "user-me",
        createdAt: "2026-05-02T12:00:00.000Z",
        fromUser: { id: "user-other", username: "x", name: null, image: null },
      },
    });

    expect(next).toBe(state);
  });
});

describe("applyFriendEvent — friend:request_accepted", () => {
  it("appends a friend by friendship id", () => {
    const state = makeState({ friends: [makeFriend("user-a", "ship-a")] });

    const next = applyFriendEvent(state, {
      type: "friend:request_accepted",
      request: {
        id: "req-1",
        fromUserId: "user-me",
        toUserId: "user-b",
        createdAt: "2026-05-02T11:00:00.000Z",
        fromUser: { id: "user-me", username: "me", name: null, image: null },
      },
      friendship: {
        id: "ship-b",
        createdAt: "2026-05-02T12:00:00.000Z",
        user: { id: "user-b", username: "bob", name: "Bob", image: null },
      },
    });

    expect(next.friends.map((f) => f.friendshipId)).toEqual(["ship-a", "ship-b"]);
    expect(next.friends[1].user).toEqual({
      id: "user-b",
      username: "bob",
      name: "Bob",
      image: null,
    });
  });

  it("does not duplicate an existing friendship", () => {
    const state = makeState({ friends: [makeFriend("user-b", "ship-b")] });

    const next = applyFriendEvent(state, {
      type: "friend:request_accepted",
      request: {
        id: "req-1",
        fromUserId: "user-me",
        toUserId: "user-b",
        createdAt: "2026-05-02T11:00:00.000Z",
        fromUser: { id: "user-me", username: "me", name: null, image: null },
      },
      friendship: {
        id: "ship-b",
        createdAt: "2026-05-02T12:00:00.000Z",
        user: { id: "user-b", username: "bob", name: "Bob", image: null },
      },
    });

    expect(next).toBe(state);
  });
});

describe("applyFriendEvent — friend:request_declined", () => {
  it("is a no-op on the recipient sidebar (no outgoing-requests UI today)", () => {
    const state = makeState({
      friends: [makeFriend("user-a", "ship-a")],
      incoming: [makeIncoming("req-1")],
    });

    const next = applyFriendEvent(state, {
      type: "friend:request_declined",
      requestId: "req-1",
    });

    expect(next).toBe(state);
  });
});

describe("applyFriendEvent — friend:removed", () => {
  it("removes the friend whose user id matches", () => {
    const state = makeState({
      friends: [makeFriend("user-a", "ship-a"), makeFriend("user-b", "ship-b")],
    });

    const next = applyFriendEvent(state, {
      type: "friend:removed",
      userId: "user-a",
    });

    expect(next.friends.map((f) => f.user.id)).toEqual(["user-b"]);
  });

  it("returns the same state reference when the user is not in the friends list", () => {
    const state = makeState({ friends: [makeFriend("user-a", "ship-a")] });

    const next = applyFriendEvent(state, {
      type: "friend:removed",
      userId: "user-ghost",
    });

    expect(next).toBe(state);
  });
});
