import { CardType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isSubstringSearchQueryTooShort,
  normalizeSubstringSearchQuery,
} from "@/lib/search-query";
import type { CardBrowserProps } from "@/components/cards/card-browser";

export type CardBrowserSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type CardBrowserData = Omit<
  CardBrowserProps,
  "routePath" | "renderDetailActions"
>;

const CARD_TYPES = new Set<string>(Object.values(CardType));

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isCardType(value: string): value is CardType {
  return CARD_TYPES.has(value);
}

export async function getCardBrowserData(
  params: CardBrowserSearchParams
): Promise<CardBrowserData> {
  const rawQuery = normalizeSubstringSearchQuery(firstParam(params.q));
  const q = isSubstringSearchQueryTooShort(rawQuery) ? "" : rawQuery;
  const color = firstParam(params.color);
  const type = firstParam(params.type);
  const set = firstParam(params.set);
  const block = firstParam(params.block);
  const originOnly = firstParam(params.originOnly);
  const page = parseInt(firstParam(params.page) || "1");
  const limit = 20;

  const sets = await prisma.cardSet.findMany({
    distinct: ["setLabel"],
    select: { setLabel: true, setName: true, packId: true },
    orderBy: { packId: "asc" },
  });

  const hasAnyFilter = q || color || type || set || block || originOnly;
  const effectiveSet = set || (!hasAnyFilter ? "OP15-EB04" : "");
  const where: Prisma.CardWhereInput = {};

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }
  if (color) {
    where.color = { hasSome: color.split(",") };
  }
  if (type) {
    const cardTypes = type.split(",").filter(isCardType);
    if (cardTypes.length > 0) where.type = { in: cardTypes };
  }
  if (effectiveSet) {
    const setLabels = effectiveSet.split(",").filter(Boolean);
    if (setLabels.length > 0) {
      if (originOnly === "true") {
        where.originSet =
          setLabels.length === 1 ? setLabels[0] : { in: setLabels };
      } else {
        where.cardSets = {
          some: {
            setLabel: setLabels.length === 1 ? setLabels[0] : { in: setLabels },
          },
        };
      }
    }
  }
  if (originOnly === "true" && !effectiveSet) {
    where.isReprint = false;
  }
  if (block) {
    where.blockNumber = { in: block.split(",").map(Number) };
  }

  const [initialCards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { artVariants: true } },
        cardSets: { where: { isOrigin: true }, take: 1 },
      },
    }),
    prisma.card.count({ where }),
  ]);

  return {
    initialCards,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    sets,
    currentFilters: {
      q,
      color,
      type,
      set: effectiveSet,
      block,
      originOnly,
    },
  };
}
