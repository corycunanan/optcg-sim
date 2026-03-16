/**
 * GET /api/sets — List all unique sets
 */

import { NextResponse } from "next/server";
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

    return NextResponse.json(sets);
  } catch (error) {
    console.error("Sets fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sets" },
      { status: 500 }
    );
  }
}
