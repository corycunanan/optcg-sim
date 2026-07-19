import type { Metadata } from "next";
import { CardBrowser } from "@/components/cards/card-browser";
import { CardBrowserShell } from "@/components/cards/card-browser-shell";
import {
  getCardBrowserData,
  type CardBrowserSearchParams,
} from "@/lib/cards/browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Card Database — OPTCG Simulator",
  description:
    "Browse One Piece Trading Card Game cards by set, color, type, and block.",
};

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<CardBrowserSearchParams>;
}) {
  const browserData = await getCardBrowserData(await searchParams);

  return (
    <CardBrowserShell>
      <CardBrowser {...browserData} routePath="/cards" />
    </CardBrowserShell>
  );
}
