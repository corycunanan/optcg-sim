/**
 * GET /api/cards/[id] — Get a single card with all relations
 */

import { NextRequest } from "next/server";
import { requireAdmin, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { UpdateCardSchema } from "@/lib/validators/cards";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

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
      return apiError("Card not found", 404);
    }

    return apiSuccess(card);
  } catch (error) {
    console.error("Card fetch error:", error);
    return apiError("Failed to fetch card", 500);
  }
}

/**
 * PATCH /api/cards/[id] — Update a card (admin)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`card-update:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
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

    return apiSuccess(card);
  } catch (error) {
    console.error("Card update error:", error);
    return apiError("Failed to update card", 500);
  }
}
