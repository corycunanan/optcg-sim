import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const gameFindFirstMock = vi.fn();
const lobbyFindFirstMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateManyMock = vi.fn();
const inviteFindManyMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const notifyUserMock = vi.fn();

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
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameFindFirstMock(...args),
    },
    lobby: {
      findFirst: (...args: unknown[]) => lobbyFindFirstMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
      deleteMany: (...args: unknown[]) => lobbyGuestDeleteManyMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => userUpdateManyMock(...args),
    },
    lobbyInvite: {
      findMany: (...args: unknown[]) => inviteFindManyMock(...args),
      updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { POST } = await import("./route");

const targetLobby = {
  id: "target-lobby",
  joinCode: "ABC123",
  status: "WAITING",
  hostUserId: "target-host",
  mode: "PVP",
  guest: null,
};

function request(body: unknown = { code: "ABC123" }) {
  return new NextRequest("http://localhost/api/lobbies/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const mock of [
    authMock,
    rateLimitMock,
    gameFindFirstMock,
    lobbyFindFirstMock,
    lobbyUpdateManyMock,
    lobbyGuestCreateMock,
    lobbyGuestDeleteManyMock,
    userFindUniqueMock,
    userUpdateManyMock,
    inviteFindManyMock,
    inviteUpdateManyMock,
    transactionMock,
    buildLobbyRoomStateMock,
    notifyLobbyMock,
    notifyUserMock,
  ]) {
    mock.mockReset();
  }
  authMock.mockResolvedValue({ user: { id: "joiner" } });
  rateLimitMock.mockResolvedValue({ limited: false });
  gameFindFirstMock.mockResolvedValue(null);
  lobbyFindFirstMock.mockResolvedValue(targetLobby);
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestCreateMock.mockResolvedValue(undefined);
  lobbyGuestDeleteManyMock.mockResolvedValue({ count: 1 });
  userFindUniqueMock.mockResolvedValue({
    activeLobbyId: null,
    activeLobby: null,
  });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  inviteFindManyMock.mockResolvedValue([]);
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "target-lobby",
    hostUserId: "target-host",
    status: "READY",
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  notifyUserMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (operation) =>
    operation({
      lobby: { findFirst: lobbyFindFirstMock, updateMany: lobbyUpdateManyMock },
      lobbyGuest: {
        create: lobbyGuestCreateMock,
        deleteMany: lobbyGuestDeleteManyMock,
      },
      user: { findUnique: userFindUniqueMock, updateMany: userUpdateManyMock },
      lobbyInvite: {
        findMany: inviteFindManyMock,
        updateMany: inviteUpdateManyMock,
      },
    })
  );
  afterCalls.pending.length = 0;
});

