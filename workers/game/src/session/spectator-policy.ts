import { log } from "../lib/log.js";
import type { RateLimitDecision, TokenBucket } from "./rate-limiter.js";
import {
  RATE_LIMIT_CLOSE_CODE,
  SessionRateLimiter,
  UPGRADE_RATE_LIMIT_BURST,
  UPGRADE_RATE_LIMIT_REFILL_PER_SECOND,
} from "./rate-limiter.js";
import {
  SessionTransport,
  type SpectatorSocketAttachment,
} from "./transport.js";

export const SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON =
  "spectator message rate limit exceeded";
export const SPECTATOR_INVALID_SOCKET_CLOSE_REASON =
  "invalid spectator socket identity";
export const SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY =
  "Too many spectator connection attempts";
export const SPECTATOR_UPGRADE_BUDGET_STORAGE_KEY =
  "spectator:upgrade-budgets";

export interface SpectatorBudgetStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

/** Owns spectator admission and receive-only enforcement ahead of player work. */
export class SpectatorPolicy {
  private upgradeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: SessionTransport,
    private readonly rateLimiter: SessionRateLimiter,
    private readonly storage: SpectatorBudgetStorage,
    private readonly gameId: () => string | undefined
  ) {}

  async handleUpgrade(
    userId: string,
    expiresAt: number,
    admissionEnabled = true,
    onAccepted?: (ws: WebSocket) => void
  ): Promise<Response> {
    if (!admissionEnabled) return new Response("Unauthorized", { status: 401 });
    const budget = await this.consumeUpgrade(userId);
    if (!budget.allowed) {
      return new Response(SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY, {
        status: 429,
        headers: { "Retry-After": String(budget.retryAfterSeconds) },
      });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const accepted = this.transport.acceptSpectator(userId, server, expiresAt);
    if (accepted) onAccepted?.(server);
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
      this.consumeMessage(ws, attachment);
      return null;
    }

    if (attachment !== null || taggedUserId !== null) {
      this.rejectInvalidIdentity(ws, attachment?.userId, taggedUserId);
      return null;
    }
    return playerIndex;
  }

  consumeUpgrade(userId: string): Promise<RateLimitDecision> {
    const pending = this.upgradeTail.then(() =>
      this.consumeUpgradeFromStorage(userId)
    );
    this.upgradeTail = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  }

  private async consumeUpgradeFromStorage(
    userId: string
  ): Promise<RateLimitDecision> {
    const stored = await this.storage.get<unknown>(
      SPECTATOR_UPGRADE_BUDGET_STORAGE_KEY
    );
    const buckets = readUpgradeBuckets(stored);
    const result = this.rateLimiter.consumeSpectatorUpgrade(buckets[userId]);
    const fullyRefilledBefore =
      result.bucket.updatedAt -
      (UPGRADE_RATE_LIMIT_BURST / UPGRADE_RATE_LIMIT_REFILL_PER_SECOND) * 1000;
    for (const [storedUserId, bucket] of Object.entries(buckets)) {
      if (bucket.updatedAt <= fullyRefilledBefore) delete buckets[storedUserId];
    }
    buckets[userId] = result.bucket;
    await this.storage.put(SPECTATOR_UPGRADE_BUDGET_STORAGE_KEY, buckets);

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
    attachment: SpectatorSocketAttachment
  ): void {
    const result = this.rateLimiter.consumeSpectatorMessage(
      attachment.messageBudget
    );
    if (
      !this.transport.updateSpectatorMessageBudget(
        ws,
        attachment,
        result.bucket
      )
    ) {
      this.rejectInvalidIdentity(ws, attachment.userId, attachment.userId);
      return;
    }
    if (result.allowed) return;
    log("ws.spectator_message_rate_limited", {
      gameId: this.gameId(),
      userId: attachment.userId,
      connectionId: attachment.connectionId,
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

function readUpgradeBuckets(value: unknown): Record<string, TokenBucket> {
  const buckets = Object.create(null) as Record<string, TokenBucket>;
  if (value === null || typeof value !== "object") return buckets;
  for (const [userId, bucket] of Object.entries(value)) {
    if (isTokenBucket(bucket)) buckets[userId] = bucket;
  }
  return buckets;
}

function isTokenBucket(value: unknown): value is TokenBucket {
  if (value === null || typeof value !== "object") return false;
  return (
    "tokens" in value &&
    typeof value.tokens === "number" &&
    Number.isFinite(value.tokens) &&
    value.tokens >= 0 &&
    "updatedAt" in value &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}
