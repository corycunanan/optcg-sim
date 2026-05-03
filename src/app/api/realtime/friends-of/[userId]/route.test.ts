import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const friendshipFindManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    friendship: {
      findMany: (...args: unknown[]) => friendshipFindManyMock(...args),
    },
  },
}));

vi.stubEnv("GAME_WORKER_SECRET", "test-secret");

const { GET } = await import("./route");

function buildRequest(userId: string, auth?: string): {
  request: NextRequest;
  params: Promise<{ userId: string }>;
} {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.Authorization = auth;
  return {
    request: new NextRequest(`http://localhost/api/realtime/friends-of/${userId}`, {
      headers,
    }),
    params: Promise.resolve({ userId }),
  };
}

beforeEach(() => {
  friendshipFindManyMock.mockReset();
});

describe("GET /api/realtime/friends-of/[userId]", () => {
  it("rejects unauthorized callers (missing bearer)", async () => {
    const { request, params } = buildRequest("user-1");

    const res = await GET(request, { params });

    expect(res.status).toBe(401);
    expect(friendshipFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects callers with the wrong bearer secret", async () => {
    const { request, params } = buildRequest("user-1", "Bearer wrong");

    const res = await GET(request, { params });

    expect(res.status).toBe(401);
    expect(friendshipFindManyMock).not.toHaveBeenCalled();
  });

  it("returns the 'other' user from each friendship row", async () => {
    friendshipFindManyMock.mockResolvedValue([
      { userAId: "user-1", userBId: "friend-a" },
      { userAId: "friend-b", userBId: "user-1" },
    ]);
    const { request, params } = buildRequest("user-1", "Bearer test-secret");

    const res = await GET(request, { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.friendIds.sort()).toEqual(["friend-a", "friend-b"]);
  });

  it("returns an empty list when the user has no friendships", async () => {
    friendshipFindManyMock.mockResolvedValue([]);
    const { request, params } = buildRequest("user-lonely", "Bearer test-secret");

    const res = await GET(request, { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.friendIds).toEqual([]);
  });
});
