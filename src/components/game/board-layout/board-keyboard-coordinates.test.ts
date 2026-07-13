import { describe, expect, it } from "vitest";
import { KeyboardCode } from "@dnd-kit/core";
import { findDirectionalDropTarget } from "./board-keyboard-coordinates";

const rect = (left: number, top: number) => ({
  left,
  top,
  width: 80,
  height: 110,
});

describe("findDirectionalDropTarget", () => {
  const source = rect(200, 200);
  const candidates = [
    { id: "left", rect: rect(80, 205) },
    { id: "right", rect: rect(320, 205) },
    { id: "down-aligned", rect: rect(205, 340) },
    { id: "down-diagonal", rect: rect(350, 300) },
    { id: "up", rect: rect(205, 40) },
  ];

  it("moves to the nearest target in each arrow direction", () => {
    expect(
      findDirectionalDropTarget(KeyboardCode.Left, source, candidates)?.id,
    ).toBe("left");
    expect(
      findDirectionalDropTarget(KeyboardCode.Right, source, candidates)?.id,
    ).toBe("right");
    expect(
      findDirectionalDropTarget(KeyboardCode.Up, source, candidates)?.id,
    ).toBe("up");
  });

  it("prefers a visually aligned target over a closer diagonal", () => {
    expect(
      findDirectionalDropTarget(KeyboardCode.Down, source, candidates)?.id,
    ).toBe("down-aligned");
  });

  it("returns null when the key has no board movement meaning", () => {
    expect(findDirectionalDropTarget("Enter", source, candidates)).toBeNull();
  });
});
