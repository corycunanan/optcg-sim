import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import {
  createDeterministicExecutionContext,
  createProductionExecutionContext,
} from "../engine/execution-context.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import {
  applyMulligan,
  buildInitialState,
  dealOpeningHand,
  placeLifeCards,
  prepareDecksAndLeaders,
} from "../engine/setup.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type { CardData, GameState } from "../types.js";
import { CARDS, createTestPayload } from "./helpers.js";

const FIXED_CONTEXT = () => createDeterministicExecutionContext("opt-477-fixed-seed", {
  gameId: "test-game-001",
  clockEpochMs: 1_750_000_000_000,
  traceId: "trace-opt-477",
});

function byteEquivalent(value: unknown): string {
  return JSON.stringify(value);
}

function withoutTestOrder() {
  const payload = structuredClone(createTestPayload());
  payload.player1.testOrder = null;
  payload.player2.testOrder = null;
  return payload;
}

function engineFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? engineFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("OPT-477 deterministic EngineExecutionContext", () => {
  it("uses fresh cryptographic entropy for production contexts", () => {
    const first = createProductionExecutionContext("production-game");
    const second = createProductionExecutionContext("production-game");

    expect(first.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(second.seed).not.toBe(first.seed);
  });

  it("builds byte-equivalent game state from the same payload and injected context", () => {
    const payload = withoutTestOrder();
    const first = buildInitialState(payload, FIXED_CONTEXT()).state;
    const second = buildInitialState(payload, FIXED_CONTEXT()).state;

    expect(byteEquivalent(first)).toBe(byteEquivalent(second));
    expect(first.executionContext).toMatchObject({
      seed: "opt-477-fixed-seed",
      clockEpochMs: 1_750_000_000_000,
      trace: { gameId: payload.gameId, traceId: "trace-opt-477" },
    });
  });

  it("changes shuffle outcomes when the injected seed changes", () => {
    const payload = withoutTestOrder();
    const first = buildInitialState(
      payload,
      createDeterministicExecutionContext("seed-a", { gameId: payload.gameId }),
    ).state;
    const second = buildInitialState(
      payload,
      createDeterministicExecutionContext("seed-b", { gameId: payload.gameId }),
    ).state;

    expect(first.players[0].deck.map((card) => card.cardId)).not.toEqual(
      second.players[0].deck.map((card) => card.cardId),
    );
  });

  it("replays shuffles, prompts, frames, IDs, and timestamps across JSON restart", () => {
    const { state, cardDb } = buildInitialState(withoutTestOrder(), FIXED_CONTEXT());
    const actions: Action[] = [
      { type: "SHUFFLE_DECK" },
      { type: "CHOOSE_VALUE", params: { domain: "COST" }, result_ref: "chosen" },
      { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
    ];

    const firstPrompt = executeActionChain(
      state,
      actions,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    const secondPrompt = executeActionChain(
      structuredClone(state),
      actions,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(byteEquivalent(firstPrompt)).toBe(byteEquivalent(secondPrompt));

    const restored = JSON.parse(JSON.stringify(firstPrompt.state)) as GameState;
    const resumedAfterRestart = resumeFromStack(
      restored,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:3" },
      cardDb,
    );
    const resumedWithoutRestart = resumeFromStack(
      firstPrompt.state,
      { type: "PLAYER_CHOICE", choiceId: "choose-value:3" },
      cardDb,
    );
    expect(byteEquivalent(resumedAfterRestart)).toBe(byteEquivalent(resumedWithoutRestart));
  });

  it("allocates trigger identity deterministically from state", () => {
    const { state, cardDb } = buildInitialState(createTestPayload(), FIXED_CONTEXT());
    const schema: EffectSchema = {
      card_id: "TRIGGER-SOURCE",
      effects: [{
        id: "on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    };
    const data: CardData = { ...CARDS.VANILLA, id: "TRIGGER-SOURCE", effectSchema: schema };
    cardDb.set(data.id, data);
    const source = { ...state.players[0].leader, cardId: data.id, zone: "CHARACTER" as const };

    const first = registerTriggersForCard(state, source, data);
    const second = registerTriggersForCard(structuredClone(state), source, data);
    expect(byteEquivalent(first)).toBe(byteEquivalent(second));
    expect(first.triggerRegistry.at(-1)?.id).toMatch(/^trigger_[0-9a-z]{8}$/);
  });

  it("keeps ambient entropy and time behind the execution-context adapter", () => {
    const engineRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "engine");
    const offenders = engineFiles(engineRoot)
      .filter((path) => !path.endsWith("execution-context.ts"))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return /Date\.now\s*\(|Math\.random\s*\(|crypto\.|\bnanoid\s*\(/.test(source)
          ? [path.slice(engineRoot.length + 1)]
          : [];
      });

    expect(offenders).toEqual([]);
  });

  it("hydrates pre-OPT-477 pregame snapshots before setup transitions", () => {
    const { state: prepared, cardDb } = prepareDecksAndLeaders(createTestPayload(), FIXED_CONTEXT());
    const legacy = structuredClone(prepared) as Partial<GameState>;
    delete legacy.executionContext;

    const withHand = dealOpeningHand(legacy as GameState, 0);
    expect(withHand.executionContext.seed).toBe(`legacy:${prepared.id}`);
    expect(withHand.players[0].hand).toHaveLength(5);

    const withLife = placeLifeCards(legacy as GameState, cardDb);
    expect(withLife.executionContext).toBeDefined();
    expect(withLife.players[0].life).toHaveLength(5);

    const mulliganBase = dealOpeningHand(legacy as GameState, 0);
    const mulligan = applyMulligan(mulliganBase, 0);
    expect(mulligan.executionContext).toBeDefined();
    expect(mulligan.players[0].hand).toHaveLength(5);
  });
});
