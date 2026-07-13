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
