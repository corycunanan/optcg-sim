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
import { OP09_008_BUILDING_SNAKE } from "../engine/schemas/op09.js";
import { P_013_GORDON, P_033_MONKEY_D_LUFFY } from "../engine/schemas/p.js";
import { registerPermanentEffectsForCard, registerTriggersForCard } from "../engine/triggers.js";
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
const BUILDING_SNAKE = makeCard("OP09-008", { name: "Building Snake", cost: 3, power: 4000, effectSchema: OP09_008_BUILDING_SNAKE });
const GORDON = makeCard("P-013", { name: "Gordon", cost: 3, power: 4000, effectSchema: P_013_GORDON });
const P033_LUFFY = makeCard("P-033", { name: "Monkey.D.Luffy", cost: 1, power: 2000, effectSchema: P_033_MONKEY_D_LUFFY });

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  for (const c of [RAISE_MAX, BUILDING_SNAKE, GORDON, P033_LUFFY]) db.set(c.id, c);
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

  it("OP09-008 with a bystander: the source pays, the bystander stays", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const snake = makeChar(BUILDING_SNAKE.id, 0, "snake");
    const bystander = makeChar(CARDS.VANILLA.id, 0, "bystander");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([snake, bystander]) };
    players[1] = { ...players[1], characters: padChars([]) };
    state = { ...state, players };

    const done = activate(state, cardDb, snake.instanceId, "activate_debuff");
    expect(done.pendingPrompt?.options.promptType).not.toBe("SELECT_TARGET");
    const p0 = done.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === snake.instanceId)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === bystander.instanceId)).toBe(true);
    expect(p0.deck.at(-1)!.cardId).toBe(BUILDING_SNAKE.id);
  });

  it("P-013 pays with attached DON and registrations: full canonical cleanup", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const gordon: CardInstance = {
      ...makeChar(GORDON.id, 0, "gordon"),
      attachedDon: [{ instanceId: "don-gordon", state: "ACTIVE" as const, attachedTo: "char-0-gordon" }],
    };
    const bystander = makeChar(CARDS.VANILLA.id, 0, "bystander");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([gordon, bystander]) };
    players[1] = { ...players[1], characters: padChars([]) };
    state = { ...state, players };
    // Field-entry registrations, as the pipeline performs on play.
    state = registerTriggersForCard(state, gordon, GORDON);
    state = registerPermanentEffectsForCard(state, gordon, GORDON);
    const donBefore = state.players[0].donCostArea.length;

    // Drive payCosts directly to observe the emitted events, then assert the
    // same cleanup contract the OPT-453 canonical branch provides.
    const cost: Cost = { type: "PLACE_SELF_TO_DECK", position: "BOTTOM" } as Cost;
    const result = payCosts(state, [cost], 0, cardDb, gordon.instanceId);
    expect(result).not.toBeNull();
    const { state: next, events } = result!;

    // Attached DON returned rested + detached; event propagated with old id.
    const returned = next.players[0].donCostArea.find((d) => d.instanceId === "don-gordon");
    expect(next.players[0].donCostArea.length).toBe(donBefore + 1);
    expect(returned?.state).toBe("RESTED");
    expect(returned?.attachedTo).toBeNull();
    expect(events.some(
      (e) => e.type === "CARD_RETURNED_TO_DECK" && e.payload?.cardInstanceId === gordon.instanceId,
    )).toBe(true);

    // Old field instance fully deregistered; fresh instance in the deck.
    expect(next.triggerRegistry.some(
      (t) => (t as { sourceCardInstanceId?: string }).sourceCardInstanceId === gordon.instanceId,
    )).toBe(false);
    const bottom = next.players[0].deck.at(-1)!;
    expect(bottom.cardId).toBe(GORDON.id);
    expect(bottom.instanceId).not.toBe(gordon.instanceId);
    expect(bottom.attachedDon).toHaveLength(0);
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
