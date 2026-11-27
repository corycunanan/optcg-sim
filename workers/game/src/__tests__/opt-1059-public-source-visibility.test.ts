/**
 * OPT-1059: a card that leaves a public zone (the field or the trash) for a
 * hand or Life keeps its public identity for the other player, so the board
 * can flip it where it stood. Only its new hidden-zone instance id stays
 * private. Hidden sources keep the full redaction.
 */
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../types.js";
import {
  filterEventForPlayer,
  filterEventForRecipient,
} from "../engine/visibility.js";

const bounce = (sourceZone?: string): GameEvent =>
  ({
    type: "CARD_RETURNED_TO_HAND",
    playerIndex: 1,
    payload: {
      cardId: "OP01-010",
      cardInstanceId: "field-1",
      newCardInstanceId: "hand-9",
      ...(sourceZone ? { sourceZone } : {}),
    },
    timestamp: 1,
  }) as GameEvent;

const addToLife = (sourceZone: string, face: "UP" | "DOWN"): GameEvent =>
  ({
    type: "CARD_ADDED_TO_LIFE",
    playerIndex: 1,
    payload: {
      cardId: "OP01-010",
      cardInstanceId: "field-1",
      newCardInstanceId: "life-9",
      sourceZone,
      face,
    },
    timestamp: 1,
  }) as GameEvent;

describe("OPT-1059 public-source hand and Life entries", () => {
  it.each(["CHARACTER", "STAGE", "LEADER", "TRASH"])(
    "shows the opponent which card left %s, but not its new hand id",
    (zone) => {
      const filtered = filterEventForPlayer(bounce(zone), 0);
      expect(filtered.payload).toMatchObject({
        cardId: "OP01-010",
        cardInstanceId: "field-1",
        newCardInstanceId: "hidden",
      });
    },
  );

  it("keeps a bounce without provenance fully redacted", () => {
    expect(filterEventForPlayer(bounce(), 0).payload).toMatchObject({
      cardId: "hidden",
      cardInstanceId: "hidden",
      newCardInstanceId: "hidden",
    });
  });

  it("keeps the owner's own view intact", () => {
    expect(filterEventForPlayer(bounce("CHARACTER"), 1)).toEqual(bounce("CHARACTER"));
  });

  it("shows a field card entering Life face-down to the opponent", () => {
    expect(filterEventForPlayer(addToLife("CHARACTER", "DOWN"), 0).payload).toMatchObject({
      cardId: "OP01-010",
      cardInstanceId: "field-1",
      newCardInstanceId: "hidden",
    });
  });

  it("still hides a deck card entering Life face-down from everyone", () => {
    for (const player of [0, 1] as const) {
      expect(filterEventForPlayer(addToLife("DECK", "DOWN"), player).payload).toMatchObject({
        cardId: "hidden",
        cardInstanceId: "hidden",
      });
    }
  });

  it("still hides a hand card entering Life from the opponent", () => {
    expect(filterEventForPlayer(addToLife("HAND", "UP"), 0).payload).toMatchObject({
      cardId: "hidden",
      cardInstanceId: "hidden",
    });
  });

  it("gives an observer the same public source", () => {
    expect(
      filterEventForRecipient(bounce("CHARACTER"), { kind: "OBSERVER" }).payload,
    ).toMatchObject({ cardId: "OP01-010", newCardInstanceId: "hidden" });
  });
});
