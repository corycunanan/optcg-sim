export const MAX_CLIENT_MESSAGE_BYTES = 8 * 1024;
export const ACTION_RATE_LIMIT_BURST = 24;
export const ACTION_RATE_LIMIT_REFILL_PER_SECOND = 8;
export const INVALID_MESSAGE_RATE_LIMIT_BURST = 6;
export const INVALID_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND = 1;
export const UPGRADE_RATE_LIMIT_BURST = 6;
export const UPGRADE_RATE_LIMIT_REFILL_PER_SECOND = 0.2;
export const SPECTATOR_MESSAGE_RATE_LIMIT_BURST = 24;
export const SPECTATOR_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND = 2;
export const RATE_LIMIT_CLOSE_CODE = 1008;
export const ACTION_RATE_LIMIT_CLOSE_REASON = "action rate limit exceeded";
export const INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON =
  "message rate limit exceeded";
export const UPGRADE_RATE_LIMIT_RESPONSE_BODY = "Too many reconnect attempts";

export interface TokenBucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface StatefulRateLimitDecision extends RateLimitDecision {
  bucket: TokenBucket;
}

export function getClientMessageByteLength(
  message: string | ArrayBuffer
): number {
  if (typeof message !== "string") return message.byteLength;
  return new TextEncoder().encode(message).byteLength;
}

export function consumeTokenBucket(
  bucket: TokenBucket | undefined,
  now: number,
  capacity: number,
  refillPerSecond: number
): { allowed: boolean; bucket: TokenBucket } {
  const current = bucket ?? { tokens: capacity, updatedAt: now };
  const elapsedSeconds = Math.max(0, now - current.updatedAt) / 1000;
  const tokens = Math.min(
    capacity,
    current.tokens + elapsedSeconds * refillPerSecond
  );
  if (tokens < 1) {
    return { allowed: false, bucket: { tokens, updatedAt: now } };
  }
  return { allowed: true, bucket: { tokens: tokens - 1, updatedAt: now } };
}

export function getTokenBucketRetryAfterSeconds(
  bucket: TokenBucket,
  capacity: number,
  refillPerSecond: number
): number {
  if (bucket.tokens >= 1) return 0;
  if (refillPerSecond <= 0) return 1;
  return Math.max(
    1,
    Math.ceil((1 - Math.min(capacity, bucket.tokens)) / refillPerSecond)
  );
}

/**
 * Owns independent player and spectator abuse-control buckets for a game session.
 * Transport code decides how to report a rejected decision; this adapter only
 * tracks budgets and retry timing.
 */
export class SessionRateLimiter {
  private readonly actionBuckets = new Map<string, TokenBucket>();
  private readonly invalidMessageBuckets = new Map<string, TokenBucket>();
  private readonly upgradeBuckets = new Map<string, TokenBucket>();

  constructor(private readonly now: () => number = Date.now) {}

  consumeAction(
    gameId: string | undefined,
    playerIndex: 0 | 1
  ): RateLimitDecision {
    return this.consume(
      this.actionBuckets,
      gameId,
      playerIndex,
      ACTION_RATE_LIMIT_BURST,
      ACTION_RATE_LIMIT_REFILL_PER_SECOND
    );
  }

  consumeInvalidMessage(
    gameId: string | undefined,
    playerIndex: 0 | 1
  ): RateLimitDecision {
    return this.consume(
      this.invalidMessageBuckets,
      gameId,
      playerIndex,
      INVALID_MESSAGE_RATE_LIMIT_BURST,
      INVALID_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND
    );
  }

  consumeUpgrade(
    gameId: string | undefined,
    playerIndex: 0 | 1
  ): RateLimitDecision {
    return this.consume(
      this.upgradeBuckets,
      gameId,
      playerIndex,
      UPGRADE_RATE_LIMIT_BURST,
      UPGRADE_RATE_LIMIT_REFILL_PER_SECOND
    );
  }

  consumeSpectatorUpgrade(
    bucket: TokenBucket | undefined
  ): StatefulRateLimitDecision {
    return this.consumeBucket(
      bucket,
      UPGRADE_RATE_LIMIT_BURST,
      UPGRADE_RATE_LIMIT_REFILL_PER_SECOND
    );
  }

  consumeSpectatorMessage(
    bucket: TokenBucket | undefined
  ): StatefulRateLimitDecision {
    return this.consumeBucket(
      bucket,
      SPECTATOR_MESSAGE_RATE_LIMIT_BURST,
      SPECTATOR_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND
    );
  }

  private consume(
    buckets: Map<string, TokenBucket>,
    gameId: string | undefined,
    playerIndex: 0 | 1,
    capacity: number,
    refillPerSecond: number
  ): RateLimitDecision {
    const key = `${gameId ?? "unknown"}:${playerIndex}`;
    return this.consumeForKey(buckets, key, capacity, refillPerSecond);
  }

  private consumeForKey(
    buckets: Map<string, TokenBucket>,
    key: string,
    capacity: number,
    refillPerSecond: number
  ): RateLimitDecision {
    const result = consumeTokenBucket(
      buckets.get(key),
      this.now(),
      capacity,
      refillPerSecond
    );
    buckets.set(key, result.bucket);
    return this.toDecision(result, capacity, refillPerSecond);
  }

  private consumeBucket(
    bucket: TokenBucket | undefined,
    capacity: number,
    refillPerSecond: number
  ): StatefulRateLimitDecision {
    const result = consumeTokenBucket(
      bucket,
      this.now(),
      capacity,
      refillPerSecond
    );
    return {
      ...this.toDecision(result, capacity, refillPerSecond),
      bucket: result.bucket,
    };
  }

  private toDecision(
    result: { allowed: boolean; bucket: TokenBucket },
    capacity: number,
    refillPerSecond: number
  ): RateLimitDecision {
    return {
      allowed: result.allowed,
      retryAfterSeconds: result.allowed
        ? 0
        : getTokenBucketRetryAfterSeconds(
            result.bucket,
            capacity,
            refillPerSecond
          ),
    };
  }
}
