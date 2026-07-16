import { Skeleton } from "@/components/ui/skeleton";

const fieldSlots = Array.from({ length: 7 });

function FieldRow() {
  return (
    <div className="flex items-center justify-center gap-4" aria-hidden="true">
      {fieldSlots.map((_, index) => (
        <Skeleton
          key={index}
          className="aspect-card bg-gb-surface-raised w-12 rounded sm:w-16"
        />
      ))}
    </div>
  );
}

export default function GameLoading() {
  return (
    <div
      className="bg-gb-board relative h-full w-full overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label="Loading game"
    >
      <div
        className="bg-gb-navbar flex h-12 items-center justify-between px-4"
        aria-hidden="true"
      >
        <Skeleton className="bg-gb-surface-raised h-3 w-24" />
        <div className="flex items-center gap-2">
          <Skeleton className="bg-gb-surface-raised h-3 w-12" />
          <Skeleton className="bg-gb-surface-raised h-2 w-2 rounded-full" />
          <Skeleton className="bg-gb-surface-raised h-3 w-24" />
        </div>
        <Skeleton className="bg-gb-surface-raised h-3 w-20" />
      </div>

      <div className="mx-auto flex h-[calc(100%-3rem)] max-w-5xl flex-col justify-between gap-4 overflow-hidden px-6 py-4">
        <div className="flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton
              key={index}
              className="aspect-card bg-gb-surface-raised w-10 rounded sm:w-12"
            />
          ))}
        </div>

        <div className="space-y-4">
          <FieldRow />
          <div className="border-gb-border-subtle bg-gb-board-dark h-8 border-y" />
          <FieldRow />
        </div>

        <div className="flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton
              key={index}
              className="aspect-card bg-gb-surface-raised w-10 rounded sm:w-12"
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading the game board…</span>
    </div>
  );
}
