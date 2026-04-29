import type { GameState } from "../types.js";

export type GameResultCallbackPayload = {
  gameId: string;
  status: GameState["status"];
  winnerId: string | null;
  winReason: string | null;
  reasonCode: "LEADER_KO" | "DECK_OUT" | "LIFE_LOSS" | "CONCEDE" | "DISCONNECT_TIMEOUT" | "FALLBACK_CONCEDE" | "UNKNOWN";
};

function inferReasonCode(state: GameState): GameResultCallbackPayload["reasonCode"] {
  if (state.status === "ABANDONED") return "DISCONNECT_TIMEOUT";

  const reason = (state.winReason ?? "").toLowerCase();
  if (reason.includes("conceded")) return "CONCEDE";
  if (reason.includes("deck")) return "DECK_OUT";
  if (reason.includes("life") || reason.includes("ko")) return "LIFE_LOSS";
  return "UNKNOWN";
}

export function buildGameResultCallbackPayload(state: GameState): GameResultCallbackPayload {
  return {
    gameId: state.id,
    status: state.status,
    winnerId: state.winner !== null
      ? state.players[state.winner].playerId
      : null,
    winReason: state.winReason,
    reasonCode: inferReasonCode(state),
  };
}
