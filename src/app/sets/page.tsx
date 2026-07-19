import type { Metadata } from "next";
import { SetBrowser } from "@/components/cards/set-browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Card Sets — OPTCG Simulator",
  description:
    "Browse One Piece Trading Card Game starter decks, booster packs, and special sets.",
};

export default function SetsPage() {
  return <SetBrowser cardsRoute="/cards" />;
}
