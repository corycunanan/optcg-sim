import { describe, expect, it } from "vitest";
import type { GameAction } from "@shared/game-types";
import { runPipeline } from "@engine/engine/pipeline";
import { scenarios } from "..";
import { drawTwoScenario } from "../draws/draw-2";
import { selectTargetScenario } from "../prompts/select-target";
import { playCharacterScenario } from "../playground/play-character";
import { SANDBOX_CARD_DB } from "../../sandbox-card-data";
import { buildSandboxSession } from "@/components/sandbox/sandbox-session-provider";
import { hydrateToGameState } from "@/components/sandbox/sandbox-engine-session-provider";

describe("sandbox scenario manifest", () => {
  it("registers both vertical-slice scenarios", () => {
    expect(scenarios).toContain(drawTwoScenario);
    expect(scenarios).toContain(selectTargetScenario);
  });

  it("registers the first playground scenario", () => {
    expect(scenarios).toContain(playCharacterScenario);
  });

  it("uses unique scenario IDs", () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only cardIds present in SANDBOX_CARD_DB", () => {
    for (const scenario of scenarios) {
      for (const id of scenario.cardsUsed) {
        expect(SANDBOX_CARD_DB[id]).toBeDefined();
      }
    }
  });

  it("hydrates each scenario's initial state through buildSandboxSession without throwing", () => {
    for (const scenario of scenarios) {
      const session = buildSandboxSession({
        initialState: scenario.initialState,
        events: [],
        cardDb: SANDBOX_CARD_DB,
      });
      expect(session.game.me).toBeDefined();
      expect(session.game.opp).toBeDefined();
    }
  });

  it("scripted interactive scenarios declare an expectedResponse predicate", () => {
    // Playground scenarios are excluded — input flows through the engine,
    // not a per-scenario predicate.
    for (const scenario of scenarios) {
      if (scenario.mode === "playground") continue;
      if (scenario.inputMode !== "interactive") continue;
      expect(scenario.expectedResponse).toBeDefined();
      expect(typeof scenario.expectedResponse?.predicate).toBe("function");
    }
  });

  it("scripted scenarios provide a non-empty script", () => {
    for (const scenario of scenarios) {
      if (scenario.mode === "playground") continue;
      expect(scenario.script).toBeDefined();
      expect(scenario.script?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("draw-2 scenario", () => {
  it("is a 3-step spectator script: event, wait, event", () => {
    expect(drawTwoScenario.inputMode).toBe("spectator");
    const script = drawTwoScenario.script ?? [];
    expect(script).toHaveLength(3);
    expect(script[0].type).toBe("event");
    expect(script[1]).toEqual({ type: "wait", ms: 60 });
    expect(script[2].type).toBe("event");
  });

  it("emits CARD_DRAWN events whose cardIds match the deck top", () => {
    const top = drawTwoScenario.initialState.players[0].deck.slice(0, 2);
    const events = (drawTwoScenario.script ?? [])
      .filter((s): s is Extract<typeof s, { type: "event" }> => s.type === "event")
      .map((s) => s.event);
    expect(events).toHaveLength(2);
    for (const [i, ev] of events.entries()) {
      expect(ev.type).toBe("CARD_DRAWN");
      expect(ev.playerIndex).toBe(0);
      if (ev.type === "CARD_DRAWN") {
        expect(ev.payload.cardId).toBe(top[i].cardId);
      }
    }
  });
});

describe("select-target scenario", () => {
  const validIds = selectTargetScenario.initialState.players[1].characters
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => c.instanceId);

  it("is a 1-step interactive script with a SELECT_TARGET prompt", () => {
    expect(selectTargetScenario.inputMode).toBe("interactive");
    const script = selectTargetScenario.script ?? [];
    expect(script).toHaveLength(1);
    const step = script[0];
    if (step.type !== "prompt") throw new Error("expected prompt step");
    expect(step.prompt.promptType).toBe("SELECT_TARGET");
  });

  it("declares SELECT_TARGET as the only allowed action type", () => {
    expect(selectTargetScenario.expectedResponse?.allowedActionTypes).toEqual([
      "SELECT_TARGET",
    ]);
  });

  it("predicate accepts a SELECT_TARGET picking exactly one valid target", () => {
    const predicate = selectTargetScenario.expectedResponse!.predicate;
    for (const id of validIds) {
      const action: GameAction = {
        type: "SELECT_TARGET",
        selectedInstanceIds: [id],
      };
      expect(predicate(action)).toBe(true);
    }
  });

  it("predicate rejects wrong action types, wrong cardinality, and unknown IDs", () => {
    const predicate = selectTargetScenario.expectedResponse!.predicate;
    expect(predicate({ type: "PASS" })).toBe(false);
    expect(
      predicate({ type: "SELECT_TARGET", selectedInstanceIds: [] }),
    ).toBe(false);
    expect(
      predicate({
        type: "SELECT_TARGET",
        selectedInstanceIds: [validIds[0], validIds[1]],
      }),
    ).toBe(false);
    expect(
      predicate({
        type: "SELECT_TARGET",
        selectedInstanceIds: ["p0-leader"],
      }),
    ).toBe(false);
  });
});

describe("play-character playground scenario", () => {
  it("declares mode='playground' and omits script + expectedResponse", () => {
    expect(playCharacterScenario.mode).toBe("playground");
    expect(playCharacterScenario.script).toBeUndefined();
    expect(playCharacterScenario.expectedResponse).toBeUndefined();
    expect(playCharacterScenario.category).toBe("playground");
  });

  it("places the playable Character in the active player's hand", () => {
    const me = playCharacterScenario.initialState.players[0];
    expect(me.hand).toHaveLength(1);
    expect(me.hand[0].cardId).toBe("OP01-025");
    expect(me.hand[0].zone).toBe("HAND");
  });

  it("initial state passes engine validation for PLAY_CARD", () => {
    // Smoke for the playground architecture: the real engine must accept the
    // user's first action against the scenario's initial state. If this
    // fails, the user cannot complete the scenario at all — iterate on
    // initial state (DON count, phase, etc.) until validation passes.
    const state = hydrateToGameState(playCharacterScenario.initialState);
    const cardDb = new Map(Object.entries(SANDBOX_CARD_DB));
    const handCardId = state.players[0].hand[0].instanceId;
    const action: GameAction = {
      type: "PLAY_CARD",
      cardInstanceId: handCardId,
    };
    const result = runPipeline(state, action, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
