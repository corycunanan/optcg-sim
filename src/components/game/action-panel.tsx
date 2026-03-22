import type { CardData, GameAction, GameState, PlayerState, PromptOptions, PromptType } from "@shared/game-types";
import { ActionBtn, Section, SectionLabel } from "./game-ui";
import { cn } from "@/lib/utils";

type CardDb = Record<string, CardData>;

export interface ActionPanelProps {
  gameState: GameState;
  me: PlayerState | null;
  matchClosed: boolean;
  isMyTurn: boolean;
  inBattle: boolean;
  phase: string;
  battlePhase: string | null;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
  cardDb: CardDb;
  sendAction: (a: GameAction) => void;
  onAttackWith: (instanceId: string) => void;
  onUseCounter: () => void;
  onDeclareBlocker: (validTargets: string[]) => void;
  onAttachDon: () => void;
  showRaw: boolean;
  onToggleRaw: () => void;
  rawState: GameState;
}

export function ActionPanel({
  gameState, me, matchClosed, isMyTurn, inBattle, phase, battlePhase,
  activePrompt, cardDb, sendAction,
  onAttackWith, onUseCounter, onDeclareBlocker, onAttachDon,
  showRaw, onToggleRaw, rawState,
}: ActionPanelProps) {
  const turn = gameState.turn;
  const activeDon = me?.donCostArea.filter((d) => d.state === "ACTIVE").length ?? 0;
  const hasCounterCards = me?.hand.some((c) => {
    const data = cardDb[c.cardId];
    return data && ((data.counter !== null && data.counter > 0) || data.type === "Event");
  }) ?? false;

  const canAttack = !matchClosed && isMyTurn && phase === "MAIN" && !inBattle;
  const canEndPhase = !matchClosed && isMyTurn && !inBattle;
  const canPass = !matchClosed && inBattle;
  const canAttachDon = !matchClosed && isMyTurn && phase === "MAIN" && !inBattle && activeDon > 0;
  const canPlayCard = !matchClosed && isMyTurn && phase === "MAIN" && !inBattle;
  const isCounterStep = !matchClosed && battlePhase === "COUNTER_STEP";
  const isBlockStep = !matchClosed && battlePhase === "BLOCK_STEP";

  return (
    <div className="flex flex-col gap-2">

      {/* Turn info */}
      <div className="bg-gb-surface border border-gb-border rounded p-2.5 flex gap-4 items-center flex-wrap">
        <div className="text-xs">
          <span className="text-gb-text-dim">Turn </span>
          <span className="text-gb-text-bright font-bold">{turn.number}</span>
          <span className="text-gb-text-dim"> &middot; </span>
          <span className={isMyTurn ? "text-gb-accent-green" : "text-gb-accent-amber"}>
            {isMyTurn ? "YOUR TURN" : "OPP TURN"}
          </span>
          <span className="text-gb-text-dim"> &middot; </span>
          <span className="text-gb-accent-blue">{phase}</span>
          {battlePhase && (
            <>
              <span className="text-gb-text-dim"> &rsaquo; </span>
              <span className="text-gb-accent-purple">{battlePhase}</span>
            </>
          )}
        </div>
      </div>

      {/* Active prompt banner */}
      {activePrompt && (
        <div className="bg-gb-prompt-bg border border-gb-accent-amber/25 rounded p-2.5">
          <div className="text-gb-accent-amber font-bold text-xs mb-1">
            &#x26A1; ACTION NEEDED: {activePrompt.promptType.replace(/_/g, " ")}
          </div>

          {activePrompt.promptType === "REVEAL_TRIGGER" && (
            <div className="flex gap-1">
              <ActionBtn onClick={() => sendAction({ type: "REVEAL_TRIGGER", reveal: true })}>
                Reveal &amp; Activate
              </ActionBtn>
              <ActionBtn onClick={() => sendAction({ type: "REVEAL_TRIGGER", reveal: false })}>
                Add to Hand
              </ActionBtn>
            </div>
          )}

          {activePrompt.promptType === "SELECT_BLOCKER" && (
            <>
              <ActionBtn
                accent
                onClick={() => onDeclareBlocker(activePrompt.options.validTargets ?? [])}
              >
                Choose Blocker&hellip;
              </ActionBtn>
              <ActionBtn onClick={() => sendAction({ type: "PASS" })}>No Blocker</ActionBtn>
            </>
          )}

          {activePrompt.options.optional && activePrompt.promptType !== "SELECT_BLOCKER" && (
            <ActionBtn onClick={() => sendAction({ type: "PASS" })}>Skip</ActionBtn>
          )}
        </div>
      )}

      {/* Phase actions */}
      <Section title="PHASE">
        {canEndPhase && (
          <ActionBtn accent onClick={() => sendAction({ type: "ADVANCE_PHASE" })}>
            End {phase} &rarr;
          </ActionBtn>
        )}
        {canPass && (
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>Pass</ActionBtn>
        )}
        {matchClosed && (
          <div className="text-gb-text-dim text-xs italic py-0.5">Match already resolved. Actions are disabled.</div>
        )}
        {!isMyTurn && !inBattle && (
          <div className="text-gb-text-dim text-xs italic py-0.5">Waiting for opponent&hellip;</div>
        )}
        {!matchClosed && (
          <ActionBtn
            onClick={() => sendAction({ type: "CONCEDE" })}
            className="text-gb-accent-red mt-1"
          >
            Concede
          </ActionBtn>
        )}
      </Section>

      {/* Attack actions */}
      {canAttack && me && (
        <Section title="ATTACK">
          {me.leader.state === "ACTIVE" && (
            <ActionBtn onClick={() => onAttackWith(me.leader.instanceId)}>
              &#x2694; Leader: <span className="text-gb-accent-blue">{cardDb[me.leader.cardId]?.name ?? me.leader.cardId}</span>
            </ActionBtn>
          )}
          {me.characters
            .filter((c) => c.state === "ACTIVE" && (c.turnPlayed === null || c.turnPlayed < turn.number))
            .map((c) => (
              <ActionBtn key={c.instanceId} onClick={() => onAttackWith(c.instanceId)}>
                &#x2694; {cardDb[c.cardId]?.name ?? c.cardId}
                <span className="text-gb-text-dim"> &middot; {(cardDb[c.cardId]?.power ?? 0).toLocaleString()} pwr</span>
              </ActionBtn>
            ))
          }
          {me.leader.state === "RESTED" && me.characters.filter((c) => c.state === "ACTIVE").length === 0 && (
            <div className="text-gb-text-dim text-xs italic py-0.5">No active cards to attack with</div>
          )}
        </Section>
      )}

      {/* Counter */}
      {isCounterStep && !isMyTurn && hasCounterCards && (
        <Section title="COUNTER">
          <ActionBtn accent onClick={onUseCounter}>Use Counter Card&hellip;</ActionBtn>
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>No Counter</ActionBtn>
        </Section>
      )}
      {isCounterStep && !isMyTurn && !hasCounterCards && (
        <Section title="COUNTER">
          <div className="text-gb-text-dim text-xs italic py-0.5">No counter cards in hand</div>
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>Pass (No Counter)</ActionBtn>
        </Section>
      )}
      {isBlockStep && !isMyTurn && (
        <Section title="BLOCKER">
          <ActionBtn accent onClick={() => onDeclareBlocker(
            me?.characters.filter((c) => c.state === "ACTIVE").map((c) => c.instanceId) ?? []
          )}>
            Declare Blocker&hellip;
          </ActionBtn>
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>No Blocker</ActionBtn>
        </Section>
      )}

      {/* Play card from hand */}
      {canPlayCard && me && me.hand.length > 0 && (
        <Section title="PLAY CARD">
          {me.hand.map((c) => {
            const data = cardDb[c.cardId];
            return (
              <ActionBtn key={c.instanceId} onClick={() => sendAction({ type: "PLAY_CARD", cardInstanceId: c.instanceId })}>
                &#x25B6; {data?.name ?? c.cardId}
                {data && <span className="text-gb-text-dim"> &middot; cost {data.cost ?? "?"}</span>}
              </ActionBtn>
            );
          })}
        </Section>
      )}

      {/* DON!! attach */}
      {canAttachDon && (
        <Section title={`ATTACH DON!! (${activeDon} available)`}>
          <ActionBtn onClick={onAttachDon}>Choose Target&hellip;</ActionBtn>
        </Section>
      )}

      {/* Event log */}
      <Section title={`EVENT LOG (${gameState.eventLog.length})`}>
        <div className="max-h-40 overflow-y-auto">
          {gameState.eventLog.slice().reverse().map((ev, i) => (
            <div key={i} className="text-[10px] text-gb-text-dim border-b border-gb-border-subtle py-px">
              <span className="text-gb-text-subtle">{ev.type}</span>
              {ev.payload && Object.entries(ev.payload).map(([k, v]) => (
                <span key={k} className="text-gb-text-dim/70"> {k}={JSON.stringify(v)}</span>
              ))}
            </div>
          ))}
          {gameState.eventLog.length === 0 && <div className="text-gb-text-dim text-[10px]">No events</div>}
        </div>
      </Section>

      {/* Raw JSON */}
      <ActionBtn onClick={onToggleRaw} className="text-gb-text-muted">
        {showRaw ? "\u25B2 Hide" : "\u25BC Show"} Raw State JSON
      </ActionBtn>
      {showRaw && (
        <pre className="text-[9px] bg-gb-surface-inset border border-gb-border-subtle p-2 overflow-auto max-h-[400px] rounded text-gb-text-dim">
          {JSON.stringify(rawState, null, 2)}
        </pre>
      )}
    </div>
  );
}
