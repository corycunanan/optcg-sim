import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  PlayerState,
} from "../types.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import {
  OP09_105_SANJI,
  OP09_111_BROOK,
} from "../engine/schemas/op09.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";

function triggerBlock(schema: EffectSchema): EffectBlock {
  const block = schema.effects.find(
    (candidate) =>
      candidate.trigger &&
      "keyword" in candidate.trigger &&
      candidate.trigger.keyword === "TRIGGER"
  );
  if (!block) throw new Error(`Missing TRIGGER block for ${schema.card_id}`);
  return block;
}

function handCard(owner: 0 | 1, index: number): CardInstance {
  return {
    instanceId: `review-hand-${owner}-${index}`,
    cardId: CARDS.VANILLA.id,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

function withEggheadLeader(cardDb: Map<string, CardData>): void {
  cardDb.set(CARDS.LEADER.id, {
    ...cardDb.get(CARDS.LEADER.id)!,
    types: ["Egghead"],
  });
}

function withHands(
  state: ReturnType<typeof createBattleReadyState>,
  playerZeroHand: CardInstance[],
  playerOneHand: CardInstance[]
): ReturnType<typeof createBattleReadyState> {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], hand: playerZeroHand };
  players[1] = { ...players[1], hand: playerOneHand };
  return { ...state, players };
}

describe("OPT-590 adversarial review regressions", () => {
  it("lets OP09-105 add zero cards while still trashing two from hand", () => {
    const cardDb = createTestCardDb();
    withEggheadLeader(cardDb);
    const state = withHands(
      createBattleReadyState(cardDb),
      [handCard(0, 0), handCard(0, 1)],
      []
    );
    const deckBefore = state.players[0].deck.length;
    const lifeBefore = state.players[0].life.length;
    const trashBefore = state.players[0].trash.length;

    const offered = resolveEffect(
      state,
      triggerBlock(OP09_105_SANJI),
      state.players[0].leader.instanceId,
      0,
      cardDb
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(offered.pendingPrompt?.respondingPlayer).toBe(0);

    const declined = resumeFromStack(
      { ...offered.state, pendingPrompt: null },
      { type: "PLAYER_CHOICE", choiceId: "1" },
      cardDb
    );

    expect(declined.resolved).toBe(true);
    expect(declined.pendingPrompt).toBeUndefined();
    expect(declined.state.players[0].deck).toHaveLength(deckBefore);
    expect(declined.state.players[0].life).toHaveLength(lifeBefore);
    expect(declined.state.players[0].hand).toHaveLength(0);
    expect(declined.state.players[0].trash).toHaveLength(trashBefore + 2);
  });

  it("makes the OP09-111 opponent trash their hand, not the Trigger owner", () => {
    const cardDb = createTestCardDb();
    withEggheadLeader(cardDb);
    const ownerHand = [handCard(0, 0), handCard(0, 1)];
    const opponentHand = Array.from({ length: 6 }, (_, index) =>
      handCard(1, index)
    );
    const state = withHands(
      createBattleReadyState(cardDb),
      ownerHand,
      opponentHand
    );
    const opponentTrashBefore = state.players[1].trash.length;

    const offered = resolveEffect(
      state,
      triggerBlock(OP09_111_BROOK),
      state.players[0].leader.instanceId,
      0,
      cardDb
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(offered.pendingPrompt?.respondingPlayer).toBe(1);
    if (offered.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected opponent hand-selection prompt");
    }
    expect(offered.pendingPrompt.options.validTargets).toEqual(
      opponentHand.map((card) => card.instanceId)
    );

    const resolved = resumeFromStack(
      { ...offered.state, pendingPrompt: null },
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: opponentHand
          .slice(0, 2)
          .map((card) => card.instanceId),
      } as GameAction,
      cardDb
    );

    expect(resolved.resolved).toBe(true);
    expect(resolved.state.players[0].hand.map((card) => card.instanceId)).toEqual(
      ownerHand.map((card) => card.instanceId)
    );
    expect(resolved.state.players[1].hand).toHaveLength(4);
    expect(resolved.state.players[1].trash).toHaveLength(
      opponentTrashBefore + 2
    );
  });
});
