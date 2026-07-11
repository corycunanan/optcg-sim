/**
 * OPT-455 — two encoding/read-surface corrections:
 *
 * 1. ST13-001 Sabo's cost is printed "add 1 of your Characters with a cost
 *    of 3 or more and 7000 power or more to the top of your Life cards
 *    face-up" but was encoded as PLACE_OWN_CHARACTER_TO_DECK — the payment
 *    resolved into the deck. New ADD_OWN_CHARACTER_TO_LIFE cost pays into
 *    Life (top, face-up, fresh instance per rules §3-1-6, canonical
 *    field-exit cleanup).
 *
 * 2. Non-field stat reads used field-modified stats: matchesFilter's power
 *    filters computed effective power with active field auras, so a broad
 *    "+1000 to all your Characters" aura shifted a trash card's eligibility
 *    for OP10-026's "[Kin'emon] with 0 power from your trash". Power reads
 *    for cards outside the field now return printed power.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, RuntimeActiveEffect } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { matchesFilter } from "../engine/conditions.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerPermanentEffectsForCard, registerTriggersForCard } from "../engine/triggers.js";
import { ST13_001_SABO } from "../engine/schemas/st13.js";
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

const SABO_LEADER = makeCard("ST13-001", { name: "Sabo", type: "Leader", cost: null, power: 5000, life: 4, effectSchema: ST13_001_SABO });
const BIG_CHAR = makeCard("BIG-7K", { name: "Big Seven", cost: 4, power: 7000 });
const SMALL_CHAR = makeCard("SMALL-5K", { name: "Small Five", cost: 2, power: 5000 });

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

describe("OPT-455 — ST13-001 pays its cost into Life, not the deck", () => {
  function saboBoard(): { state: GameState; cardDb: Map<string, CardData>; big: CardInstance } {
    const cardDb = createTestCardDb();
    for (const c of [SABO_LEADER, BIG_CHAR, SMALL_CHAR]) cardDb.set(c.id, c);
    let state = createBattleReadyState(cardDb);
    const big = makeChar(BIG_CHAR.id, 0, "big");
    const small = makeChar(SMALL_CHAR.id, 0, "small");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: {
        ...players[0].leader,
        cardId: SABO_LEADER.id,
        attachedDon: [{ instanceId: "don-sabo", state: "RESTED" as const, attachedTo: players[0].leader.instanceId }],
      },
      characters: padChars([big, small]),
    };
    state = { ...state, players };
    return { state, cardDb, big };
  }

  it("the paid Character lands on top of Life face-up as a fresh instance", () => {
    const { state, cardDb, big } = saboBoard();
    const lifeBefore = state.players[0].life.length;
    const deckBefore = state.players[0].deck.length;

    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: state.players[0].leader.instanceId, effectId: "activate_add_to_life_buff" },
      cardDb,
      0,
    );
    expect(activation.valid).toBe(true);
    // Optional effect → accept; only BIG_CHAR matches cost≥3 & power≥7000 →
    // single candidate, but the cost still resolves through payment.
    let step = activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT"
      ? resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb)
      : { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: false };
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: [big.instanceId] } as GameAction, cardDb);
    }

    const p0 = step.state.players[0];
    // Into Life (top, face-up, fresh instance) — NOT the deck.
    expect(p0.life.length).toBe(lifeBefore + 1);
    expect(p0.deck.length).toBe(deckBefore);
    expect(p0.life[0].cardId).toBe(BIG_CHAR.id);
    expect((p0.life[0] as { face?: string }).face).toBe("UP");
    expect(p0.life[0].instanceId).not.toBe(big.instanceId);
    expect(p0.characters.some((c) => c?.instanceId === big.instanceId)).toBe(false);
    expect(step.events.some((event) => event.type === "CARD_TRASHED")).toBe(false);
  });

  it("the buff action continues after the cost is paid", () => {
    const { state, cardDb, big } = saboBoard();
    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: state.players[0].leader.instanceId, effectId: "activate_add_to_life_buff" },
      cardDb,
      0,
    );
    let step = activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT"
      ? resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb)
      : { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: false };
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: [big.instanceId] } as GameAction, cardDb);
    }
    // The +2000 buff targets the remaining SMALL_CHAR ("up to 1 of your
    // Characters") — resolve its target prompt if one appears.
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: ["char-0-small"] } as GameAction, cardDb);
    }
    const small = step.state.players[0].characters.find((c) => c?.instanceId === "char-0-small")!;
    expect(getEffectivePower(small, SMALL_CHAR, step.state, cardDb)).toBe(7000); // 5000 + 2000
    expect(step.state.effectStack).toHaveLength(0);
  });

  it("cost/power boundaries are enforced independently", () => {
    const cardDb = createTestCardDb();
    const cheapStrong = makeCard("CHEAP-7K", { cost: 2, power: 7000 });   // fails cost_min only
    const bigWeak = makeCard("BIG-6K", { cost: 4, power: 6000 });         // fails power_min only
    for (const c of [SABO_LEADER, cheapStrong, bigWeak]) cardDb.set(c.id, c);
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([makeChar(cheapStrong.id, 0, "cheap"), makeChar(bigWeak.id, 0, "weak")]),
    };
    state = { ...state, players };
    const cost: Cost = {
      type: "ADD_OWN_CHARACTER_TO_LIFE",
      filter: { cost_min: 3, power_min: 7000 },
      position: "TOP",
      face: "UP",
    } as Cost;
    // Either predicate failing alone must disqualify the candidate.
    expect(isCostPayable(state, cost, 0, cardDb, state.players[0].leader.instanceId)).toBe(false);
  });

  it("rejects empty or out-of-offer cost selections", () => {
    const cardDb = createTestCardDb();
    const big2 = makeCard("BIG-7K-2", { name: "Big Seven Two", cost: 4, power: 7000 });
    for (const c of [SABO_LEADER, BIG_CHAR, big2, SMALL_CHAR]) cardDb.set(c.id, c);
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: {
        ...players[0].leader,
        cardId: SABO_LEADER.id,
        attachedDon: [{ instanceId: "don-sabo", state: "RESTED" as const, attachedTo: players[0].leader.instanceId }],
      },
      // Two qualifying candidates → a genuine selection prompt.
      characters: padChars([
        makeChar(BIG_CHAR.id, 0, "big"),
        makeChar(big2.id, 0, "big2"),
        makeChar(SMALL_CHAR.id, 0, "small"),
      ]),
    };
    state = { ...state, players };
    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: state.players[0].leader.instanceId, effectId: "activate_add_to_life_buff" },
      cardDb,
      0,
    );
    let step = resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);
    expect(step.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const lifeBefore = step.state.players[0].life.length;

    // Empty selection: rejected — nothing paid, nothing resolved.
    const empty = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: [] } as GameAction, cardDb);
    expect(empty.resolved).toBe(false);
    expect(empty.events).toHaveLength(0);

    // Non-offered card (fails the printed filter): rejected the same way.
    const smuggled = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: ["char-0-small"] } as GameAction, cardDb);
    expect(smuggled.resolved).toBe(false);
    expect(smuggled.state.players[0].life).toHaveLength(lifeBefore);
    expect(smuggled.state.players[0].characters.some((c) => c?.instanceId === "char-0-small")).toBe(true);
  });

  it("unpayable without a qualifying Character", () => {
    const cardDb = createTestCardDb();
    for (const c of [SABO_LEADER, SMALL_CHAR]) cardDb.set(c.id, c);
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([makeChar(SMALL_CHAR.id, 0, "small")]) };
    state = { ...state, players };
    const cost: Cost = {
      type: "ADD_OWN_CHARACTER_TO_LIFE",
      filter: { cost_min: 3, power_min: 7000 },
      position: "TOP",
      face: "UP",
    } as Cost;
    expect(isCostPayable(state, cost, 0, cardDb, state.players[0].leader.instanceId)).toBe(false);
  });

  it("cleans up the paid Character's registrations and returns its DON", () => {
    const cardDb = createTestCardDb();
    // Give the paid character a registered permanent aura to observe cleanup.
    const AURA_BIG = makeCard("AURA-7K", {
      name: "Aura Seven", cost: 4, power: 7000,
      effectSchema: {
        effects: [{
          id: "self_buff_aura",
          category: "permanent",
          modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
        }],
      } as never,
    });
    for (const c of [SABO_LEADER, AURA_BIG]) cardDb.set(c.id, c);
    let state = createBattleReadyState(cardDb);
    const big: CardInstance = {
      ...makeChar(AURA_BIG.id, 0, "aurabig"),
      attachedDon: [{ instanceId: "don-big", state: "ACTIVE" as const, attachedTo: "char-0-aurabig" }],
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: {
        ...players[0].leader,
        cardId: SABO_LEADER.id,
        attachedDon: [{ instanceId: "don-sabo", state: "RESTED" as const, attachedTo: players[0].leader.instanceId }],
      },
      characters: padChars([big]),
    };
    state = { ...state, players };
    state = registerTriggersForCard(state, big, AURA_BIG);
    state = registerPermanentEffectsForCard(state, big, AURA_BIG);
    expect((state.activeEffects as RuntimeActiveEffect[]).some((e) => e.sourceCardInstanceId === big.instanceId)).toBe(true);
    const donBefore = state.players[0].donCostArea.length;

    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: state.players[0].leader.instanceId, effectId: "activate_add_to_life_buff" },
      cardDb,
      0,
    );
    let step = activation.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT"
      ? resumeFromStack(activation.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb)
      : { state: activation.state, events: [], pendingPrompt: activation.pendingPrompt, resolved: false };
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(step.state, { type: "SELECT_TARGET", selectedInstanceIds: [big.instanceId] } as GameAction, cardDb);
    }

    const final = step.state;
    expect((final.activeEffects as RuntimeActiveEffect[]).some((e) => e.sourceCardInstanceId === big.instanceId)).toBe(false);
    expect(final.triggerRegistry.some(
      (t) => (t as { sourceCardInstanceId?: string }).sourceCardInstanceId === big.instanceId,
    )).toBe(false);
    const returned = final.players[0].donCostArea.find((d) => d.instanceId === "don-big");
    expect(final.players[0].donCostArea.length).toBe(donBefore + 1);
    expect(returned?.state).toBe("RESTED");
    expect(returned?.attachedTo).toBeNull();
  });
});

describe("OPT-455 — non-field stat reads use printed power", () => {
  const KINEMON_TRASH = makeCard("TRASH-KIN", { name: "Kin'emon", cost: 3, power: 0 });

  function stateWithAura(): { state: GameState; cardDb: Map<string, CardData>; trashKin: CardInstance; fieldChar: CardInstance } {
    const cardDb = createTestCardDb();
    cardDb.set(KINEMON_TRASH.id, KINEMON_TRASH);
    let state = createBattleReadyState(cardDb);
    const fieldChar = makeChar(CARDS.VANILLA.id, 0, "field");
    const trashKin: CardInstance = {
      instanceId: "trash-kin-0",
      cardId: KINEMON_TRASH.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([fieldChar]), trash: [trashKin] };
    state = { ...state, players };
    // Broad population aura: +1000 to ALL of player 0's characters. Its
    // dynamic target matching has no zone gate — pre-fix it leaked into
    // trash reads.
    const aura: RuntimeActiveEffect = {
      id: "broad-power-aura",
      sourceCardInstanceId: fieldChar.instanceId,
      sourceEffectBlockId: "",
      category: "permanent",
      modifiers: [{
        type: "MODIFY_POWER",
        target: { type: "ALL_YOUR_CHARACTERS" },
        params: { amount: 1000 },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 0,
    } as never;
    state = { ...state, activeEffects: [...state.activeEffects, aura as never] };
    return { state, cardDb, trashKin, fieldChar };
  }

  it("a trash card's power filter reads printed power despite a field aura", () => {
    const { state, cardDb, trashKin } = stateWithAura();
    // Printed 0 power → still matches "with 0 power" (pre-fix the aura made
    // the trash read 1000 and the filter fail).
    expect(getEffectivePower(trashKin, KINEMON_TRASH, state, cardDb)).toBe(0);
    expect(matchesFilter(trashKin, { name: "Kin'emon", power_exact: 0 }, cardDb, state)).toBe(true);
  });

  it("on-field power reads still include the aura (sanity)", () => {
    const { state, cardDb, fieldChar } = stateWithAura();
    expect(getEffectivePower(fieldChar, CARDS.VANILLA, state, cardDb)).toBe(5000); // 4000 + 1000
  });

  it("hand and deck power reads are printed too", () => {
    const { state, cardDb } = stateWithAura();
    const inHand: CardInstance = {
      instanceId: "hand-kin",
      cardId: KINEMON_TRASH.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    expect(getEffectivePower(inHand, KINEMON_TRASH, state, cardDb)).toBe(0);
    expect(getEffectivePower({ ...inHand, instanceId: "deck-kin", zone: "DECK" }, KINEMON_TRASH, state, cardDb)).toBe(0);
    expect(getEffectivePower({ ...inHand, instanceId: "life-kin", zone: "LIFE" as never }, KINEMON_TRASH, state, cardDb)).toBe(0);
  });
});
