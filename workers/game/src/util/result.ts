import { inferLegacyGameEndReasonCode } from "../../../../shared/game-end-reason.js";
import type { GameEndReasonCode, GameState } from "../types.js";

export type GameResultCallbackPayload = {
  gameId: string;
  status: GameState["status"];
  winnerId: string | null;
  winReason: string | null;
  reasonCode: GameEndReasonCode;
};

/**
 * OPT-978: the terminal writer stores the structured code; the text reader
 * covers only saves that ended before it did.
 */
export function resolveGameEndReasonCode(state: GameState): GameEndReasonCode {
  return state.endReasonCode ??
    inferLegacyGameEndReasonCode(state.winReason, state.status, state.engineOutcome?.type);
}

export function buildGameResultCallbackPayload(state: GameState): GameResultCallbackPayload {
  return {
    gameId: state.id,
    status: state.status,
    winnerId: state.winner !== null
      ? state.players[state.winner].playerId
      : null,
    winReason: state.winReason,
    reasonCode: resolveGameEndReasonCode(state),
  };
}
