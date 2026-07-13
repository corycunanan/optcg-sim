import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  eventToSpotlight,
  findLatestSpotlight,
  shouldBlockBoardForSpotlight,
} from "./spotlight";

function event<T extends GameEvent>(value: T): T {
  return value;
}

describe("eventToSpotlight", () => {
  it("presents public multi-card reveals", () => {
    const result = eventToSpotlight(
      event({
        type: "CARDS_REVEALED",
        playerIndex: 0,
        timestamp: 1,
        payload: {
          cards: [
            { cardId: "OP01-001", instanceId: "a" },
            { cardId: "OP01-002", instanceId: "b" },
          ],
          source: "search",
          visibility: "BOTH",
        },
      })
    );

    expect(result).toMatchObject({
      kind: "REVEAL",
      source: "search",
      cards: [{ cardId: "OP01-001" }, { cardId: "OP01-002" }],
    });
  });

  it("never presents controller-only or redacted reveals", () => {
    expect(
      eventToSpotlight(
        event({
          type: "CARDS_REVEALED",
          playerIndex: 0,
          timestamp: 1,
          payload: {
            cards: [{ cardId: "OP01-001", instanceId: "a" }],
            visibility: "CONTROLLER_ONLY",
            visibleTo: 0,
          },
        })
      )
    ).toBeNull();
    expect(
      eventToSpotlight(
        event({
          type: "CARDS_REVEALED",
          playerIndex: 1,
          timestamp: 2,
          payload: {
            cards: [{ cardId: "hidden", instanceId: "hidden" }],
            visibility: "BOTH",
          },
        })
      )
    ).toBeNull();
  });

  it("presents Event activations and accepted Trigger reveals", () => {
    expect(
      eventToSpotlight(
        event({
          type: "EVENT_ACTIVATED_FROM_HAND",
          playerIndex: 0,
          timestamp: 3,
          payload: { cardId: "OP01-029", cardInstanceId: "event-1" },
        })
      )?.kind
    ).toBe("EVENT");
    expect(
      eventToSpotlight(
        event({
          type: "TRIGGER_ACTIVATED",
          playerIndex: 1,
          timestamp: 4,
          payload: { cardId: "OP01-029", activated: true },
        })
      )?.kind
    ).toBe("TRIGGER");
  });

  it("does not reveal a Trigger while its private choice is still pending", () => {
    expect(
      eventToSpotlight(
        event({
          type: "TRIGGER_ACTIVATED",
          playerIndex: 1,
          timestamp: 5,
          payload: { cardId: "SECRET-TRIGGER" },
        })
      )
    ).toBeNull();
  });

  it("uses the final presentable event in one accepted event batch", () => {
    const result = findLatestSpotlight([
      event({
        type: "EVENT_ACTIVATED_FROM_HAND",
        playerIndex: 0,
        timestamp: 6,
        payload: { cardId: "EVENT-1", cardInstanceId: "event-1" },
      }),
      event({
        type: "CARDS_REVEALED",
        playerIndex: 0,
        timestamp: 7,
        payload: {
          cards: [{ cardId: "RESULT-1", instanceId: "result-1" }],
          visibility: "BOTH",
        },
      }),
    ]);

    expect(result).toMatchObject({
      kind: "REVEAL",
      cards: [{ cardId: "RESULT-1" }],
    });
  });
});

describe("shouldBlockBoardForSpotlight", () => {
  it("keeps a waiting player's board blocked after the reveal is dismissed", () => {
    expect(shouldBlockBoardForSpotlight(false, 1, 0)).toBe(true);
  });

  it("releases the responder's board when the reveal is dismissed", () => {
    expect(shouldBlockBoardForSpotlight(false, 1, 1)).toBe(false);
  });

  it("blocks both players while the spotlight is visible", () => {
    expect(shouldBlockBoardForSpotlight(true, null, 0)).toBe(true);
    expect(shouldBlockBoardForSpotlight(true, null, 1)).toBe(true);
  });
});
