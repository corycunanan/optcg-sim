import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const inviteFindManyMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobbyInvite: {
      findMany: (...args: unknown[]) => inviteFindManyMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: rateLimitMock },
}));

const { GET } = await import("./route");

const RECIPIENT_ID = "user-recipient";
const HOST_ID = "user-host";

function makeInviteRow(overrides: Partial<{ status: string; lobbyStatus: string; id: string }> = {}) {
  return {
    id: overrides.id ?? "invite-1",
    lobbyId: "lobby-1",
    fromUserId: HOST_ID,
    toUserId: RECIPIENT_ID,
    status: overrides.status ?? "PENDING",
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    fromUser: {
      id: HOST_ID,
      username: "luffy",
      name: "Luffy",
      image: null,
    },
    lobby: {
      joinCode: "ABCD",
      format: "Standard",
      mode: "PVP",
      status: overrides.lobbyStatus ?? "WAITING",
      host: { username: "luffy" },
    },
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  inviteFindManyMock.mockReset();

  authMock.mockResolvedValue({ user: { id: RECIPIENT_ID } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
});

describe("GET /api/lobby-invites/pending", () => {
  it("returns serialized PENDING invites for the caller", async () => {
    inviteFindManyMock.mockResolvedValue([makeInviteRow()]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: Array<{ id: string; lobby: { joinCode: string } }>;
    };
    expect(json.data).toHaveLength(1);
    expect(json.data[0]?.id).toBe("invite-1");
    expect(json.data[0]?.lobby.joinCode).toBe("ABCD");
  });

  it("filters out invites whose lobby moved past WAITING/READY", async () => {
    inviteFindManyMock.mockResolvedValue([
      makeInviteRow({ id: "invite-active", lobbyStatus: "WAITING" }),
      makeInviteRow({ id: "invite-stale", lobbyStatus: "IN_GAME" }),
    ]);

    const res = await GET();
    const json = (await res.json()) as { data: Array<{ id: string }> };
    expect(json.data.map((i) => i.id)).toEqual(["invite-active"]);
  });

  it("returns 401 unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    expect(inviteFindManyMock).not.toHaveBeenCalled();
  });
});
