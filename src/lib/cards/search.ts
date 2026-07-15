/**
 * Card search query builder.
 *
 * Builds a Prisma `where` clause, validated `orderBy`, and pagination
 * from URL search params. Used by GET /api/cards.
 */

import { BanStatus, CardType, type Prisma } from "@prisma/client";
import {
  MIN_SUBSTRING_SEARCH_LENGTH,
  isSubstringSearchQueryTooShort,
  normalizeSubstringSearchQuery,
} from "@/lib/search-query";

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
const VALID_SORT_FIELD_SET = new Set<string>(VALID_SORT_FIELDS);
const CARD_TYPES = new Set<string>(Object.values(CardType));
const BAN_STATUSES = new Set<string>(Object.values(BanStatus));

function isCardType(value: string): value is CardType {
  return CARD_TYPES.has(value);
}

function isBanStatus(value: string): value is BanStatus {
  return BAN_STATUSES.has(value);
}

function isSortField(
  value: string
): value is (typeof VALID_SORT_FIELDS)[number] {
  return VALID_SORT_FIELD_SET.has(value);
}

export function buildCardWhereClause(
  params: CardSearchParams
): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = {};

  if (isSubstringSearchQueryTooShort(params.q)) {
    throw new RangeError(
      `Card search queries must be at least ${MIN_SUBSTRING_SEARCH_LENGTH} characters`
    );
  }

  const query = normalizeSubstringSearchQuery(params.q);
  if (query) {
    where.name = { contains: query, mode: "insensitive" };
  }

  if (params.color) {
    where.color = { hasSome: params.color.split(",") };
  }

  if (params.type) {
    const types = params.type.split(",").filter(isCardType);
    if (types.length > 0) where.type = { in: types };
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
    const statuses = params.ban.split(",").filter(isBanStatus);
    if (statuses.length > 0) where.banStatus = { in: statuses };
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
  order?: string
): Prisma.CardOrderByWithRelationInput {
  const sortField = sort && isSortField(sort) ? sort : "id";
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
