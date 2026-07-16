import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const friendshipFindManyMock = vi.fn();
const userFindManyMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    friendship: {
      findMany: (...args: unknown[]) => friendshipFindManyMock(...args),
    },
    user: {
      findMany: (...args: unknown[]) => userFindManyMock(...args),
    },
  },
}));

vi.stubEnv("GAME_WORKER_URL", "https://worker.example.test");
vi.stubEnv("GAME_WORKER_SECRET", "test-secret");
vi.stubGlobal("fetch", fetchMock);

const { GET } = await import("./route");

function buildRequest(ids: string[]): NextRequest {
  const qs = ids.length > 0 ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
  return new NextRequest(`http://localhost/api/users/presence${qs}`);
}

function healthResponse(connections: number): Response {
  return new Response(JSON.stringify({ connections }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("GAME_WORKER_URL", "https://worker.example.test");
  vi.stubEnv("GAME_WORKER_SECRET", "test-secret");
  authMock.mockReset();
  friendshipFindManyMock.mockReset();
  userFindManyMock.mockReset();
  fetchMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-self" } });
});

describe("GET /api/users/presence", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET(buildRequest(["a"]));

    expect(res.status).toBe(401);
  });

  it("returns an empty map when ids is empty", async () => {
    const res = await GET(buildRequest([]));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({});
    expect(friendshipFindManyMock).not.toHaveBeenCalled();
  });

  it("filters out non-friend ids and aggregates online status from worker /health", async () => {
    friendshipFindManyMock.mockResolvedValue([
      { userAId: "user-self", userBId: "friend-online" },
      { userAId: "friend-offline", userBId: "user-self" },
    ]);
    userFindManyMock.mockResolvedValue([
      { id: "friend-online", lastSeen: null },
      { id: "friend-offline", lastSeen: new Date("2026-05-02T12:00:00.000Z") },
    ]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/user/friend-online/health")) return healthResponse(1);
      if (url.includes("/user/friend-offline/health")) return healthResponse(0);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const res = await GET(
      buildRequest(["friend-online", "friend-offline", "stranger"]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.data).sort()).toEqual(["friend-offline", "friend-online"]);
    expect(body.data["friend-online"]).toEqual({ online: true, lastSeen: null });
    expect(body.data["friend-offline"]).toEqual({
      online: false,
      lastSeen: "2026-05-02T12:00:00.000Z",
    });
  });

  it("treats a worker /health failure as offline (no 500 surfaced to the client)", async () => {
    friendshipFindManyMock.mockResolvedValue([
      { userAId: "user-self", userBId: "friend-x" },
    ]);
    userFindManyMock.mockResolvedValue([
      { id: "friend-x", lastSeen: null },
    ]);
    fetchMock.mockImplementation(async () => {
      throw new Error("network failure");
    });

    const res = await GET(buildRequest(["friend-x"]));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data["friend-x"]).toEqual({ online: false, lastSeen: null });
  });

  it("treats every visible friend as offline when worker configuration is missing", async () => {
    vi.stubEnv("GAME_WORKER_SECRET", "");
    friendshipFindManyMock.mockResolvedValue([
      { userAId: "user-self", userBId: "friend-x" },
    ]);
    userFindManyMock.mockResolvedValue([
      { id: "friend-x", lastSeen: new Date("2026-05-02T12:00:00.000Z") },
    ]);

    const res = await GET(buildRequest(["friend-x"]));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data["friend-x"]).toEqual({
      online: false,
      lastSeen: "2026-05-02T12:00:00.000Z",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects too many ids", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    const res = await GET(buildRequest(ids));

    expect(res.status).toBe(400);
  });
});
