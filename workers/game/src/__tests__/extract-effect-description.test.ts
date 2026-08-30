import { describe, expect, it } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import type { CardInstance, EffectStackFrame } from "../types.js";
import {
  extractEffectDescription,
  promptEffectDescription,
} from "../engine/effect-resolver/action-utils.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function block(
  keyword: "ACTIVATE_MAIN" | "ON_PLAY" | "WHEN_ATTACKING",
  sourceText?: string
): EffectBlock {
  return {
    id: "test_effect",
    category: "activate",
    trigger: { keyword },
    ...(sourceText === undefined ? {} : { source_text: sourceText }),
  };
}

describe("extractEffectDescription", () => {
  it("returns only Imu's Activate: Main clause after a newline", () => {
    const effectText =
      "If you have any DON!! cards on your field, 1 DON!! card placed during your DON!! Phase is given to your Leader.\n[Activate: Main] [Once Per Turn] You may rest 1 of your DON!! cards: Draw 1 card.";

    expect(extractEffectDescription(effectText, block("ACTIVATE_MAIN"))).toBe(
      "[Activate: Main] [Once Per Turn] You may rest 1 of your DON!! cards: Draw 1 card."
    );
  });

  it("separates concatenated bracketed effects for Izo-shaped text", () => {
    const effectText =
      "[On Play] Give up to 1 rested DON!! card to your Leader or 1 of your Characters. [When Attacking] Draw 1 card.";

    expect(extractEffectDescription(effectText, block("WHEN_ATTACKING"))).toBe(
      "[When Attacking] Draw 1 card."
    );
  });

  it("strips a same-line preamble before a single bracketed effect", () => {
    expect(
      extractEffectDescription("Rule text. [On Play] Draw 1.", block("ON_PLAY"))
    ).toBe("[On Play] Draw 1.");
  });

  it("keeps a DON!! prefix attached to its trigger section", () => {
    const effectText = "[On Play] Draw 1. [DON!! x1] [When Attacking] Draw 2.";

    expect(extractEffectDescription(effectText, block("WHEN_ATTACKING"))).toBe(
      "[DON!! x1] [When Attacking] Draw 2."
    );
  });

  it("returns authored source_text verbatim before applying heuristics", () => {
    const sourceText = "  Authored clause with intentional spacing.  ";

    expect(
      extractEffectDescription(
        "[Activate: Main] Heuristic clause.",
        block("ACTIVATE_MAIN", sourceText)
      )
    ).toBe(sourceText);
  });

  it("returns the activation fallback for empty effect text", () => {
    expect(extractEffectDescription("", block("ACTIVATE_MAIN"))).toBe(
      "You may activate this effect."
    );
  });

  it("returns the full text when the block has no trigger", () => {
    const effectText = "Rule text without a trigger.";
    const triggerlessBlock: EffectBlock = {
      id: "triggerless_effect",
      category: "permanent",
    };

    expect(extractEffectDescription(effectText, triggerlessBlock)).toBe(
      effectText
    );
  });

  it("returns the full text for an unknown trigger keyword", () => {
    const effectText = "Unknown keyword effect text.";
    const unknownKeywordBlock: EffectBlock = {
      id: "unknown_keyword_effect",
      category: "auto",
      trigger: {
        keyword: "OPPONENT_DRAW_PHASE",
      } as unknown as EffectBlock["trigger"],
    };

    expect(extractEffectDescription(effectText, unknownKeywordBlock)).toBe(
      effectText
    );
  });
});

describe("promptEffectDescription", () => {
  const effectText =
    "[On Play] Draw 1 card. [When Attacking] K.O. up to 1 of your opponent's Characters.";

  function setup() {
    const cardDb = createTestCardDb();
    const sourceData = {
      ...cardDb.values().next().value!,
      id: "TEST-PROMPT-SOURCE",
      effectText,
    };
    cardDb.set(sourceData.id, sourceData);
    const source: CardInstance = {
      instanceId: "prompt-source",
      cardId: sourceData.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const state = createBattleReadyState(cardDb);
    state.players[0].characters[0] = source;
    return { state, cardDb, source };
  }

  it("returns the clause from the topmost matching effect frame", () => {
    const { state, cardDb, source } = setup();
    const frame = {
      sourceCardInstanceId: source.instanceId,
      effectBlock: block("WHEN_ATTACKING"),
    } as EffectStackFrame;
    state.effectStack = [
      { ...frame, effectBlock: block("ON_PLAY") },
      frame,
    ];

    expect(promptEffectDescription(state, cardDb, source.instanceId)).toBe(
      "[When Attacking] K.O. up to 1 of your opponent's Characters."
    );
  });

  it("returns the full card text when no matching frame exists", () => {
    const { state, cardDb, source } = setup();

    expect(promptEffectDescription(state, cardDb, source.instanceId)).toBe(
      effectText
    );
  });
});
