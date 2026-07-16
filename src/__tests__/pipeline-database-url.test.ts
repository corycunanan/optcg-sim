import { describe, expect, it } from "vitest";
import { selectPipelineDatabaseUrl } from "../../pipeline/database-url";

describe("pipeline database URL selection", () => {
  it("prefers DIRECT_DATABASE_URL over a pooled DATABASE_URL", () => {
    expect(
      selectPipelineDatabaseUrl({
        DIRECT_DATABASE_URL: "postgresql://direct.example/optcg",
        DATABASE_URL:
          "postgresql://pooled.example/optcg?pgbouncer=true&connection_limit=1",
      })
    ).toEqual({
      source: "DIRECT_DATABASE_URL",
      url: "postgresql://direct.example/optcg",
    });
  });

  it("falls back to a safe DATABASE_URL", () => {
    expect(
      selectPipelineDatabaseUrl({
        DATABASE_URL: "postgresql://database.example/optcg?connection_limit=10",
      })
    ).toEqual({
      source: "DATABASE_URL",
      url: "postgresql://database.example/optcg?connection_limit=10",
    });
  });

  it("rejects a single-connection DATABASE_URL without a direct URL", () => {
    expect(() =>
      selectPipelineDatabaseUrl({
        DATABASE_URL:
          "postgresql://pooled.example/optcg?pgbouncer=true&connection_limit=1",
      })
    ).toThrow(
      "DATABASE_URL uses connection_limit=1, which is unsafe for the parallel pipeline import. Set DIRECT_DATABASE_URL to a direct PostgreSQL connection and retry."
    );
  });

  it("requires at least one database URL", () => {
    expect(() => selectPipelineDatabaseUrl({})).toThrow(
      "Pipeline import requires DIRECT_DATABASE_URL or DATABASE_URL."
    );
  });
});
