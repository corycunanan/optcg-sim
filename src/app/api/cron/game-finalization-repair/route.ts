/**
 * GET /api/cron/game-finalization-repair — Abandon stale active games in a
 * bounded batch so exhausted worker and browser callbacks cannot strand their
 * lobbies in IN_GAME permanently, then restore stranded rooms that no game
 * can unstick (IN_GAME with no live game, PVP WAITING with a seated guest).
 */

import { isAuthorizedBearer } from "@shared/bearer-auth";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { finalizeGameResult, notifyRestoredLobby } from "@/lib/game/finalize";
import { probeWorkerStatus } from "@/lib/game-worker/probe-status";
import { notifyGame } from "@/lib/realtime/fanout-game";
import { repairStrandedLobby } from "@/lib/lobbies/repair-stranded";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_GAME_HOURS = 24;
const STALE_GAME_BATCH_SIZE = 20;
const STRANDED_LOBBY_BATCH_SIZE = 50;
const STALE_GAME_REASON =
  "Game worker session absent after the 24-hour recovery threshold";

type RepairMetrics = {
  success: boolean;
  cutoff: string;
  selected: number;
  finalized: number;
  alreadyFinal: number;
  skippedLive: number;
  skippedUnreachable: number;
  restoredLobbies: number;
  errors: number;
  durationMs: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization");
  if (!isAuthorizedBearer(authorization, cronSecret)) {
    return apiError("Unauthorized", 401);
  }

  const startedAt = Date.now();
  const cutoffDate = new Date(startedAt - STALE_GAME_HOURS * 60 * 60 * 1000);
  const cutoff = cutoffDate.toISOString();
  let selected = 0;
  let finalized = 0;
  let alreadyFinal = 0;
  let skippedLive = 0;
  let skippedUnreachable = 0;
  let restoredLobbies = 0;
  let errors = 0;

  try {
    const candidates = await prisma.gameSession.findMany({
      where: {
        status: "IN_PROGRESS",
        startedAt: { lt: cutoffDate },
        lobby: { status: "IN_GAME" },
      },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      take: STALE_GAME_BATCH_SIZE,
      select: { id: true },
    });
    selected = candidates.length;

    for (const candidate of candidates) {
      const worker = await probeWorkerStatus(candidate.id);
      if (worker.kind === "LIVE") {
        skippedLive += 1;
        continue;
      }
      if (worker.kind === "UNREACHABLE") {
        skippedUnreachable += 1;
        console.warn(
          JSON.stringify({
            event: "game_finalization_repair_worker_unreachable",
            gameId: candidate.id,
            reason: worker.reason,
          })
        );
        continue;
      }

      try {
        const terminal =
          worker.kind === "TERMINAL"
            ? worker
            : {
                status: "ABANDONED" as const,
                winnerId: null,
                winReason: STALE_GAME_REASON,
              };
        const result = await finalizeGameResult({
          gameId: candidate.id,
          status: terminal.status,
          winnerId: terminal.winnerId,
          winReason: terminal.winReason,
        });

        if (result.finalized) {
          finalized += 1;
          await Promise.allSettled([
            notifyGame(candidate.id, {
              status: terminal.status,
              winnerId: terminal.winnerId,
              winReason: terminal.winReason,
            }),
            result.restoredLobbyId
              ? notifyRestoredLobby(result.restoredLobbyId)
              : Promise.resolve(),
          ]);
        } else {
          alreadyFinal += 1;
        }
      } catch (error) {
        errors += 1;
        console.error(
          JSON.stringify({
            event: "game_finalization_repair_candidate_failed",
            gameId: candidate.id,
            error: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }

    // Rooms the game pass cannot reach: their latest game is already
    // terminal (or gone), or an older restore left a seated guest in WAITING.
    const stranded = await prisma.lobby.findMany({
      where: {
        OR: [
          {
            status: "IN_GAME",
            gameSessions: { none: { status: "IN_PROGRESS" } },
          },
          { status: "WAITING", mode: "PVP", guest: { isNot: null } },
        ],
      },
      orderBy: { id: "asc" },
      take: STRANDED_LOBBY_BATCH_SIZE,
      select: { id: true },
    });
    for (const lobby of stranded) {
      if (await repairStrandedLobby(lobby.id)) restoredLobbies += 1;
    }

    const metrics: RepairMetrics = {
      success: errors === 0,
      cutoff,
      selected,
      finalized,
      alreadyFinal,
      skippedLive,
      skippedUnreachable,
      restoredLobbies,
      errors,
      durationMs: Date.now() - startedAt,
    };
    console.info(
      JSON.stringify({ event: "game_finalization_repair", ...metrics })
    );
    return NextResponse.json(metrics, { status: errors === 0 ? 200 : 500 });
  } catch (error) {
    const metrics: RepairMetrics = {
      success: false,
      cutoff,
      selected,
      finalized,
      alreadyFinal,
      skippedLive,
      skippedUnreachable,
      restoredLobbies,
      errors: errors + 1,
      durationMs: Date.now() - startedAt,
    };
    console.error(
      JSON.stringify({
        event: "game_finalization_repair_failed",
        ...metrics,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return NextResponse.json(metrics, { status: 500 });
  }
}
