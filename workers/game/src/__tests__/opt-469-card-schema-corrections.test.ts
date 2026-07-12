import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState, KeywordSet, PlayerState } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { executeAdvancePhase } from "../engine/phases.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { validateEffectSchema } from "../engine/schema-registry.js";
import { OP03_032_BUGGY } from "../engine/schemas/op03.js";
import { OP04_042_IPPONMATSU } from "../engine/schemas/op04.js";
import { OP06_026_KOUSHIROU } from "../engine/schemas/op06.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

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
    color: ["Green"],
    cost: 3,
    power: 5000,
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

function makeCharacter(
  cardId: string,
  instanceId: string,
  controller: 0 | 1,
  state: "ACTIVE" | "RESTED" = "ACTIVE",
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state,
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function withPlayer(state: GameState, index: 0 | 1, patch: Partial<PlayerState>): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[index] = { ...players[index], ...patch };
  return { ...state, players };
}

describe("OPT-469: corrected schemas validate semantically", () => {
  it.each([
    ["OP03-032", OP03_032_BUGGY],
    ["OP04-042", OP04_042_IPPONMATSU],
    ["OP06-026", OP06_026_KOUSHIROU],
  ] as const)("%s has no schema validation errors", (cardId, schema) => {
    expect(validateEffectSchema(schema, cardId)).toEqual([]);
  });
});

describe("OPT-469: OP03-032 Buggy", () => {
  function battle(attackerAttribute: "Slash" | "Strike"): GameState {
    const cardDb = createTestCardDb();
    const attackerData = makeCard(`ATTACKER-${attackerAttribute}`, {
      attribute: [attackerAttribute],
      power: 9000,
    });
    const buggyData = makeCard("OP03-032", {
      name: "Buggy",
      attribute: ["Slash"],
      effectSchema: OP03_032_BUGGY,
    });
    cardDb.set(attackerData.id, attackerData);
    cardDb.set(buggyData.id, buggyData);

    let state = createBattleReadyState(cardDb);
    const attacker = makeCharacter(attackerData.id, "attacker", 0);
    const buggy = makeCharacter(buggyData.id, "buggy", 1, "RESTED");
    state = withPlayer(state, 0, { characters: padChars([attacker]) });
    state = withPlayer(state, 1, { characters: padChars([buggy]) });
    state = registerPermanentEffectsForCard(state, buggy, buggyData);

    let step = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: buggy.instanceId },
      cardDb,
      0,
    );
    expect(step.valid).toBe(true);
    step = runPipeline(step.state, { type: "PASS" }, cardDb, 0);
    expect(step.valid).toBe(true);
    step = runPipeline(step.state, { type: "PASS" }, cardDb, 0);
    expect(step.valid).toBe(true);
    return step.state;
  }

  it("survives a Slash attacker through the full battle pipeline", () => {
    const result = battle("Slash");
    expect(result.players[1].characters.some((card) => card?.instanceId === "buggy")).toBe(true);
    expect(result.players[1].trash.some((card) => card.instanceId === "buggy")).toBe(false);
  });

  it("is K.O.'d by a non-Slash attacker", () => {
    const result = battle("Strike");
    expect(result.players[1].characters.some((card) => card?.instanceId === "buggy")).toBe(false);
    expect(result.players[1].trash.some((card) => card.instanceId === "buggy")).toBe(false);
  });
});

describe("OPT-469: OP04-042 Ipponmatsu", () => {
  function scene() {
    const cardDb = createTestCardDb();
    const sourceData = makeCard("OP04-042", {
      name: "Ipponmatsu",
      attribute: ["Wisdom"],
      power: 1000,
      effectSchema: OP04_042_IPPONMATSU,
    });
    const slashData = makeCard("SLASH-TARGET", { attribute: ["Slash"], power: 4000 });
    const strikeData = makeCard("STRIKE-TARGET", { attribute: ["Strike"], power: 4000 });
    cardDb.set(sourceData.id, sourceData);
    cardDb.set(slashData.id, slashData);
    cardDb.set(strikeData.id, strikeData);

    let state = createBattleReadyState(cardDb);
    const source = makeCharacter(sourceData.id, "ipponmatsu", 0);
    const slash = makeCharacter(slashData.id, "slash-target", 0);
    const strike = makeCharacter(strikeData.id, "strike-target", 0);
    state = withPlayer(state, 0, { characters: padChars([source, slash, strike]) });
    return { state, cardDb, source, slash, strike, slashData, strikeData };
  }

  it("offers only Slash Characters, applies +3000 for the turn, then mills", () => {
    const { state, cardDb, source, slash, strike, slashData, strikeData } = scene();
    const initialDeck = state.players[0].deck.length;
    const initialTrash = state.players[0].trash.length;
    const offered = resolveEffect(
      state,
      OP04_042_IPPONMATSU.effects[0] as EffectBlock,
      source.instanceId,
      0,
      cardDb,
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (offered.pendingPrompt?.options.promptType !== "SELECT_TARGET") return;
    expect(offered.pendingPrompt.options.validTargets).toEqual([slash.instanceId]);

    const result = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [slash.instanceId] },
      cardDb,
    );
    expect(result.resolved).toBe(true);
    expect(getEffectivePower(slash, slashData, result.state, cardDb)).toBe(7000);
    expect(getEffectivePower(strike, strikeData, result.state, cardDb)).toBe(4000);
    expect(result.state.players[0].deck).toHaveLength(initialDeck - 1);
    expect(result.state.players[0].trash).toHaveLength(initialTrash + 1);

    const afterEnd = executeAdvancePhase(result.state, cardDb).state;
    expect(getEffectivePower(slash, slashData, afterEnd, cardDb)).toBe(4000);
  });

  it("allows choosing zero targets and still performs the mandatory mill", () => {
    const { state, cardDb, source } = scene();
    const initialDeck = state.players[0].deck.length;
    const offered = resolveEffect(
      state,
      OP04_042_IPPONMATSU.effects[0] as EffectBlock,
      source.instanceId,
      0,
      cardDb,
    );
    const result = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb,
    );
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].deck).toHaveLength(initialDeck - 1);
  });
});

