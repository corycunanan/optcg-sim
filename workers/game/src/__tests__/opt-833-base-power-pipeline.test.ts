import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameEvent } from "../types.js";
import { transitionCard } from "../engine/zone-transition.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { registerCardEnteredField, matchTriggersForEvent } from "../engine/triggers.js";
import { getEffectiveBasePower, getEffectivePower } from "../engine/modifiers.js";
import { matchesFilter } from "../engine/conditions.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { koCharacter, trashCharacter } from "../engine/effect-resolver/card-mutations.js";
import { parseStoredSession } from "../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Official cardlist series 569113/569114/569116/569117 and EB04/ST06 searches, checked 2026-09-09.
const printedText: Record<string, string> = {
  "OP16-036": "[On Play] Rest up to 1 of your opponent's Characters with a cost of 4 or less.\n[When Attacking] This Character's base power becomes the same as your opponent's Leader during this turn.",
  "EB04-003": "[Rush] (This card can attack on the turn in which it is played.)\n[Opponent's Turn] Your {Navy} type Leader's base power becomes 7000.",
  "ST06-001": "[Activate: Main] [Once Per Turn] ③ (You may rest the specified number of DON!! cards in your cost area.) You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 0.",

  "OP13-091": "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].\n[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
  "OP13-084": "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects.\n[Your Turn] If you have 10 or more cards in your trash, set the base power of all of your {Five Elders} type Characters to 7000.",
  "OP14-003": "This Character cannot be K.O.'d by effects of your opponent's Characters with 5000 base power or less.",
  "OP14-053": "[Blocker]\n[Opponent's Turn] If you have 7 or less cards in your hand, this Character's base power becomes the same as your Leader's base power.",
  "OP13-002": "[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: Give up to 1 of your opponent's Leader or Character cards −2000 power during this battle.\n[DON!! x1] [Once Per Turn] When you take damage or your Character with 6000 base power or more is K.O.'d, draw 1 card.",
  "OP17-112": "[Your Turn] The base power of all of your Characters with a [Trigger] and 4000 base power becomes 8000.\n[On Play] Draw 1 card, then choose one:\n• Add up to 1 card from the top of your deck to the top of your Life cards.\n• Add up to 1 card from the top of your opponent's Life cards to the owner's hand."
};

const cards: CardData[] = [
  { ...CARDS.VANILLA, id: "OP16-036", name: "Mr.2.Bon.Kurei(Bentham)", cost: 4, power: 1000, color: ["Green"], attribute: ["Strike"], types: ["Impel Down", "Former Baroque Works"] },
  { ...CARDS.VANILLA, id: "EB04-003", name: "Smoker & Tashigi", cost: 8, power: 8000, counter: null, color: ["Red"], attribute: ["Slash", "Special"], types: ["Punk Hazard", "Navy"], keywords: { ...CARDS.VANILLA.keywords, rush: true } },
  { ...CARDS.LEADER, id: "ST06-001", name: "Sakazuki", power: 5000, life: 5, color: ["Black"], attribute: ["Special"], types: ["Navy"] },
  { ...CARDS.VANILLA, id: "OP13-091", name: "St. Marcus Mars", cost: 6, power: 5000, color: ["Black"], attribute: ["Special"], types: ["Celestial Dragons", "Five Elders"] },
  { ...CARDS.VANILLA, id: "OP13-084", name: "St. Shepherd Ju Peter", cost: 7, power: 5000, counter: 2000, color: ["Black"], attribute: ["Special"], types: ["Celestial Dragons", "Five Elders"] },
  { ...CARDS.VANILLA, id: "OP14-003", name: 'Capone"Gang"Bege', cost: 1, power: 2000, color: ["Red"], attribute: ["Ranged"], types: ["Supernovas", "Firetank Pirates"] },
  { ...CARDS.VANILLA, id: "OP14-053", name: "Vista", cost: 3, power: 4000, color: ["Blue"], attribute: ["Slash"], types: ["Whitebeard Pirates"], keywords: { ...CARDS.VANILLA.keywords, blocker: true } },
  { ...CARDS.LEADER, id: "OP13-002", name: "Portgas.D.Ace", power: 6000, life: 3, color: ["Red", "Blue"], attribute: ["Special"], types: ["Whitebeard Pirates"] },
  { ...CARDS.VANILLA, id: "OP17-112", name: "Charlotte Linlin", cost: 10, power: 12000, counter: null, color: ["Yellow"], attribute: ["Special"], types: ["The Four Emperors", "Big Mom Pirates"] },
].map((card) => ({ ...card, effectSchema: getEffectSchema(card.id)!, effectText: printedText[card.id] }));

