import type { EngineExecutionContext } from "@shared/game-types";

/** Stable context for the local animation sandbox's synthetic game state. */
export function createSandboxExecutionContext(): EngineExecutionContext {
  return {
    version: 1,
    seed: "sandbox",
    rngState: 0x6d2b79f5,
    idCounter: 0,
    clockEpochMs: 0,
    clockCounter: 0,
    actionBudget: { limit: 1_000, consumed: 0 },
    trace: { gameId: "sandbox", traceId: "trace-sandbox" },
  };
}
