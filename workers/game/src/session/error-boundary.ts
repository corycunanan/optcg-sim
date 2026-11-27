/**
 * OPT-1063 error boundary for the game Durable Object.
 *
 * `ReportingGameSession` is the class the Worker exports under the
 * `GameSession` binding name. It reports any error that escapes the three
 * runtime entry points, then rethrows it, so the runtime's own behavior
 * (failed request, closed socket, alarm retry) is unchanged. Keeping it here
 * leaves `GameSession.ts` a composition root (see OPT-479).
 */

import { GameSession } from "../GameSession.js";
import { reportError } from "../lib/error-reporting.js";

type Handler = "fetch" | "webSocketMessage" | "alarm";

export class ReportingGameSession extends GameSession {
  async fetch(request: Request): Promise<Response> {
    try {
      return await super.fetch(request);
    } catch (error) {
      this.reportUnhandled(error, "fetch");
      throw error;
    }
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    try {
      await super.webSocketMessage(ws, message);
    } catch (error) {
      this.reportUnhandled(error, "webSocketMessage");
      throw error;
    }
  }

  async alarm(): Promise<void> {
    try {
      await super.alarm();
    } catch (error) {
      this.reportUnhandled(error, "alarm");
      throw error;
    }
  }

  private reportUnhandled(error: unknown, handler: Handler): void {
    reportError(error, {
      source: "worker.session",
      tags: { handler, gameId: this.loadedGameId },
    });
  }
}
