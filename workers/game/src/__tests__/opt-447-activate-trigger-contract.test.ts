import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import {
  getAllAuthoredSchemas,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import {
  OP07_048_DONQUIXOTE_DOFLAMINGO,
} from "../engine/schemas/op07.js";
import {
  OP12_058_I_WILL_MAKE_WHITEBEARD_THE_KING,
} from "../engine/schemas/op12.js";
import {
  ST13_007_SABO_COST2,
  ST13_010_PORTGAS_D_ACE_COST2,
  ST13_014_MONKEY_D_LUFFY_COST2,
} from "../engine/schemas/st13.js";
import { ST22_007_SQUARD } from "../engine/schemas/st22.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const CHARACTER_SCHEMAS = [
  OP07_048_DONQUIXOTE_DOFLAMINGO,
  ST13_007_SABO_COST2,
  ST13_010_PORTGAS_D_ACE_COST2,
  ST13_014_MONKEY_D_LUFFY_COST2,
  ST22_007_SQUARD,
] as const;

function schemaCard(schema: EffectSchema, overrides: Partial<CardData> = {}): CardData {
  return {
    ...CARDS.VANILLA,
    id: schema.card_id!,
    name: schema.card_name!,
    effectSchema: schema,
    ...overrides,
  };
}

function sourceInstance(cardId: string): CardInstance {
  return {
    instanceId: `source-${cardId}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function withPlayer(state: GameState, patch: Partial<PlayerState>): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], ...patch };
  return { ...state, players };
}

describe("OPT-447 activate trigger contract", () => {
  it("assigns the production trigger keyword for every affected schema", () => {
    for (const schema of CHARACTER_SCHEMAS) {
      expect(schema.effects[0].trigger).toEqual({ keyword: "ACTIVATE_MAIN" });
    }
    expect(OP12_058_I_WILL_MAKE_WHITEBEARD_THE_KING.effects[0].trigger).toEqual({
      keyword: "MAIN_EVENT",
    });
  });

  it("registers and executes every affected Character activation", () => {
    for (const schema of CHARACTER_SCHEMAS) {
      const card = schemaCard(schema);
      const cardDb = createTestCardDb();
      cardDb.set(card.id, card);

      const source = sourceInstance(card.id);
      const state = withPlayer(createBattleReadyState(cardDb), {
        characters: padChars([source]),
      });

      const registered = registerTriggersForCard(state, source, card);
      expect(registered.triggerRegistry).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceCardInstanceId: source.instanceId,
            effectBlockId: schema.effects[0].id,
            trigger: { keyword: "ACTIVATE_MAIN" },
          }),
        ]),
      );

      const result = runPipeline(
        state,
        {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: source.instanceId,
          effectId: schema.effects[0].id,
        },
        cardDb,
        0,
      );

      expect(result.valid).toBe(true);
      const reachedResolver = Boolean(result.pendingPrompt) ||
        result.state.eventLog.some((event) => event.type === "CARDS_REVEALED");
      expect(reachedResolver).toBe(true);
    }
  });

  it("executes OP12-058 through the Event Main path", () => {
    const cardDb = createTestCardDb();
    cardDb.set(CARDS.LEADER.id, {
      ...CARDS.LEADER,
      types: ["Whitebeard Pirates"],
    });

    const event = schemaCard(OP12_058_I_WILL_MAKE_WHITEBEARD_THE_KING, {
      type: "Event",
      cost: 0,
      power: null,
      effectText: "[Main] Reveal 1 card from the top of your deck.",
    });
    cardDb.set(event.id, event);

    const eventInstance: CardInstance = {
      instanceId: "event-op12-058",
      cardId: event.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const state = withPlayer(createBattleReadyState(cardDb), {
      hand: [eventInstance],
    });

    const result = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: eventInstance.instanceId },
      cardDb,
      0,
    );

    expect(result.valid).toBe(true);
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "CARDS_REVEALED" })]),
    );
  });

  it("reports no missing triggers across authored activate blocks", () => {
    const failures: string[] = [];

    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      failures.push(
        ...validateEffectSchema(schema, cardId).filter((error) =>
          error.includes("'activate' block missing 'trigger'"),
        ),
      );
    }

    expect(failures).toEqual([]);
  });
});
