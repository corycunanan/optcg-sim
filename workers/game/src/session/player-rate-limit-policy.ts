import { log } from "../lib/log.js";
import { SessionRateLimiter, type RateLimitDecision } from "./rate-limiter.js";

export function consumePlayerUpgradeBudget(
  rateLimiter: SessionRateLimiter,
  gameId: string | undefined,
  playerIndex: 0 | 1
): RateLimitDecision {
  const result = rateLimiter.consumeUpgrade(gameId, playerIndex);
  if (!result.allowed) {
    log("ws.upgrade_rate_limited", {
      gameId,
      playerIndex,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return result;
}
