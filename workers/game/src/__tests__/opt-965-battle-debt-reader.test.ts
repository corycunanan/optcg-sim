/** Reader-first amendment: a PR7 writer-produced paused substitute must not
 * lose already matched watchers on rollback. All fixtures here are synthetic. */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/opt-965-battle-debt.synthetic.json";
import type { CardData, GameAction, GameState } from "../types.js";
import { convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { processRemainingTriggers } from "../engine/effect-resolver/resume.js";
import { continueBattleDamageFrame } from "../engine/battle.js";

const cardDb = new Map(Object.entries(fixture.cardDb)) as Map<string, CardData>;
const services = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };

for (const location of ["state", "undoHistory[0]"]) {
  describe(`OPT-965 battle debt reader: ${location}`, () => {
    it("loads actual future-writer state deterministically and releases the retained surviving K.O. watcher once", () => {
      expect(fixture.provenance).toBe("synthetic");
      const raw = structuredClone(fixture.state);
      const session = parseStoredSession({ state: raw, cardDb: fixture.cardDb, undoHistory: [raw] });
      const state = location === "state" ? session.state : session.undoHistory[0];
      expect(state).toEqual(convertPersistedGameState(structuredClone(raw), location));
      const owner = state.effectStack.find(frame => frame.battleDamage)!;
      expect(owner.pendingTriggers).toHaveLength(1);
      expect(owner.pendingTriggers[0].sourceCardInstanceId).toContain("SURVIVING-WATCHER");
      const koEvents = state.effectStack.flatMap(frame => frame.accumulatedEvents).filter(event => event.type === "CARD_KO");
      expect(koEvents).toHaveLength(1);
      expect(koEvents[0].propagation?.triggerScanned).toBe(true);
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

    it("keeps battle publication debt through a prompted child trigger boundary", () => {
      // Constructed consumer boundary, not a captured session: a committed
      // battle prefix must not publish while a child trigger still asks input.
      const loaded = convertPersistedGameState(structuredClone(fixture.state), location);
      const owner = loaded.effectStack.find(frame => frame.battleDamage)!;
      const retained = { type: "CARD_TRASHED" as const, playerIndex: 0 as const,
        payload: { cardId: "CHAR-VANILLA", cardInstanceId: "retained-boundary", from: "HAND", reason: "effect" },
        propagation: { triggerScanned: true as const } };
      const childOwner = { ...loaded.effectStack.at(-1)!, phase: "INTERRUPTED_BY_TRIGGERS" as const,
        pausedAction: null, remainingActions: [], accumulatedEvents: [] };
      const state: GameState = { ...loaded, pendingPrompt: null,
        effectStack: [{ ...owner, accumulatedEvents: [retained] }, childOwner] };
      const child = { ...owner.pendingTriggers[0], effectBlock: {
        ...owner.pendingTriggers[0].effectBlock,
        actions: [{ type: "TRASH_FROM_HAND" as const, params: { amount: 1 } }],
      } };
      const paused = processRemainingTriggers(state, [child], cardDb);
      expect(paused.pendingPrompt).toBeDefined();
      expect(paused.state.effectStack.find(frame => frame.id === owner.id)?.accumulatedEvents).toEqual([retained]);
      expect(paused.state.eventLog.some(event => event.type === "CARD_TRASHED" && event.payload.cardInstanceId === "retained-boundary")).toBe(false);
      const completed = resumePromptLifecycle({ ...paused.state, pendingPrompt: paused.pendingPrompt! }, fixture.reply as GameAction, cardDb, services);
      expect(completed.responseRejected).toBe(false);
      expect(completed.state.eventLog.filter(event => event.type === "CARD_TRASHED" && event.payload.cardInstanceId === "retained-boundary")).toHaveLength(1);
      expect(completed.state.eventLog.filter(event => event.type === "CARD_DRAWN")).toHaveLength(1);
      expect(completed.state.pendingPrompt).toBeNull();
      expect(completed.state.effectStack).toEqual([]);
      expect(completed.state.turn.battle).toBeNull();
    });

    it("preserves retained publication debt when the battle owner completes", () => {
      // Constructed boundary variant: an already scanned, unpublished event
      // belongs to the battle frame. The actual-writer fixture above proves
      // the new queued-watcher combination; this isolates event consumption.
      const loaded = convertPersistedGameState(structuredClone(fixture.state), location);
      const owner = loaded.effectStack.find(frame => frame.battleDamage)!;
      const retained = { type: "CARD_TRASHED" as const, playerIndex: 0 as const,
        payload: { cardId: "CHAR-VANILLA", cardInstanceId: "retained-card", from: "HAND", reason: "effect" },
        propagation: { triggerScanned: true as const } };
      const state: GameState = { ...loaded, pendingPrompt: null, effectStack: [{ ...owner, accumulatedEvents: [retained] }] };
      const result = continueBattleDamageFrame(state, cardDb);
      expect(result.events).toContainEqual(retained);
      expect(result.queuedTriggers).toEqual(owner.pendingTriggers);
      expect(result.state.effectStack).toEqual([]);
      expect(continueBattleDamageFrame(result.state, cardDb).events).toEqual([]);
    });
  });
}
