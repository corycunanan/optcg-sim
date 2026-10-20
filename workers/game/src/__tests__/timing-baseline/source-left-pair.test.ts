/**
 * Timing baseline F9 / F10 (OPT-939 fixtures, README §2).
 *
 * F9:  Rule 8-1-3-1-3 (line 710), 8-6-1 (line 858); FAQ qa_op04.md:107-109 (OP04-024 Sugar).
 * F10: Rule 8-2-3 (line 774); FAQ qa_op04.md:113-115 (OP04-026 Senor Pink).
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../../types.js";
import type { EffectSchema } from "../../engine/effect-types.js";
import { runPipeline } from "../../engine/pipeline.js";
import { registerCardEnteredField } from "../../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

interface Built {
  state: GameState;
  cardDb: Map<string, CardData>;
}

function synCard(id: string, schema: EffectSchema, overrides: Partial<CardData> = {}): CardData {
  return { ...CARDS.VANILLA, id, name: id, effectSchema: schema, ...overrides };
}

function schema(id: string, effects: EffectSchema["effects"]): EffectSchema {
  return { card_id: id, card_name: id, card_type: "Character", effects };
}

let serial = 0;
function inst(cardId: string, controller: 0 | 1, zone: CardInstance["zone"], state: CardInstance["state"] = "ACTIVE"): CardInstance {
  return { instanceId: `${cardId}#${serial++}`, cardId, zone, state, attachedDon: [], turnPlayed: 1, controller, owner: controller };
}

function base(cards: CardData[]): Built {
  const cardDb = new Map(createTestCardDb());
  for (const c of cards) cardDb.set(c.id, c);
  const state = createBattleReadyState(cardDb);
  const strip = (p: GameState["players"][0]): GameState["players"][0] => ({
    ...p,
    characters: padChars([]) as GameState["players"][0]["characters"],
    hand: [],
  });
  const players: GameState["players"] = [strip(state.players[0]), strip(state.players[1])];
  return { state: { ...state, players, eventLog: [] }, cardDb };
}

function place(b: Built, card: CardInstance): CardInstance {
  const p = b.state.players[card.controller];
  if (card.zone === "CHARACTER") {
    p.characters[p.characters.findIndex((c) => !c)] = card;
    b.state = registerCardEnteredField(b.state, card, b.cardDb.get(card.cardId)!);
  } else if (card.zone === "HAND") {
    p.hand.push(card);
  }
  return card;
}

function run(b: Built, action: GameAction, player: 0 | 1 = 0): void {
  const r = runPipeline(b.state, action, b.cardDb, player);
  expect(r.valid, r.error).toBe(true);
  b.state = r.state;
}

// ─── F9 ──────────────────────────────────────────────────────────────────────

describe("F9 Sugar: a pending auto effect whose source left the field does not activate (rule 8-1-3-1-3 line 710, 8-6-1 line 858; FAQ qa_op04.md:107-109)", () => {
  const SUGAR = "SYN-SUGAR"; // OP04-024 Sugar [Opponent's Turn] draw stand-in
  const MARCO = "SYN-MARCO"; // [On Play] K.O. Sugar

  // Engine: CARD_PLAYED -> CARD_KO(p1) -> CARD_DRAWN(p1); Sugar's effect still activates after Sugar was K.O.'d.
  // Rule 8-1-3-1-3 (line 710): an auto effect whose source moved areas before activation does not activate.
  it("F9 Marco's On Play K.O.s Sugar first, then Sugar's Opponent's Turn effect does not activate (ratchet OPT-964)", () => {
    const b = base([
      synCard(SUGAR, schema(SUGAR, [
        {
          id: "sugar-opp-turn",
          category: "auto",
          trigger: { event: "CHARACTER_PLAYED", filter: { controller: "OPPONENT" }, turn_restriction: "OPPONENT_TURN" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ])),
      synCard(MARCO, schema(MARCO, [
        {
          id: "marco-on-play",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 }, filter: { name: SUGAR } } }],
        },
      ])),
    ]);
    place(b, inst(SUGAR, 1, "CHARACTER"));
    const marco = place(b, inst(MARCO, 0, "HAND"));
    b.state.players[1].deck.push(inst(CARDS.VANILLA.id, 1, "DECK"), inst(CARDS.VANILLA.id, 1, "DECK"));

    run(b, { type: "PLAY_CARD", cardInstanceId: marco.instanceId });

    const types = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    expect(types).toContain("CARD_KO:p1");
    expect(types).not.toContain("CARD_DRAWN:p1");
    expect(b.state.players[1].trash.some((c) => c.cardId === SUGAR)).toBe(true);
  });
});

describe("F9 control: Sugar stays and draws when nothing K.O.s it (rule 8-1-3-1-3 line 710; FAQ qa_op04.md:107-109)", () => {
  const SUGAR = "SYN-SUGAR";

  it("F9 control: p0 plays a plain vanilla Character; Sugar stays on the field and CARD_DRAWN:p1 is present", () => {
    const b = base([
      synCard(SUGAR, schema(SUGAR, [
        {
          id: "sugar-opp-turn",
          category: "auto",
          trigger: { event: "CHARACTER_PLAYED", filter: { controller: "OPPONENT" }, turn_restriction: "OPPONENT_TURN" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ])),
    ]);
    const sugar = place(b, inst(SUGAR, 1, "CHARACTER"));
    const vanilla = place(b, inst(CARDS.VANILLA.id, 0, "HAND"));
    b.state.players[1].deck.push(inst(CARDS.VANILLA.id, 1, "DECK"), inst(CARDS.VANILLA.id, 1, "DECK"));

    run(b, { type: "PLAY_CARD", cardInstanceId: vanilla.instanceId });

    const types = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    expect(b.state.players[1].characters.some((c) => c?.instanceId === sugar.instanceId)).toBe(true);
    expect(types).toContain("CARD_DRAWN:p1");
  });
});

// ─── F10 ─────────────────────────────────────────────────────────────────────

describe("F10 Senor Pink: an effect already activated still resolves after its source leaves (rule 8-2-3 line 774; FAQ qa_op04.md:113-115)", () => {
  const PINK = "SYN-SENOR-PINK"; // OP04-026 Senor Pink stand-in
  const KILLER = "SYN-PINK-KILLER"; // p1 [On Your Opponent's Attack] K.O. of Pink
  // README deviation: an attacking Character is not K.O.'d by a stronger defender (rule 7-1-4-2),
  // so "Pink loses the battle" cannot K.O. it. A p1 [On Your Opponent's Attack] K.O. removes
  // Pink in the same battle instead; Pink's own [When Attacking] has already scheduled the action.

  it("F10 the scheduled DON!! set-active runs at End Phase although Pink was K.O.'d in battle", () => {
    const b = base([
      synCard(PINK, schema(PINK, [
        {
          id: "pink-when-attacking",
          category: "auto",
          trigger: { keyword: "WHEN_ATTACKING" },
          actions: [
            {
              type: "SCHEDULE_ACTION",
              params: { timing: "END_OF_THIS_TURN", action: { type: "SET_DON_ACTIVE", params: { amount: 1 } } },
            },
          ],
        },
      ])),
      synCard(KILLER, schema(KILLER, [
        {
          id: "killer-on-opp-attack",
          category: "auto",
          trigger: { keyword: "ON_OPPONENT_ATTACK" },
          actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 }, filter: { name: PINK } } }],
        },
      ])),
    ]);
    const pink = place(b, inst(PINK, 0, "CHARACTER"));
    place(b, inst(KILLER, 1, "CHARACTER"));
    // One rested DON!! in p0's cost area.
    const don = b.state.players[0].donCostArea;
    don[0] = { ...don[0], state: "RESTED" };
    const restedBefore = don.filter((d) => d.state === "RESTED").length;
    expect(restedBefore).toBe(1);

    run(b, { type: "DECLARE_ATTACK", attackerInstanceId: pink.instanceId, targetInstanceId: b.state.players[1].leader.instanceId });
    for (let i = 0; i < 6 && b.state.turn.battle; i++) {
      const r0 = runPipeline(b.state, { type: "PASS" }, b.cardDb, 0);
      const r = r0.valid ? r0 : runPipeline(b.state, { type: "PASS" }, b.cardDb, 1);
      expect(r.valid, r.error).toBe(true);
      b.state = r.state;
    }
    expect(b.state.turn.battle).toBeNull();
    expect(b.state.players[0].characters.some((c) => c?.instanceId === pink.instanceId)).toBe(false);
    expect(b.state.players[0].trash.some((c) => c.cardId === PINK)).toBe(true);
    expect(b.state.scheduledActions).toHaveLength(1);

    run(b, { type: "ADVANCE_PHASE" });

    const restedAfter = b.state.players[0].donCostArea.filter((d) => d.state === "RESTED").length;
    expect(restedAfter).toBe(0);
  });
});
