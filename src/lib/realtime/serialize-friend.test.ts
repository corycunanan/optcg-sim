import { describe, expect, it } from "vitest";
import {
  serializeFriendRequestForEvent,
  serializeFriendshipForEvent,
} from "./serialize-friend";

describe("serializeFriendRequestForEvent", () => {
  it("converts createdAt Date to an ISO string and copies fromUser fields", () => {
    const result = serializeFriendRequestForEvent({
      id: "req-1",
      fromUserId: "user-a",
      toUserId: "user-b",
      createdAt: new Date("2026-05-02T12:00:00.000Z"),
      fromUser: {
        id: "user-a",
        username: "ace",
        name: "Ace",
        image: null,
      },
    });

    expect(result).toEqual({
      id: "req-1",
      fromUserId: "user-a",
      toUserId: "user-b",
      createdAt: "2026-05-02T12:00:00.000Z",
      fromUser: {
        id: "user-a",
        username: "ace",
        name: "Ace",
        image: null,
      },
    });
  });

  it("preserves null sender display fields", () => {
    const result = serializeFriendRequestForEvent({
      id: "req-2",
      fromUserId: "user-a",
      toUserId: "user-b",
      createdAt: new Date(0),
      fromUser: { id: "user-a", username: null, name: null, image: null },
    });

    expect(result.fromUser).toEqual({
      id: "user-a",
      username: null,
      name: null,
      image: null,
    });
  });
});

describe("serializeFriendshipForEvent", () => {
  it("includes the explicit other-user payload, not the friendship's join data", () => {
    const result = serializeFriendshipForEvent(
      {
        id: "ship-1",
        createdAt: new Date("2026-05-02T12:00:00.000Z"),
      },
      { id: "user-b", username: "luffy", name: "Luffy", image: "/luffy.png" },
    );

    expect(result).toEqual({
      id: "ship-1",
      createdAt: "2026-05-02T12:00:00.000Z",
      user: {
        id: "user-b",
        username: "luffy",
        name: "Luffy",
        image: "/luffy.png",
      },
    });
  });
});
