import { describe, expect, it } from "vitest";
import type { CardDb, GameEvent } from "@shared/game-types";
import { formatEvent } from "./event-log";

const cardDb = {
  "OP01-029": { name: "Radical Beam!!" },
  "OP01-030": { name: "In Two Years!! At the Sabaody Archipelago!!" },
} as unknown as CardDb;

describe("formatEvent public reveals", () => {
  it("records every public card name in the durable game log", () => {
    const gameEvent: GameEvent = {
      type: "CARDS_REVEALED",
      playerIndex: 1,
      timestamp: 1,
      payload: {
        cards: [
          { cardId: "OP01-029", instanceId: "a" },
          { cardId: "OP01-030", instanceId: "b" },
        ],
        visibility: "BOTH",
      },
    };

    expect(formatEvent(gameEvent, cardDb, 0)?.text).toBe(
      "Opponent revealed Radical Beam!!, In Two Years!! At the Sabaody Archipelago!!"
    );
  });

  it("keeps controller-only look details generic", () => {
    const gameEvent: GameEvent = {
      type: "CARDS_REVEALED",
      playerIndex: 0,
      timestamp: 2,
      payload: {
        cards: [{ cardId: "OP01-029", instanceId: "a" }],
        visibility: "CONTROLLER_ONLY",
        visibleTo: 0,
      },
    };

    expect(formatEvent(gameEvent, cardDb, 0)?.text).toBe(
      "You looked at 1 card"
    );
  });

  it("does not log a Trigger identity before activation is accepted", () => {
    const gameEvent: GameEvent = {
      type: "TRIGGER_ACTIVATED",
      playerIndex: 1,
      timestamp: 3,
      payload: { cardId: "OP01-029" },
    };

    expect(formatEvent(gameEvent, cardDb, 0)).toBeNull();
  });
});

describe("formatEvent damage direction (OPT-887)", () => {
  const battle = (attacker: 0 | 1): GameEvent => ({
    type: "DAMAGE_DEALT",
    playerIndex: attacker,
    timestamp: 1,
    payload: { amount: 1, attackerInstanceId: "a", attackerType: "LEADER", firstDamageOfAttack: true },
  });

  it("names the defender, not the attacker, for battle damage", () => {
    expect(formatEvent(battle(0), cardDb, 0)?.text).toBe("Opponent took damage");
    expect(formatEvent(battle(1), cardDb, 0)?.text).toBe("You took damage");
  });

  it("names the damaged player for effect damage, including self-inflicted", () => {
    const self: GameEvent = {
      type: "DAMAGE_DEALT",
      playerIndex: 0,
      timestamp: 1,
      payload: { amount: 1, damageSource: "EFFECT", damagedPlayerIndex: 0, sourceCardInstanceId: "s", firstDamageOfEffect: true },
    };
    expect(formatEvent(self, cardDb, 0)?.text).toBe("You took damage");
  });
});

describe("formatEvent rich parts (OPT-776)", () => {
  const db = {
    "OP01-025": { name: "Roronoa Zoro" },
    "ST01-006": { name: "Tony Tony.Chopper" },
  } as unknown as CardDb;
  const lookup = (id: string) =>
    ({ zoro: "OP01-025", chopper: "ST01-006" })[id];

  it("carries no emoji icon and names cards as card parts", () => {
    const played: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 0,
      timestamp: 1,
      payload: { cardId: "OP01-025", cardInstanceId: "zoro", zone: "CHARACTER", source: "HAND" },
    };
    const entry = formatEvent(played, db, 0)!;
    expect(entry).not.toHaveProperty("icon");
    expect(entry.text).toBe("You played Roronoa Zoro");
    expect(entry.parts).toEqual([
      { kind: "text", text: "You played " },
      { kind: "card", cardId: "OP01-025", name: "Roronoa Zoro" },
    ]);
  });

  it("leads notation events with the printed token so it renders as a chip", () => {
    const trigger: GameEvent = {
      type: "TRIGGER_ACTIVATED",
      playerIndex: 1,
      timestamp: 2,
      payload: { cardId: "OP01-025", activated: true },
    };
    expect(formatEvent(trigger, db, 0)?.text).toBe(
      "[Trigger] Opponent activated Roronoa Zoro"
    );

    const counter: GameEvent = {
      type: "COUNTER_USED",
      playerIndex: 0,
      timestamp: 3,
      payload: { cardId: "ST01-006", counterValue: 1000 },
    };
    expect(formatEvent(counter, db, 0)?.text).toBe(
      "[Counter] You used Tony Tony.Chopper (+1000)"
    );
  });

  it("names attacker, target and blocker through the instance lookup", () => {
    const attack: GameEvent = {
      type: "ATTACK_DECLARED",
      playerIndex: 1,
      timestamp: 4,
      payload: { attackerInstanceId: "zoro", targetInstanceId: "chopper", attackerPower: 5000 },
    };
    expect(formatEvent(attack, db, 0, lookup)?.text).toBe(
      "Roronoa Zoro attacked Tony Tony.Chopper"
    );
    expect(formatEvent(attack, db, 0)?.text).toBe("Opponent declared an attack");

    const block: GameEvent = {
      type: "BLOCK_DECLARED",
      playerIndex: 0,
      timestamp: 5,
      payload: { blockerInstanceId: "chopper" },
    };
    expect(formatEvent(block, db, 0, lookup)?.text).toBe(
      "[Blocker] You blocked with Tony Tony.Chopper"
    );
  });
});

describe("formatEvent auto-resolved prompts", () => {
  it("names the source card and what the engine decided", () => {
    const gameEvent: GameEvent = {
      type: "PROMPT_AUTO_RESOLVED",
      playerIndex: 0,
      timestamp: 1,
      payload: { detail: "Trashed the other 4 cards", cardId: "OP01-029" },
    };
    const entry = formatEvent(gameEvent, cardDb, 0);
    expect(entry?.text).toBe(
      "Auto-resolved (Radical Beam!!): Trashed the other 4 cards"
    );
    expect(entry?.parts).toEqual([
      { kind: "text", text: "Auto-resolved (" },
      { kind: "card", cardId: "OP01-029", name: "Radical Beam!!" },
      { kind: "text", text: "): Trashed the other 4 cards" },
    ]);
  });

  it("omits the source when none is known", () => {
    const gameEvent: GameEvent = {
      type: "PROMPT_AUTO_RESOLVED",
      playerIndex: 1,
      timestamp: 1,
      payload: { detail: "Chose 2, the only legal value" },
    };
    expect(formatEvent(gameEvent, cardDb, 0)?.text).toBe(
      "Auto-resolved: Chose 2, the only legal value"
    );
  });
});
