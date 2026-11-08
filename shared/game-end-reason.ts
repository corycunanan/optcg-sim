import type { GameEndReasonCode } from "./game-types.js";

/**
 * Legacy end-reason inference for states and callbacks written before the
 * terminal writer stored `endReasonCode` (OPT-978). New results carry the
 * structured code; this reader only keeps older saves and payloads readable.
 * The worker callback and the Next.js finalizer share it so they agree.
 */
export function inferLegacyGameEndReasonCode(
  winReason: string | null | undefined,
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED",
  engineOutcomeType?: string | null,
): GameEndReasonCode {
  if (status === "ABANDONED") return "DISCONNECT_TIMEOUT";
  if (engineOutcomeType === "ENGINE_LIMIT") return "ENGINE_LIMIT";
  if (engineOutcomeType === "ENGINE_ERROR_DRAW") return "ENGINE_CONTRACT";

  const reason = (winReason ?? "").toLowerCase();
  if (reason.includes("conceded")) return "CONCEDE";
  if (reason.includes("left during pre-game")) return "PREGAME_LEAVE";
  if (reason.includes("failed to rejoin")) return "DISCONNECT_TIMEOUT";
  if (reason.includes("won by a card effect")) return "CARD_EFFECT_WIN";
  if (reason.includes("engine resolution limit")) return "ENGINE_LIMIT";
  if (reason.includes("engine contract failure")) return "ENGINE_CONTRACT";
  if (reason.endsWith("— draw")) return "JOINT_DRAW";
  if (reason.includes("wins instead of losing")) return "DECK_OUT_WIN_INSTEAD";
  if (reason.includes("deck")) return "DECK_OUT";
  if (reason.includes("life") || reason.includes("ko")) return "LIFE_LOSS";
  return "UNKNOWN";
}
