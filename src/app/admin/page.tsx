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
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-8 font-display text-3xl font-bold tracking-tight text-content-primary">
        Dashboard
      </h1>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Cards" value={cardCount} href="/admin/cards" />
        <StatBox label="Art Variants" value={variantCount} />
        <StatBox label="Sets" value={setCount.length} href="/admin/sets" />
        <StatBox label="Blocks" value={blockDistribution.length} />
      </div>

      {/* Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            By Type
          </h2>
          <div className="space-y-3">
            {typeDistribution.map((t) => {
              const pct = Math.round((t._count / cardCount) * 100);
              return (
                <div key={t.type}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={`/admin/cards?type=${t.type}`}
                      className="text-sm font-medium text-content-secondary transition-colors hover:underline"
                    >
                      {t.type}
                    </Link>
                    <span className="text-sm font-semibold tabular-nums text-content-primary">
                      {t._count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-navy-900 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            By Block
          </h2>
          <div className="space-y-3">
            {blockDistribution.map((b) => {
              const pct = Math.round((b._count / cardCount) * 100);
              return (
                <div key={b.blockNumber}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={`/admin/cards?block=${b.blockNumber}`}
                      className="text-sm font-medium text-content-secondary transition-colors hover:underline"
                    >
                      Block {b.blockNumber}
                    </Link>
                    <span className="text-sm font-semibold tabular-nums text-content-primary">
                      {b._count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gold-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
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
      className={`rounded-lg border border-border bg-surface-1 p-5 transition-colors ${href ? "cursor-pointer hover:bg-surface-2" : ""}`}
    >
      <div className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-content-primary">
        {value.toLocaleString()}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
