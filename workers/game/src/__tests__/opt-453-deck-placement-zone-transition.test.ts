/**
 * OPT-453 — Deck-placement costs complete the canonical zone transition.
 *
 * applyCostSelection's deck-placement branches used to copy field Characters
 * into the deck manually: the old field instanceId survived (violating rules
 * §3-1-6, "a card leaving the Character area becomes a new card"), no
 * CARD_RETURNED_TO_DECK was emitted, and — because deck-placement costs also
 * resolve on prompt-resume paths that never reach the pipeline's event-driven
 * cleanup — the departed card's triggers and permanent effects stayed
 * registered. Live repro: OP15-041 Orlumbus pays its unfiltered cost with
 * OP16-003 Edward.Newgate, whose permanent leader buff (Double Attack, +2000)
 * stayed active with its source in the deck.
 *
 * Now every field card paid into the deck gets a fresh instanceId, the old
 * instance's registrations are cleaned up inline, and CARD_RETURNED_TO_DECK
 * is emitted per moved field card. Covers PLACE_OWN_CHARACTER_TO_DECK,
 * PLACE_SELF_AND_TRASH_TO_DECK, and PLACE_STAGE_TO_DECK.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, EffectBlock, RuntimeActiveEffect } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { payCosts, payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import {
  matchTriggersForEvent,
  registerPermanentEffectsForCard,
  registerTriggersForCard,
} from "../engine/triggers.js";
import { hasGrantedKeyword } from "../engine/modifiers.js";
import { OP15_041_ORLUMBUS } from "../engine/schemas/op15.js";
import { OP16_003_EDWARD_NEWGATE, OP16_041_BUGGY } from "../engine/schemas/op16.js";
import { OP05_040_BIRDCAGE } from "../engine/schemas/op05.js";
import { OP10_026_KINEMON } from "../engine/schemas/op10.js";
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

const ORLUMBUS = makeCard("OP15-041", { name: "Orlumbus", cost: 4, power: 5000, effectSchema: OP15_041_ORLUMBUS });
const NEWGATE = makeCard("OP16-003", { name: "Edward.Newgate", cost: 9, power: 9000, effectSchema: OP16_003_EDWARD_NEWGATE });
const BIRDCAGE = makeCard("OP05-040", { name: "Birdcage", type: "Stage", cost: 2, power: null, effectSchema: OP05_040_BIRDCAGE });
const DOFLA_LEADER = makeCard("LEADER-DOFLA", { name: "Donquixote Doflamingo", type: "Leader", cost: null, power: 5000, life: 5 });

function buildCardDb(): Map<string, CardData> {
  const db = createTestCardDb();
  for (const c of [ORLUMBUS, NEWGATE, BIRDCAGE, DOFLA_LEADER]) db.set(c.id, c);
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

describe("OPT-453 — OP15-041 + OP16-003 live repro (production path)", () => {
  function setup(): { state: GameState; cardDb: Map<string, CardData>; newgate: CardInstance; orlumbus: CardInstance } {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const orlumbus = makeChar(ORLUMBUS.id, 0, "orlumbus");
    const newgate = makeChar(NEWGATE.id, 0, "newgate");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([orlumbus, newgate]) };
    state = { ...state, players };
    // Field entry registrations, as the pipeline does on play.
    state = registerTriggersForCard(state, newgate, NEWGATE);
    state = registerPermanentEffectsForCard(state, newgate, NEWGATE);
    return { state, cardDb, newgate, orlumbus };
  }

  it("paying Newgate into the deck expires his leader buff and deregisters his triggers", () => {
    const { state, cardDb, newgate, orlumbus } = setup();

    // Sanity: the permanent buff is live before payment (own turn).
    expect(hasGrantedKeyword(state.players[0].leader, "DOUBLE_ATTACK", state, cardDb)).toBe(true);
    expect((state.activeEffects as RuntimeActiveEffect[]).some(
      (e) => e.sourceCardInstanceId === newgate.instanceId,
    )).toBe(true);

    // Activate Orlumbus — the unfiltered cost offers both characters, prompts.
    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: orlumbus.instanceId, effectId: "OP15-041_activate" },
      cardDb,
      0,
    );
    expect(activation.valid).toBe(true);
    const afterAccept = activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT"
      ? resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb)
      : { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt };
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const done = resumeFromStack(
      afterAccept.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [newgate.instanceId] } as GameAction,
      cardDb,
    );

    // The buff is gone — its source left the field (rule 3-1-6).
    const final = done.state;
    expect((final.activeEffects as RuntimeActiveEffect[]).some(
      (e) => e.sourceCardInstanceId === newgate.instanceId,
    )).toBe(false);
    expect(hasGrantedKeyword(final.players[0].leader, "DOUBLE_ATTACK", final, cardDb)).toBe(false);

    // Triggers deregistered.
    expect(final.triggerRegistry.some(
      (t) => (t as { sourceCardInstanceId?: string }).sourceCardInstanceId === newgate.instanceId,
    )).toBe(false);

    // The deck card is a NEW instance with canonical reset fields.
    const bottom = final.players[0].deck.at(-1)!;
    expect(bottom.cardId).toBe(NEWGATE.id);
    expect(bottom.instanceId).not.toBe(newgate.instanceId);
    expect(bottom.turnPlayed).toBeNull();
    expect(bottom.state).toBe("ACTIVE");
    expect(bottom.attachedDon).toHaveLength(0);

    // The field exit is announced.
    expect(done.events.some(
      (e) => e.type === "CARD_RETURNED_TO_DECK" && e.payload?.cardInstanceId === newgate.instanceId,
    )).toBe(true);

    // Orlumbus got his Rush and the match is not wedged.
    expect(hasGrantedKeyword(
      final.players[0].characters.find((c) => c?.instanceId === orlumbus.instanceId)!,
      "RUSH", final, cardDb,
    )).toBe(true);
    expect(final.effectStack).toHaveLength(0);
  });
});

describe("OPT-453 — compound self+trash cost: DON return and fresh identity", () => {
  const KINEMON_FIELD = makeCard("OP10-026", { name: "Kin'emon", cost: 4, power: 5000, effectSchema: OP10_026_KINEMON });
  const KINEMON_TRASH = makeCard("TRASH-KIN", { name: "Kin'emon", cost: 3, power: 0 });

  it("returns attached DON rested and re-ids only the field half", () => {
    const cardDb = buildCardDb();
    cardDb.set(KINEMON_FIELD.id, KINEMON_FIELD);
    cardDb.set(KINEMON_TRASH.id, KINEMON_TRASH);

    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      ...makeChar(KINEMON_FIELD.id, 0, "kinemon"),
      attachedDon: [
        { instanceId: "don-att-1", state: "ACTIVE" as const, attachedTo: "char-0-kinemon" },
        { instanceId: "don-att-2", state: "ACTIVE" as const, attachedTo: "char-0-kinemon" },
      ],
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([source]),
      trash: [{
        instanceId: "trash-kin-0",
        cardId: KINEMON_TRASH.id,
        zone: "TRASH",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller: 0,
        owner: 0,
      }],
    };
    state = { ...state, players };
    const donBefore = state.players[0].donCostArea.length;

    const cost: Cost = {
      type: "PLACE_SELF_AND_TRASH_TO_DECK",
      amount: 1,
      filter: { name: "Kin'emon", power_exact: 0 },
      position: "BOTTOM",
    } as Cost;
    const block = OP10_026_KINEMON.effects[0] as EffectBlock;

    // Single candidate → straight to arrange.
    const pay = payCostsWithSelection(state, [cost], 0, 0, cardDb, source.instanceId, block);
    expect(pay.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    const done = resumeFromStack(
      pay.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: [source.instanceId, "trash-kin-0"],
        destination: "bottom",
      } as GameAction,
      cardDb,
    );

    const p0 = done.state.players[0];
    // Attached DON returned to the cost area, rested and detached.
    expect(p0.donCostArea.length).toBe(donBefore + 2);
    const returned = p0.donCostArea.filter((d) => d.instanceId.startsWith("don-att-"));
    expect(returned).toHaveLength(2);
    for (const d of returned) {
      expect(d.state).toBe("RESTED");
      expect(d.attachedTo).toBeNull();
    }

    // Field half: fresh id; trash half: identity retained.
    const placed = p0.deck.slice(-2);
    expect(placed.map((c) => c.cardId)).toEqual([KINEMON_FIELD.id, KINEMON_TRASH.id]);
    expect(placed[0].instanceId).not.toBe(source.instanceId);
    expect(placed[0].attachedDon).toHaveLength(0);
    expect(placed[1].instanceId).toBe("trash-kin-0");

    // Field exit announced for the self half only.
    const returnedEvents = done.events.filter((e) => e.type === "CARD_RETURNED_TO_DECK");
    expect(returnedEvents).toHaveLength(1);
    expect(returnedEvents[0].payload?.cardInstanceId).toBe(source.instanceId);
  });
});

describe("OPT-453 — PLACE_STAGE_TO_DECK completes the field exit", () => {
  it("expires the stage's registered aura and re-ids the deck card", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: { ...players[0].leader, cardId: DOFLA_LEADER.id },
      stage: {
        instanceId: "stage-0-birdcage",
        cardId: BIRDCAGE.id,
        zone: "STAGE",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: 1,
        controller: 0,
        owner: 0,
      },
    };
    state = { ...state, players };
    state = registerPermanentEffectsForCard(state, players[0].stage!, BIRDCAGE);
    expect(state.prohibitions).toHaveLength(1);

    const result = payCosts(state, [{ type: "PLACE_STAGE_TO_DECK" } as Cost], 0, cardDb, "stage-0-birdcage");
    expect(result).not.toBeNull();
    const { state: next, events } = result!;

    // Birdcage's registered CANNOT_REFRESH aura is gone with its source.
    expect(next.prohibitions).toHaveLength(0);
    expect(next.players[0].stage).toBeNull();

    const bottom = next.players[0].deck.at(-1)!;
    expect(bottom.cardId).toBe(BIRDCAGE.id);
    expect(bottom.instanceId).not.toBe("stage-0-birdcage");
    expect(bottom.turnPlayed).toBeNull();

    expect(events.some(
      (e) => e.type === "CARD_RETURNED_TO_DECK" && e.payload?.cardInstanceId === "stage-0-birdcage",
    )).toBe(true);
  });

  it("rejects a stage that does not match the printed cost.filter", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      stage: {
        instanceId: "stage-0-birdcage",
        cardId: BIRDCAGE.id, // cost 2
        zone: "STAGE",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: 1,
        controller: 0,
        owner: 0,
      },
    };
    state = { ...state, players };

    // "place 1 of your cost-1 Stages ..." — a cost-2 Birdcage cannot pay.
    const cost: Cost = { type: "PLACE_STAGE_TO_DECK", filter: { cost_exact: 1 } } as Cost;
    expect(payCosts(state, [cost], 0, cardDb, "stage-0-birdcage")).toBeNull();
    expect(state.players[0].stage).not.toBeNull();
  });
});

describe("OPT-453 — review fixes: resume trigger scan + unresolvable-target filters", () => {
  const IMPEL_CHAR = makeCard("IMPEL-1", { name: "Prisoner", cost: 1, power: 1000, types: ["Impel Down"] });
  const PRISONER = makeCard("OP16-042", { name: "Prisoner of Impel Down", cost: 1, power: 1000 });
  const BUGGY_LEADER = makeCard("OP16-041", { name: "Buggy", type: "Leader", cost: null, power: 5000, life: 4, effectSchema: OP16_041_BUGGY });

  function buggyDb(): Map<string, CardData> {
    const db = buildCardDb();
    for (const c of [IMPEL_CHAR, PRISONER, BUGGY_LEADER]) db.set(c.id, c);
    return db;
  }

  it("a prompted deck-placement cost queues OP16-041's removed-from-field watcher", () => {
    const cardDb = buggyDb();
    let state = createBattleReadyState(cardDb);
    const orlumbus = makeChar(ORLUMBUS.id, 0, "orlumbus");
    const impel = makeChar(IMPEL_CHAR.id, 0, "impel");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      // Buggy leader with DON!!x1 attached; a Prisoner in hand to play.
      leader: { ...players[0].leader, cardId: BUGGY_LEADER.id, attachedDon: [
        { instanceId: "don-leader", state: "RESTED" as const, attachedTo: players[0].leader.instanceId },
      ] },
      characters: padChars([orlumbus, impel]),
      hand: [{
        instanceId: "hand-prisoner",
        cardId: PRISONER.id,
        zone: "HAND",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller: 0,
        owner: 0,
      }, ...players[0].hand],
    };
    state = { ...state, players };
    state = registerTriggersForCard(state, state.players[0].leader, BUGGY_LEADER);

    // Activate Orlumbus and pay the prompted cost with the Impel Down char.
    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: orlumbus.instanceId, effectId: "OP15-041_activate" },
      cardDb,
      0,
    );
    expect(activation.valid).toBe(true);
    const afterAccept = activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT"
      ? resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb)
      : { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: false };
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const done = resumeFromStack(
      afterAccept.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [impel.instanceId] } as GameAction,
      cardDb,
    );

    // The removed-from-field watcher fires on the resume path: Buggy's
    // optional once-per-turn effect surfaces as the next prompt instead of
    // being silently dropped (pre-fix: resume cost events were never scanned).
    expect(done.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  });

  it("a stage payment does not satisfy OP16-041's Character-only target filter", () => {
    const cardDb = buggyDb();
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: { ...players[0].leader, cardId: BUGGY_LEADER.id, attachedDon: [
        { instanceId: "don-leader", state: "RESTED" as const, attachedTo: players[0].leader.instanceId },
      ] },
    };
    state = { ...state, players };
    state = registerTriggersForCard(state, state.players[0].leader, BUGGY_LEADER);

    // Post-transition event: the paid stage's old instanceId is unresolvable
    // by design. The filter must evaluate the payload snapshot (a Stage) and
    // fail — not silently pass (pre-fix false positive).
    const stageEvent = {
      type: "CARD_RETURNED_TO_DECK" as const,
      playerIndex: 0 as const,
      payload: { cardInstanceId: "gone-stage", cardId: BIRDCAGE.id },
      timestamp: 0,
    };
    expect(matchTriggersForEvent(state, stageEvent as any, cardDb)).toHaveLength(0);

    // Positive control: an unresolvable CHARACTER with the Impel Down trait
    // still matches through the same snapshot path.
    const charEvent = {
      type: "CARD_RETURNED_TO_DECK" as const,
      playerIndex: 0 as const,
      payload: { cardInstanceId: "gone-char", cardId: IMPEL_CHAR.id },
      timestamp: 0,
    };
    expect(matchTriggersForEvent(state, charEvent as any, cardDb)).toHaveLength(1);
  });

  it("target-side cleanup: another card's effect stops listing the departed instance", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const orlumbus = makeChar(ORLUMBUS.id, 0, "orlumbus");
    const newgate = makeChar(NEWGATE.id, 0, "newgate");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([orlumbus, newgate]) };
    state = { ...state, players };

    // An effect sourced by a DIFFERENT card that targets Newgate and a
    // surviving bystander — expireTargetLeftZone must strip only Newgate.
    const buff = {
      id: "aoe-buff",
      sourceCardInstanceId: orlumbus.instanceId,
      sourceEffectBlockId: "",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: 3 },
      controller: 0,
      appliesTo: [newgate.instanceId, orlumbus.instanceId],
      timestamp: 0,
    };
    state = { ...state, activeEffects: [...state.activeEffects, buff as any] };

    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: orlumbus.instanceId, effectId: "OP15-041_activate" },
      cardDb,
      0,
    );
    const afterAccept = activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT"
      ? resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb)
      : { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: false };
    const done = resumeFromStack(
      afterAccept.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [newgate.instanceId] } as GameAction,
      cardDb,
    );

    const survived = (done.state.activeEffects as RuntimeActiveEffect[]).find((e) => e.id === "aoe-buff");
    expect(survived).toBeDefined();
    expect(survived!.appliesTo).toEqual([orlumbus.instanceId]);
  });
});
