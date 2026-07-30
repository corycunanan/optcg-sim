import { afterEach, describe, expect, it, vi } from "vitest";
import setupDatabaseTests, {
  shouldFailForUnavailableDatabase,
} from "./global-setup";

const UNREACHABLE_DATABASE_URL =
  "postgresql://prisma:prisma@127.0.0.1:59999/postgres";

function testProject() {
  const provide = vi.fn();
  return {
    project: { provide } as unknown as Parameters<typeof setupDatabaseTests>[0],
    provide,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("shouldFailForUnavailableDatabase", () => {
  it("fails when running in GitHub Actions", () => {
    expect(
      shouldFailForUnavailableDatabase({
        CI: "true",
        GITHUB_ACTIONS: "true",
      })
    ).toBe(true);
  });

  it("skips when only generic CI is set", () => {
    expect(shouldFailForUnavailableDatabase({ CI: "true" })).toBe(false);
  });

  it("skips when no CI signal is set", () => {
    expect(shouldFailForUnavailableDatabase({})).toBe(false);
  });

  it("skips when GitHub Actions is explicitly false", () => {
    expect(shouldFailForUnavailableDatabase({ GITHUB_ACTIONS: "false" })).toBe(
      false
    );
  });
});

describe("setupDatabaseTests unavailable database behavior", () => {
  it("rejects with actionable guidance in GitHub Actions", async () => {
    vi.stubEnv("TEST_DATABASE_URL", UNREACHABLE_DATABASE_URL);
    vi.stubEnv("GITHUB_ACTIONS", "true");
    const { project, provide } = testProject();

    await expect(setupDatabaseTests(project)).rejects.toThrow(
      "PostgreSQL was unreachable in GitHub Actions. Restore the PostgreSQL service or set TEST_DATABASE_URL to a reachable maintenance database."
    );
    expect(provide).not.toHaveBeenCalled();
  });

  it("skips when only generic CI is set", async () => {
    vi.stubEnv("TEST_DATABASE_URL", UNREACHABLE_DATABASE_URL);
    vi.stubEnv("CI", "true");
    vi.stubEnv("GITHUB_ACTIONS", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { project, provide } = testProject();

    await expect(setupDatabaseTests(project)).resolves.toBeUndefined();
    expect(provide).toHaveBeenCalledOnce();
    expect(provide).toHaveBeenCalledWith("testDatabaseUrl", null);
  });

  it("skips when GitHub Actions is explicitly false", async () => {
    vi.stubEnv("TEST_DATABASE_URL", UNREACHABLE_DATABASE_URL);
    vi.stubEnv("GITHUB_ACTIONS", "false");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { project, provide } = testProject();

    await expect(setupDatabaseTests(project)).resolves.toBeUndefined();
    expect(provide).toHaveBeenCalledOnce();
    expect(provide).toHaveBeenCalledWith("testDatabaseUrl", null);
  });
});
