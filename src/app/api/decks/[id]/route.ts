/**
 * GET    /api/decks/[id] — Get a deck with full card list
 * PATCH  /api/decks/[id] — Partially update a deck (name, leader, cards)
 * DELETE /api/decks/[id] — Delete a deck
 */

import { NextRequest } from "next/server";
import {
  requireAuth,
  apiSuccess,
  apiAction,
  apiError,
} from "@/lib/api-response";
import { UpdateDeckSchema } from "@/lib/validators/decks";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { findCopyLimitViolations } from "@/lib/decks/copy-limits";
import { CARD_SELECT } from "@/lib/decks/card-select";

async function getDeckForUser(deckId: string, userId: string) {
  return prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: {
      cards: {
        include: { card: { select: CARD_SELECT } },
        orderBy: { card: { cost: "asc" } },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  try {
    const deck = await getDeckForUser(id, userId);
    if (!deck) {
      return apiError("Deck not found", 404);
    }

    // Also fetch the leader card details
    const leader = await prisma.card.findUnique({
      where: { id: deck.leaderId },
      select: CARD_SELECT,
    });

    return apiSuccess({ ...deck, leader });
  } catch (error) {
    console.error("[decks:get] failed", error);
    return apiError("Failed to fetch deck", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`deck-update:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    // Verify ownership
    const existing = await prisma.deck.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return apiError("Deck not found", 404);
    }

    const parsed = await parseBody(request, UpdateDeckSchema);
    if (isErrorResponse(parsed)) return parsed;
    const {
      name,
      leaderId,
      leaderArtUrl,
      sleeveUrl,
      donArtUrl,
      testOrder,
      format,
      cards,
    } = parsed;

    // If changing leader, validate it
    if (leaderId && leaderId !== existing.leaderId) {
      const leader = await prisma.card.findUnique({ where: { id: leaderId } });
      if (!leader || leader.type !== "Leader") {
        return apiError("Invalid leader card", 400);
      }
    }

    const copyLimitViolations = await findCopyLimitViolations(cards ?? []);
    if (copyLimitViolations.length > 0) {
      return apiError(
        `Quantity exceeds copy limit for: ${copyLimitViolations.join(", ")}`,
        400
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (leaderId !== undefined) updateData.leaderId = leaderId;
    if (leaderArtUrl !== undefined) updateData.leaderArtUrl = leaderArtUrl;
    if (sleeveUrl !== undefined) updateData.sleeveUrl = sleeveUrl;
    if (donArtUrl !== undefined) updateData.donArtUrl = donArtUrl;
    if (testOrder !== undefined) updateData.testOrder = testOrder;
    if (format !== undefined) updateData.format = format;

    // Wrap delete + create + update in a transaction to prevent data loss
    const deck = await prisma.$transaction(async (tx) => {
      if (cards !== undefined) {
        await tx.deckCard.deleteMany({ where: { deckId: id } });
        if (cards.length > 0) {
          await tx.deckCard.createMany({
            data: cards.map((c) => ({
              deckId: id,
              cardId: c.cardId,
              quantity: c.quantity,
              selectedArtUrl: c.selectedArtUrl ?? null,
            })),
          });
        }
      }

      return tx.deck.update({
        where: { id },
        data: updateData,
        include: {
          cards: {
            include: { card: { select: CARD_SELECT } },
            orderBy: { card: { cost: "asc" } },
          },
        },
      });
    });

    const leader = await prisma.card.findUnique({
      where: { id: deck.leaderId },
      select: CARD_SELECT,
    });

    return apiSuccess({ ...deck, leader });
  } catch (error) {
    console.error("[decks:update] failed", error);
    return apiError("Failed to update deck", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`deck-delete:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const existing = await prisma.deck.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return apiError("Deck not found", 404);
    }

    await prisma.deck.delete({ where: { id } });

    return apiAction();
  } catch (error) {
    console.error("[decks:delete] failed", error);
    return apiError("Failed to delete deck", 500);
  }
}
