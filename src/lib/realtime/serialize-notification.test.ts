import { describe, expect, it } from "vitest";
import { serializeNotificationForEvent } from "./serialize-notification";

describe("serializeNotificationForEvent", () => {
  it("serializes dates, payload, and actor into the realtime wire shape", () => {
    const result = serializeNotificationForEvent({
      id: "notification-1",
      userId: "user-recipient",
      type: "FRIEND_REQUEST",
      status: "PENDING",
      actorUserId: "user-sender",
      referenceId: "request-1",
      payload: { source: "friend-request" },
      createdAt: new Date("2026-07-26T10:00:00.000Z"),
      updatedAt: new Date("2026-07-26T10:01:00.000Z"),
      actor: {
        id: "user-sender",
        username: "ace",
        name: "Ace",
        image: null,
      },
    });

    expect(result).toEqual({
      id: "notification-1",
      userId: "user-recipient",
      type: "FRIEND_REQUEST",
      status: "PENDING",
      actorUserId: "user-sender",
      referenceId: "request-1",
      payload: { source: "friend-request" },
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: "2026-07-26T10:01:00.000Z",
      actor: {
        id: "user-sender",
        username: "ace",
        name: "Ace",
        image: null,
      },
    });
  });

  it("preserves nullable actor and reference fields", () => {
    const result = serializeNotificationForEvent({
      id: "notification-2",
      userId: "user-recipient",
      type: "FRIEND_REQUEST",
      status: "DISMISSED",
      actorUserId: null,
      referenceId: null,
      payload: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      actor: null,
    });

    expect(result.actor).toBeNull();
    expect(result.actorUserId).toBeNull();
    expect(result.referenceId).toBeNull();
  });
});
