import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { getAllAuthoredSchemas } from "../workers/game/src/engine/schema-registry";
import {
  buildDesiredFacets,
  effectFacetSyncExitCode,
  syncEffectFacets,
} from "./sync-effect-facets";

const desired = buildDesiredFacets();
const clearedIds = Array.from(
  { length: 101 },
  (_, index) => `TEST-${String(index).padStart(3, "0")}`
);
const databaseRows = [
  { id: "EB01-001", effectTags: [], effectTraits: [] },
  { id: "OP13-064", ...desired.get("OP13-064")! },
  ...clearedIds.map((id) => ({
    id,
    effectTags: ["stale:tag"],
    effectTraits: ["Stale Trait"],
  })),
];

function createPrismaMock(rows = databaseRows) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const update = vi.fn((args: unknown) => Promise.resolve(args));
  const transaction = vi.fn((operations: Promise<unknown>[]) =>
    Promise.all(operations)
  );
  const client = {
    card: { findMany, update },
    $transaction: transaction,
  } as unknown as PrismaClient;

  return { client, findMany, update, transaction };
}

describe("buildDesiredFacets", () => {
  it("canonicalizes authored tags and visible effect traits", () => {
    const desired = buildDesiredFacets();

    expect(desired.get("EB01-001")).toEqual({
      effectTags: [
        "category:auto",
        "category:rule_modification",
        "condition:card_on_field",
        "cost:none",
        "stat:power_up:self",
        "timing:don_requirement",
        "trigger:when_attacking",
      ],
      effectTraits: ["Land of Wano"],
    });
    expect(desired.get("OP13-064")?.effectTraits).not.toContain(
      "Roger Pirates"
    );
  });

  it("keys authored variant schemas by base card ID", async () => {
    const variantSchemas = {
      "EB01-009_p1": getAllAuthoredSchemas()["EB01-009"],
    };
    const variantDesired = buildDesiredFacets(variantSchemas);
    const { client } = createPrismaMock([
      { id: "EB01-009", effectTags: [], effectTraits: [] },
    ]);

    const result = await syncEffectFacets(client, {
      mode: "dry-run",
      authoredSchemas: variantSchemas,
    });

    expect(variantDesired.has("EB01-009")).toBe(true);
    expect(variantDesired.has("EB01-009_p1")).toBe(false);
    expect(result.updated).toEqual(["EB01-009"]);
    expect(result.resolvedVariantIds).toEqual(["EB01-009_p1 -> EB01-009"]);
  });
});

describe("syncEffectFacets", () => {
  it("reports dry-run changes without writing", async () => {
    const { client, findMany, update, transaction } = createPrismaMock();

    const result = await syncEffectFacets(client, { mode: "dry-run" });

    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, effectTags: true, effectTraits: true },
    });
    expect(result.updated).toEqual(["EB01-001"]);
    expect(result.cleared).toEqual(clearedIds);
    expect(result.unchanged).toBe(1);
    expect(result.missingInDb).toContain("EB01-009");
    expect(result.missingInDb).not.toContain("EB01-001");
    expect(result.missingInDb).not.toContain("OP13-064");
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns a failing check exit code for pending changes without writing", async () => {
    const { client, update, transaction } = createPrismaMock();

    const result = await syncEffectFacets(client, { mode: "check" });

    expect(effectFacetSyncExitCode("check", result)).toBe(1);
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("writes pending changes in batches", async () => {
    const { client, update, transaction } = createPrismaMock();

    const result = await syncEffectFacets(client, { mode: "write" });

    expect(effectFacetSyncExitCode("write", result)).toBe(0);
    expect(update).toHaveBeenCalledTimes(102);
    expect(update).toHaveBeenCalledWith({
      where: { id: "EB01-001" },
      data: desired.get("EB01-001"),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "TEST-000" },
      data: { effectTags: [], effectTraits: [] },
    });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0]?.[0]).toHaveLength(100);
    expect(transaction.mock.calls[1]?.[0]).toHaveLength(2);
  });
});
