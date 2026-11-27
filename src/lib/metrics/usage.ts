import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * Product usage counters (OPT-1063), read straight from `game_sessions`.
 *
 * Every started game already writes a `GameSession` row (lobby start route),
 * and the worker's end-of-game callback stamps `status`, `reasonCode` and
 * `endedAt` (`finalizeGameResult`). The counters are aggregates over those
 * rows, so they need no extra writes on the game path and no new table.
 *
 * Days are UTC calendar days. "Active players" counts distinct user ids that
 * sat in a game started that day; a solo or vs-computer game counts its host
 * once.
 */

export const USAGE_WINDOW_DAYS = 30;

export type DailyUsage = {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  started: number;
  finished: number;
  abandoned: number;
  activePlayers: number;
};

export type UsageSummary = {
  windowDays: number;
  /** First UTC day included, `YYYY-MM-DD`. */
  since: string;
  /** Oldest first; days with no games are included as zeros. */
  days: DailyUsage[];
  totals: {
    started: number;
    finished: number;
    abandoned: number;
    inProgress: number;
    /** Distinct players across the whole window, not the sum of daily counts. */
    activePlayers: number;
  };
  /** Ended games in the window by end reason, most frequent first. */
  endReasons: { reasonCode: string; count: number }[];
  /** Started games in the window by lobby mode, most frequent first. */
  modes: { mode: string; count: number }[];
};

type UsageDb = Pick<PrismaClient, "$queryRaw">;

type DailyRow = {
  day: Date;
  started: bigint;
  finished: bigint;
  abandoned: bigint;
};
type DailyPlayersRow = { day: Date; players: bigint };
type CountRow = { key: string | null; count: bigint };
type TotalRow = {
  started: bigint;
  finished: bigint;
  abandoned: bigint;
  in_progress: bigint;
  players: bigint;
};

function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Start of the first UTC day in a window that ends with `now`'s UTC day. */
export function usageWindowStart(now: Date, windowDays: number): Date {
  const start = utcDayStart(now);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return start;
}

export async function getUsageSummary(
  options: { now?: Date; windowDays?: number; db?: UsageDb } = {}
): Promise<UsageSummary> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? USAGE_WINDOW_DAYS;
  const db = options.db ?? defaultPrisma;
  const since = usageWindowStart(now, windowDays);

  const [daily, dailyPlayers, totals, endReasons, modes] = await Promise.all([
    db.$queryRaw<DailyRow[]>`
      SELECT date_trunc('day', "startedAt") AS day,
             COUNT(*) AS started,
             COUNT(*) FILTER (WHERE "status" = 'FINISHED') AS finished,
             COUNT(*) FILTER (WHERE "status" = 'ABANDONED') AS abandoned
      FROM "game_sessions"
      WHERE "startedAt" >= ${since}
      GROUP BY 1`,
    db.$queryRaw<DailyPlayersRow[]>`
      SELECT day, COUNT(DISTINCT player_id) AS players
      FROM (
        SELECT date_trunc('day', "startedAt") AS day, "player1Id" AS player_id
        FROM "game_sessions" WHERE "startedAt" >= ${since}
        UNION ALL
        SELECT date_trunc('day', "startedAt") AS day, "player2Id" AS player_id
        FROM "game_sessions" WHERE "startedAt" >= ${since}
      ) seats
      GROUP BY day`,
    db.$queryRaw<TotalRow[]>`
      SELECT COUNT(*) AS started,
             COUNT(*) FILTER (WHERE "status" = 'FINISHED') AS finished,
             COUNT(*) FILTER (WHERE "status" = 'ABANDONED') AS abandoned,
             COUNT(*) FILTER (WHERE "status" = 'IN_PROGRESS') AS in_progress,
             (
               SELECT COUNT(DISTINCT player_id) FROM (
                 SELECT "player1Id" AS player_id FROM "game_sessions"
                 WHERE "startedAt" >= ${since}
                 UNION
                 SELECT "player2Id" AS player_id FROM "game_sessions"
                 WHERE "startedAt" >= ${since}
               ) seats
             ) AS players
      FROM "game_sessions"
      WHERE "startedAt" >= ${since}`,
    db.$queryRaw<CountRow[]>`
      SELECT COALESCE("reasonCode"::text, 'UNRECORDED') AS key, COUNT(*) AS count
      FROM "game_sessions"
      WHERE "startedAt" >= ${since} AND "status" <> 'IN_PROGRESS'
      GROUP BY 1
      ORDER BY count DESC, key ASC`,
    db.$queryRaw<CountRow[]>`
      SELECT "mode"::text AS key, COUNT(*) AS count
      FROM "game_sessions"
      WHERE "startedAt" >= ${since}
      GROUP BY 1
      ORDER BY count DESC, key ASC`,
  ]);

  const dailyByKey = new Map(daily.map((row) => [dayKey(row.day), row]));
  const playersByKey = new Map(
    dailyPlayers.map((row) => [dayKey(row.day), Number(row.players)])
  );

  const days: DailyUsage[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = new Date(since);
    day.setUTCDate(since.getUTCDate() + offset);
    const key = dayKey(day);
    const row = dailyByKey.get(key);
    days.push({
      day: key,
      started: Number(row?.started ?? 0),
      finished: Number(row?.finished ?? 0),
      abandoned: Number(row?.abandoned ?? 0),
      activePlayers: playersByKey.get(key) ?? 0,
    });
  }

  const total = totals[0];
  return {
    windowDays,
    since: dayKey(since),
    days,
    totals: {
      started: Number(total?.started ?? 0),
      finished: Number(total?.finished ?? 0),
      abandoned: Number(total?.abandoned ?? 0),
      inProgress: Number(total?.in_progress ?? 0),
      activePlayers: Number(total?.players ?? 0),
    },
    endReasons: endReasons.map((row) => ({
      reasonCode: row.key ?? "UNRECORDED",
      count: Number(row.count),
    })),
    modes: modes.map((row) => ({
      mode: row.key ?? "UNKNOWN",
      count: Number(row.count),
    })),
  };
}
