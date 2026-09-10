import { SessionCoordinator } from "../session/coordinator.js";
import { describe, expect, it } from "vitest";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import type {
  EffectBlock,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import type { CardInstance, GameState } from "../types.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { findCardInstance } from "../engine/state.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

describe("OPT-820 replacement continuation chronology", () => {
  it("preserves a non-optional replacement batch while its Trash return is arranged", async () => {
    const outerDescription =
      "[On Play] K.O. up to 1 of your opponent's Characters.";
    const replacementDescription =
      "[On K.O.] Return 3 cards from your trash to the bottom of your deck.";
    const cardDb = createTestCardDb();
    cardDb.set(CARDS.LEADER.id, {
      ...CARDS.LEADER,
      effectText: `${outerDescription}\n[Trigger] Draw 1 card.`,
    });
    cardDb.set(CARDS.VANILLA.id, {
      ...CARDS.VANILLA,
      effectText: replacementDescription,
    });
    const base = createBattleReadyState(cardDb);
    const protectedTarget = base.players[1].characters.find(
      (card) => card !== null
    )!;
    const trash = [CARDS.VANILLA, CARDS.RUSH, CARDS.BLOCKER].map(
      (card, index): CardInstance => ({
        instanceId: `replacement-trash-${index}`,
        cardId: card.id,
        zone: "TRASH",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller: 1,
        owner: 1,
      })
    );
    const replacement: RuntimeActiveEffect = {
      id: "return-trash-instead-of-ko",
      sourceCardInstanceId: protectedTarget.instanceId,
      sourceEffectBlockId: "return-trash-instead-of-ko-block",
      category: "replacement",
      modifiers: [
        {
          type: "REPLACEMENT_EFFECT",
          params: {
            trigger: "WOULD_BE_KO",
            cause_filter: { by: "ANY" },
            target_filter: null,
            replacement_actions: [
              {
                type: "RETURN_TO_DECK",
                target: {
                  type: "CARD_IN_TRASH",
                  controller: "SELF",
                  count: { exact: 3 },
                },
                params: { position: "BOTTOM" },
              },
            ],
            optional: false,
            once_per_turn: false,
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [protectedTarget.instanceId],
      timestamp: 1,
    };
    const state: GameState = {
      ...base,
      players: [
        base.players[0],
        {
          ...base.players[1],
          characters: padChars([protectedTarget]),
          trash,
        },
      ],
      activeEffects: [replacement],
    };
    const block: EffectBlock = {
      id: "ko-then-draw-after-replacement",
      category: "auto",
      source_text: outerDescription,
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
        { type: "DRAW", params: { amount: 1 } },
      ],
    };
    const deckBefore = state.players[1].deck.length;
    const handBefore = state.players[0].hand.length;

    const first = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb
    );

    expect(first.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(first.pendingPrompt?.respondingPlayer).toBe(1);
    expect(first.pendingPrompt?.options).toMatchObject({
      effectDescription: replacementDescription,
    });
    expect(first.state.effectStack).toHaveLength(2);
    expect(
      first.state.effectStack.at(-1)?.replacementBatchContinuation
    ).toBeDefined();
    expect(
      findCardInstance(first.state, protectedTarget.instanceId)?.zone
    ).toBe("CHARACTER");
    expect(first.state.players[1].trash).toEqual(trash);

    const data = new Map<string, unknown>();
    const storage = {
      async get(key: string) {
        return data.get(key);
      },
      async put(key: string | Record<string, unknown>, value?: unknown) {
        for (const [k, v] of Object.entries(
          typeof key === "string" ? { [key]: value } : key
        ))
          data.set(k, structuredClone(v));
      },
      async setAlarm() {},
      async deleteAlarm() {},
    } as SessionStorage;
    const config = { nextJsUrl: "https://example.test", workerSecret: "test" };
    await new SessionRepository(storage, config).save({
      state: { ...first.state, pendingPrompt: first.pendingPrompt! },
      cardDb,
      undoHistory: [],
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
    });
    const restored = await new SessionRepository(storage, config).load();
    expect(restored!.state.effectStack).toHaveLength(2);
    const rejected = new SessionCoordinator().routePromptResponse(
      restored!.state,
      1,
      {
        type: "ARRANGE_TOP_CARDS",
        promptId: restored!.state.pendingPrompt!.promptId,
        keptCardInstanceId: "",
        orderedInstanceIds: ["invalid"],
        destination: "top",
      }
    );
    expect(rejected.kind).toBe("reject");
    expect(rejected.state).toBe(restored!.state);
    const arranged = [trash[1], trash[2], trash[0]];
    const resumed = resumePromptLifecycle(
      restored!.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: arranged.map((card) => card.instanceId),
        destination: "top",
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(resumed.responseRejected).toBe(false);
    expect(resumed.state.pendingPrompt).toBeNull();
    expect(resumed.state.effectStack).toHaveLength(0);
    expect(
      findCardInstance(resumed.state, protectedTarget.instanceId)?.zone
    ).toBe("CHARACTER");
    expect(resumed.state.players[1].trash).toHaveLength(0);
    expect(resumed.state.players[1].deck).toHaveLength(deckBefore + 3);
    expect(
      resumed.state.players[1].deck.slice(-3).map((card) => card.cardId)
    ).toEqual(arranged.map((card) => card.cardId));
    expect(resumed.state.players[0].hand).toHaveLength(handBefore + 2);
    expect(
      resumed.state.eventLog
        .filter(
          (e) => e.type === "CARD_DRAWN" || e.type === "CARD_RETURNED_TO_DECK"
        )
        .map((e) => e.type)
    ).toEqual([
      "CARD_DRAWN",
      "CARD_RETURNED_TO_DECK",
      "CARD_RETURNED_TO_DECK",
      "CARD_RETURNED_TO_DECK",
      "CARD_DRAWN",
    ]);
    expect(
      resumed.state.eventLog.some(
        (event) =>
          event.type === "CARD_KO" &&
          event.payload.cardInstanceId === protectedTarget.instanceId
      )
    ).toBe(false);
  });
});

it("publishes the outer prefix before an optional replacement that completes without a child prompt", () => {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const target = state.players[1].characters.find((c) => c !== null)!;
  state.players[1].characters = padChars([target]);
  state.activeEffects = [
    {
      id: "optional-replacement",
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: "optional-replacement",
      category: "replacement",
      modifiers: [
        {
          type: "REPLACEMENT_EFFECT",
          params: {
            trigger: "WOULD_BE_KO",
            cause_filter: { by: "ANY" },
            target_filter: null,
            replacement_actions: [{ type: "DRAW", params: { amount: 1 } }],
            optional: true,
            once_per_turn: false,
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [target.instanceId],
      timestamp: 1,
    },
  ];
  const first = resolveEffect(
    state,
    {
      id: "outer",
      category: "auto",
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
        { type: "DRAW", params: { amount: 1 } },
      ],
    },
    state.players[0].leader.instanceId,
    0,
    cardDb
  );
  expect(first.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const resumed = resumePromptLifecycle(
    { ...first.state, pendingPrompt: first.pendingPrompt! },
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb,
    { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
  );
  expect(resumed.state.pendingPrompt).toBeNull();
  expect(resumed.state.effectStack).toEqual([]);
  expect(
    resumed.state.eventLog
      .filter((e) => e.type === "CARD_DRAWN")
      .map((e) => e.playerIndex)
  ).toEqual([0, 1, 0]);
});
