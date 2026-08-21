import { describe, expect, it } from "vitest";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { executeAdvancePhase } from "../engine/phases.js";
import { runPipeline } from "../engine/pipeline.js";
import { EB02_015_JEWELRY_BONNEY } from "../engine/schemas/eb02.js";
import { EB03_055_NICO_ROBIN } from "../engine/schemas/eb03.js";
import { OP12_075_MS_ALL_SUNDAY } from "../engine/schemas/op12.js";
import {
  OP17_022_SHANKS,
  OP17_077_KUNDALI_DRAGON_SWARM,
} from "../engine/schemas/op17.js";
import { P_010_KAIDO } from "../engine/schemas/p.js";
import type { GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function withPlayer(state: GameState, patch: Partial<PlayerState>): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], ...patch };
  return { ...state, players };
}

function actionFrom(
  schema: EffectSchema,
  effectId: string,
  actionType: Action["type"]
): Action {
  const block = schema.effects.find((effect) => effect.id === effectId);
  const action = block?.actions?.find(
    (candidate) => candidate.type === actionType
  );
  if (!action) throw new Error(`Missing ${actionType} on ${schema.card_id}`);
  return action;
}

function chooseAmount(state: GameState, action: Action | Action[], amount: number) {
  const cardDb = createTestCardDb();
  const sourceId = state.players[0].leader.instanceId;
  const sourceData = cardDb.get(state.players[0].leader.cardId)!;
  cardDb.set(sourceData.id, {
    ...sourceData,
    effectSchema: {
      card_id: sourceData.id,
      card_name: sourceData.name,
      effects: [{
        id: "opt-731-test",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: Array.isArray(action) ? action : [action],
      }],
    },
  });
  const offered = runPipeline(
    state,
    { type: "ACTIVATE_EFFECT", cardInstanceId: sourceId, effectId: "opt-731-test" },
    cardDb,
    0
  );

  expect(offered.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  if (offered.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
    throw new Error("Expected an amount prompt");
  }
  expect(offered.pendingPrompt.respondingPlayer).toBe(0);
  expect(
    offered.pendingPrompt.options.choices.map((choice) => choice.id)
  ).toContain(`choose-value:${amount}`);

  return resumeFromStack(
    offered.state,
    { type: "PLAYER_CHOICE", choiceId: `choose-value:${amount}` },
    cardDb
  );
}

describe("OPT-731 choose-fewer resource action contract", () => {
  for (const amount of [2, 0]) {
    it(`OP17-077 adds ${amount} of its up-to-3 DON!! cards`, () => {
      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const state = withPlayer(base, {
        donCostArea: [],
        donDeck: [...base.players[0].donCostArea, ...base.players[0].donDeck],
      });
      const action = actionFrom(
        OP17_077_KUNDALI_DRAGON_SWARM,
        "main_add_don",
        "ADD_DON_FROM_DECK"
      );

      const result = chooseAmount(state, action, amount);

      expect(result.state.players[0].donCostArea).toHaveLength(amount);
      expect(result.state.players[0].donDeck).toHaveLength(
        state.players[0].donDeck.length - amount
      );
      expect(result.events).toHaveLength(amount === 0 ? 0 : 1);
      if (amount > 0) {
        expect(result.events[0]).toMatchObject({
          type: "DON_PLACED_ON_FIELD",
          playerIndex: 0,
          payload: { count: amount },
        });
      }
    });
  }

  it("continues a THEN chain after the controller legally chooses zero", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const state = withPlayer(base, {
      donCostArea: [],
      donDeck: [...base.players[0].donCostArea, ...base.players[0].donDeck],
    });
    const handBefore = state.players[0].hand.length;
    const action = actionFrom(
      OP17_077_KUNDALI_DRAGON_SWARM,
      "main_add_don",
      "ADD_DON_FROM_DECK"
    );

    const result = chooseAmount(
      state,
      [action, { type: "DRAW", params: { amount: 1 }, chain: "THEN" }],
      0
    );

    expect(result.state.players[0].donCostArea).toHaveLength(0);
    expect(result.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  for (const amount of [1, 0]) {
    it(`EB03-055 adds ${amount} of its up-to-2 Life cards`, () => {
      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const state = withPlayer(base, { life: [] });
      const action = actionFrom(
        EB03_055_NICO_ROBIN,
        "on_play_trash_life_add",
        "ADD_TO_LIFE_FROM_DECK"
      );

      const result = chooseAmount(state, action, amount);

      expect(result.state.players[0].life).toHaveLength(amount);
      expect(result.state.players[0].deck).toHaveLength(
        state.players[0].deck.length - amount
      );
      expect(result.events).toEqual([]);
    });
  }

  for (const amount of [1, 0]) {
    it(`OP17-022 activates ${amount} of its up-to-2 DON!! cards`, () => {
      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const state = withPlayer(base, {
        donCostArea: base.players[0].donCostArea.map((don) => ({
          ...don,
          state: "RESTED" as const,
        })),
      });
      const action = actionFrom(
        OP17_022_SHANKS,
        "on_play_active_then_rest_all",
        "SET_DON_ACTIVE"
      );

      const result = chooseAmount(state, action, amount);

      expect(
        result.state.players[0].donCostArea.filter(
          (don) => don.state === "ACTIVE"
        )
      ).toHaveLength(amount);
      expect(result.events).toHaveLength(amount === 0 ? 0 : 1);
      if (amount > 0) {
        expect(result.events[0]).toMatchObject({
          type: "DON_SET_ACTIVE",
          playerIndex: 0,
          payload: { count: amount },
        });
      }
    });
  }

  it("P-010 preserves mandatory ADD_DON_FROM_DECK auto-maximum behavior", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const returnedDon = base.players[0].donCostArea.at(-1)!;
    const state = withPlayer(base, {
      donCostArea: base.players[0].donCostArea.slice(0, -1),
      donDeck: [returnedDon, ...base.players[0].donDeck],
    });
    const action = actionFrom(
      P_010_KAIDO,
      "eot_add_don_active",
      "ADD_DON_FROM_DECK"
    );

    const result = resolveEffect(
      state,
      { id: "opt-731-mandatory", category: "auto", actions: [action] },
      state.players[0].leader.instanceId,
      0,
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donDeck).toHaveLength(
      state.players[0].donDeck.length - 1
    );
    expect(result.state.players[0].donCostArea).toHaveLength(
      state.players[0].donCostArea.length + 1
    );
  });

  it("surfaces EB02-015's scheduled up-to prompt without handing off the turn", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const scheduled = actionFrom(
      EB02_015_JEWELRY_BONNEY,
      "on_play_prohibit_refresh_schedule_don",
      "SCHEDULE_ACTION"
    );
    if (scheduled.type !== "SCHEDULE_ACTION") {
      throw new Error("Expected EB02-015 to schedule an action");
    }
    const scheduledAction = scheduled.params?.action;
    if (!scheduledAction) {
      throw new Error("Expected EB02-015's scheduled action");
    }
    const state = withPlayer(
      {
        ...base,
        scheduledActions: [{
          id: "opt-731-scheduled",
          timing: "END_OF_THIS_TURN",
          action: scheduledAction,
          boundToInstanceId: null,
          sourceEffectId: base.players[0].leader.instanceId,
          controller: 0,
        }],
      },
      {
        donCostArea: base.players[0].donCostArea.map((don, index) => ({
          ...don,
          state: index === 0 ? "RESTED" as const : don.state,
        })),
      }
    );

    const result = executeAdvancePhase(state, cardDb);

    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(result.state.effectStack).toHaveLength(2);
    expect(result.state.scheduledActions).toEqual([]);
    expect(result.state.players[0].donCostArea[0]?.state).toBe("RESTED");
    expect(result.state.turn).toMatchObject({
      activePlayerIndex: 0,
      phase: "END",
    });
  });

  it("lets the opponent choose 0..1 for OP12-075's nested DON!! action", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const opponentAction = actionFrom(
      OP12_075_MS_ALL_SUNDAY,
      "OP12-075_on_play",
      "OPPONENT_ACTION"
    );
    const opponentDonBefore = state.players[1].donCostArea.length;
    const offered = resolveEffect(
      state,
      { id: "opt-731-opponent", category: "auto", actions: [opponentAction] },
      state.players[0].leader.instanceId,
      0,
      cardDb
    );

    expect(offered.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(offered.pendingPrompt?.respondingPlayer).toBe(1);
    if (offered.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected OP12-075 to offer the opponent an amount prompt");
    }
    expect(offered.pendingPrompt.options.choices.map((choice) => choice.id)).toEqual([
      "choose-value:0",
      "choose-value:1",
    ]);

    const declined = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:0" },
      cardDb
    );
    expect(declined.resolved).toBe(true);
    expect(declined.state.players[1].donCostArea).toHaveLength(opponentDonBefore);
    expect(declined.state.effectStack).toEqual([]);

    const accepted = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:1" },
      cardDb
    );
    expect(accepted.resolved).toBe(true);
    expect(accepted.state.players[1].donCostArea).toHaveLength(opponentDonBefore + 1);
    expect(accepted.state.effectStack).toEqual([]);
  });
});
