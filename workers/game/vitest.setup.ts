import { beforeEach, vi } from "vitest";

const testLogger = vi.hoisted(() => {
  const bufferedEvents: string[] = [];
  return {
    bufferedEvents,
    configureLogger: vi.fn(),
    log: vi.fn((event: string, data?: Record<string, unknown>) => {
      bufferedEvents.push(JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...data,
      }));
    }),
  };
});

// Worker constructors activate the production logger, which would forward
// every event through Vitest's console RPC. Buffer those events during passing
// tests; if a test fails, replay its diagnostics before Vitest finishes that
// test and tears down the worker. `log` remains a vi.fn for direct assertions.
vi.mock("./src/lib/log.js", () => ({
  configureLogger: testLogger.configureLogger,
  log: testLogger.log,
}));

beforeEach(({ onTestFailed }) => {
  testLogger.bufferedEvents.length = 0;
  onTestFailed(() => {
    for (const event of testLogger.bufferedEvents) {
      console.log(event);
    }
    testLogger.bufferedEvents.length = 0;
  });
});
