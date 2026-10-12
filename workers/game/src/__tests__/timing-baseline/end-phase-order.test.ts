/**
 * Timing baseline F3 / F4 (OPT-939 fixtures, README §2).
 *
 * F3: Rule 6-6-1-1 (line 607), 6-6-1-1-2 (line 611), 6-6-1-2 (line 617), 6-6-1-3 (line 622);
 *     FAQ qa_op10.md OP10-003 Sugar (End of Your Turn checks power before "during this turn" expires).
 * F4: OP15-022 text, rule 1-3-1 (line 57), 6-6-1-4 (line 624); FAQ faq_op15-eb04.md Brook.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../../types.js";
import type { EffectSchema, RuntimeActiveEffect, RuntimeScheduledAction } from "../../engine/effect-types.js";
import { runPipeline } from "../../engine/pipeline.js";
import { registerCardEnteredField } from "../../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

interface Built {
  state: GameState;
  cardDb: Map<string, CardData>;
}

function synCard(id: string, schema: EffectSchema | null, overrides: Partial<CardData> = {}): CardData {
  return { ...CARDS.VANILLA, id, name: id, effectSchema: schema, ...overrides };
}

function schema(id: string, type: "Character" | "Leader", effects: EffectSchema["effects"], extra: Partial<EffectSchema> = {}): EffectSchema {
  return { card_id: id, card_name: id, card_type: type, effects, ...extra };
}

let serial = 0;
function inst(cardId: string, controller: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return { instanceId: `${cardId}#${serial++}`, cardId, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller, owner: controller };
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

function placeChar(b: Built, card: CardInstance): CardInstance {
  const p = b.state.players[card.controller];
  p.characters[p.characters.findIndex((c) => !c)] = card;
  b.state = registerCardEnteredField(b.state, card, b.cardDb.get(card.cardId)!);
  return card;
}

function fillDecks(b: Built): void {
  for (const pi of [0, 1] as const) {
    b.state.players[pi].deck.push(inst(CARDS.VANILLA.id, pi, "DECK"), inst(CARDS.VANILLA.id, pi, "DECK"), inst(CARDS.VANILLA.id, pi, "DECK"));
  }
}

function run(b: Built, action: GameAction, player: 0 | 1 = 0): void {
  const r = runPipeline(b.state, action, b.cardDb, player);
  expect(r.valid, r.error).toBe(true);
  b.state = r.state;
}

/** THIS_TURN +1000 on `target`, anchored to the current turn, as MODIFY_POWER creates it. */
function thisTurnPlus1000(b: Built, target: CardInstance): RuntimeActiveEffect {
  return {
    id: `syn-this-turn-${target.instanceId}`,
    sourceCardInstanceId: target.instanceId,
    sourceEffectBlockId: "syn-power",
    category: "auto",
    modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: b.state.turn.number, player: 0 },
    controller: 0,
    appliesTo: [target.instanceId],
    timestamp: 1,
  };
}

const POWER_5000 = { type: "SELF_POWER", operator: ">=", value: 5000 } as const;

// ─── F3 ──────────────────────────────────────────────────────────────────────

