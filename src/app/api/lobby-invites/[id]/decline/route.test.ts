import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const inviteFindUniqueMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
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
    lobbyInvite: {
      findUnique: (...args: unknown[]) => inviteFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { POST } = await import("./route");

const RECIPIENT_ID = "user-recipient";
const HOST_ID = "user-host";
const INVITE_ID = "invite-1";

function buildRequest() {
  return {
    request: new NextRequest(
      `http://localhost/api/lobby-invites/${INVITE_ID}/decline`,
      { method: "POST" },
    ),
    params: Promise.resolve({ id: INVITE_ID }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  inviteFindUniqueMock.mockReset();
  inviteUpdateManyMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: RECIPIENT_ID } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  inviteFindUniqueMock.mockResolvedValue({
    id: INVITE_ID,
    toUserId: RECIPIENT_ID,
    fromUserId: HOST_ID,
  });
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  notifyUserMock.mockResolvedValue(undefined);
});

describe("POST /api/lobby-invites/[id]/decline", () => {
  it("atomically flips PENDING → DECLINED and fans out to host + recipient", async () => {
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(200);

    // Conditional update gates on PENDING status + recipient ownership.
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: INVITE_ID, toUserId: RECIPIENT_ID, status: "PENDING" },
      data: { status: "DECLINED" },
    });

    // Multi-tab echo: fan to both the host (clear "Invited X") and the
    // recipient (dismiss the toast in any other tab they have open).
    expect(notifyUserMock).toHaveBeenCalledTimes(2);
    const targets = notifyUserMock.mock.calls.map((call) => call[0]).sort();
    expect(targets).toEqual([HOST_ID, RECIPIENT_ID].sort());
    for (const call of notifyUserMock.mock.calls) {
      expect(call[1]).toEqual({
        type: "lobby:invite_declined",
        inviteId: INVITE_ID,
      });
    }
  });

  it("rejects non-recipient callers (403)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-stranger" } });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("returns 410 when the conditional flip affects 0 rows (CodeRabbit P2 — TOCTOU)", async () => {
    // Concurrent ACCEPTED / CANCELED / EXPIRED write between the pre-read
    // and the conditional update — count is 0 and we fail without
    // stomping the newer status back to DECLINED.
    inviteUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest();

    const res = await POST(request, { params });
    expect(res.status).toBe(410);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
