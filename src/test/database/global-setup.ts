import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { TestProject } from "vitest/node";

const DEFAULT_MAINTENANCE_URL =
  "postgresql://prisma:prisma@localhost:5432/postgres";

function databaseUrl(baseUrl: string, databaseName: string) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function dropDatabase(maintenance: PrismaClient, databaseName: string) {
  await maintenance.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`
  );
}

export default async function setupDatabaseTests(project: TestProject) {
  const maintenanceUrl =
    process.env.TEST_DATABASE_URL ?? DEFAULT_MAINTENANCE_URL;
  const maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl });

  try {
    await maintenance.$queryRaw`SELECT 1`;
  } catch (error) {
    await maintenance.$disconnect();

    const message =
      "Database-backed tests require a disposable PostgreSQL server. " +
      "Set TEST_DATABASE_URL to a maintenance database that can CREATE DATABASE.";

    if (process.env.CI) {
      throw new Error(`${message} PostgreSQL was unreachable in CI.`, {
        cause: error,
      });
    }

    console.warn(`[database-tests] ${message} Skipping database suites.`);
    project.provide("testDatabaseUrl", null);
    return;
  }

  const databaseName = [
    "optcg_test",
    process.pid,
    Date.now(),
    randomBytes(4).toString("hex"),
  ].join("_");
  const testUrl = databaseUrl(maintenanceUrl, databaseName);

  try {
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);

    const migration = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: testUrl,
          DIRECT_DATABASE_URL: testUrl,
        },
      }
    );

    if (migration.status !== 0) {
      throw new Error(
        [
          "Failed to apply the Prisma migration history to the test database.",
          migration.stdout,
          migration.stderr,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    project.provide("testDatabaseUrl", testUrl);
  } catch (error) {
    await dropDatabase(maintenance, databaseName);
    await maintenance.$disconnect();
    throw error;
  }

  return async () => {
    await dropDatabase(maintenance, databaseName);
    await maintenance.$disconnect();
  };
}
