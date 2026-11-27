import { describe, expect, it, vi } from "vitest";
import { buildErrorReport } from "@shared/error-report";
import {
  combineReporters,
  createSentryReporter,
  sentryBaseOptions,
} from "./sentry";

describe("app Sentry wiring", () => {
  it("captures the original error with string tags and an opaque user id", () => {
    const captureException = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "d1" });
    const report = buildErrorReport(error, {
      source: "app.boundary",
      userId: "user_1",
      tags: { boundary: "decks", attempt: 2 },
    });

    createSentryReporter({ captureException })(report, error);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: {
        source: "app.boundary",
        boundary: "decks",
        attempt: "2",
        digest: "d1",
      },
      user: { id: "user_1" },
    });
  });

  it("runs every reporter even when one throws", () => {
    const second = vi.fn();
    const report = buildErrorReport("x", { source: "app.client" });
    combineReporters(() => {
      throw new Error("down");
    }, second)(report, "x");
    expect(second).toHaveBeenCalledOnce();
  });

  it("never sends default PII and scrubs events and breadcrumbs", () => {
    const options = sentryBaseOptions("https://key@o1.ingest.sentry.io/1");
    expect(options).toMatchObject({
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });

    expect(
      options.beforeSend({
        exception: { values: [{ value: "no deck for nami@example.com" }] },
        request: {
          url: "https://app.test/decks?id=1",
          cookies: { "authjs.session-token": "s" },
          query_string: "id=1",
        },
        user: {
          id: "user_1",
          email: "nami@example.com",
          ip_address: "1.2.3.4",
        },
      })
    ).toEqual({
      exception: { values: [{ value: "no deck for [redacted]" }] },
      request: { url: "https://app.test/decks" },
      user: { id: "user_1" },
    });
    expect(options.beforeBreadcrumb({ message: "fetch Bearer abc" })).toEqual({
      message: "fetch Bearer [redacted]",
    });
  });
});
