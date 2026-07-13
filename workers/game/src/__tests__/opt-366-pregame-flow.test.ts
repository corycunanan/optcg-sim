/**
 * OPT-366: pre-game flow — priority decision (2d6), first-or-second choice,
 * mulligan, life placement, and the dynamic-first-player turn rules.
 */

import { describe, expect, it } from "vitest";
import {
  advancePregame,
  resumePregameFromPrompt,
  startPregame,
} from "../engine/pregame.js";
import { prepareDecksAndLeaders } from "../engine/setup.js";
import { runPipeline } from "../engine/pipeline.js";
import { isStartOfTurnAutoPhase } from "../engine/phases.js";
import { createTestPayload, CARDS } from "./helpers.js";
import type { GameAction, GameState } from "../types.js";

function buildPregameState(testRolls: number[] | null = null): {
  state: GameState;
  cardDb: Map<string, import("../types.js").CardData>;
  testRolls: number[] | null;
} {
  const payload = createTestPayload();
  const { state: prepared, cardDb } = prepareDecksAndLeaders(payload);
  return { state: startPregame(prepared), cardDb, testRolls };
}

/** Drive the FSM until it pauses for a prompt or finishes. */
function drain(
  state: GameState,
  cardDb: Map<string, import("../types.js").CardData>,
  testRolls: number[] | null,
): { state: GameState; done: boolean } {
  return advancePregame(state, cardDb, testRolls);
}

function applyChoice(
  state: GameState,
  choiceId: string,
): { state: GameState } {
  const respondingPlayer = state.pendingPrompt!.respondingPlayer;
  const action: GameAction = { type: "PLAYER_CHOICE", choiceId };
  return { state: resumePregameFromPrompt(state, action, respondingPlayer) };
}

