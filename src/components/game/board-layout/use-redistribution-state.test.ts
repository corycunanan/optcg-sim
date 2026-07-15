import { describe, expect, it } from "vitest";
import type { PromptOptions } from "@shared/game-types";
import type { RedistributeTransfer } from "../redistribute-don-overlay";
import {
  getRedistributePromptKey,
  stageRedistributeTransfer,
} from "./use-redistribution-state";

type RedistributePrompt = Extract<
  PromptOptions,
  { promptType: "REDISTRIBUTE_DON" }
>;

const prompt = {
  promptType: "REDISTRIBUTE_DON",
  effectDescription: "Move up to 2 DON!! cards.",
  validSourceCardIds: ["source-a", "source-b"],
  validTargetCardIds: ["target-a", "target-b"],
  maxTransfers: 2,
} as RedistributePrompt;

describe("DON redistribution state", () => {
  it("keys staged transfers to the exact prompt contract", () => {
    expect(getRedistributePromptKey(prompt)).toBe(
      "source-a,source-b|target-a,target-b|2"
    );
    expect(getRedistributePromptKey(null)).toBeNull();
  });

  it("stages valid moves without mutating the previous transaction", () => {
    const previous: ReturnType<typeof stageRedistributeTransfer> = [];
    const next = stageRedistributeTransfer(
      previous,
      prompt,
      "source-a",
      "don-1",
      "target-a"
    );

    expect(previous).toEqual([]);
    expect(next).toEqual([
      {
        fromCardInstanceId: "source-a",
        donInstanceId: "don-1",
        toCardInstanceId: "target-a",
      },
    ]);
  });

  it("rejects invalid sources, targets, self-moves, duplicate DON, and overflow", () => {
    const first = stageRedistributeTransfer(
      [],
      prompt,
      "source-a",
      "don-1",
      "target-a"
    );
    const second = stageRedistributeTransfer(
      first,
      prompt,
      "source-b",
      "don-2",
      "target-b"
    );

    const invalidTransfers: Array<
      [RedistributeTransfer[], string, string, string]
    > = [
      [[], "invalid", "don-3", "target-a"],
      [[], "source-a", "don-3", "invalid"],
      [[], "source-a", "don-3", "source-a"],
      [first, "source-b", "don-1", "target-b"],
      [second, "source-a", "don-3", "target-a"],
    ];

    for (const [transfers, from, don, to] of invalidTransfers) {
      expect(stageRedistributeTransfer(transfers, prompt, from, don, to)).toBe(
        transfers
      );
    }
  });
});
