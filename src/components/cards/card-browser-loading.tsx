import { Skeleton } from "@/components/ui/skeleton";

export function CardBrowserLoading() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      role="status"
      aria-busy="true"
      aria-label="Loading cards"
    >
      {/* Header band — mirrors PageHeader's full-bleed band and inner container */}
      <div
        className="border-border-strong bg-navy-900 w-full shrink-0 border-b"
        aria-hidden="true"
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-12">
          <div className="flex flex-col gap-2">
            <Skeleton className="bg-navy-700 h-8 w-48" />
            <Skeleton className="bg-navy-700 h-4 w-64" />
          </div>
          <div className="h-10 w-28" />
        </div>
      </div>

      {/* Scrollable content area — mirrors the loaded browser's scroll container */}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-hidden="true">
        {/* Search bar */}
        <div className="mx-auto w-full max-w-7xl px-6 py-6">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-24" />
          </div>
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        </div>

        {/* Card grid */}
        <div className="mx-auto w-full max-w-7xl px-6 pb-6">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
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
