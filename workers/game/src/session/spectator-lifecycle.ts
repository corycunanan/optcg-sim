import type { ServerMessage } from "../types.js";
import type { SessionParticipantIdentity } from "./authorization.js";
import { SessionFilteredState } from "./filtered-state.js";
import { SpectatorPolicy } from "./spectator-policy.js";
import {
  type SpectatorServerCloseIntent,
  SessionTransport,
} from "./transport.js";

type SpectatorIdentity = Extract<
  SessionParticipantIdentity,
  { role: "spectator" }
>;

/** Connect bootstrap, lifecycle events, and terminal close policy for spectators. */
export class SpectatorLifecycle {
  constructor(
    private readonly policy: SpectatorPolicy,
    private readonly transport: SessionTransport,
    private readonly filteredState: SessionFilteredState,
    private readonly syncAlarm: () => Promise<void>
  ) {}

  handleUpgrade(
    identity: SpectatorIdentity,
    admissionEnabled = false
  ): Promise<Response> {
    return this.policy.handleUpgrade(
      identity.userId,
      identity.expiresAt,
      identity.displayName,
      admissionEnabled,
      (ws) => this.handleConnected(identity, ws)
    );
  }

  handleClose(ws: WebSocket): boolean {
    const spectator = this.transport.spectatorAttachmentFor(ws);
    if (spectator === null) return false;
    if (spectator.closeIntent !== undefined) {
      if (shouldEmitEjection(spectator.closeIntent)) {
        this.emitLeft(spectator.userId, spectator.displayName, "EJECTED");
      }
      return true;
    }
    if (!this.transport.isAuthoritativeSpectator(ws, spectator.userId))
      return true;
    this.emitLeft(spectator.userId, spectator.displayName, "DEPARTED");
    return true;
  }

  async broadcastGameOver(
    message: Extract<ServerMessage, { type: "game:over" }>
  ): Promise<void> {
    this.transport.broadcast(message);
    this.transport.closeSpectatorsAtGameEnd();
    await this.syncAlarm();
  }

  private handleConnected(identity: SpectatorIdentity, ws: WebSocket): void {
    const snapshot = this.filteredState.buildStateSnapshot(null);
    this.transport.send(ws, snapshot);
    this.transport.broadcast({
      type: "game:spectator_joined",
      spectator: { id: identity.userId, displayName: identity.displayName },
    });
  }

  private emitLeft(
    userId: string,
    displayName: string | undefined,
    cause: "DEPARTED" | "EJECTED"
  ): void {
    this.transport.broadcast({
      type: "game:spectator_left",
      spectator: {
        id: userId,
        displayName: displayName ?? "Spectator",
      },
      cause,
    });
  }
}

function shouldEmitEjection(closeIntent: SpectatorServerCloseIntent): boolean {
  return (
    closeIntent === "RATE_LIMITED" ||
    closeIntent === "INVALID_IDENTITY" ||
    closeIntent === "MESSAGE_TOO_LARGE"
  );
}
