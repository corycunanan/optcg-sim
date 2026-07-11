/**
 * OPT-407 — CHARACTER_REMOVED_FROM_FIELD unified custom event.
 *
 * OP16-041 Buggy (Leader): "[DON!! x1] [Once Per Turn] This effect can be
 * activated when your {Impel Down} type Character card is removed from the
 * field. Play up to 1 [Prisoner of Impel Down] card from your hand."
 *
 * Rule 8-4-5 limits moved-card auto effects to open destinations, so this
 * custom event matches field→trash exits only: CARD_KO and field-only
 * CARD_TRASHED. Hand, deck, and face-down Life destinations are secret.
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

  it("does NOT match movement to the secret hand area", () => {
    const { state, cardDb } = buildState();
    // Field bounce: card now in hand.
    state.players[0].hand.push({ ...state.players[0].trash[0], zone: "HAND" });
    const bounce = makeEvent("CARD_RETURNED_TO_HAND", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id });
    expect(matchTriggersForEvent(state, bounce, cardDb).length).toBe(0);

    const recovery = makeEvent("CARD_RETURNED_TO_HAND", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, source: "TRASH" });
    expect(matchTriggersForEvent(state, recovery, cardDb).length).toBe(0);
  });

  it("does NOT match movement to the secret deck area", () => {
    const { state, cardDb } = buildState();
    const event = makeEvent("CARD_RETURNED_TO_DECK", 0, { cardInstanceId: "impel-1", cardId: IMPEL_CHAR.id, position: "BOTTOM" });
    expect(matchTriggersForEvent(state, event, cardDb).length).toBe(0);
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
});
