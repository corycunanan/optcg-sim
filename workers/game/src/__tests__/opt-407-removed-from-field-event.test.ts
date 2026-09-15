/**
 * OPT-407 — CHARACTER_REMOVED_FROM_FIELD unified custom event.
 *
 * OP16-041 Buggy (Leader): "[DON!! x1] [Once Per Turn] This effect can be
 * activated when your {Impel Down} type Character card is removed from the
 * field. Play up to 1 [Prisoner of Impel Down] card from your hand."
 *
 * A watcher remaining on the field observes exits to secret destinations
 * (OP16-041 FAQ). Rule 8-4-5 governs the moved card's own auto effects.
 */

import { describe, it, expect } from "vitest";
import { matchTriggersForEvent } from "../engine/triggers.js";
import type { GameEvent, GameState, CardData, CardInstance, KeywordSet } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { setupGame } from "./helpers.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

const IMPEL_CHAR: CardData = {
  id: "IMPEL-1",
  name: "Prisoner",
  type: "Character",
  color: ["Blue"],
  cost: 1,
  power: 1000,
  counter: 1000,
  life: null,
  attribute: [],
  types: ["Impel Down"],
  effectText: "",
  triggerText: null,
  keywords: noKeywords(),
  effectSchema: null,
  imageUrl: null,
};

const buggyLeaderBlock: EffectBlock = {
  id: "OP16-041_removed_from_field",
  category: "auto",
  trigger: {
    event: "CHARACTER_REMOVED_FROM_FIELD",
    filter: { controller: "SELF", target_filter: { traits: ["Impel Down"] } },
    once_per_turn: true,
  },
  actions: [],
} as unknown as EffectBlock;

