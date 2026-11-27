import type { Prisma } from "@prisma/client";
import { inferLegacyGameEndReasonCode } from "@shared/game-end-reason";
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

/** Legacy text inference, used only when a caller sends no structured code (OPT-978). */
export function inferGameEndReasonCode(
  winReason: string | null | undefined,
  status: "FINISHED" | "ABANDONED"
): GameEndReasonCode {
  return inferLegacyGameEndReasonCode(winReason, status);
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
    const restored = await restoreLobbyAfterGame(tx, game.lobbyId);

    return {
      finalized: true,
      alreadyFinal: false,
      restoredLobbyId: restored ? game.lobbyId : null,
    };
  });
}

/**
 * Return an IN_GAME lobby to its pre-game state once its match is over.
 *
 * A seated guest keeps the room READY: PVP `READY` is the "guest seated"
 * state that leave, join-switch and start all lock on, and Solitaire rooms
 * are always READY. Restoring a seated room to WAITING stranded the guest —
 * leave answered 403 and a rematch start answered 409. Only an empty seat
 * returns the room to WAITING. Readiness resets either way.
 */
export async function restoreLobbyAfterGame(
  tx: Prisma.TransactionClient,
  lobbyId: string
): Promise<boolean> {
  const seated = await tx.lobby.updateMany({
    where: { id: lobbyId, status: "IN_GAME", guest: { isNot: null } },
    data: {
      status: "READY",
      hostReady: false,
      revision: { increment: 1 },
    },
  });

  if (seated.count === 1) {
    await tx.lobbyGuest.updateMany({
      where: { lobbyId },
      data: { guestReady: false },
    });
    return true;
  }

  const empty = await tx.lobby.updateMany({
    where: { id: lobbyId, status: "IN_GAME" },
    data: {
      status: "WAITING",
      hostReady: false,
      revision: { increment: 1 },
    },
  });
  return empty.count === 1;
}

export async function notifyRestoredLobby(lobbyId: string): Promise<void> {
  const state = await buildLobbyRoomState(lobbyId);
  if (state) await notifyLobby(state);
}
