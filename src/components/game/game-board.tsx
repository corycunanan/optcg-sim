"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWs } from "@/hooks/use-game-ws";
import { cn } from "@/lib/utils";
import type { CardData, GameAction } from "@shared/game-types";
import { PlayerZone } from "./player-zone";
import { ActionPanel } from "./action-panel";
import { TargetModal, type ModalState, type ModalTarget } from "./target-modal";
import { Tag, formatCountdown } from "./game-ui";

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
    connectionStatus === "connected" ? "var(--gb-accent-green)"
    : connectionStatus === "connecting" ? "var(--gb-accent-amber)"
    : "var(--gb-accent-red)";

  const endTitle = gameOver
    ? gameOver.winner === null ? "DRAW"
      : gameOver.winner === myIndex ? "VICTORY" : "DEFEAT"
    : remoteGameStatus?.winnerPerspective === "SELF" ? "VICTORY"
      : remoteGameStatus?.winnerPerspective === "NONE" ? "MATCH ENDED"
      : "DEFEAT";

  const endColorClass =
    (gameOver
      ? gameOver.winner === myIndex ? "text-gb-accent-green"
        : gameOver.winner === null ? "text-gb-accent-amber" : "text-gb-accent-red"
      : remoteGameStatus?.winnerPerspective === "SELF" ? "text-gb-accent-green"
        : remoteGameStatus?.winnerPerspective === "NONE" ? "text-gb-accent-amber"
        : "text-gb-accent-red");

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="font-mono text-xs bg-gb-bg text-gb-text min-h-screen">

      {/* Match ended overlay */}
      {matchClosed && (
        <div className="fixed inset-0 z-100 bg-black/82 flex items-center justify-center p-6">
          <div className="max-w-[440px] w-full bg-gb-surface border border-gb-border-strong rounded-lg p-6 text-center">
            <p className="text-xs font-semibold text-gb-text-subtle tracking-widest mb-2">MATCH COMPLETE</p>
            <p className={cn("text-[28px] font-extrabold mb-3", endColorClass)}>{endTitle}</p>
            <p className="text-sm text-gb-text leading-relaxed mb-6">
              {gameOver?.reason ?? remoteGameStatus?.winReason ?? "The game has ended."}
            </p>
            <button
              type="button"
              onClick={handleBackToPlay}
              className="w-full py-3 px-4 rounded-md border-none bg-navy-800 text-gb-text-bright text-[15px] font-bold cursor-pointer hover:bg-navy-700"
            >
              Back to Play
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gb-border-subtle bg-gb-surface sticky top-0 z-20">
        <span className="font-bold text-gb-text-bright text-[13px]">OPTCG TEST</span>
        <span className="text-gb-text-dim">game:{gameId.slice(0, 10)}</span>
        <Tag color={statusColor}>{connectionStatus.toUpperCase()}</Tag>
        {myIndex !== null && <span className="text-gb-text-dim">you=P{myIndex + 1}</span>}
        {lastError && <span className="text-gb-accent-red text-xs">&9888; {lastError}</span>}
        {leaveError && <span className="text-gb-accent-red text-xs">&9888; {leaveError}</span>}
        <div className="flex-1" />
        {!matchClosed && (
          <button
            onClick={handleLeaveGame}
            className="px-2 py-1 bg-gb-surface-raised border border-gb-border-strong text-gb-text-subtle cursor-pointer rounded text-xs font-mono hover:border-gb-text-muted"
          >
            {leavingGame ? "Leaving\u2026" : "Leave Game"}
          </button>
        )}
        <button
          onClick={handleBackToPlay}
          className="px-2 py-1 bg-gb-surface-raised border border-gb-border-strong text-gb-text-subtle cursor-pointer rounded text-xs font-mono hover:border-gb-text-muted"
        >
          &larr; Lobbies
        </button>
      </div>

      {!matchClosed && opponentAway && (
        <div className={cn(
          "flex gap-3 items-center px-4 py-2 border-b border-gb-border-strong flex-wrap",
          gamePausedForOpponent ? "bg-gb-prompt-bg" : "bg-gb-surface",
        )}>
          <span className={cn(
            "font-bold text-sm",
            gamePausedForOpponent ? "text-gb-accent-amber" : "text-gb-accent-blue",
          )}>
            {gamePausedForOpponent ? "GAME PAUSED" : "OPPONENT AWAY"}
          </span>
          <span className="text-gb-text-dim">
            {opponentAwayText} {gamePausedForOpponent
              ? "The game will resume once they reconnect."
              : "You can keep making moves until their input is required."}
          </span>
          {opponentDeadlineRemaining !== null && (
            <span className="text-gb-accent-amber text-xs">
              Rejoin window: {formatCountdown(opponentDeadlineRemaining)}
            </span>
          )}
        </div>
      )}

      {!gameState ? (
        <div className="p-12 text-center text-gb-text-muted">
          <div>{connectionStatus === "connecting" ? "Connecting\u2026" : "Waiting for game state\u2026"}</div>
          {fallbackConcedeAvailable && (
            <div className="mt-4 flex flex-col gap-2.5 items-center">
              <div className="text-gb-text-subtle text-xs max-w-[420px]">
                Reconnect failed. You can still concede this match without restoring the websocket session.
              </div>
              {fallbackError && <div className="text-gb-accent-red text-xs">{fallbackError}</div>}
              <button
                onClick={handleFallbackConcede}
                disabled={fallbackSubmitting}
                className="px-2 py-1 bg-gb-surface-raised border border-gb-accent-red/30 text-gb-accent-red cursor-pointer rounded text-xs font-mono hover:border-gb-accent-red/50"
              >
                {fallbackSubmitting ? "Conceding\u2026" : "Concede Match"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_1fr_300px] gap-2.5 p-2.5 items-start">
          <PlayerZone
            label={`YOU \u2014 P${(myIndex ?? 0) + 1}`}
            player={me}
            isActive={isMyTurn}
            isMe
            cardDb={cardDb}
          />
          <PlayerZone
            label={`OPPONENT \u2014 P${(oppIndex ?? 1) + 1}`}
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
