/**
 * POST /api/realtime/token — Mints a short-lived HS256 token for the user
 * channel. Passed to the worker as `?token=<jwt>` on WebSocket connect.
 *
 * Same shared secret as game tokens (`GAME_WORKER_SECRET`); same 5-minute
 * expiry; same anti-replay JTI semantics. The only difference is that the
 * payload carries no `gameId` claim — `sub` is the userId and that's it.
 */

import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { mintGameToken } from "@/lib/game/token";
import { apiLimiter } from "@/lib/rate-limit";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`realtime-token:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  if (!GAME_WORKER_SECRET) {
    return apiError("Realtime channel not configured", 503);
  }

  const expiresInSeconds = 300;
  const now = Math.floor(Date.now() / 1000);
  const token = await mintGameToken(userId, GAME_WORKER_SECRET, {
    now,
    expiresInSeconds,
  });

  return apiSuccess({ token, expiresAt: now + expiresInSeconds });
}
