import { describe, expect, it } from "vitest";
import { getArrangeEscapeAction } from "./arrange-top-cards-modal";

describe("getArrangeEscapeAction", () => {
  it("keeps the dialog open while dnd-kit cancels an active drag", () => {
    expect(getArrangeEscapeAction("card-1", null)).toBe("cancel-drag");
    expect(getArrangeEscapeAction("card-1", "card-2")).toBe("cancel-drag");
  });

  it("clears an idle selection before allowing the dialog to hide", () => {
    expect(getArrangeEscapeAction(null, "card-1")).toBe("clear-selection");
    expect(getArrangeEscapeAction(null, null)).toBe("hide");
  });
});
