import { describe, expect, it } from "vitest";
import type { CardData, CardInstance } from "@shared/game-types";
import { grantsStageCounter, isCounterEligibleCard, isCounterEvent } from "./counter-eligibility";

function card(
  type: CardData["type"],
  counter: number | null,
  effectText = "",
): CardData {
  return {
    id: `${type}-${counter}`,
    name: type,
    type,
    color: [],
    cost: null,
    power: null,
    counter,
    life: null,
    attribute: [],
    types: [],
    effectText,
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: null,
    imageUrl: null,
  };
}

describe("isCounterEligibleCard", () => {
  it.each([null, 0, 1000, 2000])(
    "keeps a Character with printed counter %s attemptable for rule mods",
    (counter) => {
      expect(isCounterEligibleCard(card("Character", counter))).toBe(true);
    },
  );

  it("accepts only Events with a printed [Counter] effect", () => {
    const counterEvent = card("Event", null, "[Counter] Draw 1 card.");
    const mainEvent = card("Event", null, "[Main] Draw 1 card.");
    expect(isCounterEvent(counterEvent)).toBe(true);
    expect(isCounterEligibleCard(counterEvent)).toBe(true);
    expect(isCounterEvent(mainEvent)).toBe(false);
    expect(isCounterEligibleCard(mainEvent)).toBe(false);
  });

  it("rejects non-counter card types and missing card data", () => {
    expect(isCounterEligibleCard(card("Leader", null))).toBe(false);
    expect(isCounterEligibleCard(card("Stage", null))).toBe(false);
    expect(isCounterEligibleCard(undefined)).toBe(false);
  });
});

describe("OPT-1046 Stage counters", () => {
  const franky: CardData = {
    ...card("Leader", null),
    id: "OP18-021",
    effectSchema: {
      effects: [{ id: "stage_counter", category: "rule_modification", rule: { rule_type: "COUNTER_GRANT", value: 3000, filter: { card_type: "STAGE" } } }],
    },
  };
  const other: CardData = { ...card("Leader", null), id: "OTHER" };
  const instance = (cardId: string): CardInstance => ({
    instanceId: `${cardId}-i`, cardId, zone: "LEADER", state: "ACTIVE", attachedDon: [], turnPlayed: null, controller: 0, owner: 0,
  });

  it("detects a field card that grants Stage cards a Counter", () => {
    const db = { [franky.id]: franky, [other.id]: other };
    expect(grantsStageCounter({ leader: instance(franky.id), characters: [], stage: null }, db)).toBe(true);
    expect(grantsStageCounter({ leader: instance(other.id), characters: [], stage: null }, db)).toBe(false);
    expect(grantsStageCounter(null, db)).toBe(false);
  });

  it("offers a Stage only while a Stage Counter is granted", () => {
    expect(isCounterEligibleCard(card("Stage", null), { stageCounterGranted: true })).toBe(true);
    expect(isCounterEligibleCard(card("Stage", null), { stageCounterGranted: false })).toBe(false);
  });
});
