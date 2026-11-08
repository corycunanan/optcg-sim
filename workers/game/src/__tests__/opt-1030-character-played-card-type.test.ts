/**
 * OPT-1030 — "When you play a Character" (CHARACTER_PLAYED) fires only for
 * Character plays. Event and Stage plays also emit CARD_PLAYED (zone TRASH and
 * zone STAGE), and before this fix the watcher matched them too.
 *
 * Card text (docs/cards):
 *   OP13-100 Jewelry Bonney (Leader): "[Your Turn] [Once Per Turn] This effect
 *     can be activated when you play a Character with a [Trigger]. Give up to 2
 *     rested DON!! cards to 1 of your Leader or Character cards."
 *   OP14-041 Boa Hancock (Leader): "[Opponent's Turn] When you play a
 *     Character, draw 1 card."
 *
 * Every effect comes from the production schema registry.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameEvent, GameState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { matchTriggersForEvent, registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

const TRIGGER_KEYWORDS = { ...CARDS.VANILLA.keywords, trigger: true };

function leaderFixture(leaderId: "OP13-100" | "OP14-041") {
  const db = createTestCardDb();
  const schema = getEffectSchema(leaderId);
  expect(schema, `${leaderId} schema`).toBeDefined();
  const leaderData: CardData = {
    ...CARDS.LEADER,
    id: leaderId,
    name: schema!.card_name ?? leaderId,
    effectSchema: schema!,
  };
  db.set(leaderId, leaderData);
  // Each card has a [Trigger], so OP13-100's target_filter can't be what
  // rejects the Event and the Stage. The Event's [Main] draws 1 so it can be
  // activated in the Main Phase; nothing else has an effect.
  const character: CardData = { ...CARDS.VANILLA, id: "T-CHAR", cost: 1, triggerText: "[Trigger] Draw 1 card.", keywords: TRIGGER_KEYWORDS, effectSchema: null };
  const event: CardData = {
    ...CARDS.EVENT_COUNTER,
    id: "T-EVENT",
    cost: 1,
    effectText: "[Main] Draw 1 card.",
    triggerText: "[Trigger] Draw 1 card.",
    keywords: TRIGGER_KEYWORDS,
    effectSchema: {
      card_id: "T-EVENT",
      card_name: "T-EVENT",
      card_type: "Event",
      effects: [{ id: "main_draw", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "DRAW", params: { amount: 1 } }] }],
    } as EffectSchema,
  };
  const stage: CardData = { ...CARDS.STAGE, id: "T-STAGE", cost: 1, triggerText: "[Trigger] Draw 1 card.", keywords: TRIGGER_KEYWORDS, effectSchema: null };
  for (const c of [character, event, stage]) db.set(c.id, c);

  let state: GameState = createBattleReadyState(db);
  const leader: CardInstance = { ...state.players[0].leader, cardId: leaderId };
  state.players[0].leader = leader;
  state = registerCardEnteredField(state, leader, leaderData);
  return { db, state };
}

function handCard(state: GameState, cardId: string): CardInstance {
  const card: CardInstance = {
    cardId,
    instanceId: `${cardId}-hand`,
    owner: 0,
    controller: 0,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
  };
  state.players[0].hand.push(card);
  return card;
}

describe("OPT-1030: OP13-100 Jewelry Bonney watches Character plays only", () => {
  it.each([
    ["Character", true, "T-CHAR"],
    ["Event", false, "T-EVENT"],
    ["Stage", false, "T-STAGE"],
  ] as const)("playing a %s with a [Trigger] from hand fires: %s", (_kind, fires, cardId) => {
    const { db, state } = leaderFixture("OP13-100");
    const card = handCard(state, cardId);
    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: card.instanceId }, db, 0);
    expect(result.valid, result.error).toBe(true);

    const prompt = result.state.pendingPrompt;
    if (fires) {
      // "Give up to 2 rested DON!! cards to 1 of your Leader or Character cards."
      expect(prompt?.options.promptType).toBe("SELECT_TARGET");
    } else {
      expect(prompt).toBeNull();
    }
  });
});

describe("OPT-1030: CHARACTER_PLAYED matches by destination, from every source", () => {
  function played(zone: "CHARACTER" | "TRASH" | "STAGE", source: string, sourceZone: CardInstance["zone"]): GameEvent {
    return {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: { cardId: zone === "CHARACTER" ? "T-CHAR" : zone === "STAGE" ? "T-STAGE" : "T-EVENT", cardInstanceId: "played-1", zone, source, sourceZone },
    } as GameEvent;
  }

  it.each([
    ["from hand", 1, played("CHARACTER", "FROM_HAND", "HAND")],
    ["by effect", 1, played("CHARACTER", "BY_EFFECT", "TRASH")],
    ["from Life", 1, played("CHARACTER", "LIFE", "LIFE")],
    ["from deck", 1, played("CHARACTER", "search_and_play", "DECK")],
    ["Event from hand", 0, played("TRASH", "FROM_HAND", "HAND")],
    ["Stage from hand", 0, played("STAGE", "FROM_HAND", "HAND")],
    ["Stage by effect", 0, played("STAGE", "BY_EFFECT", "HAND")],
    ["Stage from deck", 0, played("STAGE", "search_and_play", "DECK")],
  ] as const)("OP14-041 Boa Hancock on the opponent's turn, %s: %i match", (_label, count, event) => {
    const { db, state } = leaderFixture("OP14-041");
    // "[Opponent's Turn] When you play a Character, draw 1 card."
    const opponentsTurn: GameState = { ...state, turn: { ...state.turn, activePlayerIndex: 1 } };
    const matched = matchTriggersForEvent(opponentsTurn, event, db)
      .filter((m) => m.effectBlock.id === "OP14-041_on_character_played");
    expect(matched).toHaveLength(count);
  });
});
