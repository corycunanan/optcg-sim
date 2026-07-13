import { describe, expect, it } from "vitest";
import type { Action, EffectBlock, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, LifeCard, PlayerState } from "../types.js";
import {
  CHOSEN_COST_REVEAL_CARD_IDS,
  CONDITIONAL_REVEAL_CARD_IDS,
} from "../engine/conditional-reveal-contract.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { getAllAuthoredSchemas, validateEffectSchema } from "../engine/schema-registry.js";
import { filterEventForPlayer } from "../engine/visibility.js";
import { createBattleReadyState, createTestCardDb, CARDS, padChars } from "./helpers.js";

function walkActions(actions: Action[] | undefined): Action[] {
  const found: Action[] = [];
  const visit = (list: Action[] | undefined): void => {
    for (const action of list ?? []) {
      found.push(action);
      const options = action.params?.options;
      if (Array.isArray(options)) {
        for (const option of options) {
          if (Array.isArray(option)) visit(option as Action[]);
        }
      }
      const nested = action.params?.action;
      if (nested && typeof nested === "object") visit([nested as Action]);
    }
  };
  visit(actions);
  return found;
}

function revealBlock(schema: EffectSchema): EffectBlock {
  const block = schema.effects.find((candidate) =>
    walkActions(candidate.actions).some((action) => action.type === "REVEAL"));
  if (!block) throw new Error(`No conditional reveal block for ${schema.card_id}`);
  return block;
}

function withSource(
  state: GameState,
  cardDb: Map<string, CardData>,
  schema: EffectSchema,
): { state: GameState; source: CardInstance } {
  const cardId = schema.card_id!;
  cardDb.set(cardId, {
    ...CARDS.VANILLA,
    id: cardId,
    name: schema.card_name ?? cardId,
    effectText: "Conditional reveal test effect",
    effectSchema: schema,
  });
  const source: CardInstance = {
    ...state.players[0].characters[0]!,
    instanceId: `source-${cardId}`,
    cardId,
    zone: "CHARACTER",
    controller: 0,
    owner: 0,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([source, ...players[0].characters.slice(1).filter(Boolean) as CardInstance[]]),
  };
  return { state: { ...state, players }, source };
}

function setDeckTop(
  state: GameState,
  playerIndex: 0 | 1,
  card: CardInstance,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = {
    ...players[playerIndex],
    deck: [card, ...players[playerIndex].deck.filter((entry) => entry.instanceId !== card.instanceId)],
  };
  return { ...state, players };
}

