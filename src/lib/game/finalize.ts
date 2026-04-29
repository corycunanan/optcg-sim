import { prisma } from "@/lib/db";
import type { GameEndReasonCode } from "@/lib/validators/game";

const TERMINAL_STATUSES = ["FINISHED", "ABANDONED"] as const;

export type FinalizeGameResultInput = {
  gameId: string;
  status: "FINISHED" | "ABANDONED";
  winnerId: string | null;
  winReason: string | null;
  reasonCode?: GameEndReasonCode | null;
};

export type FinalizeGameResultResult = {
  finalized: boolean;
  alreadyFinal: boolean;
};

export function inferGameEndReasonCode(
  winReason: string | null | undefined,
  status: "FINISHED" | "ABANDONED",
): GameEndReasonCode {
  if (status === "ABANDONED") return "DISCONNECT_TIMEOUT";

  const reason = (winReason ?? "").toLowerCase();
  if (reason.includes("conceded")) return "CONCEDE";
  if (reason.includes("deck")) return "DECK_OUT";
  if (reason.includes("life") || reason.includes("ko")) return "LIFE_LOSS";
  return "UNKNOWN";
}

export async function finalizeGameResult(
  input: FinalizeGameResultInput,
): Promise<FinalizeGameResultResult> {
  const reasonCode = input.reasonCode ?? inferGameEndReasonCode(input.winReason, input.status);
  const result = await prisma.gameSession.updateMany({
    where: {
      id: input.gameId,
      status: { notIn: [...TERMINAL_STATUSES] },
    },
    data: {
      status: input.status,
      winnerId: input.winnerId,
      winReason: input.winReason,
      reasonCode,
      endedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return { finalized: false, alreadyFinal: true };
  }

  return { finalized: true, alreadyFinal: false };
}
