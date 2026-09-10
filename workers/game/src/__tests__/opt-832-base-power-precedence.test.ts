import { describe, expect, it } from "vitest";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  expireBattleEffects,
  expireEndOfTurnEffects,
} from "../engine/duration-tracker.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP17_043_GANZUI } from "../engine/schemas/op17.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

function fixture(controller: 0 | 1 = 0) {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  state.turn.activePlayerIndex = controller;
  const target = state.players[controller].leader;
  const data = { ...cardDb.get(target.cardId)!, power: 10000 };
  cardDb.set(data.id, data);
  const setter = (
    value: number,
    owner: 0 | 1 = controller
  ): RuntimeActiveEffect => ({
    id: `set-${value}-${owner}`,
    sourceCardInstanceId: state.players[owner].leader.instanceId,
    sourceEffectBlockId: "test-set",
    category: "auto",
    modifiers: [{ type: "SET_POWER", params: { value } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
    controller: owner,
    appliesTo: [target.instanceId],
    timestamp: value,
  });
  return { state, cardDb, target, data, setter };
}

// §4-9-2-1; OP17-008 p.1, OP17-043 p.3, ST34-004 p.1.
describe("OPT-832: highest applicable base-power setting", () => {
  for (const controller of [0, 1] as const) {
    for (const sameController of [true, false]) {
      for (const reverse of [false, true]) {
        it.each([
          [0, 6000],
          [6000, 7000],
          [7000, 8000],
          [6000, 8000],
        ])(
          `%i vs %i, controller ${controller}, same controller ${sameController}, reversed ${reverse}`,
          (low, high) => {
            const { state, cardDb, target, data, setter } = fixture(controller);
            const effects = [
              setter(low),
              setter(
                high,
                sameController ? controller : controller === 0 ? 1 : 0
              ),
            ];
            state.activeEffects = reverse ? effects.reverse() : effects;
            expect(getEffectivePower(target, data, state, cardDb)).toBe(high);
          }
        );
      }
    }
  }

  it("uses every applicable modifier in a block, excluding other targets and unmet conditions", () => {
    const { state, cardDb, target, data, setter } = fixture();
    const block = setter(6000);
    block.modifiers!.push({ type: "SET_POWER", params: { value: 8000 } });
    const excluded = setter(12000);
    excluded.appliesTo = ["other-target"];
    const inactive = setter(15000);
    inactive.conditions = {
      all_of: [{ type: "IS_MY_TURN", controller: "OPPONENT" }],
    };
    state.activeEffects = [block, excluded, inactive];
    expect(getEffectivePower(target, data, state, cardDb)).toBe(8000);
  });

  it("restores surviving settings after battle expiry, then printed power after turn expiry; buffs and DON remain additive", () => {
    const { state, cardDb, target, data, setter } = fixture();
    target.attachedDon = [
      {
        instanceId: "attached",
        state: "ACTIVE",
        attachedTo: target.instanceId,
      },
    ];
    const high = setter(8000);
    high.duration = { type: "THIS_BATTLE" };
    high.expiresAt = { wave: "END_OF_BATTLE", battleId: "battle" };
    const buff = setter(0);
    buff.id = "buff";
    buff.modifiers = [{ type: "MODIFY_POWER", params: { amount: -2000 } }];
    state.activeEffects = [high, setter(6000), buff];
    expect(getEffectivePower(target, data, state, cardDb)).toBe(7000);
    const afterBattle = expireBattleEffects(state, "battle");
    expect(getEffectivePower(target, data, afterBattle, cardDb)).toBe(5000);
    const afterTurn = expireEndOfTurnEffects(afterBattle);
    expect(getEffectivePower(target, data, afterTurn, cardDb)).toBe(11000);
    afterTurn.turn = { ...afterTurn.turn, activePlayerIndex: 1 };
    expect(getEffectivePower(target, data, afterTurn, cardDb)).toBe(10000);
  });

  it("ignores the higher permanent setter while its source is negated", () => {
    const { state, cardDb, target, data, setter } = fixture();
    const source = state.players[0].characters[0]!;
    const high = setter(12000);
    high.category = "permanent";
    high.sourceCardInstanceId = source.instanceId;
    const negation = setter(0);
    negation.id = "negation";
    negation.modifiers = [{ type: "NEGATE_EFFECTS_FLAG" }];
    negation.appliesTo = [source.instanceId];
    state.activeEffects = [setter(6000), high];
    expect(getEffectivePower(target, data, state, cardDb)).toBe(12000);
    state.activeEffects.push(negation);
    expect(getEffectivePower(target, data, state, cardDb)).toBe(6000);
  });

  it("a lone zero setter replaces a higher printed value, and off-field reads remain printed", () => {
    const { state, cardDb, target, data, setter } = fixture();
    state.activeEffects = [setter(0)];
    expect(getEffectivePower(target, data, state, cardDb)).toBe(0);
    expect(
      getEffectivePower({ ...target, zone: "TRASH" }, data, state, cardDb)
    ).toBe(10000);
  });

  it.each([0, 1] as const)(
    "Ganzui On Play retains a higher existing setting through the pipeline for player %i",
    (controller) => {
      const { state, cardDb, target, data, setter } = fixture(controller);
      const ganzui: typeof CARDS.VANILLA = {
        ...CARDS.VANILLA,
        id: "OP17-043",
        name: "Ganzui",
        cost: 5,
        power: 7000,
        color: ["Blue"],
        counter: null,
        attribute: ["Special"],
        types: ["Rocks Pirates"],
        effectText:
          "If this Character would be removed from the field, you may trash 2 cards from your hand instead.\n[On Play] Your Leader's base power becomes 6000 until the end of your opponent's next End Phase.",
        effectSchema: OP17_043_GANZUI,
      };
      cardDb.set(ganzui.id, ganzui);
      const handCard = {
        ...target,
        instanceId: "ganzui-hand",
        cardId: ganzui.id,
        zone: "HAND" as const,
        attachedDon: [],
      };
      state.players[controller].hand.push(handCard);
      state.activeEffects = [setter(7000)];
      const activeDonBefore = state.players[controller].donCostArea.filter(
        (don) => don.state === "ACTIVE"
      ).length;
      const result = runPipeline(
        state,
        { type: "PLAY_CARD", cardInstanceId: handCard.instanceId },
        cardDb,
        controller
      );
      expect(result.valid).toBe(true);
      expect(
        result.state.players[controller].donCostArea.filter(
          (don) => don.state === "ACTIVE"
        )
      ).toHaveLength(activeDonBefore - 5);
      expect(result.pendingPrompt).toBeUndefined();
      expect(
        result.state.players[controller].hand.some(
          (card) => card.instanceId === handCard.instanceId
        )
      ).toBe(false);
      expect(
        result.state.players[controller].characters.some(
          (card) => card?.cardId === ganzui.id
        )
      ).toBe(true);
      expect(
        result.state.activeEffects.some((effect) =>
          effect.modifiers?.some(
            (mod) => mod.type === "SET_POWER" && mod.params?.value === 6000
          )
        )
      ).toBe(true);
      expect(getEffectivePower(target, data, result.state, cardDb)).toBe(7000);
      const afterOwnEnd = expireEndOfTurnEffects(result.state);
      expect(getEffectivePower(target, data, afterOwnEnd, cardDb)).toBe(6000);
      afterOwnEnd.turn = {
        ...afterOwnEnd.turn,
        number: afterOwnEnd.turn.number + 1,
        activePlayerIndex: controller === 0 ? 1 : 0,
      };
      const afterOpponentEnd = expireEndOfTurnEffects(afterOwnEnd);
      expect(getEffectivePower(target, data, afterOpponentEnd, cardDb)).toBe(
        10000
      );
    }
  );
});
