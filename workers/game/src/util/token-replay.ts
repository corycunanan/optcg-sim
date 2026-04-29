export const CONSUMED_TOKEN_JTIS_STORAGE_KEY = "consumedTokenJtis";

export interface GameTokenJtiStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

export async function consumeGameTokenJti(
  storage: GameTokenJtiStorage,
  jti: string,
  expiresAt: number,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const consumed = pruneConsumedTokenJtis(
    await storage.get<Record<string, number>>(CONSUMED_TOKEN_JTIS_STORAGE_KEY) ?? {},
    now,
  );

  if (consumed[jti] !== undefined) {
    return false;
  }

  consumed[jti] = expiresAt;
  await storage.put(CONSUMED_TOKEN_JTIS_STORAGE_KEY, consumed);
  return true;
}

function pruneConsumedTokenJtis(
  consumed: Record<string, number>,
  now: number,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [jti, expiresAt] of Object.entries(consumed)) {
    if (expiresAt >= now) next[jti] = expiresAt;
  }
  return next;
}
