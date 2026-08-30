/**
 * OPT-723 — card text can K.O. a Stage (Rules 1-3-1 and 10-2-1).
 */

import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import {
  registerReplacementsForCard,
  registerTriggersForCard,
} from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";
import {
  OP17_018_THE_POWER_TO_DESTROY_THE_WORLD,
  OP17_116_FULGORA,
} from "../engine/schemas/op17.js";
import { OP05_030_DONQUIXOTE_ROSINANTE } from "../engine/schemas/op05.js";

function withPlayer(
  state: GameState,
  playerIndex: 0 | 1,
  patch: Partial<PlayerState>,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function setupStageKO(
  schema: EffectSchema = OP17_018_THE_POWER_TO_DESTROY_THE_WORLD,
  effectText = "[Main] K.O. up to 1 of your opponent's Stages.",
): {
  state: GameState;
  cardDb: Map<string, CardData>;
  event: CardInstance;
  stage: CardInstance;
} {
  const cardDb = createTestCardDb();
  const eventData: CardData = {
    ...CARDS.EVENT_COUNTER,
    id: schema.card_id!,
    name: schema.card_name!,
    cost: 0,
    effectText,
    effectSchema: schema,
  };
  cardDb.set(eventData.id, eventData);

  let state = createBattleReadyState(cardDb);
  const event: CardInstance = {
    instanceId: "event-stage-ko",
    cardId: eventData.id,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
  const stage: CardInstance = {
    instanceId: "opponent-stage",
    cardId: CARDS.STAGE.id,
    zone: "STAGE",
    state: "RESTED",
    attachedDon: [],
    turnPlayed: state.turn.number,
    controller: 1,
    owner: 1,
  };
  state = withPlayer(state, 0, { hand: [...state.players[0].hand, event] });
  state = withPlayer(state, 1, { stage });
  return { state, cardDb, event, stage };
}

function offerStageTarget(
  state: GameState,
  event: CardInstance,
  cardDb: Map<string, CardData>,
) {
  const optional = runPipeline(
    state,
    { type: "PLAY_CARD", cardInstanceId: event.instanceId },
    cardDb,
    0,
  );
  expect(optional.valid).toBe(true);
  expect(optional.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const offered = resumeFromStack(
    optional.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb,
  );
  expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return offered;
}

describe("OPT-723 Stage K.O.", () => {
  it("scopes a SELECT_TARGET prompt to the active effect clause", () => {
    const { state, cardDb, event } = setupStageKO(
      OP17_018_THE_POWER_TO_DESTROY_THE_WORLD,
      "[Main] K.O. up to 1 of your opponent's Stages. [Trigger] Draw 1 card.",
    );
    const optional = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: event.instanceId },
      cardDb,
      0,
    );
    expect(optional.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const activeFrame = optional.state.effectStack.at(-1)!;
    const stateWithActiveClause = {
      ...optional.state,
      effectStack: [activeFrame, ...optional.state.effectStack],
    };

    const offered = resumeFromStack(
      stateWithActiveClause,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
    );

    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (offered.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(offered.pendingPrompt.options.effectDescription).toBe(
        "[Main] K.O. up to 1 of your opponent's Stages."
      );
      expect(offered.pendingPrompt.options.effectDescription).not.toContain(
        "[Trigger] Draw 1 card."
      );
    }
  });

  it("moves a Stage to its owner's trash and emits CARD_KO through the pipeline", () => {
    const { state, cardDb, event, stage } = setupStageKO();

    const offered = offerStageTarget(state, event, cardDb);

    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [stage.instanceId] },
      cardDb,
    );

    expect(resolved.state.players[1].stage).toBeNull();
    expect(resolved.state.players[1].trash).toContainEqual(
      expect.objectContaining({ cardId: stage.cardId, state: "ACTIVE" }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: "CARD_KO",
        playerIndex: 1,
        payload: expect.objectContaining({
          cardInstanceId: stage.instanceId,
          cardId: stage.cardId,
          cause: "OPPONENT_EFFECT",
          causingController: 0,
          preKO_donCount: 0,
          cardType: "STAGE",
        }),
      }),
    );
    expect(resolved.state.turn.actionsPerformedThisTurn).not.toContainEqual(
      expect.objectContaining({ actionType: "CHARACTER_KO" }),
    );
  });

  it("does not fire a Character K.O. observer when a Stage is K.O.'d", () => {
    const setup = setupStageKO();
    const observerData: CardData = {
      ...CARDS.VANILLA,
      id: "CHARACTER-KO-OBSERVER",
      name: "Character K.O. Observer",
      effectSchema: {
        effects: [
          {
            id: "observe_character_ko",
            category: "auto",
            trigger: { event: "ANY_CHARACTER_KO" },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    };
    setup.cardDb.set(observerData.id, observerData);
    const observer: CardInstance = {
      instanceId: "character-ko-observer",
      cardId: observerData.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: setup.state.turn.number,
      controller: 0,
      owner: 0,
    };
    const characters = [...setup.state.players[0].characters];
    characters[0] = observer;
    let state = withPlayer(setup.state, 0, { characters });
    state = registerTriggersForCard(state, observer, observerData);
    const handBefore = state.players[0].hand.length;

    const offered = offerStageTarget(state, setup.event, setup.cardDb);
    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [setup.stage.instanceId] },
      setup.cardDb,
    );

    expect(resolved.state.players[0].hand).toHaveLength(handBefore - 1);
    expect(resolved.events.some((event) => event.type === "CARD_DRAWN")).toBe(false);
  });

  it("offers Stage K.O. to the existing WOULD_BE_KO replacement window", () => {
    const setup = setupStageKO();
    const protectorData: CardData = {
      ...CARDS.VANILLA,
      id: "STAGE-KO-PROTECTOR",
      name: "Stage K.O. Protector",
      effectSchema: {
        effects: [
          {
            id: "replace_stage_ko",
            category: "replacement",
            replaces: {
              event: "WOULD_BE_KO",
              target_filter: { controller: "SELF", card_type: "STAGE" },
              cause_filter: { by: "OPPONENT_EFFECT" },
            },
            replacement_actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    };
    setup.cardDb.set(protectorData.id, protectorData);
    const protector: CardInstance = {
      instanceId: "stage-ko-protector",
      cardId: protectorData.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: setup.state.turn.number,
      controller: 1,
      owner: 1,
    };
    const characters = [...setup.state.players[1].characters];
    characters[0] = protector;
    let state = withPlayer(setup.state, 1, { characters });
    state = registerReplacementsForCard(state, protector, protectorData);
    const handBefore = state.players[1].hand.length;

    const offered = offerStageTarget(state, setup.event, setup.cardDb);
    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [setup.stage.instanceId] },
      setup.cardDb,
    );

    expect(resolved.state.players[1].stage?.instanceId).toBe(setup.stage.instanceId);
    expect(resolved.state.players[1].hand).toHaveLength(handBefore + 1);
    expect(resolved.events.some((event) => event.type === "CARD_KO")).toBe(false);
  });

  it("does not offer a Character-default Rosinante replacement for a Stage K.O.", () => {
    const setup = setupStageKO();
    const rosinanteData: CardData = {
      ...CARDS.VANILLA,
      id: OP05_030_DONQUIXOTE_ROSINANTE.card_id!,
      name: OP05_030_DONQUIXOTE_ROSINANTE.card_name!,
      effectSchema: OP05_030_DONQUIXOTE_ROSINANTE,
    };
    setup.cardDb.set(rosinanteData.id, rosinanteData);
    const rosinante: CardInstance = {
      instanceId: "rosinante-stage-ko-protector",
      cardId: rosinanteData.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: setup.state.turn.number,
      controller: 1,
      owner: 1,
    };
    const characters = [...setup.state.players[1].characters];
    characters[0] = rosinante;
    let state = withPlayer(setup.state, 1, { characters });
    state = registerReplacementsForCard(state, rosinante, rosinanteData);

    const offered = offerStageTarget(state, setup.event, setup.cardDb);
    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [setup.stage.instanceId] },
      setup.cardDb,
    );

    expect(resolved.pendingPrompt).toBeUndefined();
    expect(resolved.state.players[1].stage).toBeNull();
    expect(resolved.state.players[1].characters[0]?.instanceId).toBe(rosinante.instanceId);
    expect(resolved.events.some((event) => event.type === "CARD_KO")).toBe(true);
  });

  it("still offers a Character-default Rosinante replacement for a Character K.O.", () => {
    const characterKOSchema: EffectSchema = {
      card_id: "TEST-CHARACTER-KO",
      card_name: "Character K.O. Test Event",
      card_type: "Event",
      effects: [
        {
          id: "main_ko_character",
          category: "activate",
          trigger: { keyword: "MAIN_EVENT" },
          actions: [
            {
              type: "KO",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { up_to: 1 },
              },
            },
          ],
          flags: { optional: true },
        },
      ],
    };
    const setup = setupStageKO(characterKOSchema);
    const rosinanteData: CardData = {
      ...CARDS.VANILLA,
      id: OP05_030_DONQUIXOTE_ROSINANTE.card_id!,
      name: OP05_030_DONQUIXOTE_ROSINANTE.card_name!,
      effectSchema: OP05_030_DONQUIXOTE_ROSINANTE,
    };
    setup.cardDb.set(rosinanteData.id, rosinanteData);
    const rosinante: CardInstance = {
      instanceId: "rosinante-character-ko-protector",
      cardId: rosinanteData.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: setup.state.turn.number,
      controller: 1,
      owner: 1,
    };
    const target = {
      ...setup.state.players[1].characters.find((card) => card !== null)!,
      state: "RESTED" as const,
    };
    const characters = [...setup.state.players[1].characters];
    characters[0] = rosinante;
    characters[1] = target;
    let state = withPlayer(setup.state, 1, { characters });
    state = registerReplacementsForCard(state, rosinante, rosinanteData);

    const offered = offerStageTarget(state, setup.event, setup.cardDb);
    const replacementOffered = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
      setup.cardDb,
    );

    expect(replacementOffered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(replacementOffered.pendingPrompt?.resumeContext).toMatchObject({
      type: "REPLACEMENT_BATCH",
      event: "WOULD_BE_KO",
    });
    expect(
      replacementOffered.state.players[1].characters.some(
        (card) => card?.instanceId === target.instanceId,
      ),
    ).toBe(true);
  });

  it.each([
    [
      OP17_018_THE_POWER_TO_DESTROY_THE_WORLD,
      { card_type: "CHARACTER", base_power_min: 8000 },
    ],
    [OP17_116_FULGORA, { card_type: "CHARACTER", has_trigger: true }],
  ] as const)("authors the complete Main and Counter text for $card_id", (schema, counterFilter) => {
    expect(schema.effects).toHaveLength(2);
    expect(schema.effects[0]).toMatchObject({
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      costs: [{ type: "REST_DON", amount: 2 }],
      actions: [
        {
          type: "KO",
          target: {
            type: "STAGE",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
        },
      ],
      flags: { optional: true },
    });
    expect(schema.effects[1]).toMatchObject({
      category: "activate",
      trigger: { keyword: "COUNTER_EVENT" },
      conditions: {
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: counterFilter,
        count: { operator: ">=", value: 2 },
      },
      actions: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "SELF",
            count: { up_to: 1 },
          },
          params: { amount: 4000 },
          duration: { type: "THIS_BATTLE" },
        },
      ],
    });
    expect(
      schema.effects.some(
        (effect) => effect.trigger && "keyword" in effect.trigger && effect.trigger.keyword === "TRIGGER",
      ),
    ).toBe(false);
  });
});
