import type { CardData, PlayerState } from "@shared/game-types";
import { CardRow, CardNameWithTooltip } from "./card-slot";
import { SectionLabel, Stat, Tag } from "./game-ui";
import { s } from "./game-styles";

type CardDb = Record<string, CardData>;

export function PlayerZone({
  label, player, isActive, isMe, cardDb,
}: {
  label: string;
  player: PlayerState | null;
  isActive: boolean;
  isMe: boolean;
  cardDb: CardDb;
}) {
  if (!player) return <div style={{ color: "#555", padding: 16 }}>—</div>;

  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE").length;
  const restedDon = player.donCostArea.filter((d) => d.state === "RESTED").length;

  return (
    <div style={{ ...s.panel, border: isActive ? "1px solid #22c55e44" : "1px solid #222" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: "bold", fontSize: 12, color: isActive ? "#22c55e" : "#999" }}>{label}</span>
        {!player.connected && <Tag color="#ef4444">DISCONNECTED</Tag>}
      </div>

      {/* Stat row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10, fontSize: 11 }}>
        <Stat label="Life" value={player.life.length} />
        <Stat label="Hand" value={player.hand.length} />
        <Stat label="Deck" value={player.deck.length} />
        <Stat label="DON" value={`${activeDon}A ${restedDon}R`} />
        <Stat label="Char" value={player.characters.length} />
        <Stat label="Trash" value={player.trash.length} />
      </div>

      {/* Leader */}
      <SectionLabel>LEADER</SectionLabel>
      <CardRow card={player.leader} cardDb={cardDb} />

      {/* Characters */}
      {player.characters.length > 0 && (
        <>
          <SectionLabel>CHARACTERS ({player.characters.length})</SectionLabel>
          {player.characters.map((c) => (
            <CardRow key={c.instanceId} card={c} cardDb={cardDb} />
          ))}
        </>
      )}

      {/* Hand — only shown to owner */}
      {isMe ? (
        <>
          <SectionLabel>HAND ({player.hand.length})</SectionLabel>
          {player.hand.length === 0
            ? <div style={s.empty}>Empty</div>
            : player.hand.map((c) => <CardRow key={c.instanceId} card={c} cardDb={cardDb} />)
          }
        </>
      ) : (
        <>
          <SectionLabel>HAND</SectionLabel>
          <div style={s.empty}>{player.hand.length} card{player.hand.length !== 1 ? "s" : ""} (hidden)</div>
        </>
      )}

      {/* Life — only shown to owner */}
      {isMe && player.life.length > 0 && (
        <>
          <SectionLabel>LIFE CARDS</SectionLabel>
          {player.life.map((l, i) => (
            <div key={l.instanceId} style={{ fontSize: 11, color: "#666", padding: "1px 0" }}>
              [{i + 1}]{" "}
              {l.face === "UP"
                ? <CardNameWithTooltip cardId={l.cardId} cardDb={cardDb} />
                : <span style={{ color: "#444" }}>face-down</span>
              }
            </div>
          ))}
        </>
      )}

      {/* Stage */}
      {player.stage && (
        <>
          <SectionLabel>STAGE</SectionLabel>
          <CardRow card={player.stage} cardDb={cardDb} />
        </>
      )}
    </div>
  );
}
