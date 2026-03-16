import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const COLOR_BG: Record<string, string> = {
  Red: "bg-red-50 border-red-200",
  Blue: "bg-blue-50 border-blue-200",
  Green: "bg-green-50 border-green-200",
  Purple: "bg-purple-50 border-purple-200",
  Black: "bg-gray-100 border-gray-300",
  Yellow: "bg-yellow-50 border-yellow-200",
};

const COLOR_TEXT: Record<string, string> = {
  Red: "text-red-700",
  Blue: "text-blue-700",
  Green: "text-green-700",
  Purple: "text-purple-700",
  Black: "text-gray-700",
  Yellow: "text-yellow-700",
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

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/cards" className="hover:text-gray-700">
          Cards
        </Link>
        <span>›</span>
        <span className="text-gray-900">{card.id}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left: Card image */}
        <div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.name}
              className="w-full"
            />
          </div>

          {/* Art variants */}
          {card.artVariants.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Art Variants ({card.artVariants.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {card.artVariants.map((v) => (
                  <div
                    key={v.id}
                    className="overflow-hidden rounded-lg border border-gray-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.imageUrl}
                      alt={`${card.name} — ${v.label}`}
                      className="w-full"
                      loading="lazy"
                    />
                    <div className="p-1 text-center text-[10px] text-gray-500">
                      {v.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Card details */}
        <div className="space-y-4">
          {/* Header */}
          <div
            className={`rounded-xl border p-5 ${COLOR_BG[primaryColor] || "bg-gray-50 border-gray-200"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h1
                  className={`text-2xl font-bold ${COLOR_TEXT[primaryColor] || "text-gray-900"}`}
                >
                  {card.name}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {card.id} · {card.type} · {card.rarity}
                </p>
              </div>
              {card.banStatus !== "LEGAL" && (
                <span className="rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white">
                  {card.banStatus}
                </span>
              )}
            </div>

            {/* Colors */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.color.map((c) => (
                <span
                  key={c}
                  className={`rounded-full border px-3 py-0.5 text-xs font-medium ${COLOR_BG[c]} ${COLOR_TEXT[c]}`}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {card.effectText}
              </p>
            </Section>
          )}

          {/* Trigger text */}
          {card.triggerText && (
            <Section title="Trigger">
              <p className="text-sm text-gray-800">{card.triggerText}</p>
            </Section>
          )}

          {/* Set membership */}
          {card.cardSets.length > 0 && (
            <Section title="Appears In">
              <div className="space-y-1">
                {card.cardSets.map((cs) => (
                  <div key={cs.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-gray-600">
                      {cs.setLabel}
                    </span>
                    <span className="text-gray-400">—</span>
                    <span className="text-gray-700">{cs.setName}</span>
                    {cs.isOrigin && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        Origin
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Edit link */}
          <div className="pt-2">
            <Link
              href={`/admin/cards/${card.id}/edit`}
              className="inline-block rounded-lg bg-gray-800 px-5 py-2 text-sm font-medium text-white hover:bg-gray-900"
            >
              Edit Card
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold text-gray-900">{value}</div>
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
      {text}
    </span>
  );
}
