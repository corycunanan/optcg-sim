import { describe, expect, it } from "vitest";
import type { SerializedMessage } from "@/types/realtime";
import { applyMessageEvent, type ChatMessage } from "./apply-message-event";

const makeIncoming = (
  overrides: Partial<SerializedMessage> = {},
): SerializedMessage => ({
  id: "msg-new",
  fromUserId: "user-other",
  toUserId: "user-me",
  body: "hi",
  createdAt: "2026-05-02T12:00:00.000Z",
  fromUser: {
    id: "user-other",
    username: "ace",
    name: "Ace",
    image: null,
  },
  ...overrides,
});

const existing: ChatMessage = {
  id: "msg-existing",
  body: "earlier",
  createdAt: "2026-05-02T11:59:00.000Z",
  fromUserId: "user-other",
};

describe("applyMessageEvent", () => {
  it("appends a message from the open conversation partner", () => {
    const result = applyMessageEvent([existing], makeIncoming(), "user-other");

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      id: "msg-new",
      body: "hi",
      createdAt: "2026-05-02T12:00:00.000Z",
      fromUserId: "user-other",
    });
  });

  it("returns the same array reference when the id is already rendered", () => {
    const incoming = makeIncoming({ id: existing.id });
    const current = [existing];

    const result = applyMessageEvent(current, incoming, "user-other");

    expect(result).toBe(current);
    expect(result).toHaveLength(1);
  });

  it("does not append messages whose fromUserId doesn't match the open conversation", () => {
    const incoming = makeIncoming({
      id: "msg-from-stranger",
      fromUserId: "user-stranger",
    });

    const result = applyMessageEvent([existing], incoming, "user-other");

    expect(result).toEqual([existing]);
  });

  it("appends to an empty list when ids and partner match", () => {
    const result = applyMessageEvent([], makeIncoming(), "user-other");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("msg-new");
  });
});
