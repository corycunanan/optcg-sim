import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { CardDb, PromptOptions } from "@shared/game-types";
import { sandboxBoardPrompt } from "@/components/sandbox/sandbox-board-prompt";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <>{children}</>;
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});

vi.mock("../game-button", () => ({
  GameButton: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { BoardModals } from "./board-modals";

const prompt = {
  promptType: "PLAYER_CHOICE",
  effectDescription: "Return 1 DON!! card to your DON!! deck.",
  choices: [
    { id: "don-return:1:1", label: "Return active DON!!" },
    { id: "don-return:0:1:leader=1", label: "Return attached DON!!" },
  ],
  donReturn: {
    count: 1,
    sources: [
      {
        id: "cost-active",
        label: "Active DON!!",
        max: 1,
        kind: "COST_ACTIVE",
      },
      {
        id: "leader",
        label: "Leader",
        max: 1,
        kind: "ATTACHED",
      },
    ],
  },
} satisfies PromptOptions;

const boardModals = (activePromptId: string) => {
  const boardPrompt = sandboxBoardPrompt({
    activePrompt: { ...prompt, choices: [...prompt.choices] },
    activePromptId,
  });
  return (
    <BoardModals
      {...boardPrompt}
      isPromptHidden={false}
      onHide={vi.fn()}
      cardDb={{} as CardDb}
      onAction={vi.fn()}
      zonePreview={null}
      onCloseZonePreview={vi.fn()}
      me={null}
      opp={null}
      redistributeTransfers={[]}
      onRedistributeUndo={vi.fn()}
    />
  );
};

const selectedCount = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType("span")
    .find((node) => node.props["aria-live"] === "polite")!
    .children.join("");

describe("sandbox BoardState PLAYER_CHOICE prompt identity", () => {
  it("preserves DON selection for the same prompt ID and resets it for the next prompt ID", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(boardModals("prompt-1"));
    });

    await act(async () => {
      renderer.root
        .findByProps({ "aria-label": "Add one from Active DON!!" })
        .props.onClick();
    });
    expect(selectedCount(renderer)).toBe("1");

    await act(async () => {
      renderer.update(boardModals("prompt-1"));
    });
    expect(selectedCount(renderer)).toBe("1");

    await act(async () => {
      renderer.update(boardModals("prompt-2"));
    });
    expect(selectedCount(renderer)).toBe("0");
  });
});
