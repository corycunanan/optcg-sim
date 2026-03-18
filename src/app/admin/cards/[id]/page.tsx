import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CardImageGallery } from "@/components/admin/card-image-gallery";

export const dynamic = "force-dynamic";

const COLOR_ACCENT: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      artVariants: true,
      cardSets: { orderBy: { isOrigin: "desc" } },
      erratas: { orderBy: { date: "desc" } },
    },
  });

  if (!card) notFound();

  const primaryColor = card.color[0] || "Black";
  const accentColor = COLOR_ACCENT[primaryColor] || "var(--navy-900)";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href="/admin/cards"
          className="text-content-tertiary transition-colors hover:underline"
        >
          Cards
        </Link>
        <span className="text-content-tertiary">›</span>
        <span className="text-content-primary">{card.id}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        {/* Left: Card image gallery */}
        <CardImageGallery
          cardName={card.name}
          baseImageUrl={card.imageUrl}
          artVariants={card.artVariants}
        />

        {/* Right: Card details */}
        <div className="space-y-4">
          {/* Header */}
          <div
            className="rounded-lg bg-surface-1 p-6"
            style={{ borderLeft: `3px solid ${accentColor}` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-content-primary">
                  {card.name}
                </h1>
                <p className="mt-1 text-sm text-content-tertiary">
                  {card.id} · {card.type} · {card.rarity}
                </p>
              </div>
              {card.banStatus !== "LEGAL" && (
                <span className="rounded bg-error px-3 py-1 text-xs font-bold text-content-inverse">
                  {card.banStatus}
                </span>
              )}
            </div>

            {/* Colors */}
            <div className="mt-3 flex flex-wrap gap-2">
              {card.color.map((c) => (
                <span
                  key={c}
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: COLOR_ACCENT[c] || "var(--surface-3)",
                    color: c === "Yellow" ? "var(--text-primary)" : "var(--text-inverse)",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {card.cost !== null && (
              <StatCard label="Cost" value={String(card.cost)} />
            )}
            {card.power !== null && (
              <StatCard
                label="Power"
                value={card.power.toLocaleString()}
              />
            )}
            {card.counter !== null && (
              <StatCard
                label="Counter"
                value={card.counter.toLocaleString()}
              />
            )}
            {card.life !== null && (
              <StatCard label="Life" value={String(card.life)} />
            )}
            <StatCard label="Block" value={String(card.blockNumber)} />
            <StatCard label="Set" value={card.originSet} />
          </div>

          {/* Attributes */}
          {card.attribute.length > 0 && (
            <Section title="Attributes">
              <div className="flex flex-wrap gap-2">
                {card.attribute.map((a) => (
                  <Tag key={a} text={a} />
                ))}
              </div>
            </Section>
          )}

          {/* Traits */}
          {card.traits.length > 0 && (
            <Section title="Traits">
              <div className="flex flex-wrap gap-2">
                {card.traits.map((t) => (
                  <Tag key={t} text={t} />
                ))}
              </div>
            </Section>
          )}

          {/* Effect text */}
          {card.effectText && (
            <Section title="Effect">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">
                {card.effectText}
              </p>
            </Section>
          )}

          {/* Trigger text */}
          {card.triggerText && (
            <Section title="Trigger">
              <p className="text-sm text-content-secondary">
                {card.triggerText}
              </p>
            </Section>
          )}

          {/* Set membership */}
          {card.cardSets.length > 0 && (
            <Section title="Appears In">
              <div className="space-y-2">
                {card.cardSets.map((cs) => (
                  <div
                    key={cs.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="font-mono font-medium text-navy-900">
                      {cs.setLabel}
                    </span>
                    <span className="text-content-tertiary">—</span>
                    <span className="text-content-secondary">
                      {cs.setName}
                    </span>
                    {cs.isOrigin && (
                      <span className="rounded-full bg-gold-100 px-2 py-1 text-xs font-semibold text-gold-500">
                        Origin
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Edit link */}
          <div className="flex gap-3 pt-2">
            <Link
              href={`/admin/cards/${card.id}/edit`}
              className="rounded-md bg-navy-900 px-5 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
            >
              Edit Card
            </Link>
            <Link
              href="/admin/cards"
              className="rounded-md border border-border px-5 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
            >
              Back to Cards
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3 text-center">
      <div className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-content-primary">
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded bg-surface-3 px-3 py-1 text-xs font-medium text-content-secondary">
      {text}
    </span>
  );
}
