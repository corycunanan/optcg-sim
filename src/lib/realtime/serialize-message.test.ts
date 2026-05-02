import { describe, expect, it } from "vitest";
import { serializeMessageForEvent } from "./serialize-message";

describe("serializeMessageForEvent", () => {
  it("converts the Prisma createdAt Date to an ISO string", () => {
    const result = serializeMessageForEvent({
      id: "msg-1",
      fromUserId: "user-a",
      toUserId: "user-b",
      body: "hi",
      createdAt: new Date("2026-05-02T12:00:00.000Z"),
      fromUser: {
        id: "user-a",
        username: "ace",
        name: "Ace",
        image: null,
      },
    });

    expect(result).toEqual({
      id: "msg-1",
      fromUserId: "user-a",
      toUserId: "user-b",
      body: "hi",
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
    const result = serializeMessageForEvent({
      id: "msg-2",
      fromUserId: "user-a",
      toUserId: "user-b",
      body: "hi",
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
