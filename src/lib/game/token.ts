export type GameTokenOptions = {
  now?: number;
  expiresInSeconds?: number;
  gameId?: string;
  jti?: string;
};

export async function mintGameToken(
  userId: string,
  secret: string,
  options: GameTokenOptions = {},
): Promise<string> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const jti = options.jti ?? crypto.randomUUID();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + (options.expiresInSeconds ?? 300), // 5 minutes by default
    jti,
    ...(options.gameId ? { gameId: options.gameId } : {}),
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
