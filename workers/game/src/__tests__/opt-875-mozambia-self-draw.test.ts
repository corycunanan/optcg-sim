import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Canonical text: docs/cards/OP-05.md (OP05-053 Mozambia)
// "[Your Turn] [Once Per Turn] When you draw a card outside of your Draw Phase,
// this Character gains +2000 power during this turn."
// Producers: OP16-055 (own On Play draw 1), OP07-090 Morgans ("your opponent
// draws 1 card"), OP06-047 Charlotte Pudding ("your opponent draws 5 cards").

const BASE_POWER = 3000;

function fixture(owner: 0 | 1) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.turn.activePlayerIndex = owner;
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    });
  }
  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"]) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt875-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "HAND") p.hand.push(card);
    else if (zone === "DECK") p.deck.push(card);
    else if (zone === "CHARACTER") {
      p.characters[p.characters.findIndex((c) => !c)] = card;
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
    return card;
  }
  function act(action: GameAction) {
    const result = runPipeline(state, action, db, state.turn.activePlayerIndex);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function select(ids: string[]) {
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: ids },
      db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
    );
    expect(result.responseRejected, JSON.stringify(state.pendingPrompt)).toBe(false);
    state = result.state;
  }
  function power(card: CardInstance) {
    return getEffectivePower(card, db.get(card.cardId)!, state, db);
  }
  data("OP05-053", { cost: 4, power: BASE_POWER });
  const mozambia = put("OP05-053", owner, "CHARACTER");
  // Deck cards so draws succeed.
  data("filler");
  for (let i = 0; i < 8; i++) {
    put("filler", 0, "DECK");
    put("filler", 1, "DECK");
  }
  return { db, data, put, act, select, power, mozambia, get state() { return state; } };
}

describe("OPT-875 Mozambia only reacts to its controller's out-of-phase draws", () => {
  for (const owner of [0, 1] as const) {
    const opponent: 0 | 1 = owner === 0 ? 1 : 0;

    it(`controller ${owner}: own out-of-phase draw grants +2000 once per turn`, () => {
      const f = fixture(owner);
      expect(f.power(f.mozambia)).toBe(BASE_POWER);
      f.data("OP16-055", { cost: 1 });
      const first = f.put("OP16-055", owner, "HAND");
      const second = f.put("OP16-055", owner, "HAND");

      f.act({ type: "PLAY_CARD", cardInstanceId: first.instanceId });
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.power(f.mozambia)).toBe(BASE_POWER + 2000);

      // Second out-of-phase draw the same turn: Once Per Turn, no further boost.
      f.act({ type: "PLAY_CARD", cardInstanceId: second.instanceId });
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.power(f.mozambia)).toBe(BASE_POWER + 2000);
    });

    it(`controller ${owner}: opponent drawn via OP07-090 Morgans gives no boost`, () => {
      const f = fixture(owner);
      f.data("OP07-090", { cost: 3 });
      const morgans = f.put("OP07-090", owner, "HAND");
      f.data("opp-hand");
      const oppHand = Array.from({ length: 4 }, () => f.put("opp-hand", opponent, "HAND"));
      const oppHandBefore = f.state.players[opponent].hand.length;

      f.act({ type: "PLAY_CARD", cardInstanceId: morgans.instanceId });
      f.select([oppHand[1].instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      // Opponent really drew (trash 1, draw 1: hand size unchanged).
      expect(f.state.players[opponent].hand).toHaveLength(oppHandBefore);
      expect(f.state.eventLog.some((e) => e.type === "DRAW_OUTSIDE_DRAW_PHASE" && e.playerIndex === opponent)).toBe(true);
      expect(f.power(f.mozambia)).toBe(BASE_POWER);
    });

    it(`controller ${owner}: opponent drawn via OP06-047 Pudding gives no boost`, () => {
      const f = fixture(owner);
      f.data("OP06-047", { cost: 3 });
      const pudding = f.put("OP06-047", owner, "HAND");
      f.data("opp-hand");
      for (let i = 0; i < 3; i++) f.put("opp-hand", opponent, "HAND");

      f.act({ type: "PLAY_CARD", cardInstanceId: pudding.instanceId });
      if (f.state.pendingPrompt) f.select([]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[opponent].hand).toHaveLength(5);
      expect(f.state.eventLog.some((e) => e.type === "DRAW_OUTSIDE_DRAW_PHASE" && e.playerIndex === opponent)).toBe(true);
      expect(f.power(f.mozambia)).toBe(BASE_POWER);
    });
  }
});
