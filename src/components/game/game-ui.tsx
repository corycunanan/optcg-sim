import type React from "react";
import { s } from "./game-styles";

export function ActionBtn({
  children, onClick, accent, style,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...s.actionBtn,
        ...(accent ? { background: "#14532d", color: "#86efac", borderColor: "#166534" } : {}),
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#555")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = accent ? "#166534" : "#2a2a2a")}
    >
      {children}
    </button>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.panel}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em",
      color: "#444", borderBottom: "1px solid #1a1a1a", paddingBottom: 3, marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#ccc", fontWeight: "bold" }}>{String(value)}</div>
      <div style={{ color: "#444", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: "bold", padding: "2px 6px", borderRadius: 3,
      background: color + "22", color, border: `1px solid ${color}44`,
    }}>
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
