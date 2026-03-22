import type React from "react";

export const s = {
  root: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 12,
    background: "#0d0d0d",
    color: "#ccc",
    minHeight: "100vh",
  } as React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 16px",
    borderBottom: "1px solid #1a1a1a",
    background: "#111",
    position: "sticky" as const,
    top: 0,
    zIndex: 20,
  } as React.CSSProperties,

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 300px",
    gap: 10,
    padding: 10,
    alignItems: "start",
  } as React.CSSProperties,

  panel: {
    background: "#111",
    border: "1px solid #1e1e1e",
    borderRadius: 4,
    padding: 10,
  } as React.CSSProperties,

  actionBtn: {
    display: "block",
    width: "100%",
    padding: "5px 8px",
    marginBottom: 3,
    background: "#151515",
    border: "1px solid #2a2a2a",
    color: "#bbb",
    cursor: "pointer",
    borderRadius: 3,
    textAlign: "left" as const,
    fontSize: 11,
    fontFamily: "inherit",
    transition: "border-color 0.1s",
  } as React.CSSProperties,

  smallBtn: {
    padding: "3px 8px",
    background: "#1a1a1a",
    border: "1px solid #333",
    color: "#777",
    cursor: "pointer",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "inherit",
  } as React.CSSProperties,

  dim: { color: "#444" } as React.CSSProperties,
  empty: { color: "#333", fontSize: 11, padding: "2px 0", fontStyle: "italic" } as React.CSSProperties,
} as const;
