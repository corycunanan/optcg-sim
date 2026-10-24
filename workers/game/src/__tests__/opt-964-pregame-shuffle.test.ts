import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GameAction, GameState } from "../types.js";
import {
  createDeterministicExecutionContext,
  shuffleWithEngineContext,
} from "../engine/execution-context.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { advancePregame, startPregame } from "../engine/pregame.js";
import { prepareDecksAndLeaders } from "../engine/setup.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { CARDS, createTestPayload } from "./helpers.js";

function pausedImu() {
  const payload = createTestPayload();
  const imu = {
    ...CARDS.LEADER,
    id: "OP13-079",
    name: "Imu",
    types: ["The Five Elders"],
    effectText:
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
  };
  const mary = {
    ...CARDS.STAGE,
    id: "OP05-097",
    name: "Mary Geoise",
    types: ["Mary Geoise"],
  };
  payload.player1.leader = { cardId: imu.id, quantity: 1, cardData: imu };
  payload.player1.deck = payload.player1.deck.map((entry) =>
    entry.cardId === CARDS.STAGE.id
      ? { cardId: mary.id, quantity: entry.quantity, cardData: mary }
      : entry
  );
  const prepared = prepareDecksAndLeaders(
    payload,
    createDeterministicExecutionContext("opt-964-pregame-shuffle")
  );
  const beforeSearch = startPregame(prepared.state, "HOST_FIRST");
  const paused = advancePregame(beforeSearch, prepared.cardDb, []).state;
  return { beforeSearch, paused, cardDb: prepared.cardDb, mary };
}

describe.each(["state", "undoHistory[0]"] as const)(
  "Imu shuffle after restoring %s",
  (location) => {
    it.each([true, false])(
      "shuffles exactly once and deals the same opening hands (play Stage: %s)",
      (playStage) => {
        const { beforeSearch, paused, cardDb, mary } = pausedImu();
        const corpusDir = process.env.OPT964_CORPUS_DIR;
        if (corpusDir && location === "state" && playStage) {
          mkdirSync(corpusDir, { recursive: true });
          writeFileSync(
            join(corpusDir, "pregame-search.json"),
            JSON.stringify(
              {
                state: toPersistedGameState(paused),
                undoHistory: [toPersistedGameState(paused)],
                cardDb: Object.fromEntries(cardDb),
              },
              null,
              2
            )
          );
        }
        const prompt = paused.pendingPrompt;
        if (prompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
          throw new Error("Expected authored Imu search prompt");
        }
        // The authored action itself carries the obligation across hibernation.
        // Neither entering the prompt nor pregame polling may shuffle early.
        const owner = paused.effectStack.find(
          (frame) => frame.id === prompt.resumeContext
        );
        expect(owner?.pausedAction).toMatchObject({
          type: "SEARCH_AND_PLAY",
          params: { search_full_deck: true, shuffle_after: true },
        });
        expect(paused.pregame?.startOfGameEffectsResolved[0]).toBe(true);
        expect(paused.executionContext.rngState).toBe(
          beforeSearch.executionContext.rngState
        );
        expect(paused.players[0].deck).toEqual(beforeSearch.players[0].deck);
        expect(advancePregame(paused, cardDb, []).state).toEqual(paused);

        const keptId = playStage
          ? prompt.options.cards[0].instanceId
          : undefined;
        const orderedIds = prompt.options.cards
          .map((card) => card.instanceId)
          .filter((id) => id !== keptId);
        const action: GameAction = {
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: keptId ?? "",
          orderedInstanceIds: orderedIds,
          destination: "bottom",
        };
        // Full-deck search shows only matching Stages. Unselected displayed
        // cards rejoin the unseen remainder before the one required shuffle.
        const displayed = new Set(
          prompt.options.cards.map((c) => c.instanceId)
        );
        const deckBeforeShuffle = [
          ...paused.players[0].deck.filter((c) => !displayed.has(c.instanceId)),
          ...orderedIds.map(
            (id) => paused.players[0].deck.find((c) => c.instanceId === id)!
          ),
        ];
        const expected = shuffleWithEngineContext(paused, deckBeforeShuffle);
        const expectedRng =
          (paused.executionContext.rngState +
            Math.imul(deckBeforeShuffle.length - 1, 0x6d2b79f5)) >>>
          0;
        expect(expected.state.executionContext.rngState).toBe(expectedRng);
        expect(expected.values).not.toEqual(deckBeforeShuffle);

        // JSON storage deliberately removes object identity and any hidden
        // metadata. Exercise the real writer/parser for both live and undo.
        const wire = JSON.parse(
          JSON.stringify({
            state: toPersistedGameState(
              location === "state" ? paused : beforeSearch
            ),
            undoHistory:
              location === "state" ? [] : [toPersistedGameState(paused)],
            cardDb: Object.fromEntries(cardDb),
          })
        );
        const session = parseStoredSession(wire);
        const restoredCardDb = new Map(Object.entries(session.cardDb));
        const restored =
          location === "state" ? session.state : session.undoHistory[0];
        const resume = (state: GameState) => {
          let beforeDeal: GameState | undefined;
          const result = resumePromptLifecycle(state, action, restoredCardDb, {
            drainPregame: (drained) => {
              // The session has drained the PREGAME boundary, but has not
              // dealt yet. Inspect that production service boundary directly.
              beforeDeal = drained;
              return advancePregame(drained, restoredCardDb, []).state;
            },
            advanceStartOfTurn: (current) => current,
          });
          expect(result.responseRejected).toBe(false);
          expect(beforeDeal).toBeDefined();
          expect(beforeDeal!.effectStack).toHaveLength(0);
          expect(beforeDeal!.players[0].hand).toHaveLength(0);
          expect(beforeDeal!.players[0].deck).toEqual(expected.values);
          expect(beforeDeal!.executionContext.rngState).toBe(expectedRng);
          expect(beforeDeal!.players[0].stage?.cardId ?? null).toBe(
            playStage ? mary.id : null
          );
          return { beforeDeal: beforeDeal!, state: result.state };
        };
        const uninterrupted = resume(paused);
        const reloaded = resume(restored);
        expect(reloaded).toEqual({ ...uninterrupted, beforeDeal: { ...uninterrupted.beforeDeal, schemaVersion: 8, costSemanticsVersion: 7 }, state: { ...uninterrupted.state, schemaVersion: 8, costSemanticsVersion: 7 } });
        const dealt = reloaded.state;
        expect(dealt.pregame?.phase).toBe("MULLIGAN_DECISIONS");
        expect(dealt.players[0].hand.map((c) => c.cardId)).toEqual(
          expected.values.slice(0, 5).map((c) => c.cardId)
        );
        expect(dealt.players[0].deck).toEqual(expected.values.slice(5));
        expect(dealt.players[1].hand).toHaveLength(5);
        expect(dealt.executionContext.rngState).toBe(expectedRng);
        // Polling after the effect drains cannot shuffle or deal a second time.
        expect(advancePregame(dealt, restoredCardDb, []).state).toEqual(dealt);
      }
    );
  }
);
