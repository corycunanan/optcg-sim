/**
 * Constant-time check of an `Authorization: Bearer <secret>` header.
 *
 * Used by every server-to-server route that authenticates with a shared secret
 * (GAME_WORKER_SECRET, CRON_SECRET) in both the Next.js app and the game
 * worker. A plain `!==` returns at the first differing byte, which can leak
 * how much of a guessed secret is right through response timing.
 *
 * Runtime-neutral: only `TextEncoder`, available in Node and Workers.
 */

const encoder = new TextEncoder();

/**
 * Compares two strings in time that depends only on their lengths, never on
 * where they first differ. Unequal lengths still walk the longer input.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/**
 * True when `header` is exactly `Bearer <secret>`. An empty or missing secret
 * never authorizes, so a misconfigured deployment fails closed.
 */
export function isAuthorizedBearer(
  header: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!secret) return false;
  return timingSafeEqualStrings(header ?? "", `Bearer ${secret}`);
}
