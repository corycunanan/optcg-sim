import React, {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb, CardInstance } from "@shared/game-types";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <>{children}</>;
  const Div = ({
    children,
    ...props
  }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
    <div {...props}>{children}</div>
  );
  return {
    Dialog: Wrapper,
    DialogContent: Div,
    DialogHeader: Div,
    DialogTitle: Div,
    DialogFooter: Div,
    TooltipProvider: Wrapper,
  };
});

vi.mock("./game-button", () => ({
  GameButton: ({
    children,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("./card", () => ({
  Card: () => <div data-testid="card" />,
}));

import { SelectTargetModal } from "./select-target-modal";

const target: CardInstance = {
  instanceId: "target-1",
  cardId: "OP01-016",
  zone: "CHARACTER",
  state: "RESTED",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

const cardDb = {
  "OP01-016": { name: "Nami", color: [] },
} as unknown as CardDb;

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("SelectTargetModal card-state semantics", () => {
  it("announces rested and selected state on an interactive target card", () => {
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="Choose a Character"
          countMin={1}
          countMax={1}
          ctaLabel="Choose"
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={vi.fn()}
        />
      );
    });

    const availableTarget = renderer?.root.findByProps({
      "aria-label": "Nami. rested. eligible for selection",
    });
    expect(availableTarget?.props["aria-pressed"]).toBe(false);

    act(() => availableTarget?.props.onClick());

    const selectedTarget = renderer?.root.findByProps({
      "aria-label": "Nami. rested. selected",
    });
    expect(selectedTarget?.props["aria-pressed"]).toBe(true);
  });
});
