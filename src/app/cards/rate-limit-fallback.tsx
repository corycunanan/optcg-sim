import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function CardBrowseRateLimitFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 items-start px-6 py-8">
      <Alert variant="warning">
        <AlertTitle>Card browser paused</AlertTitle>
        <AlertDescription>
          This connection has made too many card browser requests. Wait a
          minute, then refresh the page to keep browsing with your current
          filters.
        </AlertDescription>
      </Alert>
    </div>
  );
}
