import type { CardData } from "@shared/game-types";
import { s } from "./game-styles";

type CardDb = Record<string, CardData>;

export interface ModalTarget {
  instanceId: string;
  cardId: string;
  label: string;
  sublabel?: string;
}

export interface ModalState {
  title: string;
  targets: ModalTarget[];
  onSelect: (instanceId: string) => void;
  optional?: boolean;
  onSkip?: () => void;
}

export function TargetModal({ modal, onClose, cardDb }: { modal: ModalState; onClose: () => void; cardDb: CardDb }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#111", border: "1px solid #333", borderRadius: 6,
        padding: 20, minWidth: 320, maxWidth: 480, width: "90%",
        fontFamily: "'SF Mono', 'Fira Code', monospace",
      }}>
        <div style={{ fontWeight: "bold", color: "#fff", fontSize: 13, marginBottom: 12 }}>
          {modal.title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
          {modal.targets.map((t) => {
            const data = cardDb[t.cardId];
            return (
              <button
                key={t.instanceId}
                onClick={() => modal.onSelect(t.instanceId)}
                style={{
                  background: "#1a1a1a", border: "1px solid #333", borderRadius: 4,
                  padding: "8px 12px", textAlign: "left", cursor: "pointer", color: "#ccc",
                  fontFamily: "inherit", fontSize: 12, transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#222")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#1a1a1a")}
              >
                <div style={{ fontWeight: "bold", color: "#93c5fd" }}>{t.label}</div>
                {t.sublabel && <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{t.sublabel}</div>}
                {data && (
                  <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 10 }}>
                    {data.cost !== null && <span style={{ color: "#f59e0b" }}>Cost {data.cost}</span>}
                    {data.power !== null && <span style={{ color: "#22c55e" }}>Pwr {data.power.toLocaleString()}</span>}
                    {data.counter !== null && <span style={{ color: "#a78bfa" }}>Ctr +{data.counter}</span>}
                    <span style={{ color: "#555" }}>{data.type}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {modal.optional && modal.onSkip && (
            <button onClick={modal.onSkip} style={{ ...s.smallBtn, flex: 1 }}>
              Skip
            </button>
          )}
          <button onClick={onClose} style={{ ...s.smallBtn, flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
