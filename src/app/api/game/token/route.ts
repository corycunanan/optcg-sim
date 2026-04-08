/**
 * GET /api/game/token — Issues a short-lived HS256 game token for the caller.
 * Passed to the Cloudflare DO as ?token=<jwt> on WebSocket connect.
 *
 * We don't forward NextAuth's own JWE token to the worker because @auth/core
 * produces encrypted JWEs (A256CBC-HS512), which are non-trivial to verify in
 * a Cloudflare Worker. Instead we mint a simple HS256 token signed with
 * GAME_WORKER_SECRET — a shared secret both sides already have.
 */

import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  if (!GAME_WORKER_SECRET) {
    return apiError("Game server not configured", 503);
  }

  const token = await mintGameToken(userId, GAME_WORKER_SECRET);
  return apiSuccess({ token });
}

async function mintGameToken(userId: string, secret: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
  }));

  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(Buffer.from(sig).toString("base64"))}`;
}

function b64url(input: string): string {
  // input is either a plain string (JSON) or a base64 string from Buffer
  const base64 = input.includes("{") || input.includes(".")
    ? Buffer.from(input, "utf8").toString("base64")
    : input;
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