describe("POST /api/lobbies/join", () => {
  it("joins instantly when the user has no current party", async () => {
    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { lobbyId: "target-lobby" },
    });
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: {
        lobbyId: "target-lobby",
        userId: "joiner",
        deckId: undefined,
      },
    });
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target-lobby" }),
      { actorUserId: "joiner" }
    );
  });

  it("silently closes an empty personal lobby in the same transaction", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "personal-lobby",
      activeLobby: {
        id: "personal-lobby",
        status: "WAITING",
        revision: 3,
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: null,
        invites: [],
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "personal-lobby",
        hostUserId: "joiner",
        revision: 3,
        status: { in: ["WAITING", "READY"] },
        guest: { is: null },
        invites: { none: { status: "PENDING" } },
      },
      data: { status: "CLOSED", revision: { increment: 1 } },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { activeLobbyId: "personal-lobby" },
      data: { activeLobbyId: null },
    });
  });

  it("requires explicit confirmation before disbanding a hosted guest", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "current-lobby",
      activeLobby: {
        id: "current-lobby",
        status: "READY",
        revision: 4,
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: {
          userId: "ex-guest",
          user: { username: "Nami", name: null },
        },
        invites: [],
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Switching parties requires confirmation",
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: {
        currentLobbyId: "current-lobby",
        targetCode: "ABC123",
        guestName: "Nami",
        hasPendingInvite: false,
      },
    });
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
  });

  it("also requires confirmation when the host only has a pending invite", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "current-lobby",
      activeLobby: {
        id: "current-lobby",
        status: "WAITING",
        revision: 5,
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: null,
        invites: [{ id: "pending-invite" }],
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("PARTY_SWITCH_CONFIRMATION_REQUIRED");
    expect(body.details).toMatchObject({
      guestName: null,
      hasPendingInvite: true,
    });
  });

  it("confirmed host switching disbands, clears both pointers, cancels invites, and explains to the ex-guest", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "current-lobby",
      activeLobby: {
        id: "current-lobby",
        status: "READY",
        revision: 6,
        hostUserId: "joiner",
        host: { username: "Luffy", name: null },
        guest: {
          userId: "ex-guest",
          user: { username: "Nami", name: null },
        },
        invites: [{ id: "pending-invite" }],
      },
    });
    inviteFindManyMock
      .mockResolvedValueOnce([{ id: "pending-invite", toUserId: "invitee" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      request({
        code: "ABC123",
        confirmDisbandLobbyId: "current-lobby",
      })
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "current-lobby" },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { activeLobbyId: "current-lobby" },
      data: { activeLobbyId: null },
    });
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "pending-invite", status: "PENDING" },
      data: { status: "CANCELED" },
    });
    expect(notifyUserMock).toHaveBeenCalledWith("ex-guest", {
      type: "lobby:party_disbanded",
      lobbyId: "current-lobby",
      hostName: "Luffy",
    });
    expect(notifyUserMock).toHaveBeenCalledWith("invitee", {
      type: "lobby:invite_canceled",
      inviteId: "pending-invite",
    });
    expect(notifyUserMock).toHaveBeenCalledTimes(2);
  });

  it("lets a guest silently switch while returning the old host to WAITING", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "old-lobby",
      activeLobby: {
        id: "old-lobby",
        status: "READY",
        revision: 2,
        hostUserId: "old-host",
        host: { username: "Zoro", name: null },
        guest: {
          userId: "joiner",
          user: { username: "Joiner", name: null },
        },
        invites: [],
      },
    });
    buildLobbyRoomStateMock.mockImplementation(async (id: string) => ({
      id,
      hostUserId: id === "old-lobby" ? "old-host" : "target-host",
      status: id === "old-lobby" ? "WAITING" : "READY",
    }));

    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "old-lobby",
        status: "READY",
        mode: "PVP",
        guest: { is: { userId: "joiner" } },
      },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "old-lobby", userId: "joiner" },
    });
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("old-lobby");
  });

  it.each([
    ["closed", { status: "CLOSED" }, "This party has been closed"],
    ["full", { guest: { userId: "someone-else" } }, "This party is full"],
    ["in game", { status: "IN_GAME" }, "This party is already in a game"],
    ["own code", { hostUserId: "joiner" }, "You're already in this party"],
  ])(
    "returns a clear error for a %s target",
    async (_label, patch, message) => {
      lobbyFindFirstMock.mockResolvedValue({ ...targetLobby, ...patch });

      const response = await POST(request());

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: message });
      expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
    }
  );

  it("returns 404 for an unknown code and 400 for malformed input", async () => {
    lobbyFindFirstMock.mockResolvedValueOnce(null);
    const missing = await POST(request());
    const malformed = await POST(request({ code: "--" }));

    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Party code not found" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: "Enter a valid 6-character party code",
    });
  });

  it("re-prompts with fresh guest state when the unconfirmed close CAS loses", async () => {
    userFindUniqueMock
      .mockResolvedValueOnce({
        activeLobbyId: "current-lobby",
        activeLobby: {
          id: "current-lobby",
          status: "WAITING",
          revision: 10,
          hostUserId: "joiner",
          host: { username: "Luffy", name: null },
          guest: null,
          invites: [],
        },
      })
      .mockResolvedValueOnce({
        activeLobbyId: "current-lobby",
        activeLobby: {
          id: "current-lobby",
          status: "READY",
          revision: 11,
          hostUserId: "joiner",
          host: { username: "Luffy", name: null },
          guest: {
            userId: "new-guest",
            user: { username: "Usopp", name: null },
          },
          invites: [],
        },
      });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: {
        currentLobbyId: "current-lobby",
        guestName: "Usopp",
        hasPendingInvite: false,
      },
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revision: 10,
          guest: { is: null },
          invites: { none: { status: "PENDING" } },
        }),
      })
    );
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("re-prompts when a pending invite appears without changing revision", async () => {
    const baseLobby = {
      id: "current-lobby",
      status: "WAITING",
      revision: 12,
      hostUserId: "joiner",
      host: { username: "Luffy", name: null },
      guest: null,
    };
    userFindUniqueMock
      .mockResolvedValueOnce({
        activeLobbyId: "current-lobby",
        activeLobby: { ...baseLobby, invites: [] },
      })
      .mockResolvedValueOnce({
        activeLobbyId: "current-lobby",
        activeLobby: {
          ...baseLobby,
          invites: [{ id: "new-invite" }],
        },
      });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: { currentLobbyId: "current-lobby", hasPendingInvite: true },
    });
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("re-prompts a confirmed retry when a concurrent invite bumps revision", async () => {
    let concurrentInviteStatus = "PENDING";
    const baseLobby = {
      id: "current-lobby",
      status: "WAITING",
      hostUserId: "joiner",
      host: { username: "Luffy", name: null },
      guest: null,
    };
    userFindUniqueMock
      .mockResolvedValueOnce({
        activeLobbyId: "current-lobby",
        activeLobby: {
          ...baseLobby,
          revision: 20,
          invites: [{ id: "original-invite" }],
        },
      })
      .mockResolvedValueOnce({
        activeLobbyId: "current-lobby",
        activeLobby: {
          ...baseLobby,
          revision: 21,
          invites: [{ id: "concurrent-invite" }],
        },
      });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    inviteUpdateManyMock.mockImplementation(() => {
      concurrentInviteStatus = "CANCELED";
      return { count: 1 };
    });

    const response = await POST(
      request({
        code: "ABC123",
        confirmDisbandLobbyId: "current-lobby",
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: {
        currentLobbyId: "current-lobby",
        hasPendingInvite: true,
      },
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: 20 }),
      })
    );
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
    expect(concurrentInviteStatus).toBe("PENDING");
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
  });

  it("does not let a stale confirmation authorize a different hosted lobby", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "new-lobby",
      activeLobby: {
        id: "new-lobby",
        status: "WAITING",
        revision: 1,
        hostUserId: "joiner",
        host: { username: "Luffy", name: null },
        guest: null,
        invites: [],
      },
    });

    const response = await POST(
      request({ code: "ABC123", confirmDisbandLobbyId: "old-lobby" })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: { currentLobbyId: "new-lobby" },
    });
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
  });

  it("rolls back the old party when the target fills during commit", async () => {
    type HarnessState = {
      lobbies: Record<
        string,
        {
          status: "WAITING" | "READY" | "CLOSED";
          revision: number;
          guestUserId: string | null;
        }
      >;
      users: Record<string, { activeLobbyId: string | null }>;
      invites: Record<
        string,
        {
          lobbyId: string;
          toUserId: string;
          status: "PENDING" | "CANCELED";
        }
      >;
    };

    let state: HarnessState = {
      lobbies: {
        current: { status: "READY", revision: 7, guestUserId: "ex-guest" },
        target: { status: "WAITING", revision: 2, guestUserId: null },
      },
      users: {
        joiner: { activeLobbyId: "current" },
        "ex-guest": { activeLobbyId: "current" },
      },
      invites: {
        pending: {
          lobbyId: "current",
          toUserId: "invitee",
          status: "PENDING",
        },
      },
    };
    const initialState = structuredClone(state);
    let discardedState: HarnessState | null = null;

    transactionMock.mockImplementationOnce(async (operation) => {
      const draft = structuredClone(state);
      const tx = {
        lobby: {
          findFirst: async () => ({ ...targetLobby, id: "target-lobby" }),
          updateMany: async (args: {
            where: { id: string };
            data: { status: "CLOSED"; revision: { increment: number } };
          }) => {
            if (args.where.id === "current") {
              draft.lobbies.current.status = "CLOSED";
              draft.lobbies.current.revision += args.data.revision.increment;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        lobbyGuest: {
          deleteMany: async () => {
            draft.lobbies.current.guestUserId = null;
            return { count: 1 };
          },
          create: async () => undefined,
        },
        user: {
          findUnique: async () => ({
            activeLobbyId: draft.users.joiner.activeLobbyId,
            activeLobby: {
              id: "current",
              status: draft.lobbies.current.status,
              revision: draft.lobbies.current.revision,
              hostUserId: "joiner",
              host: { username: "Luffy", name: null },
              guest: draft.lobbies.current.guestUserId
                ? {
                    userId: draft.lobbies.current.guestUserId,
                    user: { username: "Nami", name: null },
                  }
                : null,
              invites: Object.entries(draft.invites)
                .filter(
                  ([, value]) =>
                    value.lobbyId === "current" && value.status === "PENDING"
                )
                .map(([id]) => ({ id })),
            },
          }),
          updateMany: async (args: {
            where: { activeLobbyId?: string; id?: string };
            data: { activeLobbyId: string | null };
          }) => {
            if (args.where.activeLobbyId) {
              for (const user of Object.values(draft.users)) {
                if (user.activeLobbyId === args.where.activeLobbyId) {
                  user.activeLobbyId = args.data.activeLobbyId;
                }
              }
            }
            return { count: 1 };
          },
        },
        lobbyInvite: {
          findMany: async () =>
            Object.entries(draft.invites)
              .filter(([, value]) => value.status === "PENDING")
              .map(([id, value]) => ({ id, toUserId: value.toUserId })),
          updateMany: async (args: { where: { id: string } }) => {
            draft.invites[args.where.id].status = "CANCELED";
            return { count: 1 };
          },
        },
      };

      try {
        const result = await operation(tx);
        state = draft;
        return result;
      } catch (error) {
        discardedState = draft;
        throw error;
      }
    });

    const response = await POST(
      request({ code: "ABC123", confirmDisbandLobbyId: "current" })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This party is full" });
    expect(discardedState).toMatchObject({
      lobbies: {
        current: { status: "CLOSED", revision: 8, guestUserId: null },
      },
      users: {
        joiner: { activeLobbyId: null },
        "ex-guest": { activeLobbyId: null },
      },
      invites: { pending: { status: "CANCELED" } },
    });
    expect(state).toEqual(initialState);
    expect(state.lobbies.current).toEqual({
      status: "READY",
      revision: 7,
      guestUserId: "ex-guest",
    });
    expect(state.users.joiner.activeLobbyId).toBe("current");
    expect(state.users["ex-guest"].activeLobbyId).toBe("current");
    expect(state.invites.pending.status).toBe("PENDING");
  });

  it("blocks switching while the joiner has an active game", async () => {
    gameFindFirstMock.mockResolvedValue({ lobbyId: "game-lobby" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Finish or leave your current game first",
      code: "ACTIVE_GAME_EXISTS",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
