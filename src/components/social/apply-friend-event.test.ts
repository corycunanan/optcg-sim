import { describe, expect, it } from "vitest";
import {
  applyFriendEvent,
  type FriendEntry,
} from "./apply-friend-event";

const makeFriend = (id: string, friendshipId: string): FriendEntry => ({
  friendshipId,
  user: { id, username: id, name: id, image: null },
});

describe("applyFriendEvent — friend:request_accepted", () => {
  it("appends a friend by friendship id", () => {
    const friends = [makeFriend("user-a", "ship-a")];

    const next = applyFriendEvent(friends, {
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

    expect(next.map((friend) => friend.friendshipId)).toEqual([
      "ship-a",
      "ship-b",
    ]);
    expect(next[1].user).toEqual({
      id: "user-b",
      username: "bob",
      name: "Bob",
      image: null,
    });
  });

  it("does not duplicate an existing friendship", () => {
    const friends = [makeFriend("user-b", "ship-b")];

    const next = applyFriendEvent(friends, {
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

    expect(next).toBe(friends);
  });
});

describe("applyFriendEvent — friend:removed", () => {
  it("removes the friend whose user id matches", () => {
    const friends = [
      makeFriend("user-a", "ship-a"),
      makeFriend("user-b", "ship-b"),
    ];

    const next = applyFriendEvent(friends, {
      type: "friend:removed",
      userId: "user-a",
    });

    expect(next.map((friend) => friend.user.id)).toEqual(["user-b"]);
  });

  it("returns the same array reference when the user is not a friend", () => {
    const friends = [makeFriend("user-a", "ship-a")];

    const next = applyFriendEvent(friends, {
      type: "friend:removed",
      userId: "user-ghost",
    });

    expect(next).toBe(friends);
  });
});
