import type { CardData, GameState } from "../../types.js";
import { SessionCoordinator } from "../../session/coordinator.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
const lifecycleServices = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };
/** Drive a reply the way GameSession does: coordinator routing, then the prompt lifecycle. */
export function reply(state: GameState, cardDb: Map<string, CardData>, player: 0 | 1, action: Parameters<SessionCoordinator["executeAction"]>[3]) {
  const routed = new SessionCoordinator().executeAction(state, [], player, action, cardDb);
  if (routed.kind !== "resume") return { routed, state: routed.state, rejected: routed.kind === "reject" };
  const resumed = resumePromptLifecycle(routed.state, action, cardDb, lifecycleServices);
  return { routed, state: resumed.state, rejected: resumed.responseRejected };
}