describe("OPT-366 pregame flow", () => {
  describe("priority roll", () => {
    it("rolls 2d6 deterministically when testPriorityRolls is provided", () => {
      const { state, cardDb } = buildPregameState();
      // p0 rolls 5, p1 rolls 3 → p0 wins
      const result = drain(state, cardDb, [5, 3]);
      expect(result.state.pregame?.phase).toBe("PRIORITY_CHOICE");
      expect(result.state.pregame?.priorityRolls).toEqual([5, 3]);
      expect(result.state.pregame?.priorityDeciderIndex).toBe(0);
      expect(result.state.pendingPrompt?.respondingPlayer).toBe(0);
    });

    it("re-rolls on tie until a winner is found", () => {
      const { state, cardDb } = buildPregameState();
      // First roll: 4 vs 4 (tie). Second roll: 6 vs 2 → p0 wins.
      const result = drain(state, cardDb, [4, 4, 6, 2]);
      expect(result.state.pregame?.priorityRolls).toEqual([6, 2]);
      expect(result.state.pregame?.priorityDeciderIndex).toBe(0);
    });

    it("emits PREGAME_PRIORITY_ROLLED to the event log", () => {
      const { state, cardDb } = buildPregameState();
      const result = drain(state, cardDb, [2, 5]);
      const event = result.state.eventLog.find((e) => e.type === "PREGAME_PRIORITY_ROLLED");
      expect(event).toBeDefined();
      if (event && event.type === "PREGAME_PRIORITY_ROLLED") {
        expect(event.payload.rolls).toEqual([2, 5]);
        expect(event.payload.priorityDeciderIndex).toBe(1);
      }
    });
  });

  describe("first-or-second choice", () => {
    it("winner picks first → activePlayerIndex stays as winner", () => {
      // p0 wins the roll, picks first
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      // After choice → MULLIGAN_DECISIONS for p0. Both keep.
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      expect(s.pregame).toBeNull();
      expect(s.turn.firstPlayerIndex).toBe(0);
      expect(s.turn.activePlayerIndex).toBe(0);
    });

    it("winner picks second → activePlayerIndex flips to loser", () => {
      // p0 wins the roll, picks SECOND → p1 goes first
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "SECOND").state;
      // After choice → MULLIGAN_DECISIONS for first player. Both keep.
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      expect(s.pregame).toBeNull();
      expect(s.turn.firstPlayerIndex).toBe(1);
      expect(s.turn.activePlayerIndex).toBe(1);
    });

    it("emits PREGAME_FIRST_PLAYER_DECIDED to the event log", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "SECOND").state;
      const event = s.eventLog.find((e) => e.type === "PREGAME_FIRST_PLAYER_DECIDED");
      expect(event).toBeDefined();
      if (event && event.type === "PREGAME_FIRST_PLAYER_DECIDED") {
        expect(event.payload.firstPlayerIndex).toBe(1);
      }
    });
  });

  describe("hand dealing ordering (§5-2-1-5-1 → §5-2-1-6)", () => {
    it("does not deal opening hand until START_OF_GAME_FX is past", () => {
      // After PRIORITY_CHOICE, hand is still empty. Hand is dealt during HAND_DEAL,
      // which fires only after every START_OF_GAME_FX action has resolved.
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      // Phase is PRIORITY_CHOICE — hands are empty.
      expect(s.players[0].hand).toHaveLength(0);
      expect(s.players[1].hand).toHaveLength(0);

      s = applyChoice(s, "FIRST").state;
      // With no authored start effect, the FSM passes through START_OF_GAME_FX
      // and HAND_DEAL in one tick before pausing on MULLIGAN_DECISIONS.
      s = drain(s, cardDb, []).state;
      expect(s.pregame?.phase).toBe("MULLIGAN_DECISIONS");
      expect(s.players[0].hand).toHaveLength(5);
      expect(s.players[1].hand).toHaveLength(5);
    });

    it("life cards are placed only after both mulligan decisions", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state; // → MULLIGAN_DECISIONS for p0
      // Life is empty until LIFE_PLACEMENT.
      expect(s.players[0].life).toHaveLength(0);
      expect(s.players[1].life).toHaveLength(0);

      s = applyChoice(s, "KEEP").state; // p0 keeps
      s = drain(s, cardDb, []).state;   // → MULLIGAN_DECISIONS for p1
      expect(s.players[0].life).toHaveLength(0);

      s = applyChoice(s, "KEEP").state; // p1 keeps
      s = drain(s, cardDb, []).state;   // → DONE
      expect(s.pregame).toBeNull();
      expect(s.players[0].life.length).toBeGreaterThan(0);
      expect(s.players[1].life.length).toBeGreaterThan(0);
    });
  });

  describe("mulligan", () => {
    it("redraws when player chooses REDRAW", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state; // MULLIGAN_DECISIONS
      const handBefore = s.players[0].hand.map((c) => c.instanceId);
      s = applyChoice(s, "REDRAW").state;
      const handAfter = s.players[0].hand.map((c) => c.instanceId);
      expect(handAfter).toHaveLength(5);
      // After redraw the hand instance ids should differ (high probability with
      // a non-trivial deck — testOrder makes the deck deterministic enough).
      expect(handAfter).not.toEqual(handBefore);
      const event = s.eventLog.find((e) => e.type === "MULLIGAN_DECISION");
      expect(event).toBeDefined();
      if (event && event.type === "MULLIGAN_DECISION") {
        expect(event.payload.redrew).toBe(true);
      }
    });

    it("first player decides before second player", () => {
      // Make p1 the first player
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [3, 5]).state;
      expect(s.pendingPrompt?.respondingPlayer).toBe(1);
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state;
      expect(s.pregame?.phase).toBe("MULLIGAN_DECISIONS");
      expect(s.pendingPrompt?.respondingPlayer).toBe(1); // first player decides first

      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      expect(s.pregame?.phase).toBe("MULLIGAN_DECISIONS");
      expect(s.pendingPrompt?.respondingPlayer).toBe(0); // then second
    });
  });

  describe("§6-3-1 first-turn skip-draw + §6-4-1 first-turn 1-DON!! anchor to first player", () => {
    it("when player 1 goes first, player 1 skips DRAW and places 1 DON on turn 1", () => {
      // p0 wins, picks SECOND → p1 is first
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "SECOND").state;
      s = drain(s, cardDb, []).state;
      // Both keep.
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      // FSM done — first player is 1.
      expect(s.turn.firstPlayerIndex).toBe(1);
      expect(s.turn.activePlayerIndex).toBe(1);

      // Drain start-of-turn auto phases (REFRESH → DRAW → DON → MAIN).
      let safety = 12;
      while (s.status === "IN_PROGRESS" && isStartOfTurnAutoPhase(s) && safety-- > 0) {
        const r = runPipeline(s, { type: "ADVANCE_PHASE" }, cardDb, s.turn.activePlayerIndex);
        if (!r.valid) break;
        s = r.state;
      }
      expect(s.turn.phase).toBe("MAIN");
      // §6-3-1: first player skips DRAW on turn 1 — p1 hand size unchanged.
      expect(s.players[1].hand.length).toBe(5);
      // §6-4-1: first player has only 1 DON in cost area on turn 1.
      expect(s.players[1].donCostArea.length).toBe(1);
    });

    it("when player 0 goes first, player 0 skips DRAW and places 1 DON on turn 1 (regression)", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      expect(s.turn.firstPlayerIndex).toBe(0);

      let safety = 12;
      while (s.status === "IN_PROGRESS" && isStartOfTurnAutoPhase(s) && safety-- > 0) {
        const r = runPipeline(s, { type: "ADVANCE_PHASE" }, cardDb, s.turn.activePlayerIndex);
        if (!r.valid) break;
        s = r.state;
      }
      expect(s.turn.phase).toBe("MAIN");
      expect(s.players[0].hand.length).toBe(5);
      expect(s.players[0].donCostArea.length).toBe(1);
    });
  });

  describe("concession during pre-game", () => {
    it("CONCEDE during PRIORITY_CHOICE ends the game with opponent as winner", () => {
      const { state, cardDb } = buildPregameState();
      const s = drain(state, cardDb, [5, 3]).state;
      expect(s.pregame?.phase).toBe("PRIORITY_CHOICE");
      expect(s.pendingPrompt?.respondingPlayer).toBe(0);

      // P0 (the priority decider) concedes.
      const result = runPipeline(s, { type: "CONCEDE" }, cardDb, 0);
      expect(result.valid).toBe(true);
      expect(result.state.status).toBe("FINISHED");
      expect(result.state.winner).toBe(1);
      expect(result.gameOver?.winner).toBe(1);
    });

    it("CONCEDE during MULLIGAN_DECISIONS ends the game with opponent as winner", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state;
      expect(s.pregame?.phase).toBe("MULLIGAN_DECISIONS");

      // The non-prompted player concedes.
      const result = runPipeline(s, { type: "CONCEDE" }, cardDb, 1);
      expect(result.valid).toBe(true);
      expect(result.state.status).toBe("FINISHED");
      expect(result.state.winner).toBe(0);
    });
  });

  describe("disconnect / reconnect", () => {
    it("pregame state survives a JSON round-trip (DO hibernation parity)", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state;
      // Phase is MULLIGAN_DECISIONS, prompt for p0.
      const serialized = JSON.stringify(s);
      const restored: GameState = JSON.parse(serialized);
      expect(restored.pregame?.phase).toBe("MULLIGAN_DECISIONS");
      expect(restored.pendingPrompt?.respondingPlayer).toBe(0);

      // After resume, the FSM advances correctly from the persisted phase.
      const next = applyChoice(restored, "KEEP").state;
      expect(next.pregame?.mulliganDecisions[0]).toBe(false);
      expect(next.pendingPrompt?.respondingPlayer).toBe(1);
    });
  });

  describe("event log narration", () => {
    it("logs all pregame events in order", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "KEEP").state;
      s = drain(s, cardDb, []).state;
      s = applyChoice(s, "REDRAW").state;
      s = drain(s, cardDb, []).state;

      const types = s.eventLog.map((e) => e.type);
      const priorityIdx = types.indexOf("PREGAME_PRIORITY_ROLLED");
      const firstPlayerIdx = types.indexOf("PREGAME_FIRST_PLAYER_DECIDED");
      const mulliganDecisions = types.filter((t) => t === "MULLIGAN_DECISION").length;

      expect(priorityIdx).toBeGreaterThanOrEqual(0);
      expect(firstPlayerIdx).toBeGreaterThan(priorityIdx);
      expect(mulliganDecisions).toBe(2);
    });
  });

  describe("testOrder + mulligan integration", () => {
    it("redraw reshuffles entire hand back into the deck", () => {
      const { state, cardDb } = buildPregameState();
      let s = drain(state, cardDb, [5, 3]).state;
      s = applyChoice(s, "FIRST").state;
      s = drain(s, cardDb, []).state;
      // Capture hand pre-mulligan (it should be the testOrder hand).
      const handBefore = s.players[0].hand.map((c) => c.cardId);
      expect(handBefore).toEqual([
        CARDS.VANILLA.id,
        CARDS.RUSH.id,
        CARDS.DOUBLE_ATK.id,
        CARDS.BLOCKER.id,
        CARDS.COUNTER.id,
      ]);
      const deckBefore = s.players[0].deck.length;

      s = applyChoice(s, "REDRAW").state;
      const handAfter = s.players[0].hand.map((c) => c.cardId);
      const deckAfter = s.players[0].deck.length;
      expect(handAfter).toHaveLength(5);
      expect(deckAfter).toBe(deckBefore); // 5 returned, 5 drawn — net 0
    });
  });
});
