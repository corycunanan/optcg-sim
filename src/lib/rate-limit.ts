/**
 * Distributed rate limiting via @upstash/ratelimit (Redis-backed).
 *
 * Falls back to an in-memory limiter when UPSTASH_REDIS_REST_URL is not set
 * (local development).
 *
 * Usage:
 *   import { authLimiter, apiLimiter } from "@/lib/rate-limit";
 *   const { limited } = await authLimiter.check(identifier);
 *   if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Upstash Redis client (undefined when env vars are missing → local dev)
// ---------------------------------------------------------------------------
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// ---------------------------------------------------------------------------
// In-memory fallback for local development
// ---------------------------------------------------------------------------
interface Entry {
  count: number;
  start: number;
}

function createInMemoryLimiter(interval: number, limit: number) {
  const store = new Map<string, Entry>();

  function cleanup() {
    const cutoff = Date.now() - interval * 2;
    for (const [key, entry] of store) {
      if (entry.start < cutoff) store.delete(key);
    }
  }

  return {
    async check(identifier: string) {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || now - entry.start >= interval) {
        store.set(identifier, { count: 1, start: now });
        if (store.size > 10_000) cleanup();
        return { limited: false, remaining: limit - 1 };
      }

      entry.count += 1;
      if (entry.count > limit) {
        return { limited: true, remaining: 0 };
      }
      return { limited: false, remaining: limit - entry.count };
    },
  };
}

// ---------------------------------------------------------------------------
// Limiter factory
// ---------------------------------------------------------------------------
interface RateLimitResult {
  limited: boolean;
  remaining: number;
}

interface Limiter {
  check(identifier: string): Promise<RateLimitResult>;
}

function createLimiter(
  prefix: string,
  windowMs: number,
  limit: number,
): Limiter {
  if (!redis) {
    return createInMemoryLimiter(windowMs, limit);
  }

  const windowSec = Math.ceil(windowMs / 1000);
  // Use a combined "seconds + window" string for the duration
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    prefix: `ratelimit:${prefix}`,
  });

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const result = await rl.limit(identifier);
      return {
        limited: !result.success,
        remaining: result.remaining,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Pre-configured limiters
// ---------------------------------------------------------------------------

/** Auth endpoints (register, login) — 10 requests per 15 minutes. */
export const authLimiter = createLimiter("auth", 60_000 * 15, 10);

/** Social endpoints (friend requests, messages) — 30 requests per minute. */
export const socialLimiter = createLimiter("social", 60_000, 30);

/** Search / read-heavy endpoints — 60 requests per minute. */
export const searchLimiter = createLimiter("search", 60_000, 60);

/** General mutating endpoints (POST/PUT/DELETE) — 30 requests per minute. */
export const apiLimiter = createLimiter("api", 60_000, 30);
