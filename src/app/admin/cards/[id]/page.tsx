import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardImageGallery } from "@/components/cards/card-image-gallery";
import { ColorChip } from "@/components/cards/color-chip";

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
  const accentColor = COLOR_ACCENT[primaryColor] || "var(--card-accent-fallback)";

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
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
          baseRarity={card.rarity}
          artVariants={card.artVariants}
        />

        {/* Right: Card details */}
        <div className="space-y-4">
          {/* Header */}
          <div
            className="rounded-lg bg-card p-6"
            style={{ borderLeft: `3px solid ${accentColor}` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display text-3xl text-content-primary">
                  {card.name}
                </h1>
                <p className="mt-1 text-sm text-content-tertiary">
                  {card.id} · {card.type} · {card.rarity}
                </p>
              </div>
              {card.banStatus !== "LEGAL" && (
                <Badge variant="error" className="font-semibold">
                  {card.banStatus}
                </Badge>
              )}
            </div>

            {/* Colors */}
            <div className="mt-3 flex flex-wrap gap-2">
              {card.color.map((c) => (
                <ColorChip key={c} color={c} />
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
              <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">
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
                    <span className="font-mono font-semibold text-content-primary">
                      {cs.setLabel}
                    </span>
                    <span className="text-content-tertiary">—</span>
                    <span className="text-content-secondary">
                      {cs.setName}
                    </span>
                    {cs.isOrigin && (
                      <Badge variant="warning" className="rounded">
                        Origin
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Edit link */}
          <div className="flex gap-3 pt-2">
            <Button asChild>
              <Link href={`/admin/cards/${card.id}/edit`}>
                Edit Card
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/cards">
                Back to Cards
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="text-sm font-semibold uppercase tracking-widest text-content-tertiary">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-content-primary">
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
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-content-tertiary">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return <Badge variant="secondary">{text}</Badge>;
}
