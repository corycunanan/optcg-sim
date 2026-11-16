import { describe, expect, it } from "vitest";
import { turnPillLabel } from "./turn-pill";

describe("turnPillLabel", () => {
  it("names the seated player's turn from their side", () => {
    expect(turnPillLabel("me")).toBe("Your turn");
    expect(turnPillLabel("opp")).toBe("Opponent's turn");
  });

  it("names the player by seat for spectators and nothing before turn 1", () => {
    expect(turnPillLabel(0)).toBe("Player 1's turn");
    expect(turnPillLabel(1)).toBe("Player 2's turn");
    expect(turnPillLabel(null)).toBeNull();
  });
});
