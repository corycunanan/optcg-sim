import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
} from "@/components/ui/page-header";

export function CardBrowserLoading() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      role="status"
      aria-busy="true"
      aria-label="Loading cards"
    >
      {/* The real header primitive, filled with skeletons — copying its
          classes here is how the two drift apart. */}
      <PageHeader className="shrink-0" aria-hidden="true">
        <PageHeaderContent>
          <Skeleton className="bg-navy-700 h-8 w-48" />
          <Skeleton className="bg-navy-700 h-4 w-64" />
        </PageHeaderContent>
        <PageHeaderActions>
          <div className="h-10 w-32" />
          <div className="h-10 w-28" />
        </PageHeaderActions>
      </PageHeader>

      {/* Scrollable content area — mirrors the loaded browser's scroll container */}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-hidden="true">
        {/* Search bar */}
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-24" />
          </div>
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        </div>

        {/* Card grid */}
        <div className="mx-auto w-full max-w-7xl px-6 pb-8">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="bg-surface-1 overflow-hidden rounded-lg">
                <Skeleton className="aspect-card w-full rounded-none" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading cards…</span>
    </div>
  );
}
