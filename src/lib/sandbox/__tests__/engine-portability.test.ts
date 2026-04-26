// Smoke test: proves the OPTCG engine in `workers/game/src/engine` is
// importable and runnable from the Next.js app via the `@engine/*` alias.
// Phase 2 of the Animation Sandbox depends on this — playground scenarios
// drive `runPipeline` directly instead of the scripted `apply-event` reducer.

import { describe, expect, it } from "vitest";
import { runPipeline } from "@engine/engine/pipeline";
import { buildInitialState } from "@engine/engine/setup";
import type { CardData, GameAction, GameInitPayload, KeywordSet } from "@engine/types";

function noKeywords(): KeywordSet {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function stubPayload(): GameInitPayload {
  const leader = makeCard("LEADER-T", { type: "Leader", cost: null, power: 5000, life: 5 });
  const vanilla = makeCard("CHAR-VANILLA", { cost: 3, power: 4000, counter: 1000 });
  return {
    gameId: "engine-portability-smoke",
    format: "standard",
    player1: {
      userId: "u1",
      leader: { cardId: leader.id, quantity: 1, cardData: leader },
      deck: [{ cardId: vanilla.id, quantity: 50, cardData: vanilla }],
    },
    player2: {
      userId: "u2",
      leader: { cardId: leader.id, quantity: 1, cardData: leader },
      deck: [{ cardId: vanilla.id, quantity: 50, cardData: vanilla }],
    },
  };
}

describe("engine portability", () => {
  it("imports @engine/* modules and runs the pipeline against a real GameState", () => {
    const { state } = buildInitialState(stubPayload());

    // PASS is invalid outside a battle sub-phase — the pipeline should
    // return a structured `valid: false` result, not throw. Proves the
    // engine's full validate → respond chain runs from the app context.
    const result = runPipeline(state, { type: "PASS" } as GameAction, new Map(), 0);

    expect(result).toBeDefined();
    expect(result.state).toBeDefined();
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe("string");
  });
});
