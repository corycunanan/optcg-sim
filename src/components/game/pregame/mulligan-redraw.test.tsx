// @vitest-environment jsdom
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CardInstance,
  GameAction,
  GameState,
  PendingPromptState,
  PromptOptions,
} from "@shared/game-types";
import { mulliganMotion } from "@/lib/motion";

vi.mock("@/components/ui", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../game-button", () => ({
  GameButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("../card", () => ({
  Card: ({ faceDown }: { faceDown?: boolean }) => (
    <div data-card={faceDown ? "back" : "front"} />
  ),
}));
import { GameOverlayGate } from "./game-overlay-gate";

const hand = (prefix: string): CardInstance[] =>
  Array.from(
    { length: 5 },
    (_, index) =>
      ({ instanceId: `${prefix}${index}`, cardId: "OP01-001" }) as CardInstance
  );

const mulliganPrompt = {
  promptType: "PLAYER_CHOICE",
  effectDescription: "PREGAME_MULLIGAN",
  choices: [
    { id: "KEEP", label: "Keep" },
    { id: "REDRAW", label: "Redraw" },
  ],
} as unknown as PromptOptions;

const mulliganPhase: GameState["pregame"] = {
  phase: "MULLIGAN_DECISIONS",
  priorityRolls: null,
  priorityDeciderIndex: null,
  firstPlayerIndex: 0,
  mulliganDecisions: [false, null],
  startOfGameEffectsResolved: [false, false],
};

let renderer: ReactTestRenderer | null = null;
const onAction = vi.fn<(action: GameAction) => void>();

function element(
  pregame: GameState["pregame"],
  myHand: CardInstance[],
  activePrompt: PromptOptions | null
) {
  return (
    <GameOverlayGate
      viewerRole="player"
      pregame={pregame}
      pendingPrompt={null as PendingPromptState | null}
      promptRespondingPlayer={activePrompt ? 1 : null}
      playerDisplayNames={["Nami", "Robin"]}
      matchClosed={false}
      winner={null}
      endState={{ title: "", colorClass: "", reason: "" }}
      myIndex={1}
      myHand={myHand}
      cardDb={{}}
      activePrompt={activePrompt}
      onAction={onAction}
      onBackToLobbies={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  onAction.mockClear();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.useRealTimers();
});

function stagePhase(): string | null {
  const stages = renderer!.root.findAll(
    (node) => node.props["data-mulligan-stage"] !== undefined
  );
  return stages.length === 0 ? null : stages[0].props["data-mulligan-stage"];
}

describe("mulligan redraw playback (OPT-1060)", () => {
  it("plays return, shuffle and deal, and outlives the mulligan phase", () => {
    const oldHand = hand("old");
    act(() => {
      renderer = create(element(mulliganPhase, oldHand, mulliganPrompt));
    });
    expect(stagePhase()).toBeNull();

    const redraw = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Redraw"))!;
    act(() => redraw.props.onClick());
    expect(onAction).toHaveBeenCalledWith({
      type: "PLAYER_CHOICE",
      choiceId: "REDRAW",
    });
    expect(stagePhase()).toBe("return");

    // The viewer was the last to decide: the server ends the pregame and
    // sends the new hand. The modal stays up for the animation.
    act(() => {
      renderer!.update(element(null, hand("new"), null));
    });
    expect(stagePhase()).toBe("return");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(stagePhase()).toBe("shuffle");

    act(() => {
      vi.advanceTimersByTime(mulliganMotion.shuffleMs);
    });
    expect(stagePhase()).toBe("deal");

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(stagePhase()).toBe("hold");

    act(() => {
      vi.advanceTimersByTime(mulliganMotion.holdMs);
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it("waits on the pile for the new hand, then gives up", () => {
    act(() => {
      renderer = create(element(mulliganPhase, hand("old"), mulliganPrompt));
    });
    const redraw = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Redraw"))!;
    act(() => redraw.props.onClick());

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(mulliganMotion.shuffleMs);
    });
    expect(stagePhase()).toBe("shuffle");

    act(() => {
      vi.advanceTimersByTime(mulliganMotion.newHandTimeoutMs);
    });
    expect(stagePhase()).toBeNull();
  });
});