describe("OPT-469: OP06-026 Koushirou", () => {
  function scene() {
    const cardDb = createTestCardDb();
    const sourceData = makeCard("OP06-026", {
      name: "Koushirou",
      power: 0,
      attribute: ["Slash"],
      effectSchema: OP06_026_KOUSHIROU,
    });
    const slash4Data = makeCard("SLASH-COST-4", { attribute: ["Slash"], cost: 4 });
    const slash5Data = makeCard("SLASH-COST-5", { attribute: ["Slash"], cost: 5 });
    const strike4Data = makeCard("STRIKE-COST-4", { attribute: ["Strike"], cost: 4 });
    for (const card of [sourceData, slash4Data, slash5Data, strike4Data]) cardDb.set(card.id, card);

    let state = createBattleReadyState(cardDb);
    const source = makeCharacter(sourceData.id, "koushirou", 0);
    const slash4 = makeCharacter(slash4Data.id, "slash-4", 0, "RESTED");
    const slash5 = makeCharacter(slash5Data.id, "slash-5", 0, "RESTED");
    const strike4 = makeCharacter(strike4Data.id, "strike-4", 0, "RESTED");
    state = withPlayer(state, 0, { characters: padChars([source, slash4, slash5, strike4]) });
    const opponentCharacter = { ...state.players[1].characters[0]!, state: "RESTED" as const };
    state = withPlayer(state, 1, { characters: padChars([opponentCharacter]) });
    return { state, cardDb, source, slash4, opponentCharacter };
  }

  it("readies only a qualifying Slash cost-4 Character and locks Leader targets for the turn", () => {
    const { state, cardDb, source, slash4, opponentCharacter } = scene();
    const offered = resolveEffect(
      state,
      OP06_026_KOUSHIROU.effects[0] as EffectBlock,
      source.instanceId,
      0,
      cardDb,
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (offered.pendingPrompt?.options.promptType !== "SELECT_TARGET") return;
    expect(offered.pendingPrompt.options.validTargets).toEqual([
      source.instanceId,
      slash4.instanceId,
    ]);
    expect(offered.pendingPrompt.options.validTargets).not.toContain("slash-5");
    expect(offered.pendingPrompt.options.validTargets).not.toContain("strike-4");

    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [slash4.instanceId] },
      cardDb,
    );
    expect(resolved.state.players[0].characters.find((card) => card?.instanceId === slash4.instanceId)?.state).toBe("ACTIVE");
    expect(resolved.state.prohibitions).toHaveLength(1);

    const leaderAttack = runPipeline(
      resolved.state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: source.instanceId,
        targetInstanceId: resolved.state.players[1].leader.instanceId,
      },
      cardDb,
      0,
    );
    expect(leaderAttack.valid).toBe(false);
    expect(leaderAttack.error).toMatch(/cannot attack/i);

    const characterAttack = runPipeline(
      resolved.state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: source.instanceId,
        targetInstanceId: opponentCharacter.instanceId,
      },
      cardDb,
      0,
    );
    expect(characterAttack.valid).toBe(true);

    const afterEnd = executeAdvancePhase(resolved.state, cardDb).state;
    expect(afterEnd.prohibitions).toHaveLength(0);
  });

  it("allows choosing zero Characters but still applies the mandatory attack restriction", () => {
    const { state, cardDb, source } = scene();
    const offered = resolveEffect(
      state,
      OP06_026_KOUSHIROU.effects[0] as EffectBlock,
      source.instanceId,
      0,
      cardDb,
    );
    const resolved = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb,
    );
    expect(resolved.resolved).toBe(true);
    expect(resolved.state.prohibitions).toHaveLength(1);
  });
});
