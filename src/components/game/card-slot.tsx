import type { CardData, CardInstance } from "@shared/game-types";
import { cn } from "@/lib/utils";

type CardDb = Record<string, CardData>;

export function CardRow({ card, cardDb }: { card: CardInstance; cardDb: CardDb }) {
  const donCount = card.attachedDon.length;
  return (
    <div className="flex items-center gap-1 py-0.5 border-b border-gb-border-subtle text-xs">
      <CardNameWithTooltip cardId={card.cardId} cardDb={cardDb} />
      <span className="text-[10px] text-gb-text-dim">&middot;</span>
      <span className={cn(
        "text-[10px]",
        card.state === "ACTIVE" ? "text-gb-accent-green" : "text-gb-text-subtle",
      )}>
        {card.state}
      </span>
      {donCount > 0 && (
        <span className="text-[10px] text-gb-accent-amber">+{donCount} DON</span>
      )}
    </div>
  );
}

export function CardNameWithTooltip({ cardId, cardDb }: { cardId: string; cardDb: CardDb }) {
  const data = cardDb[cardId];
  const displayName = data?.name ?? cardId;

  return (
    <span className="group relative inline-block">
      <span className="text-gb-accent-blue cursor-default border-b border-dotted border-gb-accent-blue/50">
        {displayName}
      </span>

      {data && (
        <div className={cn(
          "absolute bottom-full left-0 z-50 mb-1 pointer-events-none",
          "bg-gb-surface border border-gb-border-strong rounded-md",
          "p-2.5 min-w-[220px] max-w-[340px] shadow-lg",
          "hidden group-hover:block",
        )}>
          <div className="font-bold text-gb-text-bright text-[13px] mb-1">
            {data.name}
          </div>
          <div className="text-xs text-gb-text-subtle mb-1">{data.type} &middot; {cardId}</div>

          <div className="flex gap-2.5 flex-wrap mb-1 text-xs">
            {data.type === "Leader"
              ? (data.life ?? data.cost) !== null && (
                  <TooltipStat label="Life" value={(data.life ?? data.cost)!} color="var(--gb-accent-rose)" />
                )
              : data.cost !== null && (
                  <TooltipStat label="Cost" value={data.cost} color="var(--gb-accent-amber)" />
                )
            }
            {data.power !== null && (
              <TooltipStat label="Power" value={data.power.toLocaleString()} color="var(--gb-accent-green)" />
            )}
            {data.counter !== null && (
              <TooltipStat label="Counter" value={`+${data.counter}`} color="var(--gb-accent-purple)" />
            )}
            {data.type !== "Leader" && data.life !== null && (
              <TooltipStat label="Life" value={data.life} color="var(--gb-accent-rose)" />
            )}
          </div>

          {data.effectText && (
            <div className="text-xs text-gb-text-subtle leading-relaxed border-t border-gb-border-strong pt-1 whitespace-pre-wrap">
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
    <div className="text-center">
      <div className="font-bold text-sm" style={{ color }}>{String(value)}</div>
      <div className="text-[10px] text-gb-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
