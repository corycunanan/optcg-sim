import { describe, expect, it } from "vitest";
import type { SerializedMessage } from "@/types/realtime";
import {
  applyMessageEvent,
  applyReadToEvent,
  mergeInitialHistory,
  type ChatMessage,
} from "./apply-message-event";

const makeIncoming = (
  overrides: Partial<SerializedMessage> = {},
): SerializedMessage => ({
  id: "msg-new",
  fromUserId: "user-other",
  toUserId: "user-me",
  body: "hi",
  createdAt: "2026-05-02T12:00:00.000Z",
  readAt: null,
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
  readAt: null,
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
      readAt: null,
    });
  });

  it("returns the same array reference when the id is already rendered", () => {
    const incoming = makeIncoming({ id: existing.id });
    const current = [existing];

    const result = applyMessageEvent(current, incoming, "user-other");

    expect(result).toBe(current);
    expect(result).toHaveLength(1);
  });

  it("does not append messages whose endpoints don't include the conversation partner", () => {
    const incoming = makeIncoming({
      id: "msg-from-stranger",
      fromUserId: "user-stranger",
      toUserId: "user-also-stranger",
    });

    const result = applyMessageEvent([existing], incoming, "user-other");

    expect(result).toEqual([existing]);
  });

  it("appends outbound messages where the conversation partner is the recipient", () => {
    const incoming = makeIncoming({
      id: "msg-outbound",
      fromUserId: "user-me",
      toUserId: "user-other",
    });

    const result = applyMessageEvent([existing], incoming, "user-other");

    expect(result).toHaveLength(2);
    expect(result[1].id).toBe("msg-outbound");
  });

  it("appends to an empty list when ids and partner match", () => {
    const result = applyMessageEvent([], makeIncoming(), "user-other");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("msg-new");
  });
});

describe("mergeInitialHistory", () => {
  const history: ChatMessage[] = [
    { id: "h1", body: "old", createdAt: "2026-05-02T11:00:00.000Z", fromUserId: "user-other", readAt: null },
    { id: "h2", body: "older", createdAt: "2026-05-02T11:30:00.000Z", fromUserId: "user-me", readAt: null },
  ];

  it("returns history unchanged when nothing was pushed during fetch", () => {
    expect(mergeInitialHistory(history, [])).toBe(history);
  });

  it("appends pushed-during-fetch messages absent from history", () => {
    const pushed: ChatMessage[] = [
      { id: "p1", body: "pushed", createdAt: "2026-05-02T12:00:00.000Z", fromUserId: "user-other", readAt: null },
    ];

    const result = mergeInitialHistory(history, pushed);

    expect(result).toHaveLength(3);
    expect(result[2].id).toBe("p1");
  });

  it("returns history when every pushed message is already in history", () => {
    const pushed: ChatMessage[] = [
      { id: "h1", body: "old", createdAt: "2026-05-02T11:00:00.000Z", fromUserId: "user-other", readAt: null },
    ];

    expect(mergeInitialHistory(history, pushed)).toBe(history);
  });

  it("only appends pushed messages whose id isn't already in history", () => {
    const pushed: ChatMessage[] = [
      { id: "h2", body: "older", createdAt: "2026-05-02T11:30:00.000Z", fromUserId: "user-me", readAt: null },
      { id: "p1", body: "pushed", createdAt: "2026-05-02T12:00:00.000Z", fromUserId: "user-other", readAt: null },
    ];

    const result = mergeInitialHistory(history, pushed);

    expect(result.map((m) => m.id)).toEqual(["h1", "h2", "p1"]);
  });
});

describe("applyReadToEvent", () => {
  const myUserId = "user-me";
  const messages: ChatMessage[] = [
    { id: "m1", body: "earlier", createdAt: "2026-05-02T11:00:00.000Z", fromUserId: myUserId, readAt: null },
    { id: "m2", body: "from partner", createdAt: "2026-05-02T11:30:00.000Z", fromUserId: "user-other", readAt: null },
    { id: "m3", body: "later", createdAt: "2026-05-02T12:00:00.000Z", fromUserId: myUserId, readAt: null },
  ];

  it("marks own messages at-or-before the cutoff as read", () => {
    const result = applyReadToEvent(messages, myUserId, "2026-05-02T11:30:00.000Z");

    expect(result[0].readAt).toBe("2026-05-02T11:30:00.000Z");
    expect(result[1].readAt).toBe(null); // not my message — not touched
    expect(result[2].readAt).toBe(null); // after the cutoff — not touched
  });

  it("returns the same array reference when nothing changed", () => {
    const result = applyReadToEvent(messages, myUserId, "2026-05-02T10:00:00.000Z");

    expect(result).toBe(messages);
  });

  it("does not overwrite an existing readAt with a later cutoff", () => {
    const seeded: ChatMessage[] = [
      { ...messages[0], readAt: "2026-05-02T11:15:00.000Z" },
      messages[1],
      messages[2],
    ];
    const result = applyReadToEvent(seeded, myUserId, "2026-05-02T13:00:00.000Z");

    expect(result[0].readAt).toBe("2026-05-02T11:15:00.000Z");
    expect(result[2].readAt).toBe("2026-05-02T13:00:00.000Z");
  });

  it("does nothing for messages from someone else", () => {
    const result = applyReadToEvent(messages, "user-not-in-conversation", "2026-05-02T12:00:00.000Z");

    expect(result).toBe(messages);
  });
});
