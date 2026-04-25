import { describe, expect, it } from "vitest";
import type { GameAction } from "@shared/game-types";
import { scenarios } from "..";
import { drawTwoScenario } from "../draws/draw-2";
import { selectTargetScenario } from "../prompts/select-target";
import { SANDBOX_CARD_DB } from "../../sandbox-card-data";
import { buildSandboxSession } from "@/components/sandbox/sandbox-session-provider";

describe("sandbox scenario manifest", () => {
  it("registers both vertical-slice scenarios", () => {
    expect(scenarios).toContain(drawTwoScenario);
    expect(scenarios).toContain(selectTargetScenario);
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
});

describe("draw-2 scenario", () => {
  it("is a 3-step spectator script: event, wait, event", () => {
    expect(drawTwoScenario.inputMode).toBe("spectator");
    expect(drawTwoScenario.script).toHaveLength(3);
    expect(drawTwoScenario.script[0].type).toBe("event");
    expect(drawTwoScenario.script[1]).toEqual({ type: "wait", ms: 60 });
    expect(drawTwoScenario.script[2].type).toBe("event");
  });

  it("emits CARD_DRAWN events whose cardIds match the deck top", () => {
    const top = drawTwoScenario.initialState.players[0].deck.slice(0, 2);
    const events = drawTwoScenario.script
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
    expect(selectTargetScenario.script).toHaveLength(1);
    const step = selectTargetScenario.script[0];
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
