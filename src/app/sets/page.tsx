import { SetBrowser } from "@/components/cards/set-browser";

export const dynamic = "force-dynamic";

export default function SetsPage() {
  return <SetBrowser cardsRoute="/cards" />;
}
