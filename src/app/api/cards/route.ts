/**
 * GET /api/cards — Search and filter cards
 * POST /api/cards — Create a new card (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cardIdToOriginSet } from "@/lib/utils";
import { CreateCardSchema } from "@/lib/validators/cards";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { searchLimiter, apiLimiter } from "@/lib/rate-limit";
import {
  buildCardWhereClause,
  buildCardOrderBy,
  buildCardPagination,
  type CardSearchParams,
} from "@/lib/cards/search";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { limited } = await searchLimiter.check(`card-search:${ip}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  const params: CardSearchParams = {
    q: sp.get("q") || undefined,
    color: sp.get("color") || undefined,
    type: sp.get("type") || undefined,
    costMin: sp.get("costMin") || undefined,
    costMax: sp.get("costMax") || undefined,
    powerMin: sp.get("powerMin") || undefined,
    powerMax: sp.get("powerMax") || undefined,
    set: sp.get("set") || undefined,
    block: sp.get("block") || undefined,
    rarity: sp.get("rarity") || undefined,
    ban: sp.get("ban") || undefined,
    traits: sp.get("traits") || undefined,
    attribute: sp.get("attribute") || undefined,
    page: sp.get("page") || undefined,
    limit: sp.get("limit") || undefined,
    sort: sp.get("sort") || undefined,
    order: sp.get("order") || undefined,
  };

  const where = buildCardWhereClause(params);
  const orderBy = buildCardOrderBy(params.sort, params.order);
  const { page, limit, skip } = buildCardPagination(params.page, params.limit);

  try {
    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        orderBy,
        skip,
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
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limited } = await apiLimiter.check(`card-create:${session.user.id}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const parsed = await parseBody(request, CreateCardSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { id, name, type, color, blockNumber } = parsed;
    const body = parsed;

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

    return NextResponse.json({ data: card }, { status: 201 });
  } catch (error) {
    console.error("Card create error:", error);
    return NextResponse.json(
      { error: "Failed to create card" },
      { status: 500 },
    );
  }
}
