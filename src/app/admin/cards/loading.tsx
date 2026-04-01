import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCardsLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="-mx-6 -mt-8 mb-8 bg-surface-1 px-6 pb-6 pt-8">
        <div className="mb-4 flex items-baseline justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="mb-4 h-10 w-full" />
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <Skeleton className="h-16 w-64" />
            <Skeleton className="h-16 w-48" />
            <Skeleton className="h-16 w-32" />
            <Skeleton className="h-16 w-28" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg bg-surface-1">
            <Skeleton className="aspect-[600/838] w-full rounded-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
