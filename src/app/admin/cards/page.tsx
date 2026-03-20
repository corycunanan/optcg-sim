import { prisma } from "@/lib/db";
import { CardBrowser } from "@/components/admin/card-browser";

export const dynamic = "force-dynamic";

export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = (params.q as string) || "";
  const color = (params.color as string) || "";
  const type = (params.type as string) || "";
  const set = (params.set as string) || "";
  const block = (params.block as string) || "";
  const originOnly = (params.originOnly as string) || "";
  const page = parseInt((params.page as string) || "1");
  const limit = 40;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }
  if (color) {
    where.color = { hasSome: color.split(",") };
  }
  if (type) {
    where.type = {
      in: type.split(",") as ("Leader" | "Character" | "Event" | "Stage")[],
    };
  }
  if (set) {
    const setLabels = set.split(",").filter(Boolean);
    if (setLabels.length > 0) {
      if (originOnly === "true") {
        where.originSet = setLabels.length === 1 ? setLabels[0] : { in: setLabels };
      } else {
        where.cardSets = { some: { setLabel: setLabels.length === 1 ? setLabels[0] : { in: setLabels } } };
      }
    }
  }
  if (originOnly === "true" && !set) {
    // When origin-only is active but no set filter,
    // filter out reprints
    where.isReprint = false;
  }
  if (block) {
    where.blockNumber = { in: block.split(",").map(Number) };
  }

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { artVariants: true } },
        cardSets: { where: { isOrigin: true }, take: 1 },
      },
    }),
    prisma.card.count({ where }),
  ]);

  // Get available sets for filter dropdown
  const sets = await prisma.cardSet.findMany({
    distinct: ["setLabel"],
    select: { setLabel: true, setName: true, packId: true },
    orderBy: { packId: "asc" },
  });

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <CardBrowser
        initialCards={cards}
        total={total}
        page={page}
        totalPages={totalPages}
        sets={sets}
        currentFilters={{ q, color, type, set, block, originOnly }}
      />
    </div>
  );
}
