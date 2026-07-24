/**
 * GET /api/cron/game-finalization-repair — Abandon stale active games in a
 * bounded batch so exhausted worker and browser callbacks cannot strand their
 * lobbies in IN_GAME permanently.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { finalizeGameResult, notifyRestoredLobby } from "@/lib/game/finalize";
import { gameWorkerFetch } from "@/lib/game-worker/client";
import { notifyGame } from "@/lib/realtime/fanout-game";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_GAME_HOURS = 24;
const STALE_GAME_BATCH_SIZE = 20;
const WORKER_STATUS_TIMEOUT_MS = 1_500;
const STALE_GAME_REASON =
  "Game worker session absent after the 24-hour recovery threshold";

type WorkerProbe =
  | { kind: "LIVE" }
  | { kind: "ABSENT" }
  | {
      kind: "TERMINAL";
      status: "FINISHED" | "ABANDONED";
      winnerId: string | null;
      winReason: string | null;
    }
  | { kind: "UNREACHABLE"; reason: string };

type RepairMetrics = {
  success: boolean;
  cutoff: string;
  selected: number;
  finalized: number;
  alreadyFinal: number;
  skippedLive: number;
  skippedUnreachable: number;
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
  let skippedLive = 0;
  let skippedUnreachable = 0;
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

    const metrics: RepairMetrics = {
      success: errors === 0,
      cutoff,
      selected,
      finalized,
      alreadyFinal,
      skippedLive,
      skippedUnreachable,
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

async function probeWorkerStatus(gameId: string): Promise<WorkerProbe> {
  let response: Response;
  try {
    response = await gameWorkerFetch(`/game/${gameId}/status`, {
      method: "GET",
      timeoutMs: WORKER_STATUS_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      kind: "UNREACHABLE",
      reason: error instanceof Error ? error.name : "transport_error",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }

  if (!isRecord(body) || typeof body.status !== "string") {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }
  if (response.status === 404 && body.status === "ABSENT") {
    return { kind: "ABSENT" };
  }
  if (!response.ok) {
    return { kind: "UNREACHABLE", reason: `http_${response.status}` };
  }
  if (body.status === "IN_PROGRESS") {
    return { kind: "LIVE" };
  }
  if (body.status !== "FINISHED" && body.status !== "ABANDONED") {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }

  const winnerId = body.winnerId;
  const winReason = body.winReason;
  if (
    (winnerId !== null && typeof winnerId !== "string") ||
    (winReason !== null && typeof winReason !== "string")
  ) {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }

  return {
    kind: "TERMINAL",
    status: body.status,
    winnerId,
    winReason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
