/**
 * On-read repair for party rooms whose stored lifecycle can no longer move.
 *
 * Two shapes strand players with no working control:
 *
 * - `IN_GAME` with no live match. The room disables every pre-game control
 *   while IN_GAME and only offers "Rejoin" for an IN_PROGRESS game, so a room
 *   whose latest game is terminal (or missing) — or whose game's Durable
 *   Object is gone — leaves both players with nothing to press, and Play
 *   navigation routes them straight back. The daily cron only reaches games
 *   older than 24 hours.
 * - PVP `WAITING` with a seated guest. Leave, join-switch and start all lock
 *   on PVP `READY` meaning "guest seated"; older post-game restores wrote
 *   WAITING, so the guest's leave answered 403 and the host's start 409.
 *
 * `GET /api/lobbies/[id]` runs this for a seated viewer whenever the snapshot
 * shows either shape, then rebuilds the snapshot.
 */

import { prisma } from "@/lib/db";
import {
  finalizeGameResult,
  notifyRestoredLobby,
  restoreLobbyAfterGame,
} from "@/lib/game/finalize";
import { probeWorkerStatus } from "@/lib/game-worker/probe-status";
import { notifyGame } from "@/lib/realtime/fanout-game";
import type { LobbyRoomState } from "./state";

/**
 * A game's Durable Object is initialized inside `POST /start` before the
 * route answers, so an IN_PROGRESS game older than this with no Durable
 * Object is a lost start, not one still initializing.
 */
export const STRANDED_GAME_GRACE_MS = 2 * 60 * 1000;
const STRANDED_GAME_PROBE_TIMEOUT_MS = 1_500;
const LOST_GAME_REASON = "Game server session was lost before the match ended";

type RepairableState = Pick<
  LobbyRoomState,
  "status" | "mode" | "guest" | "hostUserId" | "viewerRole" | "gameStatus"
>;

/** Cheap snapshot check: does this room need {@link repairStrandedLobby}? */
export function lobbyNeedsRepair(state: RepairableState): boolean {
  if (state.viewerRole !== "host" && state.viewerRole !== "guest") return false;
  if (state.status === "IN_GAME") return true;
  return (
    state.status === "WAITING" &&
    state.mode === "PVP" &&
    state.guest !== null &&
    state.guest.user.id !== state.hostUserId
  );
}

/**
 * Repair the room if it is stranded. Returns true when stored lobby state
 * changed, so the caller rebuilds its snapshot. Never throws.
 */
export async function repairStrandedLobby(lobbyId: string): Promise<boolean> {
  try {
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      select: {
        status: true,
        mode: true,
        hostUserId: true,
        guest: { select: { userId: true } },
        gameSessions: {
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true, status: true, startedAt: true },
        },
      },
    });
    if (!lobby) return false;

    if (
      lobby.status === "WAITING" &&
      lobby.mode === "PVP" &&
      lobby.guest &&
      lobby.guest.userId !== lobby.hostUserId
    ) {
      const seated = await prisma.lobby.updateMany({
        where: {
          id: lobbyId,
          status: "WAITING",
          mode: "PVP",
          guest: { is: { userId: lobby.guest.userId } },
        },
        data: { status: "READY", revision: { increment: 1 } },
      });
      if (seated.count !== 1) return false;
      logRepair(lobbyId, "seated_waiting_to_ready");
      await notifyRestoredLobby(lobbyId).catch(() => undefined);
      return true;
    }

    if (lobby.status !== "IN_GAME") return false;

    const game = lobby.gameSessions[0];
    if (!game || game.status !== "IN_PROGRESS") {
      // Start creates the game in the same transaction that sets IN_GAME, and
      // nothing but finalization leaves IN_GAME, so no start can race this.
      const restored = await prisma.$transaction((tx) =>
        restoreLobbyAfterGame(tx, lobbyId)
      );
      if (!restored) return false;
      logRepair(lobbyId, game ? "terminal_game" : "missing_game", game?.id);
      await notifyRestoredLobby(lobbyId).catch(() => undefined);
      return true;
    }

    if (Date.now() - game.startedAt.getTime() < STRANDED_GAME_GRACE_MS) {
      return false;
    }

    const worker = await probeWorkerStatus(
      game.id,
      STRANDED_GAME_PROBE_TIMEOUT_MS
    );
    if (worker.kind === "LIVE" || worker.kind === "UNREACHABLE") return false;

    const terminal =
      worker.kind === "TERMINAL"
        ? worker
        : {
            status: "ABANDONED" as const,
            winnerId: null,
            winReason: LOST_GAME_REASON,
          };
    const result = await finalizeGameResult({
      gameId: game.id,
      status: terminal.status,
      winnerId: terminal.winnerId,
      winReason: terminal.winReason,
      reasonCode: worker.kind === "ABSENT" ? "UNKNOWN" : null,
    });
    if (!result.finalized) return false;

    logRepair(
      lobbyId,
      worker.kind === "ABSENT" ? "absent_worker_session" : "worker_terminal",
      game.id
    );
    await Promise.allSettled([
      notifyGame(game.id, {
        status: terminal.status,
        winnerId: terminal.winnerId,
        winReason: terminal.winReason,
      }),
      result.restoredLobbyId
        ? notifyRestoredLobby(result.restoredLobbyId)
        : Promise.resolve(),
    ]);
    return true;
  } catch (error) {
    console.error("[lobbies:repair] failed", { lobbyId, error });
    return false;
  }
}

function logRepair(lobbyId: string, kind: string, gameId?: string) {
  console.warn(
    JSON.stringify({ event: "lobby_stranded_repaired", lobbyId, kind, gameId })
  );
}
