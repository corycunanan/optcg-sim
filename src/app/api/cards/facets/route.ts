import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getFacetVocabulary } from "@/lib/cards/facet-vocabulary";
import { consumePublicCardBrowseRateLimit } from "@/lib/cards/public-rate-limit";
import { prisma } from "@/lib/db";

const FACET_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  const { limited } = await consumePublicCardBrowseRateLimit(request.headers);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const vocabulary = await getFacetVocabulary(prisma);
    return apiSuccess(vocabulary, 200, {
      "Cache-Control": FACET_CACHE_CONTROL,
    });
  } catch (error) {
    console.error("[cards:facets] failed", error);
    return apiError("Failed to load card facets", 500);
  }
}
