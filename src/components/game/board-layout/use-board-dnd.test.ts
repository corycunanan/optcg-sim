import { describe, expect, it } from "vitest";
import type {
  BattleContext,
  CardData,
  CardDb,
  CardInstance,
} from "@shared/game-types";
import { resolveHandCardDropAction } from "./use-board-dnd";

function cardData(
  id: string,
  type: CardData["type"],
  effectText = ""
): CardData {
  return {
    id,
    name: id,
    type,
    color: [],
    cost: 1,
    power: null,
    counter: null,
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

function handCard(cardId: string): CardInstance {
  return {
    instanceId: `${cardId}-instance`,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

const battle: BattleContext = {
  battleId: "battle-1",
  attackerInstanceId: "attacker-1",
  targetInstanceId: "defender-1",
  attackerPower: 5000,
  defenderPower: 5000,
  counterPowerAdded: 0,
  blockerActivated: false,
};

const db: CardDb = {
  "char-1": cardData("char-1", "Character"),
  "event-counter": cardData("event-counter", "Event", "[Counter] Draw 1 card."),
  "event-main": cardData("event-main", "Event", "[Main] Draw 1 card."),
  "stage-1": cardData("stage-1", "Stage"),
};

describe("resolveHandCardDropAction", () => {
  it("uses a Character counter only when dropped on the current defender", () => {
    const drag = { type: "hand-card" as const, card: handCard("char-1") };

    expect(
      resolveHandCardDropAction(
        drag,
        { type: "counter-target", targetInstanceId: "defender-1" },
        db,
        battle
      )
    ).toEqual({
      type: "USE_COUNTER",
      cardInstanceId: "char-1-instance",
      counterTargetInstanceId: "defender-1",
    });
    expect(
      resolveHandCardDropAction(
        drag,
        { type: "counter-target", targetInstanceId: "other-card" },
        db,
        battle
      )
    ).toBeNull();
  });

  it("plays Counter Events on the own-field surface using the battle defender", () => {
    const drag = {
      type: "hand-card" as const,
      card: handCard("event-counter"),
    };

    for (const type of [
      "own-field",
      "character-slot",
      "stage-zone",
      "don-target",
    ]) {
      expect(resolveHandCardDropAction(drag, { type }, db, battle)).toEqual({
        type: "USE_COUNTER_EVENT",
        cardInstanceId: "event-counter-instance",
        counterTargetInstanceId: "defender-1",
      });
    }
  });

  it("plays Main Events on the own field and never treats trash as an action target", () => {
    const drag = { type: "hand-card" as const, card: handCard("event-main") };

    expect(
      resolveHandCardDropAction(drag, { type: "own-field" }, db, null)
    ).toEqual({
      type: "PLAY_CARD",
      cardInstanceId: "event-main-instance",
    });
    expect(
      resolveHandCardDropAction(drag, { type: "counter-trash" }, db, null)
    ).toBeNull();
  });

  it("never plays a Main-only Event while a battle is in progress", () => {
    const drag = { type: "hand-card" as const, card: handCard("event-main") };

    expect(
      resolveHandCardDropAction(drag, { type: "own-field" }, db, battle)
    ).toBeNull();
  });

  it("preserves Character play-to-slot routing", () => {
    const drag = { type: "hand-card" as const, card: handCard("char-1") };

    expect(
      resolveHandCardDropAction(
        drag,
        { type: "character-slot", slotIndex: 3 },
        db,
        null
      )
    ).toEqual({
      type: "PLAY_CARD",
      cardInstanceId: "char-1-instance",
      position: 3,
    });
  });

  it("hard-rejects immutable card type and zone mismatches", () => {
    const characterDrag = {
      type: "hand-card" as const,
      card: handCard("char-1"),
    };
    const stageDrag = {
      type: "hand-card" as const,
      card: handCard("stage-1"),
    };

    expect(
      resolveHandCardDropAction(characterDrag, { type: "stage-zone" }, db, null)
    ).toBeNull();
    expect(
      resolveHandCardDropAction(
        stageDrag,
        { type: "character-slot", slotIndex: 0 },
        db,
        null
      )
    ).toBeNull();
    expect(
      resolveHandCardDropAction(stageDrag, { type: "stage-zone" }, db, null)
    ).toEqual({
      type: "PLAY_CARD",
      cardInstanceId: "stage-1-instance",
    });
  });
});
