/**
 * OPT-962 review finding E: parking the End Phase can hit the stack-depth
 * limit (MAX_EFFECT_STACK_DEPTH, engine-limits.ts) and end the game with
 * ENGINE_LIMIT. A finished game must not come back with a prompt.
 *
 * Constructed (synthetic) state: 99 filler frames below a parked End Phase
 * frame whose accumulated events fire OP03-015 Lim's On K.O. (a SELECT_TARGET
 * prompt for p1). This is the `events.length > 0` entry branch of
 * `continueEndPhase`, the one path that returned `parkStage` directly.
 * Resuming pushes Lim's prompt frame (stack 100); parking needs one more slot.
 */

import { describe, expect, it } from "vitest";
import type { EffectStackFrame, GameState } from "../types.js";
import { MAX_EFFECT_STACK_DEPTH } from "../engine/engine-limits.js";
import { resumePhaseBoundary } from "../engine/phases.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { v2State } from "./fixtures/opt-962-v2-fixture.js";
import { CARDS, createTestCardDb } from "./helpers.js";
import { getEffectSchema } from "../engine/schema-registry.js";

describe("OPT-962 parking at the stack-depth limit", () => {
  it("returns no prompt once parking ended the game with ENGINE_LIMIT", () => {
    const base = convertPersistedGameState(v2State("step1-scheduled-prompt"), "state");
    const phaseFrame = base.effectStack.find((f) => f.phaseBoundaryContinuation)!;
    const lim = base.players[1].characters.find((c) => c?.cardId === "OP03-015")!;
    const filler = (i: number): EffectStackFrame => ({ ...phaseFrame, id: `filler-${i}`, phaseBoundaryContinuation: undefined });
    const parked: EffectStackFrame = {
      ...phaseFrame,
      phaseBoundaryContinuation: {
        ...phaseFrame.phaseBoundaryContinuation!,
        remainingScheduledActions: [{
          action: { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } },
          controller: 0,
          sourceEffectId: "limit-ko",
          step: "TURN_PLAYER",
        }],
      },
      accumulatedEvents: [{
        type: "CARD_KO",
        playerIndex: 1,
        payload: { cardInstanceId: lim.instanceId, cardId: "OP03-015", cause: "OPPONENT_EFFECT", preKO_donCount: 0 },
      }],
    };
    const fillers = Array.from({ length: MAX_EFFECT_STACK_DEPTH - 1 }, (_, i) => filler(i));
    const state: GameState = { ...base, pendingPrompt: null, effectStack: [...fillers, parked] };
    const cardDb = createTestCardDb();
    cardDb.set("OP03-015", { ...CARDS.VANILLA, id: "OP03-015", name: "Lim", cost: 3, effectSchema: getEffectSchema("OP03-015")! });
    for (const card of [...state.players[0].characters, ...state.players[1].characters]) {
      if (card && !cardDb.has(card.cardId)) cardDb.set(card.cardId, { ...CARDS.VANILLA, id: card.cardId, name: card.cardId });
    }

    const result = resumePhaseBoundary(state, cardDb);

    expect(result.state.status).toBe("FINISHED");
    expect((result.state.engineOutcome as { type?: string } | undefined)?.type).toBe("ENGINE_LIMIT");
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.pendingPrompt).toBeNull();
  });
});
