"use client";

import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[game] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-gb-board">
      <Card className="max-w-[400px] w-full bg-gb-surface border-gb-border-strong text-center mx-4">
        <CardHeader>
          <CardTitle className="text-xs font-semibold text-gb-text-subtle tracking-widest">
            GAME ERROR
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xl font-extrabold text-gb-accent-red">
            Something went wrong
          </p>
          <p className="text-sm text-gb-text leading-relaxed">
            The game board encountered an error. Your game may still be running
            on the server — returning to lobbies will not forfeit the match.
          </p>
          {error.message && (
            <p className="text-xs text-gb-text-dim font-mono break-all">
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
              Return to Lobbies
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
