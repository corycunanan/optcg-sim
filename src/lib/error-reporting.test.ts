import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportError,
  resetErrorReporter,
  setErrorReporter,
  type ErrorReport,
} from "./error-reporting";

afterEach(() => {
  resetErrorReporter();
  vi.restoreAllMocks();
});

describe("reportError", () => {
  it("writes a scrubbed [ERROR_REPORT] line by default", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    reportError(new Error("failed for nami@example.com"), {
      source: "app.server",
      tags: { path: "/decks" },
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [prefix, report] = consoleError.mock.calls[0] as [
      string,
      ErrorReport,
    ];
    expect(prefix).toBe("[ERROR_REPORT]");
    expect(report.message).toBe("failed for [redacted]");
    expect(report.tags).toEqual({ path: "/decks" });
  });

  it("routes reports to an installed reporter", () => {
    const reports: ErrorReport[] = [];
    setErrorReporter((report) => reports.push(report));
    reportError(new Error("boom"), { source: "app.client" });
    expect(reports.map((report) => report.message)).toEqual(["boom"]);
  });

  it("never throws when the reporter fails", () => {
    setErrorReporter(() => {
      throw new Error("provider down");
    });
    expect(() =>
      reportError(new Error("boom"), { source: "app.client" })
    ).not.toThrow();
  });
});
