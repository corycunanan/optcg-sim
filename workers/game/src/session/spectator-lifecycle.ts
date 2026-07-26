import {
  computeEffectAvailability,
  effectAvailabilityForRecipient,
} from "../engine/availability.js";
import type { CardData, GameState, ServerMessage } from "../types.js";
import type { SessionParticipantIdentity } from "./authorization.js";
import { SpectatorPolicy } from "./spectator-policy.js";
import {
  SPECTATOR_GAME_ENDED_CLOSE_CODE,
  SPECTATOR_GAME_ENDED_CLOSE_REASON,
  SPECTATOR_LEASE_EXPIRED_CLOSE_REASON,
  SPECTATOR_REVOKED_CLOSE_CODE,
  SPECTATOR_REVOKED_CLOSE_REASON,
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
    private readonly readState: () => GameState,
    private readonly readCardDb: () => Map<string, CardData>
  ) {}

  handleUpgrade(
    identity: SpectatorIdentity,
    admissionEnabled = true
  ): Promise<Response> {
    return this.policy.handleUpgrade(
      identity.userId,
      identity.expiresAt,
      admissionEnabled,
      (ws) => this.handleConnected(identity, ws)
    );
  }

  handleClose(ws: WebSocket, code: number, reason: string): boolean {
    const spectator = this.transport.spectatorAttachmentFor(ws);
    if (spectator === null) return false;
    if (!this.transport.isAuthoritativeSpectator(ws, spectator.userId))
      return true;
    if (isSilentClose(code, reason)) return true;
    this.transport.broadcast({
      type: "game:spectator_left",
      spectator: {
        id: spectator.userId,
        displayName: spectator.displayName ?? spectator.userId,
      },
    });
    return true;
  }

  broadcastGameOver(
    message: Extract<ServerMessage, { type: "game:over" }>
  ): void {
    this.transport.broadcast(message);
    this.transport.closeSpectatorsAtGameEnd();
  }

  private handleConnected(identity: SpectatorIdentity, ws: WebSocket): void {
    const state = this.readState();
    const cardDb = this.readCardDb();
    const availability = computeEffectAvailability(state, cardDb);
    const snapshot = this.transport.buildFilteredStateForRecipient(
      state,
      cardDb,
      null,
      (filteredState, recipientPlayerIndex) => ({
        type: "game:state",
        state: {
          ...filteredState,
          effectAvailability: effectAvailabilityForRecipient(
            state,
            availability,
            recipientPlayerIndex
          ),
        },
      })
    );
    this.transport.send(ws, snapshot);
    this.transport.broadcast({
      type: "game:spectator_joined",
      spectator: { id: identity.userId, displayName: identity.userId },
    });
  }
}

function isSilentClose(code: number, reason: string): boolean {
  return (
    (code === SPECTATOR_REVOKED_CLOSE_CODE &&
      (reason === SPECTATOR_REVOKED_CLOSE_REASON ||
        reason === SPECTATOR_LEASE_EXPIRED_CLOSE_REASON)) ||
    (code === SPECTATOR_GAME_ENDED_CLOSE_CODE &&
      reason === SPECTATOR_GAME_ENDED_CLOSE_REASON)
  );
}
