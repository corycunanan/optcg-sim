import type React from "react";
import { cn } from "@/lib/utils";

export function ActionBtn({
  children, onClick, accent, className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full px-2 py-1 mb-0.5 text-left text-xs font-mono rounded cursor-pointer transition-[border-color] duration-100",
        "bg-gb-surface-raised border border-gb-border-strong text-gb-text",
        "hover:border-gb-text-muted focus-visible:ring-2 focus-visible:ring-gb-accent-blue focus-visible:outline-none",
        accent && "bg-gb-accent-green/15 text-gb-accent-green border-gb-accent-green/30 hover:border-gb-accent-green/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gb-surface border border-gb-border rounded p-2.5">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-gb-text-dim border-b border-gb-border-subtle pb-0.5 mb-1">
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
      className="text-xs font-bold px-1 py-0.5 rounded border"
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

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
