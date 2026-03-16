/**
 * GET /api/cards — Search and filter cards
 *
 * Query params:
 *   q        — full-text search on name
 *   color    — filter by color (comma-separated)
 *   type     — filter by card type (comma-separated)
 *   costMin  — minimum cost
 *   costMax  — maximum cost
 *   set      — filter by set label
 *   block    — filter by block number
 *   rarity   — filter by rarity (comma-separated)
 *   ban      — filter by ban status
 *   page     — page number (default 1)
 *   limit    — items per page (default 40)
 *   sort     — sort field (default "id")
 *   order    — sort order (default "asc")
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { type Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const q = searchParams.get("q") || "";
  const color = searchParams.get("color");
  const type = searchParams.get("type");
  const costMin = searchParams.get("costMin");
  const costMax = searchParams.get("costMax");
  const set = searchParams.get("set");
  const block = searchParams.get("block");
  const rarity = searchParams.get("rarity");
  const ban = searchParams.get("ban");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "40"), 100);
  const sort = searchParams.get("sort") || "id";
  const order = searchParams.get("order") || "asc";

  // Build where clause
  const where: Prisma.CardWhereInput = {};

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  if (color) {
    where.color = { hasSome: color.split(",") };
  }

  if (type) {
    where.type = { in: type.split(",") as Prisma.EnumCardTypeFilter["in"] };
  }

  if (costMin || costMax) {
    where.cost = {};
    if (costMin) where.cost.gte = parseInt(costMin);
    if (costMax) where.cost.lte = parseInt(costMax);
  }

  if (set) {
    where.cardSets = { some: { setLabel: set } };
  }

  if (block) {
    where.blockNumber = { in: block.split(",").map(Number) };
  }

  if (rarity) {
    where.rarity = { in: rarity.split(",") };
  }

  if (ban) {
    where.banStatus = {
      in: ban.split(",") as Prisma.EnumBanStatusFilter["in"],
    };
  }

  // Build orderBy
  const validSortFields = [
    "id",
    "name",
    "cost",
    "power",
    "type",
    "rarity",
    "blockNumber",
  ];
  const sortField = validSortFields.includes(sort) ? sort : "id";
  const orderBy: Prisma.CardOrderByWithRelationInput = {
    [sortField]: order === "desc" ? "desc" : "asc",
  };

  try {
    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          artVariants: true,
          cardSets: { orderBy: { isOrigin: "desc" } },
        },
      }),
      prisma.card.count({ where }),
    ]);

    return NextResponse.json({
      data: cards,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Card search error:", error);
    return NextResponse.json(
      { error: "Failed to search cards" },
      { status: 500 }
    );
  }
}
