import { prisma } from "@/lib/db";
import Link from "next/link";

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
    <div>
      <h1
        className="mb-8 text-3xl font-bold tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        Sets
      </h1>

      {Object.entries(grouped).map(([prefix, groupSets]) => (
        <div key={prefix} className="mb-10">
          <h2
            className="mb-4 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            {prefixLabels[prefix] || prefix}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groupSets.map((s) => (
              <Link
                key={s.packId}
                href={`/admin/cards?set=${encodeURIComponent(s.setLabel)}`}
                className="flex items-center justify-between rounded p-4 transition-all hover:-translate-y-px hover:shadow-md hover:shadow-black/20"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <span
                    className="font-mono text-sm font-bold"
                    style={{ color: "var(--teal)" }}
                  >
                    {s.setLabel}
                  </span>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {s.setName}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {s._count.cardId}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
