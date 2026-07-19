import { describe, expect, it } from "vitest";
import type { LifeCard } from "@shared/game-types";
import { getInspectableLifeCards } from "./life-preview-modal";

const ownFaceDown: LifeCard = {
  instanceId: "own-down",
  cardId: "OP01-001",
  face: "DOWN",
};
const opponentFaceDown: LifeCard = {
  instanceId: "opponent-down",
  cardId: "hidden",
  face: "DOWN",
};
const faceUp: LifeCard = {
  instanceId: "face-up",
  cardId: "OP01-002",
  face: "UP",
};

describe("getInspectableLifeCards", () => {
  it("does not expose a known identity for the player's own face-down Life", () => {
    expect(getInspectableLifeCards([ownFaceDown])).toEqual([]);
  });

  it("does not expose redacted opponent Life", () => {
    expect(getInspectableLifeCards([opponentFaceDown])).toEqual([]);
  });

  it("shows only explicit face-up reveals and rejects anomalous hidden identities", () => {
    const hiddenFaceUp = { ...opponentFaceDown, face: "UP" as const };

    expect(
      getInspectableLifeCards([
        ownFaceDown,
        opponentFaceDown,
        hiddenFaceUp,
        faceUp,
      ])
    ).toEqual([faceUp]);
  });
});
