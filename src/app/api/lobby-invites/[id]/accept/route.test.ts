import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const inviteFindUniqueMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const cancelPendingLobbyInvitesMock = vi.fn();

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
    lobbyInvite: {
      findUnique: (...args: unknown[]) => inviteFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
    },
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));
vi.mock("@/lib/lobbies/cancel-invites", () => ({
  cancelPendingLobbyInvites: (...args: unknown[]) =>
    cancelPendingLobbyInvitesMock(...args),
}));

const { POST } = await import("./route");

const RECIPIENT_ID = "user-recipient";
const HOST_ID = "user-host";
const LOBBY_ID = "lobby-1";
const INVITE_ID = "invite-1";

function buildRequest() {
  return {
    request: new NextRequest(
      `http://localhost/api/lobby-invites/${INVITE_ID}/accept`,
      { method: "POST" },
    ),
    params: Promise.resolve({ id: INVITE_ID }),
  };
}

const livePendingInvite = {
  id: INVITE_ID,
  lobbyId: LOBBY_ID,
  toUserId: RECIPIENT_ID,
  status: "PENDING",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
};

const openLobby = {
  id: LOBBY_ID,
  hostUserId: HOST_ID,
  status: "WAITING",
  mode: "PVP",
  guest: null,
};

beforeEach(() => {
  vi.useRealTimers();
  authMock.mockReset();
  rateLimitMock.mockReset();
  inviteFindUniqueMock.mockReset();
  inviteUpdateManyMock.mockReset();
  lobbyFindUniqueMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyGuestCreateMock.mockReset();
  transactionMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();
  cancelPendingLobbyInvitesMock.mockReset();

  authMock.mockResolvedValue({ user: { id: RECIPIENT_ID } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  inviteFindUniqueMock.mockResolvedValue(livePendingInvite);
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyFindUniqueMock.mockResolvedValue(openLobby);
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestCreateMock.mockResolvedValue(undefined);
  cancelPendingLobbyInvitesMock.mockResolvedValue(undefined);
  notifyLobbyMock.mockResolvedValue(undefined);
  buildLobbyRoomStateMock.mockResolvedValue({
    id: LOBBY_ID,
    hostUserId: HOST_ID,
    status: "READY",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    hostReady: false,
    host: null,
    hostDeck: null,
    guest: {
      guestReady: false,
      user: { id: RECIPIENT_ID, username: null, name: null, image: null },
      deck: null,
    },
    gameId: null,
  });

  // Default tx implementation: invoke the callback with a tx-shaped object
  // backed by the same mocks. Tests can override per-mock call results to
  // exercise different paths inside the tx.
  transactionMock.mockImplementation(async (fn: unknown) => {
    if (typeof fn !== "function") return fn;
    return (fn as (tx: unknown) => Promise<unknown>)({
      lobbyInvite: {
        findUnique: (...args: unknown[]) => inviteFindUniqueMock(...args),
        updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
      },
      lobby: {
        findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
        updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
      },
      lobbyGuest: {
        create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
      },
    });
  });
});

describe("POST /api/lobby-invites/[id]/accept", () => {
  it("seats the recipient as guest, marks ACCEPTED, and fans out lobby state", async () => {
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { lobbyId: string } };
    expect(json.data.lobbyId).toBe(LOBBY_ID);

    // Conditional invite flip + conditional lobby flip + guest create.
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: INVITE_ID, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: LOBBY_ID, status: "WAITING" },
      data: { status: "READY" },
    });
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: { lobbyId: LOBBY_ID, userId: RECIPIENT_ID },
    });

    expect(notifyLobbyMock).toHaveBeenCalledTimes(1);
    expect(cancelPendingLobbyInvitesMock).toHaveBeenCalledWith(LOBBY_ID);
  });

  it("rejects non-recipient callers (403)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-stranger" } });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
  });

  it("returns 410 when the invite is no longer PENDING", async () => {
    inviteFindUniqueMock.mockResolvedValue({
      ...livePendingInvite,
      status: "ACCEPTED",
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(410);
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 410 when the invite has expired and rolls the row to EXPIRED", async () => {
    inviteFindUniqueMock.mockResolvedValue({
      ...livePendingInvite,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(410);
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: INVITE_ID, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
  });

  it("returns 410 when the conditional ACCEPTED flip loses a race (CodeRabbit critical)", async () => {
    // Concurrent decline / cancel between the read and the conditional
    // update — the where clause filters on `status: PENDING` so the count
    // is 0 and we fail closed instead of stomping ACCEPTED over the
    // newer state.
    inviteUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(410);
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the lobby moved off WAITING during the tx", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
  });

  it("returns 409 when LobbyGuest.create races on the unique constraint", async () => {
    // Concurrent join wins via the LobbyGuest.lobbyId @unique — Prisma
    // throws P2002 and we translate to 409 instead of bubbling a 500.
    lobbyGuestCreateMock.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
  });

  it("returns 409 when the lobby is no longer WAITING (pre-write read)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({ ...openLobby, status: "IN_GAME" });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 409 when a different guest already joined (pre-write read)", async () => {
    lobbyFindUniqueMock.mockResolvedValue({
      ...openLobby,
      guest: { userId: "user-other-guest" },
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
