import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createTestPrisma,
  describeWithDatabase,
} from "@/test/database/harness";
import { buildCardWhereClause, type CardSearchParams } from "./search";

// Deliberately distinguish printed traits, referenced traits, tag groups, and
// null/zero counters. Expected IDs are worked examples, not a mock of Prisma.
const fixtures = [
  {
    id: "facet-ko",
    effectTags: ["trigger:on_play", "removal:ko"],
    traits: ["Supernovas"],
    effectTraits: ["Straw Hat Crew"],
    counter: 1000,
  },
  {
    id: "facet-bounce",
    effectTags: ["trigger:on_play", "removal:bounce"],
    traits: ["Navy"],
    effectTraits: ["Straw Hat Crew"],
    counter: 0,
  },
  {
    id: "facet-other-trigger",
    effectTags: ["trigger:when_attacking", "removal:ko"],
    traits: ["Straw Hat Crew"],
    effectTraits: ["Navy"],
    counter: 2000,
  },
  {
    id: "facet-null",
    effectTags: ["trigger:on_play"],
    traits: ["Supernovas"],
    effectTraits: ["Navy"],
    counter: null,
  },
];

describeWithDatabase("card facet search PostgreSQL integration", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.card.createMany({
      data: fixtures.map((fixture) => ({
        ...fixture,
        originSet: "FACET-TEST",
        name: fixture.id,
        color: ["Red"],
        type: "Character" as const,
        attribute: [],
        rarity: "Common",
        effectText: "",
        imageUrl: "https://example.test/card.png",
        blockNumber: 1,
      })),
    });
  });

  afterAll(async () => {
    await prisma?.card.deleteMany({
      where: { id: { in: fixtures.map(({ id }) => id) } },
    });
    await prisma?.$disconnect();
  });

  async function search(params: CardSearchParams) {
    const cards = await prisma.card.findMany({
      where: {
        ...buildCardWhereClause(params),
        id: { in: fixtures.map(({ id }) => id) },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return cards.map(({ id }) => id);
  }

  it("ORs tags within a group and ANDs groups", async () => {
    expect(await search({ effectTags: "removal:ko,removal:bounce" })).toEqual([
      "facet-bounce",
      "facet-ko",
      "facet-other-trigger",
    ]);
    expect(
      await search({ effectTags: "trigger:on_play,removal:ko,removal:bounce" })
    ).toEqual(["facet-bounce", "facet-ko"]);
  });

  it("filters referenced traits independently of printed traits", async () => {
    expect(await search({ effectTraits: "Straw Hat Crew" })).toEqual([
      "facet-bounce",
      "facet-ko",
    ]);
    expect(
      await search({ traits: "Supernovas", effectTraits: "Straw Hat Crew" })
    ).toEqual(["facet-ko"]);
  });

  it("excludes null counters for minimum, maximum-zero, and bounded ranges", async () => {
    expect(await search({ counterMin: "1" })).toEqual([
      "facet-ko",
      "facet-other-trigger",
    ]);
    expect(await search({ counterMax: "0" })).toEqual(["facet-bounce"]);
    expect(await search({ counterMin: "0", counterMax: "2000" })).toEqual([
      "facet-bounce",
      "facet-ko",
      "facet-other-trigger",
    ]);
  });

  it("combines all new filters with existing filters", async () => {
    expect(
      await search({
        effectTags: "trigger:on_play,removal:ko,trigger:unknown",
        effectTraits: "Straw Hat Crew",
        traits: "Supernovas",
        counterMin: "1000",
      })
    ).toEqual(["facet-ko"]);
  });
});
