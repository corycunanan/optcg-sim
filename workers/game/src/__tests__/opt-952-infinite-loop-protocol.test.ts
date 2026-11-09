/**
 * OPT-952: infinite-loop protocol (rules 11-1-1-1 to 11-1-1-3).
 *
 * - A loop with no stoppable prompt that repeats a game state ends in the
 *   rule 11-1-1-1 draw (INFINITE_LOOP_DRAW), not the engine-limit outcome.
 * - A long chain that never repeats a state stays ENGINE_LIMIT (Decision 5).
 * - A reply to a prompt the player could decline starts a new budget, so a
 *   loop that player can stop never ends the game (11-1-1-2).
 * - A long legal chain under budget is untouched.
 */

import { describe, expect, it } from "vitest";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import type { EffectStackFrame, GameState, PendingPromptState } from "../types.js";
import { consumeResolutionAction, MAX_RESOLUTION_ACTIONS } from "../engine/engine-limits.js";
import { popFrame, pushFrame } from "../engine/effect-stack.js";
import { INFINITE_LOOP_REASON } from "../engine/terminal.js";
import { executeActionChain, resolveEffect } from "../engine/effect-resolver/resolver.js";
import {
  admitPromptReplyBudget,
  loopFingerprint,
  loopProbeThreshold,
  promptOffersStop,
} from "../engine/loop-protocol.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { advanceToPhase, setupGame } from "./factories.js";

const loopBlock: EffectBlock = { id: "opt-952-loop", category: "auto", actions: [] };

function mainPhase() {
  const setup = setupGame();
  return { state: advanceToPhase(setup.state, "MAIN", setup.cardDb), cardDb: setup.cardDb };
}

function frame(state: GameState, id: string, block: EffectBlock = loopBlock): EffectStackFrame {
  return {
    id,
    sourceCardInstanceId: state.players[0].leader.instanceId,
    controller: 0,
    effectBlock: block,
    phase: "EXECUTING",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
  } as EffectStackFrame;
}

/** Each loop action activates the same effect, does `actionsPerLoop` actions, and finishes. */
function runLoop(
  start: GameState,
  actionsPerLoop: number,
  mutate: (state: GameState, iteration: number) => GameState = (state) => state,
): GameState {
  let state = start;
  for (let iteration = 0; state.status === "IN_PROGRESS" && iteration < 10 * MAX_RESOLUTION_ACTIONS; iteration++) {
    state = pushFrame(state, frame(state, `loop-${iteration}`));
    for (let step = 0; step < actionsPerLoop && state.status === "IN_PROGRESS"; step++) {
      state = consumeResolutionAction(state, "DRAW", state.players[0].leader.instanceId);
    }
    if (state.status !== "IN_PROGRESS") break;
    state = mutate(popFrame(state), iteration);
  }
  return state;
}

