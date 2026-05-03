import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userUpdateMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => userUpdateMock(...args),
    },
  },
}));

vi.stubEnv("GAME_WORKER_SECRET", "test-secret");

const { POST } = await import("./route");

function buildRequest(
  userId: string,
  auth?: string,
  body?: unknown,
): {
  request: NextRequest;
  params: Promise<{ userId: string }>;
} {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.Authorization = auth;
  if (body !== undefined) headers["content-type"] = "application/json";
  return {
    request: new NextRequest(`http://localhost/api/realtime/users/${userId}/last-seen`, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    params: Promise.resolve({ userId }),
  };
}

beforeEach(() => {
  userUpdateMock.mockReset();
});

describe("POST /api/realtime/users/[userId]/last-seen", () => {
  it("rejects callers with no bearer secret", async () => {
    const { request, params } = buildRequest("user-1");

    const res = await POST(request, { params });

    expect(res.status).toBe(401);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("updates User.lastSeen with a fresh timestamp on auth success", async () => {
    userUpdateMock.mockResolvedValue({ id: "user-1" });
    const { request, params } = buildRequest("user-1", "Bearer test-secret");
    const before = Date.now();

    const res = await POST(request, { params });

    expect(res.status).toBe(204);
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    const call = userUpdateMock.mock.calls[0]![0] as {
      where: { id: string };
      data: { lastSeen: Date };
    };
    expect(call.where).toEqual({ id: "user-1" });
    expect(call.data.lastSeen).toBeInstanceOf(Date);
    const stamped = call.data.lastSeen.getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it("treats P2025 (record not found) as a 204 — best-effort write", async () => {
    userUpdateMock.mockRejectedValue({ code: "P2025" });
    const { request, params } = buildRequest("ghost-user", "Bearer test-secret");

    const res = await POST(request, { params });

    expect(res.status).toBe(204);
  });

  it("uses the worker-supplied lastSeen timestamp verbatim", async () => {
    userUpdateMock.mockResolvedValue({ id: "user-1" });
    const supplied = "2026-05-02T18:30:00.000Z";
    const { request, params } = buildRequest("user-1", "Bearer test-secret", { lastSeen: supplied });

    const res = await POST(request, { params });

    expect(res.status).toBe(204);
    const call = userUpdateMock.mock.calls[0]![0] as { data: { lastSeen: Date } };
    expect(call.data.lastSeen).toBeInstanceOf(Date);
    expect(call.data.lastSeen.toISOString()).toBe(supplied);
  });

  it("falls back to server clock when lastSeen body is invalid", async () => {
    userUpdateMock.mockResolvedValue({ id: "user-1" });
    const { request, params } = buildRequest("user-1", "Bearer test-secret", { lastSeen: "not-a-date" });
    const before = Date.now();

    const res = await POST(request, { params });

    expect(res.status).toBe(204);
    const call = userUpdateMock.mock.calls[0]![0] as { data: { lastSeen: Date } };
    expect(call.data.lastSeen.getTime()).toBeGreaterThanOrEqual(before);
  });
});
