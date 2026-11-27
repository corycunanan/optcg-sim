import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestPrisma,
  describeWithDatabase,
} from "@/test/database/harness";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { getUsageSummary, usageWindowStart } = await import("./usage");

describe("usageWindowStart", () => {
  it("starts the window at UTC midnight, windowDays - 1 days back", () => {
    const start = usageWindowStart(new Date("2026-11-27T06:54:00Z"), 30);
    expect(start.toISOString()).toBe("2026-10-29T00:00:00.000Z");
  });
});

class Rollback extends Error {}

describeWithDatabase("usage summary PostgreSQL integration", () => {
  let database: PrismaClient;

  beforeAll(() => {
    database = createTestPrisma();
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("counts started, finished and abandoned games and distinct players per UTC day", async () => {
    // Fixtures sit in 2099 so concurrent suites' games never fall inside the
    // window; the transaction is rolled back so nothing is left behind.
    const now = new Date("2099-03-10T12:00:00Z");
    let summary: Awaited<ReturnType<typeof getUsageSummary>> | null = null;

    await database
      .$transaction(async (tx) => {
        const [alice, bob, carol] = await Promise.all(
          ["usage-alice", "usage-bob", "usage-carol"].map((id) =>
            tx.user.create({ data: { id } })
          )
        );
        let lobbyNumber = 0;
        const game = async (
          startedAt: string,
          player1Id: string,
          player2Id: string,
          status: "IN_PROGRESS" | "FINISHED" | "ABANDONED",
          extra: {
            reasonCode?: "LEADER_KO" | "CONCEDE";
            mode?: "PVP" | "SOLITAIRE";
          } = {}
        ) => {
          lobbyNumber += 1;
          const lobby = await tx.lobby.create({
            data: {
              hostUserId: player1Id,
              joinCode: `USAGE${lobbyNumber}`,
              status: "CLOSED",
            },
          });
          await tx.gameSession.create({
            data: {
              lobbyId: lobby.id,
              player1Id,
              player2Id,
              player1DeckId: "deck-1",
              player2DeckId: "deck-2",
              format: "Standard",
              mode: extra.mode ?? "PVP",
              status,
              reasonCode: extra.reasonCode,
              startedAt: new Date(startedAt),
              endedAt: status === "IN_PROGRESS" ? null : new Date(startedAt),
            },
          });
        };

        // Outside a 3-day window (2099-03-08 .. 2099-03-10).
        await game("2099-03-07T23:59:59Z", alice.id, bob.id, "FINISHED", {
          reasonCode: "LEADER_KO",
        });
        await game("2099-03-08T00:00:00Z", alice.id, bob.id, "FINISHED", {
          reasonCode: "LEADER_KO",
        });
        await game("2099-03-08T22:00:00Z", alice.id, carol.id, "ABANDONED", {
          reasonCode: "CONCEDE",
        });
        // Solo game: the same user in both seats counts once.
        await game("2099-03-10T08:00:00Z", carol.id, carol.id, "IN_PROGRESS", {
          mode: "SOLITAIRE",
        });

        summary = await getUsageSummary({ now, windowDays: 3, db: tx });
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });

    expect(summary).toEqual({
      windowDays: 3,
      since: "2099-03-08",
      days: [
        {
          day: "2099-03-08",
          started: 2,
          finished: 1,
          abandoned: 1,
          activePlayers: 3,
        },
        {
          day: "2099-03-09",
          started: 0,
          finished: 0,
          abandoned: 0,
          activePlayers: 0,
        },
        {
          day: "2099-03-10",
          started: 1,
          finished: 0,
          abandoned: 0,
          activePlayers: 1,
        },
      ],
      totals: {
        started: 3,
        finished: 1,
        abandoned: 1,
        inProgress: 1,
        activePlayers: 3,
      },
      endReasons: [
        { reasonCode: "CONCEDE", count: 1 },
        { reasonCode: "LEADER_KO", count: 1 },
      ],
      modes: [
        { mode: "PVP", count: 2 },
        { mode: "SOLITAIRE", count: 1 },
      ],
    });
  });
});
