export function inviteRemainingMs(expiresAt: string, now: number): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) return 0;
  return Math.max(0, expiresAtMs - now);
}

export function resolveInviteSeatTiming(
  expiresAt: string,
  now: number
): { kind: "invited"; remainingMs: number } | { kind: "expired" } {
  const remainingMs = inviteRemainingMs(expiresAt, now);
  return remainingMs > 0
    ? { kind: "invited", remainingMs }
    : { kind: "expired" };
}

export function formatInviteCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
