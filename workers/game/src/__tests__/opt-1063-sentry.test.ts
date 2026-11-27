import { afterEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/cloudflare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/cloudflare")>()),
  captureException,
}));

const { reportError, resetErrorReporter } =
  await import("../lib/error-reporting.js");
const { sentryOptions } = await import("../lib/sentry.js");
import type { Env } from "../types.js";

afterEach(() => {
  resetErrorReporter();
  captureException.mockReset();
});

describe("OPT-1063 worker Sentry wiring", () => {
  it("forwards reports to Sentry with tags and an opaque user id", () => {
    const failure = new Error("boom");
    reportError(failure, {
      source: "worker.session",
      userId: "user_opaque",
      tags: { handler: "alarm", gameId: "game-1", skipped: undefined },
    });

    expect(captureException).toHaveBeenCalledWith(failure, {
      tags: { source: "worker.session", handler: "alarm", gameId: "game-1" },
      user: { id: "user_opaque" },
    });
  });

  it("keeps reporting when Sentry throws", () => {
    captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });
    expect(() =>
      reportError(new Error("boom"), { source: "worker.fetch" })
    ).not.toThrow();
  });

  it("stays disabled without a DSN and scrubs events before send", () => {
    expect(sentryOptions({} as Env)).toMatchObject({
      dsn: undefined,
      enabled: false,
      environment: "production",
    });

    const options = sentryOptions({
      SENTRY_DSN: "https://key@o1.ingest.sentry.io/1",
      SENTRY_ENVIRONMENT: "staging",
    } as Env);
    expect(options).toMatchObject({ enabled: true, environment: "staging" });

    const event = options.beforeSend!(
      {
        type: undefined,
        message: "lookup failed for robin@example.com",
        request: {
          url: "https://worker.test/game/1/ws?token=abc",
          headers: { Authorization: "Bearer secret" },
        },
        user: { id: "user_1", email: "robin@example.com" },
      },
      {}
    );
    expect(event).toEqual({
      type: undefined,
      message: "lookup failed for [redacted]",
      request: { url: "https://worker.test/game/1/ws" },
      user: { id: "user_1" },
    });
  });
});
