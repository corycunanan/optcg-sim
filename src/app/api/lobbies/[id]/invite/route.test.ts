import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyFindUniqueMock = vi.fn();
const friendshipFindFirstMock = vi.fn();
const inviteFindFirstMock = vi.fn();
const inviteCreateMock = vi.fn();
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
    lobby: { findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args) },
    friendship: {
      findFirst: (...args: unknown[]) => friendshipFindFirstMock(...args),
    },
    lobbyInvite: {
      findFirst: (...args: unknown[]) => inviteFindFirstMock(...args),
      create: (...args: unknown[]) => inviteCreateMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  socialLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { POST } = await import("./route");

const HOST_ID = "user-host";
const FRIEND_ID = "user-friend";
const LOBBY_ID = "lobby-1";

function buildRequest(body: unknown = { toUserId: FRIEND_ID }) {
  return {
    request: new NextRequest(
      `http://localhost/api/lobbies/${LOBBY_ID}/invite`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    params: Promise.resolve({ id: LOBBY_ID }),
  };
}

const lobbyOpen = {
  id: LOBBY_ID,
  hostUserId: HOST_ID,
  status: "WAITING" as const,
  mode: "PVP" as const,
  joinCode: "ABCD",
  format: "Standard",
  guest: null,
};

const inviteRow = {
  id: "invite-1",
  lobbyId: LOBBY_ID,
  fromUserId: HOST_ID,
  toUserId: FRIEND_ID,
  status: "PENDING",
  createdAt: new Date("2026-05-02T12:00:00.000Z"),
  expiresAt: new Date("2026-05-02T12:05:00.000Z"),
  fromUser: {
    id: HOST_ID,
    username: "luffy",
    name: "Luffy",
    image: null,
  },
  lobby: {
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP" as const,
    host: { username: "luffy" },
  },
};

beforeEach(() => {
  vi.useRealTimers();
  authMock.mockReset();
  rateLimitMock.mockReset();
  lobbyFindUniqueMock.mockReset();
  friendshipFindFirstMock.mockReset();
  inviteFindFirstMock.mockReset();
  inviteCreateMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: HOST_ID } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  lobbyFindUniqueMock.mockResolvedValue(lobbyOpen);
  friendshipFindFirstMock.mockResolvedValue({ id: "friendship-1" });
  inviteFindFirstMock.mockResolvedValue(null);
  inviteCreateMock.mockResolvedValue(inviteRow);
  notifyUserMock.mockResolvedValue(undefined);
});

describe("POST /api/lobbies/[id]/invite", () => {
  it("creates an invite and fans out lobby:invite_received", async () => {
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(201);

    expect(inviteCreateMock).toHaveBeenCalledTimes(1);
    const createCall = inviteCreateMock.mock.calls[0]?.[0];
    expect(createCall?.data).toMatchObject({
      lobbyId: LOBBY_ID,
      fromUserId: HOST_ID,
      toUserId: FRIEND_ID,
    });
    // 5 minute TTL
    const expiresAt = createCall?.data?.expiresAt as Date;
    const createdAt = createCall?.data?.createdAt as Date | undefined;
    if (createdAt) {
      expect(expiresAt.getTime() - createdAt.getTime()).toBe(5 * 60 * 1000);
    } else {
      // Created relative to "now" — just assert ~5min in the future.
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
      expect(expiresAt.getTime() - Date.now()).toBeLessThan(6 * 60 * 1000);
    }

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    const [target, event] = notifyUserMock.mock.calls[0] ?? [];
    expect(target).toBe(FRIEND_ID);
    expect(event).toMatchObject({
      type: "lobby:invite_received",
      invite: { id: "invite-1", toUserId: FRIEND_ID, fromUserId: HOST_ID },
    });
  });

  it("rejects non-host callers (403)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-someone-else" } });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    expect(inviteCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects non-friend recipients (400)", async () => {
    friendshipFindFirstMock.mockResolvedValue(null);
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(inviteCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects when the lobby is closed or already in-game (400)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({ ...lobbyOpen, status: "IN_GAME" });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("rejects non-PVP lobbies (400)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({ ...lobbyOpen, mode: "SOLITAIRE" });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when a real guest is already seated (409)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({
      ...lobbyOpen,
      guest: { userId: "user-other-guest" },
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate PENDING invite (409)", async () => {
    inviteFindFirstMock.mockResolvedValue({ id: "invite-existing" });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("scopes the duplicate check to live (non-expired) PENDING rows", async () => {
    // Codex P2 — without the `expiresAt > now` gate, a naturally expired
    // PENDING row would block future invites forever. The route must
    // include that filter so a stale row is invisible to the dedup.
    const { request, params } = buildRequest();

    await POST(request, { params });

    const where = inviteFindFirstMock.mock.calls[0]?.[0]?.where;
    expect(where?.status).toBe("PENDING");
    expect(where?.expiresAt).toMatchObject({ gt: expect.any(Date) });
  });

  it("rejects inviting yourself (400)", async () => {
    const { request, params } = buildRequest({ toUserId: HOST_ID });

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(401);
  });
});