function buildState(): { state: GameState; cardDb: Map<string, CardData> } {
  const { state, cardDb } = setupGame();
  cardDb.set(IMPEL_CHAR.id, IMPEL_CHAR);
  // The removed character is already in the trash (post-removal state).
  const trashed: CardInstance = {
    instanceId: "impel-1",
    cardId: IMPEL_CHAR.id,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  state.players[0].trash = [trashed, ...state.players[0].trash];
  state.triggerRegistry = [{
    id: "trig-buggy",
    sourceCardInstanceId: state.players[0].leader.instanceId,
    effectBlockId: buggyLeaderBlock.id,
    trigger: (buggyLeaderBlock as { trigger?: unknown }).trigger,
    effectBlock: buggyLeaderBlock,
    zone: "FIELD",
    controller: 0,
  } as never];
  // Meet the DON!!x1 requirement path (no don_requirement on this block).
  return { state, cardDb };
}

function makeEvent(type: GameEvent["type"], playerIndex: 0 | 1, payload: Record<string, unknown>): GameEvent {
  return { type, playerIndex, payload, timestamp: Date.now() } as GameEvent;
}

describe("OPT-407: CHARACTER_REMOVED_FROM_FIELD matching (OP16-041)", () => {
  it("matches a K.O. of your Impel Down character", () => {
    const { state, cardDb } = buildState();
    const event = makeEvent("CARD_KO", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, cause: "BATTLE", preKO_donCount: 0 });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
  });

  it("matches a field trash (payload carries cardInstanceId)", () => {
    const { state, cardDb } = buildState();
    const event = makeEvent("CARD_TRASHED", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, reason: "effect" });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
  });

  it("does NOT match a hand trash (count-only payload)", () => {
    const { state, cardDb } = buildState();
    const event = makeEvent("CARD_TRASHED", 0, { count: 2, reason: "cost" });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(0);
  });

  it("matches a Character field exit to hand, but not trash recovery", () => {
    const { state, cardDb } = buildState();
    // Field bounce: card now in hand.
    state.players[0].hand.push({ ...state.players[0].trash[0], zone: "HAND" });
    const bounce = makeEvent("CARD_RETURNED_TO_HAND", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, sourceZone: "CHARACTER" });
    expect(matchTriggersForEvent(state, bounce, cardDb).length).toBe(1);

    const recovery = makeEvent("CARD_RETURNED_TO_HAND", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, source: "TRASH" });
    expect(matchTriggersForEvent(state, recovery, cardDb).length).toBe(0);
  });

  it("matches a Character field exit to deck", () => {
    const { state, cardDb } = buildState();
    const event = makeEvent("CARD_RETURNED_TO_DECK", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, sourceZone: "CHARACTER", position: "BOTTOM" });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(1);
  });

  it("does NOT match the opponent's removals (controller: SELF filter)", () => {
    const { state, cardDb } = buildState();
    const event = makeEvent("CARD_KO", 1, { cardInstanceId: "opp-1", cardId: IMPEL_CHAR.id, cause: "BATTLE", preKO_donCount: 0 });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(0);
  });

  it("does NOT match non-Impel-Down removals (target_filter)", () => {
    const { state, cardDb } = buildState();
    const plain: CardData = { ...IMPEL_CHAR, id: "PLAIN-1", types: ["Straw Hat Crew"] };
    cardDb.set(plain.id, plain);
    state.players[0].trash = [{
      instanceId: "plain-1",
      cardId: plain.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    }, ...state.players[0].trash];
    const event = makeEvent("CARD_KO", 0, { cardInstanceId: "plain-1", cardId: plain.id, cause: "BATTLE", preKO_donCount: 0 });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(0);
  });

  it.each(["HAND", "DECK", "LIFE", "TRASH", "STAGE"])("does not treat %s source as a Character field exit", (sourceZone) => {
    const { state, cardDb } = buildState();
    for (const type of ["CARD_RETURNED_TO_HAND", "CARD_RETURNED_TO_DECK", "CARD_ADDED_TO_LIFE"] as const) {
      const event = makeEvent(type, 0, { cardInstanceId: "old", newCardInstanceId: "new", cardId: IMPEL_CHAR.id, sourceZone, causingController: 0, movementCause: "EFFECT" });
      expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(0);
    }
  });
  it.each(["CARD_KO", "CARD_TRASHED", "CARD_RETURNED_TO_HAND", "CARD_RETURNED_TO_DECK", "CARD_ADDED_TO_LIFE"] as const)("never considers a Stage a Character via %s", (type) => {
    const { state, cardDb } = buildState();
    cardDb.set("STAGE", { ...IMPEL_CHAR, id: "STAGE", type: "Stage" });
    const event = makeEvent(type, 0, { cardInstanceId: "old", newCardInstanceId: "new", cardId: "STAGE", sourceZone: "STAGE", reason: "effect", causingController: 0, movementCause: "EFFECT" });
    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(0);
  });
  it.each(["EFFECT", "COST", "RULE", "BATTLE"])("preserves %s movement cause for by-your-effect filter", (movementCause) => {
    const { state, cardDb } = buildState();
    const block = structuredClone(buggyLeaderBlock);
    if (block.category !== "auto" || !block.trigger || !("event" in block.trigger)) throw new Error("bad fixture");
    block.trigger.filter = { cause: "BY_YOUR_EFFECT" };
    state.triggerRegistry[0].trigger = block.trigger;
    state.triggerRegistry[0].effectBlock = block;
    const event = makeEvent("CARD_RETURNED_TO_DECK", 1, { cardInstanceId: "old", cardId: IMPEL_CHAR.id, sourceZone: "CHARACTER", sourceController: 1, causingController: 0, movementCause });
    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(["EFFECT", "COST"].includes(movementCause) ? 1 : 0);
  });
  it("filters removed controller independently from destination owner", () => {
    const { state, cardDb } = buildState();
    const payload = { cardInstanceId: "old", cardId: IMPEL_CHAR.id, sourceZone: "CHARACTER", sourceController: 0, causingController: 1, movementCause: "EFFECT" };
    expect(matchTriggersForEvent(state, makeEvent("CARD_RETURNED_TO_DECK", 1, payload), cardDb)).toHaveLength(1);
    expect(matchTriggersForEvent(state, makeEvent("CARD_RETURNED_TO_DECK", 0, { ...payload, sourceController: 1 }), cardDb)).toHaveLength(0);
  });

  it.each([0, 1, undefined])("by-your-effect checks causing controller %s, not removed owner", (causingController) => {
    const { state, cardDb } = buildState();
    const block = structuredClone(buggyLeaderBlock);
    if (block.category !== "auto" || !block.trigger || !("event" in block.trigger)) throw new Error("bad fixture");
    block.trigger.filter = { cause: "BY_YOUR_EFFECT" };
    state.triggerRegistry[0].trigger = block.trigger;
    state.triggerRegistry[0].effectBlock = block;
    const event = makeEvent("CARD_RETURNED_TO_HAND", 1, { cardInstanceId: "old", cardId: IMPEL_CHAR.id, sourceZone: "CHARACTER", causingController, movementCause: "EFFECT" });
    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(causingController === 0 ? 1 : 0);
  });
});
