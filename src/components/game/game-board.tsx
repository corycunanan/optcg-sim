"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWs } from "@/hooks/use-game-ws";
import type { CardData, GameAction } from "@shared/game-types";
import { PlayerZone } from "./player-zone";
import { ActionPanel } from "./action-panel";
import { TargetModal, type ModalState, type ModalTarget } from "./target-modal";
import { Tag, formatCountdown } from "./game-ui";
import { s } from "./game-styles";

type CardDb = Record<string, CardData>;

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Root ────────────────────────────────────────────────────────────────────

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

  // ─── Derived values ─────────────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>

      {/* ── Match ended overlay ── */}
      {matchClosed && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 440, width: "100%", background: "#141414", border: "1px solid #333", borderRadius: 12, padding: 28, textAlign: "center" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#888", letterSpacing: "0.08em", marginBottom: 8 }}>MATCH COMPLETE</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: endColor, marginBottom: 12 }}>{endTitle}</p>
            <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.5, marginBottom: 24 }}>
              {gameOver?.reason ?? remoteGameStatus?.winReason ?? "The game has ended."}
            </p>
            <button
              type="button"
              onClick={handleBackToPlay}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "none", background: "#1e3a5f", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
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
          <PlayerZone
            label={`YOU — P${(myIndex ?? 0) + 1}`}
            player={me}
            isActive={isMyTurn}
            isMe
            cardDb={cardDb}
          />
          <PlayerZone
            label={`OPPONENT — P${(oppIndex ?? 1) + 1}`}
            player={opp}
            isActive={!isMyTurn}
            isMe={false}
            cardDb={cardDb}
          />
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
            sendAction={sendAction as (a: GameAction) => void}
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

      {modal && (
        <TargetModal modal={modal} onClose={closeModal} cardDb={cardDb} />
      )}
    </div>
  );
}