function fixture() {
  const cardDb = createTestCardDb();
  cards.forEach((data) => cardDb.set(data.id, data));
  let state = createBattleReadyState(cardDb);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  const put = (id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") => {
    const card: CardInstance = { ...state.players[controller].leader, cardId: id, instanceId: `${id}-${controller}-${zone}`, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 0 };
    if (zone === "HAND") state.players[controller].hand.push(card);
    else if (zone === "LEADER") state.players[controller].leader = card;
    else {
      const index = state.players[controller].characters.findIndex((c) => !c);
      state.players[controller].characters[index] = card;
    }
    if (zone !== "HAND") state = registerCardEnteredField(state, card, cardDb.get(id)!);
    return card;
  };
  return { cardDb, put, get state() { return state; } };
}

function playMars(f: ReturnType<typeof fixture>, target: CardInstance) {
  const mars = f.put("OP13-091", 0, "HAND");
  const played = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: mars.instanceId }, f.cardDb, 0);
  expect(played.valid).toBe(true);
  expect(played.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")).toHaveLength(2);
  expect(played.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  let result = resumeFromStack(played.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, f.cardDb);
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") throw new Error("Missing hand cost");
  const handCost = result.pendingPrompt.options.validTargets[0];
  result = resumeFromStack(result.state, { type: "SELECT_TARGET", selectedInstanceIds: [handCost] }, f.cardDb);
  if (result.pendingPrompt) {
    expect(result.pendingPrompt.options.promptType).toBe("SELECT_TARGET");
    result = resumeFromStack(result.state, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] }, f.cardDb);
  }
  expect(result.pendingPrompt).toBeUndefined();
  expect(result.state.players[0].trash.some((c) => c.cardId === CARDS.VANILLA.id || c.instanceId === handCost)).toBe(true);
  return result;
}

function aceVista(handSize = 7, don = true) {
  const f = fixture();
  const ace = f.put("OP13-002", 1, "LEADER");
  const vista = f.put("OP14-053", 1);
  f.state.players[1].hand = Array.from({ length: handSize }, (_, i) => ({ ...vista, cardId: CARDS.VANILLA.id, instanceId: `hand-${i}`, zone: "HAND" }));
  if (don) ace.attachedDon = [{ instanceId: "ace-don", state: "ACTIVE", attachedTo: ace.instanceId }];
  return { f, ace, vista };
}

describe("OPT-833 authored source filter", () => {
  it.each([[10, true, true], [8, true, false], [10, false, false]] as const)("Mars, trash %i, Ju Peter %s: K.O. %s", (trashCount, juPeter, ko) => {
    const f = fixture();
    const bege = f.put("OP14-003", 1);
    if (juPeter) f.put("OP13-084", 0);
    f.state.players[0].trash = Array.from({ length: trashCount }, (_, i) => ({ ...bege, owner: 0, controller: 0, instanceId: `trash-${i}`, zone: "TRASH" }));
    const result = playMars(f, bege);
    expect(result.state.players[1].trash.some((c) => c.cardId === bege.cardId)).toBe(ko);
    expect(result.events.some((e) => e.type === "CARD_KO")).toBe(ko);
  });
});

