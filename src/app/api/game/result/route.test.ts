import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const finalizeGameResultMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 29 }));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/game/finalize", () => ({
  finalizeGameResult: (...args: unknown[]) => finalizeGameResultMock(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const SECRET = "test-secret";
vi.stubEnv("GAME_WORKER_SECRET", SECRET);

const { POST } = await import("./route");

const validBody = {
  gameId: "game-1",
  status: "FINISHED",
  winnerId: "user-1",
  winReason: "Life-out",
  reasonCode: "LIFE_LOSS",
};

function buildRequest(opts: { auth?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== null) {
    headers.Authorization = opts.auth ?? `Bearer ${SECRET}`;
  }
  return new NextRequest("http://localhost/api/game/result", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? validBody),
  });
}

beforeEach(() => {
  finalizeGameResultMock.mockReset();
  finalizeGameResultMock.mockResolvedValue({ finalized: true, alreadyFinal: false });
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 29 });
});

describe("POST /api/game/result", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(buildRequest({ auth: "" }));
    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Bearer token does not match", async () => {
    const res = await POST(buildRequest({ auth: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded, keyed by gameId", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const res = await POST(buildRequest());
    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith("game-result:game-1");
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("finalizes the game session and returns success on happy path", async () => {
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("game-result:game-1");
    expect(finalizeGameResultMock).toHaveBeenCalledWith({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Life-out",
      reasonCode: "LIFE_LOSS",
    });
  });

  it("rejects non-terminal result payloads", async () => {
    const res = await POST(buildRequest({ body: { ...validBody, status: "IN_PROGRESS" } }));
    expect(res.status).toBe(400);
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the DB update throws", async () => {
    finalizeGameResultMock.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
