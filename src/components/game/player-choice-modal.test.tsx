import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <>{children}</>;
  return {
    Dialog: Wrapper,
    DialogContent: ({ children }: PropsWithChildren) => (
      <div role="dialog" aria-labelledby="test-dialog-title">
        {children}
      </div>
    ),
    DialogHeader: Wrapper,
    DialogTitle: ({
      children,
      className,
    }: PropsWithChildren<{ className?: string }>) => (
      <h2 id="test-dialog-title" className={className}>
        {children}
      </h2>
    ),
  };
});

vi.mock("./game-button", () => ({
  GameButton: ({
    children,
    onClick,
    disabled,
    className,
    "aria-label": ariaLabel,
    "aria-pressed": ariaPressed,
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  ),
}));

import { PlayerChoiceModal } from "./player-choice-modal";

const choices = [
  { id: "don-rest:1", label: "Rest 1 → +2000" },
  { id: "don-rest:2", label: "Rest 2 → +4000" },
];

function findButton(renderer: ReactTestRenderer, label: string) {
  return renderer.root
    .findAllByType("button")
    .find((button) => button.children.join("") === label)!;
}

describe("PlayerChoiceModal confirmed selection mode", () => {
  it("renders effect notation through EffectText", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="[Activate: Main] Choose a branch"
          choices={choices}
          isHidden={false}
          onHide={vi.fn()}
          onAction={vi.fn()}
        />
      );
    });

    expect(
      renderer.root.findByProps({ "data-effect-notation": "timing" }).children
    ).toEqual(["Activate: Main"]);
    const dialog = renderer.root.findByProps({ role: "dialog" });
    const heading = renderer.root.findByProps({
      id: dialog.props["aria-labelledby"],
    });
    expect(heading.type).toBe("h2");
    expect(heading.props.className).toBe("sr-only");
  });

  it("shows the source effect and keeps resolved rows disabled in place", async () => {
    const onAction = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="Choose which effect to activate first"
          sourceEffectDescription="Five Elders"
          choices={[
            { id: "elder-1", label: "Elder 1", disabled: true },
            { id: "elder-2", label: "Elder 2" },
          ]}
          confirmOrSkip
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    expect(
      renderer.root.findByProps({ className: "text-gb-text-dim text-sm" })
        .children
    ).toEqual(["Five Elders"]);
    expect(findButton(renderer, "Elder 1 — Resolved").props.disabled).toBe(
      true
    );
    expect(
      renderer.root
        .findAllByType("button")
        .map((button) => button.children.join(""))
    ).toContain("Elder 2");
    await act(async () => {
      findButton(renderer, "Elder 1 — Resolved").props.onClick?.();
    });
    expect(onAction).not.toHaveBeenCalled();
    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
  });

  it("selects without submitting and requires Confirm", async () => {
    const onAction = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="Choose how many DON!! cards to rest"
          choices={choices}
          confirmOrSkip
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
    await act(async () => {
      findButton(renderer, "Rest 2 → +4000").props.onClick();
    });
    expect(onAction).not.toHaveBeenCalled();
    expect(findButton(renderer, "Rest 2 → +4000").props["aria-pressed"]).toBe(
      true
    );
    expect(findButton(renderer, "Confirm").props.disabled).toBe(false);

    await act(async () => {
      findButton(renderer, "Confirm").props.onClick();
    });
    expect(onAction).toHaveBeenCalledWith({
      type: "PLAYER_CHOICE",
      choiceId: "don-rest:2",
    });
  });

  it("sends Skip separately from the real amount rows", async () => {
    const onAction = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="Choose how many DON!! cards to rest"
          choices={choices}
          confirmOrSkip
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    await act(async () => {
      findButton(renderer, "Skip").props.onClick();
    });
    expect(onAction).toHaveBeenCalledWith({
      type: "PLAYER_CHOICE",
      choiceId: "skip",
    });
    expect(choices.some((choice) => choice.id === "skip")).toBe(false);
  });

  it("preserves click-to-submit for existing PLAYER_CHOICE prompts", async () => {
    const onAction = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="Choose a branch"
          choices={choices}
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    await act(async () => {
      findButton(renderer, "Rest 1 → +2000").props.onClick();
    });
    expect(onAction).toHaveBeenCalledWith({
      type: "PLAYER_CHOICE",
      choiceId: "don-rest:1",
    });
    expect(
      renderer.root
        .findAllByType("button")
        .some((button) => button.children.join("") === "Confirm")
    ).toBe(false);
  });

  it("does not auto-submit a lone confirmed choice", async () => {
    const onAction = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="Choose how many DON!! cards to rest"
          choices={choices.slice(0, 1)}
          confirmOrSkip
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    expect(onAction).not.toHaveBeenCalled();
    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
  });
});
