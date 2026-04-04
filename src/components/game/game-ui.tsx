export function TooltipStat({
  label,
  value,
  modified,
}: {
  label: string;
  value: unknown;
  modified?: "up" | "down" | null;
}) {
  const colorClass = modified === "up"
    ? "text-gb-accent-green"
    : modified === "down"
      ? "text-gb-accent-red"
      : "text-gb-text-bright";

  return (
    <div className="text-center px-2">
      <div className={`flex items-center justify-center gap-1 font-bold text-sm ${colorClass}`}>
        <span>{String(value)}</span>
        {modified === "up" && (
          <span className="text-xs leading-none">&#x25B2;</span>
        )}
        {modified === "down" && (
          <span className="text-xs leading-none">&#x25BC;</span>
        )}
      </div>
      <div className="text-xs text-gb-text-muted uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
