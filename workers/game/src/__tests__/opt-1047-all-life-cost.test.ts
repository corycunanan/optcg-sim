/**
 * OPT-1047 — "all of your Life cards" as a cost: LIFE_TO_HAND / TRASH_FROM_LIFE
 * with `all: true` (OP18-020 Stop Fighting!!!, OP18-117 Buster Call).
 * FAQ (qa_op18.md): at 0 Life the cost cannot be paid.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, LifeCard, PlayerState } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { payCosts, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { validateCost } from "../engine/schema-registry.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { OP18_020_STOP_FIGHTING } from "../engine/schemas/op18.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

const ALL_TO_HAND: Cost = { type: "LIFE_TO_HAND", all: true };
const ALL_TO_TRASH: Cost = { type: "TRASH_FROM_LIFE", all: true };

function lifeCard(i: number): LifeCard {
  return { instanceId: `life-0-${i}`, cardId: CARDS.VANILLA.id, face: "DOWN" };
}

function withLife(state: GameState, count: number, patch: Partial<PlayerState> = {}): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], life: Array.from({ length: count }, (_, i) => lifeCard(i)), ...patch };
  return { ...state, players };
}

describe("OPT-1047 — all-Life costs", () => {
  for (const cost of [ALL_TO_HAND, ALL_TO_TRASH]) {
    it(`${cost.type} all: moves every Life card and is unpayable at 0 Life`, () => {
      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const handBefore = base.players[0].hand.length;
      const trashBefore = base.players[0].trash.length;
      const three = withLife(base, 3);
      expect(isCostPayable(three, cost, 0, cardDb)).toBe(true);
      const paid = payCosts(three, [cost], 0, cardDb);
      expect(paid).not.toBeNull();
      const p0 = paid!.state.players[0];
      expect(p0.life).toHaveLength(0);
      if (cost.type === "LIFE_TO_HAND") expect(p0.hand).toHaveLength(handBefore + 3);
      else expect(p0.trash).toHaveLength(trashBefore + 3);
      expect(paid!.events.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")).toHaveLength(3);

      const none = withLife(base, 0);
      expect(isCostPayable(none, cost, 0, cardDb)).toBe(false);
      expect(payCosts(none, [cost], 0, cardDb)).toBeNull();
    });
  }

  it("the validator restricts `all` to Life costs without amount or TOP_OR_BOTTOM", () => {
    expect(validateCost(ALL_TO_HAND, "c", false)).toEqual([]);
    expect(validateCost({ type: "TRASH_FROM_HAND", all: true } as unknown as Cost, "c", false)).not.toEqual([]);
    expect(validateCost({ type: "LIFE_TO_HAND", all: true, amount: 2 } as Cost, "c", false)).not.toEqual([]);
    expect(validateCost({ type: "TRASH_FROM_LIFE", all: true, position: "TOP_OR_BOTTOM" } as Cost, "c", false)).not.toEqual([]);
  });
});

describe("OPT-1047 — OP18-020 Stop Fighting!!!", () => {
  const block = OP18_020_STOP_FIGHTING.effects[0] as EffectBlock;

  function setup(lifeCount: number, leaderName: string) {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const leaderId = base.players[0].leader.cardId;
    cardDb.set(leaderId, { ...cardDb.get(leaderId)!, name: leaderName });
    const target: CardInstance = { instanceId: "char-1-t", cardId: CARDS.VANILLA.id, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller: 1, owner: 1 };
    let state = withLife(base, lifeCount);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[1] = { ...players[1], characters: padChars([target]) };
    state = { ...state, players };
    return { cardDb, state, target };
  }

  function play(state: GameState, cardDb: Map<string, CardData>) {
    const offered = resolveEffect(state, block, "event-0-stop", 0, cardDb);
    if (offered.pendingPrompt?.options.promptType !== "OPTIONAL_EFFECT") return offered;
    return resumeFromStack(offered.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);
  }

  function power(state: GameState, cardDb: Map<string, CardData>, id: string) {
    const card = state.players[1].characters.find((c) => c?.instanceId === id)!;
    return getEffectivePower(card, cardDb.get(card.cardId)!, state, cardDb);
  }

  it("with a Vivi Leader: adds all Life to hand and gives −5000 to the opponent's Leader and Characters", () => {
    const { cardDb, state, target } = setup(2, "Nefeltari Vivi");
    const printed = cardDb.get(CARDS.VANILLA.id)!.power!;
    const done = play(state, cardDb);
    expect(done.state.players[0].life).toHaveLength(0);
    expect(power(done.state, cardDb, target.instanceId)).toBe(printed - 5000);
    const leader = done.state.players[1].leader;
    const leaderData = cardDb.get(leader.cardId)!;
    expect(getEffectivePower(leader, leaderData, done.state, cardDb)).toBe(leaderData.power! - 5000);
  });

  it("FAQ: at 0 Life the cost cannot be paid, so the −5000 does not happen", () => {
    const { cardDb, state, target } = setup(0, "Nefeltari Vivi");
    const printed = cardDb.get(CARDS.VANILLA.id)!.power!;
    const done = play(state, cardDb);
    expect(power(done.state, cardDb, target.instanceId)).toBe(printed);
  });

  it("without a Vivi Leader: the Life is still added, the −5000 does not happen", () => {
    const { cardDb, state, target } = setup(2, "Someone Else");
    const printed = cardDb.get(CARDS.VANILLA.id)!.power!;
    const done = play(state, cardDb);
    expect(done.state.players[0].life).toHaveLength(0);
    expect(power(done.state, cardDb, target.instanceId)).toBe(printed);
  });
});
