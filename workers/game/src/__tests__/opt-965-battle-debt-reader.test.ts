/** Reader-first amendment: a PR7 writer-produced paused substitute must not
 * lose already matched watchers on rollback. All fixtures here are synthetic. */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/opt-965-battle-debt.synthetic.json";
import type { CardData, GameAction, GameState } from "../types.js";
import { convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { continueBattleDamageFrame } from "../engine/battle.js";

const cardDb = new Map(Object.entries(fixture.cardDb)) as Map<string, CardData>;
const services = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };

for (const location of ["state", "undoHistory[0]"]) {
  describe(`OPT-965 battle debt reader: ${location}`, () => {
    it("loads actual future-writer state deterministically and releases the retained On K.O. watcher once", () => {
      expect(fixture.provenance).toBe("synthetic");
      const raw = structuredClone(fixture.state);
      const session = parseStoredSession({ state: raw, cardDb: fixture.cardDb, undoHistory: [raw] });
      const state = location === "state" ? session.state : session.undoHistory[0];
      expect(state).toEqual(convertPersistedGameState(structuredClone(raw), location));
      const owner = state.effectStack.find(frame => frame.battleDamage)!;
      expect(owner.pendingTriggers).toHaveLength(1);
      expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      const result = resumePromptLifecycle(state, fixture.reply as GameAction, cardDb, services);
      expect(result.responseRejected).toBe(false);
      expect(result.state.players).toEqual(fixture.expected.players);
      expect(result.state.eventLog.filter(event => event.type === "CARD_DRAWN")).toHaveLength(1);
      expect(result.state.eventLog.filter(event => event.type === "END_OF_BATTLE")).toHaveLength(1);
      expect(result.state.pendingPrompt).toBeNull();
      expect(result.state.effectStack).toEqual([]);
      expect(result.state.turn.battle).toBeNull();
      expect(raw).toEqual(fixture.state);
      const repeated = resumePromptLifecycle(result.state, fixture.reply as GameAction, cardDb, services);
      expect(repeated.responseRejected).toBe(true);
      expect(repeated.state).toEqual(result.state);
    });

    it("preserves retained publication debt when the battle owner completes", () => {
      // Constructed boundary variant: an already scanned, unpublished event
      // belongs to the battle frame. The actual-writer fixture above proves
      // the new queued-watcher combination; this isolates event consumption.
      const loaded = convertPersistedGameState(structuredClone(fixture.state), location);
      const owner = loaded.effectStack.find(frame => frame.battleDamage)!;
      const retained = { type: "CARD_TRASHED" as const, playerIndex: 0 as const,
        payload: { cardId: "CHAR-VANILLA", cardInstanceId: "retained-card", from: "HAND" },
        propagation: { triggerScanned: true } };
      const state: GameState = { ...loaded, pendingPrompt: null, effectStack: [{ ...owner, accumulatedEvents: [retained] }] };
      const result = continueBattleDamageFrame(state, cardDb);
      expect(result.events).toContainEqual(retained);
      expect(result.queuedTriggers).toEqual(owner.pendingTriggers);
      expect(result.state.effectStack).toEqual([]);
      expect(continueBattleDamageFrame(result.state, cardDb).events).toEqual([]);
    });
  });
}
