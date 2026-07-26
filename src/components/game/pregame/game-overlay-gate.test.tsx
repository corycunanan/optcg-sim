import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import type { GameState, PendingPromptState } from "@shared/game-types";
import { GameOverlayGate } from "./game-overlay-gate";

const playerDisplayNames = ["Nami", "Robin"] as const;
let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

function renderGate({
  pregame = null,
  pendingPrompt = null,
  promptRespondingPlayer = null,
  viewerRole = "spectator",
  children = <div role="dialog">Interactive player overlay</div>,
}: {
  pregame?: GameState["pregame"];
  pendingPrompt?: PendingPromptState | null;
  promptRespondingPlayer?: 0 | 1 | null;
  viewerRole?: "player" | "spectator";
  children?: React.ReactNode;
}) {
  act(() => {
    renderer = create(
      <GameOverlayGate
        viewerRole={viewerRole}
        pregame={pregame}
        pendingPrompt={pendingPrompt}
        promptRespondingPlayer={promptRespondingPlayer}
        playerDisplayNames={playerDisplayNames}
      >
        {children}
      </GameOverlayGate>
    );
  });
  return renderer!;
}

function pregame(
  patch: Partial<NonNullable<GameState["pregame"]>>
): NonNullable<GameState["pregame"]> {
  return {
    phase: "PRIORITY_ROLLING",
    priorityRolls: null,
    priorityDeciderIndex: null,
    firstPlayerIndex: null,
    mulliganDecisions: [null, null],
    startOfGameEffectsResolved: [false, false],
    ...patch,
  };
}

describe("GameOverlayGate spectator policy", () => {
  it("renders mid-mulligan passively without a focus-trapping dialog", () => {
    const rendered = renderGate({
      pregame: pregame({
        phase: "MULLIGAN_DECISIONS",
        firstPlayerIndex: 0,
        mulliganDecisions: [false, null],
      }),
      promptRespondingPlayer: 1,
      children: (
        <div role="dialog">
          <button>Keep hand</button>
          <button>Redraw</button>
        </div>
      ),
    });
    const root = rendered.root;
    const output = JSON.stringify(rendered.toJSON());

    expect(root.findAllByProps({ role: "dialog" })).toHaveLength(0);
    expect(root.findAllByProps({ role: "status" })).toHaveLength(1);
    expect(output).toContain("Robin");
    expect(output).toContain("deciding whether to keep their opening hand");
    expect(output).toContain("Kept");
    expect(output).not.toContain("Keep hand");
    expect(output).not.toContain("Redraw");
  });

  it("renders priority choice with names and third-person copy", () => {
    const rendered = renderGate({
      pregame: pregame({
        phase: "PRIORITY_CHOICE",
        priorityRolls: [4, 6],
        priorityDeciderIndex: 1,
      }),
      promptRespondingPlayer: 1,
      children: (
        <div>
          <span>You won the roll</span>
          <span>Choose first or second</span>
        </div>
      ),
    });
    const output = JSON.stringify(rendered.toJSON());

    expect(output).toContain("Robin won the roll");
    expect(output).toContain("choosing who goes first");
    expect(output).not.toContain("You won");
    expect(output).not.toContain("Choose first or second");
  });

  it("renders a merged-state prompt as passive status, never a prompt modal", () => {
    const rendered = renderGate({
      pendingPrompt: {
        respondingPlayer: 0,
        resumeContext: null,
        options: {
          promptType: "SELECT_TARGET",
          cards: [],
          validTargets: [],
          effectDescription: "Choose a target",
          countMin: 1,
          countMax: 1,
          ctaLabel: "Confirm",
        },
      },
      promptRespondingPlayer: 0,
    });
    const root = rendered.root;
    const output = JSON.stringify(rendered.toJSON());

    expect(root.findAllByProps({ role: "dialog" })).toHaveLength(0);
    expect(root.findAllByProps({ role: "status" })).toHaveLength(1);
    expect(output).toContain("Nami");
    expect(output).toContain("choosing a target");
  });

  it("labels timed prompts informationally and clears with merged state", () => {
    const rendered = renderGate({
      pendingPrompt: {
        respondingPlayer: 1,
        resumeContext: null,
        options: {
          promptType: "REVEAL_TRIGGER",
          cards: [],
          effectDescription: "Activate trigger?",
          optional: true,
          timeoutMs: 30_000,
        },
      },
    });

    expect(JSON.stringify(rendered.toJSON())).toContain(
      "Timed decision in progress"
    );

    act(() => {
      rendered.update(
        <GameOverlayGate
          viewerRole="spectator"
          pregame={null}
          pendingPrompt={null}
          promptRespondingPlayer={null}
          playerDisplayNames={playerDisplayNames}
        >
          <div role="dialog">Interactive player overlay</div>
        </GameOverlayGate>
      );
    });

    expect(rendered.toJSON()).toBeNull();
  });

  it("passes interactive overlays through for a player", () => {
    const rendered = renderGate({ viewerRole: "player" });
    const root = rendered.root;

    expect(root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    expect(JSON.stringify(rendered.toJSON())).toContain(
      "Interactive player overlay"
    );
  });
});
