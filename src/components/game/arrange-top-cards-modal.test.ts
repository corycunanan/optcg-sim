import { describe, expect, it } from "vitest";
import {
  getArrangeDestinations,
  getArrangeEscapeAction,
} from "./arrange-top-cards-modal";

describe("getArrangeEscapeAction", () => {
  it("keeps the dialog open while dnd-kit cancels an active drag", () => {
    expect(getArrangeEscapeAction("card-1", null, 2)).toBe("cancel-drag");
    expect(getArrangeEscapeAction("card-1", "card-2", 1)).toBe("cancel-drag");
  });

  it("clears an idle selection before allowing the dialog to hide", () => {
    expect(getArrangeEscapeAction(null, "card-1", 1)).toBe("clear-selection");
    expect(getArrangeEscapeAction(null, null, 1)).toBe("hide");
  });

  it("ignores stale pick-step selection after advancing to reorder", () => {
    expect(getArrangeEscapeAction(null, "card-1", 2)).toBe("hide");
  });
});

describe("getArrangeDestinations", () => {
  it("offers both legal destinations for TOP_OR_BOTTOM effects", () => {
    expect(getArrangeDestinations("TOP_OR_BOTTOM", true)).toEqual(["bottom", "top"]);
  });

  it("keeps fixed-destination prompts to one action", () => {
    expect(getArrangeDestinations("BOTTOM", true)).toEqual(["bottom"]);
    expect(getArrangeDestinations("TOP", false)).toEqual(["top"]);
  });
});
