import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const inviteFindUniqueMock = vi.fn();
const inviteUpdateMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();

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
      update: (...args: unknown[]) => inviteUpdateMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
    },
    lobby: {
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
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

const pendingInvite = {
  id: INVITE_ID,
  toUserId: RECIPIENT_ID,
  fromUserId: HOST_ID,
  status: "PENDING",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  lobby: {
    id: LOBBY_ID,
    hostUserId: HOST_ID,
    status: "WAITING",
    mode: "PVP",
    guest: null,
  },
};

beforeEach(() => {
  vi.useRealTimers();
  authMock.mockReset();
  rateLimitMock.mockReset();
  inviteFindUniqueMock.mockReset();
  inviteUpdateMock.mockReset();
  lobbyGuestCreateMock.mockReset();
  lobbyUpdateMock.mockReset();
  transactionMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();

  authMock.mockResolvedValue({ user: { id: RECIPIENT_ID } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  inviteFindUniqueMock.mockResolvedValue(pendingInvite);
  inviteUpdateMock.mockResolvedValue(undefined);
  transactionMock.mockResolvedValue([]);
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
  notifyLobbyMock.mockResolvedValue(undefined);
});

describe("POST /api/lobby-invites/[id]/accept", () => {
  it("seats the recipient as guest, marks ACCEPTED, and fans out lobby state", async () => {
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { lobbyId: string } };
    expect(json.data.lobbyId).toBe(LOBBY_ID);

    // Single $transaction with three ops: LobbyGuest create, Lobby status
    // → READY, LobbyInvite status → ACCEPTED.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const ops = transactionMock.mock.calls[0]?.[0];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops).toHaveLength(3);

    expect(notifyLobbyMock).toHaveBeenCalledTimes(1);
    const [, options] = notifyLobbyMock.mock.calls[0] ?? [];
    expect(options).toEqual({ actorUserId: RECIPIENT_ID });
  });

  it("rejects non-recipient callers (403)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-stranger" } });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects already-accepted invites (410)", async () => {
    inviteFindUniqueMock.mockResolvedValue({
      ...pendingInvite,
      status: "ACCEPTED",
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(410);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects expired invites (410)", async () => {
    inviteFindUniqueMock.mockResolvedValue({
      ...pendingInvite,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(410);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects when the lobby is no longer WAITING (409)", async () => {
    inviteFindUniqueMock.mockResolvedValue({
      ...pendingInvite,
      lobby: { ...pendingInvite.lobby, status: "IN_GAME" },
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects when a different guest already joined (409)", async () => {
    inviteFindUniqueMock.mockResolvedValue({
      ...pendingInvite,
      lobby: {
        ...pendingInvite.lobby,
        guest: { userId: "user-other-guest" },
      },
    });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
