import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
} from "@/components/ui/page-header";

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
      <Skeleton className="aspect-card rounded-card col-start-1 row-span-3 row-start-1 w-24 lg:max-h-[16.75rem] lg:min-h-0 lg:w-auto lg:flex-1" />
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
      {/* The real header primitive on the live room's exact override: top
          padding only, at the live room's height gates and stacking point. A
          hand-rolled `py-*` here paid the gap twice and spent 16-32px more of
          a frame that is never allowed to scroll. */}
      <PageHeader
        className="shrink-0 flex-col items-start gap-3 pt-4 sm:flex-col sm:items-start lg:flex-row lg:items-center lg:gap-6 lg:[@media(min-height:50rem)]:pt-8"
        aria-hidden="true"
        data-lobby-header
      >
        <PageHeaderContent className="w-full gap-1 lg:w-auto">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
        </PageHeaderContent>
        <PageHeaderActions className="w-full gap-3 lg:w-auto lg:justify-end">
          <Skeleton className="h-12 w-48 rounded-md" />
          <Skeleton className="h-12 w-32 rounded-md" />
        </PageHeaderActions>
      </PageHeader>

      {/* Top padding matches the header's at every gate, exactly as the live
          room's well does. */}
      <div
        className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden px-6 pt-4 pb-3 lg:pb-4 lg:[@media(min-height:50rem)]:gap-6 lg:[@media(min-height:50rem)]:pt-8 lg:[@media(min-height:50rem)]:pb-8"
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
          <Skeleton className="h-10 w-48 rounded-md" />
          <Skeleton className="h-12 w-40 rounded-md" />
          <Skeleton className="size-10 rounded-md" />
        </div>
      </div>
      <span className="sr-only">Loading lobby room…</span>
    </div>
  );
}
