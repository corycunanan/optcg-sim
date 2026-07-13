import { describe, expect, it } from "vitest";
import { getArrangeEscapeAction } from "./arrange-top-cards-modal";

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
