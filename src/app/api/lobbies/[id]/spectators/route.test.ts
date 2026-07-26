import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const joinLobbyAsSpectatorMock = vi.fn();
const publishSpectatorJoinMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();

const afterCalls = vi.hoisted(() => ({ pending: [] as Promise<void>[] }));

async function flushAfter() {
  while (afterCalls.pending.length) {
    await Promise.all(afterCalls.pending.splice(0));
  }
}

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      afterCalls.pending.push(Promise.resolve().then(callback));
    },
  };
});
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/lobbies/join-spectator", () => ({
  joinLobbyAsSpectator: (...args: unknown[]) =>
    joinLobbyAsSpectatorMock(...args),
  publishSpectatorJoin: (...args: unknown[]) =>
    publishSpectatorJoinMock(...args),
  spectatorJoinFailureMessage: (kind: string) =>
    ({
      not_found: "Party not found",
      closed: "This party has been closed",
      spectating_disabled: "Spectating is disabled for this party",
      full: "This party is full",
      seated: "Seated players cannot spectate their own party",
      active_game_exists: "Finish or leave your current game first",
      active_lobby_exists: "Your current party changed. Please try again",
      concurrent_state_conflict: "Party state changed concurrently. Try again.",
    })[kind],
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));

const { POST } = await import("./route");

const params = { params: Promise.resolve({ id: "lobby-1" }) };
const joinedResult = {
  kind: "joined",
  lobbyId: "lobby-1",
  membership: "created",
  previousLobbyId: null,
  previousLobbyClosed: false,
  removedSpectatorUserIds: [],
  disbandedGuest: null,
  canceledInvites: [],
};
const roomState = {
  id: "lobby-1",
  status: "IN_GAME",
  version: 8,
  viewerRole: "spectator",
};

function request(body: unknown = {}) {
  return new NextRequest("http://localhost/api/lobbies/lobby-1/spectators", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const mock of [
    authMock,
    rateLimitMock,
    joinLobbyAsSpectatorMock,
    publishSpectatorJoinMock,
    buildLobbyRoomStateMock,
  ]) {
    mock.mockReset();
  }
  authMock.mockResolvedValue({ user: { id: "spectator-user" } });
  rateLimitMock.mockResolvedValue({ limited: false });
  joinLobbyAsSpectatorMock.mockResolvedValue(joinedResult);
  publishSpectatorJoinMock.mockResolvedValue(undefined);
  buildLobbyRoomStateMock.mockResolvedValue(roomState);
  afterCalls.pending.length = 0;
});

describe("POST /api/lobbies/[id]/spectators", () => {
  it("returns the viewer-scoped current state and publishes a created join", async () => {
    const response = await POST(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: roomState });
    expect(rateLimitMock).toHaveBeenCalledWith("lobby-join:spectator-user");
    expect(joinLobbyAsSpectatorMock).toHaveBeenCalledWith({
      userId: "spectator-user",
      lobbyId: "lobby-1",
    });
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith(
      "lobby-1",
      "spectator-user"
    );
    expect(publishSpectatorJoinMock).toHaveBeenCalledWith(
      joinedResult,
      "spectator-user"
    );
  });

  it("returns 401 before rate limiting or mutation when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await POST(request(), params);

    expect(response.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(joinLobbyAsSpectatorMock).not.toHaveBeenCalled();
  });

  it("returns 429 before parsing or mutation when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true });

    const response = await POST(
      new NextRequest("http://localhost/api/lobbies/lobby-1/spectators", {
        method: "POST",
        body: "not-json",
      }),
      params
    );

    expect(response.status).toBe(429);
    expect(joinLobbyAsSpectatorMock).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "Party not found"],
    ["spectating_disabled", 403, "Spectating is disabled for this party"],
    ["full", 409, "This party is full"],
    ["closed", 409, "This party has been closed"],
    ["seated", 409, "Seated players cannot spectate their own party"],
  ])("maps %s to its distinct response", async (kind, status, error) => {
    joinLobbyAsSpectatorMock.mockResolvedValueOnce({ kind });

    const response = await POST(request(), params);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
    expect(publishSpectatorJoinMock).not.toHaveBeenCalled();
  });

  it("passes explicit host-disband confirmation through to the transaction", async () => {
    await POST(request({ confirmDisbandLobbyId: "current-lobby" }), params);

    expect(joinLobbyAsSpectatorMock).toHaveBeenCalledWith({
      userId: "spectator-user",
      lobbyId: "lobby-1",
      confirmDisbandLobbyId: "current-lobby",
    });
  });

  it("returns the target lobby in the host-disband confirmation payload", async () => {
    joinLobbyAsSpectatorMock.mockResolvedValueOnce({
      kind: "confirmation_required",
      currentLobbyId: "current-lobby",
      targetLobbyId: "lobby-1",
      guestName: "Nami",
      hasPendingInvite: true,
    });

    const response = await POST(request(), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Switching parties requires confirmation",
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: {
        currentLobbyId: "current-lobby",
        targetLobbyId: "lobby-1",
        guestName: "Nami",
        hasPendingInvite: true,
      },
    });
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
  });

  it("returns the existing spectator's state through the no-op publisher", async () => {
    joinLobbyAsSpectatorMock.mockResolvedValueOnce({
      ...joinedResult,
      membership: "existing",
    });

    const response = await POST(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: roomState });
    expect(publishSpectatorJoinMock).toHaveBeenCalledWith(
      expect.objectContaining({ membership: "existing" }),
      "spectator-user"
    );
  });
});
