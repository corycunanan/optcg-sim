import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const friendshipFindFirstMock = vi.fn();
const inviteCreateMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
const inviteFindManyMock = vi.fn();
const transactionMock = vi.fn();
const notifyUserMock = vi.fn();
const notifyLobbyMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();

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
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
    },
    friendship: {
      findFirst: (...args: unknown[]) => friendshipFindFirstMock(...args),
    },
    lobbyInvite: {
      create: (...args: unknown[]) => inviteCreateMock(...args),
      updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
      findMany: (...args: unknown[]) => inviteFindManyMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  socialLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));

const { DELETE, POST } = await import("./route");

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
      }
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
  lobbyUpdateManyMock.mockReset();
  lobbyUpdateMock.mockReset();
  friendshipFindFirstMock.mockReset();
  inviteCreateMock.mockReset();
  inviteUpdateManyMock.mockReset();
  inviteFindManyMock.mockReset();
  transactionMock.mockReset();
  notifyUserMock.mockReset();
  notifyLobbyMock.mockReset();
  buildLobbyRoomStateMock.mockReset();

  authMock.mockResolvedValue({ user: { id: HOST_ID } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  lobbyFindUniqueMock.mockResolvedValue(lobbyOpen);
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyUpdateMock.mockResolvedValue({});
  friendshipFindFirstMock.mockResolvedValue({ id: "friendship-1" });
  inviteCreateMock.mockResolvedValue(inviteRow);
  inviteUpdateManyMock.mockResolvedValue({ count: 0 });
  inviteFindManyMock.mockResolvedValue([]);
  notifyUserMock.mockResolvedValue(undefined);
  notifyLobbyMock.mockResolvedValue(undefined);
  buildLobbyRoomStateMock.mockResolvedValue(null);

  // Default tx implementation: invoke the callback with a tx-shaped object
  // backed by the same mocks. Tests that need a P2002 throw replace this
  // mock to throw directly.
  transactionMock.mockImplementation(async (fn: unknown) => {
    if (typeof fn !== "function") return fn;
    return (fn as (tx: unknown) => Promise<unknown>)({
      lobby: {
        findUnique: lobbyFindUniqueMock,
        updateMany: lobbyUpdateManyMock,
        update: lobbyUpdateMock,
      },
      lobbyInvite: {
        updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
        findMany: (...args: unknown[]) => inviteFindManyMock(...args),
        create: (...args: unknown[]) => inviteCreateMock(...args),
      },
    });
  });
});