describe("OPT-833 Vista K.O. last-known base", () => {
  it.each([[7, true, 1], [8, true, 0], [7, false, 0]] as const)("effect K.O., hand %i DON %s draws %i", (handSize, don, draws) => {
    const { f, vista } = aceVista(handSize, don);
    const result = playMars(f, vista);
    expect(result.state.players[1].hand).toHaveLength(handSize + draws);
    const ko = result.events.find((e) => e.type === "CARD_KO");
    expect(ko?.payload?.preKO_basePower).toBe(handSize <= 7 ? 6000 : 4000);
    const trashed = result.state.players[1].trash.find((c) => c.cardId === vista.cardId)!;
    expect(trashed.instanceId).not.toBe(vista.instanceId);
    expect(matchesFilter(trashed, { base_power_exact: 4000 }, f.cardDb, result.state)).toBe(true);
  });

  it("battle K.O. snapshots 6000 and triggers Ace's draw", () => {
    const { f, vista } = aceVista();
    vista.state = "RESTED";
    const attacker = f.put("OP17-112", 0);
    const declared = runPipeline(f.state, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: vista.instanceId }, f.cardDb, 0);
    expect(declared.valid).toBe(true);
    let result: Pick<ReturnType<typeof runPipeline>, "state" | "pendingPrompt"> = declared;
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    result = resumeFromStack(result.state, { type: "PLAYER_CHOICE", choiceId: "skip" }, f.cardDb);
    for (let i = 0; i < 2; i++) {
      const passed = runPipeline(result.state, { type: "PASS" }, f.cardDb, result.state.turn.activePlayerIndex);
      expect(passed.valid).toBe(true);
      result = passed;
    }
    expect(result.state.players[1].hand).toHaveLength(8);
    const ko = result.state.eventLog.find((e) => e.type === "CARD_KO");
    expect(ko?.payload).toMatchObject({ cause: "BATTLE", preKO_basePower: 6000 });
  });

  it("preserves only the event snapshot through durable decode before delayed trigger matching", () => {
    const { f, vista } = aceVista();
    const moved = koCharacter(f.state, vista.instanceId, 0, f.cardDb)!;
    const event = { ...moved.events[0], timestamp: 1 } as GameEvent;
    moved.state.eventLog.push(event);
    const stored = parseStoredSession(JSON.parse(JSON.stringify({ state: moved.state, cardDb: Object.fromEntries(f.cardDb), mode: "PVP" })));
    const restoredEvent = stored.state.eventLog.at(-1)!;
    expect(restoredEvent.type).toBe("CARD_KO");
    expect(matchTriggersForEvent(stored.state, restoredEvent, new Map(Object.entries(stored.cardDb))).map((m) => m.effectBlock.id)).toContain("OP13-002_on_damage_or_ko");
    const historical = { ...restoredEvent, payload: { ...restoredEvent.payload } } as GameEvent;
    if (historical.type !== "CARD_KO") throw new Error("Expected KO");
    delete historical.payload.preKO_basePower;
    expect(matchTriggersForEvent(stored.state, historical, f.cardDb)).toHaveLength(0);
    const trashed = trashCharacter(f.state, vista.instanceId, 0)!;
    expect(trashed.events.every((e) => e.type !== "CARD_KO")).toBe(true);
  });

  it("Vista follows a changed Leader base, excluding Leader additives and DON", () => {
    const { f, ace, vista } = aceVista();
    f.state.activeEffects.push({ id: "leader-set", sourceCardInstanceId: ace.instanceId, sourceEffectBlockId: "set", category: "auto", controller: 1, appliesTo: [ace.instanceId], modifiers: [{ type: "SET_POWER", params: { value: 8000 } }, { type: "MODIFY_POWER", params: { amount: 2000 } }], duration: { type: "THIS_TURN" }, expiresAt: { wave: "END_OF_TURN", turn: f.state.turn.number }, timestamp: 1 });
    expect(getEffectiveBasePower(vista, f.cardDb.get(vista.cardId)!, f.state, f.cardDb)).toBe(8000);
    expect(getEffectivePower(ace, f.cardDb.get(ace.cardId)!, f.state, f.cardDb)).toBe(10000);
  });
});

describe("OPT-833 entry and batch boundaries", () => {
  it("playing authored Linlin pays ten DON and exposes stable changed base during and after its On Play choice", () => {
    const f = fixture();
    const trigger = f.put(CARDS.VANILLA.id, 0);
    f.cardDb.set(trigger.cardId, { ...CARDS.VANILLA, keywords: { ...CARDS.VANILLA.keywords, trigger: true }, triggerText: "[Trigger] Play this card." });
    const linlin = f.put("OP17-112", 0, "HAND");
    f.state.players[0].donCostArea.push(...[8, 9].map((i) => ({ instanceId: `extra-don-${i}`, state: "ACTIVE" as const, attachedTo: null })));
    const played = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: linlin.instanceId }, f.cardDb, 0);
    expect(played.valid).toBe(true);
    expect(played.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")).toHaveLength(0);
    expect(played.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(matchesFilter(trigger, { base_power_exact: 8000 }, f.cardDb, played.state)).toBe(true);
    const restored = parseStoredSession(JSON.parse(JSON.stringify({ state: played.state, cardDb: Object.fromEntries(f.cardDb), mode: "PVP" })));
    const chosen = resumeFromStack(restored.state, { type: "PLAYER_CHOICE", choiceId: "0" }, f.cardDb);
    // The up-to Life action may ask whether to take its one available card.
    let final = chosen;
    if (final.pendingPrompt?.options.promptType === "PLAYER_CHOICE") final = resumeFromStack(final.state, { type: "PLAYER_CHOICE", choiceId: final.pendingPrompt.options.choices[0].id }, f.cardDb);
    expect(final.pendingPrompt).toBeUndefined();
    expect(getEffectiveBasePower(trigger, f.cardDb.get(trigger.cardId)!, final.state, f.cardDb)).toBe(8000);
    expect(matchesFilter(trigger, { base_power_exact: 4000 }, f.cardDb, final.state)).toBe(false);
  });

  it("additive-only Mars boost does not bypass Bege's base-power protection", () => {
    const f = fixture();
    const bege = f.put("OP14-003", 1);
    f.state.activeEffects.push({ id: "buff", sourceCardInstanceId: f.state.players[0].leader.instanceId, sourceEffectBlockId: "buff", category: "auto", controller: 0, appliesTo: [], modifiers: [{ type: "MODIFY_POWER", params: { amount: 5000 }, target: { type: "CHARACTER", controller: "SELF" } }], duration: { type: "THIS_TURN" }, expiresAt: { wave: "END_OF_TURN", turn: f.state.turn.number }, timestamp: 1 });
    const result = playMars(f, bege);
    expect(result.state.players[1].characters.some((c) => c?.cardId === bege.cardId)).toBe(true);
    const mars = result.state.players[0].characters.find((c) => c?.cardId === "OP13-091")!;
    expect(getEffectivePower(mars, f.cardDb.get(mars.cardId)!, result.state, f.cardDb)).toBe(10000);
  });

  it.each([false, true])("simultaneous K.O. captures both modified bases before aura removal, source first %s", (sourceFirst) => {
    const f = fixture();
    const juPeter = f.put("OP13-084", 0);
    const mars = f.put("OP13-091", 0);
    f.state.players[0].trash = Array.from({ length: 10 }, (_, i) => ({ ...mars, instanceId: `trash-${i}`, zone: "TRASH" }));
    const ids = sourceFirst ? [juPeter.instanceId, mars.instanceId] : [mars.instanceId, juPeter.instanceId];
    const result = executeKO(f.state, { type: "KO", target: { type: "CHARACTER", controller: "SELF", count: { all: true } } }, f.state.players[0].leader.instanceId, 0, f.cardDb, new Map(), ids, resolverExecutionServices);
    const ko = result.events.filter((e) => e.type === "CARD_KO");
    expect(ko).toHaveLength(2);
    expect(ko.map((e) => e.payload?.preKO_basePower)).toEqual([7000, 7000]);
  });
});