describe("OPT-475 conditional reveal closure", () => {
  it("machine-checks all 20 reconciled cards as registered, valid schemas", () => {
    const schemas = getAllAuthoredSchemas();
    expect(CONDITIONAL_REVEAL_CARD_IDS).toHaveLength(20);
    expect(new Set(CONDITIONAL_REVEAL_CARD_IDS).size).toBe(20);

    for (const cardId of CONDITIONAL_REVEAL_CARD_IDS) {
      const schema = schemas[cardId];
      expect(schema, cardId).toBeDefined();
      expect(validateEffectSchema(schema, cardId), cardId).toEqual([]);
      const actions = walkActions(revealBlock(schema).actions);
      expect(actions.some((action) => action.type === "REVEAL" && action.result_ref), cardId).toBe(true);
      expect(actions.some((action) =>
        JSON.stringify(action.conditions ?? {}).includes("REVEALED_CARD_PROPERTY")), cardId).toBe(true);
    }
  });

  it("requires every chosen-cost card to produce and consume typed result refs", () => {
    const schemas = getAllAuthoredSchemas();
    for (const cardId of CHOSEN_COST_REVEAL_CARD_IDS) {
      const actions = walkActions(revealBlock(schemas[cardId]).actions);
      const choose = actions.find((action) => action.type === "CHOOSE_VALUE");
      expect(choose?.result_ref, cardId).toBe("chosen_cost");
      expect(JSON.stringify(actions), cardId).toContain('"type":"CHOSEN_VALUE","ref":"chosen_cost"');
    }
  });

  it("runs every card through the real action-chain continuation path", () => {
    const schemas = getAllAuthoredSchemas();
    for (const cardId of CONDITIONAL_REVEAL_CARD_IDS) {
      const cardDb = createTestCardDb();
      const seeded = withSource(createBattleReadyState(cardDb), cardDb, schemas[cardId]);
      const result = executeActionChain(
        seeded.state,
        revealBlock(schemas[cardId]).actions!,
        seeded.source.instanceId,
        0,
        cardDb,
      );

      if (CHOSEN_COST_REVEAL_CARD_IDS.includes(cardId as typeof CHOSEN_COST_REVEAL_CARD_IDS[number])) {
        expect(result.pendingPrompt?.options.promptType, cardId).toBe("PLAYER_CHOICE");
        const resumed = resumeFromStack(
          result.state,
          { type: "PLAYER_CHOICE", choiceId: "choose-value:3" },
          cardDb,
        );
        expect(resumed.events.some((event) => event.type === "CARDS_REVEALED"), cardId).toBe(true);
      } else {
        expect(result.events.some((event) => event.type === "CARDS_REVEALED"), cardId).toBe(true);
      }
    }
  });

  it("stores CHOOSE_VALUE across resume and gates the reveal branch by the chosen cost", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const revealedData: CardData = { ...CARDS.VANILLA, id: "REVEALED-COST-4", cost: 4 };
    cardDb.set(revealedData.id, revealedData);
    const revealed: CardInstance = {
      ...base.players[1].deck[0],
      instanceId: "revealed-cost-4",
      cardId: revealedData.id,
      zone: "DECK",
      controller: 1,
      owner: 1,
    };
    const state = setDeckTop(base, 1, revealed);
    const handBefore = state.players[0].hand.length;
    const actions: Action[] = [
      { type: "CHOOSE_VALUE", params: { domain: "COST" }, result_ref: "chosen" },
      {
        type: "REVEAL",
        target: { type: "CARD_ON_TOP_OF_DECK", controller: "OPPONENT" },
        params: { amount: 1, source: "DECK_TOP" },
        result_ref: "revealed",
        chain: "THEN",
      },
      {
        type: "DRAW",
        params: { amount: 1 },
        chain: "THEN",
        conditions: {
          type: "REVEALED_CARD_PROPERTY",
          result_ref: "revealed",
          compare: {
            property: "COST",
            operator: "==",
            value: { type: "CHOSEN_VALUE", ref: "chosen" },
          },
        },
      },
    ];

    const prompted = executeActionChain(state, actions, state.players[0].leader.instanceId, 0, cardDb);
    expect(prompted.pendingPrompt?.options).toMatchObject({
      promptType: "PLAYER_CHOICE",
      choices: expect.arrayContaining([{ id: "choose-value:4", label: "4" }]),
    });
    const matched = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:4" },
      cardDb,
    );
    expect(matched.state.players[0].hand).toHaveLength(handBefore + 1);

    const promptedMismatch = executeActionChain(state, actions, state.players[0].leader.instanceId, 0, cardDb);
    const mismatched = resumeFromStack(
      promptedMismatch.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:3" },
      cardDb,
    );
    expect(mismatched.state.players[0].hand).toHaveLength(handBefore);
  });

  it("rejects a stale numeric choice that the prompt did not offer", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const prompted = executeActionChain(
      state,
      [{ type: "CHOOSE_VALUE", params: { domain: "COST" }, result_ref: "chosen" }],
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    const rejected = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:99" },
      cardDb,
    );
    expect(rejected).toMatchObject({ resolved: false, rejected: true });
  });

  it("preserves revealed-card identity when the player places it at deck bottom", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    let seeded = withSource(createBattleReadyState(cardDb), cardDb, schemas["OP08-049"]);
    const revealedData: CardData = {
      ...CARDS.VANILLA,
      id: "WHITEBEARD-TOP",
      types: ["Whitebeard Pirates"],
    };
    cardDb.set(revealedData.id, revealedData);
    const revealed: CardInstance = {
      ...seeded.state.players[0].deck[0],
      instanceId: "whitebeard-top",
      cardId: revealedData.id,
      zone: "DECK",
      controller: 0,
      owner: 0,
    };
    seeded = { ...seeded, state: setDeckTop(seeded.state, 0, revealed) };

    const result = resolveEffect(
      seeded.state,
      revealBlock(schemas["OP08-049"]),
      seeded.source.instanceId,
      0,
      cardDb,
    );
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    const bottomed = resumeFromStack(
      result.state,
      { type: "PLAYER_CHOICE", choiceId: "1" },
      cardDb,
    );
    expect(bottomed.state.players[0].deck.at(-1)?.instanceId).toBe(revealed.instanceId);
    expect(bottomed.state.activeEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceCardInstanceId: seeded.source.instanceId,
        modifiers: expect.arrayContaining([
          expect.objectContaining({ type: "GRANT_KEYWORD", params: { keyword: "RUSH" } }),
        ]),
      }),
    ]));
  });

  it("lets OP07-048 decline the optional play and bottoms the revealed card", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    let seeded = withSource(createBattleReadyState(cardDb), cardDb, schemas["OP07-048"]);
    const revealedData: CardData = {
      ...CARDS.VANILLA,
      id: "WARLORD-TOP",
      cost: 4,
      types: ["The Seven Warlords of the Sea"],
    };
    cardDb.set(revealedData.id, revealedData);
    const revealed: CardInstance = {
      ...seeded.state.players[0].deck[0],
      instanceId: "warlord-top",
      cardId: revealedData.id,
      zone: "DECK",
      controller: 0,
      owner: 0,
    };
    seeded = { ...seeded, state: setDeckTop(seeded.state, 0, revealed) };

    const result = resolveEffect(
      seeded.state,
      revealBlock(schemas["OP07-048"]),
      seeded.source.instanceId,
      0,
      cardDb,
    );
    expect(result.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      countMin: 0,
      countMax: 1,
    });
    const declined = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb,
    );
    expect(declined.state.players[0].deck.at(-1)?.instanceId).toBe(revealed.instanceId);
  });

  it("does not run an IF_DO continuation when a revealed-card play is declined", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const revealedData: CardData = {
      ...CARDS.VANILLA,
      id: "SABO-COST-5",
      name: "Sabo",
      cost: 5,
    };
    cardDb.set(revealedData.id, revealedData);
    const revealed: LifeCard = {
      instanceId: "sabo-cost-5",
      cardId: revealedData.id,
      face: "DOWN",
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      life: [revealed, ...players[0].life.slice(1)],
    };
    const seeded = { ...state, players };

    const result = executeActionChain(
      seeded,
      revealBlock(schemas["ST13-007"]).actions!,
      seeded.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(result.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      countMin: 0,
      countMax: 1,
    });

    const declined = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb,
    );
    expect(declined.state.players[0].life[0]?.instanceId).toBe(revealed.instanceId);
    expect(declined.state.activeEffects).toEqual([]);
  });

  it("runs an IF_DO continuation after accepting a qualifying Life reveal", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const revealedData: CardData = {
      ...CARDS.VANILLA,
      id: "ACE-COST-5",
      name: "Portgas.D.Ace",
      cost: 5,
    };
    cardDb.set(revealedData.id, revealedData);
    const revealed: LifeCard = {
      instanceId: "ace-cost-5",
      cardId: revealedData.id,
      face: "DOWN",
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], life: [revealed, ...players[0].life.slice(1)] };
    const seeded = { ...state, players };

    const result = executeActionChain(
      seeded,
      revealBlock(schemas["ST13-010"]).actions!,
      seeded.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const accepted = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [revealed.instanceId] },
      cardDb,
    );
    expect(accepted.state.players[0].life.some((card) => card.instanceId === revealed.instanceId)).toBe(false);
    expect(accepted.state.players[0].characters.some((card) => card?.cardId === revealed.cardId)).toBe(true);
    expect(accepted.state.activeEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ appliesTo: [seeded.players[0].leader.instanceId] }),
    ]));
  });

  it("does not run draw/trash tails when the revealed trait misses", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    let seeded = withSource(createBattleReadyState(cardDb), cardDb, schemas["OP14-044"]);
    const miss: CardInstance = {
      ...seeded.state.players[0].deck[0],
      instanceId: "non-whitebeard-top",
      cardId: CARDS.VANILLA.id,
      zone: "DECK",
      controller: 0,
      owner: 0,
    };
    seeded = { ...seeded, state: setDeckTop(seeded.state, 0, miss) };
    const handBefore = seeded.state.players[0].hand.map((card) => card.instanceId);

    const result = resolveEffect(
      seeded.state,
      revealBlock(schemas["OP14-044"]),
      seeded.source.instanceId,
      0,
      cardDb,
    );
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand.map((card) => card.instanceId)).toEqual(handBefore);
  });

  it("keeps the reveal predicate stable after drawing the revealed card", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    let seeded = withSource(createBattleReadyState(cardDb), cardDb, schemas["OP14-044"]);
    const matchData: CardData = {
      ...CARDS.VANILLA,
      id: "WHITEBEARD-MATCH",
      types: ["Whitebeard Pirates"],
    };
    cardDb.set(matchData.id, matchData);
    const match: CardInstance = {
      ...seeded.state.players[0].deck[0],
      instanceId: "whitebeard-match",
      cardId: matchData.id,
      zone: "DECK",
      controller: 0,
      owner: 0,
    };
    seeded = { ...seeded, state: setDeckTop(seeded.state, 0, match) };
    const handBefore = seeded.state.players[0].hand.length;
    const trashBefore = seeded.state.players[0].trash.length;

    const result = resolveEffect(
      seeded.state,
      revealBlock(schemas["OP14-044"]),
      seeded.source.instanceId,
      0,
      cardDb,
    );
    const prompt = result.pendingPrompt;
    expect(prompt?.options.promptType).toBe("SELECT_TARGET");
    if (!prompt || prompt.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the matched trash action to prompt for a hand card");
    }
    const selected = prompt.options.validTargets[0];
    expect(selected).toBeDefined();
    const completed = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [selected!] },
      cardDb,
    );
    expect(completed.state.players[0].hand).toHaveLength(handBefore + 1);
    expect(completed.state.players[0].trash).toHaveLength(trashBefore + 1);
  });

  it("runs a matched reveal-to-DON branch with the printed rested state", () => {
    const schemas = getAllAuthoredSchemas();
    const cardDb = createTestCardDb();
    let seeded = withSource(createBattleReadyState(cardDb), cardDb, schemas["OP15-065"]);
    const matchData: CardData = { ...CARDS.VANILLA, id: "COST-TWO-MATCH", cost: 2 };
    cardDb.set(matchData.id, matchData);
    const match: CardInstance = {
      ...seeded.state.players[0].deck[0],
      instanceId: "cost-two-match",
      cardId: matchData.id,
      zone: "DECK",
      controller: 0,
      owner: 0,
    };
    seeded = { ...seeded, state: setDeckTop(seeded.state, 0, match) };
    const donDeckBefore = seeded.state.players[0].donDeck.length;
    const costAreaBefore = seeded.state.players[0].donCostArea.length;

    const result = resolveEffect(
      seeded.state,
      revealBlock(schemas["OP15-065"]),
      seeded.source.instanceId,
      0,
      cardDb,
    );
    expect(result.state.players[0].donDeck).toHaveLength(donDeckBefore - 1);
    expect(result.state.players[0].donCostArea).toHaveLength(costAreaBefore + 1);
    expect(result.state.players[0].donCostArea.at(-1)?.state).toBe("RESTED");
  });

  it("keeps deck and Life reveals public to both players", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    for (const action of [
      { type: "REVEAL", params: { amount: 1, source: "DECK_TOP" } },
      { type: "REVEAL", target: { controller: "OPPONENT" }, params: { amount: 1, source: "DECK_TOP" } },
      { type: "REVEAL", params: { amount: 1, source: "LIFE_TOP" } },
    ] satisfies Action[]) {
      const result = executeActionChain(
        state,
        [action],
        state.players[0].leader.instanceId,
        0,
        cardDb,
      );
      const event = result.events.find((candidate) => candidate.type === "CARDS_REVEALED")!;
      const stamped = { ...event, timestamp: Date.now() } as Parameters<typeof filterEventForPlayer>[0];
      expect(filterEventForPlayer(stamped, 0)).toEqual(stamped);
      expect(filterEventForPlayer(stamped, 1)).toEqual(stamped);
    }
  });
});
