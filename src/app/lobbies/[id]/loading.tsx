import { Skeleton } from "@/components/ui/skeleton";

function SeatSkeleton() {
  return (
    <section className="border-border bg-card flex min-h-[480px] flex-col gap-5 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="min-h-72 w-full flex-1 rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="h-10 w-full" />
      </div>
    </section>
  );
}

export default function LobbyRoomLoading() {
  return (
    <div
      className="bg-background flex-1 overflow-y-auto"
      role="status"
      aria-busy="true"
      aria-label="Loading lobby room"
    >
      <div className="bg-navy-900 w-full" aria-hidden="true">
        <div className="mx-auto flex items-center justify-between gap-4 px-6 py-12">
          <div className="flex flex-col gap-2">
            <Skeleton className="bg-navy-700 h-8 w-40" />
            <Skeleton className="bg-navy-700 h-4 w-80 max-w-full" />
          </div>
          <div className="h-10 w-48" />
        </div>
      </div>

      <div
        className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8"
        aria-hidden="true"
      >
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <SeatSkeleton />
          <div className="flex items-center justify-center">
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <SeatSkeleton />
        </div>
      </div>
      <span className="sr-only">Loading lobby room…</span>
    </div>
  );
}
