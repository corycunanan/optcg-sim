import { prisma } from "@/lib/db";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";
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
  restoredLobbyId: string | null;
};

export function inferGameEndReasonCode(
  winReason: string | null | undefined,
  status: "FINISHED" | "ABANDONED"
): GameEndReasonCode {
  if (status === "ABANDONED") return "DISCONNECT_TIMEOUT";

  const reason = (winReason ?? "").toLowerCase();
  if (reason.includes("conceded")) return "CONCEDE";
  if (reason.includes("deck")) return "DECK_OUT";
  if (reason.includes("life") || reason.includes("ko")) return "LIFE_LOSS";
  return "UNKNOWN";
}

export async function finalizeGameResult(
  input: FinalizeGameResultInput
): Promise<FinalizeGameResultResult> {
  const reasonCode =
    input.reasonCode ?? inferGameEndReasonCode(input.winReason, input.status);
  return prisma.$transaction(async (tx) => {
    const result = await tx.gameSession.updateMany({
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
      return {
        finalized: false,
        alreadyFinal: true,
        restoredLobbyId: null,
      };
    }

    const game = await tx.gameSession.findUniqueOrThrow({
      where: { id: input.gameId },
      select: { lobbyId: true },
    });
    const restoredLobby = await tx.lobby.updateMany({
      where: { id: game.lobbyId, status: "IN_GAME" },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });

    if (restoredLobby.count === 1) {
      await tx.lobbyGuest.updateMany({
        where: { lobbyId: game.lobbyId },
        data: { guestReady: false },
      });
    }

    return {
      finalized: true,
      alreadyFinal: false,
      restoredLobbyId: restoredLobby.count === 1 ? game.lobbyId : null,
    };
  });
}

export async function notifyRestoredLobby(lobbyId: string): Promise<void> {
  const state = await buildLobbyRoomState(lobbyId);
  if (state) await notifyLobby(state);
}
