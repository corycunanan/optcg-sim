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
      <h1
        className="mb-8 text-3xl font-bold tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
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
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h2
            className="mb-4 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            By Type
          </h2>
          <div className="space-y-2.5">
            {typeDistribution.map((t) => {
              const pct = Math.round((t._count / cardCount) * 100);
              return (
                <div key={t.type}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={`/admin/cards?type=${t.type}`}
                      className="text-sm font-medium transition-colors hover:underline"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t.type}
                    </Link>
                    <span
                      className="text-sm tabular-nums font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t._count.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-1 overflow-hidden rounded-full"
                    style={{ background: "var(--surface-3)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: "var(--teal)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h2
            className="mb-4 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            By Block
          </h2>
          <div className="space-y-2.5">
            {blockDistribution.map((b) => {
              const pct = Math.round((b._count / cardCount) * 100);
              return (
                <div key={b.blockNumber}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={`/admin/cards?block=${b.blockNumber}`}
                      className="text-sm font-medium transition-colors hover:underline"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Block {b.blockNumber}
                    </Link>
                    <span
                      className="text-sm tabular-nums font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {b._count.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-1 overflow-hidden rounded-full"
                    style={{ background: "var(--surface-3)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: "var(--sage)",
                      }}
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
      className={`rounded-xl p-5 transition-colors ${href ? "cursor-pointer" : ""}`}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </div>
      <div
        className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
