import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

describe("formatRelativeTime", () => {
  const NOW = Date.parse("2026-05-02T18:00:00Z");

  it("returns 'just now' for sub-45s deltas", () => {
    expect(formatRelativeTime(new Date(NOW - 10_000).toISOString(), NOW)).toBe("just now");
    expect(formatRelativeTime(new Date(NOW - 44_000).toISOString(), NOW)).toBe("just now");
  });

  it("formats minutes / hours / days / weeks / months / years", () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
    expect(formatRelativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
    expect(formatRelativeTime(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2d ago");
    expect(formatRelativeTime(new Date(NOW - 14 * 86_400_000).toISOString(), NOW)).toBe("2w ago");
    expect(formatRelativeTime(new Date(NOW - 90 * 86_400_000).toISOString(), NOW)).toBe("3mo ago");
    expect(formatRelativeTime(new Date(NOW - 400 * 86_400_000).toISOString(), NOW)).toBe("1y ago");
  });

  it("clamps a future timestamp to 'just now'", () => {
    expect(formatRelativeTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe("just now");
  });

  it("returns 'recently' for an unparseable input", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("recently");
  });
});
