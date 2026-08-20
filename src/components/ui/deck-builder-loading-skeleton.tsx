import { Skeleton } from "./skeleton";

const searchCards = Array.from({ length: 9 });
const deckCards = Array.from({ length: 8 });

export function DeckBuilderLoadingSkeleton({ label }: { label: string }) {
  return (
    <div
      className="bg-background text-content-primary flex min-h-0 flex-1 flex-col overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div
        className="border-border bg-card flex items-center gap-4 border-b px-4 py-3"
        aria-hidden="true"
      >
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-48" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-8 w-16" />
          <div className="h-8 w-16" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1" aria-hidden="true">
        <div className="border-border flex w-[420px] shrink-0 flex-col overflow-hidden border-r">
          <div className="px-3 pt-3">
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2 px-3 py-2">
            <div className="flex gap-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-6 flex-1" />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
          <Skeleton className="mx-3 mb-1 h-3 w-24" />
          <div className="grid flex-1 grid-cols-3 gap-2 overflow-hidden px-3 pb-3">
            {searchCards.map((_, index) => (
              <div key={index} className="bg-card overflow-hidden rounded-md">
                <Skeleton className="aspect-card rounded-card w-full" />
                <div className="space-y-1 p-1">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-20" />
              ))}
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-16" />
              <div className="h-8 w-16" />
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-5">
            <div className="flex flex-wrap gap-4">
              {deckCards.map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex">
                    <Skeleton className="aspect-card rounded-card w-24 shrink-0" />
                    <Skeleton className="aspect-card rounded-card -ml-16 w-24 shrink-0" />
                    <Skeleton className="aspect-card rounded-card -ml-16 w-24 shrink-0" />
                  </div>
                  <Skeleton className="mx-auto h-5 w-16" />
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2">
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-6 w-40 rounded-md" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
