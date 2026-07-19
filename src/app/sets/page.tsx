import type { Metadata } from "next";
import { headers } from "next/headers";
import { CardBrowseRateLimitFallback } from "@/app/cards/rate-limit-fallback";
import { SetBrowser } from "@/components/cards/set-browser";
import { checkPublicCardBrowseRateLimit } from "@/lib/cards/public-rate-limit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Card Sets — OPTCG Simulator",
  description:
    "Browse One Piece Trading Card Game starter decks, booster packs, and special sets.",
};

export default async function SetsPage() {
  const { limited } = await checkPublicCardBrowseRateLimit(await headers());
  if (limited) {
    return <CardBrowseRateLimitFallback />;
  }

  return <SetBrowser cardsRoute="/cards" />;
}
