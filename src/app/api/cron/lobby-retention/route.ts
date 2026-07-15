/**
 * GET /api/cron/lobby-retention — Delete expired CLOSED lobbies in a bounded batch.
 * Vercel invokes this route daily with CRON_SECRET in the Authorization header.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOBBY_RETENTION_DAYS = 30;
const LOBBY_RETENTION_BATCH_SIZE = 500;

type RetentionMetrics = {
  success: boolean;
  dryRun: boolean;
  cutoff: string;
  eligible: number;
  selected: number;
  deleted: number;
  errors: number;
  durationMs: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  const dryRunParam = request.nextUrl.searchParams.get("dryRun");
  if (
    dryRunParam !== null &&
    dryRunParam !== "true" &&
    dryRunParam !== "false"
  ) {
    return apiError("dryRun must be true or false", 400);
  }

  const startedAt = Date.now();
  const dryRun = dryRunParam === "true";
  const cutoffDate = new Date(
    startedAt - LOBBY_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const cutoff = cutoffDate.toISOString();
  const eligibleWhere = {
    status: "CLOSED" as const,
    updatedAt: { lt: cutoffDate },
    gameSession: { is: null },
  };

  let eligible = 0;
  let selected = 0;

  try {
    eligible = await prisma.lobby.count({ where: eligibleWhere });

    if (dryRun) {
      const metrics: RetentionMetrics = {
        success: true,
        dryRun: true,
        cutoff,
        eligible,
        selected: 0,
        deleted: 0,
        errors: 0,
        durationMs: Date.now() - startedAt,
      };
      console.info(
        JSON.stringify({ event: "lobby_retention_sweep", ...metrics })
      );
      return NextResponse.json(metrics);
    }

    const candidates = await prisma.lobby.findMany({
      where: eligibleWhere,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: LOBBY_RETENTION_BATCH_SIZE,
      select: { id: true },
    });
    const candidateIds = candidates.map(({ id }) => id);
    selected = candidateIds.length;

    const deleted = selected
      ? (
          await prisma.lobby.deleteMany({
            where: {
              id: { in: candidateIds },
              ...eligibleWhere,
            },
          })
        ).count
      : 0;

    const metrics: RetentionMetrics = {
      success: true,
      dryRun: false,
      cutoff,
      eligible,
      selected,
      deleted,
      errors: 0,
      durationMs: Date.now() - startedAt,
    };
    console.info(
      JSON.stringify({ event: "lobby_retention_sweep", ...metrics })
    );
    return NextResponse.json(metrics);
  } catch (error) {
    const metrics: RetentionMetrics = {
      success: false,
      dryRun,
      cutoff,
      eligible,
      selected,
      deleted: 0,
      errors: 1,
      durationMs: Date.now() - startedAt,
    };
    console.error(
      JSON.stringify({
        event: "lobby_retention_sweep_failed",
        ...metrics,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return NextResponse.json(metrics, { status: 500 });
  }
}
