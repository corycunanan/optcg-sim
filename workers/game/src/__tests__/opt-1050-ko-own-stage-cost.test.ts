/**
 * OPT-1050 — KO_OWN_STAGE: "You may K.O. 1 of your Stages with a cost of 5 or
 * less:" (OP18-063 Kiwi & Mozu, OP18-066 Zambai, OP18-072 The Franky Family).
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { payCosts, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { OP18_066_ZAMBAI, OP18_072_THE_FRANKY_FAMILY } from "../engine/schemas/op18.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, name: string, effectSchema: EffectSchema | null, overrides: Partial<CardData> = {}): CardData {
  return {
    id, name, type: "Character", color: ["Purple"], cost: 3, power: 4000, counter: null, life: null,
    attribute: [], types: [], effectText: "", triggerText: null, keywords: noKeywords(), effectSchema, imageUrl: null,
    ...overrides,
  };
}

const ZAMBAI = makeCard("OP18-066", "Zambai", OP18_066_ZAMBAI);
const FRANKY_FAMILY = makeCard("OP18-072", "The Franky Family", OP18_072_THE_FRANKY_FAMILY);
const STAGE_5 = makeCard("STAGE-5", "Cost Five Stage", null, { type: "Stage", cost: 5, power: null });
const STAGE_6 = makeCard("STAGE-6", "Cost Six Stage", null, { type: "Stage", cost: 6, power: null });
const COST_5: Cost = { type: "KO_OWN_STAGE", filter: { cost_max: 5 } };

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  for (const c of [ZAMBAI, FRANKY_FAMILY, STAGE_5, STAGE_6]) db.set(c.id, c);
  return db;
}

function card(cardId: string, zone: "CHARACTER" | "STAGE", owner: 0 | 1, suffix: string, turnPlayed: number | null = 1): CardInstance {
  return { instanceId: `${zone.toLowerCase()}-${owner}-${suffix}`, cardId, zone, state: "ACTIVE", attachedDon: [], turnPlayed, controller: owner, owner };
}

function setup(cardDb: Map<string, CardData>, own: CardInstance[], stage: CardInstance | null, opponent: CardInstance[] = []): GameState {
  const state = createBattleReadyState(cardDb);
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars(own), stage };
  players[1] = { ...players[1], characters: padChars(opponent) };
  return { ...state, players };
}

function activate(state: GameState, cardDb: Map<string, CardData>, instanceId: string, effectId: string) {
  const activation = runPipeline(state, { type: "ACTIVATE_EFFECT", cardInstanceId: instanceId, effectId }, cardDb, 0);
  if (activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    return { valid: activation.valid, ...resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb) };
  }
  return { valid: activation.valid, state: activation.state, events: [], pendingPrompt: activation.pendingPrompt };
}

describe("OPT-1050 — KO_OWN_STAGE cost", () => {
  it("K.O.s a cost-5 Stage and publishes the Stage CARD_KO as a cost movement", () => {
    const cardDb = buildCardDb();
    const stage = card(STAGE_5.id, "STAGE", 0, "s5");
    const state = setup(cardDb, [], stage);
    expect(isCostPayable(state, COST_5, 0, cardDb)).toBe(true);
    const result = payCosts(state, [COST_5], 0, cardDb);
    expect(result).not.toBeNull();
    expect(result!.state.players[0].stage).toBeNull();
    expect(result!.state.players[0].trash[0]?.cardId).toBe(STAGE_5.id);
    expect(result!.events).toMatchObject([
      { type: "CARD_KO", playerIndex: 0, payload: { cardInstanceId: stage.instanceId, cardType: "STAGE", sourceZone: "STAGE", movementCause: "COST" } },
    ]);
  });

  it("is unpayable with no Stage or a cost-6 Stage", () => {
    const cardDb = buildCardDb();
    expect(isCostPayable(setup(cardDb, [], null), COST_5, 0, cardDb)).toBe(false);
    const six = setup(cardDb, [], card(STAGE_6.id, "STAGE", 0, "s6"));
    expect(isCostPayable(six, COST_5, 0, cardDb)).toBe(false);
    expect(payCosts(six, [COST_5], 0, cardDb)).toBeNull();
  });

  it("is unpayable when the Stage cannot be K.O.'d", () => {
    const cardDb = buildCardDb();
    const stage = card(STAGE_5.id, "STAGE", 0, "s5");
    const state = setup(cardDb, [], stage);
    state.prohibitions.push({
      id: "stage-ko-gate", sourceCardInstanceId: stage.instanceId, sourceEffectBlockId: "gate", controller: 0,
      prohibitionType: "CANNOT_BE_KO", scope: { controller: "SELF" }, appliesTo: [stage.instanceId],
      usesRemaining: null, duration: { type: "THIS_TURN" },
    });
    expect(isCostPayable(state, COST_5, 0, cardDb)).toBe(false);
  });

  it("does not offer a Character: KO_OWN_STAGE never K.O.s a Character", () => {
    const cardDb = buildCardDb();
    const zambai = card(ZAMBAI.id, "CHARACTER", 0, "zambai");
    const state = setup(cardDb, [zambai, card(CARDS.VANILLA.id, "CHARACTER", 0, "v")], null);
    const done = activate(state, cardDb, zambai.instanceId, "activate_ko_stage_rush");
    expect(done.state.players[0].characters.filter(Boolean)).toHaveLength(2);
    const live = done.state.players[0].characters.find((c) => c?.instanceId === zambai.instanceId)!;
    expect(hasEffectiveKeyword(live, ZAMBAI, "RUSH", done.state, cardDb)).toBe(false);
  });
});

describe("OPT-1050 — OP-18 cards", () => {
  it("OP18-066 Zambai K.O.s the Stage and gains [Rush]", () => {
    const cardDb = buildCardDb();
    const zambai = card(ZAMBAI.id, "CHARACTER", 0, "zambai");
    const state = setup(cardDb, [zambai], card(STAGE_5.id, "STAGE", 0, "s5"));
    const done = activate(state, cardDb, zambai.instanceId, "activate_ko_stage_rush");
    expect(done.state.players[0].stage).toBeNull();
    const live = done.state.players[0].characters.find((c) => c?.instanceId === zambai.instanceId)!;
    expect(hasEffectiveKeyword(live, ZAMBAI, "RUSH", done.state, cardDb)).toBe(true);
  });

  for (const playedThisTurn of [true, false]) {
    it(`OP18-072 played this turn=${playedThisTurn}: the Stage is K.O.'d and the −3000 ${playedThisTurn ? "applies" : "does not apply"}`, () => {
      const cardDb = buildCardDb();
      const base = createBattleReadyState(cardDb);
      const family = card(FRANKY_FAMILY.id, "CHARACTER", 0, "family", playedThisTurn ? base.turn.number : base.turn.number - 1);
      const target = card(CARDS.VANILLA.id, "CHARACTER", 1, "target");
      const state = setup(cardDb, [family], card(STAGE_5.id, "STAGE", 0, "s5"), [target]);
      let done = activate(state, cardDb, family.instanceId, "activate_ko_stage_debuff");
      if (done.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        done = { valid: true, ...resumeFromStack(done.state, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] } as GameAction, cardDb) };
      }
      expect(done.state.players[0].stage).toBeNull();
      const live = done.state.players[1].characters.find((c) => c?.instanceId === target.instanceId)!;
      const printed = cardDb.get(CARDS.VANILLA.id)!.power!;
      expect(getEffectivePower(live, cardDb.get(live.cardId)!, done.state, cardDb)).toBe(playedThisTurn ? printed - 3000 : printed);
    });
  }
});
