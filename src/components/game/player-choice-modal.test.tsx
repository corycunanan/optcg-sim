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
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    TooltipProvider: Wrapper,
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
          cardDb={{}}
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
    expect(heading.children).toEqual(["Card Effect: Activate: Main"]);
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
          cardDb={{}}
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    expect(
      renderer.root
        .findAllByProps({ className: "text-gb-text-dim text-sm" })
        .find((node) => node.type === "p")?.children
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
          cardDb={{}}
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
          cardDb={{}}
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

  it("requires Confirm for every choice prompt instead of submitting on click", async () => {
    const onAction = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PlayerChoiceModal
          effectDescription="Choose a branch"
          choices={choices}
          cardDb={{}}
          isHidden={false}
          onHide={vi.fn()}
          onAction={onAction}
        />
      );
    });

    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
    expect(findButton(renderer, "Skip").props.disabled).toBe(true);
    await act(async () => {
      findButton(renderer, "Rest 1 → +2000").props.onClick();
    });
    expect(onAction).not.toHaveBeenCalled();
    expect(findButton(renderer, "Confirm").props.disabled).toBe(false);
    await act(async () => {
      findButton(renderer, "Confirm").props.onClick();
    });
    expect(onAction).toHaveBeenCalledWith({
      type: "PLAYER_CHOICE",
      choiceId: "don-rest:1",
    });
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
          cardDb={{}}
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

describe("v7 DON identity picker with generic-choice fallback", () => {
  const id = (ids: string[]) => `don-return-ids:${JSON.stringify(ids)}`;
  const identityChoices = [
    { id: id(["free-a", "free-b"]), label: "Return 2 free rested DON!!" },
    { id: id(["held", "free-a"]), label: "Return 1 held and 1 free DON!!" },
    { id: id(["leader", "free-a"]), label: "Return 1 from Leader and 1 free DON!!" },
  ];
  const picker = { countMin: 2, countMax: 2, groups: [
    { donIds: ["free-a", "free-b"], label: "Rested DON!! in cost area" },
    { donIds: ["held"], label: "Rested DON!! held by an effect" },
    { donIds: ["leader"], label: "Attached to Leader" },
  ] };
  it("lets the player choose held/free and host groups, then submits the exact offered canonical ID", async () => {
    const onAction = vi.fn(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<PlayerChoiceModal effectDescription="Return 2 DON!!" choices={identityChoices} donIdentityReturn={picker} cardDb={{}} isHidden={false} onHide={vi.fn()} onAction={onAction} />); });
    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
    await act(async () => { renderer.root.findByProps({ "aria-label": "Add one from Rested DON!! in cost area" }).props.onClick(); });
    await act(async () => { renderer.root.findByProps({ "aria-label": "Add one from Rested DON!! held by an effect" }).props.onClick(); });
    expect(onAction).not.toHaveBeenCalled();
    expect(findButton(renderer, "Confirm").props.disabled).toBe(false);
    await act(async () => { findButton(renderer, "Confirm").props.onClick(); });
    expect(onAction).toHaveBeenCalledWith({ type: "PLAYER_CHOICE", choiceId: id(["held", "free-a"]) });
    await act(async () => { renderer.root.findByProps({ "aria-label": "Remove one from Rested DON!! held by an effect" }).props.onClick(); });
    await act(async () => { renderer.root.findByProps({ "aria-label": "Add one from Attached to Leader" }).props.onClick(); });
    await act(async () => { findButton(renderer, "Confirm").props.onClick(); });
    expect(onAction).toHaveBeenLastCalledWith({ type: "PLAYER_CHOICE", choiceId: id(["leader", "free-a"]) });
  });
  it("allows positive variable counts and resets a stale selection when offered choices change", async () => {
    const onAction = vi.fn(); let renderer!: ReactTestRenderer;
    const options = [{ id: id(["free-a"]), label: "Return 1" }, ...identityChoices];
    const props = { effectDescription: "Return 1 or more DON!!", donIdentityReturn: { ...picker, countMin: 1 }, cardDb: {}, isHidden: false, onHide: vi.fn(), onAction };
    await act(async () => { renderer = create(<PlayerChoiceModal {...props} choices={options} />); });
    await act(async () => { renderer.root.findByProps({ "aria-label": "Add one from Rested DON!! in cost area" }).props.onClick(); });
    expect(findButton(renderer, "Confirm").props.disabled).toBe(false);
    await act(async () => { findButton(renderer, "Confirm").props.onClick(); });
    expect(onAction).toHaveBeenCalledWith({ type: "PLAYER_CHOICE", choiceId: id(["free-a"]) });
    await act(async () => { renderer.update(<PlayerChoiceModal {...props} choices={identityChoices} />); });
    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
  });
  it("keeps Confirm disabled when the matching identity choice is disabled", async () => {
    const onAction = vi.fn(); let renderer!: ReactTestRenderer;
    const disabledChoices = identityChoices.map(choice => ({ ...choice, disabled: true }));
    await act(async () => { renderer = create(<PlayerChoiceModal effectDescription="Return 2 DON!!" choices={disabledChoices} donIdentityReturn={picker} cardDb={{}} isHidden={false} onHide={vi.fn()} onAction={onAction} />); });
    await act(async () => { renderer.root.findByProps({ "aria-label": "Add one from Rested DON!! in cost area" }).props.onClick(); });
    await act(async () => { renderer.root.findByProps({ "aria-label": "Add one from Rested DON!! held by an effect" }).props.onClick(); });
    expect(findButton(renderer, "Confirm").props.disabled).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });
  it("keeps generic labeled choices answerable for clients without the optional picker", async () => {
    const onAction = vi.fn(); let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<PlayerChoiceModal effectDescription="Return DON!!" choices={identityChoices} cardDb={{}} isHidden={false} onHide={vi.fn()} onAction={onAction} />); });
    await act(async () => { findButton(renderer, "Return 1 held and 1 free DON!!").props.onClick(); });
    await act(async () => { findButton(renderer, "Confirm").props.onClick(); });
    expect(onAction).toHaveBeenCalledWith({ type: "PLAYER_CHOICE", choiceId: id(["held", "free-a"]) });
  });
});
