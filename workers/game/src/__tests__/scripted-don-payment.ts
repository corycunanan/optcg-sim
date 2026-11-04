/** Explicit player script for older authored-card tests unrelated to DON UI.
 * Payer/count come from the fixture's printed intent. Dedicated choice/safety
 * tests do not use this helper. It stops at every non-DON prompt. */
import { expect } from "vitest";
import type { CardData, GameState } from "../types.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
export function scriptedDonPayment(state: GameState, db: Map<string, CardData>, payer: 0 | 1, count: number, preferredIds?: string[]): GameState {
  const prompt = state.pendingPrompt;
  if (prompt?.options.promptType !== "PLAYER_CHOICE" || !prompt.options.donIdentityReturn) return state;
  expect(prompt.respondingPlayer).toBe(payer);
  const owner = state.effectStack.find(frame => frame.id === prompt.resumeContext);
  expect(owner?.controller).toBe(payer);
  expect(["DON_MINUS", "VARIABLE_DON_RETURN"]).toContain(owner?.costs[owner.currentCostIndex]?.type);
  const player = owner?.costTransactionState?.players[payer] ?? state.players[payer];
  // These unrelated card fixtures state a rested-first payment preference.
  // Model it as a concrete offered player answer, not a production policy.
  const donors = [...player.donCostArea.filter(d => d.state === "RESTED"), ...player.donCostArea.filter(d => d.state !== "RESTED"), ...[player.leader, ...player.characters.filter(c => c !== null)].flatMap(card => card.attachedDon)];
  const offered = new Set(prompt.options.donIdentityReturn.groups.flatMap(group => group.donIds));
  const wanted = preferredIds ?? donors.filter(don => offered.has(don.instanceId)).slice(0, count).map(don => don.instanceId);
  expect(wanted).toHaveLength(count);
  const choice = prompt.options.choices.find(choice => {
    if (choice.disabled || !choice.id.startsWith("don-return-ids:")) return false;
    const ids = JSON.parse(choice.id.slice("don-return-ids:".length)) as string[];
    return ids.length === count && wanted.every(id => ids.includes(id));
  });
  expect(choice, JSON.stringify({ payer, count, wanted, choices: prompt.options.choices })).toBeDefined();
  const action = { type: "PLAYER_CHOICE" as const, choiceId: choice!.id, promptId: prompt.promptId };
  const routed = new SessionCoordinator().executeAction(state, [], payer, action, db);
  expect(routed.kind).toBe("resume");
  const result = resumePromptLifecycle(routed.state, action, db, { drainPregame: s => s, advanceStartOfTurn: s => s });
  expect(result.responseRejected).not.toBe(true); return result.state;
}
