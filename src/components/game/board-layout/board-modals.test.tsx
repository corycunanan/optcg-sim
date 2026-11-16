import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { CardDb, GameAction, PromptOptions } from "@shared/game-types";
import { sandboxBoardPrompt } from "@/components/sandbox/sandbox-board-prompt";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <>{children}</>;
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    TooltipProvider: Wrapper,
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

const arrangeCards = ["c1", "c2", "c3"].map((id) => ({
  instanceId: id,
  cardId: "OP01-001",
  zone: "DECK" as const,
  state: "ACTIVE" as const,
  attachedDon: [],
  turnPlayed: null,
  controller: 0 as const,
  owner: 0 as const,
}));

const arrangePrompt = {
  promptType: "ARRANGE_TOP_CARDS",
  cards: arrangeCards,
  effectDescription: "[On Play] Look at 3 cards from the top of your deck.",
  canSendToBottom: true,
  maxKeep: 2,
} satisfies PromptOptions;

const arrangeModals = (activePromptId: string | null) => (
  <BoardModals
    activePrompt={{ ...arrangePrompt, cards: [...arrangeCards] }}
    activePromptId={activePromptId}
    isPromptHidden={false}
    onHide={vi.fn()}
    cardDb={{} as CardDb}
    onAction={vi.fn()}
    zonePreview={null}
    onCloseZonePreview={vi.fn()}
    me={null}
    opp={null}
  />
);

const arrangeText = (renderer: ReactTestRenderer) =>
  JSON.stringify(renderer.toJSON());
const onPickStep = (renderer: ReactTestRenderer) =>
  arrangeText(renderer).includes("0 of 2 selected") &&
  !arrangeText(renderer).includes("Order the remaining");
const skipToStepTwo = async (renderer: ReactTestRenderer) => {
  await act(async () => {
    renderer.root
      .findAllByType("button")
      .find((node) => node.children.join("") === "Skip")!
      .props.onClick();
  });
};

describe("ARRANGE_TOP_CARDS prompt identity", () => {
  it("resets to the pick step when a new prompt reveals the same card list", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(arrangeModals("prompt-a"));
    });
    expect(onPickStep(renderer)).toBe(true);

    await skipToStepTwo(renderer);
    expect(arrangeText(renderer)).toContain("Order the remaining");

    await act(async () => {
      renderer.update(arrangeModals("prompt-b"));
    });
    expect(onPickStep(renderer)).toBe(true);
  });

  it("keeps step 2 when the same prompt id is re-sent", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(arrangeModals("prompt-a"));
    });
    await skipToStepTwo(renderer);
    await act(async () => {
      renderer.update(arrangeModals("prompt-a"));
    });
    expect(arrangeText(renderer)).toContain("Order the remaining");
  });

  it("falls back to the card list when no prompt id is available", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(arrangeModals(null));
    });
    await skipToStepTwo(renderer);
    await act(async () => {
      renderer.update(arrangeModals(null));
    });
    expect(arrangeText(renderer)).toContain("Order the remaining");
  });
});

describe("ARRANGE_TOP_CARDS skips a reorder with nothing to decide", () => {
  const render = async (
    prompt: Extract<PromptOptions, { promptType: "ARRANGE_TOP_CARDS" }>,
    onAction: (action: GameAction) => void,
  ) => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <BoardModals
          activePrompt={prompt}
          activePromptId="prompt-a"
          isPromptHidden={false}
          onHide={vi.fn()}
          cardDb={{} as CardDb}
          onAction={onAction}
          zonePreview={null}
          onCloseZonePreview={vi.fn()}
          me={null}
          opp={null}
        />,
      );
    });
    return renderer;
  };

  it("submits right after the pick when the rest's order is discarded", async () => {
    const onAction = vi.fn<(action: GameAction) => void>();
    const renderer = await render(
      { ...arrangePrompt, cards: [...arrangeCards], restOrderMatters: false },
      onAction,
    );
    await skipToStepTwo(renderer);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceIds: [],
      orderedInstanceIds: arrangeCards.map((card) => card.instanceId),
    });
  });

  it("places a single leftover card without a reorder step", async () => {
    const onAction = vi.fn<(action: GameAction) => void>();
    const renderer = await render(
      { ...arrangePrompt, cards: arrangeCards.slice(0, 1) },
      onAction,
    );
    await skipToStepTwo(renderer);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "ARRANGE_TOP_CARDS",
      orderedInstanceIds: [arrangeCards[0].instanceId],
      destination: "bottom",
    });
  });

  it("still asks for the order of two or more leftover cards", async () => {
    const onAction = vi.fn<(action: GameAction) => void>();
    const renderer = await render(
      { ...arrangePrompt, cards: [...arrangeCards] },
      onAction,
    );
    await skipToStepTwo(renderer);
    expect(onAction).not.toHaveBeenCalled();
    expect(arrangeText(renderer)).toContain("Order the remaining");
  });
});

describe("actionLabel titles every effect modal (OPT-779)", () => {
  const card = arrangeCards[0];
  const base = { effectDescription: "[On Play] Do a thing." };
  const cases: Array<[string, PromptOptions]> = [
    [
      "ARRANGE_TOP_CARDS",
      { ...base, promptType: "ARRANGE_TOP_CARDS", cards: arrangeCards, canSendToBottom: true },
    ],
    [
      "SELECT_TARGET",
      {
        ...base,
        promptType: "SELECT_TARGET",
        cards: [card],
        validTargets: [card.instanceId],
        countMin: 1,
        countMax: 1,
        ctaLabel: "Confirm",
      },
    ],
    [
      "PLAYER_CHOICE",
      { ...base, promptType: "PLAYER_CHOICE", choices: [{ id: "0", label: "A" }, { id: "1", label: "B" }] },
    ],
    ["OPTIONAL_EFFECT", { ...base, promptType: "OPTIONAL_EFFECT", cards: [card] }],
    [
      "REVEAL_TRIGGER",
      {
        ...base,
        promptType: "REVEAL_TRIGGER",
        cards: [card],
        optional: true,
        timeoutMs: 1000,
      },
    ],
  ];

  it.each(cases)("%s prompt renders the label in its title", async (_type, options) => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <BoardModals
          activePrompt={{ ...options, actionLabel: "KO Characters" } as PromptOptions}
          activePromptId="p1"
          isPromptHidden={false}
          onHide={vi.fn()}
          cardDb={{} as CardDb}
          onAction={vi.fn()}
          zonePreview={null}
          onCloseZonePreview={vi.fn()}
          me={null}
          opp={null}
        />
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Card Effect: KO Characters");
    expect(json).not.toContain("Card Effect: On Play");
  });
});
