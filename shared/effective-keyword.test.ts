import { describe, expect, it } from "vitest";
import type { GameState } from "./game-types";
import { hasRuntimeKeyword } from "./effective-keyword";

describe("hasRuntimeKeyword", () => {
  it("returns true for a printed keyword", () => {
    expect(hasRuntimeKeyword("card-1", { blocker: true }, [], "BLOCKER")).toBe(
      true
    );
  });

  it("maps printed Rush and Double Attack fields", () => {
    expect(hasRuntimeKeyword("card-1", { rush: true }, [], "RUSH")).toBe(true);
    expect(
      hasRuntimeKeyword("card-1", { doubleAttack: true }, [], "DOUBLE_ATTACK")
    ).toBe(true);
  });

  it("maps printed Rush: Character", () => {
    expect(
      hasRuntimeKeyword("card-1", { rushCharacter: true }, [], "RUSH_CHARACTER")
    ).toBe(true);
  });

  it("returns true for a granted keyword", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        undefined,
        [
          {
            appliesTo: ["card-1"],
            modifiers: [
              { type: "GRANT_KEYWORD", params: { keyword: "BLOCKER" } },
            ],
          },
        ],
        "BLOCKER"
      )
    ).toBe(true);
  });

  it("returns false when a printed keyword is removed", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        { blocker: true },
        [
          {
            appliesTo: ["card-1"],
            modifiers: [
              { type: "REMOVE_KEYWORD", params: { keyword: "BLOCKER" } },
            ],
          },
        ],
        "BLOCKER"
      )
    ).toBe(false);
  });

  it("returns false when a granted keyword is removed", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        undefined,
        [
          {
            appliesTo: ["card-1"],
            modifiers: [
              { type: "GRANT_KEYWORD", params: { keyword: "BLOCKER" } },
              { type: "REMOVE_KEYWORD", params: { keyword: "BLOCKER" } },
            ],
          },
        ],
        "BLOCKER"
      )
    ).toBe(false);
  });

  it("returns false when a printed keyword is negated", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        { blocker: true },
        [
          {
            appliesTo: ["card-1"],
            modifiers: [{ type: "NEGATE_EFFECTS_FLAG" }],
          },
        ],
        "BLOCKER"
      )
    ).toBe(false);
  });

  it("keeps a granted keyword active when printed effects are negated", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        { blocker: true },
        [
          {
            appliesTo: ["card-1"],
            modifiers: [
              { type: "NEGATE_EFFECTS_FLAG" },
              { type: "GRANT_KEYWORD", params: { keyword: "BLOCKER" } },
            ],
          },
        ],
        "BLOCKER"
      )
    ).toBe(true);
  });

  it("ignores a grant for a different instance", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        undefined,
        [
          {
            appliesTo: ["card-2"],
            modifiers: [
              { type: "GRANT_KEYWORD", params: { keyword: "BLOCKER" } },
            ],
          },
        ],
        "BLOCKER"
      )
    ).toBe(false);
  });

  it("ignores a grant for a different keyword", () => {
    expect(
      hasRuntimeKeyword(
        "card-1",
        undefined,
        [
          {
            appliesTo: ["card-1"],
            modifiers: [{ type: "GRANT_KEYWORD", params: { keyword: "RUSH" } }],
          },
        ],
        "BLOCKER"
      )
    ).toBe(false);
  });

  it("accepts the client GameState active-effects type", () => {
    const activeEffects: GameState["activeEffects"] = [
      {
        id: "effect-1",
        sourceCardInstanceId: "source-1",
        appliesTo: ["card-1"],
        modifiers: [{ type: "GRANT_KEYWORD", params: { keyword: "BLOCKER" } }],
      },
    ];

    expect(
      hasRuntimeKeyword("card-1", { blocker: false }, activeEffects, "BLOCKER")
    ).toBe(true);
  });
});