describe("F3 End Phase: two waves, then expiry (rules 6-6-1-1 line 607, 6-6-1-1-2 line 611, 6-6-1-2 line 617, 6-6-1-3 line 622; FAQ qa_op10.md OP10-003)", () => {
  const EOYT = "SYN-EOYT"; // stands in for OP10-003 Sugar-style [End of Your Turn] power check
  const EOOT = "SYN-EOOT"; // an [End of Your Opponent's Turn] draw

  // Engine: runEndPhase has no waves, so neither END_OF_*_TURN draw resolves before TURN_ENDED.
  // Rule 6-6-1-1: all [End of Your Turn] effects, then all [End of Your Opponent's Turn] effects, then hand-off.
  it.fails("F3a wave 1 (ending player) resolves before wave 2, both before TURN_ENDED (ratchet OPT-962)", () => {
    const b = base([
      synCard(EOYT, schema(EOYT, "Character", [
        {
          id: "eoyt-draw",
          category: "auto",
          trigger: { keyword: "END_OF_YOUR_TURN" },
          conditions: POWER_5000,
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ])),
      synCard(EOOT, schema(EOOT, "Character", [
        {
          id: "eoot-draw",
          category: "auto",
          trigger: { keyword: "END_OF_OPPONENT_TURN" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ])),
    ]);
    const eoyt = placeChar(b, inst(EOYT, 0, "CHARACTER"));
    placeChar(b, inst(EOOT, 1, "CHARACTER"));
    fillDecks(b);
    b.state = { ...b.state, activeEffects: [thisTurnPlus1000(b, eoyt)] };

    run(b, { type: "ADVANCE_PHASE" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    const before = log.slice(0, endedAt).filter((e) => e.startsWith("CARD_DRAWN"));
    expect(before).toEqual(["CARD_DRAWN:p0", "CARD_DRAWN:p1"]);
  });

  // Engine: runEndPhase expires THIS_TURN effects before processScheduledActions, so the conditional draw sees 4000 power.
  // Rules 6-6-1-2 / 6-6-1-3: scheduled end-of-turn effects resolve before "during this turn" modifiers expire.
  it.fails("F3b scheduled END_OF_THIS_TURN draw resolves before the THIS_TURN modifier expires (ratchet OPT-962)", () => {
    const b = base([]);
    const subject = placeChar(b, inst(CARDS.VANILLA.id, 0, "CHARACTER"));
    fillDecks(b);
    const modifier = thisTurnPlus1000(b, subject);
    const scheduled: RuntimeScheduledAction = {
      id: "syn-scheduled-draw",
      timing: "END_OF_THIS_TURN",
      action: { type: "DRAW", params: { amount: 1 }, conditions: POWER_5000 },
      boundToInstanceId: null,
      sourceEffectId: subject.instanceId,
      controller: 0,
    };
    b.state = { ...b.state, activeEffects: [modifier], scheduledActions: [scheduled] };

    run(b, { type: "ADVANCE_PHASE" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    expect(log).toContain("CARD_DRAWN:p0");
    expect(log.indexOf("CARD_DRAWN:p0")).toBeLessThan(log.indexOf("TURN_ENDED:p0"));
    expect(b.state.activeEffects.some((e) => e.id === modifier.id)).toBe(false);
  });
});

// ─── F4 ──────────────────────────────────────────────────────────────────────

describe("F4 Brook delayed deck-out loses at the end-of-turn boundary (OP15-022 text; rules 1-3-1 line 57, 6-6-1-4 line 624; FAQ faq_op15-eb04.md Brook)", () => {
  const BROOK_SCHEMA: EffectSchema = schema("OP15-022", "Leader", [], {
    rule_modifications: [
      { rule_type: "LOSS_CONDITION_MOD", trigger_event: "DECK_OUT", modification: "DELAYED_LOSS", delay: { timing: "END_OF_TURN" } },
    ],
  });
  const MILLER = "SYN-MILLER"; // [Activate: Main] trash 2 from the top of your deck, then +1000 power

  it("F4 the effect that empties the deck finishes, then the loss is written at End Phase before p1's turn starts", () => {
    const b = base([
      synCard("BROOK-LEADER", BROOK_SCHEMA, { ...CARDS.LEADER, id: "BROOK-LEADER", effectSchema: BROOK_SCHEMA }),
      synCard(MILLER, schema(MILLER, "Character", [
        {
          id: "miller-activate",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [
            { type: "MILL", params: { amount: 2 } },
            { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" }, chain: "THEN" },
          ],
        },
      ])),
    ]);
    const players = [...b.state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], leader: { ...players[0].leader, cardId: "BROOK-LEADER" }, deck: [inst(CARDS.VANILLA.id, 0, "DECK"), inst(CARDS.VANILLA.id, 0, "DECK")] };
    b.state = { ...b.state, players };
    const miller = placeChar(b, inst(MILLER, 0, "CHARACTER"));

    run(b, { type: "ACTIVATE_EFFECT", cardInstanceId: miller.instanceId, effectId: "miller-activate" });

    expect(b.state.players[0].deck).toHaveLength(0);
    expect(b.state.eventLog.some((e) => e.type === "POWER_MODIFIED")).toBe(true);
    expect(b.state.status).toBe("IN_PROGRESS");

    run(b, { type: "ADVANCE_PHASE" });

    expect(b.state.status).toBe("FINISHED");
    expect(b.state.winner).toBe(1);
    const types = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    const over = types.findIndex((t) => t.startsWith("GAME_OVER"));
    expect(over).toBeGreaterThanOrEqual(0);
    expect(types.slice(over).some((t) => t === "TURN_STARTED:p1")).toBe(false);
  });
});
