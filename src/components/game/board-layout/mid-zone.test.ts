import { describe, expect, it } from "vitest";
import type { PromptOptions } from "@shared/game-types";
import { getPromptAnnouncement } from "./mid-zone";

describe("getPromptAnnouncement", () => {
  it("announces modal prompt arrivals and hidden state", () => {
    const prompt = {
      promptType: "PLAYER_CHOICE",
    } as PromptOptions;

    expect(getPromptAnnouncement(prompt)).toBe(
      "Action required. player choice.",
    );
    expect(getPromptAnnouncement(prompt, undefined, undefined, true)).toBe(
      "Action required. player choice prompt hidden. Show the prompt to respond.",
    );
  });

  it("announces selection state without implying submission", () => {
    expect(
      getPromptAnnouncement(
        null,
        undefined,
        {
          effectDescription: "Choose a Character",
          countLabel: "Choose 1",
          selectedCount: 1,
          aggregateLabel: null,
          ctaLabel: "Confirm",
          canConfirm: true,
          canSkip: false,
          onConfirm: () => {},
          onSkip: () => {},
        },
      ),
    ).toBe("Action required. Choose a Character. 1 selected.");
  });

  it("announces blocker selection changes", () => {
    expect(
      getPromptAnnouncement(null, {
        selectedBlockerId: null,
        onBlock: () => {},
      }),
    ).toBe("Action required. Choose a blocker or skip.");
    expect(
      getPromptAnnouncement(null, {
        selectedBlockerId: "blocker-1",
        onBlock: () => {},
      }),
    ).toBe("Action required. Blocker selected. Confirm block or skip.");
  });
});
