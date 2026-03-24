"use client";

import React from "react";

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
          <div className="max-w-[400px] w-full bg-gb-surface border border-gb-border-strong rounded-lg p-6 text-center mx-4">
            <p className="text-xs font-semibold text-gb-text-subtle tracking-widest mb-2">
              RENDERING ERROR
            </p>
            <p className="text-xl font-extrabold text-gb-accent-red mb-3">
              Something went wrong
            </p>
            <p className="text-sm text-gb-text leading-relaxed mb-4">
              The game board encountered an error. Your game is still running on
              the server — returning to lobbies will not forfeit the match.
            </p>
            {this.state.error && (
              <p className="text-xs text-gb-text-dim font-mono mb-4 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                window.location.href = "/lobbies";
              }}
              className="w-full py-3 px-4 rounded-md border-none bg-navy-800 text-gb-text-bright text-base font-bold cursor-pointer hover:bg-navy-700 transition-colors"
            >
              Return to Lobbies
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
