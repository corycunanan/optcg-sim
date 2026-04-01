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
        <Link
          href={`/admin/cards/${card.id}`}
          className="text-content-tertiary transition-colors hover:underline"
        >
          {card.id}
        </Link>
        <span className="text-content-tertiary">›</span>
        <span className="text-content-primary">Edit</span>
      </div>

      <h1 className="mb-8 font-display text-3xl font-bold tracking-tight text-content-primary">
        Edit: {card.name}
        <span className="ml-2 text-lg font-normal text-content-tertiary">
          ({card.id})
        </span>
      </h1>

      <CardEditForm card={card} />
    </div>
  );
}
