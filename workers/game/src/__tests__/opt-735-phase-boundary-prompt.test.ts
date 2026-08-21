import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { EB02_015_JEWELRY_BONNEY } from "../engine/schemas/eb02.js";
import { OP13_024_GORDON } from "../engine/schemas/op13.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function scheduledDonAction(
  schema: typeof OP13_024_GORDON,
  effectId: string
): Action {
  const block = schema.effects.find((effect) => effect.id === effectId);
  const scheduled = block?.actions?.find(
    (action) => action.type === "SCHEDULE_ACTION"
  );
  if (scheduled?.type !== "SCHEDULE_ACTION" || !scheduled.params?.action) {
    throw new Error(`Expected ${schema.card_id}'s scheduled DON!! action`);
  }
  return scheduled.params.action;
}

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown
  ): Promise<void> {
    const entries =
      typeof keyOrEntries === "string"
        ? { [keyOrEntries]: value }
        : keyOrEntries;
    for (const [key, entry] of Object.entries(entries)) {
      this.data.set(key, structuredClone(entry));
    }
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

function scheduledEndPhaseState(
  scheduledCount = 1,
  action = scheduledDonAction(OP13_024_GORDON, "OP13-024_on_play")
): GameState {
  const cardDb = createTestCardDb();
  const base = createBattleReadyState(cardDb);
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    donCostArea: players[0].donCostArea.map((don) => ({
      ...don,
      state: "RESTED" as const,
    })),
  };
  return {
    ...base,
    players,
    scheduledActions: Array.from({ length: scheduledCount }, (_, index) => ({
      id: `opt-735-scheduled-${index}`,
      timing: "END_OF_THIS_TURN",
      action,
      boundToInstanceId: null,
      sourceEffectId: base.players[0].leader.instanceId,
      controller: 0,
    })),
  };
}

describe("OPT-735 phase-boundary prompts", () => {
  function offerScheduledChoice(scheduledCount = 1) {
    const cardDb = createTestCardDb();
    const state = scheduledEndPhaseState(scheduledCount);
    const offered = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, 0);
    return { cardDb, state, offered };
  }

  it("replaces EB02-015's auto-max baseline with a 0..1 pipeline prompt", () => {
    const cardDb = createTestCardDb();
    const state = scheduledEndPhaseState(
      1,
      scheduledDonAction(
        EB02_015_JEWELRY_BONNEY,
        "on_play_prohibit_refresh_schedule_don"
      )
    );
    const offered = runPipeline(
      state,
      { type: "ADVANCE_PHASE" },
      cardDb,
      0
    );

    expect(offered.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (offered.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected EB02-015's scheduled amount prompt");
    }
    expect(
      offered.pendingPrompt.options.choices.map((choice) => choice.id)
    ).toEqual(["choose-value:0", "choose-value:1"]);
    expect(offered.state.players[0].donCostArea).toEqual(
      state.players[0].donCostArea
    );
    expect(offered.state.turn).toMatchObject({
      activePlayerIndex: 0,
      phase: "END",
    });
  });

  it("offers 0..2 for a scheduled up-to DON!! action before turn handoff", () => {
    const { state, offered } = offerScheduledChoice();

    expect(offered.valid).toBe(true);
    expect(offered.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (offered.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected a scheduled amount prompt");
    }
    expect(
      offered.pendingPrompt.options.choices.map((choice) => choice.id)
    ).toEqual(["choose-value:0", "choose-value:1", "choose-value:2"]);
    expect(offered.state.players[0].donCostArea).toEqual(
      state.players[0].donCostArea
    );
    expect(offered.state.turn).toMatchObject({
      activePlayerIndex: 0,
      phase: "END",
    });
  });

  for (const amount of [1, 0]) {
    it(`activates ${amount} DON!! after the scheduled choice, then hands off`, () => {
      const { cardDb, offered } = offerScheduledChoice();
      const resumed = resumePromptLifecycle(
        offered.state,
        { type: "PLAYER_CHOICE", choiceId: `choose-value:${amount}` },
        cardDb,
        {
          drainPregame: (state) => state,
          advanceStartOfTurn: (state) => state,
        }
      );

      expect(resumed.responseRejected).toBe(false);
      expect(resumed.state.pendingPrompt).toBeNull();
      expect(resumed.state.effectStack).toEqual([]);
      expect(
        resumed.state.players[0].donCostArea.filter(
          (don) => don.state === "ACTIVE"
        )
      ).toHaveLength(amount);
      expect(resumed.state.turn).toMatchObject({
        activePlayerIndex: 1,
        phase: "REFRESH",
      });
    });
  }

  it("round-trips remaining end-phase work while the scheduled prompt is pending", async () => {
    const { cardDb, offered } = offerScheduledChoice(2);
    const storage = new MemoryStorage();
    const repository = new SessionRepository(storage, {
      nextJsUrl: "https://app.example.test",
      workerSecret: "secret",
    });

    await repository.save({
      state: offered.state,
      cardDb,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const restored = await repository.load();

    expect(restored?.state.pendingPrompt?.options.promptType).toBe(
      "PLAYER_CHOICE"
    );
    expect(
      restored?.state.effectStack[0]?.phaseBoundaryContinuation
    ).toMatchObject({
      kind: "END_PHASE",
      endingPlayerIndex: 0,
      remainingScheduledActions: [{ controller: 0 }],
    });

    const firstChoice = resumePromptLifecycle(
      restored!.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:1" },
      restored!.cardDb,
      {
        drainPregame: (state) => state,
        advanceStartOfTurn: (state) => state,
      }
    );
    expect(firstChoice.state.pendingPrompt?.options.promptType).toBe(
      "PLAYER_CHOICE"
    );
    expect(firstChoice.state.turn.activePlayerIndex).toBe(0);

    const secondChoice = resumePromptLifecycle(
      firstChoice.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:0" },
      restored!.cardDb,
      {
        drainPregame: (state) => state,
        advanceStartOfTurn: (state) => state,
      }
    );
    expect(secondChoice.state.effectStack).toEqual([]);
    expect(secondChoice.state.turn).toMatchObject({
      activePlayerIndex: 1,
      phase: "REFRESH",
    });
  });
});
