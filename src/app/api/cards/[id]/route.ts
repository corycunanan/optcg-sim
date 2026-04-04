/**
 * GET /api/cards/[id] — Get a single card with all relations
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { UpdateCardSchema } from "@/lib/validators/cards";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";

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

    return NextResponse.json({ data: card });
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const parsed = await parseBody(request, UpdateCardSchema);
    if (isErrorResponse(parsed)) return parsed;

    // Only include fields that were explicitly provided
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) updateData[key] = value;
    }

    const card = await prisma.card.update({
      where: { id },
      data: updateData,
      include: {
        artVariants: true,
        cardSets: { orderBy: { isOrigin: "desc" } },
      },
    });

    return NextResponse.json({ data: card });
  } catch (error) {
    console.error("Card update error:", error);
    return NextResponse.json(
      { error: "Failed to update card" },
      { status: 500 }
    );
  }
}
