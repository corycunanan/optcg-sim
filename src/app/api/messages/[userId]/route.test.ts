import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const userFindUniqueMock = vi.fn();
const messageCreateMock = vi.fn();
const messageFindManyMock = vi.fn();
const notifyUserMock = vi.fn();

// Run `after()` callbacks synchronously so the route's fanout is observable
// in unit tests; the production behavior (post-response scheduling) is owned
// by Next.js itself.
vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => {
      void cb();
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    message: {
      create: (...args: unknown[]) => messageCreateMock(...args),
      findMany: (...args: unknown[]) => messageFindManyMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  socialLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { GET, POST } = await import("./route");

function buildGetRequest(otherId: string, query = "") {
  return {
    request: new NextRequest(
      `http://localhost/api/messages/${otherId}${query}`,
    ),
    params: Promise.resolve({ userId: otherId }),
  };
}

function fakeMessage(i: number) {
  return {
    id: `msg-${i}`,
    fromUserId: "user-recipient",
    toUserId: "user-sender",
    body: `hello ${i}`,
    readAt: null,
    createdAt: new Date(2026, 0, 1, 0, 0, i),
    fromUser: { id: "user-recipient", username: "zoro", name: "Zoro", image: null },
  };
}

function buildRequest(toUserId: string, body: unknown = { body: "hello" }) {
  return {
    request: new NextRequest(`http://localhost/api/messages/${toUserId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ userId: toUserId }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  userFindUniqueMock.mockReset();
  messageCreateMock.mockReset();
  messageFindManyMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-sender" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  userFindUniqueMock.mockResolvedValue({ id: "user-recipient" });
  messageCreateMock.mockResolvedValue({
    id: "msg-1",
    fromUserId: "user-sender",
    toUserId: "user-recipient",
    body: "hello",
    read: false,
    readAt: null,
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
    fromUser: {
      id: "user-sender",
      username: "ace",
      name: "Ace",
      image: null,
    },
  });
  notifyUserMock.mockResolvedValue(undefined);
});

describe("GET /api/messages/[userId] polling branch (?after)", () => {
  it.each([
    ["after", "?after=not-a-timestamp"],
    ["calendar date", "?after=2026-02-30T00:00:00.000Z"],
    ["cursor", "?cursor=not-a-timestamp"],
    ["afterId without after", "?afterId=msg-5"],
    ["empty afterId", "?after=2026-01-01T00:00:05.000Z&afterId="],
  ])("rejects an invalid %s before querying Prisma", async (_label, query) => {
    const { request, params } = buildGetRequest("user-recipient", query);

    const res = await GET(request, { params });

    expect(res.status).toBe(400);
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });

  it("caps the polling query with a take bound", async () => {
    messageFindManyMock.mockResolvedValue([fakeMessage(1), fakeMessage(2)]);
    const { request, params } = buildGetRequest(
      "user-recipient",
      "?after=1970-01-01T00:00:00.000Z",
    );

    const res = await GET(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(messageFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 201,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(body.data).toHaveLength(2);
    expect(body.more).toBe(false);
  });

  it("uses a composite (createdAt, id) cursor when afterId is supplied", async () => {
    messageFindManyMock.mockResolvedValue([]);
    const boundary = "2026-01-01T00:00:05.000Z";
    const { request, params } = buildGetRequest(
      "user-recipient",
      `?after=${boundary}&afterId=msg-5`,
    );

    const res = await GET(request, { params });

    expect(res.status).toBe(200);
    expect(messageFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ OR: expect.any(Array) }),
            {
              OR: [
                { createdAt: { gt: new Date(boundary) } },
                { createdAt: new Date(boundary), id: { gt: "msg-5" } },
              ],
            },
          ],
        },
      }),
    );
  });

  it("truncates to the cap and sets more:true when the window overflows", async () => {
    messageFindManyMock.mockResolvedValue(
      Array.from({ length: 201 }, (_, i) => fakeMessage(i)),
    );
    const { request, params } = buildGetRequest(
      "user-recipient",
      "?after=1970-01-01T00:00:00.000Z",
    );

    const res = await GET(request, { params });
    const body = await res.json();

    expect(body.data).toHaveLength(200);
    expect(body.data[199].id).toBe("msg-199");
    expect(body.more).toBe(true);
  });
});

describe("GET /api/messages/[userId] history branch (?cursor)", () => {
  it("preserves descending history pagination for a valid ISO cursor", async () => {
    messageFindManyMock.mockResolvedValue([fakeMessage(2), fakeMessage(1)]);
    const boundary = "2026-01-01T00:00:05.000Z";
    const { request, params } = buildGetRequest(
      "user-recipient",
      `?cursor=${boundary}`,
    );

    const res = await GET(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(messageFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: new Date(boundary) },
        }),
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
    expect(body.data.map((message: { id: string }) => message.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);
  });
});

describe("POST /api/messages/[userId]", () => {
  it("calls notifyUser on the recipient with the serialized message:new event", async () => {
    const { request, params } = buildRequest("user-recipient");

    const res = await POST(request, { params });
    expect(res.status).toBe(201);

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-recipient", {
      type: "message:new",
      message: {
        id: "msg-1",
        fromUserId: "user-sender",
        toUserId: "user-recipient",
        body: "hello",
        createdAt: "2026-05-02T12:00:00.000Z",
        readAt: null,
        fromUser: {
          id: "user-sender",
          username: "ace",
          name: "Ace",
          image: null,
        },
      },
    });
  });

  it("does not fan out when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest("user-recipient");

    const res = await POST(request, { params });

    expect(res.status).toBe(429);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when the recipient does not exist", async () => {
    userFindUniqueMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest("user-ghost");

    const res = await POST(request, { params });

    expect(res.status).toBe(404);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects messages to self without fanning out", async () => {
    const { request, params } = buildRequest("user-sender");

    const res = await POST(request, { params });

    expect(res.status).toBe(400);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
