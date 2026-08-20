import { ChamferFrame } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
} from "@/components/ui/page-header";

export default function DecksLoading() {
  return (
    <div
      className="bg-background flex-1 overflow-y-auto"
      role="status"
      aria-busy="true"
      aria-label="Loading decks"
    >
      {/* The real header primitive, filled with skeletons. Hand-copying its
          classes here is what made the skeleton stream a navy band and then
          swap to the bannerless header on hydration. */}
      <PageHeader aria-hidden="true">
        <PageHeaderContent>
          <Skeleton className="bg-navy-700 h-8 w-40" />
          <Skeleton className="bg-navy-700 h-4 w-64" />
        </PageHeaderContent>
        <PageHeaderActions>
          <div className="h-10 w-24" />
          <div className="h-10 w-28" />
        </PageHeaderActions>
      </PageHeader>

      {/* Mirrors the row list: same chamfer, same surface step, same resting
          cast, same gap — so the rows do not visibly change altitude when the
          real list swaps in. Only the hover step is absent, since a skeleton
          has nothing to hover. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-8">
        {Array.from({ length: 6 }).map((_, index) => (
          <ChamferFrame
            key={index}
            cut="lg"
            shadow="sm"
            surfaceClassName="bg-surface-1 flex items-center gap-4 p-4"
            aria-hidden="true"
          >
            {/* The card silhouette keeps its radius; the rest stays square. */}
            <Skeleton className="aspect-card rounded-card w-14 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5 rounded-none" />
                <Skeleton className="h-3 w-1/4 rounded-none" />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-3 w-12 rounded-none" />
                <Skeleton className="h-3 w-20 rounded-none" />
                <Skeleton className="size-12" />
              </div>
            </div>
          </ChamferFrame>
        ))}
      </div>
      <span className="sr-only">Loading your decks…</span>
    </div>
  );
}
