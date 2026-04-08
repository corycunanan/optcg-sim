/**
 * Card search query builder.
 *
 * Builds a Prisma `where` clause, validated `orderBy`, and pagination
 * from URL search params. Used by GET /api/cards.
 */

import { type Prisma } from "@prisma/client";

export interface CardSearchParams {
  q?: string;
  color?: string;
  type?: string;
  costMin?: string;
  costMax?: string;
  powerMin?: string;
  powerMax?: string;
  set?: string;
  block?: string;
  rarity?: string;
  ban?: string;
  traits?: string;
  attribute?: string;
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
}

const VALID_SORT_FIELDS = [
  "id",
  "name",
  "cost",
  "power",
  "type",
  "rarity",
  "blockNumber",
] as const;

export function buildCardWhereClause(params: CardSearchParams): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = {};

  if (params.q) {
    where.name = { contains: params.q, mode: "insensitive" };
  }

  if (params.color) {
    where.color = { hasSome: params.color.split(",") };
  }

  if (params.type) {
    where.type = { in: params.type.split(",") as Prisma.EnumCardTypeFilter["in"] };
  }

  if (params.costMin || params.costMax) {
    where.cost = {};
    const min = parseInt(params.costMin || "");
    const max = parseInt(params.costMax || "");
    if (!isNaN(min)) where.cost.gte = min;
    if (!isNaN(max)) where.cost.lte = max;
  }

  if (params.powerMin || params.powerMax) {
    where.power = {};
    const min = parseInt(params.powerMin || "");
    const max = parseInt(params.powerMax || "");
    if (!isNaN(min)) where.power.gte = min;
    if (!isNaN(max)) where.power.lte = max;
  }

  if (params.set) {
    where.cardSets = { some: { setLabel: params.set } };
  }

  if (params.block) {
    where.blockNumber = { in: params.block.split(",").map(Number) };
  }

  if (params.rarity) {
    where.rarity = { in: params.rarity.split(",") };
  }

  if (params.ban) {
    where.banStatus = {
      in: params.ban.split(",") as Prisma.EnumBanStatusFilter["in"],
    };
  }

  if (params.traits) {
    where.traits = { hasSome: params.traits.split(",") };
  }

  if (params.attribute) {
    where.attribute = { hasSome: params.attribute.split(",") };
  }

  return where;
}

export function buildCardOrderBy(
  sort?: string,
  order?: string,
): Prisma.CardOrderByWithRelationInput {
  const sortField = sort && (VALID_SORT_FIELDS as readonly string[]).includes(sort)
    ? sort
    : "id";
  return { [sortField]: order === "desc" ? "desc" : "asc" };
}

export function buildCardPagination(page?: string, limit?: string) {
  const parsedPage = Math.max(1, parseInt(page || "1") || 1);
  const parsedLimit = Math.min(Math.max(1, parseInt(limit || "40") || 40), 100);
  return {
    page: parsedPage,
    limit: parsedLimit,
    skip: (parsedPage - 1) * parsedLimit,
  };
}
