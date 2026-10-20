/**
 * The one terminal writer (OPT-949 / OPT-925, Game Engine Consolidation Phase 0).
 *
 * Every path that ends a game calls `terminateGame`. It writes `status`,
 * `winner`, `winReason` and (for engine outcomes) `engineOutcome` once,
 * clears every live continuation, and logs exactly one `GAME_OVER` event.
 * The first terminal outcome stands: a later call on a finished game is a
 * no-op, so no later instruction can overwrite or reopen the result.
 *
 * Rule processing (rule 9-2-1, both players evaluated at one checkpoint) lives
 * in `defeat.ts` `runRuleProcessing`, which calls this writer with the joint
 * result. Only the persisted fields that the PR 1 reader already accepts are
 * written: the outcome kind is an input, not a stored field.
 */

import type { EngineLimitDiagnostic, GameState, PendingEvent } from "../types.js";
import { emitEvent, emitPendingEvent } from "./events.js";

type EngineLimitKind = Extract<
  EngineLimitDiagnostic,
  { kind: "EFFECT_STACK_DEPTH" | "ACTION_BUDGET" }
>;
type EngineContractKind = Extract<EngineLimitDiagnostic, { kind: "ENGINE_CONTRACT" }>;

export type TerminalOutcome =
  /** Rule processing found defeat conditions (rule 9-2-1); `winner` null is a joint draw. */
  | { kind: "RULES"; winner: 0 | 1 | null; reason: string }
  /** WIN_GAME card effect: the effect's controller wins (card text over rules, rule 1-3-1). */
  | { kind: "WIN_GAME"; winner: 0 | 1 }
  | { kind: "CONCESSION"; concedingPlayer: 0 | 1 }
  /** A session-level end: rejoin timeout, pre-game leave. */
  | {
      kind: "ABANDONMENT";
      status: "FINISHED" | "ABANDONED";
      winner: 0 | 1 | null;
      reason: string;
      clearPregame?: boolean;
    }
  /** A result already decided outside the worker (Next.js notify-end). */
  | { kind: "EXTERNAL_RESULT"; winner: 0 | 1; reason: string }
  /** A bounded engine guard stopped resolution; not a rules draw (Decision 5). */
  | { kind: "ENGINE_LIMIT"; diagnostic: EngineLimitKind }
  | { kind: "ENGINE_CONTRACT"; diagnostic: EngineContractKind };

export const ENGINE_LIMIT_REASON =
  "Engine resolution limit reached — the game ended with no winner";
export const ENGINE_CONTRACT_REASON = "Engine contract failure — game ends in a draw";

export function winGameReason(winner: 0 | 1): string {
  return `Player ${winner + 1} won by a card effect`;
}

export function concessionReason(concedingPlayer: 0 | 1): string {
  return `Player ${concedingPlayer + 1} conceded`;
}

/** True once any terminal outcome has been written. */
export function isGameTerminated(state: GameState): boolean {
  return state.status !== "IN_PROGRESS";
}

function describe(outcome: TerminalOutcome): {
  status: "FINISHED" | "ABANDONED";
  winner: 0 | 1 | null;
  reason: string;
  engineOutcome: GameState["engineOutcome"];
  diagnostic?: EngineLimitDiagnostic;
} {
  switch (outcome.kind) {
    case "RULES":
      return { status: "FINISHED", winner: outcome.winner, reason: outcome.reason, engineOutcome: null };
    case "WIN_GAME":
      return { status: "FINISHED", winner: outcome.winner, reason: winGameReason(outcome.winner), engineOutcome: null };
    case "CONCESSION":
      return {
        status: "FINISHED",
        winner: outcome.concedingPlayer === 0 ? 1 : 0,
        reason: concessionReason(outcome.concedingPlayer),
        engineOutcome: null,
      };
    case "ABANDONMENT":
      return { status: outcome.status, winner: outcome.winner, reason: outcome.reason, engineOutcome: null };
    case "EXTERNAL_RESULT":
      return { status: "FINISHED", winner: outcome.winner, reason: outcome.reason, engineOutcome: null };
    case "ENGINE_LIMIT":
      return {
        status: "FINISHED",
        winner: null,
        reason: ENGINE_LIMIT_REASON,
        engineOutcome: { type: "ENGINE_LIMIT", diagnostic: outcome.diagnostic },
        diagnostic: outcome.diagnostic,
      };
    case "ENGINE_CONTRACT":
      return {
        status: "FINISHED",
        winner: null,
        reason: ENGINE_CONTRACT_REASON,
        engineOutcome: { type: "ENGINE_ERROR_DRAW", diagnostic: outcome.diagnostic },
        diagnostic: outcome.diagnostic,
      };
  }
}

/**
 * Write a terminal outcome once. Clears the prompt, the effect stack (which
 * since OPT-963 holds every damage and replacement continuation), the
 * event-activation barrier and the battle, so no continuation can run
 * afterwards (live, after a stale reply, or after a reload).
 */
export function terminateGame(
  state: GameState,
  outcome: TerminalOutcome,
  actorIndex: 0 | 1 = state.turn.activePlayerIndex,
): GameState {
  if (isGameTerminated(state)) return state;
  const { status, winner, reason, engineOutcome, diagnostic } = describe(outcome);
  const { pendingEventActivationEvents: _legacyDebt, ...withoutLegacyDebt } =
    state;
  const terminal: GameState = {
    ...withoutLegacyDebt,
    status,
    winner,
    winReason: reason,
    ...(engineOutcome ? { engineOutcome } : {}),
    pendingPrompt: null,
    effectStack: [],
    ...(outcome.kind === "ABANDONMENT" && outcome.clearPregame
      ? { pregame: null }
      : {}),
    turn: {
      ...state.turn,
      battle: null,
      battleSubPhase: null,
    },
  };
  return emitEvent(terminal, "GAME_OVER", actorIndex, {
    winner,
    reason,
    ...(diagnostic ? { diagnostic } : {}),
  });
}

/**
 * Publish events that happened before the terminal checkpoint but were still
 * held by the resolver (it publishes at pipeline boundaries) when a
 * mid-resolution checkpoint ended the game. They go into the log before the
 * one `GAME_OVER`, which is re-stamped last, so clients keep the full history
 * in order. Events already logged are skipped.
 */
export function publishBeforeGameOver(
  state: GameState,
  events: readonly PendingEvent[],
  defaultPlayerIndex: 0 | 1,
): GameState {
  const pending = events.filter((event) => !event.propagation?.eventLogEmitted);
  if (pending.length === 0) return state;
  let gameOverIndex = -1;
  for (let i = state.eventLog.length - 1; i >= 0; i--) {
    if (state.eventLog[i].type === "GAME_OVER") {
      gameOverIndex = i;
      break;
    }
  }
  let next = state;
  const gameOver = gameOverIndex >= 0 ? state.eventLog[gameOverIndex] : null;
  if (gameOver) {
    next = {
      ...next,
      eventLog: [...next.eventLog.slice(0, gameOverIndex), ...next.eventLog.slice(gameOverIndex + 1)],
    };
  }
  for (const event of pending) next = emitPendingEvent(next, event, defaultPlayerIndex);
  if (gameOver && gameOver.type === "GAME_OVER") {
    next = emitEvent(next, "GAME_OVER", gameOver.playerIndex, gameOver.payload);
  }
  return next;
}
