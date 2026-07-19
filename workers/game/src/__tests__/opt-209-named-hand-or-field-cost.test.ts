/**
 * OPT-209 — Named hand-or-field cost primitives
 *
 * Covers:
 * - TRASH_FROM_HAND with filter.name / name_any_of
 * - TRASH_OWN_STAGE with filter.name
 * - TRASH_NAMED_CARD_FROM_HAND_OR_STAGE selection and payment
 * - OP06-033's printed two-branch CHOICE cost and K.O. resolution
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, PlayerState } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import {
  isCostPayable,
  computeCostTargets,
  payCosts,
  payCostsWithSelection,
} from "../engine/effect-resolver/cost-handler.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { validateCost, validateEffectSchema } from "../engine/schema-registry.js";
import { areEffectCostsPayable } from "../engine/validation.js";
import { OP06_033_VANDER_DECKEN_IX } from "../engine/schemas/op06.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";

function makeState(cardDb: Map<string, CardData>) {
  return createBattleReadyState(cardDb);
}

function withPlayer(
  state: ReturnType<typeof makeState>,
  playerIdx: 0 | 1,
  patch: Partial<PlayerState>,
): ReturnType<typeof makeState> {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], ...patch };
  return { ...state, players: newPlayers };
}

function makeHandCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `hand-${suffix}`,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function makeStageCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `stage-${suffix}`,
    cardId,
    zone: "STAGE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

describe("OPT-209: TRASH_FROM_HAND with filter.name", () => {
  it("payable when hand contains a card with the matching name", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [
        makeHandCard(CARDS.VANILLA.id, "v1"),
        makeHandCard(CARDS.STAGE.id, "s1"),
      ],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name: CARDS.STAGE.name },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when hand has no card with the matching name", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.VANILLA.id, "v1")],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name: CARDS.STAGE.name },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("computeCostTargets returns only the matching hand card", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [
        makeHandCard(CARDS.VANILLA.id, "v1"),
        makeHandCard(CARDS.STAGE.id, "match"),
        makeHandCard(CARDS.BLOCKER.id, "b1"),
      ],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name: CARDS.STAGE.name },
    };
    const targets = computeCostTargets(state, cost, 0, cardDb);
    expect(targets).toEqual(["hand-match"]);
  });

  it("name_any_of matches any listed name", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [
        makeHandCard(CARDS.VANILLA.id, "v1"),
        makeHandCard(CARDS.BLOCKER.id, "b1"),
      ],
    });
    const cost: Cost = {
      type: "TRASH_FROM_HAND",
      amount: 1,
      filter: { name_any_of: [CARDS.STAGE.name, CARDS.BLOCKER.name] },
    };
    const targets = computeCostTargets(state, cost, 0, cardDb);
    expect(targets).toEqual(["hand-b1"]);
  });
});

describe("OPT-209: TRASH_OWN_STAGE", () => {
  it("payable when a stage is on the field (no filter)", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const cost: Cost = { type: "TRASH_OWN_STAGE" };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when no stage is on the field", () => {
    const cardDb = createTestCardDb();
    const state = withPlayer(makeState(cardDb), 0, { stage: null });
    const cost: Cost = { type: "TRASH_OWN_STAGE" };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("payable when stage name matches filter", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const cost: Cost = {
      type: "TRASH_OWN_STAGE",
      filter: { name: CARDS.STAGE.name },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(true);
  });

  it("unpayable when stage exists but name does not match", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const cost: Cost = {
      type: "TRASH_OWN_STAGE",
      filter: { name: "Some Other Stage" },
    };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });

  it("payCosts moves the stage to trash and clears the stage slot", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const stage = makeStageCard(CARDS.STAGE.id, "s1");
    const state = withPlayer(base, 0, { stage });

    const result = payCosts(
      state,
      [{ type: "TRASH_OWN_STAGE", filter: { name: CARDS.STAGE.name } }],
      0,
      cardDb,
    );

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    expect(p0.stage).toBeNull();
    expect(p0.trash[0]?.instanceId).not.toBe("stage-s1");
    expect(p0.trash[0]?.zone).toBe("TRASH");
    expect(result!.costResult.cardsTrashedCount).toBe(1);
    expect(result!.costResult.cardsTrashedInstanceIds).toContain("stage-s1");
  });

  it("payCosts returns null when stage filter does not match", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const result = payCosts(
      state,
      [{ type: "TRASH_OWN_STAGE", filter: { name: "Some Other Stage" } }],
      0,
      cardDb,
    );
    expect(result).toBeNull();
  });
});

describe("OPT-510: TRASH_NAMED_CARD_FROM_HAND_OR_STAGE", () => {
  function namedHandOrStageCost(): Cost {
    return {
      type: "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE",
      card_name: CARDS.STAGE.name,
    };
  }

  it("payable when the named card is in hand only", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.STAGE.id, "h1")],
      stage: null,
    });
    expect(isCostPayable(state, namedHandOrStageCost(), 0, cardDb)).toBe(true);
    expect(areEffectCostsPayable(state, [namedHandOrStageCost()], 0, cardDb, "char-0-v1")).toBe(true);
  });

  it("payable when the named card is on the stage only", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.VANILLA.id, "v1")],
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    expect(isCostPayable(state, namedHandOrStageCost(), 0, cardDb)).toBe(true);
  });

  it("unpayable when the named card is in neither hand nor stage", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.VANILLA.id, "v1")],
      stage: null,
    });
    expect(isCostPayable(state, namedHandOrStageCost(), 0, cardDb)).toBe(false);
    expect(areEffectCostsPayable(state, [namedHandOrStageCost()], 0, cardDb, "char-0-v1")).toBe(false);
  });

  it("offers both zones in one persisted SELECT_TARGET cost frame", () => {
    const cardDb = createTestCardDb();
    const base = makeState(cardDb);
    const state = withPlayer(base, 0, {
      hand: [makeHandCard(CARDS.STAGE.id, "h1")],
      stage: makeStageCard(CARDS.STAGE.id, "s1"),
    });
    const block: EffectBlock = {
      id: "named-hand-or-stage",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [namedHandOrStageCost()],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const result = payCostsWithSelection(
      state,
      block.costs!,
      0,
      0,
      cardDb,
      "char-0-v1",
      block,
      resolverExecutionServices,
    );

    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(result.state.effectStack.at(-1)?.validTargets).toEqual(["hand-h1", "stage-s1"]);
    if (result.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(result.pendingPrompt.options.cards.map((card) => card.instanceId)).toEqual([
        "hand-h1",
        "stage-s1",
      ]);
    }
  });

  it("accepts the primitive only with a non-empty card_name", () => {
    expect(validateCost(namedHandOrStageCost(), "root", false)).toEqual([]);
    expect(validateCost(
      { type: "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE" } as Cost,
      "root",
      false,
    )).toContain("root: TRASH_NAMED_CARD_FROM_HAND_OR_STAGE requires a non-empty 'card_name'");
  });
});

describe("OPT-510: OP06-033 printed two-branch cost", () => {
  const block = OP06_033_VANDER_DECKEN_IX.effects[0] as EffectBlock;

  function op06033State(options: { arkInHand?: boolean; arkOnStage?: boolean; fishManInHand?: boolean }) {
    const cardDb = createTestCardDb();
    const stageData = cardDb.get(CARDS.STAGE.id)!;
    const vanillaData = cardDb.get(CARDS.VANILLA.id)!;
    cardDb.set(CARDS.STAGE.id, { ...stageData, name: "The Ark Noah" });
    cardDb.set(CARDS.VANILLA.id, { ...vanillaData, types: ["Fish-Man"] });
    let state = makeState(cardDb);
    state = withPlayer(state, 0, {
      hand: [
        ...(options.fishManInHand ? [makeHandCard(CARDS.VANILLA.id, "fish")]: []),
        ...(options.arkInHand ? [makeHandCard(CARDS.STAGE.id, "ark")]: []),
      ],
      stage: options.arkOnStage ? makeStageCard(CARDS.STAGE.id, "ark") : null,
    });
    const opponentCharacters = [...state.players[1].characters];
    opponentCharacters[0] = { ...opponentCharacters[0]!, state: "RESTED" };
    state = withPlayer(state, 1, { characters: opponentCharacters });
    return { state, cardDb, opponentId: opponentCharacters[0]!.instanceId };
  }

  function acceptEffect(state: ReturnType<typeof makeState>, cardDb: Map<string, CardData>) {
    const offered = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    return resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction,
      cardDb,
    );
  }

  function select(state: ReturnType<typeof makeState>, selectedInstanceIds: string[], cardDb: Map<string, CardData>) {
    return resumeFromStack(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds } as GameAction,
      cardDb,
    );
  }

  it("encodes and validates exactly two printed cost branches", () => {
    expect(validateEffectSchema(OP06_033_VANDER_DECKEN_IX)).toEqual([]);
    expect(block.costs).toEqual([
      {
        type: "CHOICE",
        options: [
          [{ type: "TRASH_FROM_HAND", amount: 1, filter: { traits: ["Fish-Man"] } }],
          [{ type: "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE", card_name: "The Ark Noah" }],
        ],
        labels: [
          "Trash 1 {Fish-Man} type card from hand",
          "Trash 1 [The Ark Noah] from hand or field",
        ],
      },
    ]);
  });

  it("offers both printed branches and pays the Fish-Man hand branch before K.O.", () => {
    const { state, cardDb, opponentId } = op06033State({ fishManInHand: true, arkOnStage: true });
    const branches = acceptEffect(state, cardDb);
    expect(branches.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const fishPayment = resumeFromStack(
      branches.state,
      { type: "PLAYER_CHOICE", choiceId: "0" } as GameAction,
      cardDb,
    );
    expect(fishPayment.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const koPrompt = select(fishPayment.state, ["hand-fish"], cardDb);
    expect(koPrompt.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const resolved = select(koPrompt.state, [opponentId], cardDb);

    expect(resolved.state.players[0].hand).toHaveLength(0);
    expect(resolved.state.players[0].stage?.instanceId).toBe("stage-ark");
    expect(resolved.state.players[1].characters[0]).toBeNull();
  });

  it.each([
    ["hand", "hand-ark", "stage-ark"],
    ["stage", "stage-ark", "hand-ark"],
  ] as const)("chooses and pays The Ark Noah from %s when both zones hold one", (_zone, arkId, unchosenArkId) => {
    const options = { arkInHand: true, arkOnStage: true };
    const { state, cardDb, opponentId } = op06033State({ fishManInHand: true, ...options });
    const branches = acceptEffect(state, cardDb);
    const arkPayment = resumeFromStack(
      branches.state,
      { type: "PLAYER_CHOICE", choiceId: "1" } as GameAction,
      cardDb,
    );
    expect(arkPayment.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const koPrompt = select(arkPayment.state, [arkId], cardDb);
    const resolved = select(koPrompt.state, [opponentId], cardDb);

    expect(resolved.state.players[0].hand.some((card) => card.instanceId === arkId)).toBe(false);
    expect(resolved.state.players[0].stage?.instanceId).not.toBe(arkId);
    expect([
      ...resolved.state.players[0].hand.map((card) => card.instanceId),
      resolved.state.players[0].stage?.instanceId,
    ]).toContain(unchosenArkId);
    expect(resolved.state.players[0].trash.some((card) => card.cardId === CARDS.STAGE.id)).toBe(true);
    expect(resolved.state.players[1].characters[0]).toBeNull();
  });

  it("auto-selects the only payable printed branch and blocks when neither is payable", () => {
    const onlyArk = op06033State({ arkOnStage: true });
    const paymentPrompt = acceptEffect(onlyArk.state, onlyArk.cardDb);
    expect(paymentPrompt.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (paymentPrompt.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(paymentPrompt.pendingPrompt.options.validTargets).toEqual(["stage-ark"]);
    }

    const neither = op06033State({});
    expect(isCostPayable(neither.state, block.costs![0], 0, neither.cardDb, "char-0-v1")).toBe(false);
    const unpayable = acceptEffect(neither.state, neither.cardDb);
    expect(unpayable.pendingPrompt).toBeUndefined();
    expect(unpayable.state.effectStack).toHaveLength(0);
  });
});
