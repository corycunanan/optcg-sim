import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

describe("OPT-377 resolver import boundaries", () => {
  it("resumes an optional effect through the production action pipeline", () => {
    const cardDb = createTestCardDb();
    const leader: CardData = {
      ...cardDb.get("LEADER-T")!,
      id: "OPT-377-LEADER",
      effectSchema: {
        card_id: "OPT-377-LEADER",
        effects: [
          {
            id: "opt377_optional_draw",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            flags: { optional: true },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    };
    cardDb.set(leader.id, leader);
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: { ...players[0].leader, cardId: leader.id },
    };
    state = { ...state, players };

    const deckBefore = state.players[0].deck.length;
    const offered = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "opt377_optional_draw",
      },
      cardDb,
      0
    );
    expect(offered.valid).toBe(true);
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const resumed = resumeFromStack(
      { ...offered.state, pendingPrompt: null },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb
    );
    expect(resumed.resolved).toBe(true);
    expect(resumed.state.players[0].deck).toHaveLength(deckBefore - 1);
  });

  it("evaluates a conditional filtered modifier through leaf query services", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const character: CardInstance = {
      instanceId: "opt377-character",
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const effect: RuntimeActiveEffect = {
      id: "opt377-filtered-power",
      sourceCardInstanceId: state.players[0].leader.instanceId,
      sourceEffectBlockId: "opt377-filtered-power-block",
      category: "permanent",
      controller: 0,
      appliesTo: [],
      conditions: {
        type: "HAND_COUNT",
        controller: "SELF",
        operator: ">=",
        value: 0,
      },
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: { cost_max: CARDS.VANILLA.cost ?? 0 },
          },
          params: { amount: 1000 },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      timestamp: 1,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([character]) };
    state = { ...state, players, activeEffects: [effect] };

    expect(getEffectivePower(character, CARDS.VANILLA, state, cardDb)).toBe(
      (CARDS.VANILLA.power ?? 0) + 1000
    );
  });
});
