import { describe, expect, it } from "vitest";
import {
  isBlockerProhibited,
  type BlockerProhibition,
} from "./blocker-prohibition";

const blocker = {
  instanceId: "blocker-1",
  controller: 0 as const,
  cardType: "Character",
};

function prohibition(
  prohibitionType: BlockerProhibition["prohibitionType"],
  overrides: Partial<BlockerProhibition> = {},
): BlockerProhibition {
  return {
    prohibitionType,
    controller: 1,
    appliesTo: [],
    scope: {},
    usesRemaining: null,
    ...overrides,
  };
}

describe("isBlockerProhibited", () => {
  it("applies an Usopp-style scope filter only to matching blockers", () => {
    const entry = prohibition("CANNOT_ACTIVATE_BLOCKER", {
      scope: { controller: "OPPONENT", filter: { power_min: 5000 } },
    });

    expect(
      isBlockerProhibited([entry], blocker, 0, {
        matchesFilter: (filter) => filter.power_min === 5000,
      }),
    ).toBe(true);
    expect(
      isBlockerProhibited([entry], blocker, 0, {
        matchesFilter: () => false,
      }),
    ).toBe(false);
  });

  it("matches CANNOT_BE_RESTED and CANNOT_BLOCK by instance", () => {
    for (const prohibitionType of ["CANNOT_BE_RESTED", "CANNOT_BLOCK"] as const) {
      expect(
        isBlockerProhibited(
          [prohibition(prohibitionType, { appliesTo: [blocker.instanceId] })],
          blocker,
          0,
          { matchesFilter: () => false },
        ),
      ).toBe(true);
      expect(
        isBlockerProhibited(
          [prohibition(prohibitionType, { appliesTo: ["other-blocker"] })],
          blocker,
          0,
          { matchesFilter: () => false },
        ),
      ).toBe(false);
    }
  });

  it("matches a player-scoped CANNOT_USE_BLOCKER prohibition", () => {
    const entry = prohibition("CANNOT_USE_BLOCKER", {
      scope: { controller: "OPPONENT" },
    });

    expect(
      isBlockerProhibited([entry], blocker, 0, {
        matchesFilter: () => false,
      }),
    ).toBe(true);
    expect(
      isBlockerProhibited([entry], blocker, 1, {
        matchesFilter: () => false,
      }),
    ).toBe(false);
  });

  it("uses the runtime target matcher when appliesTo is empty", () => {
    const entry = prohibition("CANNOT_ACTIVATE_BLOCKER", {
      target: { type: "CHARACTER", controller: "OPPONENT" },
    });

    expect(
      isBlockerProhibited([entry], blocker, 0, {
        matchesFilter: () => false,
      }),
    ).toBe(true);
  });

  it("ignores exhausted and unrelated prohibitions", () => {
    expect(
      isBlockerProhibited(
        [
          prohibition("CANNOT_BLOCK", {
            appliesTo: [blocker.instanceId],
            usesRemaining: 0,
          }),
          prohibition("CANNOT_ATTACK"),
        ],
        blocker,
        0,
        { matchesFilter: () => true },
      ),
    ).toBe(false);
  });
});
