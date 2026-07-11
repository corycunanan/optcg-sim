/**
 * OPT-454 — PLACE_SELF_TO_DECK: "You may place this Character at the bottom
 * of the owner's deck: ..." (OP06-016 Raise Max, OP09-008 Building Snake,
 * P-013 Gordon, P-033 Monkey.D.Luffy).
 *
 * These four were encoded as unscoped PLACE_OWN_CHARACTER_TO_DECK: with any
 * bystander present the engine prompted a selection and let the bystander
 * pay while the printed "this Character" stayed in play (rules 8-3-1,
 * 8-3-1-7). The new cost is fixed to the source card, auto-pays with no
 * selection prompt, and completes the canonical field exit (OPT-453).
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { payCosts, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { OP06_016_RAISE_MAX } from "../engine/schemas/op06.js";
import { P_033_MONKEY_D_LUFFY } from "../engine/schemas/p.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

const RAISE_MAX = makeCard("OP06-016", { name: "Raise Max", cost: 1, power: 0, effectSchema: OP06_016_RAISE_MAX });
const P033_LUFFY = makeCard("P-033", { name: "Monkey.D.Luffy", cost: 1, power: 2000, effectSchema: P_033_MONKEY_D_LUFFY });

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  db.set(RAISE_MAX.id, RAISE_MAX);
  db.set(P033_LUFFY.id, P033_LUFFY);
  return db;
}

function makeChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function activate(state: GameState, cardDb: Map<string, CardData>, instanceId: string, effectId: string) {
  const activation = runPipeline(state, { type: "ACTIVATE_EFFECT", cardInstanceId: instanceId, effectId }, cardDb, 0);
  expect(activation.valid).toBe(true);
  if (activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    return resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);
  }
  return { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: true };
}

describe("OPT-454 — the self cost is fixed to the source card", () => {
  it("OP06-016 with a bystander: no selection prompt, the source itself pays", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const raiseMax = makeChar(RAISE_MAX.id, 0, "raisemax");
    const bystander = makeChar(CARDS.VANILLA.id, 0, "bystander");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([raiseMax, bystander]) };
    // No opponent characters → the up-to-1 debuff resolves without a prompt.
    players[1] = { ...players[1], characters: padChars([]) };
    state = { ...state, players };

    const done = activate(state, cardDb, raiseMax.instanceId, "OP06-016_effect_1");

    // Pre-fix: a SELECT_TARGET cost prompt offered the bystander. Now the
    // cost auto-pays with the source and no cost selection ever appears.
    expect(done.pendingPrompt?.options.promptType).not.toBe("SELECT_TARGET");

    const p0 = done.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === raiseMax.instanceId)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === bystander.instanceId)).toBe(true);

    // Canonical exit: fresh instance at the deck bottom (OPT-453).
    const bottom = p0.deck.at(-1)!;
    expect(bottom.cardId).toBe(RAISE_MAX.id);
    expect(bottom.instanceId).not.toBe(raiseMax.instanceId);
    expect(bottom.turnPlayed).toBeNull();
  });

  it("P-033: pays with itself, then draws 1", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const luffy = makeChar(P033_LUFFY.id, 0, "p033");
    const bystander = makeChar(CARDS.BLOCKER.id, 0, "bystander");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([luffy, bystander]) };
    state = { ...state, players };
    const handBefore = state.players[0].hand.length;

    const done = activate(state, cardDb, luffy.instanceId, P_033_MONKEY_D_LUFFY.effects[0].id);

    const p0 = done.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === luffy.instanceId)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === bystander.instanceId)).toBe(true);
    expect(p0.hand.length).toBe(handBefore + 1);
    expect(done.state.effectStack).toHaveLength(0);
  });

  it("is unpayable when the source is not on the field", () => {
    const cardDb = buildCardDb();
    const state = createBattleReadyState(cardDb);
    const cost: Cost = { type: "PLACE_SELF_TO_DECK", position: "BOTTOM" } as Cost;
    expect(isCostPayable(state, cost, 0, cardDb, "not-on-field")).toBe(false);
    expect(payCosts(state, [cost], 0, cardDb, "not-on-field")).toBeNull();
    // And payable while it is.
    expect(isCostPayable(state, cost, 0, cardDb, "char-0-v1")).toBe(true);
  });
});
