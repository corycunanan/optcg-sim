"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { GameButton } from "./game-button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GameErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-gb-board">
          <Card className="max-w-[400px] w-full bg-gb-surface border-gb-border-strong text-center mx-4">
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-gb-text-subtle tracking-widest">
                RENDERING ERROR
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xl font-extrabold text-gb-accent-red">
                Something went wrong
              </p>
              <p className="text-sm text-gb-text leading-relaxed">
                The game board encountered an error. Your game is still running on
                the server — returning to lobbies will not forfeit the match.
              </p>
              {this.state.error && (
                <p className="text-xs text-gb-text-dim font-mono break-all">
                  {this.state.error.message}
                </p>
              )}
              <GameButton
                variant="primary"
                size="lg"
                onClick={() => {
                  window.location.href = "/lobbies";
                }}
                className="w-full"
              >
                Return to Lobbies
              </GameButton>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