describe("POST /api/lobbies/[id]/invite", () => {
  it("creates an invite and fans out lobby:invite_received", async () => {
    const roomState = { id: LOBBY_ID, version: 2 };
    buildLobbyRoomStateMock.mockResolvedValueOnce(roomState);
    const { request, params } = buildRequest();

    // Single baseline timestamp so both bounds use the same reference. The
    // route reads Date.now() once when computing expiresAt; the assertion
    // window has to compare against the same anchor or the bounds drift.
    const baseline = Date.now();
    const res = await POST(request, { params });
    expect(res.status).toBe(201);

    expect(inviteCreateMock).toHaveBeenCalledTimes(1);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: LOBBY_ID,
        hostUserId: HOST_ID,
        status: "WAITING",
        mode: "PVP",
        guest: { is: null },
      },
      data: {
        status: "WAITING",
        revision: { increment: 1 },
      },
    });
    const createCall = inviteCreateMock.mock.calls[0]?.[0];
    expect(createCall?.data).toMatchObject({
      lobbyId: LOBBY_ID,
      fromUserId: HOST_ID,
      toUserId: FRIEND_ID,
    });
    const expiresAt = createCall?.data?.expiresAt as Date;
    expect(expiresAt.getTime() - baseline).toBeGreaterThan(4 * 60 * 1000);
    expect(expiresAt.getTime() - baseline).toBeLessThan(6 * 60 * 1000);

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    const [target, event] = notifyUserMock.mock.calls[0] ?? [];
    expect(target).toBe(FRIEND_ID);
    expect(event).toMatchObject({
      type: "lobby:invite_received",
      invite: { id: "invite-1", toUserId: FRIEND_ID, fromUserId: HOST_ID },
    });
    await vi.waitFor(() => {
      expect(notifyLobbyMock).toHaveBeenCalledWith(roomState);
    });
  });

  it("sweeps stale PENDING rows past expiresAt before creating the new one", async () => {
    // Codex P2 — without the sweep the partial unique index would block
    // re-invites after a previous invite naturally TTL'd without anyone
    // clicking accept/decline. The sweep transitions stale rows to EXPIRED.
    const { request, params } = buildRequest();

    await POST(request, { params });

    expect(inviteUpdateManyMock).toHaveBeenCalledTimes(1);
    const where = inviteUpdateManyMock.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      lobbyId: LOBBY_ID,
      status: "PENDING",
    });
    expect(where?.expiresAt).toMatchObject({ lte: expect.any(Date) });
  });

  it("voids the previous live invite and notifies both recipients", async () => {
    inviteFindManyMock.mockResolvedValueOnce([
      { id: "invite-old", toUserId: "user-old-friend" },
    ]);
    const { request, params } = buildRequest();

    const res = await POST(request, { params });

    expect(res.status).toBe(201);
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["invite-old"] },
        status: "PENDING",
      },
      data: { status: "CANCELED" },
    });
    expect(notifyUserMock.mock.calls).toEqual(
      expect.arrayContaining([
        [
          "user-old-friend",
          { type: "lobby:invite_canceled", inviteId: "invite-old" },
        ],
        [FRIEND_ID, expect.objectContaining({ type: "lobby:invite_received" })],
      ])
    );
  });

  it("translates a P2002 unique-violation into 409", async () => {
    // CodeRabbit critical — partial unique index on
    // (lobby_id, to_user_id) WHERE status='PENDING' rejects the duplicate
    // atomically. Two concurrent requests race; one wins, the other 409s
    // instead of persisting a duplicate row.
    transactionMock.mockImplementationOnce(async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" }
      );
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
  });

  it("rejects non-host callers (403)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-someone-else" } });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects non-friend recipients (400)", async () => {
    friendshipFindFirstMock.mockResolvedValue(null);
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects when the lobby is closed or already in-game (400)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({ ...lobbyOpen, status: "IN_GAME" });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does not create or fan out an invite when close wins after preflight", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });

    expect(res.status).toBe(400);
    expect(lobbyUpdateManyMock).toHaveBeenCalledOnce();
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
    expect(inviteCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects non-PVP lobbies (400)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({ ...lobbyOpen, mode: "SOLITAIRE" });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects when a real guest is already seated (409)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({
      ...lobbyOpen,
      guest: { userId: "user-other-guest" },
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects inviting yourself (400)", async () => {
    const { request, params } = buildRequest({ toUserId: HOST_ID });

    const res = await POST(request, { params });
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/lobbies/[id]/invite", () => {
  it("cancels the live invite, bumps revision, and notifies the invitee", async () => {
    inviteFindManyMock.mockResolvedValueOnce([
      { id: "invite-1", toUserId: FRIEND_ID },
    ]);
    const { request, params } = buildRequest();

    const res = await DELETE(request, { params });

    expect(res.status).toBe(200);
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["invite-1"] },
        status: "PENDING",
      },
      data: { status: "CANCELED" },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: LOBBY_ID },
      data: { revision: { increment: 1 } },
    });
    expect(notifyUserMock).toHaveBeenCalledWith(FRIEND_ID, {
      type: "lobby:invite_canceled",
      inviteId: "invite-1",
    });
  });

  it("returns 410 when the server timestamp has already elapsed", async () => {
    inviteFindManyMock.mockResolvedValueOnce([]);
    const { request, params } = buildRequest();

    const res = await DELETE(request, { params });

    expect(res.status).toBe(410);
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects a non-host without canceling the invite", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce({
      ...lobbyOpen,
      hostUserId: "another-host",
    });
    const { request, params } = buildRequest();

    const res = await DELETE(request, { params });

    expect(res.status).toBe(403);
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
