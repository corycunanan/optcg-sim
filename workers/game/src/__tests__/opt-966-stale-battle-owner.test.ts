import { expect, it } from "vitest";
import fixture from "./fixtures/opt-965-battle-debt.synthetic.json";
import type { CardData, PendingEvent } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { continueBattleDamageFrame } from "../engine/battle.js";
import { createEffectExecutionScope } from "../engine/trigger-executor.js";

it.each(["no-owner", "empty", "queued", "selected", "unpublished", "unscanned"] as const)(
  "stale damage recovery preserves live ordinary work: %s", kind => {
    const db = new Map(Object.entries(fixture.cardDb)) as Map<string, CardData>;
    let state = convertPersistedGameState(structuredClone(fixture.state), "state");
    const battle = state.effectStack.find(frame => frame.battleDamage)!;
    const trigger = battle.pendingTriggers[0];
    state = { ...state, pendingPrompt: null, effectStack: [] };
    state = createEffectExecutionScope(state, state.players[0].leader.instanceId, 0);
    const owner = state.effectStack[0];
    if (kind === "queued") owner.triggerExecution!.generations[0].triggers = [trigger];
    if (kind === "selected") owner.triggerExecution!.selectedTrigger = trigger;
    if (kind === "unpublished" || kind === "unscanned") owner.accumulatedEvents = [{
      type: "CARD_DRAWN", playerIndex: 0, payload: { cardId: "retained" },
      propagation: kind === "unpublished" ? { triggerScanned: true } : { eventLogEmitted: true },
    } as PendingEvent];
    if (kind === "no-owner") state.effectStack = [];
    const originalBattle = state.turn.battle;
    state.effectStack.push({ ...battle, battleDamage: { ...battle.battleDamage!, battleId: "stale-battle" } });
    const result = continueBattleDamageFrame(state, db);
    expect(result.state.effectStack).toEqual(kind === "no-owner" ? [] : [owner]);
    if (kind === "empty" || kind === "no-owner") {
      expect(result.state.turn.battle).toBeNull();
    } else {
      expect(result.state.turn.battle).toEqual(originalBattle);
      expect(result.events).toEqual([]);
    }
  }
);
