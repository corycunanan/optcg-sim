import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { CardDb } from "@shared/game-types";
import {
  ArrangeTopCardsModal,
  getArrangeDestinations,
  getArrangeEscapeAction,
} from "./arrange-top-cards-modal";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children);
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogFooter: Wrapper,
    TooltipProvider: Wrapper,
  };
});

vi.mock("./game-button", () => ({
  GameButton: ({ children }: React.PropsWithChildren) =>
    React.createElement("button", null, children),
}));

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
    expect(getArrangeDestinations("TOP_OR_BOTTOM", true)).toEqual([
      "bottom",
      "top",
    ]);
  });

  it("keeps fixed-destination prompts to one action", () => {
    expect(getArrangeDestinations("BOTTOM", true)).toEqual(["bottom"]);
    expect(getArrangeDestinations("TOP", false)).toEqual(["top"]);
  });
});

describe("ArrangeTopCardsModal effect description", () => {
  it("renders effect notation through EffectText", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        React.createElement(ArrangeTopCardsModal, {
          cards: [],
          effectDescription: "[Activate: Main] Arrange the top cards",
          canSendToBottom: true,
          cardDb: {} as CardDb,
          isHidden: false,
          onHide: vi.fn(),
          onAction: vi.fn(),
        })
      );
    });

    expect(
      renderer.root.findByProps({ "data-effect-notation": "timing" }).children
    ).toEqual(["Activate: Main"]);
    act(() => renderer.unmount());
  });
});
