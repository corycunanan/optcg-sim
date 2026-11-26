/**
 * OPT-1051 — RETURN_SELF_TO_HAND: "You may return this Character to the
 * owner's hand: ..." (OP02-035, OP07-047, OP08-041, P-074, P-081, OP18-085).
 *
 * These were encoded as unscoped RETURN_OWN_CHARACTER_TO_HAND, which offered
 * every one of your Characters: a bystander could pay while the printed "this
 * Character" stayed on the field (rules 8-3-1, 8-3-1-7). The new cost is fixed
 * to the source card and auto-pays with no selection prompt.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { payCosts, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { OP02_035_TRAFALGAR_LAW } from "../engine/schemas/op02.js";
import { OP07_047_TRAFALGAR_LAW } from "../engine/schemas/op07.js";
import { OP08_041_APHELANDRA } from "../engine/schemas/op08.js";
import { P_074_PORTGAS_D_ACE, P_081_DRACULE_MIHAWK } from "../engine/schemas/p.js";
import { OP18_085_CERBERUS } from "../engine/schemas/op18.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, name: string, effectSchema: EffectSchema | null): CardData {
  return {
    id, name, type: "Character", color: ["Black"], cost: 3, power: 4000, counter: null, life: null,
    attribute: [], types: [], effectText: "", triggerText: null, keywords: noKeywords(), effectSchema, imageUrl: null,
  };
}

const LAW = makeCard("OP07-047", "Trafalgar Law", OP07_047_TRAFALGAR_LAW);
const CERBERUS = makeCard("OP18-085", "Cerberus", OP18_085_CERBERUS);
const SHAMROCK = makeCard("OP18-119", "Saint Shamrock", null);

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  for (const c of [LAW, CERBERUS, SHAMROCK]) db.set(c.id, c);
  return db;
}

function makeChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return { instanceId: `char-${owner}-${suffix}`, cardId, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller: owner, owner };
}

function withCharacters(state: GameState, own: CardInstance[]): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars(own) };
  players[1] = { ...players[1], characters: padChars([]) };
  return { ...state, players };
}

function activate(state: GameState, cardDb: Map<string, CardData>, instanceId: string, effectId: string) {
  const activation = runPipeline(state, { type: "ACTIVATE_EFFECT", cardInstanceId: instanceId, effectId }, cardDb, 0);
  expect(activation.valid).toBe(true);
  if (activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    return resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);
  }
  return { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: true };
}

describe("OPT-1051 — the self-return cost is fixed to the source card", () => {
  it("the five older cards use RETURN_SELF_TO_HAND", () => {
    for (const schema of [OP02_035_TRAFALGAR_LAW, OP07_047_TRAFALGAR_LAW, OP08_041_APHELANDRA, P_074_PORTGAS_D_ACE, P_081_DRACULE_MIHAWK]) {
      const types = schema.effects.flatMap((block) => ("costs" in block ? block.costs ?? [] : []).map((cost) => cost.type));
      expect(types, schema.card_id).toContain("RETURN_SELF_TO_HAND");
      expect(types, schema.card_id).not.toContain("RETURN_OWN_CHARACTER_TO_HAND");
    }
  });

  it("OP07-047 with a bystander: no cost selection, the source returns and the bystander stays", () => {
    const cardDb = buildCardDb();
    const law = makeChar(LAW.id, 0, "law");
    const bystander = makeChar(CARDS.VANILLA.id, 0, "bystander");
    const state = withCharacters(createBattleReadyState(cardDb), [law, bystander]);
    const handBefore = state.players[0].hand.length;

    const done = activate(state, cardDb, law.instanceId, "OP07-047_effect_1");

    expect(done.pendingPrompt?.options.promptType).not.toBe("SELECT_TARGET");
    const p0 = done.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === law.instanceId)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === bystander.instanceId)).toBe(true);
    expect(p0.hand).toHaveLength(handBefore + 1);
    expect(p0.hand.at(-1)!.cardId).toBe(LAW.id);
  });

  it("another Character cannot pay: the cost is unpayable while the source is off the field", () => {
    const cardDb = buildCardDb();
    const bystander = makeChar(CARDS.VANILLA.id, 0, "bystander");
    const state = withCharacters(createBattleReadyState(cardDb), [bystander]);
    const cost: Cost = { type: "RETURN_SELF_TO_HAND" };
    expect(isCostPayable(state, cost, 0, cardDb, "not-on-field")).toBe(false);
    expect(payCosts(state, [cost], 0, cardDb, "not-on-field")).toBeNull();
    expect(isCostPayable(state, cost, 0, cardDb, bystander.instanceId)).toBe(true);
  });

  it("is unpayable when the source cannot leave the field", () => {
    const cardDb = buildCardDb();
    const law = makeChar(LAW.id, 0, "law");
    const bystander = makeChar(CARDS.VANILLA.id, 0, "bystander");
    const state = withCharacters(createBattleReadyState(cardDb), [law, bystander]);
    state.prohibitions.push({
      id: "law-gate", sourceCardInstanceId: law.instanceId, sourceEffectBlockId: "gate", controller: 0,
      prohibitionType: "CANNOT_LEAVE_FIELD", scope: { controller: "SELF" }, appliesTo: [law.instanceId],
      usesRemaining: null, duration: { type: "THIS_TURN" },
    });
    const cost: Cost = { type: "RETURN_SELF_TO_HAND" };
    expect(isCostPayable(state, cost, 0, cardDb, law.instanceId)).toBe(false);
    // The bystander does not make it payable either.
    expect(isCostPayable(state, cost, 0, cardDb, bystander.instanceId)).toBe(true);
  });

  it("emits CARD_RETURNED_TO_HAND for the source and fills the returned-this-way count", () => {
    const cardDb = buildCardDb();
    const law = makeChar(LAW.id, 0, "law");
    const state = withCharacters(createBattleReadyState(cardDb), [law, makeChar(CARDS.VANILLA.id, 0, "bystander")]);
    const result = payCosts(state, [{ type: "RETURN_SELF_TO_HAND" }], 0, cardDb, law.instanceId);
    expect(result).not.toBeNull();
    expect(result!.events.some((e) => e.type === "CARD_RETURNED_TO_HAND" && e.payload?.cardInstanceId === law.instanceId)).toBe(true);
    expect(result!.costResult.cardsReturnedCount).toBe(1);
  });
});

describe("OPT-1051 — OP18-085 Cerberus", () => {
  it("returns itself, then a [Saint Shamrock] gains the chosen keyword this turn", () => {
    const cardDb = buildCardDb();
    const cerberus = makeChar(CERBERUS.id, 0, "cerberus");
    const shamrock = makeChar(SHAMROCK.id, 0, "shamrock");
    const state = withCharacters(createBattleReadyState(cardDb), [cerberus, shamrock]);

    let step = activate(state, cardDb, cerberus.instanceId, "activate_return_self_grant_keyword");
    expect(step.state.players[0].characters.some((c) => c?.instanceId === cerberus.instanceId)).toBe(false);
    expect(step.state.players[0].hand.at(-1)!.cardId).toBe(CERBERUS.id);

    const choice = step.pendingPrompt?.options;
    if (choice?.promptType !== "PLAYER_CHOICE") throw Error("expected a keyword choice");
    expect(choice.choices.map((c) => c.label)).toEqual(["Rush", "Banish", "Unblockable"]);
    step = resumeFromStack(step.state, { type: "PLAYER_CHOICE", choiceId: choice.choices[2].id } as GameAction, cardDb);
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: [shamrock.instanceId] } as GameAction, cardDb);
    }
    const live = step.state.players[0].characters.find((c) => c?.instanceId === shamrock.instanceId)!;
    expect(hasEffectiveKeyword(live, SHAMROCK, "UNBLOCKABLE", step.state, cardDb)).toBe(true);
    expect(hasEffectiveKeyword(live, SHAMROCK, "RUSH", step.state, cardDb)).toBe(false);
  });
});
