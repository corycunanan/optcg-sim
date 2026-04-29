import type { GameState } from "../types.js";

export type GameResultCallbackPayload = {
  gameId: string;
  status: GameState["status"];
  winnerId: string | null;
  winReason: string | null;
};

export function buildGameResultCallbackPayload(state: GameState): GameResultCallbackPayload {
  return {
    gameId: state.id,
    status: state.status,
    winnerId: state.winner !== null
      ? state.players[state.winner].playerId
      : null,
    winReason: state.winReason,
  };
}
