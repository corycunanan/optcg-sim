import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import type {
  ActionOf,
  EffectBlock,
  EffectResult,
  EffectSchema,
  Target,
} from "../engine/effect-types.js";
import { createDeterministicExecutionContext } from "../engine/execution-context.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import {
  buildSelectTargetPrompt,
  computeAllValidTargets,
  validateTargetConstraints,
} from "../engine/effect-resolver/target-resolver.js";
import { validateEffectSchema } from "../engine/schema-registry.js";
import { EB03_021_ALVIDA } from "../engine/schemas/eb03.js";

function noKeywords() {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Blue"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeInstance(
  cardId: string,
  zone: string,
  owner: 0 | 1,
  instanceId: string
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: zone as CardInstance["zone"],
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

function buildScenario() {
  const alvida = makeInstance("EB03-021", "CHARACTER", 0, "alvida");
  const friendlyExploit = makeInstance(
    "FRIEND-C5-P3",
    "CHARACTER",
    0,
    "friendly-exploit"
  );
  const friendlyLowCost = makeInstance(
    "FRIEND-C2-P5",
    "CHARACTER",
    0,
    "friendly-low-cost"
  );
  const opponentLowPower = makeInstance(
    "OPP-C5-P3",
    "CHARACTER",
    1,
    "opponent-low-power"
  );
  const opponentLowCost = makeInstance(
    "OPP-C2-P6",
    "CHARACTER",
    1,
    "opponent-low-cost"
  );
  const handCost = makeInstance("VANILLA", "HAND", 0, "hand-cost");

  const cardDb = new Map<string, CardData>([
    [
      "LEADER",
      makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 }),
    ],
    ["VANILLA", makeCard("VANILLA")],
    [
      "EB03-021",
      makeCard("EB03-021", {
        name: "Alvida",
        cost: 4,
        power: 5000,
        effectText:
          "[On Play] You may trash 1 card from your hand: Place up to 1 of your opponent's Characters with 4000 base power or less AND up to 1 Character with a base cost of 3 or less at the bottom of the owner's deck.",
        effectSchema: EB03_021_ALVIDA,
      }),
    ],
    ["FRIEND-C5-P3", makeCard("FRIEND-C5-P3", { cost: 5, power: 3000 })],
    ["FRIEND-C2-P5", makeCard("FRIEND-C2-P5", { cost: 2, power: 5000 })],
    ["OPP-C5-P3", makeCard("OPP-C5-P3", { cost: 5, power: 3000 })],
    ["OPP-C2-P6", makeCard("OPP-C2-P6", { cost: 2, power: 6000 })],
  ]);

  const makePlayer = (index: 0 | 1): PlayerState => ({
    playerId: `player-${index}`,
    leader: makeInstance("LEADER", "LEADER", index, `leader-${index}`),
    characters:
      index === 0
        ? [alvida, friendlyExploit, friendlyLowCost, null, null]
        : [opponentLowPower, opponentLowCost, null, null, null],
    stage: null,
    hand: index === 0 ? [handCost] : [],
    deck: Array.from({ length: 20 }, (_, cardIndex) =>
      makeInstance("VANILLA", "DECK", index, `deck-${index}-${cardIndex}`)
    ),
    trash: [],
    life: [],
    removedFromGame: [],
    donDeck: [],
    donCostArea: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  });

  const state: GameState = {
    id: "opt-117",
    executionContext: createDeterministicExecutionContext("opt-117"),
    status: "IN_PROGRESS",
    winner: null,
    players: [makePlayer(0), makePlayer(1)],
    turn: {
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
      deckHitZeroThisTurn: [false, false],
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pregame: null,
    pendingPrompt: null,
    eventLog: [],
    winReason: null,
  } as GameState;

  const action = EB03_021_ALVIDA.effects[0]
    .actions![0] as ActionOf<"RETURN_TO_DECK">;
  return {
    state,
    cardDb,
    action,
    alvida,
    friendlyExploit,
    friendlyLowCost,
    opponentLowPower,
    opponentLowCost,
    handCost,
  };
}