describe("OPT-952 infinite-loop protocol", () => {
  it("rule 11-1-1-1: a loop neither player can stop, repeating the same state, is an infinite-loop draw", () => {
    const { state } = mainPhase();
    const ended = runLoop(state, 3);

    expect(ended.status).toBe("FINISHED");
    expect(ended.winner).toBeNull();
    expect(ended.winReason).toBe(INFINITE_LOOP_REASON);
    expect(ended.endReasonCode).toBe("INFINITE_LOOP_DRAW");
    expect(ended.engineOutcome).toMatchObject({
      type: "INFINITE_LOOP_DRAW",
      diagnostic: { kind: "INFINITE_LOOP", limit: MAX_RESOLUTION_ACTIONS, observed: MAX_RESOLUTION_ACTIONS + 1 },
    });
    expect(ended.eventLog.at(-1)).toMatchObject({
      type: "GAME_OVER",
      payload: { winner: null, diagnostic: { kind: "INFINITE_LOOP" } },
    });
  });

  it("detects a loop whose repeating part starts late in the resolution", () => {
    const { state } = mainPhase();
    const deck = state.players[0].deck;
    // The first 300 loop actions each move a different card; then the state repeats.
    const ended = runLoop(state, 1, (current, iteration) => iteration < 300 && deck.length > 1
      ? {
          ...current,
          players: [
            { ...current.players[0], deck: [...current.players[0].deck.slice(1), current.players[0].deck[0]] },
            current.players[1],
          ],
        }
      : current);
    expect(ended.endReasonCode).toBe("INFINITE_LOOP_DRAW");
  });

  it("Decision 5: a budget overflow that never repeats a state stays an engine limit", () => {
    const { state } = mainPhase();
    let counter = 0;
    // Every loop action changes the trash, so no two samples match.
    const ended = runLoop(state, 2, (current) => ({
      ...current,
      players: [
        {
          ...current.players[0],
          trash: [{ ...current.players[0].leader, instanceId: `trash-${counter}`, cardId: `CARD-${counter++}`, zone: "TRASH" }, ...current.players[0].trash],
        },
        current.players[1],
      ],
    }));
    expect(ended.status).toBe("FINISHED");
    expect(ended.endReasonCode).toBe("ENGINE_LIMIT");
    expect(ended.engineOutcome).toMatchObject({ type: "ENGINE_LIMIT", diagnostic: { kind: "ACTION_BUDGET" } });
  });

  it("a straight action chain past the budget pushes no frames and stays an engine limit", () => {
    const { state, cardDb } = mainPhase();
    const actions = Array.from({ length: MAX_RESOLUTION_ACTIONS + 1 }, () => ({ type: "DRAW", params: { amount: 0 } }) as Action);
    const result = executeActionChain(state, actions, state.players[0].leader.instanceId, 0, cardDb);
    expect(result.state.endReasonCode).toBe("ENGINE_LIMIT");
  });

  it("a repeating loop that finishes under budget is untouched", () => {
    const { state } = mainPhase();
    let current = state;
    for (let iteration = 0; iteration < 100; iteration++) {
      current = pushFrame(current, frame(current, `short-${iteration}`));
      for (let step = 0; step < 5; step++) {
        current = consumeResolutionAction(current, "DRAW", current.players[0].leader.instanceId);
      }
      current = popFrame(current);
    }
    expect(current.status).toBe("IN_PROGRESS");
    expect(current.executionContext.actionBudget.consumed).toBe(500);
  });

  it("rule 11-1-1-2: accepting an optional effect starts a new budget, so the player's loop continues", () => {
    const { state, cardDb } = mainPhase();
    const optional: EffectBlock = {
      id: "opt-952-optional",
      category: "auto",
      flags: { optional: true },
      actions: [{ type: "DRAW", params: { amount: 1 } } as Action],
    };
    const exhausted: GameState = {
      ...state,
      engineActionCount: MAX_RESOLUTION_ACTIONS,
      executionContext: {
        ...state.executionContext,
        actionBudget: { ...state.executionContext.actionBudget, consumed: MAX_RESOLUTION_ACTIONS },
      },
    };
    const prompted = resolveEffect(exhausted, optional, state.players[0].leader.instanceId, 0, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const handBefore = prompted.state.players[0].hand.length;

    const resumed = resumePromptLifecycle(
      { ...prompted.state, pendingPrompt: prompted.pendingPrompt! },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
    );

    expect(resumed.responseRejected).toBe(false);
    expect(resumed.gameOver).toBeUndefined();
    expect(resumed.state.status).toBe("IN_PROGRESS");
    expect(resumed.state.players[0].hand).toHaveLength(handBefore + 1);
    expect(resumed.state.executionContext.actionBudget.consumed).toBeLessThan(10);
  });

  it("a rejected reply leaves the state, budget included, unchanged", () => {
    const { state, cardDb } = mainPhase();
    const withPrompt: GameState = {
      ...state,
      engineActionCount: 700,
      executionContext: {
        ...state.executionContext,
        actionBudget: { ...state.executionContext.actionBudget, consumed: 700 },
      },
      pendingPrompt: {
        options: { promptType: "OPTIONAL_EFFECT", effectDescription: "stale" },
        respondingPlayer: 0,
        resumeContext: "missing-frame",
      },
    };
    const result = resumePromptLifecycle(withPrompt, { type: "PASS" }, cardDb, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected).toBe(true);
    expect(result.state).toBe(withPrompt);
  });

  it("only prompts the responder can decline offer a stop", () => {
    const base = { respondingPlayer: 0 as const, resumeContext: "f" };
    const prompt = (options: PendingPromptState["options"]): PendingPromptState => ({ ...base, options });
    expect(promptOffersStop(prompt({ promptType: "OPTIONAL_EFFECT", effectDescription: "" }))).toBe(true);
    expect(promptOffersStop(prompt({ promptType: "SELECT_TARGET", cards: [], validTargets: [], effectDescription: "", countMin: 0, countMax: 1, ctaLabel: "" }))).toBe(true);
    expect(promptOffersStop(prompt({ promptType: "SELECT_TARGET", cards: [], validTargets: [], effectDescription: "", countMin: 1, countMax: 1, ctaLabel: "" }))).toBe(false);
    expect(promptOffersStop(prompt({ promptType: "REVEAL_TRIGGER", cards: [], effectDescription: "", optional: true, timeoutMs: 0 }))).toBe(true);
    expect(promptOffersStop(prompt({ promptType: "PLAYER_CHOICE", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }], effectDescription: "" }))).toBe(false);
    expect(promptOffersStop(prompt({ promptType: "PLAYER_CHOICE", choices: [{ id: "a", label: "A" }, { id: "skip", label: "Skip" }], effectDescription: "" }))).toBe(true);
    expect(promptOffersStop(prompt({ promptType: "ARRANGE_TOP_CARDS", cards: [], effectDescription: "", canSendToBottom: true }))).toBe(false);
  });

  it("a mandatory reply keeps the count but replaces the budget object, so no probe crosses a suspension", () => {
    const { state } = mainPhase();
    const mandatory: PendingPromptState = {
      respondingPlayer: 0,
      resumeContext: "f",
      options: { promptType: "SELECT_TARGET", cards: [], validTargets: [], effectDescription: "", countMin: 1, countMax: 1, ctaLabel: "" },
    };
    const busy: GameState = {
      ...state,
      executionContext: {
        ...state.executionContext,
        actionBudget: { ...state.executionContext.actionBudget, consumed: 900 },
      },
    };
    const admitted = admitPromptReplyBudget(busy, mandatory);
    expect(admitted.executionContext.actionBudget).toEqual(busy.executionContext.actionBudget);
    expect(admitted.executionContext.actionBudget).not.toBe(busy.executionContext.actionBudget);
  });

  it("a probe begins at half the budget and ignores instance ids", () => {
    expect(loopProbeThreshold(MAX_RESOLUTION_ACTIONS)).toBe(500);
    const { state } = mainPhase();
    const f = frame(state, "a");
    const renamed: GameState = {
      ...state,
      players: [
        { ...state.players[0], hand: state.players[0].hand.map((card, i) => ({ ...card, instanceId: `renamed-${i}` })) },
        state.players[1],
      ],
    };
    expect(loopFingerprint(renamed, frame(renamed, "b"))).toBe(loopFingerprint(state, f));
  });
});
