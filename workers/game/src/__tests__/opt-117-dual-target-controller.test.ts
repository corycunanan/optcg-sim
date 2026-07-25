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
    const schema = {
      card_id: "TEST-117",
      card_name: "Invalid Controller",
      card_type: "Character",
      effects: [
        {
          id: "invalid-controller",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [
            {
              type: "KO",
              target: {
                type: "CHARACTER",
                controller: "EITHER",
                dual_targets: [
                  {
                    controller: "INVALID",
                    filter: {},
                    count: { up_to: 1 },
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as EffectSchema;

    expect(validateEffectSchema(schema, "TEST-117")).toContain(
      "[TEST-117] effects[0].actions[0].dual_targets[0].controller: Invalid controller 'INVALID'"
    );
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
