/**
 * HS256 token verification.
 *
 * Both kinds of token are signed with the same shared secret (the worker's
 * `GAME_WORKER_SECRET`). Game tokens carry a `gameId` claim and are scoped
 * to a single GameSession DO. User tokens have no `gameId` and are used for
 * the per-user UserChannel DO.
 *
 * NextAuth's own JWE token uses A256CBC-HS512 encryption and would be
 * non-trivial to verify in a Cloudflare Worker, so the app mints these
 * lightweight HS256 tokens as a sidecar.
 */

export interface VerifiedGameToken {
  sub: string;
  iat: number;
  exp: number;
  gameId: string;
  jti: string;
  playerIndex?: 0 | 1;
  role?: "spectator";
}

export interface VerifiedUserToken {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

interface RawTokenPayload {
  sub: unknown;
  iat: unknown;
  exp: unknown;
  jti: unknown;
  gameId?: unknown;
  playerIndex?: unknown;
  role?: unknown;
}

async function verifySignatureAndDecode(
  token: string,
  secret: string,
): Promise<RawTokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signature = base64urlDecode(signatureB64);
    const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(signingInput));
    if (!valid) return null;

    return JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as RawTokenPayload;
  } catch {
    return null;
  }
}

function isExpired(exp: number, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  // RFC 7519 §4.1.4: `exp` is exclusive — reject as soon as `now >= exp`.
  return exp <= nowSeconds;
}

export async function verifyGameToken(
  token: string,
  secret: string,
  expectedGameId?: string,
): Promise<VerifiedGameToken | null> {
  const payload = await verifySignatureAndDecode(token, secret);
  if (!payload) return null;

  if (typeof payload.sub !== "string") return null;
  if (typeof payload.iat !== "number") return null;
  if (typeof payload.exp !== "number") return null;
  if (typeof payload.gameId !== "string") return null;
  if (typeof payload.jti !== "string") return null;
  if (
    payload.playerIndex !== undefined &&
    payload.playerIndex !== 0 &&
    payload.playerIndex !== 1
  ) {
    return null;
  }
  if (payload.role !== undefined && payload.role !== "spectator") return null;
  if (isExpired(payload.exp)) return null;
  if (expectedGameId && payload.gameId !== expectedGameId) return null;

  return {
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
    gameId: payload.gameId,
    jti: payload.jti,
    ...(payload.playerIndex !== undefined ? { playerIndex: payload.playerIndex } : {}),
    ...(payload.role === "spectator" ? { role: payload.role } : {}),
  };
}

/**
 * Verify a user-channel token. Same shared secret as game tokens, but no
 * `gameId` claim is required. A token that *also* carries `gameId` is
 * rejected — it would be a misrouted game token, and minting endpoints
 * should produce one or the other shape, not both.
 */
export async function verifyUserToken(
  token: string,
  secret: string,
): Promise<VerifiedUserToken | null> {
  const payload = await verifySignatureAndDecode(token, secret);
  if (!payload) return null;

  if (typeof payload.sub !== "string") return null;
  if (typeof payload.iat !== "number") return null;
  if (typeof payload.exp !== "number") return null;
  if (typeof payload.jti !== "string") return null;
  if (payload.gameId !== undefined) return null;
  if (isExpired(payload.exp)) return null;

  return {
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
    jti: payload.jti,
  };
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
