import type { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EFFECT_FACET_GROUPS } from "@shared/effect-facets";
import {
  createTestPrisma,
  describeWithDatabase,
} from "@/test/database/harness";
import { getFacetVocabulary } from "./facet-vocabulary";

const queryRawMock = vi.fn();
const prisma = {
  $queryRaw: queryRawMock,
} as unknown as Pick<PrismaClient, "$queryRaw">;

beforeEach(() => {
  queryRawMock.mockReset();
});

describe("getFacetVocabulary", () => {
  it("sorts and deduplicates traits from every card array", async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { value: "Straw Hat Crew" },
        { value: "Animal" },
        { value: "Animal" },
      ])
      .mockResolvedValueOnce([
        { value: "Straw Hat Crew" },
        { value: "Navy" },
        { value: "Navy" },
      ]);

    const vocabulary = await getFacetVocabulary(prisma);

    expect(vocabulary.traits).toEqual(["Animal", "Straw Hat Crew"]);
    expect(vocabulary.effectTraits).toEqual(["Navy", "Straw Hat Crew"]);
    expect(vocabulary.groups).toBe(EFFECT_FACET_GROUPS);
    expect(queryRawMock).toHaveBeenCalledTimes(2);

    const queries = queryRawMock.mock.calls.map(([strings]) =>
      (strings as TemplateStringsArray).join("?")
    );
    expect(queries[0]).toContain('unnest("traits")');
    expect(queries[1]).toContain('unnest("effectTraits")');
  });
});

describeWithDatabase("facet vocabulary PostgreSQL integration", () => {
  let database: PrismaClient;

  beforeAll(() => {
    database = createTestPrisma();
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("collects distinct sorted values across cards and ignores empty arrays", async () => {
    // Keep fixture creation, reads and cleanup in one transaction.
    await database.$transaction(async (transaction) => {
      await transaction.card.createMany({
        data: [
          {
            id: "FACET-001",
            traits: ["Facet Straw Hat Crew", "Facet Animal", "Facet Animal"],
            effectTraits: ["Facet Navy"],
          },
          {
            id: "FACET-002",
            traits: ["Facet Animal", "Facet Navy"],
            effectTraits: ["Facet Straw Hat Crew", "Facet Navy"],
          },
          { id: "FACET-003", traits: [], effectTraits: [] },
        ].map((card) => ({
          ...card,
          originSet: "FACET",
          name: card.id,
          color: ["Red"],
          type: "Character" as const,
          attribute: [],
          rarity: "Common",
          effectText: "",
          imageUrl: "",
          blockNumber: 1,
        })),
      });

      const vocabulary = await getFacetVocabulary(transaction);
      // Other database suites may seed cards concurrently in the shared test DB.
      expect(
        vocabulary.traits.filter((value) => value.startsWith("Facet "))
      ).toEqual(["Facet Animal", "Facet Navy", "Facet Straw Hat Crew"]);
      expect(
        vocabulary.effectTraits.filter((value) => value.startsWith("Facet "))
      ).toEqual(["Facet Navy", "Facet Straw Hat Crew"]);
      for (const values of [vocabulary.traits, vocabulary.effectTraits]) {
        expect(values).toEqual([...new Set(values)].sort());
        expect(values).not.toContain("");
        expect(values).not.toContain(null);
      }
      expect(vocabulary.groups).toBe(EFFECT_FACET_GROUPS);
      await transaction.card.deleteMany({ where: { originSet: "FACET" } });
    });
  });
});
