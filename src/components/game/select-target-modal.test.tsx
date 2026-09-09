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
    DialogContent: ({
      children,
      ...props
    }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
      <div role="dialog" aria-labelledby="test-dialog-title" {...props}>
        {children}
      </div>
    ),
    DialogHeader: Div,
    DialogTitle: ({
      children,
      ...props
    }: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) => (
      <h2 id="test-dialog-title" {...props}>
        {children}
      </h2>
    ),
    DialogDescription: Wrapper,
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
  it("shows the worker instruction before the existing selection suffixes", () => {
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="[On Play] Choose a Character"
          instruction="KO up to 1 of your opponent's Characters."
          countMin={0}
          countMax={1}
          aggregateConstraint={{ property: "cost", operator: "<=", value: 8 }}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={vi.fn()}
        />
      );
    });

    const footerStatus = renderer?.root
      .findAllByType("span")
      .find((span) =>
        span.children.includes("KO up to 1 of your opponent's Characters."),
      );
    expect(footerStatus?.children).toContain(
      "KO up to 1 of your opponent's Characters.",
    );
    expect(footerStatus?.children.join("")).not.toContain("Select up to 1");

    const availableTarget = renderer?.root.findByProps({
      "aria-label": "Nami. rested. eligible for selection",
    });
    act(() => availableTarget?.props.onClick());

    expect(
      renderer?.root
        .findAllByType("span")
        .find((span) => span.props.className?.includes("text-gb-text-subtle"))
        ?.children.join(""),
    ).toContain("1 selected");
    expect(
      renderer?.root
        .findAllByType("span")
        .find((span) => span.props.className?.includes("text-gb-text-bright"))
        ?.children.join(""),
    ).toContain("Total cost: 0 <= 8");
  });

  it("renders effect notation through EffectText", () => {
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="[Activate: Main] Choose a Character"
          countMin={1}
          countMax={1}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={vi.fn()}
        />
      );
    });

    expect(
      renderer?.root.findByProps({ "data-effect-notation": "timing" }).children
    ).toEqual(["Activate: Main"]);
    const dialog = renderer?.root.findByProps({ role: "dialog" });
    const heading = renderer?.root.findByProps({
      id: dialog?.props["aria-labelledby"],
    });
    expect(heading?.type).toBe("h2");
    expect(heading?.children).toEqual(["Card Effect: Activate: Main"]);
  });

  it("keeps the dialog title target when the effect description is empty", () => {
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription=""
          countMin={1}
          countMax={1}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={vi.fn()}
        />
      );
    });

    const dialog = renderer?.root.findByProps({ role: "dialog" });
    const heading = renderer?.root.findByProps({
      id: dialog?.props["aria-labelledby"],
    });
    expect(heading?.type).toBe("h2");
    expect(heading?.children).toEqual(["Card Effect"]);
  });

  it("renders Skip disabled for a required pick and enabled for an optional one", () => {
    const onAction = vi.fn();
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="[On Play] Choose a Character"
          countMin={1}
          countMax={1}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });
    const buttons = () => renderer!.root.findAllByType("button");
    const skip = buttons().find((b) => b.children.join("") === "Skip")!;
    expect(skip.props.disabled).toBe(true);
    expect(
      buttons().find((b) => b.children.join("") === "Confirm")!.props.disabled
    ).toBe(true);
    act(() => renderer?.unmount());

    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="[On Play] Choose up to 1 Character"
          countMin={0}
          countMax={1}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });
    const optionalSkip = buttons().find((b) => b.children.join("") === "Skip")!;
    expect(optionalSkip.props.disabled).toBe(false);
    act(() => optionalSkip.props.onClick());
    expect(onAction).toHaveBeenCalledWith({
      type: "SELECT_TARGET",
      selectedInstanceIds: [],
    });
  });

  it("announces rested and selected state on an interactive target card", () => {
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="Choose a Character"
          countMin={1}
          countMax={1}
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

  // The button carries no padding or border around a fixed-size `<Card>`, so
  // its box is the card's box and both the focus ring and the selected ring
  // trace that card's outline (OPT-720, SHAPE-LANGUAGE.md §The card radius).
  it("draws the selection and focus rings on the card silhouette", () => {
    act(() => {
      renderer = create(
        <SelectTargetModal
          cards={[target]}
          validTargets={[target.instanceId]}
          effectDescription="Choose a Character"
          countMin={1}
          countMax={1}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onAction={vi.fn()}
        />
      );
    });

    const button = renderer?.root.findByProps({
      "aria-label": "Nami. rested. eligible for selection",
    });

    expect(button?.props.className).toContain("rounded-card");
    expect(button?.props.className).not.toMatch(
      /(?:^|\s)rounded(?:-md)?(?:\s|$)/
    );
    expect(button?.props.className).toContain("p-0");

    act(() => button?.props.onClick());

    const selected = renderer?.root.findByProps({
      "aria-label": "Nami. rested. selected",
    });
    expect(selected?.props.className).toContain("rounded-card");
    expect(selected?.props.className).toContain("ring-2");
  });
});
