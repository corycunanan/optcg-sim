"use client";

import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";

export default function DecksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[decks] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card
        className="w-full max-w-[400px]"
        surfaceClassName="text-center"
      >
        <CardHeader>
          <CardTitle className="text-xs font-semibold text-content-secondary tracking-widest">
            DECK BUILDER ERROR
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xl font-semibold text-red-600">
            Something went wrong
          </p>
          <p className="text-sm text-content-secondary leading-relaxed">
            The deck builder encountered an unexpected error. Your saved decks
            are not affected.
          </p>
          {error.message && (
            <p className="text-xs text-content-tertiary font-mono break-all">
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
                window.location.href = "/decks";
              }}
              className="w-full"
            >
              Return to Decks
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
