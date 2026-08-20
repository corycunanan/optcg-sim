import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

interface SetBrowserProps {
  cardsRoute: string;
}

export async function SetBrowser({ cardsRoute }: SetBrowserProps) {
  const sets = await prisma.cardSet.groupBy({
    by: ["setLabel", "setName", "packId"],
    _count: { cardId: true },
    orderBy: { packId: "asc" },
  });

  const grouped: Record<string, typeof sets> = {};
  for (const set of sets) {
    const prefix = set.setLabel.match(/^([A-Z]+)/)?.[1] || "Other";
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(set);
  }

  const prefixLabels: Record<string, string> = {
    ST: "Starter Decks",
    OP: "Booster Packs",
    EB: "Extra Boosters",
    PRB: "Premium Boosters",
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Sets</PageHeaderTitle>
          <PageHeaderDescription>
            Every starter deck, booster pack, and special set in the database.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        {Object.entries(grouped).map(([prefix, groupSets]) => (
          <div key={prefix} className="mb-10">
            <h2 className="text-content-tertiary mb-4 text-sm font-semibold tracking-widest uppercase">
              {prefixLabels[prefix] || prefix}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupSets.map((set) => (
                <Link
                  key={set.packId}
                  href={`${cardsRoute}?set=${encodeURIComponent(set.setLabel)}`}
                  className="border-border bg-surface-1 flex items-center justify-between rounded-lg border p-4 shadow-sm transition-[translate,box-shadow] hover:shadow-md motion-safe:hover:lift"
                >
                  <div>
                    <span className="text-content-primary font-mono text-sm font-semibold">
                      {set.setLabel}
                    </span>
                    <p className="text-content-tertiary mt-1 text-sm">
                      {set.setName}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded tabular-nums"
                  >
                    {set._count.cardId}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