function buildSlotControllerSchema(
  targetType: Target["type"],
  slotController: unknown
): EffectSchema {
  return {
    card_id: "TEST-117",
    card_name: "Slot Controller",
    card_type: "Character",
    effects: [
      {
        id: "slot-controller",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "RETURN_TO_HAND",
            target: {
              type: targetType,
              source_zone: "HAND",
              dual_targets: [
                {
                  controller: slotController,
                  filter: {},
                  count: { up_to: 1 },
                },
              ],
            },
          },
        ],
      },
    ],
  } as EffectSchema;
}

describe("OPT-117 dual-target slot controllers", () => {
  it("narrows prompt metadata per slot controller", () => {
    const {
      state,
      cardDb,
      action,
      alvida,
      friendlyExploit,
      friendlyLowCost,
      opponentLowPower,
      opponentLowCost,
    } = buildScenario();
    const resultRefs = new Map<string, EffectResult>();
    const validIds = computeAllValidTargets(
      state,
      action.target,
      0,
      cardDb,
      alvida.instanceId,
      resultRefs
    );
    const result = buildSelectTargetPrompt(
      state,
      action,
      validIds,
      alvida.instanceId,
      0,
      cardDb,
      resultRefs
    );
    const options = result.pendingPrompt!.options;
    expect(options.promptType).toBe("SELECT_TARGET");
    if (options.promptType !== "SELECT_TARGET")
      throw new Error("unexpected prompt type");

    expect(options.dualTargets!.slots[0].validIds).toEqual([
      opponentLowPower.instanceId,
    ]);
    expect(options.dualTargets!.slots[0].validIds).not.toContain(
      friendlyExploit.instanceId
    );
    expect(options.dualTargets!.slots[1].validIds).toEqual([
      friendlyLowCost.instanceId,
      opponentLowCost.instanceId,
    ]);
  });

  it("rejects a friendly low-power, high-cost Character assigned to the opponent slot", () => {
    const { state, cardDb, action, alvida, friendlyExploit } = buildScenario();
    expect(
      validateTargetConstraints(
        [friendlyExploit.instanceId],
        action.target!,
        state,
        cardDb,
        new Map(),
        { controller: 0, sourceCardInstanceId: alvida.instanceId }
      )
    ).toBe(false);
  });

  it("inherits the parent controller when a slot controller is omitted", () => {
    const { state, cardDb, alvida, friendlyExploit, opponentLowPower } =
      buildScenario();
    const target: Target = {
      type: "CHARACTER",
      controller: "OPPONENT",
      dual_targets: [
        {
          filter: { base_power_max: 4000 },
          count: { up_to: 1 },
        },
      ],
    };
    const validIds = computeAllValidTargets(
      state,
      target,
      0,
      cardDb,
      alvida.instanceId,
      new Map()
    );

    expect(validIds).toEqual([opponentLowPower.instanceId]);
    expect(
      validateTargetConstraints(
        [opponentLowPower.instanceId],
        target,
        state,
        cardDb,
        new Map(),
        { controller: 0, sourceCardInstanceId: alvida.instanceId }
      )
    ).toBe(true);
    expect(
      validateTargetConstraints(
        [friendlyExploit.instanceId],
        target,
        state,
        cardDb,
        new Map(),
        { controller: 0, sourceCardInstanceId: alvida.instanceId }
      )
    ).toBe(false);
  });

  it("fails closed when a slot controller is declared without validation context", () => {
    const { state, cardDb, action, opponentLowPower } = buildScenario();
    expect(
      validateTargetConstraints(
        [opponentLowPower.instanceId],
        action.target!,
        state,
        cardDb
      )
    ).toBe(false);
  });

  it("honors exclude_self inside a dual-target slot", () => {
    const { state, cardDb, alvida, friendlyLowCost } = buildScenario();
    const target: Target = {
      type: "CHARACTER",
      controller: "SELF",
      dual_targets: [
        {
          filter: { exclude_self: true },
          count: { up_to: 1 },
        },
      ],
    };
    const validIds = computeAllValidTargets(
      state,
      target,
      0,
      cardDb,
      alvida.instanceId,
      new Map()
    );

    expect(validIds).not.toContain(alvida.instanceId);
    expect(validIds).toContain(friendlyLowCost.instanceId);
  });

  it("rejects an invalid dual-target slot controller during schema validation", () => {
    const schema = buildSlotControllerSchema("CHARACTER", "INVALID");

    expect(validateEffectSchema(schema, "TEST-117")).toContain(
      "[TEST-117] effects[0].actions[0].dual_targets[0].controller: Invalid controller 'INVALID'"
    );
  });

  it("accepts EITHER slot controllers for target types with both-player resolution", () => {
    for (const targetType of [
      "CHARACTER",
      "LEADER_OR_CHARACTER",
      "FIELD_CARD",
    ] as const) {
      expect(
        validateEffectSchema(
          buildSlotControllerSchema(targetType, "EITHER"),
          "TEST-117"
        )
      ).toEqual([]);
    }
  });

  it("rejects ANY slot controllers in targeting contexts", () => {
    expect(
      validateEffectSchema(
        buildSlotControllerSchema("CHARACTER", "ANY"),
        "TEST-117"
      )
    ).toContain(
      "[TEST-117] effects[0].actions[0].dual_targets[0].controller: [C7] Target type 'CHARACTER' does not support dual-target slot controller 'ANY'; use SELF or OPPONENT or EITHER"
    );
  });

  it.each(["EITHER", "ANY"] as const)(
    "rejects %s slot controllers for target types that collapse both-player modes",
    (slotController) => {
      for (const targetType of [
        "CARD_IN_HAND",
        "CHARACTER_CARD",
        "EVENT_CARD",
        "STAGE_CARD",
        "CARD_IN_TRASH",
        "CARD_IN_DECK",
        "DON_IN_COST_AREA",
        "STAGE",
        "PLAYER",
        "CARD_ON_TOP_OF_DECK",
      ] as const) {
        expect(
          validateEffectSchema(
            buildSlotControllerSchema(targetType, slotController),
            "TEST-117"
          )
        ).toContain(
          `[TEST-117] effects[0].actions[0].dual_targets[0].controller: [C7] Target type '${targetType}' does not support dual-target slot controller '${slotController}'; use SELF or OPPONENT`
        );
      }
    }
  );

  it.each([
    "SELF",
    "YOUR_LEADER",
    "OPPONENT_LEADER",
    "ALL_YOUR_CHARACTERS",
    "ALL_OPPONENT_CHARACTERS",
    "LIFE_CARD",
    "OPPONENT_LIFE",
    "SELECTED_CARDS",
    "TRIGGERING_CARD",
    "TRIGGERING_CARD_IN_TRASH",
    "DON_ATTACHED",
    "DON_IN_DON_DECK",
  ] as const)(
    "rejects any declared slot controller for unsupported target type %s",
    (targetType) => {
      expect(
        validateEffectSchema(
          buildSlotControllerSchema(targetType, "OPPONENT"),
          "TEST-117"
        )
      ).toContain(
        `[TEST-117] effects[0].actions[0].dual_targets[0].controller: [C7] Target type '${targetType}' does not support dual-target slot controller 'OPPONENT'; this target type does not support a per-slot controller; remove the controller`
      );
    }
  );

  it.each(["SELF", "OPPONENT"] as const)(
    "accepts %s slot controllers for single-player target branches",
    (slotController) => {
      expect(
        validateEffectSchema(
          buildSlotControllerSchema("CARD_IN_HAND", slotController),
          "TEST-117"
        )
      ).toEqual([]);
    }
  );

  it("keeps prompt slot pools within the caller's authoritative valid IDs", () => {
    const {
      state,
      cardDb,
      alvida,
      friendlyLowCost,
      opponentLowCost,
    } = buildScenario();
    const action: ActionOf<"RETURN_TO_DECK"> = {
      type: "RETURN_TO_DECK",
      target: {
        type: "CHARACTER",
        controller: "EITHER",
        dual_targets: [
          {
            filter: { base_cost_max: 3 },
            count: { any_number: true },
          },
        ],
      },
      params: { position: "BOTTOM" },
    };
    const result = buildSelectTargetPrompt(
      state,
      action,
      [opponentLowCost.instanceId],
      alvida.instanceId,
      0,
      cardDb,
      new Map()
    );
    const options = result.pendingPrompt!.options;
    expect(options.promptType).toBe("SELECT_TARGET");
    if (options.promptType !== "SELECT_TARGET")
      throw new Error("unexpected prompt type");

    expect(options.validTargets).toEqual([opponentLowCost.instanceId]);
    expect(options.dualTargets!.slots[0].validIds).toEqual([
      opponentLowCost.instanceId,
    ]);
    expect(options.dualTargets!.slots[0].validIds).not.toContain(
      friendlyLowCost.instanceId
    );
    expect(options.dualTargets!.slots[0].countMax).toBe(1);
  });

  it("reports C7 through lint-schemas.sh for unsupported and invalid slot modes", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "opt117-lint-"));
    try {
      writeFileSync(join(fixtureDir, "fixture.ts"), `
export const BAD_UNSUPPORTED_SLOT_CONTROLLER: EffectSchema = {
  card_id: "TEST-C7-A",
  card_name: "Bad Unsupported Slot Controller",
  card_type: "Character",
  effects: [{
    id: "bad_unsupported_slot_controller",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [{
      type: "DRAW",
      target: {
        type: "LIFE_CARD",
        dual_targets: [{ controller: "OPPONENT", filter: {}, count: { up_to: 1 } }],
      },
    }],
  }],
};
export const BAD_COLLAPSING_SLOT_CONTROLLER: EffectSchema = {
  card_id: "TEST-C7-B",
  card_name: "Bad Collapsing Slot Controller",
  card_type: "Character",
  effects: [{
    id: "bad_collapsing_slot_controller",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [{
      type: "RETURN_TO_HAND",
      target: {
        type: "CARD_IN_HAND",
        source_zone: "HAND",
        dual_targets: [{ controller: "EITHER", filter: {}, count: { up_to: 1 } }],
      },
    }],
  }],
};
`);
      const linter = resolve(__dirname, "../engine/schemas/lint-schemas.sh");
      let output = "";
      try {
        output = execFileSync("node", [linter, join(fixtureDir, "fixture.ts")], {
          encoding: "utf8",
        });
      } catch (error) {
        output = (error as { stdout?: string }).stdout ?? "";
      }
      const c7Lines = output.split("\n").filter((line) => line.includes("C7"));
      expect(c7Lines.some((line) => line.includes("TEST-C7-A"))).toBe(true);
      expect(c7Lines.some((line) => line.includes("TEST-C7-B"))).toBe(true);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("resolves EB03-021 as one mixed-controller prompt and returns both cards to their owners' deck bottoms", () => {
    const {
      state,
      cardDb,
      alvida,
      friendlyExploit,
      friendlyLowCost,
      opponentLowPower,
      handCost,
    } = buildScenario();
    const block = EB03_021_ALVIDA.effects[0] as EffectBlock;

    const optionalPrompt = resolveEffect(
      state,
      block,
      alvida.instanceId,
      0,
      cardDb
    );
    expect(optionalPrompt.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );

    const costPrompt = resumeFromStack(
      optionalPrompt.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb
    );
    expect(costPrompt.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const targetPrompt = resumeFromStack(
      costPrompt.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [handCost.instanceId] },
      cardDb
    );
    const options = targetPrompt.pendingPrompt!.options;
    expect(options.promptType).toBe("SELECT_TARGET");
    if (options.promptType !== "SELECT_TARGET")
      throw new Error("unexpected prompt type");
    expect(options.countMax).toBe(2);
    expect(options.dualTargets?.slots).toHaveLength(2);
    expect(options.dualTargets!.slots[0].validIds).toEqual([
      opponentLowPower.instanceId,
    ]);
    expect(options.dualTargets!.slots[0].validIds).not.toContain(
      friendlyExploit.instanceId
    );
    expect(options.dualTargets!.slots[1].validIds).toContain(
      friendlyLowCost.instanceId
    );

    const resolved = resumeFromStack(
      targetPrompt.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [
          opponentLowPower.instanceId,
          friendlyLowCost.instanceId,
        ],
      },
      cardDb
    );

    expect(resolved.resolved).toBe(true);
    expect(resolved.pendingPrompt).toBeUndefined();
    expect(
      resolved.state.players[0].characters.some(
        (card) => card?.instanceId === friendlyLowCost.instanceId
      )
    ).toBe(false);
    expect(
      resolved.state.players[1].characters.some(
        (card) => card?.instanceId === opponentLowPower.instanceId
      )
    ).toBe(false);
    expect(resolved.state.players[0].deck.at(-1)?.cardId).toBe(
      friendlyLowCost.cardId
    );
    expect(resolved.state.players[1].deck.at(-1)?.cardId).toBe(
      opponentLowPower.cardId
    );
  });
});
