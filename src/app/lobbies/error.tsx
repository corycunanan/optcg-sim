"use client";

import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";

export default function LobbiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[lobbies] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-[400px] w-full text-center">
        <CardHeader>
          <CardTitle className="text-xs font-semibold text-text-secondary tracking-widest">
            LOBBY ERROR
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xl font-extrabold text-red-600">
            Something went wrong
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            The lobby page encountered an unexpected error. Please try again.
          </p>
          {error.message && (
            <p className="text-xs text-text-tertiary font-mono break-all">
              {error.message}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Button onClick={reset} className="w-full">
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/lobbies";
              }}
              className="w-full"
            >
              Reload Lobbies
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
