import { describe, expect, it } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { buildTriggerSelectionPrompt } from "../engine/trigger-ordering.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type { CardData, CardInstance, QueuedTrigger } from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function character(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function drawBlock(id: string, amount: number): EffectBlock {
  return {
    id,
    category: "auto",
    actions: [{ type: "DRAW", params: { amount } }],
  };
}

function queuedTrigger(
  sourceCardInstanceId: string,
  effectBlock: EffectBlock
): QueuedTrigger {
  return {
    sourceCardInstanceId,
    controller: 0,
    effectBlock,
    triggeringEvent: {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: {
        cardId: CARDS.VANILLA.id,
        cardInstanceId: sourceCardInstanceId,
        zone: "CHARACTER",
        source: "EFFECT",
      },
    },
  };
}

function duplicateSourceScenario() {
  const cardDb = createTestCardDb();
  const sourceData: CardData = {
    ...CARDS.VANILLA,
    id: "OPT758-DUAL-SOURCE",
    name: "Dual Source",
  };
  cardDb.set(sourceData.id, sourceData);
  const source = character(sourceData.id, "same-source");
  const other = character(CARDS.VANILLA.id, "other-source");
  const base = createBattleReadyState(cardDb);
  const state = {
    ...base,
    players: [
      { ...base.players[0], characters: padChars([source, other]) },
      base.players[1],
    ] as typeof base.players,
  };
  const triggers = [
    queuedTrigger(source.instanceId, drawBlock("first-block", 1)),
    queuedTrigger(source.instanceId, drawBlock("second-block", 2)),
    queuedTrigger(other.instanceId, drawBlock("third-block", 1)),
  ];
  return { state, cardDb, triggers };
}

describe("OPT-758 ordering review regressions", () => {
  it("rejects a disabled ordering choice at the session boundary", () => {
    const { state } = duplicateSourceScenario();
    const promptedState = {
      ...state,
      pendingPrompt: {
        options: {
          promptType: "PLAYER_CHOICE" as const,
          effectDescription: "Choose which effect to activate first",
          choices: [
            { id: "resolved-trigger", label: "Resolved", disabled: true },
            { id: "available-trigger", label: "Available" },
          ],
        },
        respondingPlayer: 0 as const,
        resumeContext: "ordering-frame",
      },
    };

    const routed = new SessionCoordinator().routePromptResponse(
      promptedState,
      0,
      { type: "PLAYER_CHOICE", choiceId: "resolved-trigger" }
    );

    expect(routed.kind).toBe("reject");
  });

  it("keeps duplicate-source trigger ids unique and resolves the selected block", () => {
    const { state, cardDb, triggers } = duplicateSourceScenario();
    const initialHand = state.players[0].hand.length;
    const prompted = buildTriggerSelectionPrompt(state, triggers, [], cardDb);
    if (prompted.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected trigger-ordering prompt");
    }
    const initialIds = prompted.pendingPrompt.options.choices.map(
      (choice) => choice.id
    );
    expect(new Set(initialIds).size).toBe(initialIds.length);

    const selectedId = initialIds[1];
    const afterSecond = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: selectedId },
      cardDb
    );

    expect(afterSecond.state.players[0].hand).toHaveLength(initialHand + 2);
    expect(afterSecond.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (afterSecond.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected trigger-ordering prompt to re-open");
    }
    expect(afterSecond.pendingPrompt.options.choices.map((choice) => choice.id))
      .toEqual(initialIds);
    expect(
      afterSecond.pendingPrompt.options.choices.find(
        (choice) => choice.id === selectedId
      )?.disabled
    ).toBe(true);

    const firstId = initialIds[0];
    const completed = resumeFromStack(
      afterSecond.state,
      { type: "PLAYER_CHOICE", choiceId: firstId },
      cardDb
    );
    expect(completed.pendingPrompt).toBeUndefined();
    expect(completed.state.players[0].hand).toHaveLength(initialHand + 4);
  });

  it.each([
    ["numeric", "0"],
    ["unknown", "missing-trigger"],
  ] as const)("rejects a %s ordering id without mutating state", (_case, choiceId) => {
    const { state, cardDb, triggers } = duplicateSourceScenario();
    const prompted = buildTriggerSelectionPrompt(state, triggers, [], cardDb);
    let responseState = prompted.state;
    if (_case === "numeric") {
      const legacyFrame = responseState.effectStack.at(-1)!;
      const { triggerOrderingGroup: _group, ...withoutGroup } = legacyFrame;
      responseState = {
        ...responseState,
        effectStack: [
          ...responseState.effectStack.slice(0, -1),
          {
            ...withoutGroup,
            simultaneousTriggers: legacyFrame.simultaneousTriggers.map(
              ({ orderingId: _orderingId, ...trigger }) => trigger
            ),
          },
        ],
      };
    }
    const before = structuredClone(responseState);

    const rejected = resumeFromStack(
      responseState,
      { type: "PLAYER_CHOICE", choiceId },
      cardDb
    );

    expect(rejected.rejected).toBe(true);
    expect(rejected.state).toEqual(before);
    expect(rejected.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (rejected.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected regenerated ordering prompt");
    }
    expect(rejected.pendingPrompt.options.choices.every(
      (choice) => choice.id !== "0"
    )).toBe(true);
  });

  it("rejects a resolved trigger id without mutating state", () => {
    const { state, cardDb, triggers } = duplicateSourceScenario();
    const prompted = buildTriggerSelectionPrompt(state, triggers, [], cardDb);
    if (prompted.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected trigger-ordering prompt");
    }
    const resolvedId = prompted.pendingPrompt.options.choices[1].id;
    const afterChoice = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: resolvedId },
      cardDb
    );
    const before = structuredClone(afterChoice.state);

    const rejected = resumeFromStack(
      afterChoice.state,
      { type: "PLAYER_CHOICE", choiceId: resolvedId },
      cardDb
    );

    expect(rejected.rejected).toBe(true);
    expect(rejected.state).toEqual(before);
    expect(rejected.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  });
});
