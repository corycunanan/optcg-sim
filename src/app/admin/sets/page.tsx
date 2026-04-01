import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function SetsPage() {
  const sets = await prisma.cardSet.groupBy({
    by: ["setLabel", "setName", "packId"],
    _count: { cardId: true },
    orderBy: { packId: "asc" },
  });

  // Group by prefix (ST, OP, EB, PRB, etc.)
  const grouped: Record<string, typeof sets> = {};
  for (const s of sets) {
    const prefix = s.setLabel.match(/^([A-Z]+)/)?.[1] || "Other";
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(s);
  }

  const prefixLabels: Record<string, string> = {
    ST: "Starter Decks",
    OP: "Booster Packs",
    EB: "Extra Boosters",
    PRB: "Premium Boosters",
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-8 font-display text-3xl font-bold tracking-tight text-content-primary">
        Sets
      </h1>

      {Object.entries(grouped).map(([prefix, groupSets]) => (
        <div key={prefix} className="mb-10">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            {prefixLabels[prefix] || prefix}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groupSets.map((s) => (
              <Link
                key={s.packId}
                href={`/admin/cards?set=${encodeURIComponent(s.setLabel)}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-1 p-4 transition-all hover:-translate-y-px hover:shadow-md"
              >
                <div>
                  <span className="font-mono text-sm font-bold text-navy-900">
                    {s.setLabel}
                  </span>
                  <p className="mt-1 text-xs text-content-tertiary">
                    {s.setName}
                  </p>
                </div>
                <Badge variant="secondary" className="rounded-full tabular-nums">
                  {s._count.cardId}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
