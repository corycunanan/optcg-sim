import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SetsPage() {
  // Get all unique sets with card counts
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Sets</h1>

      {Object.entries(grouped).map(([prefix, groupSets]) => (
        <div key={prefix} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-700">
            {prefix === "ST"
              ? "Starter Decks"
              : prefix === "OP"
                ? "Booster Packs"
                : prefix === "EB"
                  ? "Extra Boosters"
                  : prefix === "PRB"
                    ? "Premium Boosters"
                    : prefix}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groupSets.map((s) => (
              <Link
                key={s.packId}
                href={`/admin/cards?set=${encodeURIComponent(s.setLabel)}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
              >
                <div>
                  <span className="font-mono text-sm font-bold text-gray-800">
                    {s.setLabel}
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500">{s.setName}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {s._count.cardId} cards
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
