export function TooltipStat({
  label,
  value,
  color,
}: {
  label: string;
  value: unknown;
  color: string;
}) {
  return (
    <div className="text-center px-2">
      <div className="font-bold text-sm" style={{ color }}>
        {String(value)}
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
