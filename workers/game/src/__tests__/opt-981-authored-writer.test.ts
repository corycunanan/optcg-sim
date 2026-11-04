import { describe, expect, it } from "vitest";
import { authoredPair, command, fieldDon, saved } from "./fixtures/opt-981-writer.js";

describe("OPT-981 actual authored writer pipeline", () => {
  it.each([0, 1] as const)("produces ordering11 from authored scheduling10 for seat%i", async owner => {
    for (const first of [0, 1]) {
      const { r, history } = await authoredPair(owner);
      expect(r.state.schemaVersion).toBe(10);
      expect(r.state.scheduledActions).toHaveLength(2);
      expect(fieldDon(r.state, owner)).toBe(10);
      const origin = r.state.scheduledActions.map(entry => ({ sourceIdentity: entry.sourceIdentity, sourceCardSnapshot: entry.sourceCardSnapshot }));
      let result = command(r.state, r.db, history, owner, { type: "ADVANCE_PHASE" });
      expect(result.state.schemaVersion).toBe(11);
      expect(result.state.effectStack.at(-1)?.phaseBoundaryContinuation?.remainingScheduledActions.map(entry => ({ sourceIdentity: entry.sourceIdentity, sourceCardSnapshot: entry.sourceCardSnapshot }))).toEqual(origin);
      let loaded = await saved(result.state, r.db, result.history);
      result = command(loaded.state, r.db, loaded.history, owner, { type: "PLAYER_CHOICE", choiceId: `end-of-turn-obligation:${first}` });
      for (let n = 0; result.state.pendingPrompt && n < 8; n++) {
        loaded = await saved(result.state, r.db, result.history);
        const options = loaded.state.pendingPrompt!.options;
        if (options.promptType !== "PLAYER_CHOICE") throw Error("unexpected prompt");
        const choice = options.choices.find(c => c.id === "choose-value:1") ?? options.choices.find(c => !c.disabled)!;
        result = command(loaded.state, r.db, loaded.history, owner, { type: "PLAYER_CHOICE", choiceId: choice.id });
      }
      expect(fieldDon(result.state, owner)).toBe(first === 0 ? 6 : 5);
      expect(result.state.turn.activePlayerIndex).toBe(owner === 0 ? 1 : 0);
    }
  });
});
