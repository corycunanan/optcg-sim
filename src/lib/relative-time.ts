/**
 * Compact "5m ago" / "3h ago" / "2d ago" formatter for presence tooltips.
 * Pure: tests pass `now` to avoid clock-dependent assertions.
 */

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const past = Date.parse(iso);
  if (Number.isNaN(past)) return "recently";
  const diffMs = Math.max(0, now - past);
  const sec = Math.floor(diffMs / 1000);
  // Floor at 60s — Math.floor(sec/60) is 0 for the 45–59s band, which would
  // otherwise emit a user-visible "0m ago".
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(day / 365);
  return `${year}y ago`;
}
