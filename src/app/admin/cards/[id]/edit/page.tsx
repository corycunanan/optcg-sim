import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CardEditForm } from "@/components/admin/card-edit-form";

export const dynamic = "force-dynamic";

export default async function CardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
  });

  if (!card) notFound();

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
        <Link
          href={`/admin/cards/${card.id}`}
          className="transition-colors hover:underline"
          style={{ color: "var(--text-tertiary)" }}
        >
          {card.id}
        </Link>
        <span style={{ color: "var(--text-tertiary)" }}>›</span>
        <span style={{ color: "var(--text-primary)" }}>Edit</span>
      </div>

      <h1 className="mb-8 text-3xl font-bold tracking-tight">
        <span style={{ color: "var(--text-primary)" }}>Edit: {card.name}</span>
        <span
          className="ml-2 text-lg font-normal"
          style={{ color: "var(--text-tertiary)" }}
        >
          ({card.id})
        </span>
      </h1>

      <CardEditForm card={card} />
    </div>
  );
}
