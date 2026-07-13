import { describe, expect, it } from "vitest";
import type { TargetCardSelectionState } from "@/lib/game/target-selection";
import { getOpponentStageTabIndex } from "./opponent-field";

describe("getOpponentStageTabIndex", () => {
  it("keeps an informational opponent Stage out of the Tab order", () => {
    expect(getOpponentStageTabIndex(undefined)).toBe(-1);
  });

  it("makes an opponent Stage reachable during target selection", () => {
    const selection: TargetCardSelectionState = {
      eligible: true,
      selected: false,
      disabledReason: null,
    };

    expect(getOpponentStageTabIndex(selection)).toBe(0);
  });
});
