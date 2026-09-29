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
      isBlockerProhibited([entry], blocker, 0, null, {
        matchesFilter: (filter) => filter.power_min === 5000,
      }),
    ).toBe(true);
    expect(
      isBlockerProhibited([entry], blocker, 0, null, {
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
          null,
          { matchesFilter: () => false },
        ),
      ).toBe(true);
      expect(
        isBlockerProhibited(
          [prohibition(prohibitionType, { appliesTo: ["other-blocker"] })],
          blocker,
          0,
          null,
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
      isBlockerProhibited([entry], blocker, 0, null, {
        matchesFilter: () => false,
      }),
    ).toBe(true);
    expect(
      isBlockerProhibited([entry], blocker, 1, null, {
        matchesFilter: () => false,
      }),
    ).toBe(false);
  });

  it("uses the runtime target matcher when appliesTo is empty", () => {
    const entry = prohibition("CANNOT_ACTIVATE_BLOCKER", {
      target: { type: "CHARACTER", controller: "OPPONENT" },
    });

    expect(
      isBlockerProhibited([entry], blocker, 0, null, {
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
        null,
        { matchesFilter: () => true },
      ),
    ).toBe(false);
  });
  it("gates an attacker-bound prohibition on the current attacker, never the blocker", () => {
    const entry = prohibition("CANNOT_ACTIVATE_BLOCKER", {
      scope: { controller: "OPPONENT" },
      attackerInstanceIds: ["attacker-1"],
    });
    const services = { matchesFilter: () => true };
    expect(isBlockerProhibited([entry], blocker, 0, "attacker-1", services)).toBe(true);
    expect(isBlockerProhibited([entry], blocker, 0, "attacker-2", services)).toBe(false);
    // No battle in progress: nothing to bind to.
    expect(isBlockerProhibited([entry], blocker, 0, null, services)).toBe(false);
    // Binding the blocker's own id never matters.
    const selfBound = { ...entry, attackerInstanceIds: [blocker.instanceId] };
    expect(isBlockerProhibited([selfBound], blocker, 0, "attacker-1", services)).toBe(false);
    // Still restricted to the opposing player.
    expect(isBlockerProhibited([entry], { ...blocker, controller: 1 }, 1, "attacker-1", services)).toBe(false);
  });

  it("leaves unbound prohibitions independent of the attacker", () => {
    const entry = prohibition("CANNOT_ACTIVATE_BLOCKER", { scope: { controller: "OPPONENT" } });
    const services = { matchesFilter: () => true };
    expect(isBlockerProhibited([entry], blocker, 0, null, services)).toBe(true);
    expect(isBlockerProhibited([entry], blocker, 0, "anyone", services)).toBe(true);
  });
});
