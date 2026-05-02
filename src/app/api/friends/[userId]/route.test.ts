import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const friendshipFindFirstMock = vi.fn();
const friendshipDeleteMock = vi.fn();
const notifyUserMock = vi.fn();

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
    friendship: {
      findFirst: (...args: unknown[]) => friendshipFindFirstMock(...args),
      delete: (...args: unknown[]) => friendshipDeleteMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  socialLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { DELETE } = await import("./route");

function buildRequest(friendId: string) {
  return {
    request: new NextRequest(`http://localhost/api/friends/${friendId}`, {
      method: "DELETE",
    }),
    params: Promise.resolve({ userId: friendId }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  friendshipFindFirstMock.mockReset();
  friendshipDeleteMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-actor" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  friendshipFindFirstMock.mockResolvedValue({
    id: "ship-1",
    userAId: "user-actor",
    userBId: "user-other",
  });
  friendshipDeleteMock.mockResolvedValue({});
  notifyUserMock.mockResolvedValue(undefined);
});

describe("DELETE /api/friends/[userId]", () => {
  it("notifies the unfriended party with friend:removed and the actor's id", async () => {
    const { request, params } = buildRequest("user-other");

    const res = await DELETE(request, { params });

    expect(res.status).toBe(200);
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-other", {
      type: "friend:removed",
      userId: "user-actor",
    });
  });

  it("does not fan out when the friendship is missing", async () => {
    friendshipFindFirstMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest("user-other");

    const res = await DELETE(request, { params });

    expect(res.status).toBe(404);
    expect(friendshipDeleteMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest("user-other");

    const res = await DELETE(request, { params });

    expect(res.status).toBe(429);
    expect(friendshipDeleteMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