describe("OPT-833: authored base-copy attack", () => {
  it.each([true, false])("Bon Kurei captures changed Leader base, active Navy aura %s", (withAura) => {
    const f = fixture();
    const leader = f.put("ST06-001", 1, "LEADER");
    const aura = withAura ? f.put("EB04-003", 1) : undefined;
    const attacker = f.put("OP16-036", 0);
    attacker.attachedDon = [{ instanceId: "bon-don", state: "ACTIVE", attachedTo: attacker.instanceId }];
    leader.attachedDon = [{ instanceId: "leader-don", state: "ACTIVE", attachedTo: leader.instanceId }];
    f.state.activeEffects.push({
      id: "leader-additive", sourceCardInstanceId: leader.instanceId, sourceEffectBlockId: "buff", category: "auto", controller: 1,
      appliesTo: [leader.instanceId], modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      duration: { type: "THIS_TURN" }, expiresAt: { wave: "END_OF_TURN", turn: f.state.turn.number }, timestamp: 1,
    });
    const expectedBase = withAura ? 7000 : 5000;
    expect(getEffectiveBasePower(leader, f.cardDb.get(leader.cardId)!, f.state, f.cardDb)).toBe(expectedBase);
    expect(getEffectivePower(leader, f.cardDb.get(leader.cardId)!, f.state, f.cardDb)).toBe(withAura ? 9000 : 7000);
    const attacked = runPipeline(f.state, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId }, f.cardDb, 0);
    expect(attacked.valid).toBe(true);
    expect(attacked.pendingPrompt).toBeUndefined();
    expect(attacked.state.players[0].characters.find((card) => card?.instanceId === attacker.instanceId)?.state).toBe("RESTED");
    expect(getEffectiveBasePower(attacker, f.cardDb.get(attacker.cardId)!, attacked.state, f.cardDb)).toBe(expectedBase);
    expect(getEffectivePower(attacker, f.cardDb.get(attacker.cardId)!, attacked.state, f.cardDb)).toBe(withAura ? 8000 : 6000);
    const afterSourceExit = aura ? transitionCard(attacked.state, aura.instanceId, "TRASH")!.state : attacked.state;
    expect(getEffectiveBasePower(leader, f.cardDb.get(leader.cardId)!, afterSourceExit, f.cardDb)).toBe(5000);
    expect(getEffectiveBasePower(attacker, f.cardDb.get(attacker.cardId)!, afterSourceExit, f.cardDb)).toBe(expectedBase);
    expect(getEffectiveBasePower(attacker, f.cardDb.get(attacker.cardId)!, expireEndOfTurnEffects(afterSourceExit), f.cardDb)).toBe(1000);
  });
});
