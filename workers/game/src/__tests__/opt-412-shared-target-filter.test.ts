import { describe, expect, it } from "vitest";

import type { CardData, CardInstance, PlayerState } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function makeCardData(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    color: ["Red"],
    cost: 3,
    power: 5000,
    types: ["Navy"],
    effectSchema: null,
    ...overrides,
  };
}

function makeCharacter(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 1,
    owner: 1,
  };
}

describe("OPT-412 shared TargetFilter production path", () => {
  it("filters action targets through runPipeline with the shared predicates", () => {
    const cardDb = createTestCardDb();
    const leader: CardData = {
      ...cardDb.get("LEADER-T")!,
      id: "OPT-412-LEADER",
      effectSchema: {
        card_id: "OPT-412-LEADER",
        effects: [
          {
            id: "opt412_rest_target",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              {
                type: "SET_REST",
                target: {
                  type: "CHARACTER",
                  controller: "OPPONENT",
                  count: { up_to: 1 },
                  filter: {
                    color: "RED",
                    name_includes: "Target",
                    traits_any_of: ["Navy"],
                    traits_contains: ["Nav"],
                    cost_max: { type: "FIXED", value: 4 },
                    power_min: 5000,
                  },
                },
              },
            ],
          },
        ],
      },
    };
    const first = makeCardData("OPT-412-TARGET-A", { name: "Target Alpha" });
    const second = makeCardData("OPT-412-TARGET-B", { name: "Target Beta" });
    const wrongColor = makeCardData("OPT-412-NONMATCH", {
      name: "Target Gamma",
      color: ["Blue"],
    });
    for (const data of [leader, first, second, wrongColor]) {
      cardDb.set(data.id, data);
    }

    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: { ...players[0].leader, cardId: leader.id },
    };
    players[1] = {
      ...players[1],
      characters: padChars([
        makeCharacter(first.id, "target-a"),
        makeCharacter(second.id, "target-b"),
        makeCharacter(wrongColor.id, "nonmatch"),
      ]),
    };
    state = { ...state, players };

    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "opt412_rest_target",
      },
      cardDb,
      0
    );

    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("expected SELECT_TARGET prompt");
    }
    expect(result.pendingPrompt.options.validTargets).toEqual([
      "target-a",
      "target-b",
    ]);
  });
});
