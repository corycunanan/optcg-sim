import { Skeleton } from "@/components/ui/skeleton";

export default function LobbiesLoading() {
  return (
    <div
      className="bg-background flex-1 overflow-y-auto"
      role="status"
      aria-busy="true"
      aria-label="Loading lobbies"
    >
      <div className="bg-navy-900 w-full">
        <div className="mx-auto flex items-center justify-between gap-4 px-6 py-12">
          <div className="flex flex-col gap-2">
            <Skeleton className="bg-navy-700 h-8 w-24" />
            <Skeleton className="bg-navy-700 h-4 w-80 max-w-full" />
          </div>
          <div className="h-10 w-32" aria-hidden="true" />
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-10 md:grid-cols-[1fr_0.8fr]">
        <section
          className="border-border bg-card flex min-h-72 flex-col justify-between rounded-lg border p-6"
          aria-hidden="true"
        >
          <div className="space-y-5">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-8 w-40" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
          <div className="h-10 w-32" />
        </section>

        <section
          className="border-border bg-card min-h-72 rounded-lg border p-6"
          aria-hidden="true"
        >
          <Skeleton className="h-3 w-28" />
          <div className="mt-5 space-y-4">
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 min-w-0 flex-1" />
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
        </section>
      </div>
      <span className="sr-only">Loading the lobby browser…</span>
    </div>
  );
}
