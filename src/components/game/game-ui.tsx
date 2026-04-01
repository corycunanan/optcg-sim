import type React from "react";
import { cn } from "@/lib/utils";
import { GameButton } from "./game-button";

export function ActionBtn({
  children, onClick, accent, className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  className?: string;
}) {
  return (
    <GameButton
      variant={accent ? "green" : "secondary"}
      size="sm"
      onClick={onClick}
      className={cn("block w-full mb-1 text-left font-mono", className)}
    >
      {children}
    </GameButton>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gb-surface border border-gb-border rounded p-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-gb-text-dim border-b border-gb-border-subtle pb-1 mb-1">
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="text-center">
      <div className="text-gb-text font-bold">{String(value)}</div>
      <div className="text-xs text-gb-text-dim uppercase tracking-wide">{label}</div>
    </div>
  );
}

export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="text-xs font-bold px-1 py-1 rounded border"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 27%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

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
