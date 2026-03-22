import type { CardData, GameAction, GameState, PlayerState, PromptOptions, PromptType } from "@shared/game-types";
import { ActionBtn, Section, SectionLabel } from "./game-ui";
import { s } from "./game-styles";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Turn info ── */}
      <div style={{ ...s.panel, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 11 }}>
          <span style={s.dim}>Turn </span>
          <span style={{ color: "#fff", fontWeight: "bold" }}>{turn.number}</span>
          <span style={s.dim}> · </span>
          <span style={{ color: isMyTurn ? "#22c55e" : "#f59e0b" }}>
            {isMyTurn ? "YOUR TURN" : "OPP TURN"}
          </span>
          <span style={s.dim}> · </span>
          <span style={{ color: "#93c5fd" }}>{phase}</span>
          {battlePhase && (
            <>
              <span style={s.dim}> › </span>
              <span style={{ color: "#c4b5fd" }}>{battlePhase}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Active prompt banner ── */}
      {activePrompt && (
        <div style={{ ...s.panel, border: "1px solid #f59e0b44", background: "#1a1400" }}>
          <div style={{ color: "#f59e0b", fontWeight: "bold", fontSize: 11, marginBottom: 6 }}>
            ⚡ ACTION NEEDED: {activePrompt.promptType.replace(/_/g, " ")}
          </div>

          {activePrompt.promptType === "REVEAL_TRIGGER" && (
            <div style={{ display: "flex", gap: 4 }}>
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
                Choose Blocker…
              </ActionBtn>
              <ActionBtn onClick={() => sendAction({ type: "PASS" })}>No Blocker</ActionBtn>
            </>
          )}

          {activePrompt.options.optional && activePrompt.promptType !== "SELECT_BLOCKER" && (
            <ActionBtn onClick={() => sendAction({ type: "PASS" })}>Skip</ActionBtn>
          )}
        </div>
      )}

      {/* ── Phase actions ── */}
      <Section title="PHASE">
        {canEndPhase && (
          <ActionBtn accent onClick={() => sendAction({ type: "ADVANCE_PHASE" })}>
            End {phase} →
          </ActionBtn>
        )}
        {canPass && (
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>Pass</ActionBtn>
        )}
        {matchClosed && (
          <div style={s.empty}>Match already resolved. Actions are disabled.</div>
        )}
        {!isMyTurn && !inBattle && (
          <div style={s.empty}>Waiting for opponent…</div>
        )}
        {!matchClosed && (
          <ActionBtn
            onClick={() => sendAction({ type: "CONCEDE" })}
            style={{ color: "#ef4444", marginTop: 4 }}
          >
            Concede
          </ActionBtn>
        )}
      </Section>

      {/* ── Attack actions ── */}
      {canAttack && me && (
        <Section title="ATTACK">
          {me.leader.state === "ACTIVE" && (
            <ActionBtn onClick={() => onAttackWith(me.leader.instanceId)}>
              ⚔ Leader: <span style={{ color: "#93c5fd" }}>{cardDb[me.leader.cardId]?.name ?? me.leader.cardId}</span>
            </ActionBtn>
          )}
          {me.characters
            .filter((c) => c.state === "ACTIVE" && (c.turnPlayed === null || c.turnPlayed < turn.number))
            .map((c) => (
              <ActionBtn key={c.instanceId} onClick={() => onAttackWith(c.instanceId)}>
                ⚔ {cardDb[c.cardId]?.name ?? c.cardId}
                <span style={s.dim}> · {(cardDb[c.cardId]?.power ?? 0).toLocaleString()} pwr</span>
              </ActionBtn>
            ))
          }
          {me.leader.state === "RESTED" && me.characters.filter((c) => c.state === "ACTIVE").length === 0 && (
            <div style={s.empty}>No active cards to attack with</div>
          )}
        </Section>
      )}

      {/* ── Counter ── */}
      {isCounterStep && !isMyTurn && hasCounterCards && (
        <Section title="COUNTER">
          <ActionBtn accent onClick={onUseCounter}>Use Counter Card…</ActionBtn>
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>No Counter</ActionBtn>
        </Section>
      )}
      {isCounterStep && !isMyTurn && !hasCounterCards && (
        <Section title="COUNTER">
          <div style={s.empty}>No counter cards in hand</div>
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>Pass (No Counter)</ActionBtn>
        </Section>
      )}
      {isBlockStep && !isMyTurn && (
        <Section title="BLOCKER">
          <ActionBtn accent onClick={() => onDeclareBlocker(
            me?.characters.filter((c) => c.state === "ACTIVE").map((c) => c.instanceId) ?? []
          )}>
            Declare Blocker…
          </ActionBtn>
          <ActionBtn onClick={() => sendAction({ type: "PASS" })}>No Blocker</ActionBtn>
        </Section>
      )}

      {/* ── Play card from hand ── */}
      {canPlayCard && me && me.hand.length > 0 && (
        <Section title="PLAY CARD">
          {me.hand.map((c) => {
            const data = cardDb[c.cardId];
            return (
              <ActionBtn key={c.instanceId} onClick={() => sendAction({ type: "PLAY_CARD", cardInstanceId: c.instanceId })}>
                ▶ {data?.name ?? c.cardId}
                {data && <span style={s.dim}> · cost {data.cost ?? "?"}</span>}
              </ActionBtn>
            );
          })}
        </Section>
      )}

      {/* ── DON!! attach ── */}
      {canAttachDon && (
        <Section title={`ATTACH DON!! (${activeDon} available)`}>
          <ActionBtn onClick={onAttachDon}>Choose Target…</ActionBtn>
        </Section>
      )}

      {/* ── Event log ── */}
      <Section title={`EVENT LOG (${gameState.eventLog.length})`}>
        <div style={{ maxHeight: 160, overflowY: "auto" }}>
          {gameState.eventLog.slice().reverse().map((ev, i) => (
            <div key={i} style={{ fontSize: 10, color: "#444", borderBottom: "1px solid #151515", padding: "1px 0" }}>
              <span style={{ color: "#666" }}>{ev.type}</span>
              {ev.payload && Object.entries(ev.payload).map(([k, v]) => (
                <span key={k} style={{ color: "#383838" }}> {k}={JSON.stringify(v)}</span>
              ))}
            </div>
          ))}
          {gameState.eventLog.length === 0 && <div style={{ color: "#333", fontSize: 10 }}>No events</div>}
        </div>
      </Section>

      {/* ── Raw JSON ── */}
      <button onClick={onToggleRaw} style={{ ...s.actionBtn, color: "#555" }}>
        {showRaw ? "▲ Hide" : "▼ Show"} Raw State JSON
      </button>
      {showRaw && (
        <pre style={{ fontSize: 9, background: "#080808", border: "1px solid #1a1a1a", padding: 8, overflow: "auto", maxHeight: 400, borderRadius: 3, color: "#444" }}>
          {JSON.stringify(rawState, null, 2)}
        </pre>
      )}
    </div>
  );
}
