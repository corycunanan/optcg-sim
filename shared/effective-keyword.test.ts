import { describe, expect, it } from "vitest";
import { hasRuntimeKeyword } from "./effective-keyword";

describe("hasRuntimeKeyword", () => {
  it("returns true for a printed keyword", () => {
    expect(hasRuntimeKeyword("card-1", { blocker: true }, [], "BLOCKER")).toBe(
      true
    );
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
});
