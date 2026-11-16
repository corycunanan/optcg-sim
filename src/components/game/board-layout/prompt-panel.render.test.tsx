// @vitest-environment jsdom
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb, GameAction } from "@shared/game-types";
import { PromptPanel, type PromptPanelProps } from "./prompt-panel";

vi.mock("../use-card-tooltip", () => ({
  CardTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const cardDb = { "OP01-016": { name: "Nami" } } as unknown as CardDb;

let renderer: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

function render(overrides: Partial<PromptPanelProps> = {}) {
  const onAction = vi.fn<(action: GameAction) => void>();
  const props: PromptPanelProps = {
    isMyTurn: true,
    phase: "MAIN",
    canEndPhase: false,
    canPass: false,
    activePrompt: null,
    rejectionReason: null,
    battleInfo: null,
    cardDb,
    onAction,
    ...overrides,
  };
  act(() => {
    renderer = create(<PromptPanel {...props} />);
  });
  return { root: renderer!.root, onAction };
}

function buttonLabels(root: ReactTestRenderer["root"]): string[] {
  return root
    .findAll((node) => node.type === "button")
    .map((node) => node.props.children as string);
}

function text(): string {
  return JSON.stringify(renderer!.toJSON());
}

describe("PromptPanel", () => {
  it("shows the phase and End Turn on an idle Main Phase", () => {
    const { root, onAction } = render({ canEndPhase: true, canUndo: true });
    expect(text()).toContain("Main phase");
    expect(buttonLabels(root)).toEqual(["Undo", "End Turn"]);
    act(() => root.findAll((n) => n.type === "button")[1].props.onClick());
    expect(onAction).toHaveBeenCalledWith({ type: "ADVANCE_PHASE" });
  });

  it("renders the in-place target instruction, source card and count", () => {
    const onConfirm = vi.fn();
    const { root } = render({
      targetSelectionMode: {
        effectDescription: "[On Play] K.O. up to 1 of your opponent's Characters",
        instruction: "K.O. up to 1 Character",
        sourceCard: { cardId: "OP01-016", instanceId: "nami" },
        countLabel: "Select up to 1",
        selectedCount: 1,
        aggregateLabel: null,
        canConfirm: true,
        canSkip: true,
        onConfirm,
        onSkip: vi.fn(),
      },
    });
    const out = text();
    expect(out).toContain("Action required");
    expect(out).toContain("K.O. up to 1 Character");
    expect(out).toContain("Nami");
    expect(buttonLabels(root)).toEqual(["Skip", "Confirm"]);
    act(() => root.findAll((n) => n.type === "button")[1].props.onClick());
    expect(onConfirm).toHaveBeenCalled();
  });

  it("holds Block until a blocker is chosen and Skip passes", () => {
    const { root, onAction } = render({
      isMyTurn: false,
      blockerMode: { selectedBlockerId: null, onBlock: vi.fn() },
    });
    const [skip, block] = root.findAll((n) => n.type === "button");
    expect(block.props.disabled).toBe(true);
    act(() => skip.props.onClick());
    expect(onAction).toHaveBeenCalledWith({ type: "PASS" });
  });

  it("offers Show Prompt for a hidden modal prompt", () => {
    const onShowPrompt = vi.fn();
    const { root } = render({
      activePrompt: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "[On Play] Choose one",
        choices: [],
      },
      isPromptHidden: true,
      onShowPrompt,
    });
    expect(buttonLabels(root)).toEqual(["Show Prompt"]);
  });

  it("shows only a waiting line while the opponent chooses", () => {
    const { root } = render({ isMyTurn: false, opponentChoosing: true });
    expect(text()).toContain("Opponent is choosing");
    expect(buttonLabels(root)).toEqual([]);
  });

  it("renders nothing visible on an idle opponent turn", () => {
    const { root } = render({ isMyTurn: false });
    const section = root.findByProps({ "data-prompt-panel": "" });
    expect(section.props.className).not.toContain("border");
  });
});
