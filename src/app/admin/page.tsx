import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [cardCount, variantCount, setCount] = await Promise.all([
    prisma.card.count(),
    prisma.artVariant.count(),
    prisma.cardSet.findMany({
      distinct: ["setLabel"],
      select: { setLabel: true },
    }),
  ]);

  const typeDistribution = await prisma.card.groupBy({
    by: ["type"],
    _count: true,
  });

  const blockDistribution = await prisma.card.groupBy({
    by: ["blockNumber"],
    _count: true,
    orderBy: { blockNumber: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Admin Dashboard</h1>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBox label="Cards" value={cardCount} href="/admin/cards" />
        <StatBox label="Art Variants" value={variantCount} />
        <StatBox label="Sets" value={setCount.length} href="/admin/sets" />
        <StatBox
          label="Blocks"
          value={blockDistribution.length}
        />
      </div>

      {/* Type distribution */}
      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            By Type
          </h2>
          <div className="space-y-2">
            {typeDistribution.map((t) => (
              <div key={t.type} className="flex items-center justify-between">
                <Link
                  href={`/admin/cards?type=${t.type}`}
                  className="text-sm text-gray-700 hover:text-red-600"
                >
                  {t.type}
                </Link>
                <span className="text-sm font-medium text-gray-900">
                  {t._count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            By Block
          </h2>
          <div className="space-y-2">
            {blockDistribution.map((b) => (
              <div
                key={b.blockNumber}
                className="flex items-center justify-between"
              >
                <Link
                  href={`/admin/cards?block=${b.blockNumber}`}
                  className="text-sm text-gray-700 hover:text-red-600"
                >
                  Block {b.blockNumber}
                </Link>
                <span className="text-sm font-medium text-gray-900">
                  {b._count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-5 ${href ? "transition hover:border-red-300 hover:shadow-sm" : ""}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold text-gray-900">
        {value.toLocaleString()}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
