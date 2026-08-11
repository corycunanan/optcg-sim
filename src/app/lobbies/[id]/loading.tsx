import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the seat's live composition rather than its own box: a leader block
 * that flexes with the frame beside (or above) fixed identity and readiness
 * rows. Nothing here carries a minimum height, so the skeleton compresses
 * exactly where the real seat does and the loading state can never be the one
 * lobby view that scrolls.
 */
function SeatSkeleton() {
  return (
    <section className="grid min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 lg:flex lg:flex-col lg:gap-4">
      <div className="col-start-2 row-start-1 flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="aspect-card col-start-1 row-span-3 row-start-1 w-24 rounded-md lg:max-h-[16.75rem] lg:min-h-0 lg:w-auto lg:flex-1" />
      <div className="col-start-2 row-start-2 flex w-full flex-col gap-2 lg:w-48">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="col-start-2 row-start-3 h-10 w-40 shrink-0 justify-self-start rounded-md" />
    </section>
  );
}

export default function LobbyRoomLoading() {
  return (
    <div
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label="Loading lobby room"
      data-lobby-frame
    >
      <div className="shrink-0" aria-hidden="true">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:[@media(min-height:50rem)]:py-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-48 rounded-md" />
            <Skeleton className="h-12 w-32 rounded-md" />
          </div>
        </div>
      </div>

      <div
        className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden px-6 py-4 lg:[@media(min-height:50rem)]:gap-6 lg:[@media(min-height:50rem)]:py-8"
        aria-hidden="true"
        data-lobby-content
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:auto-rows-fr lg:grid-cols-2 lg:[@media(min-height:50rem)]:gap-6">
          <SeatSkeleton />
          <Skeleton className="min-h-0 w-full flex-1 rounded-lg" />
        </div>
      </div>

      <div
        className="border-border bg-surface-1 shrink-0 border-t"
        aria-hidden="true"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Skeleton className="h-10 w-48 rounded-full" />
          <Skeleton className="h-12 w-40 rounded-md" />
          <Skeleton className="size-10 rounded-md" />
        </div>
      </div>
      <span className="sr-only">Loading lobby room…</span>
    </div>
  );
}
