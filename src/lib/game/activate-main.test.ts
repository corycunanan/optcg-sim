import { describe, expect, it } from "vitest";
import type { CardData, CardDb, CardInstance } from "@shared/game-types";
import {
  canOpenActivateMainMenu,
  getActivateMainState,
} from "./activate-main";

const instance: CardInstance = {
  instanceId: "field-card",
  cardId: "TEST-001",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

function cardData(effectSchema: unknown): CardData {
  return {
    id: instance.cardId,
    name: "Test Card",
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: 1000,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
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
    effectSchema,
    imageUrl: null,
  };
}

describe("getActivateMainState", () => {
  it("finds ACTIVATE_MAIN blocks and reports unused repeatable effects", () => {
    const cardDb: CardDb = {
      [instance.cardId]: cardData({
        effects: [
          { id: "passive", category: "permanent" },
          {
            id: "activate",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
          },
        ],
      }),
    };

    expect(getActivateMainState(instance, cardDb)).toEqual({
      effectId: "activate",
      oncePerTurn: false,
      usedThisTurn: false,
    });
  });

  it("reads canonical and legacy once-per-turn markers from turn state", () => {
    for (const block of [
      {
        id: "activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        flags: { once_per_turn: true },
      },
      {
        id: "activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN", once_per_turn: true },
      },
    ]) {
      const cardDb: CardDb = {
        [instance.cardId]: cardData({ effects: [block] }),
      };
      expect(
        getActivateMainState(instance, cardDb, {
          activate: [instance.instanceId],
        }),
      ).toMatchObject({ oncePerTurn: true, usedThisTurn: true });
    }
  });

  it("returns null when the schema has no Activate: Main effect", () => {
    const cardDb: CardDb = {
      [instance.cardId]: cardData({ effects: [] }),
    };
    expect(getActivateMainState(instance, cardDb)).toBeNull();
  });
});

describe("canOpenActivateMainMenu", () => {
  it("gives selection precedence and suppresses noninteractive boards", () => {
    expect(
      canOpenActivateMainMenu({
        hasEffect: true,
        hasSelectionAction: false,
        inputSuppressed: false,
      }),
    ).toBe(true);
    expect(
      canOpenActivateMainMenu({
        hasEffect: true,
        hasSelectionAction: true,
        inputSuppressed: false,
      }),
    ).toBe(false);
    expect(
      canOpenActivateMainMenu({
        hasEffect: true,
        hasSelectionAction: false,
        inputSuppressed: true,
      }),
    ).toBe(false);
  });
});
