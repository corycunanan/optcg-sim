import { CardBrowser } from "@/components/cards/card-browser";
import { CardBrowserShell } from "@/components/cards/card-browser-shell";
import {
  getCardBrowserData,
  type CardBrowserSearchParams,
} from "@/lib/cards/browser";

export const dynamic = "force-dynamic";

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
