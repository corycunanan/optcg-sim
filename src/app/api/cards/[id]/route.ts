/**
 * GET /api/cards/[id] — Get a single card with all relations
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        artVariants: true,
        cardSets: { orderBy: { isOrigin: "desc" } },
        erratas: { orderBy: { date: "desc" } },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    console.error("Card fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch card" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cards/[id] — Update a card (admin)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();

    // Allow updating all card fields (except id and originSet which are derived)
    const allowedFields = [
      "name",
      "type",
      "color",
      "cost",
      "power",
      "counter",
      "life",
      "attribute",
      "traits",
      "rarity",
      "effectText",
      "triggerText",
      "imageUrl",
      "blockNumber",
      "banStatus",
      "isReprint",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const card = await prisma.card.update({
      where: { id },
      data: updateData,
      include: {
        artVariants: true,
        cardSets: { orderBy: { isOrigin: "desc" } },
      },
    });

    return NextResponse.json(card);
  } catch (error) {
    console.error("Card update error:", error);
    return NextResponse.json(
      { error: "Failed to update card" },
      { status: 500 }
    );
  }
}
