import type { CardData, PlayerState } from "@shared/game-types";
import { CardRow, CardNameWithTooltip } from "./card-slot";
import { SectionLabel, Stat, Tag } from "./game-ui";
import { cn } from "@/lib/utils";

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
  if (!player) return <div className="text-gb-text-muted p-4">&mdash;</div>;

  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE").length;
  const restedDon = player.donCostArea.filter((d) => d.state === "RESTED").length;

  return (
    <div className={cn(
      "bg-gb-surface rounded p-2.5 border",
      isActive ? "border-gb-accent-green/25" : "border-gb-border-strong",
    )}>

      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <span className={cn(
          "font-bold text-xs",
          isActive ? "text-gb-accent-green" : "text-gb-text-subtle",
        )}>
          {label}
        </span>
        {!player.connected && <Tag color="var(--gb-accent-red)">DISCONNECTED</Tag>}
      </div>

      {/* Stat row */}
      <div className="flex gap-3 flex-wrap mb-2.5 text-xs">
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
            ? <div className="text-gb-text-dim text-xs italic py-0.5">Empty</div>
            : player.hand.map((c) => <CardRow key={c.instanceId} card={c} cardDb={cardDb} />)
          }
        </>
      ) : (
        <>
          <SectionLabel>HAND</SectionLabel>
          <div className="text-gb-text-dim text-xs italic py-0.5">
            {player.hand.length} card{player.hand.length !== 1 ? "s" : ""} (hidden)
          </div>
        </>
      )}

      {/* Life — only shown to owner */}
      {isMe && player.life.length > 0 && (
        <>
          <SectionLabel>LIFE CARDS</SectionLabel>
          {player.life.map((l, i) => (
            <div key={l.instanceId} className="text-xs text-gb-text-subtle py-px">
              [{i + 1}]{" "}
              {l.face === "UP"
                ? <CardNameWithTooltip cardId={l.cardId} cardDb={cardDb} />
                : <span className="text-gb-text-dim">face-down</span>
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
