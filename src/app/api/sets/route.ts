/**
 * GET /api/sets — List all unique sets
 */

import { apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const sets = await prisma.cardSet.findMany({
      distinct: ["setLabel"],
      select: {
        setLabel: true,
        setName: true,
        packId: true,
      },
      orderBy: { packId: "asc" },
    });

    return apiSuccess(sets);
  } catch (error) {
    console.error("Sets fetch error:", error);
    return apiError("Failed to fetch sets", 500);
  }
}
