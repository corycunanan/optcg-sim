import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Dashboard</PageHeaderTitle>
          <PageHeaderDescription>
            Card, variant, and set totals across the database.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        {/* Stats */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label="Cards" value={cardCount} href="/admin/cards" />
          <StatBox label="Art Variants" value={variantCount} />
          <StatBox label="Sets" value={setCount.length} href="/admin/sets" />
          <StatBox label="Blocks" value={blockDistribution.length} />
        </div>

        {/* Distribution */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border-border bg-card rounded-lg border p-5">
            <h2 className="text-content-tertiary mb-4 text-xs font-semibold tracking-widest uppercase">
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
                        className="text-content-secondary text-sm font-medium transition-colors hover:underline"
                      >
                        {t.type}
                      </Link>
                      <span className="text-content-primary text-sm font-semibold tabular-nums">
                        {t._count.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-muted h-1 overflow-hidden rounded-md">
                      <div
                        className="bg-primary h-full rounded-md transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-border bg-card rounded-lg border p-5">
            <h2 className="text-content-tertiary mb-4 text-xs font-semibold tracking-widest uppercase">
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
                        className="text-content-secondary text-sm font-medium transition-colors hover:underline"
                      >
                        Block {b.blockNumber}
                      </Link>
                      <span className="text-content-primary text-sm font-semibold tabular-nums">
                        {b._count.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-muted h-1 overflow-hidden rounded-md">
                      <div
                        className="bg-gold-500 h-full rounded-md transition-all"
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
      className={`border-border bg-card rounded-lg border p-5 transition-colors ${href ? "hover:bg-secondary cursor-pointer" : ""}`}
    >
      <div className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
        {label}
      </div>
      <div className="text-content-primary mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
