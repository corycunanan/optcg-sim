import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const lobbyCountMock = vi.fn();
const lobbyFindManyMock = vi.fn();
const lobbyDeleteManyMock = vi.fn();

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      count: (...args: unknown[]) => lobbyCountMock(...args),
      findMany: (...args: unknown[]) => lobbyFindManyMock(...args),
      deleteMany: (...args: unknown[]) => lobbyDeleteManyMock(...args),
    },
  },
}));

vi.stubEnv("CRON_SECRET", "test-cron-secret");

const { GET } = await import("./route");

const NOW = new Date("2026-07-15T04:30:00.000Z");
const CUTOFF = new Date("2026-06-15T04:30:00.000Z");

function buildRequest(options: { auth?: string | null; dryRun?: string } = {}) {
  const url = new URL("http://localhost/api/cron/lobby-retention");
  if (options.dryRun) url.searchParams.set("dryRun", options.dryRun);

  const headers = new Headers();
  if (options.auth !== null) {
    headers.set("authorization", options.auth ?? "Bearer test-cron-secret");
  }

  return new NextRequest(url, { headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  lobbyCountMock.mockReset();
  lobbyFindManyMock.mockReset();
  lobbyDeleteManyMock.mockReset();
  lobbyCountMock.mockResolvedValue(0);
  lobbyFindManyMock.mockResolvedValue([]);
  lobbyDeleteManyMock.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/lobby-retention", () => {
  it.each([null, "Bearer wrong"])(
    "rejects an unauthorized request with header %s",
    async (auth) => {
      const response = await GET(buildRequest({ auth }));

      expect(response.status).toBe(401);
      expect(lobbyCountMock).not.toHaveBeenCalled();
    }
  );

  it("fails closed when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(lobbyCountMock).not.toHaveBeenCalled();
  });

  it("dry-runs the eligibility count without selecting or deleting rows", async () => {
    lobbyCountMock.mockResolvedValueOnce(7);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await GET(buildRequest({ dryRun: "true" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      dryRun: true,
      cutoff: CUTOFF.toISOString(),
      eligible: 7,
      selected: 0,
      deleted: 0,
      errors: 0,
      durationMs: 0,
    });
    expect(lobbyFindManyMock).not.toHaveBeenCalled();
    expect(lobbyDeleteManyMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: "lobby_retention_sweep", ...body })
    );
    infoSpy.mockRestore();
  });

  it("rejects an invalid dryRun value instead of silently deleting", async () => {
    const response = await GET(buildRequest({ dryRun: "tru" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "dryRun must be true or false",
    });
    expect(lobbyCountMock).not.toHaveBeenCalled();
    expect(lobbyDeleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes old orphans while preserving recent, active, and game-linked lobbies", async () => {
    lobbyCountMock.mockResolvedValueOnce(4);
    lobbyFindManyMock.mockResolvedValueOnce([
      { id: "old-orphan-1" },
      { id: "old-orphan-2" },
    ]);
    lobbyDeleteManyMock.mockResolvedValueOnce({ count: 2 });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    const eligibleWhere = {
      status: "CLOSED",
      updatedAt: { lt: CUTOFF },
      gameSession: { is: null },
    };
    expect(lobbyCountMock).toHaveBeenCalledWith({ where: eligibleWhere });
    expect(lobbyFindManyMock).toHaveBeenCalledWith({
      where: eligibleWhere,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true },
    });
    expect(lobbyDeleteManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["old-orphan-1", "old-orphan-2"] },
        ...eligibleWhere,
      },
    });
    expect(body).toMatchObject({
      success: true,
      dryRun: false,
      eligible: 4,
      selected: 2,
      deleted: 2,
      errors: 0,
    });
    infoSpy.mockRestore();
  });

  it("does not issue an empty delete and remains safe to retry", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const firstResponse = await GET(buildRequest());
    const secondResponse = await GET(buildRequest());

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(lobbyDeleteManyMock).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("reports structured error counts without exposing the database error", async () => {
    lobbyCountMock.mockResolvedValueOnce(3);
    lobbyFindManyMock.mockResolvedValueOnce([{ id: "old-orphan" }]);
    lobbyDeleteManyMock.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      dryRun: false,
      cutoff: CUTOFF.toISOString(),
      eligible: 3,
      selected: 1,
      deleted: 0,
      errors: 1,
      durationMs: 0,
    });
    expect(JSON.stringify(body)).not.toContain("database unavailable");
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      event: "lobby_retention_sweep_failed",
      errors: 1,
      error: "database unavailable",
    });
    errorSpy.mockRestore();
  });
});
