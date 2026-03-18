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
  const accentColor = COLOR_ACCENT[primaryColor] || "var(--teal)";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href="/admin/cards"
          className="transition-colors hover:underline"
          style={{ color: "var(--text-tertiary)" }}
        >
          Cards
        </Link>
        <span style={{ color: "var(--text-tertiary)" }}>›</span>
        <span style={{ color: "var(--text-primary)" }}>{card.id}</span>
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
            className="rounded p-6"
            style={{
              background: "var(--surface-1)",
              borderLeft: `3px solid ${accentColor}`,
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h1
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {card.name}
                </h1>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {card.id} · {card.type} · {card.rarity}
                </p>
              </div>
              {card.banStatus !== "LEGAL" && (
                <span
                  className="rounded px-2.5 py-1 text-xs font-bold"
                  style={{ background: "var(--error)", color: "#fff" }}
                >
                  {card.banStatus}
                </span>
              )}
            </div>

            {/* Colors */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.color.map((c) => (
                <span
                  key={c}
                  className="rounded-full px-3 py-0.5 text-xs font-semibold"
                  style={{
                    background: COLOR_ACCENT[c] || "var(--surface-3)",
                    color: c === "Yellow" ? "#222" : "#fff",
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
              <div className="flex flex-wrap gap-1.5">
                {card.attribute.map((a) => (
                  <Tag key={a} text={a} />
                ))}
              </div>
            </Section>
          )}

          {/* Traits */}
          {card.traits.length > 0 && (
            <Section title="Traits">
              <div className="flex flex-wrap gap-1.5">
                {card.traits.map((t) => (
                  <Tag key={t} text={t} />
                ))}
              </div>
            </Section>
          )}

          {/* Effect text */}
          {card.effectText && (
            <Section title="Effect">
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {card.effectText}
              </p>
            </Section>
          )}

          {/* Trigger text */}
          {card.triggerText && (
            <Section title="Trigger">
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {card.triggerText}
              </p>
            </Section>
          )}

          {/* Set membership */}
          {card.cardSets.length > 0 && (
            <Section title="Appears In">
              <div className="space-y-1.5">
                {card.cardSets.map((cs) => (
                  <div
                    key={cs.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className="font-mono font-medium"
                      style={{ color: "var(--teal)" }}
                    >
                      {cs.setLabel}
                    </span>
                    <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {cs.setName}
                    </span>
                    {cs.isOrigin && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: "var(--sage-muted)",
                          color: "var(--sage)",
                        }}
                      >
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
              className="rounded px-5 py-2.5 text-sm font-semibold transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--surface-0)",
              }}
            >
              Edit Card
            </Link>
            <Link
              href="/admin/cards"
              className="rounded px-5 py-2.5 text-sm transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
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
    <div
      className="rounded p-3 text-center"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-lg font-bold tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
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
    <div
      className="rounded p-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <h3
        className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-tertiary)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span
      className="rounded px-2.5 py-1 text-xs font-medium"
      style={{
        background: "var(--surface-3)",
        color: "var(--text-secondary)",
      }}
    >
      {text}
    </span>
  );
}
