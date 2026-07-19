import { Skeleton } from "@/components/ui/skeleton";

export default function DecksLoading() {
  return (
    <div
      className="bg-background flex-1 overflow-y-auto"
      role="status"
      aria-busy="true"
      aria-label="Loading decks"
    >
      <div className="bg-navy-900 w-full">
        <div className="mx-auto flex items-center justify-between gap-4 px-6 py-12">
          <div className="flex flex-col gap-2">
            <Skeleton className="bg-navy-700 h-8 w-40" />
            <Skeleton className="bg-navy-700 h-4 w-64" />
          </div>
          <div className="h-10 w-28" aria-hidden="true" />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-6 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="border-border bg-card overflow-hidden rounded border"
            aria-hidden="true"
          >
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-3 w-3 rounded-full" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your decks…</span>
    </div>
  );
}
