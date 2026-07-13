/**
 * DON!!-inclusive rest support (OP16-033 Morley, OP16-035 Zoro).
 *
 * "Rest N of your (opponent's) cards" spans Leader/Character/Stage AND DON!!.
 * Field cards use the new FIELD_CARD target type (leader + characters +
 * stage); DON rests go through REST_DON / REST_OPPONENT_DON inside a
 * PLAYER_CHOICE payment. Covers: FIELD_CARD resolution, stage rest via
 * setCardState, and the replacement feasibility gate for choice payments.
 */

import { describe, expect, it } from "vitest";
import { executeSetRest } from "../engine/effect-resolver/actions/play.js";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import "../engine/effect-resolver/resolver.js";
import { computeAllValidTargets } from "../engine/effect-resolver/target-resolver.js";
import type { Action, EffectResult, Target } from "../engine/effect-types.js";
import { OP16_033_MORLEY } from "../engine/schemas/op16.js";
import { registerReplacementsForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, DonInstance, GameState, KeywordSet, PlayerState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false, rushCharacter: false, doubleAttack: false, banish: false,
    blocker: false, trigger: false, unblockable: false,
  };
}

const cardDb = createTestCardDb();
const morley: CardData = {
  id: "OP16-033", name: "Morley", type: "Character", color: ["Green"], cost: 5,
  power: 7000, counter: null, life: null, attribute: [], types: ["Impel Down"],
  effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: OP16_033_MORLEY, imageUrl: null,
};
cardDb.set(morley.id, morley);

function stageInstance(owner: 0 | 1): CardInstance {
  return {
    instanceId: `stage-${owner}`, cardId: CARDS.STAGE.id, zone: "STAGE", state: "ACTIVE",
    attachedDon: [], turnPlayed: 1, controller: owner, owner,
  };
}

function withStage(state: GameState, owner: 0 | 1): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[owner] = { ...players[owner], stage: stageInstance(owner) };
  return { ...state, players };
}

describe("FIELD_CARD target type", () => {
  it("resolves leader + characters + stage", () => {
    const state = withStage(createBattleReadyState(cardDb), 1);
    const target: Target = { type: "FIELD_CARD", controller: "OPPONENT", count: { exact: 1 } };
    const ids = computeAllValidTargets(state, target, 0, cardDb, "char-0-v1", new Map<string, EffectResult>());
    expect(ids).toContain(state.players[1].leader.instanceId);
    expect(ids).toContain("char-1-v1");
    expect(ids).toContain("stage-1");
  });

  it("SET_REST rests a stage via FIELD_CARD", () => {
    const state = withStage(createBattleReadyState(cardDb), 1);
    const action: Action = {
      type: "SET_REST",
      target: { type: "FIELD_CARD", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeSetRest(state, action, "char-0-v1", 0, cardDb, new Map<string, EffectResult>(), ["stage-1"]);
    expect(result.succeeded).toBe(true);
    expect(result.state.players[1].stage?.state).toBe("RESTED");
  });
});

describe("OP16-033 Morley KO replacement (choice-of-payments)", () => {
  function setupMorley(donState: "ACTIVE" | "RESTED"): GameState {
    const base = createBattleReadyState(cardDb);
    const morleyInst: CardInstance = {
      instanceId: "morley", cardId: morley.id, zone: "CHARACTER", state: "RESTED",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    // Morley alone on the field, own leader RESTED so field payments are
    // impossible — only DON!! can pay.
    players[0] = {
      ...players[0],
      characters: padChars([morleyInst]),
      leader: { ...players[0].leader, state: "RESTED" },
      donCostArea: players[0].donCostArea.map((d): DonInstance => ({ ...d, state: donState })),
    };
    return registerReplacementsForCard({ ...base, players }, morleyInst, morley);
  }

  const koAction: Action = {
    type: "KO",
    target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
  };

  it("offers the optional replacement when DON!! can pay", () => {
    const state = setupMorley("ACTIVE");
    const result = executeKO(state, koAction, "opp-effect", 1, cardDb, new Map<string, EffectResult>(), ["morley"]);
    expect(result.pendingPrompt).toBeDefined();
  });

  it("skips the replacement (KO proceeds) when nothing can pay", () => {
    const state = setupMorley("RESTED");
    const result = executeKO(state, koAction, "opp-effect", 1, cardDb, new Map<string, EffectResult>(), ["morley"]);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].trash.some((c) => c.instanceId === "morley")).toBe(false);
  });
});
