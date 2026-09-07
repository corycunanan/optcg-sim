import React, {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb } from "@shared/game-types";

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

import { EffectPromptDialog } from "./effect-prompt-dialog";

const cardDb = { "OP01-001": { name: "Roronoa Zoro" } } as unknown as CardDb;

let renderer: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

function button(label: string) {
  return renderer!.root
    .findAllByType("button")
    .find((node) => node.children.join("") === label)!;
}

describe("EffectPromptDialog", () => {
  it("frames the prompt as title, source card, effect text, then Skip and Confirm", () => {
    const onConfirm = vi.fn();
    const onSkip = vi.fn();
    act(() => {
      renderer = create(
        <EffectPromptDialog
          effectDescription="[On Play] Draw 1 card."
          sourceCard={{ cardId: "OP01-001" }}
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onConfirm={onConfirm}
          onSkip={onSkip}
        >
          <div data-testid="content" />
        </EffectPromptDialog>
      );
    });

    const dialog = renderer!.root.findByProps({ role: "dialog" });
    const heading = renderer!.root.findByProps({
      id: dialog.props["aria-labelledby"],
    });
    expect(heading.children).toEqual(["Card Effect: On Play"]);
    expect(
      renderer!.root
        .findByProps({ id: dialog.props["aria-describedby"] })
        .findAllByType("p")[0].children
    ).toEqual(["Roronoa Zoro"]);
    expect(
      renderer!.root.findByProps({ "data-effect-notation": "timing" }).children
    ).toEqual(["On Play"]);
    expect(
      renderer!.root.findAllByProps({ "data-testid": "content" })
    ).toHaveLength(1);

    const labels = renderer!.root
      .findAllByType("button")
      .map((node) => node.children.join(""));
    expect(labels.slice(-2)).toEqual(["Skip", "Confirm"]);

    act(() => button("Skip").props.onClick());
    act(() => button("Confirm").props.onClick());
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps Skip visible but disabled when the prompt cannot be declined", () => {
    act(() => {
      renderer = create(
        <EffectPromptDialog
          effectDescription="Choose a cost to pay"
          cardDb={cardDb}
          isHidden={false}
          onHide={vi.fn()}
          onConfirm={vi.fn()}
          confirmDisabled
        />
      );
    });
    expect(button("Skip").props.disabled).toBe(true);
    expect(button("Confirm").props.disabled).toBe(true);
    const dialog = renderer!.root.findByProps({ role: "dialog" });
    expect(
      renderer!.root.findByProps({ id: dialog.props["aria-labelledby"] })
        .children
    ).toEqual(["Card Effect"]);
  });
});
