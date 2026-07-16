import { afterEach, describe, expect, it, vi } from "vitest";

vi.unmock("../lib/log.js");

import { configureLogger, log } from "../lib/log.js";

const FIXED_TIME = "2026-07-16T01:02:03.000Z";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("structured worker logger contract", () => {
  it("configures stdout logging with a structured event and timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIME));
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    configureLogger(undefined);

    log("logger.contract", { gameId: "game-1", outcome: "ok" });

    expect(consoleLog).toHaveBeenCalledOnce();
    expect(JSON.parse(String(consoleLog.mock.calls[0]![0]))).toEqual({
      event: "logger.contract",
      timestamp: FIXED_TIME,
      gameId: "game-1",
      outcome: "ok",
    });
  });

  it("posts the same structured body when a remote URL is configured", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIME));
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    configureLogger("https://logs.example.test/events");

    log("logger.remote", { gameId: "game-2" });

    const body = String(consoleLog.mock.calls[0]![0]);
    expect(JSON.parse(body)).toEqual({
      event: "logger.remote",
      timestamp: FIXED_TIME,
      gameId: "game-2",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://logs.example.test/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  });

  it("swallows a rejected remote write", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    configureLogger("https://logs.example.test/events");

    expect(log("logger.rejected", { gameId: "game-3" })).toBeUndefined();
    await Promise.resolve();

    expect(consoleLog).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
