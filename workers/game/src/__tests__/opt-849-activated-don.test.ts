import { describe, expect, it } from "vitest";
import { computeEffectAvailability } from "../engine/availability.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { execute } from "../engine/execute.js";
import { injectSchemasIntoCardDb } from "../engine/schema-registry.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

// Printed OP08-008: [DON!! x1] [Activate: Main] [Once Per Turn]
// You may add the top card of your Life cards to your hand: gain Rush this turn.
function fixture(attached: number) {
  const db = createTestCardDb();
  db.set("OP08-008", { ...CARDS.VANILLA, id: "OP08-008", name: "Dalton" });
  injectSchemasIntoCardDb(db);
  const state = createBattleReadyState(db);
  const source = state.players[0].characters[0]!;
  source.cardId = "OP08-008";
  source.attachedDon = Array.from({ length: attached }, (_, i) => ({
    instanceId: `source-don-${i}`,
    state: "RESTED" as const,
    attachedTo: source.instanceId,
  }));
  return {
    db,
    state,
    source,
    action: {
      type: "ACTIVATE_EFFECT" as const,
      cardInstanceId: source.instanceId,
      effectId: "activate_rush",
    },
  };
}

describe("OPT-849 authored activated DON eligibility", () => {
  it("rejects below requirement before Life payment or once-per-turn usage, despite field/other-card DON", () => {
    const { db, state, source, action } = fixture(0);
    state.players[0].leader.attachedDon = [
      {
        instanceId: "other-don",
        state: "ACTIVE",
        attachedTo: state.players[0].leader.instanceId,
      },
    ];
    expect(
      computeEffectAvailability(state, db)[source.instanceId]
    ).toContainEqual({
      effectId: "activate_rush",
      status: "blocked",
      reason: "CONDITION",
    });
    const before = structuredClone(state);
    const result = runPipeline(state, action, db, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Attached DON!! requirement is not met");
    expect(result.state.players).toEqual(before.players);
    expect(result.state.turn.oncePerTurnUsed).toEqual(
      before.turn.oncePerTurnUsed
    );
    expect(result.state.pendingPrompt).toBeFalsy();
    expect(source.attachedDon).toHaveLength(0);
  });

  it.each([1, 2])(
    "pays the Life cost and grants Rush with %i attached DON",
    (count) => {
      const { db, state, source, action } = fixture(count);
      expect(
        computeEffectAvailability(state, db)[source.instanceId]
      ).toContainEqual({ effectId: "activate_rush", status: "usable" });
      const life = state.players[0].life.length;
      const hand = state.players[0].hand.length;
      const result = runPipeline(state, action, db, 0);
      expect(result.valid).toBe(true);
      expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      const resumed = resumeFromStack(
        JSON.parse(JSON.stringify(result.state)),
        { type: "PLAYER_CHOICE", choiceId: "activate" },
        db
      );
      expect(resumed.pendingPrompt).toBeUndefined();
      expect(resumed.state.players[0].life).toHaveLength(life - 1);
      expect(resumed.state.players[0].hand).toHaveLength(hand + 1);
      expect(resumed.state.turn.oncePerTurnUsed.activate_rush).toEqual([
        source.instanceId,
      ]);
      expect(resumed.state.activeEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceCardInstanceId: source.instanceId,
            appliesTo: [source.instanceId],
            modifiers: [
              expect.objectContaining({
                type: "GRANT_KEYWORD",
                params: { keyword: "RUSH" },
              }),
            ],
          }),
        ])
      );
    }
  );

  it.each([
    ["ST13-002", "activate_search_to_life", 2],
    ["OP12-020", "OP12-020_activate", 3],
  ] as const)(
    "enforces the printed threshold for %s on its actual Leader",
    (id, effectId, threshold) => {
      for (const count of [threshold - 1, threshold, threshold + 1]) {
        const { db, state } = fixture(0);
        db.set(id, { ...CARDS.LEADER, id });
        injectSchemasIntoCardDb(db);
        const leader = state.players[0].leader;
        leader.cardId = id;
        leader.attachedDon = Array.from({ length: count }, (_, i) => ({
          instanceId: `leader-don-${i}`,
          state: "ACTIVE",
          attachedTo: leader.instanceId,
        }));
        const result = runPipeline(
          state,
          {
            type: "ACTIVATE_EFFECT",
            cardInstanceId: leader.instanceId,
            effectId,
          },
          db,
          0
        );
        expect(result.valid).toBe(count >= threshold);
        if (count < threshold) {
          expect(result.error).toBe("Attached DON!! requirement is not met");
          expect(result.state.turn.oncePerTurnUsed[effectId]).toBeUndefined();
        } else if (id === "ST13-002") {
          expect(result.pendingPrompt?.options.promptType).toBe(
            "ARRANGE_TOP_CARDS"
          );
          const originalDeck = state.players[0].deck.map(
            (card) => card.instanceId
          );
          const resumed = resumeFromStack(
            JSON.parse(JSON.stringify(result.state)),
            {
              type: "ARRANGE_TOP_CARDS",
              orderedInstanceIds: originalDeck.slice(0, 5),
              destination: "bottom",
            },
            db
          );
          expect(resumed.pendingPrompt).toBeUndefined();
          expect(resumed.state.effectStack).toHaveLength(0);
          expect(
            resumed.state.players[0].deck.map((card) => card.instanceId)
          ).toEqual([...originalDeck.slice(5), ...originalDeck.slice(0, 5)]);
          expect(resumed.state.players[0].life).toEqual(state.players[0].life);
          expect(resumed.state.turn.oncePerTurnUsed[effectId]).toEqual([
            leader.instanceId,
          ]);
        } else {
          expect(result.state.turn.oncePerTurnUsed[effectId]).toEqual([
            leader.instanceId,
          ]);
        }
      }
    }
  );

  it("uses the requested instance and rejects an opponent's otherwise eligible source", () => {
    const { db, state, action } = fixture(1);
    const other = state.players[0].characters[1]!;
    other.cardId = "OP08-008";
    other.attachedDon = [];
    expect(
      runPipeline(state, { ...action, cardInstanceId: other.instanceId }, db, 0)
        .error
    ).toBe("Attached DON!! requirement is not met");
    expect(runPipeline(state, action, db, 1).valid).toBe(false);
    expect(state.turn.oncePerTurnUsed.activate_rush).toBeUndefined();
  });

  it("defensively refuses direct execution below the attached threshold", () => {
    const { db, state, action } = fixture(0);
    const before = structuredClone(state);
    const result = execute(state, action, db, 0);
    expect(result.state).toEqual(before);
    expect(result.events).toEqual([]);
  });
});
