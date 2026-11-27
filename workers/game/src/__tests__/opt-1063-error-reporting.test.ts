import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../index.js";
import { GameSession } from "../GameSession.js";
import { ReportingGameSession } from "../session/error-boundary.js";
import { log } from "../lib/log.js";
import {
  reportError,
  resetErrorReporter,
  setErrorReporter,
  type ErrorReport,
} from "../lib/error-reporting.js";
import type { Env } from "../types.js";

const logMock = vi.mocked(log);

afterEach(() => {
  resetErrorReporter();
  logMock.mockClear();
  vi.restoreAllMocks();
});

function envWithStub(stubFetch: () => Promise<Response>): Env {
  return {
    GAME_WORKER_SECRET: "test-secret",
    GAME_SESSION: {
      idFromName: () => "durable-id",
      get: () => ({ fetch: stubFetch }),
    },
  } as unknown as Env;
}

function statusRequest(): Request {
  return new Request("https://worker.test/game/game-1/status", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

function reportedEvents(): ErrorReport[] {
  return logMock.mock.calls
    .filter(([event]) => event === "error.reported")
    .map(([, data]) => data as unknown as ErrorReport);
}

describe("OPT-1063 worker error reporting", () => {
  it("logs a scrubbed error.reported event by default", () => {
    reportError(new Error("lookup failed for usopp@example.com"), {
      source: "worker.session",
      tags: { handler: "alarm", gameId: "game-1" },
    });

    const [report] = reportedEvents();
    expect(report).toMatchObject({
      source: "worker.session",
      message: "lookup failed for [redacted]",
      tags: { handler: "alarm", gameId: "game-1" },
    });
    expect(report!.stack).toContain("Error");
  });

  it("reports and rethrows an error the entry router throws", async () => {
    const failure = new Error("binding missing");
    const env = envWithStub(() => Promise.reject(failure));

    await expect(worker.fetch(statusRequest(), env)).rejects.toBe(failure);

    expect(reportedEvents()).toEqual([
      expect.objectContaining({
        source: "worker.fetch",
        message: "binding missing",
        tags: { method: "GET", path: "/game/game-1/status" },
      }),
    ]);
  });

  it("skips errors a Durable Object already reported", async () => {
    const remote = Object.assign(new Error("engine blew up"), { remote: true });
    const env = envWithStub(() => Promise.reject(remote));

    await expect(worker.fetch(statusRequest(), env)).rejects.toBe(remote);
    expect(reportedEvents()).toEqual([]);
  });

  it("routes to an installed reporter and never throws when it fails", () => {
    const reports: ErrorReport[] = [];
    setErrorReporter((report) => reports.push(report));
    reportError("boom", { source: "worker.fetch" });
    expect(reports.map((report) => report.name)).toEqual(["NonErrorThrown"]);

    setErrorReporter(() => {
      throw new Error("provider down");
    });
    expect(() => reportError("boom", { source: "worker.fetch" })).not.toThrow();
  });

  it.each(["fetch", "webSocketMessage", "alarm"] as const)(
    "reports and rethrows errors escaping GameSession.%s",
    async (handler) => {
      const failure = new Error(`${handler} failed`);
      vi.spyOn(GameSession.prototype, handler).mockRejectedValue(failure);
      // Prototype instance: exercises the wrappers without a Durable Object.
      const session = Object.create(
        ReportingGameSession.prototype
      ) as ReportingGameSession;
      Object.assign(session, { gameState: { id: "game-9" } });

      const call =
        handler === "fetch"
          ? session.fetch(new Request("https://worker.test/game/game-9/ws"))
          : handler === "webSocketMessage"
            ? session.webSocketMessage({} as WebSocket, "{}")
            : session.alarm();
      await expect(call).rejects.toBe(failure);

      expect(reportedEvents()).toEqual([
        expect.objectContaining({
          source: "worker.session",
          message: `${handler} failed`,
          tags: { handler, gameId: "game-9" },
        }),
      ]);
    }
  );
});
