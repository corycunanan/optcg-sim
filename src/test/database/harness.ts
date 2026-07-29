import { PrismaClient } from "@prisma/client";
import { describe, inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string | null;
  }
}

const SKIP_INSTRUCTIONS =
  "set TEST_DATABASE_URL to a disposable PostgreSQL maintenance database";

/**
 * Defines a suite that runs against the migrated, per-run PostgreSQL database.
 * The suite is skipped locally when PostgreSQL is unavailable; CI setup fails
 * before collection instead.
 */
export function describeWithDatabase(name: string, suite: () => void) {
  const testUrl = inject("testDatabaseUrl");
  const defineSuite = testUrl ? describe : describe.skip;
  defineSuite(testUrl ? name : `${name} (${SKIP_INSTRUCTIONS})`, suite);
}

export function createTestPrisma() {
  const testUrl = inject("testDatabaseUrl");
  if (!testUrl) {
    throw new Error(SKIP_INSTRUCTIONS);
  }

  return new PrismaClient({ datasourceUrl: testUrl });
}

export function getTestDatabaseUrl() {
  const testUrl = inject("testDatabaseUrl");
  if (!testUrl) {
    throw new Error(SKIP_INSTRUCTIONS);
  }

  return testUrl;
}
