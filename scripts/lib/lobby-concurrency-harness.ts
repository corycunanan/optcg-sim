import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export const REQUIRED_DEV_DATABASE_HOSTS = [
  "ep-aged-base-a45y6qrm.us-east-1.aws.neon.tech",
  "ep-aged-base-a45y6qrm-pooler.us-east-1.aws.neon.tech",
] as const;

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

export class ExpectedConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedConflict";
  }
}

export interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

export function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertExpectedConflict(
  result: PromiseSettledResult<unknown>,
  label: string
): void {
  assert(result.status === "rejected", `${label} unexpectedly committed`);
  assert(
    result.reason instanceof ExpectedConflict,
    `${label} failed with an unexpected error: ${errorMessage(result.reason)}`
  );
}

export function assertCommitted(
  result: PromiseSettledResult<unknown>,
  label: string
): void {
  assert(
    result.status === "fulfilled",
    `${label} unexpectedly failed: ${
      result.status === "rejected" ? errorMessage(result.reason) : "unknown"
    }`
  );
}

export function transaction<T>(
  client: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return client.$transaction(operation, TRANSACTION_OPTIONS);
}

export async function transactionBackendPid(
  tx: Prisma.TransactionClient
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ pid: number }>>`
    SELECT pg_backend_pid()::int AS pid
  `;
  const pid = rows[0]?.pid;
  assert(pid !== undefined, "Could not resolve transaction backend PID");
  return pid;
}

export class LobbyConcurrencyHarness {
  readonly runTag = `o567-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
  readonly observer = new PrismaClient();
  readonly clients: PrismaClient[] = [this.observer];

  createClient(): PrismaClient {
    const client = new PrismaClient();
    this.clients.push(client);
    return client;
  }

  async connect(): Promise<void> {
    await this.observer.$connect();
    await this.observer.$queryRaw`SELECT 1`;
  }

  async createUser(label: string) {
    return this.observer.user.create({
      data: {
        email: `${this.runTag}-${label}@example.test`,
        name: `[${this.runTag}] ${label}`,
      },
    });
  }

  async createLobby(
    label: string,
    hostUserId: string,
    data: Partial<{
      status: "WAITING" | "READY";
      mode: "PVP" | "SOLITAIRE";
      revision: number;
    }> = {}
  ) {
    return this.observer.lobby.create({
      data: {
        hostUserId,
        joinCode: `${this.runTag}-${label.slice(0, 6)}-${randomUUID().slice(0, 4)}`,
        ...data,
      },
    });
  }

  async seatGuest(lobbyId: string, userId: string): Promise<void> {
    await this.observer.$transaction([
      this.observer.lobbyGuest.create({ data: { lobbyId, userId } }),
      this.observer.user.update({
        where: { id: userId },
        data: { activeLobbyId: lobbyId },
      }),
    ]);
  }

  async pointUserAtLobby(userId: string, lobbyId: string): Promise<void> {
    await this.observer.user.update({
      where: { id: userId },
      data: { activeLobbyId: lobbyId },
    });
  }

  async awaitBlocked(
    blockedPid: number,
    blockingPid: number,
    label: string
  ): Promise<void> {
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      const rows = await this.observer.$queryRaw<
        Array<{
          waitEventType: string | null;
          waitEvent: string | null;
          blockingPids: number[];
        }>
      >(Prisma.sql`
        SELECT
          wait_event_type AS "waitEventType",
          wait_event AS "waitEvent",
          pg_blocking_pids(pid)::int[] AS "blockingPids"
        FROM pg_stat_activity
        WHERE pid = ${blockedPid}
      `);
      const activity = rows[0];
      if (
        activity?.waitEventType === "Lock" &&
        activity.blockingPids.includes(blockingPid)
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(
      `${label} (backend ${blockedPid}) was not blocked by expected backend ${blockingPid}; overlap was not proven`
    );
  }

  async cleanup(): Promise<void> {
    const taggedUsers = await this.observer.user.findMany({
      where: { email: { startsWith: `${this.runTag}-` } },
      select: { id: true },
    });
    const userIds = taggedUsers.map(({ id }) => id);

    await this.observer.$transaction(async (tx) => {
      await tx.lobby.deleteMany({
        where: {
          OR: [
            { joinCode: { startsWith: `${this.runTag}-` } },
            ...(userIds.length > 0 ? [{ hostUserId: { in: userIds } }] : []),
          ],
        },
      });
      if (userIds.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });

    const [remainingUsers, remainingLobbies] = await Promise.all([
      this.observer.user.count({
        where: { email: { startsWith: `${this.runTag}-` } },
      }),
      this.observer.lobby.count({
        where: { joinCode: { startsWith: `${this.runTag}-` } },
      }),
    ]);
    assert(
      remainingUsers === 0 && remainingLobbies === 0,
      `Cleanup verification failed (${remainingUsers} users, ${remainingLobbies} lobbies remain)`
    );
  }

  async disconnect(): Promise<void> {
    await Promise.allSettled(
      this.clients.map((client) => client.$disconnect())
    );
  }
}

export function validateDatabaseUrl(databaseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (
    !REQUIRED_DEV_DATABASE_HOSTS.some(
      (requiredHostname) => hostname === requiredHostname
    )
  ) {
    throw new Error(
      `Refusing to run against ${hostname}; expected one of the shared OPTCG DEV Neon hosts (${REQUIRED_DEV_DATABASE_HOSTS.join(", ")})`
    );
  }
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const unavailableCodes = new Set(["P1001", "P1002", "P1017"]);
  return (
    (error instanceof Prisma.PrismaClientInitializationError &&
      error.errorCode !== undefined &&
      unavailableCodes.has(error.errorCode)) ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      unavailableCodes.has(error.code))
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
