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
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/cards" className="hover:text-gray-700">
          Cards
        </Link>
        <span>›</span>
        <Link
          href={`/admin/cards/${card.id}`}
          className="hover:text-gray-700"
        >
          {card.id}
        </Link>
        <span>›</span>
        <span className="text-gray-900">Edit</span>
      </div>

      <h1 className="mb-6 text-2xl font-bold">
        Edit: {card.name}{" "}
        <span className="text-lg font-normal text-gray-400">({card.id})</span>
      </h1>

      <CardEditForm card={card} />
    </div>
  );
}
