"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useGameWs,
  type CardInstance,
  type GameAction,
  type GameState,
  type PlayerState,
  type PromptOptions,
  type PromptType,
} from "@/hooks/use-game-ws";

// ─── Card data from worker ─────────────────────────────────────────────────────

interface CardData {
  id: string;
  name: string;
  type: "Leader" | "Character" | "Event" | "Stage";
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  effectText: string;
  triggerText: string | null;
}

type CardDb = Record<string, CardData>;

// ─── Modal state ──────────────────────────────────────────────────────────────

interface ModalTarget {
  instanceId: string;
  cardId: string;
  label: string;
  sublabel?: string;
}

interface ModalState {
  title: string;
  targets: ModalTarget[];
  onSelect: (instanceId: string) => void;
  optional?: boolean;
  onSkip?: () => void;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface GameBoardProps {
  gameId: string;
  workerUrl: string;
}

interface RemoteGameStatus {
  id: string;
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winnerId: string | null;
  winReason: string | null;
  winnerPerspective: "SELF" | "OPPONENT" | "NONE";
  canFallbackConcede: boolean;
  playerIndex?: 0 | 1;
}

export function GameBoard({ gameId, workerUrl }: GameBoardProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const [now, setNow] = useState(() => Date.now());
  const [leavingGame, setLeavingGame] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [remoteGameStatus, setRemoteGameStatus] = useState<RemoteGameStatus | null>(null);
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const r = await fetch("/api/game/token");
    if (!r.ok) throw new Error(`Token fetch: ${r.status}`);
    const d = await r.json() as { token?: string };
    if (!d.token) throw new Error("No token");
    return d.token;
  }, []);

  const { gameState, connectionStatus, lastError, activePrompt, gameOver, sendAction, leaveGame } =
    useGameWs(gameId, workerUrl, getToken);

  // Card database — fetched once from worker
  const [cardDb, setCardDb] = useState<CardDb>({});
  const cardDbFetched = useRef(false);
  useEffect(() => {
    if (cardDbFetched.current) return;
    cardDbFetched.current = true;
    getToken()
      .then((token) =>
        fetch(`${workerUrl}/game/${gameId}/cards?token=${encodeURIComponent(token)}`)
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CardDb | null) => { if (data) setCardDb(data); })
      .catch(() => {});
  }, [gameId, workerUrl, getToken]);

  // Target modal
  const [modal, setModal] = useState<ModalState | null>(null);
  const closeModal = () => setModal(null);

  const [showRaw, setShowRaw] = useState(false);

  const myIndex = gameState
    ? (gameState.players[0].playerId === userId ? 0 : 1) as 0 | 1
    : null;
  const oppIndex: 0 | 1 | null = myIndex !== null ? (myIndex === 0 ? 1 : 0) : null;
  const me = myIndex !== null && gameState ? gameState.players[myIndex] : null;
  const opp = oppIndex !== null && gameState ? gameState.players[oppIndex] : null;
  const turn = gameState?.turn;
  const isMyTurn = myIndex !== null && turn ? turn.activePlayerIndex === myIndex : false;
  const inBattle = !!(turn?.battleSubPhase);
  const phase = turn?.phase ?? "";
  const battlePhase = turn?.battleSubPhase ?? null;
  const opponentAway = !!opp && !opp.connected;
  const opponentDeadlineRemaining = opp?.rejoinDeadlineAt
    ? Math.max(0, opp.rejoinDeadlineAt - now)
    : null;
  const opponentAwayText = opp?.awayReason === "LEFT"
    ? "Opponent left the game."
    : "Opponent disconnected.";
  const gamePausedForOpponent = opponentAway && (
    turn?.activePlayerIndex === oppIndex
    || battlePhase === "BLOCK_STEP"
    || battlePhase === "COUNTER_STEP"
    || battlePhase === "DAMAGE_STEP"
  );
  const resolvedWithoutSocket = Boolean(!gameOver && remoteGameStatus && remoteGameStatus.status !== "IN_PROGRESS");
  const stateFinished =
    gameState?.status === "FINISHED" || gameState?.status === "ABANDONED";
  const matchClosed = Boolean(gameOver || resolvedWithoutSocket || stateFinished);
  const fallbackConcedeAvailable =
    !gameState
    && connectionStatus !== "connecting"
    && remoteGameStatus?.status === "IN_PROGRESS"
    && remoteGameStatus.canFallbackConcede;

  useEffect(() => {
    if (!gameState?.players.some((player) => player.rejoinDeadlineAt !== null && !player.connected)) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  useEffect(() => {
    let cancelled = false;

    const loadGameStatus = async () => {
      const response = await fetch(`/api/game/${gameId}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || cancelled) return;

      const data = await response.json().catch(() => null) as { game?: RemoteGameStatus } | null;
      if (!cancelled && data?.game) {
        setRemoteGameStatus(data.game);
      }
    };

    void loadGameStatus();
    const interval = setInterval(() => { void loadGameStatus(); }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameId]);

  // Finalize game in Postgres when the client learns the game is over.
  // The DO's writeResultToDb callback can fail (e.g. Miniflare can't reach
  // localhost), so the client serves as a reliable backup writer.
  const finalizedRef = useRef(false);

  const finalizeGame = useCallback(async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const winnerId = gameOver?.winner != null && gameState
      ? gameState.players[gameOver.winner].playerId
      : null;

    await fetch(`/api/game/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "FINALIZE",
        winnerId,
        winReason: gameOver?.reason ?? "Game ended",
      }),
    }).catch(() => {});
  }, [gameId, gameOver, gameState]);

  useEffect(() => {
    if (matchClosed) void finalizeGame();
  }, [matchClosed, finalizeGame]);

  const handleBackToPlay = useCallback(async () => {
    await finalizeGame();
    window.location.href = "/lobbies";
  }, [finalizeGame]);

  const handleLeaveGame = useCallback(async () => {
    setLeavingGame(true);
    setLeaveError(null);
    try {
      await leaveGame();
      window.location.href = "/lobbies";
    } catch {
      setLeaveError("Failed to leave the game cleanly");
      setLeavingGame(false);
    }
  }, [leaveGame]);

  const handleFallbackConcede = useCallback(async () => {
    setFallbackSubmitting(true);
    setFallbackError(null);
    try {
      const response = await fetch(`/api/game/${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONCEDE" }),
      });
      const data = await response.json().catch(() => null) as { error?: string; game?: RemoteGameStatus } | null;
      if (!response.ok || !data?.game) {
        throw new Error(data?.error ?? "Failed to concede");
      }

      setRemoteGameStatus(data.game);
      window.location.href = "/lobbies";
    } catch (error) {
      setFallbackError(error instanceof Error ? error.message : "Failed to concede");
      setFallbackSubmitting(false);
    }
  }, [gameId]);

  // ─── Action builders ────────────────────────────────────────────────────────

  const attackWith = (attackerInstanceId: string) => {
    if (!opp) return;
    const oppTargets: ModalTarget[] = [
      {
        instanceId: opp.leader.instanceId,
        cardId: opp.leader.cardId,
        label: cardDb[opp.leader.cardId]?.name ?? opp.leader.cardId,
        sublabel: "Leader",
      },
      ...opp.characters.map((c) => ({
        instanceId: c.instanceId,
        cardId: c.cardId,
        label: cardDb[c.cardId]?.name ?? c.cardId,
        sublabel: `Character · ${c.state}`,
      })),
    ];
    setModal({
      title: "Select Attack Target",
      targets: oppTargets,
      onSelect: (targetInstanceId) => {
        sendAction({ type: "DECLARE_ATTACK", attackerInstanceId, targetInstanceId });
        closeModal();
      },
    });
  };

  const useCounter = () => {
    if (!me || !opp) return;
    const counterCards = me.hand.filter((c) => {
      const data = cardDb[c.cardId];
      if (!data) return false;
      return (data.counter !== null && data.counter > 0) || data.type === "Event";
    });
    if (counterCards.length === 0) return;

    // First pick the card to use as counter
    const counterCardTargets: ModalTarget[] = counterCards.map((c) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      label: cardDb[c.cardId]?.name ?? c.cardId,
      sublabel: `Counter +${cardDb[c.cardId]?.counter ?? "?"}`,
    }));

    setModal({
      title: "Select Counter Card",
      targets: counterCardTargets,
      optional: true,
      onSkip: closeModal,
      onSelect: (cardInstanceId) => {
        // Then pick target (the card being attacked — typically your leader or a character)
        const attackedTargets: ModalTarget[] = [
          {
            instanceId: me.leader.instanceId,
            cardId: me.leader.cardId,
            label: cardDb[me.leader.cardId]?.name ?? me.leader.cardId,
            sublabel: "Leader",
          },
          ...me.characters.map((c) => ({
            instanceId: c.instanceId,
            cardId: c.cardId,
            label: cardDb[c.cardId]?.name ?? c.cardId,
            sublabel: "Character",
          })),
        ];
        setModal({
          title: "Select Counter Target (card being defended)",
          targets: attackedTargets,
          optional: true,
          onSkip: closeModal,
          onSelect: (counterTargetInstanceId) => {
            const data = cardDb[cardInstanceId];
            const actionType = data?.type === "Event" ? "USE_COUNTER_EVENT" : "USE_COUNTER";
            sendAction({ type: actionType as "USE_COUNTER", cardInstanceId, counterTargetInstanceId });
            closeModal();
          },
        });
      },
    });
  };

  const declareBlocker = (validTargets: string[]) => {
    if (!me) return;
    const blockerTargets: ModalTarget[] = me.characters
      .filter((c) => validTargets.includes(c.instanceId) && c.state === "ACTIVE")
      .map((c) => ({
        instanceId: c.instanceId,
        cardId: c.cardId,
        label: cardDb[c.cardId]?.name ?? c.cardId,
        sublabel: `Power ${(cardDb[c.cardId]?.power ?? 0).toLocaleString()}`,
      }));
    setModal({
      title: "Declare Blocker",
      targets: blockerTargets,
      optional: true,
      onSkip: () => { sendAction({ type: "PASS" }); closeModal(); },
      onSelect: (blockerInstanceId) => {
        sendAction({ type: "DECLARE_BLOCKER", blockerInstanceId });
        closeModal();
      },
    });
  };

  const attachDon = () => {
    if (!me) return;
    const donTargets: ModalTarget[] = [
      {
        instanceId: me.leader.instanceId,
        cardId: me.leader.cardId,
        label: cardDb[me.leader.cardId]?.name ?? me.leader.cardId,
        sublabel: `Leader · +${me.leader.attachedDon.length} DON already`,
      },
      ...me.characters.map((c) => ({
        instanceId: c.instanceId,
        cardId: c.cardId,
        label: cardDb[c.cardId]?.name ?? c.cardId,
        sublabel: `Character · +${c.attachedDon.length} DON already`,
      })),
    ];
    setModal({
      title: "Attach 1 DON!!",
      targets: donTargets,
      onSelect: (targetInstanceId) => {
        sendAction({ type: "ATTACH_DON", targetInstanceId, count: 1 });
        closeModal();
      },
    });
  };

  // ─── Connection / loading states ────────────────────────────────────────────

  const statusColor =
    connectionStatus === "connected" ? "#22c55e"
    : connectionStatus === "connecting" ? "#f59e0b"
    : "#ef4444";

  const endTitle = gameOver
    ? gameOver.winner === null ? "DRAW"
      : gameOver.winner === myIndex ? "VICTORY" : "DEFEAT"
    : remoteGameStatus?.winnerPerspective === "SELF" ? "VICTORY"
      : remoteGameStatus?.winnerPerspective === "NONE" ? "MATCH ENDED"
      : "DEFEAT";

  const endColor = gameOver
    ? gameOver.winner === myIndex ? "#22c55e"
      : gameOver.winner === null ? "#f59e0b" : "#ef4444"
    : remoteGameStatus?.winnerPerspective === "SELF" ? "#22c55e"
      : remoteGameStatus?.winnerPerspective === "NONE" ? "#f59e0b"
      : "#ef4444";

  return (
    <div style={s.root}>

      {/* ── Match ended overlay (both players see this immediately) ── */}
      {matchClosed && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              background: "#141414",
              border: "1px solid #333",
              borderRadius: 12,
              padding: 28,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: "#888", letterSpacing: "0.08em", marginBottom: 8 }}>
              MATCH COMPLETE
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: endColor, marginBottom: 12 }}>
              {endTitle}
            </p>
            <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.5, marginBottom: 24 }}>
              {gameOver?.reason ?? remoteGameStatus?.winReason ?? "The game has ended."}
            </p>
            <button
              type="button"
              onClick={handleBackToPlay}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: "#1e3a5f",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Back to Play
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={s.header}>
        <span style={{ fontWeight: "bold", color: "#fff", fontSize: 13 }}>OPTCG TEST</span>
        <span style={s.dim}>game:{gameId.slice(0, 10)}</span>
        <Tag color={statusColor}>{connectionStatus.toUpperCase()}</Tag>
        {myIndex !== null && <span style={s.dim}>you=P{myIndex + 1}</span>}
        {lastError && <span style={{ color: "#ef4444", fontSize: 11 }}>⚠ {lastError}</span>}
        {leaveError && <span style={{ color: "#ef4444", fontSize: 11 }}>⚠ {leaveError}</span>}
        <div style={{ flex: 1 }} />
        {!matchClosed && (
          <button onClick={handleLeaveGame} style={s.smallBtn}>
            {leavingGame ? "Leaving…" : "Leave Game"}
          </button>
        )}
        <button onClick={handleBackToPlay} style={s.smallBtn}>← Lobbies</button>
      </div>

      {!matchClosed && opponentAway && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 16px", background: gamePausedForOpponent ? "#1a1400" : "#111827", borderBottom: "1px solid #333", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "bold", fontSize: 14, color: gamePausedForOpponent ? "#f59e0b" : "#93c5fd" }}>
            {gamePausedForOpponent ? "GAME PAUSED" : "OPPONENT AWAY"}
          </span>
          <span style={s.dim}>
            {opponentAwayText} {gamePausedForOpponent
              ? "The game will resume once they reconnect."
              : "You can keep making moves until their input is required."}
          </span>
          {opponentDeadlineRemaining !== null && (
            <span style={{ color: "#f59e0b", fontSize: 11 }}>
              Rejoin window: {formatCountdown(opponentDeadlineRemaining)}
            </span>
          )}
        </div>
      )}

      {!gameState ? (
        <div style={{ padding: 48, textAlign: "center", color: "#555" }}>
          <div>{connectionStatus === "connecting" ? "Connecting…" : "Waiting for game state…"}</div>
          {fallbackConcedeAvailable && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <div style={{ color: "#888", fontSize: 12, maxWidth: 420 }}>
                Reconnect failed. You can still concede this match without restoring the websocket session.
              </div>
              {fallbackError && <div style={{ color: "#ef4444", fontSize: 11 }}>{fallbackError}</div>}
              <button
                onClick={handleFallbackConcede}
                disabled={fallbackSubmitting}
                style={{ ...s.smallBtn, color: "#ef4444", borderColor: "#6b1d1d" }}
              >
                {fallbackSubmitting ? "Conceding…" : "Concede Match"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={s.grid}>

          {/* ── My side ── */}
          <PlayerPanel
            label={`YOU — P${(myIndex ?? 0) + 1}`}
            player={me}
            isActive={isMyTurn}
            isMe
            cardDb={cardDb}
          />

          {/* ── Opponent side ── */}
          <PlayerPanel
            label={`OPPONENT — P${(oppIndex ?? 1) + 1}`}
            player={opp}
            isActive={!isMyTurn}
            isMe={false}
            cardDb={cardDb}
          />

          {/* ── Action panel ── */}
          <ActionPanel
            gameState={gameState}
            me={me}
            matchClosed={matchClosed}
            isMyTurn={isMyTurn}
            inBattle={inBattle}
            phase={phase}
            battlePhase={battlePhase}
            activePrompt={activePrompt}
            cardDb={cardDb}
            sendAction={sendAction}
            onAttackWith={attackWith}
            onUseCounter={useCounter}
            onDeclareBlocker={declareBlocker}
            onAttachDon={attachDon}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw((v) => !v)}
            rawState={gameState}
          />
        </div>
      )}

      {/* ── Target modal ── */}
      {modal && (
        <TargetModal modal={modal} onClose={closeModal} cardDb={cardDb} />
      )}
    </div>
  );
}

// ─── Player Panel ─────────────────────────────────────────────────────────────

function PlayerPanel({
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

// ─── Action Panel ─────────────────────────────────────────────────────────────

function ActionPanel({
  gameState, me, matchClosed, isMyTurn, inBattle, phase, battlePhase,
  activePrompt, cardDb, sendAction,
  onAttackWith, onUseCounter, onDeclareBlocker, onAttachDon,
  showRaw, onToggleRaw, rawState,
}: {
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
}) {
  const turn = gameState.turn;
  const activeDon = me?.donCostArea.filter((d) => d.state === "ACTIVE").length ?? 0;
  const hasCounterCards = me?.hand.some((c) => {
    const data = cardDb[c.cardId];
    return data && ((data.counter !== null && data.counter > 0) || data.type === "Event");
  }) ?? false;

  // Determine which actions are legal right now
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
          {(gameState.eventLog as { type: string; [k: string]: unknown }[]).slice().reverse().map((ev, i) => (
            <div key={i} style={{ fontSize: 10, color: "#444", borderBottom: "1px solid #151515", padding: "1px 0" }}>
              <span style={{ color: "#666" }}>{ev.type}</span>
              {Object.entries(ev)
                .filter(([k]) => !["type", "timestamp", "playerIndex"].includes(k))
                .map(([k, v]) => (
                  <span key={k} style={{ color: "#383838" }}> {k}={JSON.stringify(v)}</span>
                ))
              }
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

// ─── Target modal ─────────────────────────────────────────────────────────────

function TargetModal({ modal, onClose, cardDb }: { modal: ModalState; onClose: () => void; cardDb: CardDb }) {
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

// ─── Card row with hover tooltip ──────────────────────────────────────────────

function CardRow({ card, cardDb }: { card: CardInstance; cardDb: CardDb }) {
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

// ─── Card name with hover tooltip ─────────────────────────────────────────────

function CardNameWithTooltip({ cardId, cardDb }: { cardId: string; cardDb: CardDb }) {
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
          padding: "8px 10px", minWidth: 200, maxWidth: 280, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}>
          {/* Card name + type */}
          <div style={{ fontWeight: "bold", color: "#fff", fontSize: 12, marginBottom: 4 }}>
            {data.name}
          </div>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>{data.type} · {cardId}</div>

          {/* Stats grid */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6, fontSize: 11 }}>
            {data.cost !== null && (
              <TooltipStat label="Cost" value={data.cost} color="#f59e0b" />
            )}
            {data.power !== null && (
              <TooltipStat label="Power" value={data.power.toLocaleString()} color="#22c55e" />
            )}
            {data.counter !== null && (
              <TooltipStat label="Counter" value={`+${data.counter}`} color="#a78bfa" />
            )}
            {data.life !== null && (
              <TooltipStat label="Life" value={data.life} color="#f87171" />
            )}
          </div>

          {/* Effect text */}
          {data.effectText && (
            <div style={{ fontSize: 10, color: "#888", lineHeight: 1.4, borderTop: "1px solid #222", paddingTop: 5 }}>
              {data.effectText.slice(0, 180)}{data.effectText.length > 180 ? "…" : ""}
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
      <div style={{ color, fontWeight: "bold", fontSize: 13 }}>{String(value)}</div>
      <div style={{ color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

// ─── Small reusable UI ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.panel}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em",
      color: "#444", borderBottom: "1px solid #1a1a1a", paddingBottom: 3, marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#ccc", fontWeight: "bold" }}>{String(value)}</div>
      <div style={{ color: "#444", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: "bold", padding: "2px 6px", borderRadius: 3,
      background: color + "22", color, border: `1px solid ${color}44`,
    }}>
      {children}
    </span>
  );
}

function ActionBtn({
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

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
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
