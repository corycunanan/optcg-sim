/**
 * GET /api/cards — Search and filter cards
 * POST /api/cards — Create a new card (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { type Prisma } from "@prisma/client";
import { cardIdToOriginSet } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const q = searchParams.get("q") || "";
  const color = searchParams.get("color");
  const type = searchParams.get("type");
  const costMin = searchParams.get("costMin");
  const costMax = searchParams.get("costMax");
  const powerMin = searchParams.get("powerMin");
  const powerMax = searchParams.get("powerMax");
  const set = searchParams.get("set");
  const block = searchParams.get("block");
  const rarity = searchParams.get("rarity");
  const ban = searchParams.get("ban");
  const traits = searchParams.get("traits");
  const attribute = searchParams.get("attribute");
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

  if (powerMin || powerMax) {
    where.power = {};
    if (powerMin) where.power.gte = parseInt(powerMin);
    if (powerMax) where.power.lte = parseInt(powerMax);
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

  if (traits) {
    where.traits = { hasSome: traits.split(",") };
  }

  if (attribute) {
    where.attribute = { hasSome: attribute.split(",") };
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
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { id, name, type, color, blockNumber } = body;
    if (!id || !name || !type || !color?.length || blockNumber == null) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: id, name, type, color, blockNumber",
        },
        { status: 400 },
      );
    }

    // Check for duplicate
    const existing = await prisma.card.findUnique({ where: { id } });
    if (existing) {
      return NextResponse.json(
        { error: `Card with ID "${id}" already exists` },
        { status: 409 },
      );
    }

    // Derive origin set from card ID
    const originSet = cardIdToOriginSet(id);

    const card = await prisma.card.create({
      data: {
        id,
        name,
        originSet,
        type,
        color,
        cost: body.cost ?? null,
        power: body.power ?? null,
        counter: body.counter ?? null,
        life: body.life ?? null,
        attribute: body.attribute || [],
        traits: body.traits || [],
        rarity: body.rarity || "Unknown",
        effectText: body.effectText || "",
        triggerText: body.triggerText || null,
        imageUrl: body.imageUrl || "",
        blockNumber,
        banStatus: body.banStatus || "LEGAL",
        isReprint: false,
      },
      include: {
        artVariants: true,
        cardSets: true,
      },
    });

    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    console.error("Card create error:", error);
    return NextResponse.json(
      { error: "Failed to create card" },
      { status: 500 },
    );
  }
}
