import type { PrismaClient } from "@prisma/client";
import { EFFECT_FACET_GROUPS } from "@shared/effect-facets";

type FacetRow = { value: string };

function normalizeFacetRows(rows: FacetRow[]) {
  return [...new Set(rows.map(({ value }) => value))].sort();
}

export async function getFacetVocabulary(
  prisma: Pick<PrismaClient, "$queryRaw">
) {
  const [traitRows, effectTraitRows] = await Promise.all([
    prisma.$queryRaw<FacetRow[]>`
      SELECT DISTINCT unnest("traits") AS "value"
      FROM "cards"
    `,
    prisma.$queryRaw<FacetRow[]>`
      SELECT DISTINCT unnest("effectTraits") AS "value"
      FROM "cards"
    `,
  ]);

  return {
    traits: normalizeFacetRows(traitRows),
    effectTraits: normalizeFacetRows(effectTraitRows),
    groups: EFFECT_FACET_GROUPS,
  };
}
