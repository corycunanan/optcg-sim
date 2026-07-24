/**
 * GET /api/cron/game-finalization-repair — Abandon stale active games in a
 * bounded batch so exhausted worker and browser callbacks cannot strand their
 * lobbies in IN_GAME permanently.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { finalizeGameResult, notifyRestoredLobby } from "@/lib/game/finalize";
import { notifyGame } from "@/lib/realtime/fanout-game";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_GAME_HOURS = 24;
const STALE_GAME_BATCH_SIZE = 100;
const STALE_GAME_REASON =
  "Game abandoned after exceeding the 24-hour session limit";

type RepairMetrics = {
  success: boolean;
  cutoff: string;
  selected: number;
  finalized: number;
  alreadyFinal: number;
  errors: number;
  durationMs: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  const startedAt = Date.now();
  const cutoffDate = new Date(startedAt - STALE_GAME_HOURS * 60 * 60 * 1000);
  const cutoff = cutoffDate.toISOString();
  let selected = 0;
  let finalized = 0;
  let alreadyFinal = 0;
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
      try {
        const result = await finalizeGameResult({
          gameId: candidate.id,
          status: "ABANDONED",
          winnerId: null,
          winReason: STALE_GAME_REASON,
          reasonCode: "DISCONNECT_TIMEOUT",
        });

        if (result.finalized) {
          finalized += 1;
          await Promise.allSettled([
            notifyGame(candidate.id, {
              status: "ABANDONED",
              winnerId: null,
              winReason: STALE_GAME_REASON,
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

    const metrics: RepairMetrics = {
      success: errors === 0,
      cutoff,
      selected,
      finalized,
      alreadyFinal,
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
