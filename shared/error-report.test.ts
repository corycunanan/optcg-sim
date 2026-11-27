import { describe, expect, it } from "vitest";
import { buildErrorReport, REDACTED, scrubText } from "./error-report";

describe("scrubText", () => {
  it.each([
    ["contact luffy@example.com now", `contact ${REDACTED} now`],
    [
      "Authorization: Bearer abc.def-123",
      `Authorization: ${REDACTED} ${REDACTED}`,
    ],
    ["fetch failed with Bearer abc123", `fetch failed with Bearer ${REDACTED}`],
    [
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part",
      `token ${REDACTED}`,
    ],
    [
      "cookie authjs.session-token=s3cr3t; theme=dark",
      `cookie authjs.session-token=${REDACTED}; theme=dark`,
    ],
    ["/game/1/ws?token=abc123&x=1", `/game/1/ws?token=${REDACTED}&x=1`],
    [
      "postgresql://user:pa55@db.example.com/app",
      `postgresql://${REDACTED}@db.example.com/app`,
    ],
    ['{"password":"hunter2"}', `{"password":"${REDACTED}"}`],
  ])("redacts %s", (input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it("leaves ordinary messages untouched", () => {
    const text = "Cannot read properties of undefined (reading 'power')";
    expect(scrubText(text)).toBe(text);
  });
});

describe("buildErrorReport", () => {
  const now = new Date("2026-11-27T07:00:00Z");

  it("keeps the stack and digest, scrubs personal data and drops undefined tags", () => {
    const error = Object.assign(new TypeError("no deck for zoro@example.com"), {
      digest: "12345",
    });
    const report = buildErrorReport(
      error,
      {
        source: "app.boundary",
        userId: "user_opaque",
        tags: { boundary: "decks", email: "zoro@example.com", gone: undefined },
      },
      now
    );

    expect(report).toMatchObject({
      source: "app.boundary",
      name: "TypeError",
      message: `no deck for ${REDACTED}`,
      digest: "12345",
      userId: "user_opaque",
      tags: { boundary: "decks", email: REDACTED },
      timestamp: "2026-11-27T07:00:00.000Z",
    });
    expect(report.tags).not.toHaveProperty("gone");
    expect(report.stack).toContain("TypeError");
    expect(report.stack).not.toContain("zoro@example.com");
  });

  it("normalizes non-Error throws", () => {
    expect(
      buildErrorReport("boom", { source: "worker.fetch" }, now)
    ).toMatchObject({ name: "NonErrorThrown", message: "boom", stack: null });
    expect(
      buildErrorReport({ code: 7 }, { source: "worker.fetch" }, now).message
    ).toBe('{"code":7}');
  });

  it("caps very long messages", () => {
    const report = buildErrorReport(
      new Error("x".repeat(5_000)),
      { source: "app.server" },
      now
    );
    expect(report.message.length).toBeLessThanOrEqual(2_001);
  });
});
