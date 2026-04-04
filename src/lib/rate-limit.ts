/**
 * In-memory sliding window rate limiter for Next.js API routes.
 *
 * Usage:
 *   const limiter = createRateLimiter({ interval: 60_000, limit: 10 });
 *   // In route handler:
 *   const { limited } = limiter.check(identifier);
 *   if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 *
 * Notes:
 * - Memory is per-instance and resets on cold start — acceptable for Vercel
 *   serverless. For persistent limits, swap to @upstash/ratelimit.
 * - Stale entries are cleaned up lazily on each check() call.
 */

interface RateLimiterConfig {
  /** Window size in milliseconds. */
  interval: number;
  /** Max requests per window. */
  limit: number;
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  reset: number;
}

interface Entry {
  count: number;
  start: number;
}

export function createRateLimiter(config: RateLimiterConfig) {
  const { interval, limit } = config;
  const store = new Map<string, Entry>();

  // Lazy cleanup: remove entries older than 2x the interval
  function cleanup() {
    const cutoff = Date.now() - interval * 2;
    for (const [key, entry] of store) {
      if (entry.start < cutoff) store.delete(key);
    }
  }

  function check(identifier: string): RateLimitResult {
    const now = Date.now();
    const entry = store.get(identifier);

    // New window or expired window
    if (!entry || now - entry.start >= interval) {
      store.set(identifier, { count: 1, start: now });
      if (store.size > 10_000) cleanup();
      return { limited: false, remaining: limit - 1, reset: now + interval };
    }

    // Within current window
    entry.count += 1;
    const reset = entry.start + interval;

    if (entry.count > limit) {
      return { limited: true, remaining: 0, reset };
    }

    return { limited: false, remaining: limit - entry.count, reset };
  }

  return { check };
}

/**
 * Pre-configured rate limiters for different endpoint categories.
 */
export const authLimiter = createRateLimiter({
  interval: 60_000 * 15, // 15 minutes
  limit: 10,             // 10 attempts per 15 minutes
});

export const socialLimiter = createRateLimiter({
  interval: 60_000,      // 1 minute
  limit: 30,             // 30 requests per minute
});

export const searchLimiter = createRateLimiter({
  interval: 60_000,      // 1 minute
  limit: 60,             // 60 searches per minute
});
