"use client";

import { useRef, useState } from "react";
import type { CardData, CardInstance } from "@shared/game-types";
import { s } from "./game-styles";

type CardDb = Record<string, CardData>;

export function CardRow({ card, cardDb }: { card: CardInstance; cardDb: CardDb }) {
  const donCount = card.attachedDon.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", borderBottom: "1px solid #151515", fontSize: 11 }}>
      <CardNameWithTooltip cardId={card.cardId} cardDb={cardDb} />
      <span style={{ ...s.dim, fontSize: 10 }}>·</span>
      <span style={{ fontSize: 10, color: card.state === "ACTIVE" ? "#22c55e" : "#888" }}>
        {card.state}
      </span>
      {donCount > 0 && (
        <span style={{ fontSize: 10, color: "#f59e0b" }}>+{donCount} DON</span>
      )}
    </div>
  );
}

export function CardNameWithTooltip({ cardId, cardDb }: { cardId: string; cardDb: CardDb }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const data = cardDb[cardId];
  const displayName = data?.name ?? cardId;

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span style={{ color: "#93c5fd", cursor: "default", borderBottom: "1px dotted #3b5bd5" }}>
        {displayName}
      </span>

      {visible && data && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 50,
          background: "#18181b", border: "1px solid #333", borderRadius: 5,
          padding: "10px 12px", minWidth: 220, maxWidth: 340, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}>
          <div style={{ fontWeight: "bold", color: "#fff", fontSize: 13, marginBottom: 4 }}>
            {data.name}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{data.type} · {cardId}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6, fontSize: 12 }}>
            {data.type === "Leader"
              ? (data.life ?? data.cost) !== null && (
                  <TooltipStat label="Life" value={(data.life ?? data.cost)!} color="#f87171" />
                )
              : data.cost !== null && (
                  <TooltipStat label="Cost" value={data.cost} color="#f59e0b" />
                )
            }
            {data.power !== null && (
              <TooltipStat label="Power" value={data.power.toLocaleString()} color="#22c55e" />
            )}
            {data.counter !== null && (
              <TooltipStat label="Counter" value={`+${data.counter}`} color="#a78bfa" />
            )}
            {data.type !== "Leader" && data.life !== null && (
              <TooltipStat label="Life" value={data.life} color="#f87171" />
            )}
          </div>

          {data.effectText && (
            <div style={{ fontSize: 12, color: "#999", lineHeight: 1.5, borderTop: "1px solid #222", paddingTop: 6, whiteSpace: "pre-wrap" }}>
              {data.effectText}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function TooltipStat({ label, value, color }: { label: string; value: unknown; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color, fontWeight: "bold", fontSize: 14 }}>{String(value)}</div>
      <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}
