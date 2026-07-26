import { log } from "../lib/log.js";
import type { RateLimitDecision } from "./rate-limiter.js";
import { RATE_LIMIT_CLOSE_CODE, SessionRateLimiter } from "./rate-limiter.js";
import { SessionTransport } from "./transport.js";

export const SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON =
  "spectator message rate limit exceeded";
export const SPECTATOR_INVALID_SOCKET_CLOSE_REASON =
  "invalid spectator socket identity";
export const SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY =
  "Too many spectator connection attempts";

/** Owns spectator admission and receive-only enforcement ahead of player work. */
export class SpectatorPolicy {
  constructor(
    private readonly transport: SessionTransport,
    private readonly rateLimiter: SessionRateLimiter,
    private readonly gameId: () => string | undefined
  ) {}

  handleUpgrade(userId: string): Response {
    const budget = this.consumeUpgrade(userId);
    if (!budget.allowed) {
      return new Response(SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY, {
        status: 429,
        headers: { "Retry-After": String(budget.retryAfterSeconds) },
      });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.transport.acceptSpectator(userId, server);
    // OPT-552/557 own spectator delivery. Until both land, transport remains
    // deny-by-default and admission sends no initial payload.
    return new Response(null, { status: 101, webSocket: client });
  }

  playerIndexForInbound(ws: WebSocket): 0 | 1 | null {
    const playerIndex = this.transport.playerIndexFor(ws);
    const attachment = this.transport.spectatorAttachmentFor(ws);
    const taggedUserId = this.transport.spectatorIdFor(ws);

    if (playerIndex === null) {
      if (attachment === null && taggedUserId === null) return null;
      if (
        attachment === null ||
        taggedUserId === null ||
        attachment.userId !== taggedUserId
      ) {
        this.rejectInvalidIdentity(ws, attachment?.userId, taggedUserId);
        return null;
      }
      this.consumeMessage(ws, attachment.userId, attachment.connectionId);
      return null;
    }

    if (attachment !== null || taggedUserId !== null) {
      this.rejectInvalidIdentity(ws, attachment?.userId, taggedUserId);
      return null;
    }
    return playerIndex;
  }

  consumeUpgrade(userId: string): RateLimitDecision {
    const result = this.rateLimiter.consumeSpectatorUpgrade(
      this.gameId(),
      userId
    );
    if (!result.allowed) {
      log("ws.spectator_upgrade_rate_limited", {
        gameId: this.gameId(),
        userId,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    return result;
  }

  private consumeMessage(
    ws: WebSocket,
    userId: string,
    connectionId: string
  ): void {
    const result = this.rateLimiter.consumeSpectatorMessage(
      this.gameId(),
      connectionId
    );
    if (result.allowed) return;
    log("ws.spectator_message_rate_limited", {
      gameId: this.gameId(),
      userId,
      connectionId,
    });
    this.close(ws, SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON);
  }

  private rejectInvalidIdentity(
    ws: WebSocket,
    attachmentUserId: string | undefined,
    taggedUserId: string | null
  ): void {
    log("ws.spectator_identity_invalid", {
      gameId: this.gameId(),
      attachmentUserId,
      taggedUserId,
    });
    this.close(ws, SPECTATOR_INVALID_SOCKET_CLOSE_REASON);
  }

  private close(ws: WebSocket, reason: string): void {
    try {
      ws.close(RATE_LIMIT_CLOSE_CODE, reason);
    } catch {
      // Already closed.
    }
  }
}
