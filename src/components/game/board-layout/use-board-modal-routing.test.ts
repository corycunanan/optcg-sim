import { describe, expect, it } from "vitest";
import type { PromptOptions } from "@shared/game-types";
import { resolveBoardPrompt } from "./use-board-modal-routing";

const prompt = {
  promptType: "OPTIONAL_EFFECT",
  effectDescription: "Use this effect?",
} as PromptOptions;

describe("resolveBoardPrompt", () => {
  it("routes the active prompt when the spotlight is not blocking it", () => {
    expect(resolveBoardPrompt(prompt, false)).toBe(prompt);
  });

  it("suppresses modal routing while the public spotlight owns the prompt", () => {
    expect(resolveBoardPrompt(prompt, true)).toBeNull();
  });
});
