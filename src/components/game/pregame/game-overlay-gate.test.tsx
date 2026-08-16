import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GameState,
  PendingPromptState,
  PromptOptions,
} from "@shared/game-types";

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
vi.mock("../game-button", () => ({
  GameButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
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
  matchClosed = false,
  winner = null,
  activePrompt = null,
  onBackToLobbies = vi.fn(),
}: {
  pregame?: GameState["pregame"];
  pendingPrompt?: PendingPromptState | null;
  promptRespondingPlayer?: 0 | 1 | null;
  viewerRole?: "player" | "spectator";
  matchClosed?: boolean;
  winner?: 0 | 1 | null;
  activePrompt?: PromptOptions | null;
  onBackToLobbies?: () => void;
}) {
  act(() => {
    renderer = create(
      <GameOverlayGate
        viewerRole={viewerRole}
        pregame={pregame}
        pendingPrompt={pendingPrompt}
        promptRespondingPlayer={promptRespondingPlayer}
        playerDisplayNames={playerDisplayNames}
        matchClosed={matchClosed}
        winner={winner}
        endState={{
          title: "VICTORY",
          colorClass: "text-gb-accent-green",
          reason: "Conceded",
        }}
        myIndex={0}
        myHand={[]}
        cardDb={{}}
        activePrompt={activePrompt}
        onAction={vi.fn()}
        onBackToLobbies={onBackToLobbies}
      />
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
          matchClosed={false}
          winner={null}
          endState={{
            title: "",
            colorClass: "",
            reason: "",
          }}
          myIndex={null}
          myHand={[]}
          cardDb={{}}
          activePrompt={null}
          onAction={vi.fn()}
          onBackToLobbies={vi.fn()}
        />
      );
    });

    expect(rendered.toJSON()).toBeNull();
  });

  it("renders start-of-game prompts alongside passive pregame context", () => {
    const rendered = renderGate({
      pregame: pregame({
        phase: "START_OF_GAME_FX",
        firstPlayerIndex: 0,
      }),
      pendingPrompt: {
        respondingPlayer: 0,
        resumeContext: null,
        options: {
          promptType: "ARRANGE_TOP_CARDS",
          cards: [],
          effectDescription: "Arrange the top cards",
          canSendToBottom: true,
        },
      },
      promptRespondingPlayer: 0,
    });
    const output = JSON.stringify(rendered.toJSON());

    expect(output).toContain("Start-of-game effects are resolving");
    expect(output).toContain("Nami");
    expect(output).toContain("arranging cards");
  });

  it("renders match completion without a dialog and offers a non-trapping exit", () => {
    const onBackToLobbies = vi.fn();
    const rendered = renderGate({
      matchClosed: true,
      winner: 1,
      pregame: pregame({ phase: "MULLIGAN_DECISIONS" }),
      onBackToLobbies,
    });
    const root = rendered.root;
    const output = JSON.stringify(rendered.toJSON());

    expect(root.findAllByProps({ role: "dialog" })).toHaveLength(0);
    expect(output).toContain("Match complete");
    expect(output).toContain("Robin wins");
    expect(output).toContain("Conceded");
    const announcement = root.findByProps({ role: "status" });
    expect(announcement.findAllByType("button")).toHaveLength(0);
    const exit = root
      .findAllByType("button")
      .find((button) => button.children.includes("Back to Party"));
    expect(exit).toBeDefined();
    act(() => exit?.props.onClick());
    expect(onBackToLobbies).toHaveBeenCalledOnce();
    expect(output).not.toContain("Keep hand");
  });

  it("renders the interactive pregame overlay for a player", () => {
    const rendered = renderGate({
      viewerRole: "player",
      pregame: pregame({ phase: "MULLIGAN_DECISIONS" }),
      activePrompt: {
        promptType: "PLAYER_CHOICE",
        choices: [],
        effectDescription: "PREGAME_MULLIGAN",
        source: "PREGAME",
      },
      promptRespondingPlayer: 0,
    });
    const root = rendered.root;

    expect(root.findAllByProps({ role: "dialog" })).toHaveLength(1);
    expect(JSON.stringify(rendered.toJSON())).toContain("Keep hand");
  });

  it("yields to a player's interactive start-of-game prompt", () => {
    const rendered = renderGate({
      viewerRole: "player",
      pregame: pregame({
        phase: "START_OF_GAME_FX",
        firstPlayerIndex: 0,
      }),
      activePrompt: {
        promptType: "ARRANGE_TOP_CARDS",
        cards: [
          {
            instanceId: "imu-deck-top-1",
            cardId: "OP13-097",
            zone: "DECK",
            state: "ACTIVE",
            attachedDon: [],
            turnPlayed: null,
            controller: 0,
            owner: 0,
          },
        ],
        effectDescription: "Arrange the top cards",
        canSendToBottom: true,
      },
      promptRespondingPlayer: 0,
    });

    expect(rendered.toJSON()).toBeNull();
  });

  it("keeps preparing the game visible without a start-of-game prompt", () => {
    const rendered = renderGate({
      viewerRole: "player",
      pregame: pregame({
        phase: "START_OF_GAME_FX",
        firstPlayerIndex: 0,
      }),
      activePrompt: null,
      pendingPrompt: null,
    });

    expect(JSON.stringify(rendered.toJSON())).toContain("Preparing the game");
  });
});
