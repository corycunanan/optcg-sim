import { vi } from "vitest";

// Worker constructors activate the production logger, which forwards every
// event through Vitest's console RPC. Keep unit tests on a mock logger so an
// expected failure-path event cannot race worker teardown. Tests that cover
// observability import `log` and assert the mocked call directly.
vi.mock("./src/lib/log.js", () => ({
  configureLogger: vi.fn(),
  log: vi.fn(),
}));
