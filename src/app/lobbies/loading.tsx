import { Skeleton } from "@/components/ui/skeleton";

export default function LobbiesLoading() {
  return (
    <div
      className="bg-background flex flex-1 items-center justify-center"
      role="status"
      aria-busy="true"
      aria-label="Finding your party"
    >
      <div className="flex w-full max-w-xl flex-col gap-3 px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
      </div>
      <span className="sr-only">Finding your party…</span>
    </div>
  );
}
